// Running weighted mean and width of a value (port of utils/WeightedValueTracker.java).

export class WeightedValueTracker {
  private sumSquares = 0;
  private sum = 0;
  private totalWeight = 0;

  add(value: number, weight: number): void {
    this.sumSquares += value * value * weight;
    this.sum += value * weight;
    this.totalWeight += weight;
  }

  /** Weighted mean, 0 with no data. */
  average(): number {
    return this.totalWeight === 0 ? 0 : this.sum / this.totalWeight;
  }

  /** Weighted standard deviation sqrt(⟨v²⟩ − ⟨v⟩²), 0 with no data. */
  width(): number {
    if (this.totalWeight === 0) return 0;
    const mean = this.sum / this.totalWeight;
    return Math.sqrt(Math.max(0, this.sumSquares / this.totalWeight - mean * mean));
  }

  /** sqrt(⟨v²⟩), 0 with no data (RMS Velocity's average). */
  rms(): number {
    return this.totalWeight === 0 ? 0 : Math.sqrt(this.sumSquares / this.totalWeight);
  }

  /** Writes weight, Σ w·v and Σ w·v² to `out` at `offset` (for the history). */
  writeSums(out: Float64Array, offset: number): void {
    out[offset] = this.totalWeight;
    out[offset + 1] = this.sum;
    out[offset + 2] = this.sumSquares;
  }

  /** Adds sums written by writeSums. */
  addSums(sums: Float64Array, offset: number): void {
    this.totalWeight += sums[offset]!;
    this.sum += sums[offset + 1]!;
    this.sumSquares += sums[offset + 2]!;
  }

  /** Adds everything `other` has recorded, as if its values had been added here. */
  addAll(other: WeightedValueTracker): void {
    this.sumSquares += other.sumSquares;
    this.sum += other.sum;
    this.totalWeight += other.totalWeight;
  }

  get weight(): number {
    return this.totalWeight;
  }

  clear(): void {
    this.sumSquares = 0;
    this.sum = 0;
    this.totalWeight = 0;
  }
}
