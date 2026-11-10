// Main-thread <-> simulation-worker message protocol (mirrors ThreadController.java).
// Frames don't come back here: they stream to the renderer over the `frames` port
// (render/protocol.ts), so the main thread only handles controls and readouts.
import type { Dimension } from '../sim';
import type { StatisticsSummary } from '../stats/summary';

export type ToWorker =
  /**
   * Sent once: where to stream scene and frames, and which preset to load (default.set
   * when absent). The worker starts after this.
   */
  | { type: 'connect'; frames: MessagePort; preset?: string }
  /** Replace the running simulation with a bundled preset (keeps play/pause). */
  | { type: 'load'; preset: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  /** Multiply the preset's simulation speed (kept across preset loads). */
  | { type: 'rate'; scale: number };

export type FromWorker =
  /**
   * Sent with every frame. `physicsMs`: wall-clock time the physics took to produce it;
   * `time`: its simulation time (s).
   */
  | { type: 'timing'; physicsMs: number; time: number }
  /** A preset finished loading and is now the running simulation. */
  | { type: 'loaded'; preset: string; particles: number; dimension: Dimension }
  /** About once a second (every SUMMARY_INTERVAL_MS), and after each step. */
  | { type: 'statistics'; summary: StatisticsSummary }
  | { type: 'error'; message: string };
