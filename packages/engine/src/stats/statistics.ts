// The statistics for one simulation (the statistics side of Physics.java): one instance
// per statistic per set of particle types (statisticSubsets), fed by every event before it is
// performed and sampled at frame boundaries.
//
// Instantaneous Speed is the only statistic so far (it is also the Java app's default).
import type { EventInfo } from '../sim/event';
import { Collision } from '../sim/event';
import type { Particles } from '../sim/particles';
import {
  statisticSubsets,
  collisionLifetime,
  predictCollisionRateForTypes,
  temperature,
} from './formulas';
import { InstantaneousSpeed } from './instantaneous-speed';
import type { StatisticsSummary, StatisticSummary } from './summary';
import { WeightedValueTracker } from './weighted-value-tracker';
import type { StatsContext } from './stats-context';

const PARTICLE = Collision.PARTICLE;
/** kg per amu. */
const AMU_KG = 1.660538782e-27;
/** Points in each prediction curve sent to the UI. */
const CURVE_POINTS = 120;

export interface StatisticsOptions {
  /**
   * Cumulative data collected before `forgetMultiplier` predicted collision lifetimes is
   * cleared once, so early, unequilibrated data doesn't dominate (StatSettingsInfo.forgetTime).
   */
  forgetMultiplier?: number;
  typeNames?: readonly string[];
  typeColors?: readonly number[];
  /** Per type, its marker (KIND-9); absent when markers are off. */
  typeMarkers?: readonly string[];
}

export class Statistics {
  readonly ctx: StatsContext;
  readonly speed: readonly InstantaneousSpeed[];
  /** Time each particle was last in a particle–particle collision (0 before the first). */
  readonly lastCollisionTime: Float64Array;
  /** Simulated time after which cumulative data is forgotten (once). */
  readonly forgetTime: number;
  forgotten = false;

  /**
   * Per type: Σ w·v² and Σ w over the same samples as the histograms (time-weighted for
   * cumulative, one per particle for current), for the measured temperatures.
   */
  private readonly cumulativeSquares: Float64Array;
  private readonly cumulativeWeight: Float64Array;
  private readonly currentSquares: Float64Array;
  private readonly currentWeight: Float64Array;

  private readonly particles: Particles;
  private readonly typeNames: readonly string[];
  private readonly typeColors: readonly number[];
  private readonly typeMarkers: readonly string[] | undefined;
  /** Predictions for subsets composed on request, by subset key. */
  private readonly composed = new Map<string, InstantaneousSpeed>();

  constructor(ctx: StatsContext, particles: Particles, options: StatisticsOptions = {}) {
    this.ctx = ctx;
    this.particles = particles;
    this.typeNames = options.typeNames ?? ctx.types.map((_, t) => `Type ${t + 1}`);
    this.typeColors = options.typeColors ?? ctx.types.map(() => 0xffffff);
    this.typeMarkers = options.typeMarkers;
    this.lastCollisionTime = new Float64Array(particles.count);
    const typeCount = ctx.types.length;
    this.cumulativeSquares = new Float64Array(typeCount);
    this.cumulativeWeight = new Float64Array(typeCount);
    this.currentSquares = new Float64Array(typeCount);
    this.currentWeight = new Float64Array(typeCount);
    const allTypes = ctx.types.map((_, t) => t);
    this.forgetTime =
      (options.forgetMultiplier ?? 4.0) *
      collisionLifetime(predictCollisionRateForTypes(ctx, allTypes, false));

    this.speed = statisticSubsets(ctx.types.length).map(
      (types) => new InstantaneousSpeed(ctx, types),
    );
    // Bins of every subset cover the union of their ranges, so they can be compared.
    let min = Infinity;
    let max = -Infinity;
    for (const s of this.speed) {
      if (Number.isFinite(s.range.min) && Number.isFinite(s.range.max)) {
        min = Math.min(min, s.range.min);
        max = Math.max(max, s.range.max);
      }
    }
    if (min < max) for (const s of this.speed) s.setBinRange({ min, max });
  }

  /** Every event, just before it is performed (Physics.updateStatistics). */
  notifyOfEvent(event: Readonly<EventInfo>): void {
    if (!this.forgotten && event.time > this.forgetTime) {
      this.forgotten = true;
      for (const s of this.speed) s.clearCumulative();
      this.cumulativeSquares.fill(0);
      this.cumulativeWeight.fill(0);
    }
    if (event.type !== PARTICLE) return;
    this.recordInterval(event.part1, event.time);
    this.recordInterval(event.part2, event.time);
  }

  /** Takes the "current" sample from every particle's present velocity. */
  sampleCurrent(): void {
    const p = this.particles;
    for (const s of this.speed) s.clearCurrent();
    this.currentSquares.fill(0);
    this.currentWeight.fill(0);
    for (let i = 0; i < p.count; i++) {
      // By the colour shown, as Java does (reactions recolour particles).
      const type = p.color[i]!;
      const squared = squaredSpeedOf(p, i);
      const speed = Math.sqrt(squared);
      for (const s of this.speed) if (s.slotOfType[type]! >= 0) s.addCurrent(type, speed);
      this.currentSquares[type] = this.currentSquares[type]! + squared;
      this.currentWeight[type] = this.currentWeight[type]! + 1;
    }
  }

  /**
   * Each type's temperature (K) in the cumulative or current data, from its mean kinetic
   * energy there; a type without data yet keeps its initial temperature. Predictions use
   * these, so measured and predicted distributions describe the same gas (#23).
   */
  temperatures(view: 'cumulative' | 'current'): Float64Array {
    const squares = view === 'cumulative' ? this.cumulativeSquares : this.currentSquares;
    const weight = view === 'cumulative' ? this.cumulativeWeight : this.currentWeight;
    const { ctx } = this;
    return Float64Array.from(ctx.types, (type, t) => {
      if (!(weight[t]! > 0)) return type.initialTemperature;
      const meanKE = 0.5 * type.mass * AMU_KG * (squares[t]! / weight[t]!);
      return temperature(meanKE, ctx.dimension);
    });
  }

  /**
   * What the UI shows: every tracked subset of types, plus `extraSubsets` (KIND-4's picker:
   * any set of types), composed from the all-types data so they have its whole history.
   */
  summary(time: number, extraSubsets: readonly (readonly number[])[] = []): StatisticsSummary {
    const cumulativeT = this.temperatures('cumulative');
    const currentT = this.temperatures('current');
    const prediction = (s: InstantaneousSpeed, temperatures: Float64Array) => ({
      average: s.predictedAverage(temperatures),
      width: s.predictedWidth(temperatures),
      curve: Array.from(s.predictionCurve(CURVE_POINTS, temperatures)),
      temperatures: s.types.map((t) => temperatures[t]!),
    });
    const statistics: StatisticSummary[] = this.speed.map((s) => ({
      id: 'INSTANTANEOUS_SPEED',
      label: 'Instantaneous speed',
      unit: 'm/s',
      types: [...s.types],
      range: [s.range.min, s.range.max],
      binRange: [s.cumulative.range.min, s.cumulative.range.max],
      current: {
        binsByType: s.current.byType.map((bins) => Array.from(bins)),
        average: s.currentValues.average(),
        width: s.currentValues.width(),
        prediction: prediction(s, currentT),
      },
      cumulative: {
        binsByType: s.cumulative.byType.map((bins) => Array.from(bins)),
        average: s.cumulativeValues.average(),
        width: s.cumulativeValues.width(),
        prediction: prediction(s, cumulativeT),
      },
    }));
    const tracked = new Set(statistics.map((s) => s.types.join()));
    for (const subset of extraSubsets) {
      const types = [...new Set(subset)].filter((t) => t >= 0 && t < this.ctx.types.length);
      types.sort((a, b) => a - b);
      if (types.length === 0 || tracked.has(types.join())) continue;
      tracked.add(types.join());
      statistics.push(this.composeSubset(types, currentT, cumulativeT, prediction));
    }
    return {
      time,
      forgotten: this.forgotten,
      typeNames: [...this.typeNames],
      typeColors: [...this.typeColors],
      ...(this.typeMarkers && { typeMarkers: [...this.typeMarkers] }),
      statistics,
    };
  }

  /**
   * One subset's statistic from the all-types tracker: its types' rows of the histograms
   * and their running sums combined; predictions from a tracker for the subset itself.
   */
  private composeSubset(
    types: number[],
    currentT: Float64Array,
    cumulativeT: Float64Array,
    prediction: (
      s: InstantaneousSpeed,
      t: Float64Array,
    ) => StatisticSummary['current']['prediction'],
  ): StatisticSummary {
    const all = this.speed.at(-1)!; // every type, in order (statisticSubsets puts it last)
    let view = this.composed.get(types.join());
    if (!view) {
      view = new InstantaneousSpeed(this.ctx, types);
      this.composed.set(types.join(), view);
    }
    const combine = (trackers: WeightedValueTracker[]) => {
      const sum = new WeightedValueTracker();
      for (const t of types) sum.addAll(trackers[all.slotOfType[t]!]!);
      return sum;
    };
    const current = combine(all.currentByType);
    const cumulative = combine(all.cumulativeByType);
    return {
      id: 'INSTANTANEOUS_SPEED',
      label: 'Instantaneous speed',
      unit: 'm/s',
      types,
      range: [view.range.min, view.range.max],
      binRange: [all.cumulative.range.min, all.cumulative.range.max],
      current: {
        binsByType: types.map((t) => Array.from(all.current.byType[all.slotOfType[t]!]!)),
        average: current.average(),
        width: current.width(),
        prediction: prediction(view, currentT),
      },
      cumulative: {
        binsByType: types.map((t) => Array.from(all.cumulative.byType[all.slotOfType[t]!]!)),
        average: cumulative.average(),
        width: cumulative.width(),
        prediction: prediction(view, cumulativeT),
      },
    };
  }

  /**
   * Particle i's speed since its previous particle collision goes into the cumulative
   * statistics, weighted by that time (ParticleStateAnalyzer). Its velocity hasn't been
   * changed by this event yet.
   */
  private recordInterval(i: number, time: number): void {
    const p = this.particles;
    const elapsed = time - this.lastCollisionTime[i]!;
    const type = p.color[i]!; // the colour it showed over this interval
    const squared = squaredSpeedOf(p, i);
    const speed = Math.sqrt(squared);
    for (const s of this.speed) if (s.slotOfType[type]! >= 0) s.addCumulative(type, speed, elapsed);
    this.cumulativeSquares[type] = this.cumulativeSquares[type]! + squared * elapsed;
    this.cumulativeWeight[type] = this.cumulativeWeight[type]! + elapsed;
    this.lastCollisionTime[i] = time;
  }
}

/** A particle's squared speed in m²/s² (vz is 0 in 1D and 2D). */
function squaredSpeedOf(p: Particles, i: number): number {
  const vx = p.vx[i]!;
  const vy = p.vy[i]!;
  const vz = p.vz[i]!;
  return vx * vx + vy * vy + vz * vz;
}
