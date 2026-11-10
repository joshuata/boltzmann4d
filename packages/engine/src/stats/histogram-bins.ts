// Weighted histogram over a range, kept per particle type (port of plots/HistogramBins.java).
//
// Bin i covers [min + i·w, min + (i+1)·w) with w = (max − min)/n; a value goes in the first
// bin whose upper edge exceeds it. Values below min, at or above the last edge, or NaN
// are dropped, as in Java.

export interface Range {
  min: number;
  max: number;
}

export class HistogramBins {
  readonly range: Range;
  /** Upper edge of each bin: (i + 1)·w + min, computed as Java does. */
  readonly limits: Float64Array;
  /** Per type (index into the types this histogram records), then per bin. */
  readonly byType: Float64Array[];
  /** All types together, per bin. */
  readonly total: Float64Array;

  constructor(range: Range, binCount: number, typeCount: number) {
    this.range = range;
    const width = (range.max - range.min) / binCount;
    this.limits = Float64Array.from({ length: binCount }, (_, i) => (i + 1) * width + range.min);
    this.byType = Array.from({ length: typeCount }, () => new Float64Array(binCount));
    this.total = new Float64Array(binCount);
  }

  add(value: number, weight: number, typeIndex: number): void {
    if (!(value >= this.range.min)) return;
    const limits = this.limits;
    for (let i = 0; i < limits.length; i++) {
      if (value < limits[i]!) {
        this.byType[typeIndex]![i] = this.byType[typeIndex]![i]! + weight;
        this.total[i] = this.total[i]! + weight;
        return;
      }
    }
  }

  reset(): void {
    for (const bins of this.byType) bins.fill(0);
    this.total.fill(0);
  }
}
