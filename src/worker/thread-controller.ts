// Frame pacing for the simulation worker, after controller/ThreadController.java.
// The Java version runs physics, display and statistics on separate threads guarded by
// semaphores, and advances a fixed slice of simulated time every 37 ms timer tick. Here
// simulated time follows the wall clock instead: each tick (normally once per display
// refresh) advances the physics by the real time elapsed since the last tick, at the
// rate Java's 37 ms frames ran at. Particles move at the same on-screen speed whatever
// the frame rate, and the app draws as often as the display refreshes.
import type { RenderFrame } from '../sim';

/** Real milliseconds per frame in the Java app (ThreadController.FRAME_DURATION). */
export const FRAME_DURATION = 37;

/**
 * Longest stretch of real time one tick may simulate. After a stall (a background tab, a
 * slow frame) the simulation skips ahead at most this much instead of trying to catch up.
 */
export const MAX_TICK_MS = 100;

/** Timer period when the worker has no requestAnimationFrame. */
export const FALLBACK_TICK_MS = 16;

/** The part of the simulation that ThreadController drives (see Simulation). */
export interface FramePhysics {
  /** Simulation time (s) the particles are at. */
  readonly time: number;
  /** Simulation seconds one Java frame advanced: what a single step advances. */
  readonly frameDuration: number;
  advanceToTime(time: number): void;
  snapshot(): RenderFrame;
  stopProcessingCurrentFrame(): void;
}

/** Receives each frame and the wall-clock milliseconds the physics took to produce it. */
export type GiveFrame = (frame: RenderFrame, physicsMs: number) => void;

/** Calls `tick` repeatedly until the returned function is called. */
export type TickSource = (tick: () => void) => () => void;

export interface PacingOptions {
  /** Multiplies the rate simulated time advances at (settings' `simulation_speed`). */
  speed?: number;
  /** The user's extra multiplier on top of `speed` (the sidebar's rate slider); see setRateScale. */
  rateScale?: number;
  /** Milliseconds, monotonic; defaults to performance.now(). */
  now?: () => number;
  /** Defaults to requestAnimationFrame when available, else a FALLBACK_TICK_MS timer. */
  ticks?: TickSource;
}

/** One tick per display refresh where the global scope has requestAnimationFrame. */
export const defaultTickSource: TickSource = (tick) => {
  const scope = globalThis as Partial<AnimationFrameProvider>;
  if (scope.requestAnimationFrame && scope.cancelAnimationFrame) {
    const raf = scope.requestAnimationFrame.bind(globalThis);
    const caf = scope.cancelAnimationFrame.bind(globalThis);
    let handle = 0;
    const loop = () => {
      handle = raf(loop);
      tick();
    };
    handle = raf(loop);
    return () => caf(handle);
  }
  const timer = setInterval(tick, FALLBACK_TICK_MS);
  return () => clearInterval(timer);
};

/** Parses a settings-file speed such as `1x` or `0.5x`; 1 when unreadable. */
export function parseSimulationSpeed(text: string | undefined): number {
  const speed = Number.parseFloat(text ?? '');
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

function validScale(scale: number | undefined): number {
  return scale !== undefined && Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export class ThreadController {
  private readonly physics: FramePhysics;
  private readonly giveFrameToViewForDisplaying: GiveFrame;
  /** Simulated seconds per real millisecond at a rate scale of 1. */
  private readonly baseRate: number;
  /** Simulated seconds per real millisecond. */
  private rate: number;
  private readonly now: () => number;
  private readonly ticks: TickSource;
  private stopTicks: (() => void) | null = null;
  /** Wall-clock time simulated time last caught up to; null until the next tick sets it. */
  private lastTick: number | null = null;
  private paused = false;

  constructor(physics: FramePhysics, giveFrameToView: GiveFrame, options: PacingOptions = {}) {
    this.physics = physics;
    this.giveFrameToViewForDisplaying = giveFrameToView;
    this.baseRate = (physics.frameDuration / FRAME_DURATION) * (options.speed ?? 1);
    this.rate = this.baseRate * validScale(options.rateScale);
    this.now = options.now ?? (() => performance.now());
    this.ticks = options.ticks ?? defaultTickSource;
  }

  startSimulationThreads(): void {
    if (this.stopTicks !== null) return;
    this.lastTick = this.now();
    this.stopTicks = this.ticks(() => this.tick());
  }

  stopSimulationThreads(): void {
    this.stopTicks?.();
    this.stopTicks = null;
  }

  /** Combines Controller.setPaused and ThreadController.setPaused. */
  setPaused(paused: boolean): void {
    if (paused) this.physics.stopProcessingCurrentFrame();
    // Time spent paused isn't simulated: resume from now.
    else if (this.paused) this.lastTick = this.now();
    this.paused = paused;
  }

  /**
   * Multiplies how fast simulated time follows the wall clock (1 = the preset's speed).
   * Takes effect from the next tick; the physics itself is unchanged.
   */
  setRateScale(scale: number): void {
    this.rate = this.baseRate * validScale(scale);
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Advances exactly one Java frame of simulated time. Only while paused, as in the Java UI. */
  advanceOneFrame(): void {
    if (this.paused) this.advanceTo(this.physics.time + this.physics.frameDuration);
  }

  /** Sends the current state to the view without advancing. */
  showCurrentFrame(): void {
    this.giveFrameToViewForDisplaying(this.physics.snapshot(), 0);
  }

  private tick(): void {
    const now = this.now();
    const elapsed = Math.min(now - (this.lastTick ?? now), MAX_TICK_MS);
    this.lastTick = now;
    if (this.paused || elapsed <= 0) return;
    this.advanceTo(this.physics.time + elapsed * this.rate);
  }

  private advanceTo(time: number): void {
    const start = performance.now();
    this.physics.advanceToTime(time);
    const frame = this.physics.snapshot();
    this.giveFrameToViewForDisplaying(frame, performance.now() - start);
  }
}
