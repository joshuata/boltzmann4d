// The statistics for one simulation (the statistics side of Physics.java): one instance
// per statistic per non-empty set of particle types, fed by every event before it is
// performed and sampled at frame boundaries.
//
// Instantaneous Speed is the only statistic so far (it is also the Java app's default).
import type { EventInfo } from '../sim/event';
import { Collision } from '../sim/event';
import type { Particles } from '../sim/particles';
import { allTypeSubsets, collisionLifetime, predictCollisionRateForTypes } from './formulas';
import { InstantaneousSpeed } from './instantaneous-speed';
import type { StatisticsSummary, StatisticSummary } from './summary';
import type { StatsContext } from './stats-context';

const PARTICLE = Collision.PARTICLE;
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

  private readonly particles: Particles;
  private readonly typeNames: readonly string[];
  private readonly typeColors: readonly number[];

  constructor(ctx: StatsContext, particles: Particles, options: StatisticsOptions = {}) {
    this.ctx = ctx;
    this.particles = particles;
    this.typeNames = options.typeNames ?? ctx.types.map((_, t) => `Type ${t + 1}`);
    this.typeColors = options.typeColors ?? ctx.types.map(() => 0xffffff);
    this.lastCollisionTime = new Float64Array(particles.count);
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
    }
    if (event.type !== PARTICLE) return;
    this.recordInterval(event.part1, event.time);
    this.recordInterval(event.part2, event.time);
  }

  /** Takes the "current" sample from every particle's present velocity. */
  sampleCurrent(): void {
    const p = this.particles;
    for (const s of this.speed) s.clearCurrent();
    for (let i = 0; i < p.count; i++) {
      // By the colour shown, as Java does (reactions recolour particles).
      const type = p.color[i]!;
      const speed = speedOf(p, i);
      for (const s of this.speed) if (s.slotOfType[type]! >= 0) s.addCurrent(type, speed);
    }
  }

  summary(time: number): StatisticsSummary {
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
      },
      cumulative: {
        binsByType: s.cumulative.byType.map((bins) => Array.from(bins)),
        average: s.cumulativeValues.average(),
        width: s.cumulativeValues.width(),
      },
      prediction: {
        average: s.predictedAverage(),
        width: s.predictedWidth(),
        curve: Array.from(s.predictionCurve(CURVE_POINTS)),
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
    const type = p.color[i]!; // the colour it showed over this interval
    const speed = speedOf(p, i);
    for (const s of this.speed) if (s.slotOfType[type]! >= 0) s.addCumulative(type, speed, elapsed);
    this.lastCollisionTime[i] = time;
  }
}

/** A particle's speed in m/s (vz is 0 in 1D and 2D). */
function speedOf(p: Particles, i: number): number {
  const vx = p.vx[i]!;
  const vy = p.vy[i]!;
  const vz = p.vz[i]!;
  return Math.sqrt(vx * vx + vy * vy + vz * vz);
}
