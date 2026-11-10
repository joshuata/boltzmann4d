// Geometry for the drawing canvas, in nanometres with y up (the arena's frame): snapping
// (EDIT-11), hit tests and the grid's spacing. Pure functions, unit tested.

export type Point = [number, number];

/** Snapping options for one point. `tolerance` is in nm (a few screen pixels). */
export interface SnapOptions {
  /** Grid spacing, nm; 0 for none. */
  grid: number;
  /** Points to snap onto (other walls' points, region corners). */
  points: readonly Point[];
  /** The previous point of the shape being drawn, for 15° angles. */
  anchor?: Point;
  tolerance: number;
}

const ANGLE_STEP = Math.PI / 12; // 15°

/** Rounds to `decimals` places, so snapped values print cleanly. */
export const round = (value: number, decimals = 3) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

/**
 * Where a point goes with snapping on: onto an existing point within `tolerance`, else at a
 * 15° angle from the anchor (keeping the distance, then rounding it to the grid), else onto
 * the grid.
 */
export function snapPoint(p: Point, options: SnapOptions): Point {
  let nearest: Point | null = null;
  let best = options.tolerance;
  for (const q of options.points) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= best) {
      best = d;
      nearest = q;
    }
  }
  if (nearest) return [nearest[0], nearest[1]];
  const grid = options.grid;
  const toGrid = (v: number) => (grid > 0 ? round(Math.round(v / grid) * grid) : round(v));
  if (options.anchor) {
    const [ax, ay] = options.anchor;
    const length = Math.hypot(p[0] - ax, p[1] - ay);
    if (length > 0) {
      const angle = Math.round(Math.atan2(p[1] - ay, p[0] - ax) / ANGLE_STEP) * ANGLE_STEP;
      const snapped = grid > 0 ? Math.max(grid, Math.round(length / grid) * grid) : length;
      return [round(ax + snapped * Math.cos(angle)), round(ay + snapped * Math.sin(angle))];
    }
  }
  return [toGrid(p[0]), toGrid(p[1])];
}

/** Keeps a point inside the arena. */
export function clampPoint([x, y]: Point, width: number, height: number): Point {
  return [Math.min(Math.max(x, 0), width), Math.min(Math.max(y, 0), height)];
}

/**
 * Grid spacing for a zoom of `pixelsPerNm`: the smallest of 1, 2 or 5 × 10ⁿ nm that puts
 * lines at least `minPixels` apart.
 */
export function gridStep(pixelsPerNm: number, minPixels = 14): number {
  const target = minPixels / pixelsPerNm;
  const power = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 2, 5, 10]) if (m * power >= target) return m * power;
  return 10 * power;
}

/** Distance from p to the segment ab. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const lengthSquared = ex * ex + ey * ey;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(Math.max(((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / lengthSquared, 0), 1);
  return Math.hypot(p[0] - a[0] - t * ex, p[1] - a[1] - t * ey);
}

/** Distance from p to a polyline (closed into a polygon when `closed`). */
export function distanceToPolyline(p: Point, points: readonly Point[], closed: boolean): number {
  let best = Infinity;
  const n = points.length;
  const segments = closed ? n : n - 1;
  for (let k = 0; k < segments; k++) {
    best = Math.min(best, distanceToSegment(p, points[k]!, points[(k + 1) % n]!));
  }
  return n === 1 ? Math.hypot(p[0] - points[0]![0], p[1] - points[0]![1]) : best;
}

/** Whether p is inside the polygon (even–odd rule). */
export function insidePolygon(p: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** The corners of the rectangle spanned by two points, as min and max. */
export function rectangle(a: Point, b: Point): { min: Point; max: Point } {
  return {
    min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
    max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
  };
}

/** A rectangle's four corners, anticlockwise from min. */
export function rectangleCorners(min: Point, max: Point): Point[] {
  return [
    [min[0], min[1]],
    [max[0], min[1]],
    [max[0], max[1]],
    [min[0], max[1]],
  ];
}

/** Whether every point is inside the box spanned by a and b (marquee selection). */
export function allInside(points: readonly Point[], a: Point, b: Point): boolean {
  const { min, max } = rectangle(a, b);
  return points.every(([x, y]) => x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1]);
}
