// Theoretical predictions for the statistics (port of model/statistics/Formulas.java).
//
// Units: SI throughout (kg, m, s, J, K) unless a name says otherwise; particle masses in a
// StatsContext are in amu and converted here, as in Java. Arithmetic follows Java's order.
//
// Deliberate differences from Java (plan 0004):
// - correctedRmsVelocity works for periodic arenas (Java throws).
// - avgRelativeVelocity uses the 1D formula in 1D (Java used the 2D one).
// - 1D collision rates use the free length L_net (PRED-3; Java used L − 2r).
// - Type subsets are enumerated in a fixed order (Java iterates a HashSet).
import { ArenaType, ARENA_DIVIDER_RADIUS } from '../sim/simulation-info';
import { convert, Energy } from '../utils/units';
import type { StatsContext } from './stats-context';

/** Boltzmann constant in J/K. */
export const BOLTZMANN_CONST = 1.3806504e-23;
/** Gas constant in kJ/(mol·K). */
export const GAS_CONSTANT = 0.008314472;

const amuToKg = (amu: number) => convert('amu', 'kg', amu);

/** Euclidean length of a vector. */
export function magnitude(...vector: number[]): number {
  let sum = 0.0;
  for (const component of vector) sum += component * component;
  return Math.sqrt(sum);
}

/** ½ m v², in J for a mass in kg and a speed in m/s. */
export function kineticEnergy(mass: number, speed: number): number {
  return 0.5 * mass * speed * speed;
}

/** Speed in m/s for a kinetic energy in J and a mass in kg. */
export function speed(kineticEnergy: number, mass: number): number {
  return Math.sqrt((2.0 * kineticEnergy) / mass);
}

/** Average kinetic energy in J for the given temperature (K) and degrees of freedom. */
export function avgKineticEnergy(temperature: number, dimension: number): number {
  return (dimension * BOLTZMANN_CONST * temperature) / 2.0;
}

/** Temperature in K for an average kinetic energy per particle (J). */
export function temperature(avgKineticEnergy: number, dimension: number): number {
  return (2.0 * avgKineticEnergy) / (dimension * BOLTZMANN_CONST);
}

/** Ideal-gas pressure N k T / V (in the arena's dimension). */
export function pressure(numParticles: number, temperature: number, volume: number): number {
  return (numParticles * BOLTZMANN_CONST * temperature) / volume;
}

/**
 * Total kinetic energy in J of particles of one mass (amu), from x, y, z velocity triples
 * in m/s (Load.calculateTotalKE).
 */
export function totalKineticEnergy(massAmu: number, velocities: Float64Array): number {
  let totalSpeedSquared = 0.0;
  for (let k = 0; k + 2 < velocities.length; k += 3) {
    const vx = velocities[k]!;
    const vy = velocities[k + 1]!;
    const vz = velocities[k + 2]!;
    totalSpeedSquared += vx * vx + vy * vy + vz * vz;
  }
  return convert(Energy.AMU_JOULE, Energy.JOULE, 0.5 * totalSpeedSquared * massAmu);
}

/** Average kinetic energy for one type in a finite periodic system (mass, totalMass in kg). */
export function correctedKE(
  mass: number,
  temperature: number,
  dimension: number,
  totalParticles: number,
  totalMass: number,
): number {
  return (
    ((dimension * BOLTZMANN_CONST * temperature) / 2.0) *
    ((totalMass - mass) / totalMass) *
    (totalParticles / (totalParticles - 1))
  );
}

/** Width (standard deviation) of the kinetic-energy distribution. */
export function keWidth(temperature: number, dimension: number): number {
  return BOLTZMANN_CONST * temperature * Math.sqrt(dimension / 2.0);
}

export function correctedKEWidth(
  temperature: number,
  dimension: number,
  totalParticles: number,
): number {
  const N = totalParticles;
  switch (dimension) {
    case 1:
      return BOLTZMANN_CONST * temperature * Math.sqrt((N + 1) / (2 * (N + 2)));
    case 2:
      return BOLTZMANN_CONST * temperature * Math.sqrt((N - 1) / (N + 1));
    default:
      return 1.5 * BOLTZMANN_CONST * temperature * Math.sqrt((2 * (N - 1)) / (3 * (N + 2)));
  }
}

/** Mean speed of a Maxwell–Boltzmann gas (mass in kg). */
export function averageVelocity(temperature: number, mass: number, dimension: number): number {
  switch (dimension) {
    case 1:
      return Math.sqrt((2.0 * BOLTZMANN_CONST * temperature) / (Math.PI * mass));
    case 2:
      return Math.sqrt((Math.PI * BOLTZMANN_CONST * temperature) / (2.0 * mass));
    case 3:
      return Math.sqrt((8.0 * BOLTZMANN_CONST * temperature) / (Math.PI * mass));
    default:
      return 0.0;
  }
}

/** Mean speed with finite-system corrections (masses in kg). */
export function correctedAverageVelocity(
  initialTemperature: number,
  mass: number,
  dimension: number,
  periodic: boolean,
  totalParticles: number,
  totalMass: number,
): number {
  let value = 0.0;
  const n = periodic ? totalParticles - 1 : totalParticles;
  switch (dimension) {
    case 1:
      value =
        Math.sqrt((n * BOLTZMANN_CONST * initialTemperature) / (Math.PI * mass)) *
        gammaFrac(n / 2.0, (n + 1.0) / 2.0);
      break;
    case 2:
      value =
        Math.sqrt((Math.PI * n * BOLTZMANN_CONST * initialTemperature) / (2.0 * mass)) *
        gammaFrac(n, n + 0.5);
      break;
    case 3:
      value =
        Math.sqrt((12.0 * n * BOLTZMANN_CONST * initialTemperature) / (Math.PI * mass)) *
        gammaFrac((3.0 * n) / 2.0, (3.0 * n + 1.0) / 2.0);
  }
  if (periodic) {
    value *= Math.sqrt(((totalMass - mass) / totalMass) * (totalParticles / (totalParticles - 1)));
  }
  return value;
}

/** Root-mean-square speed (mass in kg). */
export function rmsVelocity(temperature: number, mass: number, dimension: number): number {
  return Math.sqrt((dimension * BOLTZMANN_CONST * temperature) / mass);
}

/**
 * RMS speed with finite-system corrections. Non-periodic arenas need none. Java throws for
 * periodic ones; here the RMS speed follows from correctedKE: v_rms = sqrt(2⟨E⟩ / m).
 */
export function correctedRmsVelocity(
  temperature: number,
  mass: number,
  dimension: number,
  periodic: boolean,
  totalParticles: number,
  totalMass: number,
): number {
  if (!periodic) return rmsVelocity(temperature, mass, dimension);
  return Math.sqrt(
    (2.0 * correctedKE(mass, temperature, dimension, totalParticles, totalMass)) / mass,
  );
}

/** Width (standard deviation) of the speed distribution. */
export function velocityWidth(temperature: number, mass: number, dimension: number): number {
  const rms = rmsVelocity(temperature, mass, dimension);
  const avg = averageVelocity(temperature, mass, dimension);
  return Math.sqrt(rms * rms - avg * avg);
}

export function correctedVelocityWidth(
  temperature: number,
  mass: number,
  dimension: number,
  periodic: boolean,
  totalParticles: number,
  totalMass: number,
): number {
  const rms = correctedRmsVelocity(
    temperature,
    mass,
    dimension,
    periodic,
    totalParticles,
    totalMass,
  );
  const avg = correctedAverageVelocity(
    temperature,
    mass,
    dimension,
    periodic,
    totalParticles,
    totalMass,
  );
  return Math.sqrt(rms * rms - avg * avg);
}

/** Width of one velocity component (a Gaussian). */
export function velocityComponentWidth(temperature: number, mass: number): number {
  return Math.sqrt((BOLTZMANN_CONST * temperature) / mass);
}

/**
 * Mean relative speed of two particles (masses in kg). Java used the 2D formula for 1D;
 * here 1D uses the 1D mean speed with the reduced mass.
 */
export function avgRelativeVelocity(
  temperature: number,
  mass1: number,
  mass2: number,
  dimension: number,
): number {
  const reducedMass = (mass1 * mass2) / (mass1 + mass2);
  switch (dimension) {
    case 1:
      return Math.sqrt((2.0 * BOLTZMANN_CONST * temperature) / (Math.PI * reducedMass));
    case 3:
      return Math.sqrt((8.0 * BOLTZMANN_CONST * temperature) / (Math.PI * reducedMass));
    default:
      return Math.sqrt((Math.PI * BOLTZMANN_CONST * temperature) / (2.0 * reducedMass));
  }
}

/**
 * The length/area/volume available to a particle's centre: walls take a radius on each
 * side (not in periodic arenas), and a divided arena leaves each side half the box.
 */
export function effectiveVolume(ctx: StatsContext, radius: number): number {
  const loss = ctx.arenaType !== ArenaType.PERIODIC_BOUNDARIES ? 2.0 * radius : 0.0;
  const xSize =
    ctx.arenaType === ArenaType.DIVIDED_ARENA
      ? ctx.arenaXSize / 2 - ARENA_DIVIDER_RADIUS
      : ctx.arenaXSize;
  const length = xSize - loss;
  const height = ctx.arenaYSize - loss;
  const depth = ctx.arenaZSize - loss;
  switch (ctx.dimension) {
    case 1:
      return length;
    case 2:
      return length * height;
    default:
      return length * height * depth;
  }
}

/**
 * 1D: the length free of particles, L_net = L − Σ 2rᵢ (PRED-3, PRED-10). Hard rods on a
 * line behave as point particles on this length, with walls or periodic.
 */
export function netLength(ctx: StatsContext): number {
  let length =
    ctx.arenaType === ArenaType.DIVIDED_ARENA
      ? ctx.arenaXSize / 2 - ARENA_DIVIDER_RADIUS
      : ctx.arenaXSize;
  for (const t of ctx.types) length -= 2 * t.radius * t.count;
  return length;
}

/** Collision cross-section: 1 (1D), diameter sum (2D), π (r₁+r₂)² (3D). */
export function collisionSphere(radius1: number, radius2: number, dimension: number): number {
  const radiiSum = radius1 + radius2;
  switch (dimension) {
    case 1:
      return 1.0;
    case 2:
      return 2.0 * radiiSum;
    default:
      return Math.PI * radiiSum * radiiSum;
  }
}

/** Second virial coefficient of hard spheres (real-gas corrections). */
export function realGasB2(radius1: number, radius2: number, dimension: number): number {
  const sum = radius1 + radius2;
  switch (dimension) {
    case 1:
      return sum;
    case 2:
      return (Math.PI * sum * sum) / 2;
    default:
      return (2 / 3) * Math.PI * sum * sum * sum;
  }
}

/** Finite-box correction to B2 (none in 1D or periodic arenas). */
export function realGasB2Correction(ctx: StatsContext, radius1: number, radius2: number): number {
  if (ctx.dimension === 1 || ctx.arenaType === ArenaType.PERIODIC_BOUNDARIES) return 1;
  const sigma = radius1 + radius2;
  let lx = ctx.arenaXSize;
  const ly = ctx.arenaYSize;
  const lz = ctx.arenaZSize;
  if (ctx.arenaType === ArenaType.DIVIDED_ARENA) lx = lx / 2 - ARENA_DIVIDER_RADIUS;
  if (ctx.dimension === 2) {
    return (
      1 - (2 / Math.PI) * (sigma / lx + sigma / ly) + (6 / Math.PI) * ((sigma / lx) * (sigma / ly))
    );
  }
  return (
    1 -
    (sigma / 2) * (1 / lx + 1 / ly + 1 / lz) +
    ((11 * sigma * sigma) / (20 * Math.PI)) * (1 / (lx * ly) + 1 / (lx * lz) + 1 / (ly * lz)) +
    (15 * Math.pow(sigma, 3)) / (2 * Math.PI * lx * ly * lz)
  );
}

/** Packing variable x for the real-gas correction of one type. */
export function realGasX(ctx: StatsContext, type: number): number {
  const t = ctx.types[type]!;
  if (t.count === 0) return 0;
  const periodic = ctx.arenaType === ArenaType.PERIODIC_BOUNDARIES;
  let totalX = 0;
  ctx.types.forEach((other, index) => {
    const n = other.count - (index === type && !periodic ? 1 : 0);
    totalX +=
      (realGasB2(t.radius, other.radius, ctx.dimension) *
        realGasB2Correction(ctx, t.radius, other.radius) *
        n) /
      effectiveVolume(ctx, other.radius);
  });
  return totalX;
}

/** Padé approximant Q(x) for the real-gas collision-rate correction (2D and 3D only). */
export function realGasQx(x: number, dimension: number): number {
  let e1: number, e2: number, e3: number, f1: number, f2: number, f3: number;
  switch (dimension) {
    case 2:
      [e1, e2, e3, f1, f2, f3] = [
        -0.25233539, 0.02704323, 0.00077137, -1.03433982, 0.30366975, -0.01974721,
      ];
      break;
    case 3:
      [e1, e2, e3, f1, f2, f3] = [
        1.30542183, 0.11627913, 0.02452331, 0.68042183, -0.59593402, 0.09148337,
      ];
      break;
    default:
      throw new Error('Invalid dimension for real gas correction factor.');
  }
  return (1 + e1 * x + e2 * x * x + e3 * x * x * x) / (1 + f1 * x + f2 * x * x + f3 * x * x * x);
}

/**
 * Compressibility P V_eff / (N k T) of hard disks (2D) or spheres (3D) at packing x:
 * 1 + x Q(x) (Pressure.getPredictionForAverage, PRED-8).
 */
export function realGasPressureFactor(x: number, dimension: number): number {
  return 1 + x * realGasQx(x, dimension);
}

/** Predicted collisions per second of one particle of `type` with particles of `other`. */
export function predictPairCollisionRate(ctx: StatsContext, type: number, other: number): number {
  const t = ctx.types[type]!;
  const o = ctx.types[other]!;
  const partners = o.count - (type === other ? 1 : 0);
  const sphere = collisionSphere(t.radius, o.radius, ctx.dimension);
  // 1D (PRED-3): each particle has the free length L_net to move in; Java used L − 2r.
  const volume = ctx.dimension === 1 ? netLength(ctx) : effectiveVolume(ctx, o.radius);
  const m1 = amuToKg(t.mass);
  const m2 = amuToKg(o.mass);
  const reducedMass = (m1 * m2) / (m1 + m2);
  const relativeTemperature = reducedMass * (t.initialTemperature / m1 + o.initialTemperature / m2);
  const relativeSpeed = avgRelativeVelocity(relativeTemperature, m1, m2, ctx.dimension);
  return (partners * sphere * relativeSpeed) / volume;
}

/** Predicted collisions per second of one particle of `type`, with every type. */
export function predictCollisionRate(ctx: StatsContext, type: number, realGas = false): number {
  let rate = 0.0;
  for (let other = 0; other < ctx.types.length; other++) {
    rate += predictPairCollisionRate(ctx, type, other);
  }
  if (realGas && ctx.dimension > 1) rate *= realGasQx(realGasX(ctx, type), ctx.dimension);
  return rate;
}

/** Collision rate per particle averaged over a set of types, weighted by particle count. */
export function predictCollisionRateForTypes(
  ctx: StatsContext,
  types: readonly number[],
  realGas = false,
): number {
  let rate = 0.0;
  let total = 0;
  for (const type of types) {
    const n = ctx.types[type]!.count;
    rate += predictCollisionRate(ctx, type, realGas) * n;
    total += n;
  }
  return total === 0 ? 0.0 : rate / total;
}

/** Mean time between collisions. */
export function collisionLifetime(collisionRate: number): number {
  return 1.0 / collisionRate;
}

/** Γ(x)/Γ(y) via log-gamma, 0 if either is 0 or the result isn't finite. */
export function gammaFrac(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  const value = Math.exp(lnGamma(x) - lnGamma(y));
  return Number.isFinite(value) ? value : 0;
}

const lnGammaCache = new Map<number, number>();

/** ln Γ(x): Stirling's series above 25, else ln of the recursive gamma(). */
export function lnGamma(x: number): number {
  const cached = lnGammaCache.get(x);
  if (cached !== undefined) return cached;
  const value =
    x > 25
      ? (x - 0.5) * Math.log(x) -
        x +
        0.5 * Math.log(2 * Math.PI) +
        1 / (12 * x) -
        1 / (360 * Math.pow(x, 3)) +
        1 / (1260 * Math.pow(x, 5))
      : Math.log(gamma(x));
  lnGammaCache.set(x, value);
  return value;
}

/**
 * Γ(x) for positive integers and half-integers, by Γ(x) = (x−1)Γ(x−1) down to Γ(1), Γ(2)
 * or Γ(½) (Java's recursion, unrolled with the same multiplication order). Other x end
 * below zero, where Java returns +∞.
 */
export function gamma(x: number): number {
  let base = x;
  while (!(base <= 0 || base === 1 || base === 2 || base === 0.5)) base -= 1;
  let value = base <= 0 ? Infinity : base === 0.5 ? Math.sqrt(Math.PI) : 1;
  for (let y = base + 1; y <= x; y += 1) value = (y - 1) * value;
  return value;
}

/** Every non-empty subset of types 0..count−1, in a fixed order (by bitmask). */
export function allTypeSubsets(count: number): number[][] {
  const subsets: number[][] = [];
  for (let mask = 1; mask < 1 << count; mask++) {
    const subset: number[] = [];
    for (let t = 0; t < count; t++) if (mask & (1 << t)) subset.push(t);
    subsets.push(subset);
  }
  return subsets;
}

/** Above this many types, statistics track each type alone and all together (KIND-4). */
export const MAX_TYPES_FOR_ALL_SUBSETS = 3;

/**
 * The type subsets statistics are kept for: every one with up to three types (Java's
 * red, blue and both), else each type alone and all of them together, so the cost grows
 * linearly with the number of kinds rather than as 2^N.
 */
export function statisticSubsets(count: number): number[][] {
  if (count <= MAX_TYPES_FOR_ALL_SUBSETS) return allTypeSubsets(count);
  const all = Array.from({ length: count }, (_, t) => t);
  return [...all.map((t) => [t]), all];
}

/**
 * ln C(n, k), the log of the binomial coefficient, by summing logs (exact enough for the
 * few thousand particles a scene has, and free of lnGamma's Stirling error at small n).
 */
export function lnBinomial(n: number, k: number): number {
  const m = Math.min(k, n - k);
  let value = 0;
  for (let j = 1; j <= m; j++) value += Math.log((n - m + j) / j);
  return value;
}

/**
 * The predicted equilibrium of `2 X ⇌ 2 Y` at fixed total energy (PRED-12): the average
 * number of products Y and its width, from the microcanonical partition function
 * Σ C(N, N₂) · [E − N₂ ΔE / 2]^{dN/2 − 1} over the product counts N₂ the run can reach
 * (each reaction changes N₂ by two, so those with the starting count's parity), skipping
 * those with no kinetic energy left. `energy` is the total energy with the reactant as
 * zero (kinetic energy plus ΔE/2 per product present) and `deltaE` the energy one
 * forward reaction stores, E_f − E_r, in the same unit. The results needn't be integers.
 */
export function reactionEquilibrium(
  particles: number,
  dimension: number,
  energy: number,
  deltaE: number,
  oddProducts: boolean,
): { average: number; width: number } {
  const exponent = (dimension * particles) / 2 - 1;
  const logs: number[] = [];
  const counts: number[] = [];
  for (let n2 = oddProducts ? 1 : 0; n2 <= particles; n2 += 2) {
    const kinetic = energy - (n2 * deltaE) / 2;
    if (!(kinetic > 0)) continue;
    logs.push(lnBinomial(particles, n2) + exponent * Math.log(kinetic));
    counts.push(n2);
  }
  if (logs.length === 0) return { average: NaN, width: NaN };
  const top = Math.max(...logs);
  let z = 0;
  let sum = 0;
  let squares = 0;
  logs.forEach((log, k) => {
    const w = Math.exp(log - top);
    const n2 = counts[k]!;
    z += w;
    sum += w * n2;
    squares += w * n2 * n2;
  });
  const average = sum / z;
  return { average, width: Math.sqrt(Math.max(0, squares / z - average * average)) };
}
