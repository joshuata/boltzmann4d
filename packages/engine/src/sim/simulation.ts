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
import { Collision, MAX_TIME, MIN_TIME, Wall, createEvent, type EventInfo } from './event';
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
import {
  createAttractiveWall,
  type AttractiveWall,
  type AttractiveWallOptions,
} from './attractive-wall';
import { createArena, Particles, type Arena } from './particles';
import { compressionLimitPercent, Piston, PistonMode } from './piston';
import { ReactionTable, type ReactionRule } from './reactions';
import { SegmentWalls, type WallHit, type WallShape } from './segment-walls';
import { snapshotOf, type StateSnapshot } from './snapshot';
import { Thermostat } from './thermostat';
import { convert } from '../utils/units';
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
// The 2D signatures are the widest (wells and the attractive wall are 2D-only so far); the
// 3D functions take a prefix of the same arguments.
// collide returns the event performed in 2D (a well exit may become WELL_REFLECT).
type Motion = Omit<(typeof MOTION)[2], 'collide'> & {
  collide: (...args: Parameters<typeof collide2D>) => number | void;
};

// Local copies for the hot paths (see plan 0002).
const NEVER = MAX_TIME;
const PARTICLE = Collision.PARTICLE;
const { ENTER_WELL, EXIT_WELL } = Collision;
/** Events between two particles: collisions, and entering or leaving a square well. */
const isPairType = (type: number) => type === PARTICLE || type === ENTER_WELL || type === EXIT_WELL;
const { BOUNDARY, EOB, WALL, BARRIER, EDGE, PISTON, DRAWN_WALL } = Collision;
const PERIODIC = ArenaType.PERIODIC_BOUNDARIES;
const LEFT = Wall.LEFT;
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
  /** Initial temperature (K) the scenario asked for, or NaN/absent to infer it. */
  initialTemperature?: number;
  /**
   * Per particle, the species whose colour it shows (reactions recolour particles without
   * changing their species). Absent: its own.
   */
  colors?: Uint16Array;
}

/** Everything the simulation starts from. io's ResolvedScenario satisfies this. */
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
  /** Divided arenas: whether the divider conducts heat. */
  dividerThermalMode?: DividerThermalMode;
  /**
   * Attractive square wells between particles (the settings dialog's Energy Wells tab):
   * a pair interacts within `radiusMultiplier` × (r1 + r2), with depth (in kJ/mol) the sum
   * of its two species' `depths`. Java only uses them in non-periodic arenas.
   */
  wells?: { radiusMultiplier: number; depths: readonly number[] };
  /**
   * Reaction rules between species (KIND-13; Java's Reactions tab is the single rule
   * `javaReaction`): a pair colliding hard enough becomes the rule's products, showing
   * their colour but keeping their own species (mass, radius, well depth).
   */
  reactions?: readonly ReactionRule[];
  /** A square well along the bottom wall (non-periodic 2D arenas). */
  attractiveWall?: AttractiveWallOptions;
  /**
   * Drawn walls (WALL-1, WALL-4): polylines with points in meters and their kind. 2D
   * only, and not in periodic or piston arenas (WALL-3).
   */
  walls?: readonly WallShape[];
  species: readonly InitialSpecies[];
  /**
   * Starting a run from the middle of another (Simulation.currentState, mid-run edits): the
   * clock (s), the piston's level and whether the demon's hole is open. Absent: 0, the top,
   * closed.
   */
  time?: number;
  pistonLevel?: number;
  holeOpen?: boolean;
}

export interface SimulationOptions {
  /** Simulation seconds per frame; defaults to DEFAULT_FRAME_DURATION. */
  frameDuration?: number;
  /** Called with each event just before it is performed (where statistics plug in). */
  onEvent?: (event: Readonly<EventInfo>) => void;
  /**
   * Called with each event just after it is performed, with the particles involved in
   * their new state (where observers such as the pressure meter read the outcome). It must
   * not change the simulation.
   */
  afterEvent?: (event: Readonly<EventInfo>) => void;
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
    'wallPredictions',
    'cellCrossings',
    'staleEvents',
  );

  /** Simulation time (s) every particle has been moved to by the last advanceToTime(). */
  time = 0;
  /** Maxwell's demon: whether the hole is open (it starts closed). */
  holeOpen = false;
  private nextFrameHoleOpen = false;
  frameDuration: number;
  /** Piston arenas: the piston (null otherwise). */
  readonly piston: Piston | null;
  /** The level the piston's latest move started from, where reverse() sends it back to. */
  private pistonMoveStart = 0;
  /** The wall thermostat, switched on by isothermal piston moves. */
  readonly thermostat = new Thermostat();
  /** The reaction rules, compiled (null without any). */
  readonly reactions: ReactionTable | null;
  /** The attractive wall (null without one). */
  readonly wall: AttractiveWall | null;
  /** Attractive wall: 1 for each particle inside its well. */
  private readonly inWallWell: Uint8Array;
  /** Drawn walls (null without any). */
  readonly walls: SegmentWalls | null;
  private readonly wallHit: WallHit = { time: 0, kind: 0, index: -1 };
  /** Gates to open (true) or close at the start of the next frame, by wall index. */
  private readonly pendingGates = new Map<number, boolean>();

  /**
   * Each particle's boundary event as Java predicted it: at the particle's own events, and
   * for every particle when the hole or the piston changes. Pair events are re-predicted
   * lazily, but the boundary event is reused, since the piston it was predicted against
   * may have moved on since.
   */
  private readonly boundaryTime: Float64Array;
  private readonly boundaryType: Uint8Array;
  private readonly boundarySide: Uint8Array;
  private readonly boundaryValid: Uint8Array;

  private readonly onEvent: SimulationOptions['onEvent'];
  private readonly afterEvent: SimulationOptions['afterEvent'];
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
  /**
   * Times at which Java moved every particle: frame ends, and (conducting divider) each
   * divider hit. A frame end comes after events at exactly that time; a divider hit's move
   * comes before the predictions it triggers, so it counts for predictions at that time.
   */
  private frameTimes: number[] = [];
  private frameCountsAtOwnTime: boolean[] = [];
  /** Divided arenas whose divider exchanges energy between the two sides. */
  private readonly conductingDivider: boolean;
  /** Square wells: λ (0 when off) and each species' depth in kJ/mol. */
  private readonly wellMultiplier: number;
  private readonly wellDepths: Float64Array;
  /**
   * Square wells: each pair's last event (LastCollisions), keyed by min·count + max. A pair
   * without one counts as a particle collision at MIN_TIME.
   */
  private readonly lastPairType = new Map<number, number>();
  private readonly lastPairTime = new Map<number, number>();
  /** Two-particle scratch store holding reconstructed states for predictions. */
  private readonly scratch = new Particles(2);

  private readonly event = createEvent();
  private readonly prediction = createEvent();
  private firstRun = true;
  private currentFrame: RenderFrame | null = null;
  /** What the simulation was built from (currentState() starts from it). */
  private readonly init: InitialState;

  constructor(init: InitialState, options: SimulationOptions = {}) {
    if (init.dimension !== 2 && init.dimension !== 3) {
      throw new Error(`${init.dimension}D simulation is not supported yet`);
    }
    if (init.dimension === 3 && init.dividerThermalMode === DividerThermalMode.CONDUCTING) {
      throw new Error('Conducting dividers are not supported in 3D yet');
    }
    const dimension = init.dimension;
    this.init = init;
    this.dimension = dimension;
    this.is3D = dimension === 3;
    const motion: Motion = MOTION[dimension];
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
    const wells = init.wells;
    this.wellMultiplier =
      wells &&
      wells.radiusMultiplier > 0 &&
      init.dimension === 2 && // 2D only so far
      init.arenaType !== ArenaType.PERIODIC_BOUNDARIES
        ? wells.radiusMultiplier
        : 0;
    this.wellDepths = Float64Array.from(init.species, (_, t) => wells?.depths[t] ?? 0);
    this.reactions =
      init.reactions && init.reactions.length > 0
        ? new ReactionTable(init.reactions, init.species.length)
        : null;
    this.wall =
      init.attractiveWall &&
      init.dimension === 2 && // 2D only so far
      init.arenaType !== ArenaType.PERIODIC_BOUNDARIES
        ? createAttractiveWall(init.attractiveWall)
        : null;
    this.conductingDivider =
      init.dividerThermalMode === DividerThermalMode.CONDUCTING &&
      (init.arenaType === ArenaType.DIVIDED_ARENA ||
        init.arenaType === ArenaType.DIVIDED_ARENA_WITH_HOLE);
    this.piston =
      init.arenaType === ArenaType.MOVABLE_PISTON
        ? new Piston(init.time ?? 0, init.pistonLevel ?? 0.0, init.arenaYSize)
        : null;
    this.time = init.time ?? 0;
    this.holeOpen = this.nextFrameHoleOpen = this.arena.maxwellDemonMode && !!init.holeOpen;
    if (init.holeEdges) {
      if (init.holeEdges.y.length !== this.arena.edgeY.length) {
        throw new Error('holeEdges must have one entry per edge sphere');
      }
      this.arena.edgeY.set(init.holeEdges.y);
      this.arena.edgeZ.set(init.holeEdges.z);
    }
    this.frameDuration = options.frameDuration ?? DEFAULT_FRAME_DURATION;
    this.onEvent = options.onEvent;
    this.afterEvent = options.afterEvent;

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
        p.t0[i] = this.time;
        p.type[i] = typeIndex;
        p.color[i] = species.colors?.[k] ?? typeIndex;
        motion.initPeriodicFlags(p, i, this.arena);
      }
    });
    this.particles = p;
    this.inWallWell = new Uint8Array(count);
    if (this.wall) {
      let largest = 0;
      for (let k = 0; k < count; k++) largest = Math.max(largest, p.radius[k]!);
      // Its top must be above the lowest a particle's centre can go (one radius).
      if (!(this.wall.width > largest)) {
        throw new RangeError(`The attractive wall's well must be wider than ${largest} m`);
      }
    }
    if (this.wall)
      for (let k = 0; k < count; k++) this.inWallWell[k] = p.y[k]! < this.wall.width ? 1 : 0;

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
    this.boundaryTime = new Float64Array(count);
    this.boundaryType = new Uint8Array(count);
    this.boundarySide = new Uint8Array(count);
    this.boundaryValid = new Uint8Array(count);

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
    // ... or, with square wells, the largest well diameter.
    this.grid = new CellGrid(
      this.arena,
      count,
      (r1 + r2) * Math.max(1, this.wellMultiplier),
      dimension,
    );
    for (let k = 0; k < count; k++)
      this.grid.insert(k, this.grid.cellAt(p.x[k]!, p.y[k]!, p.z[k]!));
    this.walls = init.walls && init.walls.length > 0 ? this.createWalls(init) : null;

    // Java predicts everything, then (periodic) zeroes the momentum and predicts
    // everything again; only the second prediction matters, so adjust first.
    if (this.arena.type === PERIODIC) this.setTotalMomentum(0, 0, 0);
    if (this.wellMultiplier > 0) this.markStartingWells();
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
      this.repredictAllBoundaries();
    }
    if (this.pendingGates.size > 0) {
      // Gates likewise: every particle may now hit, or pass, them.
      for (const [w, open] of this.pendingGates) this.walls?.setOpen(w, open);
      this.pendingGates.clear();
      for (let k = 0; k < this.particles.count; k++) this.repredict(k);
    }
    const heap = this.heap;
    for (;;) {
      const i = heap.peek();
      if (i < 0 || heap.time[i]! > maxTime) break;
      if (this.isReal(i)) this.perform(i);
      else this.processInternal(i);
    }
    this.piston?.moveToTime(maxTime);
    const p = this.particles;
    const moveToTime = this.moveToTime;
    for (let k = 0; k < p.count; k++) {
      moveToTime(p, k, maxTime);
      this.resetWrap(k);
    }
    this.frameTimes.push(maxTime);
    this.frameCountsAtOwnTime.push(false);
    this.time = maxTime;
  }

  /**
   * Maxwell's demon: open or close the hole in the divider. Takes effect at the start of
   * the next frame, as in Java (Physics.setArenaHoleOpen).
   */
  setHoleOpen(open: boolean): void {
    this.nextFrameHoleOpen = open;
  }

  /**
   * Starts the piston towards `targetLevel` (fraction of the arena height pushed in) at
   * `speed` m/s, from where it is now (Physics.AdjustPistonLevel). Isothermal moves turn
   * the wall thermostat on; adiabatic ones turn it off. Instantaneous moves jump there and
   * may only pull the piston out (Java's piston panel only allows that), since jumping in
   * could land the piston on particles. `dampFactor` (isothermal only, OPT-6) sets the
   * thermostat's damping; left out, it keeps its present one (10% from a reset).
   */
  movePiston(targetLevel: number, mode: PistonMode, speed: number, dampFactor?: number): void {
    const piston = this.requirePiston();
    if (!(targetLevel >= 0 && targetLevel <= this.maxPistonLevel())) {
      throw new RangeError(`Piston level ${targetLevel} is outside 0..${this.maxPistonLevel()}`);
    }
    piston.speed = speed;
    this.pistonMoveStart = piston.curLevel;
    if (mode === PistonMode.INSTANTANEOUS) {
      if (targetLevel > piston.curLevel) {
        throw new RangeError('An instantaneous piston move can only pull the piston out');
      }
      piston.targetLevel = targetLevel;
      piston.curLevel = targetLevel;
      // Java doesn't re-predict here, so particles already heading for the old position
      // bounce off it once more (joshuata/boltzmann4d#24). Re-predicting fixes that.
      this.repredictAllBoundaries();
      return;
    }
    piston.targetLevel = targetLevel;
    this.repredictAllBoundaries();
    if (mode === PistonMode.ISOTHERMAL) {
      this.thermostat.enabled = true;
      if (dampFactor !== undefined) this.thermostat.dampFactor = dampFactor;
    } else this.thermostat.reset(false);
  }

  /** Stops the piston where it is now (Controller.stopPiston). The thermostat stays as it is. */
  stopPiston(): void {
    const piston = this.requirePiston();
    piston.targetLevel = piston.curLevel;
    this.repredictAllBoundaries();
  }

  /**
   * Reverse (SIM-32, CTRL-6): flips the velocity of every particle, and sends a moving
   * piston back towards where its move started, at the current time. The clock keeps
   * running forward and the motion retraces itself as closely as round-off allows, until
   * chaos (SIM-4) takes over. The isothermal thermostat, a conducting divider and a
   * reaction with its reverse suppressed aren't time-reversible, so there it won't retrace.
   *
   * Java has Particle.reverse() but never calls it (its Time Reverse button is disabled),
   * so this has no parity counterpart.
   */
  reverse(): void {
    this.synchronize();
    const p = this.particles;
    const n = p.count;

    for (let k = 0; k < n; k++) {
      p.vx[k] = -p.vx[k]!;
      p.vy[k] = -p.vy[k]!;
      p.vz[k] = -p.vz[k]!;
    }
    const piston = this.piston;
    if (piston?.isMoving(this.time)) {
      // The piston is at its current level as of this frame (advanceToTime moved it).
      const back = this.pistonMoveStart;
      this.pistonMoveStart = piston.targetLevel;
      piston.targetLevel = back;
    }
    // Every particle starts afresh from here, as after an event of its own: predictions
    // (boundaries included) start from its present state.
    for (let k = 0; k < n; k++) {
      this.collisionCount[k]!++; // pair events predicted with the old velocities are stale
      this.recordEventState(k);
    }
    for (let k = 0; k < n; k++) this.repredict(k);
  }

  /**
   * The present moment as a starting state (mid-run edits rebuild the simulation from it):
   * every particle moved to the latest time, with its velocity and displayed colour, plus
   * the clock, the piston's level, the demon's hole (as of the next frame) and the gates.
   * Species keep their order and their particles' order. A moving piston comes back
   * stopped, and the wall thermostat off.
   */
  currentState(): InitialState {
    this.synchronize();
    const p = this.particles;
    let first = 0;
    const species = this.init.species.map((s, t): InitialSpecies => {
      let n = 0;
      while (first + n < p.count && p.type[first + n] === t) n++;
      const positions = new Float64Array(3 * n);
      const velocities = new Float64Array(3 * n);
      const colors = new Uint16Array(n);
      for (let k = 0; k < n; k++) {
        const i = first + k;
        positions[3 * k] = p.x[i]!;
        positions[3 * k + 1] = p.y[i]!;
        positions[3 * k + 2] = p.z[i]!;
        velocities[3 * k] = p.vx[i]!;
        velocities[3 * k + 1] = p.vy[i]!;
        velocities[3 * k + 2] = p.vz[i]!;
        colors[k] = p.color[i]!;
      }
      first += n;
      return { ...s, positions, velocities, colors };
    });
    const walls = this.init.walls?.map((w, index) =>
      w.physics?.type === 'gate'
        ? {
            ...w,
            physics: {
              type: 'gate' as const,
              open: this.pendingGates.get(index) ?? this.walls!.isOpen(index),
            },
          }
        : w,
    );
    return {
      ...this.init,
      species,
      ...(walls ? { walls } : {}),
      time: this.time,
      pistonLevel: this.piston?.curLevel ?? 0,
      holeOpen: this.nextFrameHoleOpen,
    };
  }

  /**
   * The present state for statistics outside the worker (see snapshot.ts): every particle
   * at the latest time. Only reads the simulation (at a frame boundary the particles are
   * already together), so it can't change the physics.
   */
  stateSnapshot(run: number): StateSnapshot {
    this.synchronize();
    return snapshotOf(this.particles, run, this.time, this.dimension);
  }

  /** After step() particles are at their own event times: brings them all to the latest. */
  private synchronize(): void {
    const p = this.particles;
    const n = p.count;
    let latest = this.time;
    for (let k = 0; k < n; k++) if (p.t0[k]! > latest) latest = p.t0[k]!;
    let together = latest === this.time;
    for (let k = 0; together && k < n; k++) together = p.t0[k] === latest;
    if (!together) this.advanceToTime(latest);
  }

  /** Highest piston level that leaves the particles room (Physics.calculateCompressionLimit). */
  maxPistonLevel(): number {
    const p = this.particles;
    const radius = p.radius;
    const species = new Map<number, { radius: number; count: number }>();
    for (let k = 0; k < p.count; k++) {
      const entry = species.get(p.type[k]!) ?? { radius: radius[k]!, count: 0 };
      entry.count++;
      species.set(p.type[k]!, entry);
    }
    const limit = compressionLimitPercent(this.arena, [...species.values()], this.dimension);
    return (100.0 - limit) / 100.0;
  }

  private requirePiston(): Piston {
    if (!this.piston) throw new Error('This arena has no piston');
    return this.piston;
  }

  /**
   * Drawn walls (WALL-3): 2D, inside a solid box without a piston, and no particle may
   * start overlapping one.
   */
  private createWalls(init: InitialState): SegmentWalls {
    if (init.dimension !== 2) throw new Error('Drawn walls are only available in 2D');
    if (
      init.arenaType === ArenaType.PERIODIC_BOUNDARIES ||
      init.arenaType === ArenaType.MOVABLE_PISTON
    ) {
      throw new Error("Drawn walls can't be used with periodic boundaries or the piston yet");
    }
    const p = this.particles;
    let maxRadius = 0;
    for (let k = 0; k < p.count; k++) maxRadius = Math.max(maxRadius, p.radius[k]!);
    const walls = new SegmentWalls(init.walls!, this.grid, maxRadius, p);
    for (let k = 0; k < p.count; k++) {
      // A hair of slack, as placement leaves exactly one radius at best. Walls a particle
      // passes through (semipermeable, open gates) don't count.
      if (walls.distanceTo(p.x[k]!, p.y[k]!, p.color[k]!) < p.radius[k]! * (1 - 1e-9)) {
        throw new Error(`Particle ${k} starts overlapping a drawn wall`);
      }
    }
    return walls;
  }

  /**
   * Opens or closes the gate that is drawn wall `index` (WALL-4), from the start of the next
   * frame, as the demon's hole does.
   */
  setGateOpen(index: number, open: boolean): void {
    if (!this.walls?.isGate(index)) throw new Error(`Drawn wall ${index} is not a gate`);
    this.pendingGates.set(index, open);
  }

  /** Re-predicts every particle's boundary event from where it is now, then its events. */
  private repredictAllBoundaries(): void {
    const n = this.particles.count;
    for (let k = 0; k < n; k++) this.predictBoundaryAt(k, this.time, true);
    for (let k = 0; k < n; k++) this.repredict(k);
  }

  /** Predicts and caches particle k's boundary event from its state at time `te`. */
  private predictBoundaryAt(k: number, te: number, includeFrameAtTe: boolean): void {
    this.predictionState(k, te, 0, includeFrameAtTe);
    const out = this.prediction;
    this.predictBoundary(this.scratch, 0, this.arena, out, this.holeOpen, this.piston, this.wall);
    this.counters.boundaryPredictions++;
    this.boundaryTime[k] = out.time;
    this.boundaryType[k] = out.type;
    this.boundarySide[k] = out.side;
    this.boundaryValid[k] = 1;
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
    const speeds = new Float32Array(p.count);
    for (let k = 0; k < p.count; k++) {
      positions[d * k] = p.x[k]!;
      positions[d * k + 1] = p.y[k]!;
      if (d === 3) positions[d * k + 2] = p.z[k]!;
      const vx = p.vx[k]!;
      const vy = p.vy[k]!;
      const vz = p.vz[k]!;
      speeds[k] = Math.sqrt(vx * vx + vy * vy + vz * vz);
    }
    const frame: RenderFrame = {
      dimension: this.dimension,
      time: this.time,
      positions,
      types: p.color.slice(), // what each particle shows (reactions recolour)
      speeds,
    };
    if (this.piston) frame.pistonY = this.piston.position();
    if (this.arena.maxwellDemonMode) frame.holeOpen = this.holeOpen;
    if (this.walls) {
      const open: number[] = [];
      for (let w = 0; w < this.walls.wallCount; w++) {
        if (this.walls.isGate(w) && this.walls.isOpen(w)) open.push(w);
      }
      frame.openGates = open;
    }
    return frame;
  }

  /**
   * Square wells: potential energy in joules. A pair inside its well (its last event was
   * entering, a bounce off the well's edge, or a collision inside) holds −E/2, where E
   * is the sum of the two species' depths: that's what entering gives the pair in kinetic
   * energy (joshuata/boltzmann4d#24). 0 without wells.
   */
  potentialEnergy(): number {
    const p = this.particles;
    // Drawn attractive walls: −E per particle inside each one's well.
    let total = this.walls ? this.walls.potentialEnergy() * AMU_JOULE : 0;
    if (this.wall) {
      // The attractive wall: −E per particle inside its well.
      for (let k = 0; k < p.count; k++)
        if (this.inWallWell[k]) total -= this.wall.energy * AMU_JOULE;
    }
    for (const [key, type] of this.lastPairType) {
      if (type === EXIT_WELL) continue; // every other recorded pair event leaves it inside
      const a = Math.floor(key / p.count);
      const b = key - a * p.count;
      const depth = this.wellDepths[p.type[a]!]! + this.wellDepths[p.type[b]!]!;
      total -= (convert('kJ/mol', 'amu·m^2/s^2', depth) / 2) * AMU_JOULE;
    }
    return total;
  }

  /** Attractive wall: how many particles are inside its well. */
  particlesInWallWell(): number {
    let n = 0;
    for (const inside of this.inWallWell) n += inside;
    return n;
  }

  /** Pairs inside each other's square well, as [lower index, higher index]. */
  pairsInWells(): [number, number][] {
    const count = this.particles.count;
    const pairs: [number, number][] = [];
    for (const [key, type] of this.lastPairType) {
      if (type === EXIT_WELL) continue; // every other recorded pair event leaves it inside
      const a = Math.floor(key / count);
      pairs.push([a, key - a * count]);
    }
    return pairs;
  }

  /** Whether square wells between particles are on (they store potential energy). */
  get hasWells(): boolean {
    return this.wellMultiplier > 0;
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
    if (!isPairType(type)) return true;
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

  /** Performs particle i's (valid, physical) next event, then tells afterEvent. */
  private perform(i: number): Readonly<EventInfo> {
    const event = this.performEvent(i);
    this.afterEvent?.(event);
    return event;
  }

  /** Performs particle i's (valid, physical) next event and re-predicts what it changed. */
  private performEvent(i: number): Readonly<EventInfo> {
    const p = this.particles;
    const event = this.event;
    const type = this.nextType[i]!;
    event.time = this.heap.time[i]!;
    event.side = this.nextSide[i]!;
    event.type = type as EventInfo['type'];
    const pair = isPairType(type);
    if (pair) {
      const j = this.nextPartner[i]!;
      event.part1 = i < j ? i : j;
      event.part2 = i < j ? j : i;
    } else {
      event.part1 = i;
      event.part2 = type === DRAWN_WALL ? this.nextPartner[i]! : 0;
    }
    this.onEvent?.(event);
    this.counters.events++;

    if (pair) {
      const a = event.part1;
      const b = event.part2;
      this.moveToTime(p, a, event.time);
      this.moveToTime(p, b, event.time);
      const wellEnergy =
        type === PARTICLE
          ? 0.0
          : convert(
              'kJ/mol',
              'amu·m^2/s^2',
              this.wellDepths[p.type[a]!]! + this.wellDepths[p.type[b]!]!,
            );
      // An exit without the energy to leave comes back as WELL_REFLECT.
      const performed = this.collide(p, a, b, event, this.arena, wellEnergy, this.reactions);
      if (this.wellMultiplier > 0) {
        const key = a * p.count + b;
        this.lastPairType.set(key, performed as number); // wells are 2D-only
        this.lastPairTime.set(key, event.time);
      }
      this.counters.particleCollisions++;
      this.collisionCount[a]!++;
      this.collisionCount[b]!++;
      this.recordEventState(a);
      this.recordEventState(b);
      this.repredict(a);
      this.repredict(b);
    } else {
      if (type === DRAWN_WALL) {
        this.walls!.collide(p, i, event.time, event.side, event.part2);
        this.counters.wallCollisions++;
        this.collisionCount[i]!++;
        this.recordEventState(i);
        this.repredict(i);
        return event;
      }
      if (type === BARRIER && this.conductingDivider) {
        this.conductAcrossDivider(i, event);
        return event;
      }
      this.boundaryCollide(p, i, event, this.arena, this.piston, this.thermostat, this.wall);
      if (type === Collision.ENTER_GRAVITY_WELL) this.inWallWell[i] = 1;
      else if (type === Collision.EXIT_GRAVITY_WELL) this.inWallWell[i] = p.vy[i]! < 0 ? 1 : 0;
      if (type === WALL || type === PISTON) this.counters.wallCollisions++;
      else if (type === BOUNDARY || type === EOB) this.counters.boundaryCrossings++;
      else if (type === BARRIER || type === EDGE) this.counters.dividerCollisions++;
      this.collisionCount[i]!++;
      this.recordEventState(i);
      this.repredict(i);
    }
    return event;
  }

  /**
   * A conducting divider (Physics.PerformEvent): particle i bounces off the divider and
   * swaps its normal (x) kinetic energy with the particle on the other side that is
   * heading for the divider and closest to it. i leaves the divider; the partner keeps
   * its direction. Without such a partner it's an ordinary bounce.
   */
  private conductAcrossDivider(i: number, event: Readonly<EventInfo>): void {
    const p = this.particles;
    const partner = this.findIncomingParticleOnOppositeSide(i, event.side, event.time);
    let partnerEnergy = 0;
    let partnerDirection = 0;
    if (partner >= 0) {
      const v = p.vx[partner]!;
      partnerEnergy = 0.5 * p.mass[partner]! * v * v;
      partnerDirection = Math.sign(v);
    }
    this.boundaryCollide(p, i, event, this.arena, this.piston, this.thermostat, this.wall);
    this.counters.dividerCollisions++;
    this.collisionCount[i]!++;
    if (partner >= 0) {
      const v = p.vx[i]!;
      const currentEnergy = 0.5 * p.mass[i]! * v * v;
      const currentDirection = event.side === LEFT ? -1.0 : 1.0;
      p.vx[i] = currentDirection * Math.sqrt((2.0 * partnerEnergy) / p.mass[i]!);
      p.vx[partner] = partnerDirection * Math.sqrt((2.0 * currentEnergy) / p.mass[partner]!);
      this.collisionCount[partner]!++;
      this.recordEventState(i);
      this.recordEventState(partner);
      this.repredict(i);
      this.repredict(partner);
    } else {
      this.recordEventState(i);
      this.repredict(i);
    }
  }

  /**
   * Java finds the conducting partner by moving every other particle to the event time
   * (which, like a frame end, changes the rounding of later predictions; see frameTimes),
   * then taking the closest one heading for the divider from the other side. The first
   * index wins ties.
   */
  private findIncomingParticleOnOppositeSide(i: number, side: number, time: number): number {
    const p = this.particles;
    const arena = this.arena;
    const currentOnLeft = side === LEFT;
    const centerX = arena.xSize / 2.0;
    let nearest = -1;
    let nearestGap = Infinity;
    for (let k = 0; k < p.count; k++) {
      if (k === i) continue;
      this.moveToTime(p, k, time);
      const x = p.x[k]!;
      if (x > centerX !== currentOnLeft) continue;
      const v = p.vx[k]!;
      if (currentOnLeft ? !(v < 0.0) : !(v > 0.0)) continue;
      const gap = currentOnLeft
        ? x - p.radius[k]! - arena.barrierRightX
        : arena.barrierLeftX - p.radius[k]! - x;
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = k;
      }
    }
    this.frameTimes.push(time);
    this.frameCountsAtOwnTime.push(true);
    return nearest;
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

    // Java predicts boundaries at the particle's own events (from that state), and for
    // every particle when the hole or the piston changes; otherwise reuse that prediction.
    const scratch = this.scratch;
    let loadedAt = NaN; // time scratch slot 0 currently holds i's state for
    if (!this.boundaryValid[i]) {
      this.predictBoundaryAt(i, this.eventT0[i]!, false);
      loadedAt = this.eventT0[i]!;
    }
    const boundaryTime = this.boundaryTime[i]!;
    if (boundaryTime < bestTime || (boundaryTime === bestTime && 0 < bestRow)) {
      bestTime = boundaryTime;
      bestRow = 0;
      bestCol = i;
      bestType = this.boundaryType[i]!;
      bestSide = this.boundarySide[i]!;
    }
    // Drawn walls, from the particle's present state (no Java to match). They lose ties
    // with the box's walls.
    if (this.walls) {
      const hit = this.wallHit;
      this.walls.predict(this.particles, i, grid.cellOf[i]!, hit);
      counters.wallPredictions++;
      if (hit.time < bestTime || (hit.time === bestTime && 0 < bestRow)) {
        bestTime = hit.time;
        bestRow = 0;
        bestCol = i;
        bestType = DRAWN_WALL;
        bestSide = hit.kind; // bounce, or entering or leaving a well
        bestPartner = hit.index;
      }
    }

    const neighbours = grid.neighbours;
    const neighbourCount = grid.neighbourCount;
    const firstNeighbour = grid.cellOf[i]! * neighbourCount;
    const countI = this.collisionCount[i]!;
    const wells = this.wellMultiplier;
    const count = this.particles.count;
    const eventT0 = this.eventT0;
    const tI = eventT0[i]!;
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
        if (wells) {
          const key = i < k ? i * count + k : k * count + i;
          predictPair(
            scratch,
            0,
            1,
            arena,
            out,
            wells,
            this.lastPairType.get(key) ?? PARTICLE,
            this.lastPairTime.get(key) ?? MIN_TIME,
          );
        } else {
          predictPair(scratch, 0, 1, arena, out);
        }
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
          bestType = out.type;
          bestPartner = k;
          bestSide = out.side;
        }
        // Offer the event to k if it beats k's own next event.
        if (heap.keyBefore(t, row, col, k)) {
          this.nextType[k] = out.type;
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
    if (isPairType(bestType)) this.nextPartnerCount[i] = this.collisionCount[bestPartner]!;
    if (bestType === CROSSING) this.nextCell[i] = crossingCell;
    heap.set(i, bestTime, bestRow, bestCol);
  }

  /**
   * Pairs that start inside each other's well count as having just entered it
   * (Physics.initializeLastCollisions), so their first well event is an exit.
   */
  private markStartingWells(): void {
    const p = this.particles;
    const grid = this.grid;
    const count = p.count;
    for (let a = 0; a < count; a++) {
      const first = grid.cellOf[a]! * grid.neighbourCount;
      for (let m = 0; m < grid.neighbourCount; m++) {
        {
          const c = grid.neighbours[first + m]!;
          if (c < 0) continue;
          for (let b = grid.head[c]!; b >= 0; b = grid.next[b]!) {
            if (b <= a) continue;
            // In the plane. Java measures in 3D, and its loader gives 2D particles a random z,
            // so it misses most pairs that start inside a well (joshuata/boltzmann4d#24).
            // That changes no events (an inside pair can't be predicted to enter, and exits
            // are the same either way), only this bookkeeping.
            const ddx = p.x[a]! - p.x[b]!;
            const ddy = p.y[a]! - p.y[b]!;
            const distance = Math.sqrt(0.0 + ddx * ddx + ddy * ddy);
            if (distance < this.wellMultiplier * (p.radius[b]! + p.radius[a]!)) {
              this.lastPairType.set(a * count + b, ENTER_WELL);
              this.lastPairTime.set(a * count + b, this.time);
            }
          }
        }
      }
    }
  }

  /** Remembers particle i's state right after an event (for predictionState). */
  private recordEventState(i: number): void {
    const p = this.particles;
    this.eventX[i] = p.x[i]!;
    this.eventY[i] = p.y[i]!;
    this.eventZ[i] = p.z[i]!;
    this.eventT0[i] = p.t0[i]!;
    this.boundaryValid[i] = 0;
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
        if (frame > te || (frame === te && !includeFrameAtTe && !this.frameCountsAtOwnTime[f]))
          break;
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
