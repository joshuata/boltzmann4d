import { describe, expect, it } from 'vitest';
import { Physics } from './Physics';

describe('Physics (stub)', () => {
  it('throws before the first frame exists', () => {
    expect(() => new Physics().getCurrentFrame()).toThrow();
  });

  it('first advance only creates the first frame, like Physics.java', () => {
    const physics = new Physics({ particleCount: 4 });
    physics.advanceToNextFrame();
    const frame = physics.getCurrentFrame();
    expect(frame.time).toBe(0);
    expect(frame.dimension).toBe(2);
    expect(frame.positions).toHaveLength(8);
    expect(frame.types).toHaveLength(4);
  });

  it('keeps particles inside the walls', () => {
    const physics = new Physics({ particleCount: 50, seed: 3 });
    const limit = 0.5 - Physics.PARTICLE_RADIUS;
    for (let i = 0; i < 2000; i++) physics.advanceToNextFrame();
    for (const x of physics.getCurrentFrame().positions) {
      expect(Math.abs(x)).toBeLessThanOrEqual(limit + 1e-12);
    }
  });

  it('is reproducible for a given seed', () => {
    const run = (seed: number) => {
      const physics = new Physics({ seed });
      for (let i = 0; i < 100; i++) physics.advanceToNextFrame();
      return Array.from(physics.getCurrentFrame().positions);
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it('hands out fresh arrays each frame so they can be transferred', () => {
    const physics = new Physics();
    physics.advanceToNextFrame();
    const first = physics.getCurrentFrame();
    physics.advanceToNextFrame();
    const second = physics.getCurrentFrame();
    expect(second.positions.buffer).not.toBe(first.positions.buffer);
    expect(second.positions).not.toEqual(first.positions);
  });
});
