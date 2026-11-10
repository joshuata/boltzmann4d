// The statistics for one simulation (the statistics side of Physics.java): one instance
// per statistic per non-empty set of particle types, fed by every event before it is
// performed and sampled at frame boundaries.
//
// Instantaneous Speed is the only statistic so far (it is also the Java app's default).
import type { EventInfo } from '../sim/event';
import { Collision } from '../sim/event';
import type { Particles } from '../sim/particles';
import {
  allTypeSubsets,
  collisionLifetime,
  predictCollisionRateForTypes,
  temperature,
} from './formulas';
import { InstantaneousSpeed } from './instantaneous-speed';
import type { StatisticsSummary, StatisticSummary } from './summary';
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

  constructor(ctx: StatsContext, particles: Particles, options: StatisticsOptions = {}) {
    this.ctx = ctx;
    this.particles = particles;
    this.typeNames = options.typeNames ?? ctx.types.map((_, t) => `Type ${t + 1}`);
    this.typeColors = options.typeColors ?? ctx.types.map(() => 0xffffff);
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

    this.speed = allTypeSubsets(ctx.types.length).map(
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
      const type = p.type[i]!;
      const squared = p.vx[i]! * p.vx[i]! + p.vy[i]! * p.vy[i]!;
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

  summary(time: number): StatisticsSummary {
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
    return {
      time,
      forgotten: this.forgotten,
      typeNames: [...this.typeNames],
      typeColors: [...this.typeColors],
      statistics,
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
    const type = p.type[i]!;
    const squared = p.vx[i]! * p.vx[i]! + p.vy[i]! * p.vy[i]!;
    const speed = Math.sqrt(squared);
    for (const s of this.speed) if (s.slotOfType[type]! >= 0) s.addCumulative(type, speed, elapsed);
    this.cumulativeSquares[type] = this.cumulativeSquares[type]! + squared * elapsed;
    this.cumulativeWeight[type] = this.cumulativeWeight[type]! + elapsed;
    this.lastCollisionTime[i] = time;
  }
}
