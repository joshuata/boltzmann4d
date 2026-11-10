// Main-thread side of the simulation: starts the physics worker and the renderer, wires
// frames from one to the other, and exposes controls and readouts to the UI.
//
// Normally the renderer runs in its own worker on an OffscreenCanvas, and frames go
// physics worker -> render worker directly over a MessageChannel, so the main thread
// only runs the UI. Browsers that can't hand a canvas to a worker draw on the main
// thread instead, fed through the same channel.
import type { Renderer, ViewSize } from '../render';
import type { FromRenderWorker, RenderStream, ToRenderWorker } from '../render/protocol';
import RenderWorker from '../render/render.worker?worker';
import type { FromWorker, ToWorker } from '../worker';
import SimWorker from '../worker/sim.worker?worker';

export class SimulationClient {
  /** The worker starts running, matching `new PlayPauseButton(false)` in the Java app. */
  paused = $state(false);
  /**
   * Wall-clock milliseconds the physics takes per frame, smoothed over recent frames
   * (browsers time to about 0.1 ms here, so single frames are too coarse to show).
   */
  physicsMs = $state(0);
  /** Set if the simulation or the renderer failed to start. */
  error = $state<string | null>(null);
  /** Where drawing happens. */
  readonly renderThread: 'worker' | 'main';

  readonly #sim: Worker;
  readonly #renderWorker: Worker | null = null;
  #mainRenderer: Renderer | null = null;
  #disposed = false;
  readonly #resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    const channel = new MessageChannel();
    const size = () => viewSize(canvas);

    // `?render=main` forces main-thread drawing, for comparison and to exercise the fallback.
    const forceMain = /[?&]render=main(&|$)/.test(location.search);
    if (!forceMain && 'transferControlToOffscreen' in canvas) {
      this.renderThread = 'worker';
      const offscreen = canvas.transferControlToOffscreen();
      const worker = new RenderWorker();
      worker.onmessage = (event: MessageEvent<FromRenderWorker>) => {
        this.error = `Renderer: ${event.data.message}`;
      };
      const init: ToRenderWorker = {
        type: 'init',
        canvas: offscreen,
        size: size(),
        frames: channel.port2,
      };
      worker.postMessage(init, [offscreen, channel.port2]);
      this.#renderWorker = worker;
    } else {
      // Fallback: load Three.js into the main thread only when it's needed. Messages on
      // the port queue until the handler is attached.
      this.renderThread = 'main';
      import('../render')
        .then(({ createRenderer }) => {
          if (this.#disposed) return;
          const renderer = createRenderer(canvas, size());
          channel.port2.onmessage = (event: MessageEvent<RenderStream>) => {
            if (event.data.type === 'scene') renderer.setScene(event.data.scene);
            else renderer.setNextFrameToDisplay(event.data.frame);
          };
          this.#mainRenderer = renderer;
        })
        .catch((error: unknown) => {
          this.error = `Renderer: ${error instanceof Error ? error.message : String(error)}`;
        });
    }

    this.#resizeObserver = new ResizeObserver(() => {
      const next = size();
      if (this.#renderWorker) {
        const message: ToRenderWorker = { type: 'resize', size: next };
        this.#renderWorker.postMessage(message);
      } else {
        this.#mainRenderer?.setSize(next);
      }
    });
    this.#resizeObserver.observe(canvas);

    this.#sim = new SimWorker();
    this.#sim.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data;
      if (message.type === 'timing') this.physicsMs += 0.05 * (message.physicsMs - this.physicsMs);
      else this.error = message.message;
    };
    // `?preset=2Dhotcold` loads a bundled preset instead of default.set.
    const preset = /[?&]preset=([\w-]+)/.exec(location.search)?.[1];
    this.#send({ type: 'connect', frames: channel.port1, preset }, [channel.port1]);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.#send({ type: paused ? 'pause' : 'play' });
  }

  advanceOneFrame(): void {
    if (this.paused) this.#send({ type: 'step' });
  }

  dispose(): void {
    this.#disposed = true;
    this.#resizeObserver.disconnect();
    this.#sim.terminate();
    this.#renderWorker?.terminate();
    this.#mainRenderer?.dispose();
  }

  #send(message: ToWorker, transfer: Transferable[] = []): void {
    this.#sim.postMessage(message, transfer);
  }
}

function viewSize(canvas: HTMLCanvasElement): ViewSize {
  return {
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    pixelRatio: window.devicePixelRatio,
  };
}
