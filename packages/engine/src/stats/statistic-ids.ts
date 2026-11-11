// The plots the statistics area offers (STAT-1): ids (Java's StatisticID names, which
// `.set` files use), labels, units, and when each is available.
export const STATISTIC_IDS = [
  'INSTANTANEOUS_SPEED',
  'AVERAGE_SPEED',
  'RMS_VELOCITY',
  'AVERAGE_RMS_VELOCITY',
  'KINETIC_ENERGY',
  'AVERAGE_ENERGY',
  'PATH',
  'AVERAGE_PATH',
  'TIME',
  'COLLISION_RATE',
  'X_VELOCITY',
  'Y_VELOCITY',
  'Z_VELOCITY',
  'NUMBER_OF_PARTICLES',
] as const;

export type StatisticId = (typeof STATISTIC_IDS)[number];

/** The statistics with a distribution (everything but Number of Particles). */
export type DistributionId = Exclude<StatisticId, 'NUMBER_OF_PARTICLES'>;

/**
 * How a statistic's values are collected (STAT-16):
 * - `time`: cumulative values weighted by how long each was held; current = every particle now.
 * - `count`: one value per particle per particle–particle collision.
 * - `perParticle`: one running average per particle since restart (STAT-18).
 */
export type Weighting = 'time' | 'count' | 'perParticle';

export interface StatisticInfo {
  id: StatisticId;
  label: string;
  unit: string;
  weighting: Weighting | 'history';
  /** The average shown is sqrt(⟨q²⟩) rather than ⟨q⟩ (RMS Velocity). */
  rms?: boolean;
  /** Its prediction depends on Ideal / Real (STAT-14, PRED-9). */
  realGas?: boolean;
}

export const STATISTICS: Record<StatisticId, StatisticInfo> = {
  INSTANTANEOUS_SPEED: {
    id: 'INSTANTANEOUS_SPEED',
    label: 'Instantaneous speed',
    unit: 'm/s',
    weighting: 'time',
  },
  AVERAGE_SPEED: {
    id: 'AVERAGE_SPEED',
    label: 'Average speed',
    unit: 'm/s',
    weighting: 'perParticle',
    realGas: true,
  },
  RMS_VELOCITY: {
    id: 'RMS_VELOCITY',
    label: 'RMS velocity',
    unit: 'm/s',
    weighting: 'time',
    rms: true,
  },
  AVERAGE_RMS_VELOCITY: {
    id: 'AVERAGE_RMS_VELOCITY',
    label: 'Average RMS velocity',
    unit: 'm/s',
    weighting: 'perParticle',
    realGas: true,
  },
  KINETIC_ENERGY: {
    id: 'KINETIC_ENERGY',
    label: 'Kinetic energy',
    unit: 'kJ/mol',
    weighting: 'time',
  },
  AVERAGE_ENERGY: {
    id: 'AVERAGE_ENERGY',
    label: 'Average kinetic energy',
    unit: 'kJ/mol',
    weighting: 'perParticle',
    realGas: true,
  },
  PATH: { id: 'PATH', label: 'Free path', unit: 'nm', weighting: 'count', realGas: true },
  AVERAGE_PATH: {
    id: 'AVERAGE_PATH',
    label: 'Average path',
    unit: 'nm',
    weighting: 'perParticle',
    realGas: true,
  },
  TIME: { id: 'TIME', label: 'Time per collision', unit: 'ps', weighting: 'count', realGas: true },
  COLLISION_RATE: {
    id: 'COLLISION_RATE',
    label: 'Collision rate',
    unit: '1/ps',
    weighting: 'perParticle',
    realGas: true,
  },
  X_VELOCITY: { id: 'X_VELOCITY', label: 'X velocity', unit: 'm/s', weighting: 'time' },
  Y_VELOCITY: { id: 'Y_VELOCITY', label: 'Y velocity', unit: 'm/s', weighting: 'time' },
  Z_VELOCITY: { id: 'Z_VELOCITY', label: 'Z velocity', unit: 'm/s', weighting: 'time' },
  NUMBER_OF_PARTICLES: {
    id: 'NUMBER_OF_PARTICLES',
    label: 'Number of particles',
    unit: '',
    weighting: 'history',
  },
};

export function isStatisticId(name: string): name is StatisticId {
  return (STATISTIC_IDS as readonly string[]).includes(name);
}

/**
 * The plots offered for a simulation (STAT-1's table, without the RDF and the pressures,
 * which the UI adds from the pressure readout): Y velocity in 2D and 3D, Z in 3D, and
 * Number of Particles when kinds can react.
 */
export function availableStatistics(dimension: number, reactions: boolean): StatisticId[] {
  return STATISTIC_IDS.filter((id) => {
    if (id === 'Y_VELOCITY') return dimension >= 2;
    if (id === 'Z_VELOCITY') return dimension >= 3;
    if (id === 'NUMBER_OF_PARTICLES') return reactions;
    return true;
  });
}
