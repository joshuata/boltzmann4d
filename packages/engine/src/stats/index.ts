// Statistics and theoretical predictions, ported from boltzmann3d model/statistics (incl. Formulas.java).
export * as Formulas from './formulas';
export { HistogramBins, type Range } from './histogram-bins';
export { InstantaneousSpeed, velocityDistribution } from './instantaneous-speed';
export { Statistics, type StatisticsOptions } from './statistics';
export { statsContext, weightedAverage, weightedWidth, type StatsContext } from './stats-context';
export type { DistributionSummary, StatisticSummary, StatisticsSummary } from './summary';
export { WeightedValueTracker } from './weighted-value-tracker';
