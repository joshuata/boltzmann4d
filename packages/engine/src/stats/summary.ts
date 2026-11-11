// What the physics worker sends the UI about the statistics, about once a second.
// Plain data (structured-clone friendly); the UI never sees per-particle values.
import type { DistributionId, StatisticId, Weighting } from './statistic-ids';

export interface DistributionSummary {
  /** Per recorded type (same order as `types`), then per bin. */
  binsByType: number[][];
  /** Measured: the mean, or sqrt(⟨q²⟩) for RMS Velocity. */
  average: number;
  /** Measured RMS width sqrt(⟨q²⟩ − ⟨q⟩²) (STAT-13). */
  width: number;
  /**
   * The prediction at the temperature each recorded type has in this data (#23).
   * `curve` samples the density at CURVE_POINTS bin centres across `range`;
   * `temperatures` is per recorded type, K.
   */
  prediction: { average: number; width: number; curve: number[]; temperatures: number[] };
}

export interface StatisticSummary {
  id: DistributionId;
  label: string;
  unit: string;
  weighting: Weighting;
  /** Its prediction depends on Ideal / Real (STAT-14). */
  realGas: boolean;
  /** Recorded particle types (indices into StatisticsSummary.typeNames). */
  types: number[];
  /** Axis range (STAT-8): the bins and the prediction curve span it. */
  range: [number, number];
  current: DistributionSummary;
  cumulative: DistributionSummary;
  /** Measured average at each of StatisticsSummary.historyTimes (NaN with no data). */
  history: { current: number[]; cumulative: number[] };
}

export interface StatisticsSettings {
  /** Finite-system corrections (PRED-11). */
  finite: boolean;
  /** Real-gas predictions for paths, times and rates (PRED-9). */
  realGas: boolean;
  /** Forget time as a multiple of the predicted collision time (OPT-4). */
  forgetMultiplier: number;
}

export interface StatisticsSummary {
  /** Simulation time (s) of the sample. */
  time: number;
  /** True once the early, unequilibrated cumulative data has been forgotten. */
  forgotten: boolean;
  /** When that happens (or happened), s. */
  forgetTime: number;
  typeNames: string[];
  /** 0xRRGGBB per type. */
  typeColors: number[];
  /** Per type, its marker (KIND-9: `disk`, `ring`, …); absent when markers are off. */
  typeMarkers?: string[];
  /** The plots this simulation offers (STAT-1), in menu order. */
  available: { id: StatisticId; label: string; unit: string }[];
  /** The plot summarised in `statistics`. */
  selected: StatisticId;
  /** The selected plot for every tracked set of kinds (empty for Number of Particles). */
  statistics: StatisticSummary[];
  /** Simulation times (s) of the history samples (STAT-20), oldest first. */
  historyTimes: number[];
  /** Per history sample, each kind's particle count (Number of Particles). */
  counts: number[][];
  /**
   * The Instantaneous Speed (m/s) and Kinetic Energy (kJ/mol) plots' limits, which Color
   * by Speed / KE use (VIEW-4, STAT-7).
   */
  colorLimits: { speed: [number, number]; energy: [number, number] };
  settings: StatisticsSettings;
}
