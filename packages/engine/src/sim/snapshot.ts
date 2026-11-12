// State snapshots and event batches: the simulation's state at a frame boundary, plus every
// event since the previous snapshot, for statistics computed outside the physics worker
// (joshuata/boltzmann4d#84). Motion is ballistic between events, so a snapshot and the
// post-event velocities of every event after it reconstruct every trajectory.
//
// Pure: no DOM, no timers. Reading a snapshot never changes the simulation.
import { Collision, type EventInfo } from './event';
import type { Dimension } from './index';
import type { Particles } from './particles';

/** Every event since the previous snapshot, as a struct of arrays (transferable buffers). */
export interface EventBatch {
  /** Events recorded (the arrays hold exactly this many). */
  count: number;
  /**
   * More events happened than the recorder's cap: the batch holds the first `count` and the
   * rest are lost, so it can't be replayed. Accumulating consumers should skip the window.
   */
  overflowed: boolean;
  /** Simulation time of each event, s. */
  time: Float64Array;
  /** `Collision.*`, or REVERSAL for Reverse (every velocity flipped, no particles). */
  type: Int8Array;
  /** Particles involved: part2 is −1 unless the event is between two particles. */
  part1: Int32Array;
  part2: Int32Array;
  /** Post-event velocities, m/s, 3 per event: v2 is NaN without a second particle. */
  v1: Float64Array;
  v2: Float64Array;
  /** Post-event display colours (reactions recolour particles): −1 without a particle. */
  c1: Int16Array;
  c2: Int16Array;
}

/** The simulation's state at a frame boundary: every particle at `time`. */
export interface StateSnapshot {
  /**
   * Changes whenever particle indices may change (a load, Restart, a particle added or
   * removed, a boundary switch): accumulating consumers start over when it does.
   */
  run: number;
  /** Simulation time, s. */
  time: number;
  dimension: Dimension;
  /** Particles. */
  count: number;
  /** m, 3 per particle (z is 0 in 2D). */
  positions: Float64Array;
  /** m/s, 3 per particle. */
  velocities: Float64Array;
  /** Per particle: its species (mass, radius). */
  types: Uint16Array;
  /** Per particle: the type whose colour it shows (reactions recolour particles). */
  colors: Uint16Array;
  /** Per particle, amu. */
  masses: Float64Array;
  /** Per particle, m. */
  radii: Float64Array;
  /** Every event since the previous snapshot, when events were asked for. */
  events?: EventBatch;
}

/** EventBatch.type of Reverse (SIM-32): every velocity flipped at `time`. */
export const REVERSAL = -2;

/** Events a recorder keeps between snapshots before it overflows. */
export const DEFAULT_EVENT_CAP = 200_000;

const PARTICLE = Collision.PARTICLE;
const isPair = (type: number) =>
  type === PARTICLE || type === Collision.ENTER_WELL || type === Collision.EXIT_WELL;

/** Fills a snapshot from the particles (all at `time`). */
export function snapshotOf(
  particles: Particles,
  run: number,
  time: number,
  dimension: Dimension,
): StateSnapshot {
  const p = particles;
  const n = p.count;
  const positions = new Float64Array(3 * n);
  const velocities = new Float64Array(3 * n);
  for (let k = 0; k < n; k++) {
    positions[3 * k] = p.x[k]!;
    positions[3 * k + 1] = p.y[k]!;
    positions[3 * k + 2] = p.z[k]!;
    velocities[3 * k] = p.vx[k]!;
    velocities[3 * k + 1] = p.vy[k]!;
    velocities[3 * k + 2] = p.vz[k]!;
  }
  return {
    run,
    time,
    dimension,
    count: n,
    positions,
    velocities,
    types: p.type.slice(),
    colors: p.color.slice(),
    masses: p.mass.slice(),
    radii: p.radius.slice(),
  };
}

/**
 * Records events between snapshots (chain `record` into Simulation's `afterEvent`). Grows
 * as needed up to `cap` events, then sets `overflowed` and drops the rest.
 */
export class EventRecorder {
  readonly cap: number;
  count = 0;
  overflowed = false;
  private capacity: number;
  private time: Float64Array;
  private type: Int8Array;
  private part1: Int32Array;
  private part2: Int32Array;
  private v1: Float64Array;
  private v2: Float64Array;
  private c1: Int16Array;
  private c2: Int16Array;

  constructor(cap = DEFAULT_EVENT_CAP, initialCapacity = 1024) {
    this.cap = Math.max(1, Math.floor(cap));
    this.capacity = Math.min(this.cap, Math.max(1, initialCapacity));
    this.time = new Float64Array(this.capacity);
    this.type = new Int8Array(this.capacity);
    this.part1 = new Int32Array(this.capacity);
    this.part2 = new Int32Array(this.capacity);
    this.v1 = new Float64Array(3 * this.capacity);
    this.v2 = new Float64Array(3 * this.capacity);
    this.c1 = new Int16Array(this.capacity);
    this.c2 = new Int16Array(this.capacity);
  }

  /** Whether the next event would overflow. */
  get full(): boolean {
    return this.count >= this.cap;
  }

  /** An event just performed, with its particles in their new state. */
  record(event: Readonly<EventInfo>, p: Particles): void {
    const k = this.slot();
    if (k < 0) return;
    const a = event.part1;
    const b = isPair(event.type) ? event.part2 : -1;
    this.time[k] = event.time;
    this.type[k] = event.type;
    this.part1[k] = a;
    this.part2[k] = b;
    this.v1[3 * k] = p.vx[a]!;
    this.v1[3 * k + 1] = p.vy[a]!;
    this.v1[3 * k + 2] = p.vz[a]!;
    this.c1[k] = p.color[a]!;
    if (b >= 0) {
      this.v2[3 * k] = p.vx[b]!;
      this.v2[3 * k + 1] = p.vy[b]!;
      this.v2[3 * k + 2] = p.vz[b]!;
      this.c2[k] = p.color[b]!;
    } else {
      this.v2.fill(NaN, 3 * k, 3 * k + 3);
      this.c2[k] = -1;
    }
  }

  /** Reverse (SIM-32): every velocity flipped at `time`, between events. */
  recordReversal(time: number): void {
    const k = this.slot();
    if (k < 0) return;
    this.time[k] = time;
    this.type[k] = REVERSAL;
    this.part1[k] = -1;
    this.part2[k] = -1;
    this.v1.fill(NaN, 3 * k, 3 * k + 3);
    this.v2.fill(NaN, 3 * k, 3 * k + 3);
    this.c1[k] = -1;
    this.c2[k] = -1;
  }

  /** The events so far, in fresh (transferable) arrays; the recorder starts empty again. */
  take(): EventBatch {
    const n = this.count;
    const batch: EventBatch = {
      count: n,
      overflowed: this.overflowed,
      time: this.time.slice(0, n),
      type: this.type.slice(0, n),
      part1: this.part1.slice(0, n),
      part2: this.part2.slice(0, n),
      v1: this.v1.slice(0, 3 * n),
      v2: this.v2.slice(0, 3 * n),
      c1: this.c1.slice(0, n),
      c2: this.c2.slice(0, n),
    };
    this.clear();
    return batch;
  }

  clear(): void {
    this.count = 0;
    this.overflowed = false;
  }

  /** The next free index, growing the arrays if needed; −1 once full. */
  private slot(): number {
    if (this.count >= this.cap) {
      this.overflowed = true;
      return -1;
    }
    if (this.count >= this.capacity) this.grow(Math.min(this.cap, this.capacity * 2));
    return this.count++;
  }

  private grow(capacity: number): void {
    const grow = <T extends Float64Array | Int32Array | Int16Array | Int8Array>(
      from: T,
      length: number,
    ): T => {
      const to = new (from.constructor as new (n: number) => T)(length);
      to.set(from);
      return to;
    };
    this.time = grow(this.time, capacity);
    this.type = grow(this.type, capacity);
    this.part1 = grow(this.part1, capacity);
    this.part2 = grow(this.part2, capacity);
    this.v1 = grow(this.v1, 3 * capacity);
    this.v2 = grow(this.v2, 3 * capacity);
    this.c1 = grow(this.c1, capacity);
    this.c2 = grow(this.c2, capacity);
    this.capacity = capacity;
  }
}

/** The arrays' buffers, to transfer a batch with postMessage. */
export function batchBuffers(batch: EventBatch): ArrayBuffer[] {
  return [
    batch.time,
    batch.type,
    batch.part1,
    batch.part2,
    batch.v1,
    batch.v2,
    batch.c1,
    batch.c2,
  ].map((a) => a.buffer as ArrayBuffer);
}

/** An empty batch. */
export function emptyBatch(): EventBatch {
  return new EventRecorder(1, 1).take();
}

/** One batch after another (e.g. snapshots a consumer coalesced), in order. */
export function mergeBatches(first: EventBatch, second: EventBatch): EventBatch {
  const join = <T extends Float64Array | Int32Array | Int16Array | Int8Array>(a: T, b: T): T => {
    const out = new (a.constructor as new (n: number) => T)(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  };
  return {
    count: first.count + second.count,
    overflowed: first.overflowed || second.overflowed,
    time: join(first.time, second.time),
    type: join(first.type, second.type),
    part1: join(first.part1, second.part1),
    part2: join(first.part2, second.part2),
    v1: join(first.v1, second.v1),
    v2: join(first.v2, second.v2),
    c1: join(first.c1, second.c1),
    c2: join(first.c2, second.c2),
  };
}

/** Each particle's speed, m/s. */
export function speedsOf(snapshot: StateSnapshot): Float64Array {
  const v = snapshot.velocities;
  const out = new Float64Array(snapshot.count);
  for (let k = 0; k < snapshot.count; k++) {
    out[k] = Math.hypot(v[3 * k]!, v[3 * k + 1]!, v[3 * k + 2]!);
  }
  return out;
}

const AMU_KG = 1.660538782e-27;
const AVOGADROS_NUM = 6.02214179e23;
/** amu·m²/s² per particle → kJ/mol. */
const KJ_MOL_PER_AMU_M2_S2 = (AMU_KG * AVOGADROS_NUM) / 1000;

/** Each particle's kinetic energy, kJ/mol (as the Kinetic Energy plot). */
export function kineticEnergiesOf(snapshot: StateSnapshot): Float64Array {
  const v = snapshot.velocities;
  const out = new Float64Array(snapshot.count);
  for (let k = 0; k < snapshot.count; k++) {
    const vx = v[3 * k]!;
    const vy = v[3 * k + 1]!;
    const vz = v[3 * k + 2]!;
    out[k] = 0.5 * snapshot.masses[k]! * (vx * vx + vy * vy + vz * vz) * KJ_MOL_PER_AMU_M2_S2;
  }
  return out;
}

/**
 * Replays a batch from a snapshot's state: every particle moved ballistically from event to
 * event, taking each event's post-event velocity, then on to `toTime`. Gives the next
 * snapshot's velocities exactly and its positions to rounding, except in periodic arenas,
 * where the simulation wraps positions and the replay doesn't.
 */
export function replay(
  from: StateSnapshot,
  batch: EventBatch,
  toTime: number,
): { positions: Float64Array; velocities: Float64Array; colors: Uint16Array } {
  const n = from.count;
  const x = from.positions.slice();
  const v = from.velocities.slice();
  const colors = from.colors.slice();
  const t0 = new Float64Array(n).fill(from.time);
  const move = (i: number, t: number) => {
    const dt = t - t0[i]!;
    x[3 * i] = x[3 * i]! + v[3 * i]! * dt;
    x[3 * i + 1] = x[3 * i + 1]! + v[3 * i + 1]! * dt;
    x[3 * i + 2] = x[3 * i + 2]! + v[3 * i + 2]! * dt;
    t0[i] = t;
  };
  const take = (i: number, from: Float64Array, c: number, k: number) => {
    v[3 * i] = from[3 * k]!;
    v[3 * i + 1] = from[3 * k + 1]!;
    v[3 * i + 2] = from[3 * k + 2]!;
    colors[i] = c;
  };
  for (let k = 0; k < batch.count; k++) {
    const t = batch.time[k]!;
    if (batch.type[k] === REVERSAL) {
      for (let i = 0; i < n; i++) {
        move(i, t);
        v[3 * i] = -v[3 * i]!;
        v[3 * i + 1] = -v[3 * i + 1]!;
        v[3 * i + 2] = -v[3 * i + 2]!;
      }
      continue;
    }
    const a = batch.part1[k]!;
    const b = batch.part2[k]!;
    move(a, t);
    take(a, batch.v1, batch.c1[k]!, k);
    if (b >= 0) {
      move(b, t);
      take(b, batch.v2, batch.c2[k]!, k);
    }
  }
  for (let i = 0; i < n; i++) move(i, toTime);
  return { positions: x, velocities: v, colors };
}

/**
 * Free paths between particle–particle collisions (STAT-1's Path Length), computed as the
 * built-in statistic does: each collision completes a path of the particle's speed just
 * before it times the time since its previous collision (or since the run's first
 * snapshot). Feed it every snapshot, with events, in order; it starts over when `run`
 * changes, and skips a window whose batch overflowed.
 */
export class FreePathAccumulator {
  /** Paths completed, their sum and sum of squares (m, m²). */
  count = 0;
  sum = 0;
  sumSquares = 0;
  /** Called with each completed path, m, and the colour the particle showed over it. */
  onPath: ((path: number, color: number, particle: number) => void) | null;
  private run = NaN;
  private velocities = new Float64Array(0);
  private colors = new Uint16Array(0);
  private lastCollision = new Float64Array(0);

  constructor(onPath?: (path: number, color: number, particle: number) => void) {
    this.onPath = onPath ?? null;
  }

  /** Mean free path, m (NaN before any). */
  get mean(): number {
    return this.count > 0 ? this.sum / this.count : NaN;
  }

  reset(): void {
    this.count = 0;
    this.sum = 0;
    this.sumSquares = 0;
    this.run = NaN;
  }

  add(snapshot: StateSnapshot): void {
    const batch = snapshot.events;
    if (snapshot.run !== this.run || !batch || batch.overflowed) {
      // A new run, or a window that can't be replayed: start the paths from here.
      if (snapshot.run !== this.run) this.reset();
      this.run = snapshot.run;
      this.velocities = snapshot.velocities.slice();
      this.colors = snapshot.colors.slice();
      this.lastCollision = new Float64Array(snapshot.count).fill(snapshot.time);
      return;
    }
    const v = this.velocities;
    const colors = this.colors;
    for (let k = 0; k < batch.count; k++) {
      const type = batch.type[k]!;
      if (type === REVERSAL) {
        for (let i = 0; i < v.length; i++) v[i] = -v[i]!;
        continue;
      }
      const t = batch.time[k]!;
      const a = batch.part1[k]!;
      const b = batch.part2[k]!;
      if (type === PARTICLE) {
        this.complete(a, t);
        this.complete(b, t);
      }
      v.set(batch.v1.subarray(3 * k, 3 * k + 3), 3 * a);
      colors[a] = batch.c1[k]!;
      if (b >= 0) {
        v.set(batch.v2.subarray(3 * k, 3 * k + 3), 3 * b);
        colors[b] = batch.c2[k]!;
      }
    }
    // Already equal after a full batch; keeps the two in step regardless.
    v.set(snapshot.velocities);
    colors.set(snapshot.colors);
  }

  private complete(i: number, t: number): void {
    const v = this.velocities;
    const vx = v[3 * i]!;
    const vy = v[3 * i + 1]!;
    const vz = v[3 * i + 2]!;
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const path = speed * (t - this.lastCollision[i]!);
    this.lastCollision[i] = t;
    this.count++;
    this.sum += path;
    this.sumSquares += path * path;
    this.onPath?.(path, this.colors[i]!, i);
  }
}
