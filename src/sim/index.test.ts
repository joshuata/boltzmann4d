import { describe, expect, it } from 'vitest';
import type { RenderFrame } from './index';

describe('sim skeleton', () => {
  it('RenderFrame holds dimension-strided positions', () => {
    const frame: RenderFrame = {
      dimension: 2,
      time: 0,
      positions: new Float64Array([0, 0, 1, 1]),
      types: new Uint16Array([0, 0]),
      speeds: new Float32Array([0, 0]),
    };
    expect(frame.positions.length / frame.dimension).toBe(frame.types.length);
  });
});
