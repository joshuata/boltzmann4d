// The history view's data (STAT-20, 22): at every current sample, each recorder's running
// sums per kind (current and cumulative) and each kind's particle count, for the most
// recent HISTORY_LENGTH samples. Keeping sums rather than averages lets the history of any
// set of kinds be composed later, and switching plots keeps every plot's history.
import type { Recorder, View } from './recorder';
import { WeightedValueTracker } from './weighted-value-tracker';

/** Samples kept (the roadmap allows the last 150 summaries rather than frames). */
export const HISTORY_LENGTH = 150;

interface Sample {
  time: number;
  /** [recorder][type][view: current, cumulative][weight, Σ, Σ²], flattened. */
  sums: Float64Array;
  counts: Float64Array;
}

export class History {
  private readonly samples: Sample[] = [];

  constructor(
    private readonly recorders: readonly Recorder[],
    private readonly typeCount: number,
  ) {}

  record(time: number, counts: ArrayLike<number>): void {
    const sums = new Float64Array(this.recorders.length * this.typeCount * 6);
    this.recorders.forEach((recorder, r) => {
      for (let t = 0; t < this.typeCount; t++) {
        const offset = (r * this.typeCount + t) * 6;
        recorder.currentByType[t]!.writeSums(sums, offset);
        recorder.cumulativeByType[t]!.writeSums(sums, offset + 3);
      }
    });
    this.samples.push({ time, sums, counts: Float64Array.from(counts) });
    if (this.samples.length > HISTORY_LENGTH) this.samples.shift();
  }

  times(): number[] {
    return this.samples.map((s) => s.time);
  }

  /** Per sample, the counts of every kind. */
  counts(): number[][] {
    return this.samples.map((s) => Array.from(s.counts));
  }

  /** Per sample, recorder `r`'s average over `types` in `view` (sqrt(⟨q²⟩) if `rms`). */
  averages(r: number, types: readonly number[], view: View, rms = false): number[] {
    const tracker = new WeightedValueTracker();
    const viewOffset = view === 'current' ? 0 : 3;
    return this.samples.map(({ sums }) => {
      tracker.clear();
      for (const t of types) tracker.addSums(sums, (r * this.typeCount + t) * 6 + viewOffset);
      return tracker.weight > 0 ? (rms ? tracker.rms() : tracker.average()) : NaN;
    });
  }
}
