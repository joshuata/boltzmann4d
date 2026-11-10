// The facts about a simulation that statistics and predictions need: the parts of Java's
// SimulationInfo used by model/statistics, plus StatUtils' count-weighted combinations.
import type { InitialState } from '../sim/simulation';
import type { ArenaType } from '../sim/simulation-info';
import { temperature, totalKineticEnergy } from './formulas';

export interface StatsType {
  /** Mass in amu. */
  mass: number;
  /** Radius in m. */
  radius: number;
  count: number;
  /** Initial temperature in K: from the settings file, else inferred from velocities. */
  initialTemperature: number;
}

export interface StatsContext {
  dimension: number;
  arenaType: ArenaType;
  /** Meters. */
  arenaXSize: number;
  arenaYSize: number;
  arenaZSize: number;
  /** In species order (Java's getParticleTypes order). */
  types: readonly StatsType[];
  totalParticles: number;
  /** amu. */
  totalMass: number;
  /** J. */
  totalInitialKE: number;
  /** amu. */
  minParticleMass: number;
}

/**
 * Builds the context from a simulation's starting state, as SimulationInfo's constructor
 * does: a type's initial temperature is the one requested by the settings file if valid,
 * else the temperature of its starting velocities, else 300 K.
 */
export function statsContext(init: InitialState): StatsContext {
  const dimension = init.dimension;
  let totalParticles = 0;
  let totalMass = 0;
  let totalInitialKE = 0;
  let minParticleMass = Number.MAX_VALUE;
  const types = init.species.map((species): StatsType => {
    const count = species.positions.length / 3;
    const mass = species.type.particleMass;
    const typeKE = totalKineticEnergy(mass, species.velocities);
    const supplied = species.initialTemperature ?? NaN;
    const inferred = count === 0 ? NaN : temperature(typeKE / count, dimension);
    let initialTemperature = Number.isFinite(supplied) && supplied >= 0 ? supplied : inferred;
    if (!Number.isFinite(initialTemperature) || initialTemperature < 0) initialTemperature = 300.0;
    totalParticles += count;
    totalMass += mass * count;
    totalInitialKE += typeKE;
    if (mass < minParticleMass) minParticleMass = mass;
    return { mass, radius: species.type.particleRadius, count, initialTemperature };
  });
  return {
    dimension,
    arenaType: init.arenaType,
    arenaXSize: init.arenaXSize,
    arenaYSize: init.arenaYSize,
    arenaZSize: init.arenaZSize,
    types,
    totalParticles,
    totalMass,
    totalInitialKE,
    minParticleMass,
  };
}

/** Average of a per-type value over a set of types, weighted by particle count (StatUtils). */
export function weightedAverage(
  ctx: StatsContext,
  types: readonly number[],
  valueForType: (type: number) => number,
): number {
  let sum = 0;
  let total = 0;
  for (const type of types) {
    const n = ctx.types[type]!.count;
    sum += valueForType(type) * n;
    total += n;
  }
  return total === 0 ? 0 : sum / total;
}

/**
 * Width of the mixture of per-type distributions (StatUtils.weightedWidth):
 * sqrt(Σ wₜ(widthₜ² + avgₜ²) − (Σ wₜ avgₜ)²) with wₜ = nₜ / N.
 */
export function weightedWidth(
  ctx: StatsContext,
  types: readonly number[],
  averageForType: (type: number) => number,
  widthForType: (type: number) => number,
): number {
  let total = 0;
  for (const type of types) total += ctx.types[type]!.count;
  if (total === 0) return 0;
  let secondMoment = 0;
  let mean = 0;
  for (const type of types) {
    const w = ctx.types[type]!.count / total;
    const avg = averageForType(type);
    const width = widthForType(type);
    secondMoment += w * (width * width + avg * avg);
    mean += w * avg;
  }
  return Math.sqrt(secondMoment - mean * mean);
}
