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
    return Math.sqrt(this.sumSquares / this.totalWeight - mean * mean);
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
