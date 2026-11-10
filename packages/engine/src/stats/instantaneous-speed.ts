// Instantaneous Speed for one set of particle types (port of InstantaneousSpeed.java).
//
// - Cumulative: each particle's speed, weighted by how long it held that speed (time since
//   its previous particle–particle collision, wall bounces not counted, as in Java; #18).
// - Current: every particle's speed in one frame, weight 1.
// - Prediction: the Maxwell–Boltzmann speed distribution of each type at a given
//   temperature per type, mixed by particle count. Statistics passes the temperatures
//   measured from the data being compared (#23); Java used each type's initial one.
import { averageVelocity, BOLTZMANN_CONST, velocityWidth } from './formulas';
import { HistogramBins, type Range } from './histogram-bins';
import { weightedAverage, weightedWidth, type StatsContext } from './stats-context';
import { WeightedValueTracker } from './weighted-value-tracker';
import { convert } from '../utils/units';

export const CURRENT_BINS = 15;
export const CUMULATIVE_BINS = 30;

const amuToKg = (amu: number) => convert('amu', 'kg', amu);

/** Maxwell–Boltzmann speed density in 1D, 2D or 3D (InstantaneousSpeed.velocityDistribution). */
export function velocityDistribution(
  velocity: number,
  mass: number,
  temperature: number,
  dimension: number,
): number {
  let firstFactor = 0.0;
  const expFactor = -(mass * velocity * velocity) / (2.0 * BOLTZMANN_CONST * temperature);
  switch (dimension) {
    case 1:
      firstFactor = Math.sqrt(mass / (BOLTZMANN_CONST * temperature));
      break;
    case 2:
      firstFactor = (mass * velocity) / (BOLTZMANN_CONST * temperature);
      break;
    case 3: {
      const fourPi = 4.0 * Math.PI;
      const mrtFactor = mass / (2.0 * Math.PI * BOLTZMANN_CONST * temperature);
      firstFactor = fourPi * Math.pow(mrtFactor, 3.0 / 2.0) * velocity * velocity;
    }
  }
  return firstFactor * Math.exp(expFactor);
}

export class InstantaneousSpeed {
  /** Types recorded (indices into the context's types), ascending. */
  readonly types: readonly number[];
  /** Position of each context type in `types`, or -1 if not recorded. */
  readonly slotOfType: Int32Array;
  /** The statistic's own range: the chart's axis and the prediction curve's domain. */
  readonly range: Range;
  current: HistogramBins;
  cumulative: HistogramBins;
  readonly currentValues = new WeightedValueTracker();
  readonly cumulativeValues = new WeightedValueTracker();
  /** The same, per recorded type (same order as `types`), to combine any subset of them. */
  readonly currentByType: WeightedValueTracker[];
  readonly cumulativeByType: WeightedValueTracker[];

  private readonly ctx: StatsContext;

  constructor(ctx: StatsContext, types: readonly number[]) {
    this.ctx = ctx;
    this.types = types;
    this.slotOfType = new Int32Array(ctx.types.length).fill(-1);
    types.forEach((type, slot) => (this.slotOfType[type] = slot));
    this.currentByType = types.map(() => new WeightedValueTracker());
    this.cumulativeByType = types.map(() => new WeightedValueTracker());
    // The axis is fixed from the starting temperatures, as in Java.
    this.range = { min: 0.0, max: this.predictedAverage() * 2.5 };
    this.current = new HistogramBins(this.range, CURRENT_BINS, types.length);
    this.cumulative = new HistogramBins(this.range, CUMULATIVE_BINS, types.length);
  }

  /** Re-bins over a shared range (Physics.alignHistogramBinRangesAcrossGroups). */
  setBinRange(range: Range): void {
    this.current = new HistogramBins(range, CURRENT_BINS, this.types.length);
    this.cumulative = new HistogramBins(range, CUMULATIVE_BINS, this.types.length);
  }

  /** A particle of `type` held `speed` for `duration` seconds. */
  addCumulative(type: number, speed: number, duration: number): void {
    const slot = this.slotOfType[type]!;
    this.cumulativeValues.add(speed, duration);
    this.cumulativeByType[slot]!.add(speed, duration);
    this.cumulative.add(speed, duration, slot);
  }

  addCurrent(type: number, speed: number): void {
    const slot = this.slotOfType[type]!;
    this.currentValues.add(speed, 1.0);
    this.currentByType[slot]!.add(speed, 1.0);
    this.current.add(speed, 1.0, slot);
  }

  clearCurrent(): void {
    this.currentValues.clear();
    for (const t of this.currentByType) t.clear();
    this.current.reset();
  }

  clearCumulative(): void {
    this.cumulativeValues.clear();
    for (const t of this.cumulativeByType) t.clear();
    this.cumulative.reset();
  }

  /**
   * Mean speed predicted for these types (m/s), with `temperatures` (K) per context type
   * (by default each type's initial temperature).
   */
  predictedAverage(temperatures: ArrayLike<number> = this.initialTemperatures()): number {
    const { ctx } = this;
    return weightedAverage(ctx, this.types, (t) =>
      averageVelocity(temperatures[t]!, amuToKg(ctx.types[t]!.mass), ctx.dimension),
    );
  }

  /** Width of the predicted speed distribution (m/s); see predictedAverage. */
  predictedWidth(temperatures: ArrayLike<number> = this.initialTemperatures()): number {
    const { ctx } = this;
    const avg = (t: number) =>
      averageVelocity(temperatures[t]!, amuToKg(ctx.types[t]!.mass), ctx.dimension);
    const width = (t: number) =>
      velocityWidth(temperatures[t]!, amuToKg(ctx.types[t]!.mass), ctx.dimension);
    return weightedWidth(ctx, this.types, avg, width);
  }

  /**
   * The predicted density sampled at `points` bin centres across the statistic's range
   * (ProbabilityDensityFunctionPointCreater): x_i = span·(i + ½)/points + min.
   */
  predictionCurve(
    points: number,
    temperatures: ArrayLike<number> = this.initialTemperatures(),
  ): Float64Array {
    const { ctx, range } = this;
    const span = range.max - range.min;
    let total = 0;
    for (const t of this.types) total += ctx.types[t]!.count;
    const curve = new Float64Array(points);
    for (let i = 0; i < points; i++) {
      const x = (span * (i + 0.5)) / points + range.min;
      let y = 0;
      for (const t of this.types) {
        const type = ctx.types[t]!;
        y +=
          velocityDistribution(x, amuToKg(type.mass), temperatures[t]!, ctx.dimension) * type.count;
      }
      curve[i] = total === 0 ? 0 : y / total;
    }
    return curve;
  }

  private initialTemperatures(): number[] {
    return this.ctx.types.map((type) => type.initialTemperature);
  }
}
