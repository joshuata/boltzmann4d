import { describe, expect, it } from 'vitest';
import {
  allInside,
  clampPoint,
  distanceToPolyline,
  gridStep,
  insidePolygon,
  rectangle,
  snapPoint,
} from './geometry';

describe('snapPoint (EDIT-11)', () => {
  const options = { grid: 5, points: [], tolerance: 1 };

  it('snaps to the grid', () => {
    expect(snapPoint([12.4, 7.6], options)).toEqual([10, 10]);
    expect(snapPoint([13, 2.4], options)).toEqual([15, 0]);
  });

  it('prefers an existing point within the tolerance', () => {
    expect(snapPoint([12.4, 7.6], { ...options, points: [[12, 8]] })).toEqual([12, 8]);
    expect(snapPoint([12.4, 7.6], { ...options, points: [[14, 8]] })).toEqual([10, 10]);
  });

  it('keeps 15° angles from the anchor, with a length on the grid', () => {
    const [x, y] = snapPoint([10, 1], { ...options, anchor: [0, 0] });
    expect([x, y]).toEqual([10, 0]);
    const [dx, dy] = snapPoint([7, 7.5], { ...options, anchor: [0, 0] });
    expect(Math.atan2(dy, dx)).toBeCloseTo(Math.PI / 4, 3);
    expect(Math.hypot(dx, dy)).toBeCloseTo(10, 3);
  });

  it('rounds without a grid', () => {
    expect(snapPoint([1.23456, 2.34567], { ...options, grid: 0 })).toEqual([1.235, 2.346]);
  });
});

describe('geometry', () => {
  it('chooses a 1-2-5 grid at least 14 px apart', () => {
    expect(gridStep(10)).toBe(2);
    expect(gridStep(14)).toBe(1);
    expect(gridStep(1)).toBe(20);
    expect(gridStep(0.2)).toBe(100);
  });

  it('measures distances to polylines and polygons', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(distanceToPolyline([5, 2], square, true)).toBe(2);
    expect(distanceToPolyline([-3, 5], square, true)).toBe(3);
    expect(distanceToPolyline([-3, 5], square, false)).toBeCloseTo(Math.hypot(3, 5), 9); // no left side
    expect(distanceToPolyline([5, 12], square, false)).toBe(2);
    expect(insidePolygon([5, 5], square)).toBe(true);
    expect(insidePolygon([15, 5], square)).toBe(false);
  });

  it('builds rectangles and marquees from any two corners', () => {
    expect(rectangle([5, 1], [2, 4])).toEqual({ min: [2, 1], max: [5, 4] });
    expect(allInside([[3, 2]], [5, 1], [2, 4])).toBe(true);
    expect(allInside([[3, 2], [6, 2]], [5, 1], [2, 4])).toBe(false); // prettier-ignore
    expect(clampPoint([-1, 60], 70, 50)).toEqual([0, 50]);
  });
});
