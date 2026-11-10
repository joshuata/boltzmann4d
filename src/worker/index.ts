// Main-thread <-> simulation-worker message protocol (mirrors ThreadController.java).
// Frames don't come back here: they stream to the renderer over the `frames` port
// (render/protocol.ts), so the main thread only handles controls and readouts.

export type ToWorker =
  /**
   * Sent once: where to stream scene and frames, and which preset to load (default.set
   * when absent). The worker starts after this.
   */
  | { type: 'connect'; frames: MessagePort; preset?: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' };

export type FromWorker =
  /** `physicsMs`: wall-clock time the physics took for the latest frame. */
  { type: 'timing'; physicsMs: number } | { type: 'error'; message: string };
