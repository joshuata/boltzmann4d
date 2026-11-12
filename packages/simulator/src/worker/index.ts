// Main-thread <-> simulation-worker message protocol (mirrors ThreadController.java).
// Frames don't come back here: they stream to the renderer over the `frames` port
// (render/protocol.ts), so the main thread only handles controls and readouts.
import type { PistonMode } from '@boltzmann4d/engine/sim/piston';
import type { Census, ColorMode, Dimension, StateSnapshot } from '@boltzmann4d/engine/sim';
import type { StatisticsSummary } from '@boltzmann4d/engine/stats/summary';
import type { DistributionId, StatisticId } from '@boltzmann4d/engine/stats/statistic-ids';
import type { PressureReading } from '@boltzmann4d/engine/stats/pressure';
import type { ScenarioInput } from '@boltzmann4d/engine/scenario';

/**
 * What to run: a bundled preset by file name without `.set` (`default` is the scenario the
 * Java app opens with), or a scenario the page supplies, e.g. from a file the user opened.
 * `name` labels it in messages.
 */
export type ScenarioSource =
  { kind: 'preset'; name: string } | { kind: 'scenario'; name: string; scenario: ScenarioInput };

/**
 * Changes to a scenario's arena that keep its particle placement valid: a reflecting arena
 * can get the movable piston, and a divided arena's divider can conduct heat.
 */
export interface ArenaOptions {
  piston?: boolean;
  conductingDivider?: boolean;
  /** Maxwell's demon: the hole is closed until opened (arenas with a hole). */
  demon?: boolean;
  /**
   * Attractive square wells between particles (non-periodic arenas): radius as a multiple
   * of the contact distance, and each species' depth in kJ/mol. null turns them off.
   */
  wells?: { radiusMultiplier: number; depths: number[] } | null;
  /**
   * The Java reaction, species 0 + 0 ⇌ 1 + 1 (2D scenarios with one species or that rule
   * already): activation energies in kJ/mol. null turns it off; absent follows the
   * scenario's rules.
   */
  reactions?: { forward: number; reverse: number; suppressReverse: boolean } | null;
  /** A square well along the bottom wall: width in m, depth in kJ/mol. null turns it off. */
  attractiveWall?: { width: number; depth: number } | null;
  /**
   * Arena side lengths x, y, z in nm (OPT-1, SIM-10). Particles are placed anew; drawn
   * walls and spawn regions stretch with the arena.
   */
  size?: [number, number, number];
}

/** The boundary modes the sidebar's buttons switch between mid-run (SIM-12–16). */
export type BoundaryMode = 'PERIODIC' | 'REFLECTING' | 'DIVIDED' | 'HOLE';

/** The Particles panel's values for one kind, applied by Restart (PART-14, PART-15). */
export interface KindSetup {
  /** The scenario kind's id. */
  kind: string;
  /** amu. */
  mass: number;
  /** nm. */
  radius: number;
  /** K. */
  temperature: number;
}

/** One of the scenario's kinds, for the Particles panel (whether or not it has particles). */
export interface SetupKind {
  id: string;
  name: string;
  /** 0xRRGGBB. */
  color: number;
  marker: string;
  /** As running: amu, nm. */
  mass: number;
  radius: number;
  /** The scenario's starting temperature for it, K (300 when it has no particles). */
  temperature: number;
  /** Its species index in the running simulation, or −1 while it has no particles. */
  species: number;
}

/** What the sidebar needs to offer a piston arena's controls. */
export interface PistonInfo {
  /** Highest level the piston may be pushed to (fraction of the arena height). */
  maxLevel: number;
  /** Arena height, m. */
  arenaHeight: number;
}

/** Which arena options a loaded scenario can take, and which are on. */
export interface ArenaInfo {
  canHavePiston: boolean;
  canConduct: boolean;
  /** Arenas with a hole can have Maxwell's demon. */
  canDemon: boolean;
  /** Square wells work in every arena but periodic ones (as in Java). */
  canHaveWells: boolean;
  /**
   * Whether the Java reaction can be switched: a single species (a reacted copy is added),
   * as Java's dialog requires, or that rule already.
   */
  canReact: boolean;
  /** Species names, for per-species settings. */
  typeNames: string[];
  /** The arena's side lengths x, y, z in nm, as running. */
  size: [number, number, number];
  /** The arena's boundary mode (piston arenas are reflecting ones with a piston). */
  boundary: BoundaryMode | 'PISTON';
  /** Whether the scenario has drawn walls (the pressure readout ignores them; no periodic). */
  drawnWalls: boolean;
  /** Drawn gates (WALL-4): wall index, id, and points (x, y pairs in m) for tapping them. */
  gates: { index: number; id: string; points: number[]; closed: boolean }[];
  options: ArenaOptions;
}

export type ToWorker =
  /**
   * Sent once: where to stream scene and frames, and what to run (the default preset when
   * absent). The worker starts after this.
   */
  | { type: 'connect'; frames: MessagePort; source?: ScenarioSource; arena?: ArenaOptions }
  /**
   * Replace the running simulation (keeps play/pause). `pressureAveragingTime` (s) and
   * `forgetMultiplier` keep the user's choices; absent, the scenario's apply. Axis limits
   * go back to the scenario's.
   */
  | {
      type: 'load';
      source: ScenarioSource;
      arena?: ArenaOptions;
      pressureAveragingTime?: number;
      forgetMultiplier?: number;
      /** A newly chosen scenario (not an arena change): it may start paused (FILE-4). */
      fresh?: boolean;
    }
  /** Piston arenas: start the piston towards `level` (fraction pushed in) at `speed` m/s. */
  | { type: 'movePiston'; level: number; mode: PistonMode; speed: number }
  | { type: 'stopPiston' }
  /**
   * Restart (CTRL-3, PART-14): the clock to zero and every particle placed anew at random,
   * each kind with its present count and the panel's mass, radius and temperature.
   */
  | { type: 'restart'; kinds?: KindSetup[] }
  /**
   * Add one particle of a kind (PART-7, PART-8) at `temperature` K: at a point (x, y in m;
   * 2D taps) or at random. The run carries on; a point that's taken is refused (`notice`).
   */
  | { type: 'addParticle'; kind: string; at?: [number, number]; temperature: number }
  /** Remove the kind's newest particle (PART-9). */
  | { type: 'removeParticle'; kind: string }
  /**
   * Set the kind's number of particles (PART-1, 8, 9): adds at random at `temperature` K,
   * or removes the newest. Adds as many as fit (a `notice` says when that's fewer).
   */
  | { type: 'setCount'; kind: string; count: number; temperature: number }
  /**
   * Switch the boundary mode (SIM-12–16): carries on when the particles fit the new arena
   * (opening a divided box's hole, removing its divider), else restarts; a switch to the
   * divided box restarts with every particle on the left (SIM-14).
   */
  | { type: 'setBoundary'; boundary: BoundaryMode }
  /** Maxwell's demon: open or close the hole (from the next frame). */
  | { type: 'setHoleOpen'; open: boolean }
  /** Open or close the gate that is drawn wall `index` (from the next frame). */
  | { type: 'setGate'; index: number; open: boolean }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  /** Flip every velocity (SIM-32, CTRL-6); the clock keeps running forward. */
  | { type: 'reverse' }
  /** Multiply the scenario's simulation speed (kept across loads). */
  | { type: 'rate'; scale: number }
  /**
   * The kinds (species indices) the statistics should also cover (KIND-4), when they
   * aren't a set tracked anyway; null for none. Reset by each load.
   */
  | { type: 'statKinds'; types: number[] | null }
  /** The pressure averaging time T_avg in seconds (OPT-3; kept by Restart). */
  | { type: 'pressureAveragingTime'; seconds: number }
  /** Which plot the statistics summaries carry (STAT-1). */
  | { type: 'statistic'; id: StatisticId }
  /** One of a plot's axis limits (STAT-8–10; kept by Restart, reset by a load). */
  | { type: 'statLimit'; id: DistributionId; edge: 'min' | 'max'; value: number }
  /** Finite-system (PRED-11) and real-gas (PRED-9) predictions; kept across loads. */
  | { type: 'statOptions'; finite?: boolean; realGas?: boolean }
  /** The forget time, in predicted collision times (OPT-4; kept by Restart). */
  | { type: 'forgetMultiplier'; value: number }
  /**
   * State snapshots for statistics computed outside the worker (joshuata/boltzmann4d#84):
   * one about every `intervalMs` real milliseconds (null: none), and with each one every
   * event since the previous when `events` is on (at most `eventCap` per snapshot). Kept
   * across loads.
   */
  | { type: 'snapshots'; intervalMs: number | null; events: boolean; eventCap?: number };

/** One particle kind of the running simulation, for legends and pickers (KIND-4, KIND-9). */
export interface KindInfo {
  name: string;
  /** 0xRRGGBB. */
  color: number;
  /** See render/markers.ts. */
  marker: string;
}

export type FromWorker =
  /**
   * Sent with every frame. `physicsMs`: wall-clock time the physics took to produce it;
   * `time`: its simulation time (s).
   */
  | {
      type: 'timing';
      physicsMs: number;
      time: number;
      /** Piston arenas: its level and whether it's moving, as of this frame. */
      piston?: { level: number; moving: boolean };
      /** Maxwell's demon: whether the hole is open this frame. */
      holeOpen?: boolean;
      /** Drawn walls: the gates open this frame, by wall index. */
      openGates?: number[];
    }
  /** A scenario finished loading and is now the running simulation. */
  | {
      type: 'loaded';
      /**
       * An edit of the same run (particles added or removed, the arena switched): the
       * clock carries on and the user's choices stay.
       */
      continued: boolean;
      /** Whether it runs paused (a fresh load follows the scenario, FILE-4). */
      paused: boolean;
      /** Every kind the scenario has, for the Particles panel. */
      setupKinds: SetupKind[];
      /** The source's name. */
      name: string;
      particles: number;
      dimension: Dimension;
      /** Per species, in type order. */
      kinds: KindInfo[];
      arena: ArenaInfo;
      piston?: PistonInfo;
      /** The scenario's view (colour mode, trace) and the arena's size, m. */
      view: {
        /** Whether the scenario draws kinds' markers (KIND-9). */
        markers: boolean;
        colorMode: ColorMode;
        trace: { enabled: boolean; pointSize: number };
        arenaWidth: number;
        arenaHeight: number;
      };
      /** The scenario's pressure settings: averaging time (s) and prediction (PRES-2, PRES-6). */
      pressure: { averagingTime: number; prediction: 'IDEAL' | 'REAL' };
      /**
       * The scenario's statistics view: its plot (a statistic id, when this app knows it),
       * Cumulative, Width and History; and the forget multiplier in use.
       */
      statistics: {
        plot: StatisticId | null;
        cumulative: boolean;
        width: boolean;
        history: boolean;
        forgetMultiplier: number;
      };
    }
  /** About once a second (every SUMMARY_INTERVAL_MS), and after each step. */
  | { type: 'statistics'; summary: StatisticsSummary }
  /** The pressure readout, a few times a second and after each step. */
  | { type: 'pressure'; reading: PressureReading }
  /**
   * Particle counts and temperatures (PART-12, PART-16) and the clock (CTRL-1, s), with the
   * pressure readout. Per species, as `loaded.kinds`.
   */
  | { type: 'census'; time: number; census: Census }
  /**
   * A state snapshot (see `snapshots`). Masses and radii come only with a run's first one,
   * as they don't change within a run; the client fills them in on the others.
   */
  | { type: 'snapshot'; snapshot: SnapshotMessage }
  /** Something the user asked for couldn't be done (a taken spot, no room); the run is fine. */
  | { type: 'notice'; message: string }
  | { type: 'error'; message: string };

/** A snapshot as the worker sends it: masses and radii only with a run's first. */
export type SnapshotMessage = Omit<StateSnapshot, 'masses' | 'radii'> &
  Partial<Pick<StateSnapshot, 'masses' | 'radii'>>;
