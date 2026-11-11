// One statistic's measured data, kept per particle kind: histograms of the current frame and
// of everything since the last clear, and their running sums. Any set of kinds (Red, Blue,
// Both, or KIND-4's picked kinds) is composed from these rows when it's summarised, so
// nothing is recorded twice. Every set shares the bin range.
import { HistogramBins, type Range } from './histogram-bins';
import { WeightedValueTracker } from './weighted-value-tracker';

/** Bars in the current and cumulative views (STAT-3). */
export const CURRENT_BINS = 15;
export const CUMULATIVE_BINS = 30;

export type View = 'current' | 'cumulative';

export class Recorder {
  range: Range;
  current: HistogramBins;
  cumulative: HistogramBins;
  readonly currentByType: WeightedValueTracker[];
  readonly cumulativeByType: WeightedValueTracker[];
  private readonly typeCount: number;

  constructor(range: Range, typeCount: number) {
    this.range = range;
    this.typeCount = typeCount;
    this.current = new HistogramBins(range, CURRENT_BINS, typeCount);
    this.cumulative = new HistogramBins(range, CUMULATIVE_BINS, typeCount);
    this.currentByType = Array.from({ length: typeCount }, () => new WeightedValueTracker());
    this.cumulativeByType = Array.from({ length: typeCount }, () => new WeightedValueTracker());
  }

  /** New axis limits: rebins, which clears the cumulative data (STAT-10). */
  setRange(range: Range): void {
    this.range = range;
    this.current = new HistogramBins(range, CURRENT_BINS, this.typeCount);
    this.cumulative = new HistogramBins(range, CUMULATIVE_BINS, this.typeCount);
    for (const t of this.currentByType) t.clear();
    for (const t of this.cumulativeByType) t.clear();
  }

  addCurrent(type: number, value: number, weight = 1.0): void {
    this.currentByType[type]!.add(value, weight);
    this.current.add(value, weight, type);
  }

  addCumulative(type: number, value: number, weight: number): void {
    this.cumulativeByType[type]!.add(value, weight);
    this.cumulative.add(value, weight, type);
  }

  clearCurrent(): void {
    for (const t of this.currentByType) t.clear();
    this.current.reset();
  }

  clearCumulative(): void {
    for (const t of this.cumulativeByType) t.clear();
    this.cumulative.reset();
  }

  /** The rows of `types` in one view, and their combined running sums. */
  compose(
    types: readonly number[],
    view: View,
  ): { bins: number[][]; values: WeightedValueTracker } {
    const bins = view === 'current' ? this.current : this.cumulative;
    const trackers = view === 'current' ? this.currentByType : this.cumulativeByType;
    const values = new WeightedValueTracker();
    for (const t of types) values.addAll(trackers[t]!);
    return { bins: types.map((t) => Array.from(bins.byType[t]!)), values };
  }
}
