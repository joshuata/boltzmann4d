import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Simulation } from '@boltzmann4d/engine/sim';
import type { RenderFrame } from '@boltzmann4d/engine/sim';
import { ArenaType } from '@boltzmann4d/engine/sim/simulation-info';
import {
  FRAME_DURATION,
  MAX_TICK_MS,
  parseSimulationSpeed,
  ThreadController,
  type PacingOptions,
} from './thread-controller';

/**
 * Two particles bouncing in a small box. A frame is FRAME_DURATION simulation seconds, so
 * simulated time advances one second per real millisecond.
 */
function smallSimulation(): Simulation {
  return new Simulation(
    {
      dimension: 2,
      arenaType: ArenaType.REFLECTING_BOUNDARIES,
      arenaXSize: 10,
      arenaYSize: 10,
      arenaZSize: 0,
      species: [
        {
          type: { particleMass: 1, particleRadius: 0.5 },
          positions: new Float64Array([2, 2, 0, 7, 6, 0]),
          velocities: new Float64Array([1, 0.5, 0, -0.5, 1, 0]),
        },
      ],
    },
    { frameDuration: FRAME_DURATION },
  );
}
/** A fake clock and a tick source driven by hand. */
class FakeDisplay {
  now = 0;
  private tick: (() => void) | null = null;
  readonly options: PacingOptions = {
    now: () => this.now,
    ticks: (tick) => {
      this.tick = tick;
      return () => (this.tick = null);
    },
  };

  /** Runs `ms` of real time, ticking every `period` ms. */
  run(ms: number, period: number): void {
    for (let n = Math.round(ms / period); n > 0; n--) {
      this.now += period;
      this.tick?.();
    }
  }
}

describe('ThreadController', () => {
  let frames: RenderFrame[];
  let physics: Simulation;
  let display: FakeDisplay;
  let controller: ThreadController;

  const start = (options: PacingOptions = {}) => {
    frames = [];
    physics = smallSimulation();
    display = new FakeDisplay();
    controller = new ThreadController(physics, (frame) => frames.push(frame), {
      ...display.options,
      ...options,
    });
    controller.startSimulationThreads();
  };
  const lastTime = () => frames.at(-1)?.time ?? 0;

  beforeEach(() => start());
  afterEach(() => controller.stopSimulationThreads());

  it('advances simulated time with the wall clock, one frame per tick', () => {
    display.run(100, 10);
    expect(frames.map((f) => f.time)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('keeps the Java app speed: one frame of simulated time per FRAME_DURATION ms', () => {
    display.run(FRAME_DURATION * 4, FRAME_DURATION);
    expect(lastTime()).toBe(physics.frameDuration * 4);
  });

  it('reaches the same simulated time at any tick rate', () => {
    display.run(1250, 1000 / 60);
    const at60 = lastTime();
    start();
    display.run(1250, 1000 / 144);
    expect(lastTime()).toBeCloseTo(at60, 6);
    expect(lastTime()).toBeCloseTo(1250, 6);
  });

  it('scales the rate by the simulation speed', () => {
    start({ speed: 2 });
    display.run(50, 10);
    expect(lastTime()).toBe(100);
  });

  it('multiplies the rate by the rate scale, starting from the next tick', () => {
    start({ speed: 2, rateScale: 0.5 });
    display.run(20, 10);
    expect(lastTime()).toBe(20);
    controller.setRateScale(10);
    display.run(20, 10);
    expect(frames.map((f) => f.time)).toEqual([10, 20, 220, 420]);
  });

  it('ignores rate scales that are not positive numbers', () => {
    controller.setRateScale(0);
    controller.setRateScale(Number.NaN);
    display.run(20, 10);
    expect(lastTime()).toBe(20);
  });

  it('simulates at most MAX_TICK_MS per tick after a stall', () => {
    display.run(10, 10);
    display.now += 5000;
    display.run(10, 10);
    expect(frames.map((f) => f.time)).toEqual([10, 10 + MAX_TICK_MS]);
  });

  it('stops producing frames while paused and resumes without a jump', () => {
    display.run(20, 10);
    controller.setPaused(true);
    display.run(500, 10);
    expect(frames).toHaveLength(2);

    controller.setPaused(false);
    display.run(30, 10);
    expect(frames.map((f) => f.time)).toEqual([10, 20, 30, 40, 50]);
  });

  it('asks physics to stop its current frame when pausing', () => {
    const stop = vi.spyOn(physics, 'stopProcessingCurrentFrame');
    controller.setPaused(true);
    expect(stop).toHaveBeenCalledOnce();
    controller.setPaused(false);
    expect(stop).toHaveBeenCalledOnce();
  });

  it('steps exactly one Java frame of simulated time per request while paused', () => {
    controller.setPaused(true);
    controller.advanceOneFrame();
    controller.advanceOneFrame();
    expect(frames.map((f) => f.time)).toEqual([FRAME_DURATION, 2 * FRAME_DURATION]);
    display.run(100, 10);
    expect(frames).toHaveLength(2);
  });

  it('ignores step requests while running', () => {
    controller.advanceOneFrame();
    expect(frames).toHaveLength(0);
  });

  it('shows the current frame without advancing', () => {
    controller.showCurrentFrame();
    expect(frames.map((f) => f.time)).toEqual([0]);
    expect(physics.time).toBe(0);
  });

  it('produces nothing after the threads are stopped', () => {
    controller.stopSimulationThreads();
    display.run(100, 10);
    expect(frames).toHaveLength(0);
  });
});

describe('parseSimulationSpeed', () => {
  it('reads the scenario speed multiplier', () => {
    expect(parseSimulationSpeed('1x')).toBe(1);
    expect(parseSimulationSpeed('0.5x')).toBe(0.5);
    expect(parseSimulationSpeed('4x')).toBe(4);
  });

  it('falls back to 1 when unreadable', () => {
    expect(parseSimulationSpeed(undefined)).toBe(1);
    expect(parseSimulationSpeed('fast')).toBe(1);
    expect(parseSimulationSpeed('0x')).toBe(1);
  });
});
