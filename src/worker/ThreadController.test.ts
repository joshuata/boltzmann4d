import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Physics } from '../sim';
import type { RenderFrame } from '../sim';
import { FRAME_DURATION, ThreadController } from './ThreadController';

describe('ThreadController', () => {
  let frames: RenderFrame[];
  let physics: Physics;
  let controller: ThreadController;

  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    physics = new Physics({ seed: 7 });
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
    expect(frames.map((f) => f.time)).toEqual(
      [0, 1, 2, 3, 4].map((k) => k * physics.getFrameDuration()),
    );
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
