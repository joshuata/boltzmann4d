// Main-thread <-> simulation-worker message protocol (mirrors ThreadController.java).
import type { RenderFrame, SceneInfo } from '../sim';

export type ToWorker = { type: 'play' } | { type: 'pause' } | { type: 'step' };

export type FromWorker =
  /** Sent once the simulation is built, before any frame. */
  | { type: 'scene'; scene: SceneInfo }
  /** `physicsMs`: wall-clock time the physics took for this frame. */
  | { type: 'frame'; frame: RenderFrame; physicsMs: number }
  | { type: 'error'; message: string };
