// Frame pacing for the simulation worker, ported from controller/ThreadController.java.
// The Java version runs physics, display and statistics on separate threads guarded by
// semaphores. Inside a Worker the physics side collapses to one timer: each tick advances
// one physics frame unless paused, and the main thread's render loop does the displaying.
import type { RenderFrame } from '../sim';

/** Duration of a displayed frame in milliseconds. */
export const FRAME_DURATION = 37;

/** The part of the simulation that ThreadController drives (see Simulation). */
export interface FramePhysics {
  advanceToNextFrame(): void;
  getCurrentFrame(): RenderFrame;
  stopProcessingCurrentFrame(): void;
}

/** Receives each frame and the wall-clock milliseconds the physics took to produce it. */
export type GiveFrame = (frame: RenderFrame, physicsMs: number) => void;

export class ThreadController {
  private readonly physics: FramePhysics;
  private readonly giveFrameToViewForDisplaying: GiveFrame;
  private frameRateTimer: ReturnType<typeof setInterval> | null = null;
  private paused = false;

  constructor(physics: FramePhysics, giveFrameToView: GiveFrame) {
    this.physics = physics;
    this.giveFrameToViewForDisplaying = giveFrameToView;
  }

  startSimulationThreads(): void {
    if (this.frameRateTimer !== null) return;
    this.frameRateTimer = setInterval(() => {
      if (!this.paused) this.advancePhysicsToNextFrame();
    }, FRAME_DURATION);
  }

  stopSimulationThreads(): void {
    if (this.frameRateTimer === null) return;
    clearInterval(this.frameRateTimer);
    this.frameRateTimer = null;
  }

  /** Combines Controller.setPaused and ThreadController.setPaused. */
  setPaused(paused: boolean): void {
    if (paused) this.physics.stopProcessingCurrentFrame();
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Runs exactly one physics frame. Only meaningful while paused, as in the Java UI. */
  advanceOneFrame(): void {
    if (this.paused) this.advancePhysicsToNextFrame();
  }

  private advancePhysicsToNextFrame(): void {
    const start = performance.now();
    this.physics.advanceToNextFrame();
    const physicsMs = performance.now() - start;
    this.giveFrameToViewForDisplaying(this.physics.getCurrentFrame(), physicsMs);
  }
}
