// Messages for the render worker. The physics worker streams frames to the renderer over
// a MessagePort, so they never pass through the main thread; the main thread only sets
// up the canvas and reports size changes.
import type { ColorLimits, ColorMode, RenderFrame, SceneInfo } from '@boltzmann4d/engine/sim';
import type { ViewSize } from './index';
import type { ArenaTheme } from './view';

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
  | { type: 'trace'; enabled: boolean; pointSize: number }
  /** Erase the trace drawn so far (VIEW-5). */
  | { type: 'clearTrace' }
  /** Kinds' markers on or off (KIND-9). */
  | { type: 'markers'; enabled: boolean }
  /** Light or dark arena (VIEW-1), following the site's theme. */
  | { type: 'theme'; theme: ArenaTheme };

/** Physics worker -> renderer, over the MessagePort. */
export type RenderStream =
  /** Sent once the simulation is built, before any frame. */
  | { type: 'scene'; scene: SceneInfo }
  | { type: 'frame'; frame: RenderFrame }
  /** The Color by Speed / KE limits changed (the plots' axis limits, VIEW-4). */
  | { type: 'colorLimits'; limits: ColorLimits };

/** Render worker -> main thread. */
export type FromRenderWorker =
  | { type: 'error'; message: string }
  /** Sent about once a second: simulation frames drawn so far. */
  | { type: 'drawn'; frames: number };
