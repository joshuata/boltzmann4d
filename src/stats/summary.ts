// What the physics worker sends the UI about the statistics, about once a second.
// Plain data (structured-clone friendly); the UI never sees per-particle values.

export interface DistributionSummary {
  /** Per recorded type (same order as `types`), then per bin. */
  binsByType: number[][];
  average: number;
  width: number;
  /**
   * Maxwell–Boltzmann prediction at the temperature each recorded type has in this
   * data (#23): its mean kinetic energy, so the comparison is about the distribution's
   * shape. `temperatures` is per recorded type, K.
   */
  prediction: { average: number; width: number; curve: number[]; temperatures: number[] };
}

export interface StatisticSummary {
  id: 'INSTANTANEOUS_SPEED';
  label: string;
  unit: string;
  /** Recorded particle types (indices into StatisticsSummary.typeNames). */
  types: number[];
  /** Axis range; the prediction curve spans it. */
  range: [number, number];
  /** Range the bins cover (shared by every type subset of this statistic). */
  binRange: [number, number];
  current: DistributionSummary;
  cumulative: DistributionSummary;
}

export interface StatisticsSummary {
  /** Simulation time (s) of the sample. */
  time: number;
  /** True once the early, unequilibrated cumulative data has been forgotten. */
  forgotten: boolean;
  typeNames: string[];
  /** 0xRRGGBB per type. */
  typeColors: number[];
  statistics: StatisticSummary[];
}
