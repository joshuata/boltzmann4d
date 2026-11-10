// Drawn walls in 2D (WALL-1, WALL-2; plan 0010 step 4): polylines of zero-thickness line
// segments inside the arena. A particle hits a segment's face when its centre comes within
// one radius of the line with its projection inside the segment, and hits a segment's end
// (or a corner, where segments meet) when its centre comes within one radius of the point.
// The distance from a centre to a wall is the smallest distance to any of its segments,
// which is reached either on a face or at an end, so the earliest face or end event over
// all segments is exactly the first contact: corners, crossings and walls that touch need
// no special cases.
//
// Reflections are specular, about the face normal or, at an end, about the line from the
// point to the centre (a collision with an infinitely heavy point), so kinetic energy is
// conserved and the motion retraces itself when reversed (SIM-3, SIM-32).
//
// Each segment and end point is registered in every grid cell that a particle centred in
// that cell could touch it from (within the largest radius), so a particle only checks
// the walls registered in its own cell: until it leaves the cell, which re-predicts it, no
// other wall is within reach.
import type { CellGrid } from './cell-grid';
import { MAX_TIME } from './event';
import type { Particles } from './particles';
import { predCol2D } from './particle-2d';

const NEVER = MAX_TIME;

/** Distance from (x, y) to the segment from (x1, y1) to (x2, y2). */
export function distanceToSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const ex = x2 - x1;
  const ey = y2 - y1;
  const lengthSquared = ex * ex + ey * ey;
  const along =
    lengthSquared === 0
      ? 0
      : Math.min(Math.max(((x - x1) * ex + (y - y1) * ey) / lengthSquared, 0), 1);
  return Math.hypot(x - x1 - along * ex, y - y1 - along * ey);
}

/** A drawn wall as the simulation takes it: points in meters, closed into a polygon or not. */
export interface WallShape {
  points: readonly (readonly [number, number])[];
  closed?: boolean;
}

/** What a wall prediction found: the time, and which segment or end point (-1: none). */
export interface WallHit {
  time: number;
  /** Segment index, or −1 − end-point index for an end point. */
  index: number;
}

export class SegmentWalls {
  // Segments: start point, unit tangent, unit normal (left of the tangent), length.
  readonly ax: Float64Array;
  readonly ay: Float64Array;
  readonly ux: Float64Array;
  readonly uy: Float64Array;
  readonly length: Float64Array;
  /** Which wall (index into the shapes) each segment belongs to. */
  readonly wallOf: Int32Array;
  // End points and corners, each once.
  readonly px: Float64Array;
  readonly py: Float64Array;
  /** Per grid cell: the segments (≥ 0) and end points (−1 − index) a particle in it can reach. */
  private readonly cellStart: Int32Array;
  private readonly cellItems: Int32Array;

  constructor(walls: readonly WallShape[], grid: CellGrid, maxRadius: number) {
    const segments: [number, number, number, number, number][] = [];
    const points = new Map<string, [number, number]>();
    walls.forEach((wall, w) => {
      const pts = wall.points;
      const n = pts.length;
      const count = wall.closed && n >= 3 ? n : n - 1;
      for (let k = 0; k < count; k++) {
        const [x1, y1] = pts[k]!;
        const [x2, y2] = pts[(k + 1) % n]!;
        if (x1 === x2 && y1 === y2) continue; // a repeated point is no segment
        segments.push([x1, y1, x2, y2, w]);
      }
      for (const [x, y] of pts) points.set(`${x},${y}`, [x, y]);
    });

    const ns = segments.length;
    this.ax = new Float64Array(ns);
    this.ay = new Float64Array(ns);
    this.ux = new Float64Array(ns);
    this.uy = new Float64Array(ns);
    this.length = new Float64Array(ns);
    this.wallOf = new Int32Array(ns);
    segments.forEach(([x1, y1, x2, y2, w], s) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      this.ax[s] = x1;
      this.ay[s] = y1;
      this.ux[s] = dx / len;
      this.uy[s] = dy / len;
      this.length[s] = len;
      this.wallOf[s] = w;
    });
    const ends = [...points.values()];
    this.px = Float64Array.from(ends, ([x]) => x);
    this.py = Float64Array.from(ends, ([, y]) => y);

    // Register in each cell within reach: a centre in the cell is within maxRadius of the
    // item. Tested against the cell's circumscribed circle, which only ever adds cells.
    const cells = grid.nx * grid.ny;
    const halfDiagonal = 0.5 * Math.hypot(grid.cellWidth, grid.cellHeight);
    const reach = maxRadius * (1 + 1e-6) + halfDiagonal;
    const lists: number[][] = Array.from({ length: cells }, () => []);
    for (let c = 0; c < cells; c++) {
      const cx = ((c % grid.nx) + 0.5) * grid.cellWidth;
      const cy = (Math.floor(c / grid.nx) + 0.5) * grid.cellHeight;
      for (let s = 0; s < ns; s++) {
        if (this.distanceToSegment(s, cx, cy) <= reach) lists[c]!.push(s);
      }
      for (let e = 0; e < ends.length; e++) {
        if (Math.hypot(cx - this.px[e]!, cy - this.py[e]!) <= reach) lists[c]!.push(-1 - e);
      }
    }
    this.cellStart = new Int32Array(cells + 1);
    for (let c = 0; c < cells; c++) this.cellStart[c + 1] = this.cellStart[c]! + lists[c]!.length;
    this.cellItems = Int32Array.from(lists.flat());
  }

  get segmentCount(): number {
    return this.length.length;
  }

  /** Distance from (x, y) to segment s. */
  distanceToSegment(s: number, x: number, y: number): number {
    const dx = x - this.ax[s]!;
    const dy = y - this.ay[s]!;
    const along = Math.min(Math.max(dx * this.ux[s]! + dy * this.uy[s]!, 0), this.length[s]!);
    return Math.hypot(dx - along * this.ux[s]!, dy - along * this.uy[s]!);
  }

  /** Distance from (x, y) to the nearest wall. */
  distanceTo(x: number, y: number): number {
    let best = Infinity;
    for (let s = 0; s < this.segmentCount; s++) best = Math.min(best, this.distanceToSegment(s, x, y)); // prettier-ignore
    return best;
  }

  /**
   * Particle i's next wall contact, from its stored state (position at t0), checking the
   * walls registered in `cell`. Writes into `out`.
   */
  predict(p: Particles, i: number, cell: number, out: WallHit): void {
    out.time = NEVER;
    out.index = -1;
    const x = p.x[i]!;
    const y = p.y[i]!;
    const vx = p.vx[i]!;
    const vy = p.vy[i]!;
    const r = p.radius[i]!;
    const t0 = p.t0[i]!;
    const items = this.cellItems;
    for (let m = this.cellStart[cell]!, end = this.cellStart[cell + 1]!; m < end; m++) {
      const item = items[m]!;
      let t: number;
      if (item >= 0) {
        // Face: the signed distance to the line reaches ±r while closing in on it.
        const ux = this.ux[item]!;
        const uy = this.uy[item]!;
        const dx = x - this.ax[item]!;
        const dy = y - this.ay[item]!;
        const d = dx * -uy + dy * ux; // along the normal (−uy, ux)
        const vn = vx * -uy + vy * ux;
        let dt: number;
        if (d > 0 && vn < 0) dt = (d - r) / -vn;
        else if (d < 0 && vn > 0) dt = (-d - r) / vn;
        else continue;
        // Round-off can leave the centre a hair closer than r: hit at once then.
        if (dt < 0) dt = 0;
        // The contact must be on the segment itself; beyond it, the end point applies.
        const along = (dx + vx * dt) * ux + (dy + vy * dt) * uy;
        if (along < 0 || along > this.length[item]!) continue;
        t = t0 + dt;
      } else {
        const e = -1 - item;
        t = predCol2D(this.px[e]! - x, this.py[e]! - y, -vx, -vy, r, t0);
        if (t === NEVER) continue;
      }
      if (t < out.time) {
        out.time = t;
        out.index = item;
      }
    }
  }

  /** Moves particle i to `time` and reflects it off segment or end point `index`. */
  collide(p: Particles, i: number, time: number, index: number): void {
    const dt = time - p.t0[i]!;
    p.x[i] = p.x[i]! + p.vx[i]! * dt;
    p.y[i] = p.y[i]! + p.vy[i]! * dt;
    p.t0[i] = time;
    p.cumTime[i] = p.cumTime[i]! + dt;
    let nx: number;
    let ny: number;
    if (index >= 0) {
      nx = -this.uy[index]!;
      ny = this.ux[index]!;
    } else {
      const e = -1 - index;
      const dx = p.x[i]! - this.px[e]!;
      const dy = p.y[i]! - this.py[e]!;
      const d = Math.hypot(dx, dy);
      nx = dx / d;
      ny = dy / d;
    }
    const vn = p.vx[i]! * nx + p.vy[i]! * ny;
    p.vx[i] = p.vx[i]! - 2 * vn * nx;
    p.vy[i] = p.vy[i]! - 2 * vn * ny;
  }
}
