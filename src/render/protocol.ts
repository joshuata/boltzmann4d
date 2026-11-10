// Messages for the render worker. The physics worker streams frames to the renderer over
// a MessagePort, so they never pass through the main thread; the main thread only sets
// up the canvas and reports size changes.
import type { RenderFrame, SceneInfo } from '../sim';
import type { ViewSize } from './index';

/** Main thread -> render worker. */
export type ToRenderWorker =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      size: ViewSize;
      /** Receives the physics worker's RenderStream messages. */
      frames: MessagePort;
    }
  | { type: 'resize'; size: ViewSize };

/** Physics worker -> renderer, over the MessagePort. */
export type RenderStream =
  /** Sent once the simulation is built, before any frame. */
  { type: 'scene'; scene: SceneInfo } | { type: 'frame'; frame: RenderFrame };

/** Render worker -> main thread. */
export type FromRenderWorker = { type: 'error'; message: string };
