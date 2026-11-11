import { describe, expect, it } from 'vitest';
import { arenaPoint, distanceToPolyline } from './arena-point';

describe('arenaPoint', () => {
  it('maps canvas pixels to the arena as the 2D view fits it', () => {
    // A 100 × 50 m arena in a 1000 × 500 px canvas: margin 4 m each side, then letterboxed.
    const canvas = { width: 1000, height: 500 };
    const arena = { width: 100, height: 50 };
    const centre = arenaPoint(500, 250, canvas, arena);
    expect(centre.x).toBeCloseTo(50, 9);
    expect(centre.y).toBeCloseTo(25, 9);
    // Height fits 50 + 8 = 58 m in 500 px; the width follows the canvas's aspect.
    expect(centre.metersPerPixel).toBeCloseTo(58 / 500, 9);
    const corner = arenaPoint(0, 0, canvas, arena);
    expect(corner.x).toBeCloseTo(50 - 500 * (58 / 500), 9);
    expect(corner.y).toBeCloseTo(25 + 29, 9);
  });

  it('follows the zoom about the arena centre', () => {
    const canvas = { width: 1000, height: 500 };
    const arena = { width: 100, height: 50 };
    const zoomed = arenaPoint(500, 250, canvas, arena, 2);
    expect(zoomed.x).toBeCloseTo(50, 9);
    expect(zoomed.y).toBeCloseTo(25, 9);
    expect(zoomed.metersPerPixel).toBeCloseTo(58 / 1000, 9);
    expect(arenaPoint(0, 0, canvas, arena, 2).y).toBeCloseTo(25 + 29 / 2, 9);
  });

  it('measures distances to polylines', () => {
    expect(distanceToPolyline(5, 2, [0, 0, 10, 0], false)).toBe(2);
    expect(distanceToPolyline(-3, 5, [0, 0, 10, 0, 10, 10, 0, 10], true)).toBe(3);
  });
});
