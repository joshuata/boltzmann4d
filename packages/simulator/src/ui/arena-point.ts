// Where a click on the 2D arena lands, in meters, following the 2D view's fit (view-2d.ts:
// the arena centred, with a margin of 4% of its larger side, letterboxed to the canvas).

/** Same as view-2d.ts's MARGIN. */
const MARGIN = 0.04;

/**
 * The arena point (m) under canvas pixel (px, py), and how many meters a pixel spans.
 * `canvas` is in CSS pixels; `arena` in meters.
 */
export function arenaPoint(
  px: number,
  py: number,
  canvas: { width: number; height: number },
  arena: { width: number; height: number },
): { x: number; y: number; metersPerPixel: number } {
  const margin = MARGIN * Math.max(arena.width, arena.height);
  let halfW = arena.width / 2 + margin;
  let halfH = arena.height / 2 + margin;
  const aspect = canvas.width / canvas.height || 1;
  if (halfW / halfH < aspect) halfW = halfH * aspect;
  else halfH = halfW / aspect;
  const metersPerPixel = (2 * halfW) / canvas.width;
  return {
    x: arena.width / 2 - halfW + px * metersPerPixel,
    y: arena.height / 2 + halfH - py * metersPerPixel,
    metersPerPixel,
  };
}

/** Distance from (x, y) to a polyline given as x, y pairs (closed into a polygon or not). */
export function distanceToPolyline(
  x: number,
  y: number,
  points: number[],
  closed: boolean,
): number {
  const n = points.length / 2;
  let best = Infinity;
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const x1 = points[2 * k]!;
    const y1 = points[2 * k + 1]!;
    const x2 = points[2 * ((k + 1) % n)]!;
    const y2 = points[2 * ((k + 1) % n) + 1]!;
    const ex = x2 - x1;
    const ey = y2 - y1;
    const l2 = ex * ex + ey * ey;
    const t = l2 === 0 ? 0 : Math.min(Math.max(((x - x1) * ex + (y - y1) * ey) / l2, 0), 1);
    best = Math.min(best, Math.hypot(x - x1 - t * ex, y - y1 - t * ey));
  }
  return best;
}
