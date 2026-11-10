// Main-thread <-> simulation-worker message protocol (mirrors ThreadController.java).
// Frames don't come back here: they stream to the renderer over the `frames` port
// (render/protocol.ts), so the main thread only handles controls and readouts.
import type { PistonMode } from '@boltzmann4d/engine/sim/piston';
import type { ColorMode, Dimension } from '@boltzmann4d/engine/sim';
import type { StatisticsSummary } from '@boltzmann4d/engine/stats/summary';
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
  options: ArenaOptions;
}

export type ToWorker =
  /**
   * Sent once: where to stream scene and frames, and what to run (the default preset when
   * absent). The worker starts after this.
   */
  | { type: 'connect'; frames: MessagePort; source?: ScenarioSource; arena?: ArenaOptions }
  /** Replace the running simulation (keeps play/pause). */
  | { type: 'load'; source: ScenarioSource; arena?: ArenaOptions }
  /** Piston arenas: start the piston towards `level` (fraction pushed in) at `speed` m/s. */
  | { type: 'movePiston'; level: number; mode: PistonMode; speed: number }
  | { type: 'stopPiston' }
  /** Back to the starting state of the running simulation (same positions). */
  | { type: 'restart' }
  /** Maxwell's demon: open or close the hole (from the next frame). */
  | { type: 'setHoleOpen'; open: boolean }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  /** Multiply the scenario's simulation speed (kept across loads). */
  | { type: 'rate'; scale: number }
  /**
   * The kinds (species indices) the statistics should also cover (KIND-4), when they
   * aren't a set tracked anyway; null for none. Reset by each load.
   */
  | { type: 'statKinds'; types: number[] | null };

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
    }
  /** A scenario finished loading and is now the running simulation. */
  | {
      type: 'loaded';
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
    }
  /** About once a second (every SUMMARY_INTERVAL_MS), and after each step. */
  | { type: 'statistics'; summary: StatisticsSummary }
  | { type: 'error'; message: string };
