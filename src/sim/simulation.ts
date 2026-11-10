// The event-driven simulation (the core of Physics.java): owns the particles, performs
// events in time order, and re-predicts what each event changed.
//
// Scope: 2D (plan 0002) and 3D (plan 0005) hard spheres in reflecting, periodic, divided
// and holed arenas.
//
// Scheduling (plan 0003) differs from Java's N² event table but performs the same events
// in the same order with the same arithmetic (checked against Java by parity.test.ts):
// - A cell grid limits predictions to particles in the same or neighbouring cells; cell
//   crossings are internal events that never touch a particle's state.
// - Each particle keeps only its soonest event, in an indexed heap whose ties follow
//   Java's calendar order (see event-heap.ts).
// - Each particle has a collision counter; an event whose partner has changed since it
//   was predicted is stale, and its particle is simply re-predicted.
import { CellGrid } from './cell-grid';
import { createCounters } from './counters';
import { Collision, MAX_TIME, createEvent, type EventInfo } from './event';
import { EventHeap, INTERNAL_ROW } from './event-heap';
import type { Dimension, RenderFrame } from './index';
import {
  boundaryCollide2D,
  collide2D,
  initPeriodicFlags2D,
  moveToTime2D,
  predictBoundary2D,
  predictPair2D,
} from './particle-2d';
import {
  boundaryCollide3D,
  collide3D,
  initPeriodicFlags3D,
  moveToTime3D,
  predictBoundary3D,
  predictPair3D,
} from './particle-3d';
import { createArena, Particles, type Arena } from './particles';
import { ArenaType, DividerThermalMode } from './simulation-info';

/** The per-dimension particle functions (particle-2d.ts, particle-3d.ts). */
const MOTION = {
  2: {
    predictPair: predictPair2D,
    predictBoundary: predictBoundary2D,
    collide: collide2D,
    boundaryCollide: boundaryCollide2D,
    moveToTime: moveToTime2D,
    initPeriodicFlags: initPeriodicFlags2D,
  },
  3: {
    predictPair: predictPair3D,
    predictBoundary: predictBoundary3D,
    collide: collide3D,
    boundaryCollide: boundaryCollide3D,
    moveToTime: moveToTime3D,
    initPeriodicFlags: initPeriodicFlags3D,
  },
} as const;
type Motion = (typeof MOTION)[2 | 3];

// Local copies for the hot paths (see plan 0002).
const NEVER = MAX_TIME;
const PARTICLE = Collision.PARTICLE;
const { BOUNDARY, EOB, WALL, BARRIER, EDGE } = Collision;
const PERIODIC = ArenaType.PERIODIC_BOUNDARIES;
/** Next-event type for a cell crossing (internal; never reported). */
const CROSSING = 255;

/** Simulation time per displayed frame, in seconds (Physics.DEFAULT_FRAME_DURATION). */
export const DEFAULT_FRAME_DURATION = 0.404706830433 * 1e-12;

/** amu·m²/s² → J (Units.Energy.AMU_JOULE), applied as Java's Units.convert does. */
const AMU_JOULE = 1.660538782e-27;

/** One kind of particle and where its particles start. Matches io's ParticleSpecies. */
export interface InitialSpecies {
  type: { particleMass: number; particleRadius: number };
  /** x, y, z per particle, meters. */
  positions: Float64Array;
  /** x, y, z per particle, m/s. */
  velocities: Float64Array;
  /** Initial temperature (K) the settings file asked for, or NaN/absent to infer it. */
  initialTemperature?: number;
}

/** Everything the simulation starts from. io's SimulationSettings satisfies this. */
export interface InitialState {
  dimension: Dimension;
  arenaType: ArenaType;
  /** Meters. */
  arenaXSize: number;
  arenaYSize: number;
  arenaZSize: number;
  /** Arenas with a hole: its diameter in meters. */
  holeDiameter?: number;
  /** Maxwell's demon: the hole starts closed; open it with setHoleOpen(). */
  maxwellDemonMode?: boolean;
  /**
   * 3D arenas with a hole: positions of the ring of edge spheres, replacing the computed
   * ones. Parity tests pass Java's, since Math.sin/cos may differ from Java's in the last bit.
   */
  holeEdges?: { y: ArrayLike<number>; z: ArrayLike<number> };
  /** Divided arenas: only INSULATING is supported so far. */
  dividerThermalMode?: DividerThermalMode;
  species: readonly InitialSpecies[];
}

export interface SimulationOptions {
  /** Simulation seconds per frame; defaults to DEFAULT_FRAME_DURATION. */
  frameDuration?: number;
  /** Called with each event just before it is performed (where statistics plug in). */
  onEvent?: (event: Readonly<EventInfo>) => void;
}

export class Simulation {
  readonly dimension: Dimension;
  readonly arena: Arena;
  readonly particles: Particles;
  readonly grid: CellGrid;
  private readonly is3D: boolean;
  // The per-dimension particle functions, as fields so calls stay monomorphic per run.
  private readonly predictPair: Motion['predictPair'];
  private readonly predictBoundary: Motion['predictBoundary'];
  private readonly collide: Motion['collide'];
  private readonly boundaryCollide: Motion['boundaryCollide'];
  private readonly moveToTime: Motion['moveToTime'];

  /**
   * Work done so far. `events` counts every physical event performed; the others break
   * it down, count predictions, and count scheduling work (cell crossings, stale events).
   */
  readonly counters = createCounters(
    'events',
    'particleCollisions',
    'wallCollisions',
    'boundaryCrossings',
    'dividerCollisions',
    'pairPredictions',
    'boundaryPredictions',
    'cellCrossings',
    'staleEvents',
  );

  /** Simulation time (s) every particle has been moved to by the last advanceToTime(). */
  time = 0;
  /** Maxwell's demon: whether the hole is open (it starts closed). */
  holeOpen = false;
  private nextFrameHoleOpen = false;
  /** When Maxwell's demon last opened or closed the hole (-1: never). */
  private boundaryRepredictTime = -1;
  frameDuration: number;

  private readonly onEvent: SimulationOptions['onEvent'];
  private readonly heap: EventHeap;

  // Each particle's next event (keys live in the heap).
  private readonly nextType: Uint8Array;
  private readonly nextPartner: Int32Array;
  private readonly nextSide: Uint8Array;
  /** The partner's collision count when the pair event was predicted. */
  private readonly nextPartnerCount: Uint32Array;
  /** Destination cell of a crossing event. */
  private readonly nextCell: Int32Array;
  /**
   * Periodic arenas: whole boxes to add to a particle's stored position to express it in
   * the frame of its current cell. Crossings that wrap around the box change it; it is
   * reset whenever the stored position is refreshed (events, frame moves).
   */
  private readonly wrapX: Int32Array;
  private readonly wrapY: Int32Array;
  private readonly wrapZ: Int32Array;
  /** Number of state-changing events each particle has had (for staleness). */
  private readonly collisionCount: Uint32Array;

  // Parity with Java (see predictionState): each particle's state right after its last
  // event, and the times at which a frame moved every particle.
  private readonly eventX: Float64Array;
  private readonly eventY: Float64Array;
  private readonly eventZ: Float64Array;
  private readonly eventT0: Float64Array;
  private frameTimes: number[] = [];
  /** Two-particle scratch store holding reconstructed states for predictions. */
  private readonly scratch = new Particles(2);

  private readonly event = createEvent();
  private readonly prediction = createEvent();
  private firstRun = true;
  private currentFrame: RenderFrame | null = null;

  constructor(init: InitialState, options: SimulationOptions = {}) {
    if (init.dimension !== 2 && init.dimension !== 3) {
      throw new Error(`${init.dimension}D simulation is not supported yet`);
    }
    if (init.arenaType === ArenaType.MOVABLE_PISTON) {
      throw new Error(`Arena type ${init.arenaType} is not supported yet`);
    }
    if (init.dividerThermalMode === DividerThermalMode.CONDUCTING) {
      throw new Error('Conducting dividers are not supported yet');
    }
    const dimension = init.dimension;
    this.dimension = dimension;
    this.is3D = dimension === 3;
    const motion = MOTION[dimension];
    this.predictPair = motion.predictPair;
    this.predictBoundary = motion.predictBoundary;
    this.collide = motion.collide;
    this.boundaryCollide = motion.boundaryCollide;
    this.moveToTime = motion.moveToTime;
    this.arena = createArena(
      init.arenaType,
      init.arenaXSize,
      init.arenaYSize,
      init.arenaZSize,
      init.holeDiameter,
      init.maxwellDemonMode,
      dimension,
    );
    if (init.holeEdges) {
      if (init.holeEdges.y.length !== this.arena.edgeY.length) {
        throw new Error('holeEdges must have one entry per edge sphere');
      }
      this.arena.edgeY.set(init.holeEdges.y);
      this.arena.edgeZ.set(init.holeEdges.z);
    }
    this.frameDuration = options.frameDuration ?? DEFAULT_FRAME_DURATION;
    this.onEvent = options.onEvent;

    // Particles in species order, as Physics does with SimulationInfo's particle types.
    const count = init.species.reduce((n, s) => n + s.positions.length / 3, 0);
    const p = new Particles(count);
    let i = 0;
    init.species.forEach((species, typeIndex) => {
      for (let k = 0; k < species.positions.length / 3; k++, i++) {
        p.x[i] = species.positions[3 * k]!;
        p.y[i] = species.positions[3 * k + 1]!;
        p.z[i] = species.positions[3 * k + 2]!;
        p.vx[i] = species.velocities[3 * k]!;
        p.vy[i] = species.velocities[3 * k + 1]!;
        p.vz[i] = species.velocities[3 * k + 2]!;
        p.radius[i] = species.type.particleRadius;
        p.mass[i] = species.type.particleMass;
        p.type[i] = typeIndex;
        motion.initPeriodicFlags(p, i, this.arena);
      }
    });
    this.particles = p;

    this.heap = new EventHeap(count);
    this.nextType = new Uint8Array(count);
    this.nextPartner = new Int32Array(count);
    this.nextSide = new Uint8Array(count);
    this.nextPartnerCount = new Uint32Array(count);
    this.nextCell = new Int32Array(count);
    this.wrapX = new Int32Array(count);
    this.wrapY = new Int32Array(count);
    this.wrapZ = new Int32Array(count);
    this.collisionCount = new Uint32Array(count);
    this.eventX = new Float64Array(count);
    this.eventY = new Float64Array(count);
    this.eventZ = new Float64Array(count);
    this.eventT0 = new Float64Array(count);

    // Cells must be at least the largest contact distance between two particles.
    let r1 = 0;
    let r2 = 0;
    for (let k = 0; k < count; k++) {
      const r = p.radius[k]!;
      if (r > r1) {
        r2 = r1;
        r1 = r;
      } else if (r > r2) {
        r2 = r;
      }
    }
    this.grid = new CellGrid(this.arena, count, r1 + r2, dimension);
    for (let k = 0; k < count; k++)
      this.grid.insert(k, this.grid.cellAt(p.x[k]!, p.y[k]!, p.z[k]!));

    // Java predicts everything, then (periodic) zeroes the momentum and predicts
    // everything again; only the second prediction matters, so adjust first.
    if (this.arena.type === PERIODIC) this.setTotalMomentum(0, 0, 0);
    for (let k = 0; k < count; k++) this.recordEventState(k);
    for (let k = 0; k < count; k++) this.repredict(k);
  }

  /** Time of the next event, or MAX_TIME if nothing will ever happen. */
  nextEventTime(): number {
    // Skip past internal and stale events so this is a real event time.
    for (;;) {
      const i = this.heap.peek();
      if (i < 0) return NEVER;
      if (this.isReal(i)) return this.heap.time[i]!;
      this.processInternal(i);
    }
  }

  /**
   * Performs the next event, if there is one, and returns it (valid until the next call).
   * Particles not involved keep their own t0; call advanceToTime() for a consistent state.
   */
  step(): Readonly<EventInfo> | null {
    if (this.nextEventTime() === NEVER) return null;
    return this.perform(this.heap.peek());
  }

  /**
   * Performs every event up to and including `maxTime`, then moves every particle to
   * `maxTime` (Physics.advanceToTime).
   */
  advanceToTime(maxTime: number): void {
    if (this.nextFrameHoleOpen !== this.holeOpen) {
      // Applied at the start of a frame, re-predicting every boundary event (Physics).
      this.holeOpen = this.nextFrameHoleOpen;
      this.boundaryRepredictTime = this.time;
      for (let k = 0; k < this.particles.count; k++) this.repredict(k);
    }
    const heap = this.heap;
    for (;;) {
      const i = heap.peek();
      if (i < 0 || heap.time[i]! > maxTime) break;
      if (this.isReal(i)) this.perform(i);
      else this.processInternal(i);
    }
    const p = this.particles;
    const moveToTime = this.moveToTime;
    for (let k = 0; k < p.count; k++) {
      moveToTime(p, k, maxTime);
      this.resetWrap(k);
    }
    this.frameTimes.push(maxTime);
    this.time = maxTime;
  }

  /**
   * Maxwell's demon: open or close the hole in the divider. Takes effect at the start of
   * the next frame, as in Java (Physics.setArenaHoleOpen).
   */
  setHoleOpen(open: boolean): void {
    this.nextFrameHoleOpen = open;
  }

  /** Frame API used by the worker's ThreadController (Physics.advanceToNextFrame). */
  advanceToNextFrame(): void {
    if (this.firstRun) {
      this.firstRun = false;
    } else {
      this.advanceToTime(this.time + this.frameDuration);
    }
    this.currentFrame = this.snapshot();
  }

  getCurrentFrame(): RenderFrame {
    if (!this.currentFrame) throw new Error('advanceToNextFrame() has not been called yet');
    return this.currentFrame;
  }

  stopProcessingCurrentFrame(): void {
    // Frames run synchronously inside the worker, so a pause can't arrive mid-frame.
  }

  /** Current positions (dimension-strided, meters) and types, in fresh transferable arrays. */
  snapshot(): RenderFrame {
    const p = this.particles;
    const d = this.dimension;
    const positions = new Float64Array(p.count * d);
    for (let k = 0; k < p.count; k++) {
      positions[d * k] = p.x[k]!;
      positions[d * k + 1] = p.y[k]!;
      if (d === 3) positions[d * k + 2] = p.z[k]!;
    }
    return { dimension: this.dimension, time: this.time, positions, types: p.type.slice() };
  }

  /** Total kinetic energy in joules (sum of Particle2D/3D.getKE). */
  kineticEnergy(): number {
    let total = 0;
    for (let k = 0; k < this.particles.count; k++) total += this.particleKE(k);
    return total;
  }

  /** True if particle i's next event is a physical event that is still valid. */
  private isReal(i: number): boolean {
    const type = this.nextType[i]!;
    if (type === CROSSING) return false;
    if (type !== PARTICLE) return true;
    return this.collisionCount[this.nextPartner[i]!] === this.nextPartnerCount[i];
  }

  /** Handles a cell crossing or a stale pair event at the top of the heap. */
  private processInternal(i: number): void {
    if (this.nextType[i] === CROSSING) {
      const grid = this.grid;
      const from = grid.cellOf[i]!;
      const to = this.nextCell[i]!;
      if (grid.periodic) {
        // Track wraps around the box, so the stored position stays readable in the new cell.
        const fromX = from % grid.nx;
        const toX = to % grid.nx;
        if (fromX === grid.nx - 1 && toX === 0 && grid.nx > 1) this.wrapX[i]!--;
        else if (fromX === 0 && toX === grid.nx - 1 && grid.nx > 1) this.wrapX[i]!++;
        const fromYZ = (from - fromX) / grid.nx;
        const toYZ = (to - toX) / grid.nx;
        const fromY = fromYZ % grid.ny;
        const toY = toYZ % grid.ny;
        if (fromY === grid.ny - 1 && toY === 0 && grid.ny > 1) this.wrapY[i]!--;
        else if (fromY === 0 && toY === grid.ny - 1 && grid.ny > 1) this.wrapY[i]!++;
        const fromZ = (fromYZ - fromY) / grid.ny;
        const toZ = (toYZ - toY) / grid.ny;
        if (fromZ === grid.nz - 1 && toZ === 0 && grid.nz > 1) this.wrapZ[i]!--;
        else if (fromZ === 0 && toZ === grid.nz - 1 && grid.nz > 1) this.wrapZ[i]!++;
      }
      grid.move(i, to);
      this.counters.cellCrossings++;
    } else {
      this.counters.staleEvents++;
    }
    this.repredict(i);
  }

  /** Performs particle i's (valid, physical) next event and re-predicts what it changed. */
  private perform(i: number): Readonly<EventInfo> {
    const p = this.particles;
    const event = this.event;
    const type = this.nextType[i]!;
    event.time = this.heap.time[i]!;
    event.side = this.nextSide[i]!;
    event.type = type as EventInfo['type'];
    if (type === PARTICLE) {
      const j = this.nextPartner[i]!;
      event.part1 = i < j ? i : j;
      event.part2 = i < j ? j : i;
    } else {
      event.part1 = i;
      event.part2 = 0;
    }
    this.onEvent?.(event);
    this.counters.events++;

    if (type === PARTICLE) {
      const a = event.part1;
      const b = event.part2;
      this.moveToTime(p, a, event.time);
      this.moveToTime(p, b, event.time);
      this.collide(p, a, b, event, this.arena);
      this.counters.particleCollisions++;
      this.collisionCount[a]!++;
      this.collisionCount[b]!++;
      this.recordEventState(a);
      this.recordEventState(b);
      this.repredict(a);
      this.repredict(b);
    } else {
      this.boundaryCollide(p, i, event, this.arena);
      if (type === WALL) this.counters.wallCollisions++;
      else if (type === BOUNDARY || type === EOB) this.counters.boundaryCrossings++;
      else if (type === BARRIER || type === EDGE) this.counters.dividerCollisions++;
      this.collisionCount[i]!++;
      this.recordEventState(i);
      this.repredict(i);
    }
    return event;
  }

  /**
   * Predicts particle i's next event: walls/boundaries, every particle in the neighbouring
   * cells, and its next cell crossing; keeps the soonest (in Java's tie order) and offers
   * each pair event to the partner too, in case it is sooner than the partner's own.
   */
  private repredict(i: number): void {
    const grid = this.grid;
    const heap = this.heap;
    const arena = this.arena;
    const out = this.prediction;
    const counters = this.counters;
    const predictPair = this.predictPair;

    // Start from the next cell crossing (internal, so it loses ties with real events).
    this.predictCrossing(i);
    let bestTime = out.time;
    let bestRow = INTERNAL_ROW;
    let bestCol = i;
    let bestType = CROSSING;
    let bestPartner = -1;
    let bestSide = 0;
    const crossingCell = out.part1;

    // Java predicts boundaries only at the particle's own events, from that state.
    const scratch = this.scratch;
    // Java predicts boundaries at the particle's own events, and for every particle when
    // Maxwell's demon opens or closes the hole (from positions after that frame's move).
    const boundaryAt = this.boundaryRepredictTime;
    const boundaryFromToggle = boundaryAt > this.eventT0[i]!;
    if (boundaryFromToggle) this.predictionState(i, boundaryAt, 0, true);
    else this.predictionState(i, this.eventT0[i]!, 0);
    this.predictBoundary(scratch, 0, arena, out, this.holeOpen);
    counters.boundaryPredictions++;
    if (out.time < bestTime || (out.time === bestTime && 0 < bestRow)) {
      bestTime = out.time;
      bestRow = 0;
      bestCol = i;
      bestType = out.type;
      bestSide = out.side;
    }

    const neighbours = grid.neighbours;
    const neighbourCount = grid.neighbourCount;
    const firstNeighbour = grid.cellOf[i]! * neighbourCount;
    const countI = this.collisionCount[i]!;
    const eventT0 = this.eventT0;
    const tI = eventT0[i]!;
    let loadedAt = boundaryFromToggle ? NaN : tI; // time slot 0 currently holds i's state for
    for (let m = 0; m < neighbourCount; m++) {
      const c = neighbours[firstNeighbour + m]!;
      if (c < 0) continue;
      for (let k = grid.head[c]!; k >= 0; k = grid.next[k]!) {
        if (k === i) continue;
        // Java predicted this pair at the later of the two particles' last events.
        const tK = eventT0[k]!;
        const te = tI > tK ? tI : tK;
        if (te !== loadedAt) {
          this.predictionState(i, te, 0);
          loadedAt = te;
        }
        this.predictionState(k, te, 1);
        predictPair(scratch, 0, 1, arena, out);
        counters.pairPredictions++;
        const t = out.time;
        if (t === NEVER) continue;
        const row = i > k ? i : k;
        const col = i < k ? i : k;
        if (
          t < bestTime ||
          (t === bestTime && (row < bestRow || (row === bestRow && col < bestCol)))
        ) {
          bestTime = t;
          bestRow = row;
          bestCol = col;
          bestType = PARTICLE;
          bestPartner = k;
          bestSide = out.side;
        }
        // Offer the event to k if it beats k's own next event.
        if (heap.keyBefore(t, row, col, k)) {
          this.nextType[k] = PARTICLE;
          this.nextPartner[k] = i;
          this.nextSide[k] = out.side;
          this.nextPartnerCount[k] = countI;
          heap.set(k, t, row, col);
        }
      }
    }

    this.nextType[i] = bestType;
    this.nextSide[i] = bestSide;
    this.nextPartner[i] = bestPartner;
    if (bestType === PARTICLE) this.nextPartnerCount[i] = this.collisionCount[bestPartner]!;
    if (bestType === CROSSING) this.nextCell[i] = crossingCell;
    heap.set(i, bestTime, bestRow, bestCol);
  }

  /** Remembers particle i's state right after an event (for predictionState). */
  private recordEventState(i: number): void {
    const p = this.particles;
    this.eventX[i] = p.x[i]!;
    this.eventY[i] = p.y[i]!;
    this.eventZ[i] = p.z[i]!;
    this.eventT0[i] = p.t0[i]!;
    this.resetWrap(i);
  }

  /**
   * Periodic arenas: after the stored position is refreshed it describes where the
   * particle is now, i.e. inside its cell up to round-off. The only ambiguity is at the
   * box edge (stored just above 0 but already in the last column, or the reverse).
   */
  private resetWrap(i: number): void {
    const grid = this.grid;
    if (!grid.periodic) return;
    const p = this.particles;
    const cell = grid.cellOf[i]!;
    const cx = cell % grid.nx;
    const cyz = (cell - cx) / grid.nx;
    const cy = cyz % grid.ny;
    const cz = (cyz - cy) / grid.ny;
    let x = p.x[i]!;
    let y = p.y[i]!;
    let z = p.z[i]!;
    if (x < 0) x += grid.xSize;
    if (y < 0) y += grid.ySize;
    if (z < 0) z += grid.zSize;
    this.wrapX[i] =
      grid.nx > 1 && cx === grid.nx - 1 && x < grid.cellWidth
        ? 1
        : grid.nx > 1 && cx === 0 && x > grid.xSize - grid.cellWidth
          ? -1
          : 0;
    this.wrapY[i] =
      grid.ny > 1 && cy === grid.ny - 1 && y < grid.cellHeight
        ? 1
        : grid.ny > 1 && cy === 0 && y > grid.ySize - grid.cellHeight
          ? -1
          : 0;
    this.wrapZ[i] =
      grid.nz > 1 && cz === grid.nz - 1 && z < grid.cellDepth
        ? 1
        : grid.nz > 1 && cz === 0 && z > grid.zSize - grid.cellDepth
          ? -1
          : 0;
  }

  /**
   * Loads into scratch `slot` particle k's state as Java's calendar would have seen it when
   * it predicted at time `te`: the state after k's last event, moved by every frame
   * boundary between that event and `te` (Java moves every particle at each frame end, and
   * an event at exactly a frame's end comes before that frame's move).
   *
   * Java predicts each pair once, at the later of the two particles' events, and keeps
   * that prediction even as frame moves round positions afterwards. This engine predicts
   * pairs lazily (at crossings, stale events, a partner's event), so it rebuilds the state
   * Java used; the arithmetic, and so every bit of the result, then matches.
   */
  private predictionState(k: number, te: number, slot: number, includeFrameAtTe = false): void {
    const p = this.particles;
    const s = this.scratch;
    let x = this.eventX[k]!;
    let y = this.eventY[k]!;
    let z = this.eventZ[k]!;
    let t = this.eventT0[k]!;
    const vx = p.vx[k]!;
    const vy = p.vy[k]!;
    const vz = p.vz[k]!;
    if (t < te) {
      const frames = this.frameTimes;
      // First frame after t (binary search; frames are increasing).
      let lo = 0;
      let hi = frames.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (frames[mid]! > t) hi = mid;
        else lo = mid + 1;
      }
      for (let f = lo; f < frames.length; f++) {
        const frame = frames[f]!;
        if (frame > te || (frame === te && !includeFrameAtTe)) break;
        const dt = frame - t;
        x = x + vx * dt;
        y = y + vy * dt;
        z = z + vz * dt;
        t = frame;
      }
    }
    s.x[slot] = x;
    s.y[slot] = y;
    s.z[slot] = z;
    s.t0[slot] = t;
    s.vx[slot] = vx;
    s.vy[slot] = vy;
    s.vz[slot] = vz;
    s.radius[slot] = p.radius[k]!;
    s.bFlag[slot] = p.bFlag[k]!;
  }

  /**
   * When particle i's straight-line path leaves its cell: time into `prediction.time` and
   * destination cell into `prediction.part1`. Uses the particle's own (x, t0) without
   * changing it. Reflecting arenas have no crossing at the outer edge (walls come first).
   */
  private predictCrossing(i: number): void {
    const p = this.particles;
    const grid = this.grid;
    const out = this.prediction;
    out.time = NEVER;
    out.part1 = -1;
    if (grid.nx === 1 && grid.ny === 1 && grid.nz === 1) return;

    const cell = grid.cellOf[i]!;
    const cx = cell % grid.nx;
    const cyz = (cell - cx) / grid.nx;
    const cy = cyz % grid.ny;
    const cz = (cyz - cy) / grid.ny;
    let x = p.x[i]!;
    let y = p.y[i]!;
    let z = p.z[i]!;
    if (grid.periodic) {
      // The stored position, in the frame of the particle's current cell (see wrapX).
      if (x < 0) x += grid.xSize;
      if (y < 0) y += grid.ySize;
      if (z < 0) z += grid.zSize;
      x += this.wrapX[i]! * grid.xSize;
      y += this.wrapY[i]! * grid.ySize;
      z += this.wrapZ[i]! * grid.zSize;
    }
    const vx = p.vx[i]!;
    const vy = p.vy[i]!;
    const vz = p.vz[i]!;

    let tx = NEVER;
    let nx = cx;
    if (grid.nx > 1 && vx !== 0) {
      if (vx > 0) {
        if (cx < grid.nx - 1 || grid.periodic) {
          tx = ((cx + 1) * grid.cellWidth - x) / vx;
          nx = cx + 1 === grid.nx ? 0 : cx + 1;
        }
      } else if (cx > 0 || grid.periodic) {
        tx = (cx * grid.cellWidth - x) / vx;
        nx = cx === 0 ? grid.nx - 1 : cx - 1;
      }
    }
    let ty = NEVER;
    let ny = cy;
    if (grid.ny > 1 && vy !== 0) {
      if (vy > 0) {
        if (cy < grid.ny - 1 || grid.periodic) {
          ty = ((cy + 1) * grid.cellHeight - y) / vy;
          ny = cy + 1 === grid.ny ? 0 : cy + 1;
        }
      } else if (cy > 0 || grid.periodic) {
        ty = (cy * grid.cellHeight - y) / vy;
        ny = cy === 0 ? grid.ny - 1 : cy - 1;
      }
    }
    let tz = NEVER;
    let nz = cz;
    if (grid.nz > 1 && vz !== 0) {
      if (vz > 0) {
        if (cz < grid.nz - 1 || grid.periodic) {
          tz = ((cz + 1) * grid.cellDepth - z) / vz;
          nz = cz + 1 === grid.nz ? 0 : cz + 1;
        }
      } else if (cz > 0 || grid.periodic) {
        tz = (cz * grid.cellDepth - z) / vz;
        nz = cz === 0 ? grid.nz - 1 : cz - 1;
      }
    }
    if (tx === NEVER && ty === NEVER && tz === NEVER) return;
    const t0 = p.t0[i]!;
    // Round-off can put the edge marginally behind the particle; cross at once then.
    const layer = grid.nx * grid.ny;
    if (tx <= ty && tx <= tz) {
      out.time = t0 + Math.max(tx, 0);
      out.part1 = cz * layer + cy * grid.nx + nx;
    } else if (ty <= tz) {
      out.time = t0 + Math.max(ty, 0);
      out.part1 = cz * layer + ny * grid.nx + cx;
    } else {
      out.time = t0 + Math.max(tz, 0);
      out.part1 = nz * layer + cy * grid.nx + cx;
    }
  }

  /**
   * Periodic arenas: shifts every velocity so total momentum is (xMom, yMom, zMom), then
   * rescales to restore the original kinetic energy (SetTotalMom). Callers re-predict
   * afterwards. zMom is ignored in 2D.
   */
  private setTotalMomentum(xMom: number, yMom: number, zMom: number): void {
    const p = this.particles;
    const n = p.count;
    if (n < 2) return;
    let origKE = 0;
    let currX = 0;
    let currY = 0;
    let currZ = 0;
    const is3D = this.is3D;
    for (let k = 0; k < n; k++) {
      origKE += this.particleKE(k);
      currX += p.vx[k]! * p.mass[k]!;
      currY += p.vy[k]! * p.mass[k]!;
      if (is3D) currZ += p.vz[k]! * p.mass[k]!;
    }
    if (!(origKE > 0.0)) return;
    const xAdj = (currX - xMom) / n;
    const yAdj = (currY - yMom) / n;
    const zAdj = (currZ - zMom) / n;
    let currKE = 0;
    for (let k = 0; k < n; k++) {
      const mass = p.mass[k]!;
      p.vx[k] = snapSubtract(p.vx[k]!, xAdj / mass);
      p.vy[k] = snapSubtract(p.vy[k]!, yAdj / mass);
      if (is3D) p.vz[k] = snapSubtract(p.vz[k]!, zAdj / mass);
      currKE += this.particleKE(k);
    }
    if (currKE > 0.0) {
      const f = Math.sqrt(origKE / currKE);
      for (let k = 0; k < n; k++) {
        p.vx[k] = p.vx[k]! * f;
        p.vy[k] = p.vy[k]! * f;
        if (is3D) p.vz[k] = p.vz[k]! * f;
      }
    }
  }

  /** Particle2D/3D.getKE: 0.5·m·|v|² in amu·m²/s², converted to joules. */
  private particleKE(i: number): number {
    const p = this.particles;
    const vx = p.vx[i]!;
    const vy = p.vy[i]!;
    let sum = 0.0 + vx * vx + vy * vy;
    if (this.is3D) sum += p.vz[i]! * p.vz[i]!;
    const speed = Math.sqrt(sum);
    const energy = 0.5 * p.mass[i]! * speed * speed;
    return (energy * AMU_JOULE) / 1.0;
  }
}

/**
 * value1 - value2, snapped to 0 when the difference is within about 1e-14 of the larger
 * operand (Particle.snapSubtract), so cancelling momenta land on exactly zero.
 */
export function snapSubtract(value1: number, value2: number): number {
  const max = Math.max(Math.abs(value1), Math.abs(value2));
  const diff = value1 - value2;
  const relativeError = Math.abs(diff) / max;
  if (relativeError < 1.0e-14 && relativeError !== 0.0) return 0.0;
  return diff;
}
