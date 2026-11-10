// Main-thread <-> simulation-worker message protocol (mirrors ThreadController.java).
// Frames don't come back here: they stream to the renderer over the `frames` port
// (render/protocol.ts), so the main thread only handles controls and readouts.
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
  | { type: 'step' };

export type FromWorker =
  /** `physicsMs`: wall-clock time the physics took for the latest frame. */
  | { type: 'timing'; physicsMs: number }
  /** A preset finished loading and is now the running simulation. */
  | { type: 'loaded'; preset: string; particles: number }
  /** About once a second (every SUMMARY_EVERY_FRAMES frames), and after each step. */
  | { type: 'statistics'; summary: StatisticsSummary }
  | { type: 'error'; message: string };
