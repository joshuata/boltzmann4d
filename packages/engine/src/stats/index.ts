// Statistics and theoretical predictions, ported from boltzmann3d model/statistics (incl. Formulas.java).
export * as Formulas from './formulas';
export { HistogramBins, type Range } from './histogram-bins';
export { History, HISTORY_LENGTH } from './history';
export {
  atTemperatures,
  defaultRange,
  predict,
  velocityDistribution,
  type Prediction,
  type PredictionOptions,
} from './predictions';
export { CUMULATIVE_BINS, CURRENT_BINS, Recorder, type View } from './recorder';
export {
  availableStatistics,
  isStatisticId,
  STATISTIC_IDS,
  STATISTICS,
  type DistributionId,
  type StatisticId,
  type StatisticInfo,
  type Weighting,
} from './statistic-ids';
export {
  CURVE_POINTS,
  DEFAULT_FORGET_MULTIPLIER,
  Statistics,
  type StatisticsOptions,
  type SummaryRequest,
} from './statistics';
export { statsContext, weightedAverage, weightedWidth, type StatsContext } from './stats-context';
export type {
  DistributionSummary,
  StatisticsSettings,
  StatisticSummary,
  StatisticsSummary,
} from './summary';
export { WeightedValueTracker } from './weighted-value-tracker';
export {
  DEFAULT_PRESSURE_AVERAGING_TIME,
  PressureMeter,
  type PressureMethod,
  type PressureReading,
  type PressureRegion,
  type PressureRegionReading,
} from './pressure';
