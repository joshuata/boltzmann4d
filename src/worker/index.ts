// Main-thread <-> simulation-worker message protocol (mirrors ThreadController.java).
// Frames don't come back here: they stream to the renderer over the `frames` port
// (render/protocol.ts), so the main thread only handles controls and readouts.
import type { PistonMode } from '../sim/piston';
import type { StatisticsSummary } from '../stats/summary';

/**
 * Changes to a preset's arena that keep its particle placement valid: a reflecting arena
 * can get the movable piston, and a divided arena's divider can conduct heat.
 */
export interface ArenaOptions {
  piston?: boolean;
  conductingDivider?: boolean;
  /**
   * Attractive square wells between particles (non-periodic arenas): radius as a multiple
   * of the contact distance, and each species' depth in kJ/mol. null turns them off.
   */
  wells?: { radiusMultiplier: number; depths: number[] } | null;
}

/** What the sidebar needs to offer a piston arena's controls. */
export interface PistonInfo {
  /** Highest level the piston may be pushed to (fraction of the arena height). */
  maxLevel: number;
  /** Arena height, m. */
  arenaHeight: number;
}

/** Which arena options a loaded preset can take, and which are on. */
export interface ArenaInfo {
  canHavePiston: boolean;
  canConduct: boolean;
  /** Square wells work in every arena but periodic ones (as in Java). */
  canHaveWells: boolean;
  /** Species names, for per-species settings. */
  typeNames: string[];
  options: ArenaOptions;
}

export type ToWorker =
  /**
   * Sent once: where to stream scene and frames, and which preset to load (default.set
   * when absent). The worker starts after this.
   */
  | { type: 'connect'; frames: MessagePort; preset?: string; arena?: ArenaOptions }
  /** Replace the running simulation with a bundled preset (keeps play/pause). */
  | { type: 'load'; preset: string; arena?: ArenaOptions }
  /** Piston arenas: start the piston towards `level` (fraction pushed in) at `speed` m/s. */
  | { type: 'movePiston'; level: number; mode: PistonMode; speed: number }
  | { type: 'stopPiston' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' };

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
    }
  /** A preset finished loading and is now the running simulation. */
  | {
      type: 'loaded';
      preset: string;
      particles: number;
      arena: ArenaInfo;
      piston?: PistonInfo;
    }
  /** About once a second (every SUMMARY_INTERVAL_MS), and after each step. */
  | { type: 'statistics'; summary: StatisticsSummary }
  | { type: 'error'; message: string };
