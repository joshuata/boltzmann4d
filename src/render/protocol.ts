// Messages for the render worker. The physics worker streams frames to the renderer over
// a MessagePort, so they never pass through the main thread; the main thread only sets
// up the canvas and reports size changes.
import type { ColorMode, RenderFrame, SceneInfo } from '../sim';
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
  | { type: 'resize'; size: ViewSize }
  /** 3D: turn the view by these angles, in degrees. */
  | { type: 'rotate'; aboutX: number; aboutY: number }
  /** Colour mode and trace (the View menu). */
  | { type: 'colorMode'; mode: ColorMode }
  | { type: 'trace'; enabled: boolean; pointSize: number };

/** Physics worker -> renderer, over the MessagePort. */
export type RenderStream =
  /** Sent once the simulation is built, before any frame. */
  { type: 'scene'; scene: SceneInfo } | { type: 'frame'; frame: RenderFrame };

/** Render worker -> main thread. */
export type FromRenderWorker =
  | { type: 'error'; message: string }
  /** Sent about once a second: simulation frames drawn so far. */
  | { type: 'drawn'; frames: number };
