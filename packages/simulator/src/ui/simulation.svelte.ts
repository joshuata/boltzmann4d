// Main-thread side of the simulation: starts the physics worker and the renderer, wires
// frames from one to the other, and exposes controls and readouts to the UI.
//
// Normally the renderer runs in its own worker on an OffscreenCanvas, and frames go
// physics worker -> render worker directly over a MessageChannel, so the main thread
// only runs the UI. Browsers that can't hand a canvas to a worker draw on the main
// thread instead, fed through the same channel.
import type { Renderer, ViewSize } from '../render';
import type { Census, ColorMode, Dimension } from '@boltzmann4d/engine/sim';
import type { FromRenderWorker, RenderStream, ToRenderWorker } from '../render/protocol';
import type { ArenaTheme } from '../render/view';
import RenderWorker from '../render/render.worker?worker';
import type { StatisticsSummary } from '@boltzmann4d/engine/stats/summary';
import type { DistributionId, StatisticId } from '@boltzmann4d/engine/stats/statistic-ids';
import type { PressureReading, PressureRegion } from '@boltzmann4d/engine/stats/pressure';
import type { PistonMode } from '@boltzmann4d/engine/sim/piston';
import type {
  ArenaInfo,
  ArenaOptions,
  BoundaryMode,
  FromWorker,
  KindInfo,
  PistonInfo,
  ScenarioSource,
  SetupKind,
  ToWorker,
} from '../worker';
import SimWorker from '../worker/sim.worker?worker';
import { clampZoom } from './zoom';

/** A plot the statistics area can show: a statistic, or a pressure history by region. */
export type PlotId = StatisticId | `PRESSURE:${PressureRegion}`;

/** A kind's values in the Particles panel that aren't applied yet (PART-15). */
export interface KindDraft {
  /** amu. */
  mass?: number;
  /** nm. */
  radius?: number;
  /** K. */
  temperature?: number;
}

/** Readings kept for the pressure history, like the statistics' history (STAT-20). */
const HISTORY_LENGTH = 150;

export class SimulationClient {
  /** The worker starts running, matching `new PlayPauseButton(false)` in the Java app. */
  paused = $state(false);
  /**
   * Wall-clock milliseconds the physics takes per frame, smoothed over recent frames
   * (browsers time to about 0.1 ms here, so single frames are too coarse to show).
   */
  physicsMs = $state(0);
  /** The user's multiplier on the scenario's simulation speed (1 = as the scenario sets it). */
  rateScale = $state(1);
  /** Set if the simulation or the renderer failed, or a scenario couldn't be loaded. */
  error = $state<string | null>(null);
  /** What is running now (or being loaded). */
  source = $state.raw<ScenarioSource>({ kind: 'preset', name: 'default' });
  /** Particles in the running simulation (0 until it has loaded). */
  particleCount = $state(0);
  /** Dimension of the running simulation (3D views can be turned). */
  dimension = $state<Dimension>(2);
  /** How particles are coloured, and trace mode (the scenario's until changed). */
  colorMode = $state<ColorMode>('NORMAL');
  trace = $state({ enabled: false, pointSize: 2 });
  /** Whether kinds' markers are drawn (KIND-9; the scenario's until changed). */
  markers = $state(true);
  #markersChosen = false;
  /** Light or dark arena (VIEW-1); the viewer sets it from the site's theme. */
  #theme: ArenaTheme = 'dark';
  /** The running simulation's particle kinds, in type order (empty until loaded). */
  kinds = $state.raw<KindInfo[]>([]);
  /** Kinds the statistics show (KIND-4): null for all of them. */
  statKinds = $state.raw<number[] | null>(null);
  /** The arena's size in m, and the canvas's in CSS pixels (for the scale bar). */
  arenaSize = $state.raw({ width: 0, height: 0 });
  canvasSize = $state.raw({ width: 0, height: 0 });
  /** The view's zoom about the arena's centre (CTRL-7): 1 fits the arena. Kept across scenarios. */
  zoom = $state(1);
  #viewChosen = false;
  /** Maxwell's demon: whether the hole is open (null without the demon). */
  holeOpen = $state<boolean | null>(null);
  /** Drawn gates (WALL-4): which wall each is, and whether it's open as of the latest frame. */
  gates = $state.raw<{ index: number; id: string; open: boolean }[]>([]);
  /** True while a scenario is loading. */
  loading = $state(true);
  /** Arena options the running scenario can take, and which are on (null until loaded). */
  arena = $state.raw<ArenaInfo | null>(null);
  /** Piston arenas: limits, and the piston's level and motion as of the latest frame. */
  piston = $state.raw<(PistonInfo & { level: number; moving: boolean }) | null>(null);
  /** Latest statistics from the physics worker (about once a second); null until the first. */
  statistics = $state.raw<StatisticsSummary | null>(null);
  /** Latest pressure readout (a few times a second); null until the first. */
  pressure = $state.raw<PressureReading | null>(null);
  /** The pressure averaging time T_avg, s (OPT-3; the scenario's until changed). */
  pressureAveragingTime = $state(60e-12);
  #averagingChosen = false;
  /** Which pressure prediction is shown (PRES-6; the scenario's until changed). */
  pressurePrediction = $state<'IDEAL' | 'REAL'>('IDEAL');
  #predictionChosen = false;
  /** The most recent pressure readings (oldest first), for the pressure history (STAT-20). */
  pressureHistory = $state.raw<PressureReading[]>([]);
  /**
   * The plot shown (STAT-1): a statistic, or a pressure history (`PRESSURE:arena`, `:left`,
   * `:right`). The scenario's until the user picks one.
   */
  plot = $state<PlotId>('INSTANTANEOUS_SPEED');
  #plotChosen = false;
  /** Cumulative, Width and History views (STAT-13, 15, 20; the scenario's until changed). */
  statView = $state({ cumulative: false, width: false, history: false });
  #statViewChosen = false;
  /** Finite-system corrections to the predictions (PRED-11; kept across scenarios). */
  finiteCorrections = $state(false);
  /** The forget time in predicted collision times (OPT-4; the scenario's until changed). */
  forgetMultiplier = $state(4);
  #forgetChosen = false;
  /** Simulation clock as of the latest frame, s (CTRL-1). */
  time = $state(0);
  /** Particle counts per kind and side, and temperatures (PART-12, PART-16); null until the first. */
  census = $state.raw<Census | null>(null);
  /** Every kind the scenario has, for the Particles panel (empty until loaded). */
  setupKinds = $state.raw<SetupKind[]>([]);
  /** The Particles panel's kind (a scenario kind id): what taps and Add add. */
  selectedKind = $state<string | null>(null);
  /** Values typed into the Particles panel, by kind id, until Restart or Add (PART-15). */
  drafts = $state<Record<string, KindDraft>>({});
  /** The temperature (K) each kind's particles were last added at, by kind id. */
  addTemperatures = $state<Record<string, number>>({});
  /** Why the last add, removal, switch or restart couldn't be done; cleared by the next. */
  notice = $state<string | null>(null);
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

  /** `source`: what to start with (the default preset when absent). */
  constructor(
    canvas: HTMLCanvasElement,
    source: ScenarioSource = { kind: 'preset', name: 'default' },
  ) {
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
      worker.onerror = (event) => {
        this.error = `The renderer stopped unexpectedly${errorDetail(event)}.`;
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
          renderer.setTheme(this.#theme);
          channel.port2.onmessage = (event: MessageEvent<RenderStream>) => {
            if (event.data.type === 'scene') renderer.setScene(event.data.scene);
            else if (event.data.type === 'colorLimits') renderer.setColorLimits(event.data.limits);
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
    this.#sim.onerror = (event) => {
      this.error = `The simulation stopped unexpectedly${errorDetail(event)}.`;
      this.loading = false;
    };
    this.#sim.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data;
      switch (message.type) {
        case 'timing':
          this.physicsMs += 0.05 * (message.physicsMs - this.physicsMs);
          this.#framesThisSecond++;
          // A newly loaded scenario starts again from 0: count only forward progress.
          this.#simulatedThisSecond += Math.max(0, message.time - this.#lastFrameTime);
          this.#lastFrameTime = message.time;
          this.time = message.time;
          if ((message.holeOpen ?? null) !== this.holeOpen) {
            this.holeOpen = message.holeOpen ?? null;
          }
          if (message.openGates && this.gates.length > 0) {
            const open = message.openGates;
            if (this.gates.some((g) => g.open !== open.includes(g.index))) {
              this.gates = this.gates.map((g) => ({ ...g, open: open.includes(g.index) }));
            }
          }
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
        case 'pressure': {
          this.pressure = message.reading;
          const last = this.pressureHistory.at(-1);
          // A restart or a new scenario starts the clock again.
          const kept = last && message.reading.time < last.time ? [] : this.pressureHistory;
          if (!last || message.reading.time !== last.time || kept.length === 0) {
            this.pressureHistory = [...kept, message.reading].slice(-HISTORY_LENGTH);
          }
          break;
        }
        case 'census':
          this.census = message.census;
          break;
        case 'notice':
          this.notice = message.message;
          break;
        case 'loaded':
          this.paused = message.paused;
          this.setupKinds = message.setupKinds;
          if (!message.setupKinds.some((k) => k.id === this.selectedKind)) {
            this.selectedKind = message.setupKinds[0]?.id ?? null;
            this.drafts = {};
          }
          this.loading = false;
          this.error = null;
          if (message.continued) {
            // The same run, edited: keep the user's choices, refresh what changed.
            this.particleCount = message.particles;
            this.arena = message.arena;
            this.kinds = message.kinds;
            if (!message.piston) this.piston = null;
            else if (!this.piston) this.piston = { ...message.piston, level: 0, moving: false };
            if (message.arena.gates.length !== this.gates.length) {
              this.gates = message.arena.gates.map(({ index, id }) => ({ index, id, open: false }));
            }
            break;
          }
          this.census = null;
          this.drafts = {};
          this.addTemperatures = {};
          this.particleCount = message.particles;
          this.arena = message.arena;
          this.gates = message.arena.gates.map(({ index, id }) => ({ index, id, open: false }));
          this.piston = message.piston ? { ...message.piston, level: 0, moving: false } : null;
          this.dimension = message.dimension;
          this.kinds = message.kinds;
          this.statKinds = null; // the worker forgets the picked kinds on each load
          if (!this.#markersChosen) {
            this.markers = message.view.markers;
            this.#toRenderer({ type: 'markers', enabled: this.markers });
          }
          this.arenaSize = { width: message.view.arenaWidth, height: message.view.arenaHeight };
          this.pressureAveragingTime = message.pressure.averagingTime;
          this.pressureHistory = [];
          this.forgetMultiplier = message.statistics.forgetMultiplier;
          if (!this.#plotChosen) this.plot = message.statistics.plot ?? 'INSTANTANEOUS_SPEED';
          if (!this.#statViewChosen) {
            const { cumulative, width, history } = message.statistics;
            this.statView = { cumulative, width, history };
          }
          if (!this.#predictionChosen) {
            this.pressurePrediction = message.pressure.prediction;
            this.#send({ type: 'statOptions', realGas: this.pressurePrediction === 'REAL' });
          }
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
    this.source = source;
    this.#send({ type: 'connect', frames: channel.port1, source: cloneable(source) }, [
      channel.port1,
    ]);
    this.#rateTimer = setInterval(() => this.#updateRates(), 1000);
  }

  /** Replaces the running simulation; does nothing if `source` is already running. */
  load(source: ScenarioSource): void {
    if (sameSource(source, this.source) && !this.error) return;
    this.source = source;
    this.loading = true;
    this.#averagingChosen = false; // a new scenario brings its own averaging time
    this.#forgetChosen = false; // ... and forget time
    this.#send({ type: 'load', source: cloneable(source), fresh: true });
  }

  /** Reloads the running scenario with these arena options (the simulation starts over). */
  setArenaOptions(options: ArenaOptions): void {
    this.loading = true;
    this.#send({
      type: 'load',
      source: cloneable(this.source),
      arena: { ...this.arena?.options, ...options },
      pressureAveragingTime: this.#averagingChosen ? this.pressureAveragingTime : undefined,
      forgetMultiplier: this.#forgetChosen ? this.forgetMultiplier : undefined,
    });
  }

  /** The pressure averaging time T_avg, s (OPT-3). The readout warms up again. */
  setPressureAveragingTime(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.#averagingChosen = true;
    this.pressureAveragingTime = seconds;
    this.#send({ type: 'pressureAveragingTime', seconds });
  }

  /** Shows the Ideal or Real pressure prediction (PRES-6; kept across scenarios). */
  setPressurePrediction(prediction: 'IDEAL' | 'REAL'): void {
    this.#predictionChosen = true;
    this.pressurePrediction = prediction;
    // The same choice applies to the path, time and rate predictions (STAT-14).
    this.#send({ type: 'statOptions', realGas: prediction === 'REAL' });
  }

  /** Picks the plot shown (STAT-1; kept across scenarios that offer it). */
  setPlot(plot: PlotId): void {
    this.#plotChosen = true;
    this.plot = plot;
    if (!plot.startsWith('PRESSURE:')) this.#send({ type: 'statistic', id: plot as StatisticId });
  }

  /** Cumulative, Width or History on or off (kept across scenarios). */
  setStatView(view: Partial<SimulationClient['statView']>): void {
    this.#statViewChosen = true;
    this.statView = { ...this.statView, ...view };
  }

  /** One of a plot's axis limits (STAT-8–10): clears that plot's cumulative data. */
  setStatLimit(id: DistributionId, edge: 'min' | 'max', value: number): void {
    if (!Number.isFinite(value)) return;
    this.#send({ type: 'statLimit', id, edge, value });
  }

  /** Finite-system corrections to the predictions on or off (PRED-11). */
  setFiniteCorrections(on: boolean): void {
    this.finiteCorrections = on;
    this.#send({ type: 'statOptions', finite: on });
  }

  /** The forget time, in predicted collision times (OPT-4). */
  setForgetMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier < 0) return;
    this.#forgetChosen = true;
    this.forgetMultiplier = multiplier;
    this.#send({ type: 'forgetMultiplier', value: multiplier });
  }

  /** Piston arenas: start the piston towards `level` (fraction pushed in) at `speed` m/s. */
  movePiston(level: number, mode: PistonMode, speed: number): void {
    this.#send({ type: 'movePiston', level, mode, speed });
  }

  stopPiston(): void {
    this.#send({ type: 'stopPiston' });
  }

  /**
   * Restart (CTRL-3, PART-14): every particle placed anew at random and the clock at zero,
   * each kind with its present count and the Particles panel's pending values.
   */
  restart(): void {
    this.notice = null;
    const kinds = this.setupKinds.flatMap((kind) => {
      const draft = this.drafts[kind.id];
      if (!draft) return [];
      const species = kind.species;
      const present = species >= 0 ? this.census?.temperatures[species] : undefined;
      return [
        {
          kind: kind.id,
          mass: draft.mass ?? kind.mass,
          radius: draft.radius ?? kind.radius,
          temperature: draft.temperature ?? present ?? kind.temperature,
        },
      ];
    });
    this.drafts = {};
    this.#send({ type: 'restart', kinds });
  }

  /** Edits a kind's pending values in the Particles panel; undefined fields stop pending. */
  setDraft(kind: string, draft: KindDraft): void {
    const next = { ...this.drafts[kind], ...draft };
    for (const key of Object.keys(next) as (keyof KindDraft)[]) {
      if (next[key] === undefined) delete next[key];
    }
    const drafts = { ...this.drafts };
    if (Object.keys(next).length > 0) drafts[kind] = next;
    else delete drafts[kind];
    this.drafts = drafts;
  }

  /**
   * The temperature (K) the next particles of `kind` are added at: the panel's pending one,
   * else the last one used, else the scenario's for the kind.
   */
  addTemperature(kind: string): number {
    return (
      this.drafts[kind]?.temperature ??
      this.addTemperatures[kind] ??
      this.setupKinds.find((k) => k.id === kind)?.temperature ??
      300
    );
  }

  /** Uses up the pending temperature of `kind` for an add (PART-15). */
  #useTemperature(kind: string): number {
    const temperature = this.addTemperature(kind);
    this.addTemperatures = { ...this.addTemperatures, [kind]: temperature };
    this.setDraft(kind, { temperature: undefined });
    return temperature;
  }

  /**
   * Adds a particle of the selected kind (PART-7, PART-8) at the panel's temperature: at a
   * point (2D, m), or at random. The run carries on.
   */
  addParticle(at?: [number, number]): void {
    const kind = this.selectedKind;
    if (!kind) return;
    this.notice = null;
    const temperature = this.#useTemperature(kind);
    this.#send({ type: 'addParticle', kind, at, temperature });
  }

  /**
   * Sets the selected kind's number of particles (PART-1, 8, 9): new ones at random at the
   * panel's temperature, or the newest removed.
   */
  setCount(count: number): void {
    const kind = this.selectedKind;
    if (!kind || !Number.isFinite(count)) return;
    this.notice = null;
    const temperature = this.#useTemperature(kind);
    this.#send({ type: 'setCount', kind, count, temperature });
  }

  /** Removes the selected kind's newest particle (PART-9). */
  removeParticle(): void {
    if (!this.selectedKind) return;
    this.notice = null;
    this.#send({ type: 'removeParticle', kind: this.selectedKind });
  }

  /** Switches the boundary mode (SIM-12–16); some switches restart (see the worker). */
  setBoundary(boundary: BoundaryMode): void {
    this.notice = null;
    this.#send({ type: 'setBoundary', boundary });
  }

  /** Maxwell's demon: opens or closes the hole (from the next frame). */
  /** Opens or closes a drawn gate, by wall index (from the next frame). */
  setGate(index: number, open: boolean): void {
    this.#send({ type: 'setGate', index, open });
  }

  setHoleOpen(open: boolean): void {
    this.#send({ type: 'setHoleOpen', open });
  }

  /** Colours particles by type, speed or kinetic energy (kept across scenarios). */
  setColorMode(mode: ColorMode): void {
    this.#viewChosen = true;
    this.colorMode = mode;
    this.#toRenderer({ type: 'colorMode', mode });
  }

  /** Trace mode (VIEW-5): particles leave a dot each frame (kept across scenarios). */
  setTrace(enabled: boolean): void {
    this.#viewChosen = true;
    this.trace = { ...this.trace, enabled };
    this.#toRenderer({ type: 'trace', enabled, pointSize: this.trace.pointSize });
  }

  /** Erases the trace drawn so far (VIEW-5); tracing carries on. */
  clearTrace(): void {
    if (this.#renderWorker) {
      const message: ToRenderWorker = { type: 'clearTrace' };
      this.#renderWorker.postMessage(message);
    } else {
      this.#mainRenderer?.clearTrace();
    }
  }

  /** Kinds' markers on or off (kept across scenarios). */
  setMarkers(enabled: boolean): void {
    this.#markersChosen = true;
    this.markers = enabled;
    this.#toRenderer({ type: 'markers', enabled });
  }

  /** Which kinds the statistics show (KIND-4): type indices, or null for all. */
  setStatKinds(types: number[] | null): void {
    this.statKinds = types;
    this.#send({ type: 'statKinds', types });
  }

  /** Light or dark arena (VIEW-1). */
  setTheme(theme: ArenaTheme): void {
    this.#theme = theme;
    this.#toRenderer({ type: 'theme', theme });
  }

  #toRenderer(
    message: Extract<ToRenderWorker, { type: 'colorMode' | 'trace' | 'markers' | 'theme' }>,
  ): void {
    if (this.#renderWorker) {
      this.#renderWorker.postMessage(message);
      return;
    }
    const renderer = this.#mainRenderer;
    if (!renderer) return;
    switch (message.type) {
      case 'colorMode':
        renderer.setColorMode(message.mode);
        break;
      case 'markers':
        renderer.setMarkers(message.enabled);
        break;
      case 'theme':
        renderer.setTheme(message.theme);
        break;
      case 'trace':
        renderer.setTrace(message.enabled, message.pointSize);
        break;
    }
  }

  /** Magnifies the view about the arena's centre (CTRL-7); clamped to 33%–1600%. */
  setZoom(zoom: number): void {
    this.zoom = clampZoom(zoom);
    if (this.#renderWorker) {
      const message: ToRenderWorker = { type: 'zoom', zoom: this.zoom };
      this.#renderWorker.postMessage(message);
    } else {
      this.#mainRenderer?.setZoom(this.zoom);
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

  /** Speeds the simulation up or slows it down relative to the scenario's speed. */
  setRateScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.rateScale = scale;
    this.#send({ type: 'rate', scale });
  }

  /**
   * Reverse (SIM-32, CTRL-6): flips every velocity so the motion retraces itself, until
   * chaos takes over. Works while running or paused.
   */
  reverse(): void {
    this.#send({ type: 'reverse' });
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

/** A worker's uncaught error as ": message", or nothing if the browser gives none. */
function errorDetail(event: ErrorEvent): string {
  return event.message ? `: ${event.message}` : '';
}

function viewSize(canvas: HTMLCanvasElement): ViewSize {
  return {
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    pixelRatio: window.devicePixelRatio,
  };
}

/** Presets match by name; supplied scenarios only when they are the same object. */
function sameSource(a: ScenarioSource, b: ScenarioSource): boolean {
  if (a.kind === 'preset' || b.kind === 'preset') {
    return a.kind === b.kind && a.name === b.name;
  }
  return a.scenario === b.scenario;
}

/** A copy postMessage can clone (pages may pass reactive proxies). */
const cloneable = (source: ScenarioSource): ScenarioSource => $state.snapshot(source);
