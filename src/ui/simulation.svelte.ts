// Main-thread side of the simulation: starts the physics worker and the renderer, wires
// frames from one to the other, and exposes controls and readouts to the UI.
//
// Normally the renderer runs in its own worker on an OffscreenCanvas, and frames go
// physics worker -> render worker directly over a MessageChannel, so the main thread
// only runs the UI. Browsers that can't hand a canvas to a worker draw on the main
// thread instead, fed through the same channel.
import type { Renderer, ViewSize } from '../render';
import type { ColorMode, Dimension } from '../sim';
import type { FromRenderWorker, RenderStream, ToRenderWorker } from '../render/protocol';
import RenderWorker from '../render/render.worker?worker';
import type { StatisticsSummary } from '../stats/summary';
import type { PistonMode } from '../sim/piston';
import type { ArenaInfo, ArenaOptions, FromWorker, PistonInfo, ToWorker } from '../worker';
import SimWorker from '../worker/sim.worker?worker';

export class SimulationClient {
  /** The worker starts running, matching `new PlayPauseButton(false)` in the Java app. */
  paused = $state(false);
  /**
   * Wall-clock milliseconds the physics takes per frame, smoothed over recent frames
   * (browsers time to about 0.1 ms here, so single frames are too coarse to show).
   */
  physicsMs = $state(0);
  /** The user's multiplier on the preset's simulation speed (1 = as the preset sets it). */
  rateScale = $state(1);
  /** Set if the simulation or the renderer failed, or a preset couldn't be loaded. */
  error = $state<string | null>(null);
  /** The preset running now (or being loaded), by file name without `.set`. */
  preset = $state('default');
  /** Particles in the running simulation (0 until it has loaded). */
  particleCount = $state(0);
  /** Dimension of the running simulation (3D views can be turned). */
  dimension = $state<Dimension>(2);
  /** How particles are coloured, and trace mode (the settings file's until changed). */
  colorMode = $state<ColorMode>('NORMAL');
  trace = $state({ enabled: false, pointSize: 2 });
  /** The arena's size in m, and the canvas's in CSS pixels (for the scale bar). */
  arenaSize = $state.raw({ width: 0, height: 0 });
  canvasSize = $state.raw({ width: 0, height: 0 });
  #viewChosen = false;
  /** True while a preset is loading. */
  loading = $state(true);
  /** Arena options the running preset can take, and which are on (null until loaded). */
  arena = $state.raw<ArenaInfo | null>(null);
  /** Piston arenas: limits, and the piston's level and motion as of the latest frame. */
  piston = $state.raw<(PistonInfo & { level: number; moving: boolean }) | null>(null);
  /** Latest statistics from the physics worker (about once a second); null until the first. */
  statistics = $state.raw<StatisticsSummary | null>(null);
  /** Where drawing happens. */
  readonly renderThread: 'worker' | 'main';
  /**
   * Simulated picoseconds per real second, over the last second. Constant while running
   * (the physics follows the wall clock), whatever the frame rate.
   */
  simulatedPsPerSecond = $state(0);
  /** Simulation frames the physics delivered per second, over the last second. */
  simulationFps = $state(0);
  /** Simulation frames the renderer drew per second (frames replaced before a refresh are skipped). */
  drawnFps = $state(0);

  // Per-second rate measurement.
  #framesThisSecond = 0;
  /** Simulation time of the latest frame, and simulated seconds advanced this second. */
  #lastFrameTime = 0;
  #simulatedThisSecond = 0;
  #drawnTotal = 0;
  #drawnAtLastTick = 0;
  #lastTick = performance.now();
  readonly #rateTimer: ReturnType<typeof setInterval>;

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
        if (event.data.type === 'drawn') this.#drawnTotal = event.data.frames;
        else this.error = `Renderer: ${event.data.message}`;
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
      this.canvasSize = { width: next.width, height: next.height };
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
      switch (message.type) {
        case 'timing':
          this.physicsMs += 0.05 * (message.physicsMs - this.physicsMs);
          this.#framesThisSecond++;
          // A newly loaded preset starts again from 0: count only forward progress.
          this.#simulatedThisSecond += Math.max(0, message.time - this.#lastFrameTime);
          this.#lastFrameTime = message.time;
          if (
            message.piston &&
            this.piston &&
            (message.piston.level !== this.piston.level ||
              message.piston.moving !== this.piston.moving)
          ) {
            this.piston = { ...this.piston, ...message.piston };
          }
          break;
        case 'statistics':
          this.statistics = message.summary;
          break;
        case 'loaded':
          this.preset = message.preset;
          this.particleCount = message.particles;
          this.arena = message.arena;
          this.piston = message.piston ? { ...message.piston, level: 0, moving: false } : null;
          this.dimension = message.dimension;
          this.arenaSize = { width: message.view.arenaWidth, height: message.view.arenaHeight };
          if (!this.#viewChosen) {
            this.colorMode = message.view.colorMode;
            this.trace = { ...message.view.trace };
          }
          this.loading = false;
          this.error = null;
          break;
        case 'error':
          this.error = message.message;
          this.loading = false;
          break;
      }
    };
    // `?preset=2Dhotcold` loads a bundled preset instead of default.set.
    const preset = /[?&]preset=([\w-]+)/.exec(location.search)?.[1];
    if (preset) this.preset = preset;
    this.#send({ type: 'connect', frames: channel.port1, preset }, [channel.port1]);
    this.#rateTimer = setInterval(() => this.#updateRates(), 1000);
  }

  /** Replaces the running simulation with a bundled preset, and remembers it in the URL. */
  loadPreset(name: string): void {
    if (name === this.preset && !this.error) return;
    this.preset = name;
    this.loading = true;
    this.#send({ type: 'load', preset: name });
    const query = location.search
      .replace(/^\?/, '')
      .split('&')
      .filter((part) => part && !part.startsWith('preset='));
    if (name !== 'default') query.push(`preset=${name}`);
    history.replaceState(
      null,
      '',
      `${location.pathname}${query.length ? `?${query.join('&')}` : ''}${location.hash}`,
    );
  }

  /** Reloads the running preset with these arena options (the simulation starts over). */
  setArenaOptions(options: ArenaOptions): void {
    this.loading = true;
    this.#send({
      type: 'load',
      preset: this.preset,
      arena: { ...this.arena?.options, ...options },
    });
  }

  /** Piston arenas: start the piston towards `level` (fraction pushed in) at `speed` m/s. */
  movePiston(level: number, mode: PistonMode, speed: number): void {
    this.#send({ type: 'movePiston', level, mode, speed });
  }

  stopPiston(): void {
    this.#send({ type: 'stopPiston' });
  }

  /** Colours particles by type, speed or kinetic energy (kept across presets). */
  setColorMode(mode: ColorMode): void {
    this.#viewChosen = true;
    this.colorMode = mode;
    this.#toRenderer({ type: 'colorMode', mode });
  }

  /** Trace mode: particles leave marks (2D; kept across presets). */
  setTrace(enabled: boolean): void {
    this.#viewChosen = true;
    this.trace = { ...this.trace, enabled };
    this.#toRenderer({ type: 'trace', enabled, pointSize: this.trace.pointSize });
  }

  #toRenderer(message: Extract<ToRenderWorker, { type: 'colorMode' | 'trace' }>): void {
    if (this.#renderWorker) {
      this.#renderWorker.postMessage(message);
    } else if (message.type === 'colorMode') {
      this.#mainRenderer?.setColorMode(message.mode);
    } else {
      this.#mainRenderer?.setTrace(message.enabled, message.pointSize);
    }
  }

  /** 3D: turns the view by these angles about the x and y axes, in degrees. */
  rotate(aboutX: number, aboutY: number): void {
    if (this.#renderWorker) {
      const message: ToRenderWorker = { type: 'rotate', aboutX, aboutY };
      this.#renderWorker.postMessage(message);
    } else {
      this.#mainRenderer?.rotate(aboutX, aboutY);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.#send({ type: paused ? 'pause' : 'play' });
  }

  /** Speeds the simulation up or slows it down relative to the preset's speed. */
  setRateScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.rateScale = scale;
    this.#send({ type: 'rate', scale });
  }

  advanceOneFrame(): void {
    if (this.paused) this.#send({ type: 'step' });
  }

  /** Turns the last second's counts into rates. */
  #updateRates(): void {
    const now = performance.now();
    const seconds = (now - this.#lastTick) / 1000;
    if (this.#mainRenderer) this.#drawnTotal = this.#mainRenderer.framesDrawn();
    this.simulationFps = this.#framesThisSecond / seconds;
    this.drawnFps = Math.max(0, this.#drawnTotal - this.#drawnAtLastTick) / seconds;
    this.simulatedPsPerSecond = (this.#simulatedThisSecond * 1e12) / seconds;
    this.#framesThisSecond = 0;
    this.#simulatedThisSecond = 0;
    this.#drawnAtLastTick = this.#drawnTotal;
    this.#lastTick = now;
  }

  dispose(): void {
    clearInterval(this.#rateTimer);
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
