import * as THREE from 'three';
import type { ColorLimits, ColorMode, RenderFrame, SceneInfo } from '@boltzmann4d/engine/sim';
import type { View } from './view';
import { createView2D } from './view-2d';
import { createView3D } from './view-3d';

/** Drawing-buffer size: CSS pixels plus the device pixel ratio. */
export interface ViewSize {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface Renderer {
  /** Sets up the arena and particles; call before frames arrive (and again on reload). */
  setScene(scene: SceneInfo): void;
  /** The canvas's on-screen size changed. */
  setSize(size: ViewSize): void;
  /** Queues a frame; it is drawn on the next animation tick (MainGuiView.setNextFrameToDisplay). */
  setNextFrameToDisplay(frame: RenderFrame): void;
  /** 3D: turns the view about the x and y axes by these angles in degrees. */
  rotate(aboutX: number, aboutY: number): void;
  /** How particles are coloured (View menu: Normal, Speed, Kinetic energy). */
  setColorMode(mode: ColorMode): void;
  /** The Color by Speed / KE limits (VIEW-4; the physics worker sends them). */
  setColorLimits(limits: ColorLimits): void;
  /** Trace mode (VIEW-5): accumulate a dot of `pointSize` pixels per particle per frame. */
  setTrace(enabled: boolean, pointSize: number): void;
  /** Erases the trace drawn so far. */
  clearTrace(): void;
  /** Whether kinds' markers are drawn (KIND-9; 2D). */
  setMarkers(enabled: boolean): void;
  /** Simulation frames drawn so far (frames replaced before a refresh aren't counted). */
  framesDrawn(): number;
  dispose(): void;
}

// Schedules a draw for the next display refresh. Dedicated workers have
// requestAnimationFrame in current browsers; fall back to a ~60 Hz timer.
const requestDraw: (draw: () => void) => void =
  typeof requestAnimationFrame === 'function'
    ? (draw) => void requestAnimationFrame(draw)
    : (draw) => void setTimeout(draw, 16);

/**
 * Draws the simulation: a 1D/2D view (view-2d.ts) or a 3D one (view-3d.ts), following
 * boltzmann3d docs/rendering-baseline.md.
 *
 * Uses no DOM APIs, so it runs on an OffscreenCanvas in the render worker as well as on
 * the main thread. It only draws when something changed (a frame, the scene, the size or
 * the view), at most once per display refresh.
 */
export function createRenderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  initialSize: ViewSize,
): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  let view: View | null = null;
  let colorMode: ColorMode | null = null;
  let trace: { enabled: boolean; pointSize: number } | null = null;
  let markers: boolean | null = null;
  let nextFrame: RenderFrame | null = null;
  let size = initialSize;
  let drawScheduled = false;
  let drawnCount = 0;
  let disposed = false;

  const fit = () => {
    const { width: w, height: h } = size;
    renderer.setPixelRatio(size.pixelRatio);
    renderer.setSize(w, h, false);
    view?.fit(w / h || 1);
  };

  const draw = () => {
    drawScheduled = false;
    if (disposed || !view) return;
    if (nextFrame) {
      view.display(nextFrame);
      nextFrame = null;
      drawnCount++;
    }
    view.beforeRender?.(renderer);
    renderer.render(scene, view.camera);
  };
  const scheduleDraw = () => {
    if (drawScheduled || disposed) return;
    drawScheduled = true;
    requestDraw(draw);
  };

  fit();

  return {
    setScene(info) {
      if (view) {
        scene.remove(view.root);
        view.dispose();
      }
      view = info.dimension === 3 ? createView3D(info) : createView2D(info);
      // The user's choices outlast a reload; until they make one, the settings file's.
      if (colorMode) view.setColorMode(colorMode);
      if (trace) view.setTrace(trace.enabled, trace.pointSize);
      if (markers !== null) view.setMarkers?.(markers);
      scene.add(view.root);
      nextFrame = null;
      fit();
      scheduleDraw();
    },
    setSize(next) {
      size = next;
      fit();
      scheduleDraw();
    },
    setNextFrameToDisplay(frame) {
      nextFrame = frame; // only the latest frame is drawn if several arrive between refreshes
      scheduleDraw();
    },
    rotate(aboutX, aboutY) {
      view?.rotate(aboutX, aboutY);
      scheduleDraw();
    },
    setColorMode(mode) {
      colorMode = mode;
      view?.setColorMode(mode);
      scheduleDraw();
    },
    setColorLimits(limits) {
      view?.setColorLimits?.(limits);
      scheduleDraw();
    },
    setTrace(enabled, pointSize) {
      trace = { enabled, pointSize };
      view?.setTrace(enabled, pointSize);
      scheduleDraw();
    },
    clearTrace() {
      view?.clearTrace();
      scheduleDraw();
    },
    setMarkers(enabled) {
      markers = enabled;
      view?.setMarkers?.(enabled);
      scheduleDraw();
    },
    framesDrawn: () => drawnCount,
    dispose() {
      disposed = true;
      view?.dispose();
      renderer.dispose();
    },
  };
}
