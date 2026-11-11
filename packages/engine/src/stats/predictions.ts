// What kinetic theory predicts for each statistic (PRED-1–7, 9, 11): the average, the width
// and the density of its distribution, in the statistic's display units (m/s, kJ/mol, nm,
// ps, 1/ps), for any set of particle kinds.
//
// Ports the predictions spread over Java's statistic classes (InstantaneousSpeed,
// KineticEnergy, Path, CollisionRate, AverageSpeed, …). Differences from Java:
// - Each kind is predicted at the temperature passed in (Statistics passes the measured
//   ones, #23); Java used the initial temperatures.
// - Densities are normalised, so a mixture's curve weights its kinds correctly.
// - The finite-system densities take the total energy from those temperatures, and use
//   Γ ratios via log-gamma (Java's plain Γ ratio overflows to NaN above ~60 particles).
// - RMS Velocity with finite-system corrections works on periodic arenas (Java bug 2).
// - A set of kinds' Free Path and Time per Collision weight each kind by its collision
//   rate (paths are counted per collision), which is Java's λ = v̄ / rate; the per-particle
//   averages weight kinds by count (PRED-7).
import { ArenaType } from '../sim/simulation-info';
import {
  avgKineticEnergy,
  averageVelocity,
  BOLTZMANN_CONST,
  correctedAverageVelocity,
  correctedKE,
  correctedKEWidth,
  correctedRmsVelocity,
  correctedVelocityWidth,
  gammaFrac,
  keWidth,
  lnGamma,
  predictCollisionRate,
  rmsVelocity,
  velocityComponentWidth,
  velocityWidth,
} from './formulas';
import type { Range } from './histogram-bins';
import type { StatsContext } from './stats-context';
import type { DistributionId } from './statistic-ids';

const AMU_KG = 1.660538782e-27;
/** J per kJ/mol. */
export const J_PER_KJ_MOL = 1.0e3 / 6.02214179e23;
const NM = 1e-9;
const PS = 1e-12;

export interface PredictionOptions {
  /** Finite-system corrections (PRED-11). */
  finite: boolean;
  /** Real-gas corrections to collision rates, paths and times (PRED-9). */
  realGas: boolean;
  /** Simulated time since the start, s (the per-particle averages narrow with it). */
  time: number;
}

export interface Prediction {
  average: number;
  width: number;
  /** Probability density at x (display units); 0 where there is none. */
  density: (x: number) => number;
}

/** Maxwell–Boltzmann speed density in 1D, 2D or 3D (SI; mass in kg). */
export function velocityDistribution(
  velocity: number,
  mass: number,
  temperature: number,
  dimension: number,
): number {
  let firstFactor = 0.0;
  const expFactor = -(mass * velocity * velocity) / (2.0 * BOLTZMANN_CONST * temperature);
  switch (dimension) {
    case 1:
      firstFactor = Math.sqrt(mass / (BOLTZMANN_CONST * temperature)) / Math.sqrt(Math.PI / 2);
      break;
    case 2:
      firstFactor = (mass * velocity) / (BOLTZMANN_CONST * temperature);
      break;
    case 3: {
      const mrtFactor = mass / (2.0 * Math.PI * BOLTZMANN_CONST * temperature);
      firstFactor = 4.0 * Math.PI * Math.pow(mrtFactor, 3.0 / 2.0) * velocity * velocity;
    }
  }
  return firstFactor * Math.exp(expFactor);
}

/** Gaussian density of one velocity component (SI). */
export function componentDistribution(velocity: number, mass: number, temperature: number): number {
  const kT = BOLTZMANN_CONST * temperature;
  return Math.sqrt(mass / (2 * Math.PI * kT)) * Math.exp(-(mass * velocity * velocity) / (2 * kT));
}

/** Boltzmann density of one particle's kinetic energy E (J) with d degrees of freedom. */
export function kineticEnergyDistribution(energy: number, temperature: number, dimension: number) {
  if (energy < 0) return 0;
  const kT = BOLTZMANN_CONST * temperature;
  const half = dimension / 2;
  if (energy === 0) return half === 1 ? 1 / kT : 0;
  return Math.exp((half - 1) * Math.log(energy / kT) - energy / kT - lnGamma(half)) / kT;
}

/**
 * Speed density of one particle in a finite system at fixed total energy (Shirts, Burt and
 * Johnson 2006, eq. 12; InstantaneousSpeed.correctedVelDistribution). `n` is the number of
 * particles sharing the energy (N, or N − 1 with periodic boundaries); `maxSpeed` the
 * fastest any particle can go.
 */
export function finiteSpeedDistribution(
  v: number,
  mass: number,
  temperature: number,
  dimension: number,
  n: number,
  maxSpeed: number,
): number {
  if (v < 0 || v > maxSpeed) return 0;
  const kTn = BOLTZMANN_CONST * temperature * n;
  let value: number;
  switch (dimension) {
    case 1:
      value =
        gammaFrac(n / 2, (n - 1) / 2) *
        Math.sqrt((4 * mass) / (Math.PI * kTn)) *
        Math.pow(1 - (mass * v * v) / kTn, (n - 3) / 2);
      break;
    case 2:
      value = (((n - 1) * mass * v) / kTn) * Math.pow(1 - (mass * v * v) / (2 * kTn), n - 2);
      break;
    default:
      value =
        gammaFrac((3 * n) / 2, (3 * n - 3) / 2) *
        Math.pow(mass / (3 * kTn), 1.5) *
        ((4 * v * v) / Math.sqrt(Math.PI)) *
        Math.pow(1 - (mass * v * v) / (3 * kTn), (3 * n - 5) / 2);
  }
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** One velocity component's density at fixed total energy (XVelocity.correctedVelDistribution). */
export function finiteComponentDistribution(
  v: number,
  mass: number,
  temperature: number,
  dimension: number,
  n: number,
): number {
  const dkTn = dimension * BOLTZMANN_CONST * temperature * n;
  const base = 1 - (mass * v * v) / dkTn;
  if (base <= 0) return 0;
  const value =
    gammaFrac((dimension * n) / 2, (dimension * n - 1) / 2) *
    Math.sqrt(mass / (Math.PI * dkTn)) *
    Math.pow(base, (dimension * n - 3) / 2);
  return Number.isFinite(value) ? value : 0;
}

/**
 * One particle's kinetic-energy density at fixed total energy `total` (J) shared by `n`
 * particles (Shirts et al. eq. 9; KineticEnergy.correctedKEDistrib).
 */
export function finiteKineticEnergyDistribution(
  energy: number,
  total: number,
  dimension: number,
  n: number,
): number {
  if (energy <= 0 || energy >= total) return 0;
  const d = dimension;
  const ratio = energy / total;
  const log =
    -lnGamma(d / 2) +
    lnGamma((d * n) / 2) -
    lnGamma((d * (n - 1)) / 2) +
    (d / 2) * Math.log(ratio) -
    Math.log(energy) +
    ((d * (n - 1)) / 2 - 1) * Math.log(1 - ratio);
  const value = Math.exp(log);
  return Number.isFinite(value) ? value : 0;
}

const gaussian = (x: number, mean: number, width: number) =>
  width > 0 && Number.isFinite(width)
    ? Math.exp(-((x - mean) ** 2) / (2 * width * width)) / (width * Math.sqrt(2 * Math.PI))
    : 0;

const exponential = (x: number, mean: number) =>
  x >= 0 && mean > 0 && Number.isFinite(mean) ? Math.exp(-x / mean) / mean : 0;

/** One kind's prediction: average, width and density. */
interface Part {
  weight: number;
  average: number;
  width: number;
  density: (x: number) => number;
}

/** A mixture of kinds' distributions, weighted (StatUtils.weightedAverage/Width). */
function mix(all: Part[]): Prediction {
  // Kinds with no weight (no particles, or never colliding) have nothing to add.
  const parts = all.filter((p) => p.weight > 0);
  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  if (!(total > 0)) return { average: 0, width: 0, density: () => 0 };
  let mean = 0;
  let second = 0;
  for (const p of parts) {
    const w = p.weight / total;
    mean += w * p.average;
    second += w * (p.width * p.width + p.average * p.average);
  }
  return {
    average: mean,
    width: Math.sqrt(Math.max(0, second - mean * mean)),
    density: (x) => parts.reduce((sum, p) => sum + (p.weight / total) * p.density(x), 0),
  };
}

/** Everything about one kind that the predictions use (SI). */
class KindTheory {
  readonly mass: number;
  readonly temperature: number;
  readonly count: number;

  constructor(
    private readonly ctx: StatsContext,
    private readonly type: number,
    private readonly options: PredictionOptions,
    private readonly totalEnergy: number,
  ) {
    const t = ctx.types[type]!;
    this.mass = t.mass * AMU_KG;
    this.temperature = t.initialTemperature;
    this.count = t.count;
  }

  private get periodic() {
    return this.ctx.arenaType === ArenaType.PERIODIC_BOUNDARIES;
  }
  private get finite() {
    return this.options.finite;
  }
  /** Particles sharing the energy: one fewer with periodic boundaries (momentum is fixed). */
  private get sharing() {
    return this.periodic ? this.ctx.totalParticles - 1 : this.ctx.totalParticles;
  }
  private get totalMass() {
    return this.ctx.totalMass * AMU_KG;
  }

  get averageSpeed(): number {
    const { temperature: T, mass: m, ctx } = this;
    return this.finite
      ? correctedAverageVelocity(
          T,
          m,
          ctx.dimension,
          this.periodic,
          ctx.totalParticles,
          this.totalMass,
        )
      : averageVelocity(T, m, ctx.dimension);
  }

  get rmsSpeed(): number {
    const { temperature: T, mass: m, ctx } = this;
    return this.finite
      ? correctedRmsVelocity(T, m, ctx.dimension, this.periodic, ctx.totalParticles, this.totalMass)
      : rmsVelocity(T, m, ctx.dimension);
  }

  get speedWidth(): number {
    const { temperature: T, mass: m, ctx } = this;
    return this.finite
      ? correctedVelocityWidth(
          T,
          m,
          ctx.dimension,
          this.periodic,
          ctx.totalParticles,
          this.totalMass,
        )
      : velocityWidth(T, m, ctx.dimension);
  }

  speedDensity(v: number): number {
    const { temperature: T, mass: m, ctx } = this;
    if (!this.finite) return velocityDistribution(v, m, T, ctx.dimension);
    // The lightest particle holding all the energy (less the centre of mass's, periodic).
    const minMass = ctx.minParticleMass * AMU_KG;
    const available = this.periodic
      ? (this.totalEnergy * (this.totalMass - minMass)) / this.totalMass
      : this.totalEnergy;
    const maxSpeed = Math.sqrt((2 * available) / minMass);
    return finiteSpeedDistribution(v, m, T, ctx.dimension, this.sharing, maxSpeed);
  }

  get componentWidth(): number {
    if (this.finite && this.periodic) {
      // ⟨v_x²⟩ = 2⟨E⟩ / (d m) with the corrected mean energy.
      return Math.sqrt((2 * this.averageEnergy) / (this.ctx.dimension * this.mass));
    }
    return velocityComponentWidth(this.temperature, this.mass);
  }

  componentDensity(v: number): number {
    const { temperature: T, mass: m } = this;
    return this.finite
      ? finiteComponentDistribution(v, m, T, this.ctx.dimension, this.sharing)
      : componentDistribution(v, m, T);
  }

  /** J. */
  get averageEnergy(): number {
    const { temperature: T, ctx } = this;
    return this.finite && this.periodic
      ? correctedKE(this.mass, T, ctx.dimension, ctx.totalParticles, this.totalMass)
      : avgKineticEnergy(T, ctx.dimension);
  }

  /** J. */
  get energyWidth(): number {
    const { temperature: T, ctx } = this;
    return this.finite
      ? correctedKEWidth(T, ctx.dimension, ctx.totalParticles)
      : keWidth(T, ctx.dimension);
  }

  /** Density per J. */
  energyDensity(energy: number): number {
    return this.finite
      ? finiteKineticEnergyDistribution(energy, this.totalEnergy, this.ctx.dimension, this.sharing)
      : kineticEnergyDistribution(energy, this.temperature, this.ctx.dimension);
  }

  /** Collisions per second of one particle of this kind, with every kind. */
  get collisionRate(): number {
    return predictCollisionRate(this.ctx, this.type, this.options.realGas);
  }

  /** m. */
  get meanFreePath(): number {
    return this.averageSpeed / this.collisionRate;
  }

  /** How many collisions a particle has had so far (at least one, so widths stay finite). */
  get collisionsSoFar(): number {
    return Math.max(1, this.collisionRate * this.options.time);
  }
}

/**
 * The prediction for statistic `id` over `types`. `ctx`'s initial temperatures are the
 * temperatures to predict at (Statistics substitutes the measured ones).
 */
export function predict(
  id: DistributionId,
  ctx: StatsContext,
  types: readonly number[],
  options: PredictionOptions,
): Prediction {
  // Total kinetic energy at these temperatures (the finite-system densities' E).
  let totalEnergy = 0;
  for (const t of ctx.types)
    totalEnergy += t.count * avgKineticEnergy(t.initialTemperature, ctx.dimension);
  const kinds = types.map((t) => new KindTheory(ctx, t, options, totalEnergy));
  const byCount = (part: (k: KindTheory) => Omit<Part, 'weight'>) =>
    mix(kinds.map((k) => ({ weight: k.count, ...part(k) })));

  switch (id) {
    case 'INSTANTANEOUS_SPEED':
      return byCount((k) => ({
        average: k.averageSpeed,
        width: k.speedWidth,
        density: (v) => k.speedDensity(v),
      }));
    case 'RMS_VELOCITY': {
      // The same distribution; the average shown is sqrt(⟨v²⟩) (PRED-1).
      const speeds = predict('INSTANTANEOUS_SPEED', ctx, types, options);
      const total = kinds.reduce((sum, k) => sum + k.count, 0);
      const meanSquare =
        total > 0 ? kinds.reduce((sum, k) => sum + k.count * k.rmsSpeed ** 2, 0) / total : 0;
      return { ...speeds, average: Math.sqrt(meanSquare) };
    }
    case 'X_VELOCITY':
    case 'Y_VELOCITY':
    case 'Z_VELOCITY':
      return byCount((k) => ({
        average: 0,
        width: k.componentWidth,
        density: (v) => k.componentDensity(v),
      }));
    case 'KINETIC_ENERGY':
      return byCount((k) => ({
        average: k.averageEnergy / J_PER_KJ_MOL,
        width: k.energyWidth / J_PER_KJ_MOL,
        density: (e) => k.energyDensity(e * J_PER_KJ_MOL) * J_PER_KJ_MOL,
      }));
    case 'PATH':
      // Exponential (PRED-4); kinds weighted by how often they collide.
      return mix(
        kinds.map((k) => {
          const mean = k.meanFreePath / NM;
          return {
            weight: k.count * k.collisionRate,
            average: mean,
            width: mean,
            density: (x) => exponential(x, mean),
          };
        }),
      );
    case 'TIME':
      return mix(
        kinds.map((k) => {
          const mean = 1 / k.collisionRate / PS;
          return {
            weight: k.count * k.collisionRate,
            average: mean,
            width: mean,
            density: (x) => exponential(x, mean),
          };
        }),
      );
    case 'COLLISION_RATE':
      // Poisson counts: average 1/τ, width 1/sqrt(t τ) (PRED-5).
      return byCount((k) => {
        const rate = k.collisionRate * PS;
        const width = rate / Math.sqrt(k.collisionsSoFar);
        return { average: rate, width, density: (x) => gaussian(x, rate, width) };
      });
    case 'AVERAGE_SPEED':
      return perParticleAverage(kinds, (k) => k.averageSpeed, 0.76);
    case 'AVERAGE_RMS_VELOCITY':
      return perParticleAverage(kinds, (k) => k.rmsSpeed, 0.76);
    case 'AVERAGE_ENERGY':
      return perParticleAverage(kinds, (k) => k.averageEnergy / J_PER_KJ_MOL, 1.41);
    case 'AVERAGE_PATH':
      return perParticleAverage(kinds, (k) => k.meanFreePath / NM, 1.14);
  }
}

/**
 * A per-particle running average (AverageSpeed, AverageEnergy, AveragePath, …): Gaussian
 * about the kind's mean, narrowing as `factor` × mean / sqrt(collisions so far).
 */
function perParticleAverage(
  kinds: KindTheory[],
  mean: (k: KindTheory) => number,
  factor: number,
): Prediction {
  return mix(
    kinds.map((k) => {
      const average = mean(k);
      const width = (factor * average) / Math.sqrt(k.collisionsSoFar);
      return { weight: k.count, average, width, density: (x) => gaussian(x, average, width) };
    }),
  );
}

/**
 * A statistic's default axis range, from the prediction (Java's constructors): 0 to 2.5 ×
 * the average for speeds, energies, paths and times; ± 2.5 widths for velocity components;
 * 0.5 to 1.5 × the average for the per-particle averages and the collision rate.
 */
export function defaultRange(id: DistributionId, prediction: Prediction): Range {
  const { average, width } = prediction;
  switch (id) {
    case 'X_VELOCITY':
    case 'Y_VELOCITY':
    case 'Z_VELOCITY':
      return { min: -2.5 * width, max: 2.5 * width };
    case 'AVERAGE_SPEED':
    case 'AVERAGE_RMS_VELOCITY':
    case 'AVERAGE_ENERGY':
    case 'AVERAGE_PATH':
    case 'COLLISION_RATE':
      return { min: 0.5 * average, max: 1.5 * average };
    default:
      return { min: 0, max: 2.5 * average };
  }
}

/** `ctx` with each kind's temperature replaced (the predictions read initialTemperature). */
export function atTemperatures(ctx: StatsContext, temperatures: ArrayLike<number>): StatsContext {
  return {
    ...ctx,
    types: ctx.types.map((t, i) => ({ ...t, initialTemperature: temperatures[i]! })),
  };
}
