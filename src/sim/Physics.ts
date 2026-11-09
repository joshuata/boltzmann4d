import type { Dimension, RenderFrame } from './index';

export interface StubPhysicsOptions {
  particleCount?: number;
  seed?: number;
}

/** Small seeded PRNG so stub runs are reproducible in tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * STUB standing in for Physics.java until the event-driven port lands (plan 0001, step 2).
 *
 * It only mirrors the frame API that ThreadController drives: `advanceToNextFrame`,
 * `getCurrentFrame` and `stopProcessingCurrentFrame`. Particles fly freely in a unit
 * square centred on the origin and reflect off the walls; there are no particle–particle
 * collisions and the units are arbitrary. Replace the internals, not the API.
 */
export class Physics {
  /** Simulation time per frame, in stub units (the Java value is 0.404706830433e-12 s). */
  static readonly DEFAULT_FRAME_DURATION = 0.037;
  static readonly PARTICLE_RADIUS = 0.03;

  private readonly dimension: Dimension = 2;
  private readonly positions: Float64Array;
  private readonly velocities: Float64Array;
  private readonly types: Uint16Array;
  private frameDuration = Physics.DEFAULT_FRAME_DURATION;
  private currSimTime = 0;
  private firstRun = true;
  private currentFrame: RenderFrame | null = null;

  constructor({ particleCount = 24, seed = 1 }: StubPhysicsOptions = {}) {
    const random = mulberry32(seed);
    const limit = 0.5 - Physics.PARTICLE_RADIUS;
    const n = particleCount * this.dimension;
    this.positions = new Float64Array(n);
    this.velocities = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.positions[i] = (random() * 2 - 1) * limit;
      this.velocities[i] = (random() * 2 - 1) * 0.4;
    }
    this.types = Uint16Array.from({ length: particleCount }, (_, i) => i % 2);
  }

  createFirstFrame(): void {
    this.currentFrame = this.snapshot();
  }

  advanceToNextFrame(): void {
    if (this.firstRun) {
      this.firstRun = false;
      this.createFirstFrame();
    } else {
      this.advanceToTime(this.currSimTime + this.frameDuration);
      this.currentFrame = this.snapshot();
    }
  }

  getCurrentFrame(): RenderFrame {
    if (!this.currentFrame) throw new Error('advanceToNextFrame() has not been called yet');
    return this.currentFrame;
  }

  stopProcessingCurrentFrame(): void {
    // Stub frames run synchronously inside the worker, so a pause can't arrive mid-frame.
    // Kept for API parity with Physics.java, where frames can be cut short.
  }

  getTime(): number {
    return this.currSimTime;
  }

  getFrameDuration(): number {
    return this.frameDuration;
  }

  private advanceToTime(time: number): void {
    const dt = time - this.currSimTime;
    const limit = 0.5 - Physics.PARTICLE_RADIUS;
    for (let i = 0; i < this.positions.length; i++) {
      let x = (this.positions[i] ?? 0) + (this.velocities[i] ?? 0) * dt;
      while (Math.abs(x) > limit) {
        x = Math.sign(x) * 2 * limit - x;
        this.velocities[i] = -(this.velocities[i] ?? 0);
      }
      this.positions[i] = x;
    }
    this.currSimTime = time;
  }

  /** Fresh arrays each frame so the worker can transfer them without copying. */
  private snapshot(): RenderFrame {
    return {
      dimension: this.dimension,
      time: this.currSimTime,
      positions: this.positions.slice(),
      types: this.types.slice(),
    };
  }
}
