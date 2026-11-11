// The statistics for one simulation (the statistics side of Physics.java): every plot of
// STAT-1 but the RDF and the pressures, fed by every event before it is performed and
// sampled at frame boundaries.
//
// - Time-weighted plots (speed, RMS velocity, velocity components, kinetic energy): each
//   particle's value since its previous particle–particle collision goes into the
//   cumulative data, weighted by that time (wall bounces not counted, as in Java; #18).
//   The current data is every particle in the sampled frame.
// - Free Path and Time per Collision: one value per particle per collision; the current
//   data is each particle's last completed interval.
// - Per-particle averages (average speed, RMS velocity, kinetic energy and path, and the
//   collision rate): running sums per particle since the start, including the interval in
//   progress when sampled, one value per particle. The forget doesn't clear them (as in
//   Java), and their cumulative view shows the same data (STAT-18).
// - Kinds are the colour each particle shows (reactions recolour particles), as in Java.
import type { EventInfo } from '../sim/event';
import { Collision } from '../sim/event';
import type { Particles } from '../sim/particles';
import {
  collisionLifetime,
  predictCollisionRateForTypes,
  statisticSubsets,
  temperature,
} from './formulas';
import type { Range } from './histogram-bins';
import { History } from './history';
import { atTemperatures, defaultRange, J_PER_KJ_MOL, predict } from './predictions';
import { Recorder, type View } from './recorder';
import {
  availableStatistics,
  STATISTICS,
  type DistributionId,
  type StatisticId,
} from './statistic-ids';
import type { StatsContext } from './stats-context';
import type {
  DistributionSummary,
  StatisticsSettings,
  StatisticsSummary,
  StatisticSummary,
} from './summary';

const PARTICLE = Collision.PARTICLE;
/** kg per amu. */
const AMU_KG = 1.660538782e-27;
const NM = 1e-9;
const PS = 1e-12;
/** Points in each prediction curve sent to the UI. */
export const CURVE_POINTS = 120;
/** Java's default forget time, in predicted collision times (OPT-4). */
export const DEFAULT_FORGET_MULTIPLIER = 4.0;

export interface StatisticsOptions {
  /**
   * Cumulative data collected before `forgetMultiplier` predicted collision lifetimes is
   * cleared once, so early, unequilibrated data doesn't dominate (STAT-17, OPT-4).
   */
  forgetMultiplier?: number;
  typeNames?: readonly string[];
  typeColors?: readonly number[];
  /** Per type, its marker (KIND-9); absent when markers are off. */
  typeMarkers?: readonly string[];
  /** Kinds can react, so Number of Particles is offered. */
  reactions?: boolean;
  /** Starting axis limits by statistic id (a scenario's abscissa limits, STAT-11). */
  limits?: ReadonlyMap<string, Range>;
  finite?: boolean;
  realGas?: boolean;
}

export interface SummaryRequest {
  /** The plot to summarise (default: Instantaneous Speed). */
  statistic?: StatisticId;
  /** More sets of kinds to summarise (KIND-4's picker), besides the tracked ones. */
  extraSubsets?: readonly (readonly number[])[];
}

/** The recorders, in this order (indices into the history). */
const DISTRIBUTIONS: readonly DistributionId[] = [
  'INSTANTANEOUS_SPEED',
  'RMS_VELOCITY',
  'X_VELOCITY',
  'Y_VELOCITY',
  'Z_VELOCITY',
  'KINETIC_ENERGY',
  'PATH',
  'TIME',
  'AVERAGE_SPEED',
  'AVERAGE_RMS_VELOCITY',
  'AVERAGE_ENERGY',
  'AVERAGE_PATH',
  'COLLISION_RATE',
];
// Recorder indices, in DISTRIBUTIONS order.
const SPEED = 0;
const RMS = 1;
const VX = 2;
const VY = 3;
const VZ = 4;
const ENERGY = 5;
const PATH = 6;
const TIME = 7;
const AVG_SPEED = 8;
const AVG_RMS = 9;
const AVG_ENERGY = 10;
const AVG_PATH = 11;
const RATE = 12;

export class Statistics {
  readonly ctx: StatsContext;
  /** The plots offered (STAT-1). */
  readonly available: readonly StatisticId[];
  /** Time each particle was last in a particle–particle collision (0 before the first). */
  readonly lastCollisionTime: Float64Array;
  /** Simulated time after which cumulative data is forgotten (once). */
  forgetTime = 0;
  forgotten = false;
  readonly recorders: readonly Recorder[];

  private settings: StatisticsSettings;
  /** Per particle since the start: Σ v·dt, Σ v²·dt (m/s·s, m²/s²·s), Σ KE·dt (kJ/mol·s), distance (m). */
  private readonly speedTime: Float64Array;
  private readonly squareTime: Float64Array;
  private readonly energyTime: Float64Array;
  private readonly distance: Float64Array;
  private readonly collisions: Float64Array;
  /** Each particle's last completed free path (nm) and time between collisions (ps). */
  private readonly lastPath: Float64Array;
  private readonly lastInterval: Float64Array;
  /**
   * Per type: Σ w·v² and Σ w over the same samples as the speed histograms (time-weighted
   * for cumulative, one per particle for current), for the measured temperatures.
   */
  private readonly cumulativeSquares: Float64Array;
  private readonly cumulativeWeight: Float64Array;
  private readonly currentSquares: Float64Array;
  private readonly currentWeight: Float64Array;
  private readonly history: History;

  private readonly particles: Particles;
  private readonly typeNames: readonly string[];
  private readonly typeColors: readonly number[];
  private readonly typeMarkers: readonly string[] | undefined;
  private readonly hasY: boolean;
  private readonly hasZ: boolean;

  constructor(ctx: StatsContext, particles: Particles, options: StatisticsOptions = {}) {
    this.ctx = ctx;
    this.particles = particles;
    const typeCount = ctx.types.length;
    const n = particles.count;
    this.typeNames =
      options.typeNames ?? ctx.types.map((_, t) => `Type ${String.fromCharCode(65 + t)}`);
    this.typeColors = options.typeColors ?? ctx.types.map(() => 0xffffff);
    this.typeMarkers = options.typeMarkers;
    this.available = availableStatistics(ctx.dimension, options.reactions ?? false);
    this.hasY = ctx.dimension >= 2;
    this.hasZ = ctx.dimension >= 3;
    this.settings = {
      finite: options.finite ?? false,
      realGas: options.realGas ?? false,
      forgetMultiplier: DEFAULT_FORGET_MULTIPLIER,
    };
    this.setForgetMultiplier(options.forgetMultiplier ?? DEFAULT_FORGET_MULTIPLIER);

    this.lastCollisionTime = new Float64Array(n);
    this.speedTime = new Float64Array(n);
    this.squareTime = new Float64Array(n);
    this.energyTime = new Float64Array(n);
    this.distance = new Float64Array(n);
    this.collisions = new Float64Array(n);
    this.lastPath = new Float64Array(n).fill(NaN);
    this.lastInterval = new Float64Array(n).fill(NaN);
    this.cumulativeSquares = new Float64Array(typeCount);
    this.cumulativeWeight = new Float64Array(typeCount);
    this.currentSquares = new Float64Array(typeCount);
    this.currentWeight = new Float64Array(typeCount);

    this.recorders = DISTRIBUTIONS.map(
      (id) => new Recorder(this.startingRange(id, options.limits?.get(id)), typeCount),
    );
    this.history = new History(this.recorders, typeCount);
  }

  get options(): Readonly<StatisticsSettings> {
    return this.settings;
  }

  /** Finite-system and real-gas predictions on or off (from the next summary). */
  setPredictionOptions({ finite, realGas }: { finite?: boolean; realGas?: boolean }): void {
    if (finite !== undefined) this.settings.finite = finite;
    if (realGas !== undefined) this.settings.realGas = realGas;
  }

  /**
   * The forget time as a multiple of the predicted (ideal) collision time (OPT-4). If the
   * data hasn't been forgotten yet, it will be at the new time.
   */
  setForgetMultiplier(multiplier: number): void {
    if (!(multiplier >= 0)) return;
    this.settings.forgetMultiplier = multiplier;
    const all = this.ctx.types.map((_, t) => t);
    this.forgetTime =
      multiplier * collisionLifetime(predictCollisionRateForTypes(this.ctx, all, false));
  }

  /** A statistic's measured data, per kind. */
  recorder(id: DistributionId): Recorder {
    return this.recorders[DISTRIBUTIONS.indexOf(id)]!;
  }

  /** A statistic's axis range (STAT-8). */
  range(id: DistributionId): Range {
    return this.recorder(id).range;
  }

  /**
   * Sets one of a plot's axis limits (STAT-8–10). A maximum typed below the minimum becomes
   * 110% of the minimum, and a minimum above the maximum 90% of the maximum (STAT-9; for
   * negative or zero limits, a tenth of the old span past the other). Rebinning clears
   * that plot's cumulative data only. Returns the range now in use.
   */
  setLimit(id: DistributionId, edge: 'min' | 'max', value: number): Range {
    const recorder = this.recorders[DISTRIBUTIONS.indexOf(id)]!;
    const old = recorder.range;
    if (!Number.isFinite(value)) return old;
    const step = (limit: number) =>
      Math.abs(limit) > 0 ? 0.1 * Math.abs(limit) : 0.1 * (old.max - old.min);
    let { min, max } = old;
    if (edge === 'max') {
      max = value;
      if (!(max > min)) max = min + step(min);
    } else {
      min = value;
      if (!(min < max)) min = max - step(max);
    }
    if (min === old.min && max === old.max) return old;
    recorder.setRange({ min, max });
    return recorder.range;
  }

  /** Every event, just before it is performed (Physics.updateStatistics). */
  notifyOfEvent(event: Readonly<EventInfo>): void {
    if (!this.forgotten && event.time > this.forgetTime) {
      this.forgotten = true;
      for (let r = SPEED; r <= TIME; r++) this.recorders[r]!.clearCumulative();
      this.cumulativeSquares.fill(0);
      this.cumulativeWeight.fill(0);
    }
    if (event.type !== PARTICLE) return;
    this.recordInterval(event.part1, event.time);
    this.recordInterval(event.part2, event.time);
  }

  /**
   * Takes the "current" sample from every particle at simulation time `time` (s), updates
   * the per-particle averages, and adds a history sample.
   */
  sampleCurrent(time: number): void {
    const p = this.particles;
    const rec = this.recorders;
    for (const r of rec) r.clearCurrent();
    for (let r = AVG_SPEED; r <= RATE; r++) rec[r]!.clearCumulative();
    this.currentSquares.fill(0);
    this.currentWeight.fill(0);
    const counts = new Float64Array(this.ctx.types.length);
    for (let i = 0; i < p.count; i++) {
      const type = p.color[i]!;
      const vx = p.vx[i]!;
      const vy = p.vy[i]!;
      const vz = p.vz[i]!;
      const squared = vx * vx + vy * vy + vz * vz;
      const speed = Math.sqrt(squared);
      const energy = (0.5 * p.mass[i]! * AMU_KG * squared) / J_PER_KJ_MOL;
      counts[type] = counts[type]! + 1;
      this.currentSquares[type] = this.currentSquares[type]! + squared;
      this.currentWeight[type] = this.currentWeight[type]! + 1;
      rec[SPEED]!.addCurrent(type, speed);
      rec[RMS]!.addCurrent(type, speed);
      rec[VX]!.addCurrent(type, vx);
      if (this.hasY) rec[VY]!.addCurrent(type, vy);
      if (this.hasZ) rec[VZ]!.addCurrent(type, vz);
      rec[ENERGY]!.addCurrent(type, energy);
      if (Number.isFinite(this.lastInterval[i]!)) {
        rec[PATH]!.addCurrent(type, this.lastPath[i]!);
        rec[TIME]!.addCurrent(type, this.lastInterval[i]!);
      }
      if (time > 0) {
        // Running averages, including the interval still in progress.
        const dt = time - this.lastCollisionTime[i]!;
        this.addPerParticle(AVG_SPEED, type, (this.speedTime[i]! + speed * dt) / time);
        this.addPerParticle(AVG_RMS, type, Math.sqrt((this.squareTime[i]! + squared * dt) / time));
        this.addPerParticle(AVG_ENERGY, type, (this.energyTime[i]! + energy * dt) / time);
        this.addPerParticle(RATE, type, this.collisions[i]! / (time / PS));
        if (this.collisions[i]! > 0) {
          this.addPerParticle(AVG_PATH, type, this.distance[i]! / this.collisions[i]! / NM);
        }
      }
    }
    this.history.record(time, counts);
  }

  /**
   * Each type's temperature (K) in the cumulative or current data, from its mean kinetic
   * energy there; a type without data yet keeps its initial temperature. Predictions use
   * these, so measured and predicted distributions describe the same gas (#23).
   */
  temperatures(view: View): Float64Array {
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
   * What the UI shows: the requested plot for every tracked set of kinds, plus
   * `extraSubsets`, all composed from the per-kind data so they have its whole history.
   */
  summary(time: number, request: SummaryRequest = {}): StatisticsSummary {
    const selected =
      request.statistic && this.available.includes(request.statistic)
        ? request.statistic
        : 'INSTANTANEOUS_SPEED';
    const statistics: StatisticSummary[] = [];
    if (selected !== 'NUMBER_OF_PARTICLES') {
      const temperatures = {
        current: this.temperatures('current'),
        cumulative: this.temperatures('cumulative'),
      };
      const seen = new Set<string>();
      const subsets = [...statisticSubsets(this.ctx.types.length), ...(request.extraSubsets ?? [])];
      for (const subset of subsets) {
        const types = [...new Set(subset)].filter((t) => t >= 0 && t < this.ctx.types.length);
        types.sort((a, b) => a - b);
        if (types.length === 0 || seen.has(types.join())) continue;
        seen.add(types.join());
        statistics.push(this.summarise(selected, types, time, temperatures));
      }
    }
    const speed = this.range('INSTANTANEOUS_SPEED');
    const energy = this.range('KINETIC_ENERGY');
    return {
      time,
      forgotten: this.forgotten,
      forgetTime: this.forgetTime,
      typeNames: [...this.typeNames],
      typeColors: [...this.typeColors],
      ...(this.typeMarkers && { typeMarkers: [...this.typeMarkers] }),
      available: this.available.map((id) => ({
        id,
        label: STATISTICS[id].label,
        unit: STATISTICS[id].unit,
      })),
      selected,
      statistics,
      historyTimes: this.history.times(),
      counts: this.history.counts(),
      colorLimits: { speed: [speed.min, speed.max], energy: [energy.min, energy.max] },
      settings: { ...this.settings },
    };
  }

  private summarise(
    id: DistributionId,
    types: number[],
    time: number,
    temperatures: Record<View, Float64Array>,
  ): StatisticSummary {
    const info = STATISTICS[id];
    const index = DISTRIBUTIONS.indexOf(id);
    const recorder = this.recorders[index]!;
    const { range } = recorder;
    const rms = info.rms ?? false;
    const weighting = info.weighting as StatisticSummary['weighting'];
    const view = (v: View): DistributionSummary => {
      // Per-particle averages are measured over the whole run: compare at its temperature.
      const t = weighting === 'perParticle' ? temperatures.cumulative : temperatures[v];
      const prediction = predict(id, atTemperatures(this.ctx, t), types, {
        finite: this.settings.finite,
        realGas: this.settings.realGas,
        time,
      });
      const span = range.max - range.min;
      const curve = Array.from({ length: CURVE_POINTS }, (_, i) => {
        const y = prediction.density((span * (i + 0.5)) / CURVE_POINTS + range.min);
        return Number.isFinite(y) ? y : 0;
      });
      const { bins, values } = recorder.compose(types, v);
      return {
        binsByType: bins,
        average: rms ? values.rms() : values.average(),
        width: values.width(),
        prediction: {
          average: prediction.average,
          width: prediction.width,
          curve,
          temperatures: types.map((type) => t[type]!),
        },
      };
    };
    return {
      id,
      label: info.label,
      unit: info.unit,
      weighting,
      realGas: info.realGas ?? false,
      types,
      range: [range.min, range.max],
      current: view('current'),
      cumulative: view('cumulative'),
      history: {
        current: this.history.averages(index, types, 'current', rms),
        cumulative: this.history.averages(index, types, 'cumulative', rms),
      },
    };
  }

  /** A statistic's starting range: the file's, else the union of every set's default. */
  private startingRange(id: DistributionId, given: Range | undefined): Range {
    if (
      given &&
      Number.isFinite(given.min) &&
      Number.isFinite(given.max) &&
      given.min < given.max
    ) {
      return { ...given };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const types of statisticSubsets(this.ctx.types.length)) {
      const prediction = predict(id, this.ctx, types, { finite: false, realGas: false, time: 0 });
      const r = defaultRange(id, prediction);
      if (Number.isFinite(r.min) && Number.isFinite(r.max) && r.min < r.max) {
        min = Math.min(min, r.min);
        max = Math.max(max, r.max);
      }
    }
    return min < max ? { min, max } : { min: 0, max: 1 };
  }

  private addPerParticle(recorder: number, type: number, value: number): void {
    this.recorders[recorder]!.addCurrent(type, value);
    this.recorders[recorder]!.addCumulative(type, value, 1.0);
  }

  /**
   * Particle i's state since its previous particle collision goes into the cumulative
   * statistics, weighted by that time (ParticleStateAnalyzer). Its velocity hasn't been
   * changed by this event yet.
   */
  private recordInterval(i: number, time: number): void {
    const p = this.particles;
    const rec = this.recorders;
    const elapsed = time - this.lastCollisionTime[i]!;
    const type = p.color[i]!; // the colour it showed over this interval
    const vx = p.vx[i]!;
    const vy = p.vy[i]!;
    const vz = p.vz[i]!;
    const squared = vx * vx + vy * vy + vz * vz;
    const speed = Math.sqrt(squared);
    const energy = (0.5 * p.mass[i]! * AMU_KG * squared) / J_PER_KJ_MOL;
    const path = speed * elapsed;

    rec[SPEED]!.addCumulative(type, speed, elapsed);
    rec[RMS]!.addCumulative(type, speed, elapsed);
    rec[VX]!.addCumulative(type, vx, elapsed);
    if (this.hasY) rec[VY]!.addCumulative(type, vy, elapsed);
    if (this.hasZ) rec[VZ]!.addCumulative(type, vz, elapsed);
    rec[ENERGY]!.addCumulative(type, energy, elapsed);
    rec[PATH]!.addCumulative(type, path / NM, 1.0);
    rec[TIME]!.addCumulative(type, elapsed / PS, 1.0);
    this.cumulativeSquares[type] = this.cumulativeSquares[type]! + squared * elapsed;
    this.cumulativeWeight[type] = this.cumulativeWeight[type]! + elapsed;

    this.speedTime[i] = this.speedTime[i]! + speed * elapsed;
    this.squareTime[i] = this.squareTime[i]! + squared * elapsed;
    this.energyTime[i] = this.energyTime[i]! + energy * elapsed;
    this.distance[i] = this.distance[i]! + path;
    this.collisions[i] = this.collisions[i]! + 1;
    this.lastPath[i] = path / NM;
    this.lastInterval[i] = elapsed / PS;
    this.lastCollisionTime[i] = time;
  }
}
