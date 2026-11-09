import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Simulation } from '../sim';
import type { RenderFrame } from '../sim';
import { ArenaType } from '../sim/simulation-info';

/** Two particles bouncing in a small box, one simulation second per frame. */
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
    { frameDuration: 1 },
  );
}
import { FRAME_DURATION, ThreadController } from './thread-controller';

describe('ThreadController', () => {
  let frames: RenderFrame[];
  let physics: Simulation;
  let controller: ThreadController;

  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    physics = smallSimulation();
    controller = new ThreadController(physics, (frame) => frames.push(frame));
    controller.startSimulationThreads();
  });

  afterEach(() => {
    controller.stopSimulationThreads();
    vi.useRealTimers();
  });

  it('advances one frame per FRAME_DURATION while running', () => {
    vi.advanceTimersByTime(FRAME_DURATION * 5);
    expect(frames).toHaveLength(5);
    expect(frames.map((f) => f.time)).toEqual([0, 1, 2, 3, 4]);
  });

  it('stops producing frames while paused and resumes on play', () => {
    vi.advanceTimersByTime(FRAME_DURATION * 2);
    controller.setPaused(true);
    vi.advanceTimersByTime(FRAME_DURATION * 10);
    expect(frames).toHaveLength(2);

    controller.setPaused(false);
    vi.advanceTimersByTime(FRAME_DURATION * 3);
    expect(frames).toHaveLength(5);
  });

  it('asks physics to stop its current frame when pausing', () => {
    const stop = vi.spyOn(physics, 'stopProcessingCurrentFrame');
    controller.setPaused(true);
    expect(stop).toHaveBeenCalledOnce();
    controller.setPaused(false);
    expect(stop).toHaveBeenCalledOnce();
  });

  it('steps exactly one frame per request while paused', () => {
    controller.setPaused(true);
    controller.advanceOneFrame();
    controller.advanceOneFrame();
    expect(frames).toHaveLength(2);
    vi.advanceTimersByTime(FRAME_DURATION * 10);
    expect(frames).toHaveLength(2);
  });

  it('ignores step requests while running', () => {
    controller.advanceOneFrame();
    expect(frames).toHaveLength(0);
  });

  it('produces nothing after the threads are stopped', () => {
    controller.stopSimulationThreads();
    vi.advanceTimersByTime(FRAME_DURATION * 10);
    expect(frames).toHaveLength(0);
  });
});
