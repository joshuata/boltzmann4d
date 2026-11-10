import { describe, expect, it } from 'vitest';
import { periodicImages } from './periodic-images';

const images = (x: number, y: number) => {
  const out = new Float64Array(8);
  const n = periodicImages(x, y, 1, 10, 8, out);
  return Array.from({ length: n }, (_, k) => [out[2 * k], out[2 * k + 1]]);
};

describe('periodicImages', () => {
  it('draws a disc clear of the edges once', () => {
    expect(images(5, 4)).toEqual([[5, 4]]);
  });

  it('wraps a disc crossing the left or right edge', () => {
    expect(images(-0.5, 4)).toEqual([
      [-0.5, 4],
      [9.5, 4],
    ]);
    expect(images(9.5, 4)).toEqual([
      [9.5, 4],
      [-0.5, 4],
    ]);
  });

  it('wraps a disc crossing the bottom edge', () => {
    expect(images(5, 0.5)).toEqual([
      [5, 0.5],
      [5, 8.5],
    ]);
  });

  it('adds the corner copy for a disc crossing two edges', () => {
    expect(images(0.5, -0.5)).toEqual([
      [0.5, -0.5],
      [10.5, -0.5],
      [0.5, 7.5],
      [10.5, 7.5],
    ]);
  });
});
