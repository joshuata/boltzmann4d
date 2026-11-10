// Drawn walls in 2D (WALL-1–4; plan 0010 steps 4 and 7): polylines of zero-thickness line
// segments inside the arena. A particle hits a segment's face when its centre comes within
// one radius of the line with its projection inside the segment, and hits a segment's end
// (or a corner, where segments meet) when its centre comes within one radius of the point.
// The distance from a centre to a wall is the smallest distance to any of its segments,
// which is reached either on a face or at an end, so the earliest face or end event over
// all segments is exactly the first contact: corners, crossings and walls that touch need
// no special cases.
//
// Wall kinds (WALL-4):
// - Reflecting: specular reflection about the face normal or, at an end, about the line
//   from the point to the centre (a collision with an infinitely heavy point), so kinetic
//   energy is conserved and the motion retraces itself when reversed (SIM-3, SIM-32).
// - Thermal: reflects, then sends the particle off with normal speed √(2kT/m), the mean
//   of v_n² over particles hitting a wall from a gas at T. Energy in and out then balances
//   exactly when the gas is at the wall's temperature, so the gas near it heads there.
//   Deterministic, unlike a random draw, so runs stay reproducible.
// - Semipermeable: kinds in the wall's pass list go through; the rest reflect.
// - Gate: reflects while closed; while open, it isn't there. Opening or closing it
//   re-predicts every particle (Simulation.setGateOpen).
// - Attractive: reflects, and has a square well of depth E within `width` of the wall on
//   both sides (round at its ends and corners). A particle entering the well gains E of
//   kinetic energy along the well's edge normal; one leaving pays E, or bounces back in if
//   its normal kinetic energy is short of it. The well is the union of one capsule per
//   segment; a line enters and leaves each convex capsule once, so the first exit from the
//   union is the earliest capsule exit that isn't inside another capsule of the wall.
//
// Each segment and end point is registered in every grid cell that a particle centred in
// that cell could touch it from (within the largest radius), and each attractive wall in
// the cells its well reaches, so a particle only checks its own cell's walls: until it
// leaves the cell, which re-predicts it, nothing else is within reach.
import type { CellGrid } from './cell-grid';
import { MAX_TIME } from './event';
import type { Particles } from './particles';
import { predCol2D } from './particle-2d';

const NEVER = MAX_TIME;
/** Boltzmann's constant, J/K, and kg per amu (as in stats/formulas and Java's Units). */
const BOLTZMANN = 1.3806504e-23;
const AMU_KG = 1.660538782e-27;
/** J per particle for 1 kJ/mol. */
const KJ_PER_MOL = 1.0e3 / 6.02214179e23;

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

/** What a drawn wall does (WALL-4), in SI units and species indices. */
export type WallPhysics =
  | { type: 'reflecting' }
  /** K. */
  | { type: 'thermal'; temperature: number }
  /** Species indices whose particles pass through. */
  | { type: 'semipermeable'; passes: readonly number[] }
  | { type: 'gate'; open: boolean }
  /** Depth in kJ/mol, width in m. */
  | { type: 'attractive'; depth: number; width: number };

/** A drawn wall as the simulation takes it: points in meters, closed into a polygon or not. */
export interface WallShape {
  points: readonly (readonly [number, number])[];
  closed?: boolean;
  /** Reflecting when absent. */
  physics?: WallPhysics;
}

/** Event kinds a wall prediction can find. */
export const WallEvent = { BOUNCE: 0, ENTER_WELL: 1, EXIT_WELL: 2 } as const;

/** What a wall prediction found. */
export interface WallHit {
  time: number;
  /** WallEvent. */
  kind: number;
  /** BOUNCE: segment index, or −1 − end-point index. Wells: the wall's index. */
  index: number;
}

const REFLECTING = 0;
const THERMAL = 1;
const SEMIPERMEABLE = 2;
const GATE = 3;
const ATTRACTIVE = 4;
const TYPE_CODES = { reflecting: REFLECTING, thermal: THERMAL, semipermeable: SEMIPERMEABLE, gate: GATE, attractive: ATTRACTIVE }; // prettier-ignore

export class SegmentWalls {
  // Segments: start point, unit tangent, length, and wall.
  readonly ax: Float64Array;
  readonly ay: Float64Array;
  readonly ux: Float64Array;
  readonly uy: Float64Array;
  readonly length: Float64Array;
  readonly wallOf: Int32Array;
  // End points and corners, once per wall.
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly pointWall: Int32Array;
  // Per wall.
  readonly wallCount: number;
  private readonly type: Uint8Array;
  private readonly temperature: Float64Array;
  /** Semipermeable: bit t set when species t passes. */
  private readonly passes: Uint32Array;
  /** Gates: 1 while open. */
  private readonly open: Uint8Array;
  /** Attractive: well width (m) and depth per particle (amu·m²/s²). */
  private readonly wellWidth: Float64Array;
  private readonly wellEnergy: Float64Array;
  /** Each wall's segments, as a range into the segment arrays. */
  private readonly firstSegment: Int32Array;
  /** Attractive walls: 1 for each particle (row) inside each wall's well (column). */
  private readonly inWell: Uint8Array;
  private readonly particleCount: number;
  /** Per grid cell: segments (≥ 0) and end points (−1 − index) within reach. */
  private readonly cellStart: Int32Array;
  private readonly cellItems: Int32Array;
  /** Per grid cell: attractive walls whose well reaches it. */
  private readonly cellWellStart: Int32Array;
  private readonly cellWells: Int32Array;

  constructor(walls: readonly WallShape[], grid: CellGrid, maxRadius: number, p: Particles) {
    const segments: [number, number, number, number, number][] = [];
    const ends: [number, number, number][] = [];
    const n = walls.length;
    this.wallCount = n;
    this.type = new Uint8Array(n);
    this.temperature = new Float64Array(n);
    this.passes = new Uint32Array(n);
    this.open = new Uint8Array(n);
    this.wellWidth = new Float64Array(n);
    this.wellEnergy = new Float64Array(n);
    this.firstSegment = new Int32Array(n + 1);
    walls.forEach((wall, w) => {
      const physics = wall.physics ?? { type: 'reflecting' };
      this.type[w] = TYPE_CODES[physics.type];
      if (physics.type === 'thermal') this.temperature[w] = physics.temperature;
      if (physics.type === 'semipermeable') {
        for (const t of physics.passes) this.passes[w] = this.passes[w]! | (1 << t);
      }
      if (physics.type === 'gate') this.open[w] = physics.open ? 1 : 0;
      if (physics.type === 'attractive') {
        this.wellWidth[w] = physics.width;
        this.wellEnergy[w] = (physics.depth * KJ_PER_MOL) / AMU_KG;
      }
      this.firstSegment[w] = segments.length;
      const pts = wall.points;
      const count = wall.closed && pts.length >= 3 ? pts.length : pts.length - 1;
      for (let k = 0; k < count; k++) {
        const [x1, y1] = pts[k]!;
        const [x2, y2] = pts[(k + 1) % pts.length]!;
        if (x1 === x2 && y1 === y2) continue; // a repeated point is no segment
        segments.push([x1, y1, x2, y2, w]);
      }
      const seen = new Set<string>();
      for (const [x, y] of pts) {
        if (seen.has(`${x},${y}`)) continue;
        seen.add(`${x},${y}`);
        ends.push([x, y, w]);
      }
    });
    this.firstSegment[n] = segments.length;

    const ns = segments.length;
    this.ax = new Float64Array(ns);
    this.ay = new Float64Array(ns);
    this.ux = new Float64Array(ns);
    this.uy = new Float64Array(ns);
    this.length = new Float64Array(ns);
    this.wallOf = new Int32Array(ns);
    segments.forEach(([x1, y1, x2, y2, w], s) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      this.ax[s] = x1;
      this.ay[s] = y1;
      this.ux[s] = (x2 - x1) / len;
      this.uy[s] = (y2 - y1) / len;
      this.length[s] = len;
      this.wallOf[s] = w;
    });
    this.px = Float64Array.from(ends, ([x]) => x);
    this.py = Float64Array.from(ends, ([, y]) => y);
    this.pointWall = Int32Array.from(ends, ([, , w]) => w);

    // Register in each cell within reach, tested against the cell's circumscribed circle
    // (which only ever adds cells).
    const cells = grid.nx * grid.ny;
    const halfDiagonal = 0.5 * Math.hypot(grid.cellWidth, grid.cellHeight);
    const reach = maxRadius * (1 + 1e-6) + halfDiagonal;
    const lists: number[][] = Array.from({ length: cells }, () => []);
    const wellLists: number[][] = Array.from({ length: cells }, () => []);
    for (let c = 0; c < cells; c++) {
      const cx = ((c % grid.nx) + 0.5) * grid.cellWidth;
      const cy = (Math.floor(c / grid.nx) + 0.5) * grid.cellHeight;
      for (let s = 0; s < ns; s++) {
        if (this.segmentDistance(s, cx, cy) <= reach) lists[c]!.push(s);
      }
      for (let e = 0; e < ends.length; e++) {
        if (Math.hypot(cx - this.px[e]!, cy - this.py[e]!) <= reach) lists[c]!.push(-1 - e);
      }
      for (let w = 0; w < n; w++) {
        if (this.type[w] !== ATTRACTIVE) continue;
        const wellReach = this.wellWidth[w]! * (1 + 1e-6) + halfDiagonal;
        if (this.wallDistance(w, cx, cy) <= wellReach) wellLists[c]!.push(w);
      }
    }
    const flatten = (all: number[][]) => {
      const start = new Int32Array(cells + 1);
      for (let c = 0; c < cells; c++) start[c + 1] = start[c]! + all[c]!.length;
      return { start, items: Int32Array.from(all.flat()) };
    };
    ({ start: this.cellStart, items: this.cellItems } = flatten(lists));
    ({ start: this.cellWellStart, items: this.cellWells } = flatten(wellLists));

    // Who starts inside which well.
    this.particleCount = p.count;
    this.inWell = new Uint8Array(p.count * n);
    for (let w = 0; w < n; w++) {
      if (this.type[w] !== ATTRACTIVE) continue;
      for (let k = 0; k < p.count; k++) {
        if (this.wallDistance(w, p.x[k]!, p.y[k]!) < this.wellWidth[w]!) this.inWell[k * n + w] = 1; // prettier-ignore
      }
    }
  }

  get segmentCount(): number {
    return this.length.length;
  }

  /** Distance from (x, y) to segment s. */
  segmentDistance(s: number, x: number, y: number): number {
    const dx = x - this.ax[s]!;
    const dy = y - this.ay[s]!;
    const along = Math.min(Math.max(dx * this.ux[s]! + dy * this.uy[s]!, 0), this.length[s]!);
    return Math.hypot(dx - along * this.ux[s]!, dy - along * this.uy[s]!);
  }

  /** Distance from (x, y) to wall w. */
  wallDistance(w: number, x: number, y: number): number {
    let best = Infinity;
    for (let s = this.firstSegment[w]!; s < this.firstSegment[w + 1]!; s++) {
      best = Math.min(best, this.segmentDistance(s, x, y));
    }
    return best;
  }

  /** Distance from (x, y) to the nearest wall that particles of species `t` can hit. */
  distanceTo(x: number, y: number, t = -1): number {
    let best = Infinity;
    for (let w = 0; w < this.wallCount; w++) {
      if (t >= 0 && !this.blocks(w, t)) continue;
      best = Math.min(best, this.wallDistance(w, x, y));
    }
    return best;
  }

  /** Whether wall w stops particles showing species t now. */
  blocks(w: number, t: number): boolean {
    const type = this.type[w]!;
    if (type === GATE) return this.open[w] === 0;
    if (type === SEMIPERMEABLE) return (this.passes[w]! & (1 << t)) === 0;
    return true;
  }

  isGate(w: number): boolean {
    return this.type[w] === GATE;
  }
  isOpen(w: number): boolean {
    return this.open[w] === 1;
  }
  setOpen(w: number, open: boolean): void {
    if (this.type[w] === GATE) this.open[w] = open ? 1 : 0;
  }

  /** Whether particle i is inside attractive wall w's well. */
  insideWell(i: number, w: number): boolean {
    return this.inWell[i * this.wallCount + w] === 1;
  }

  /** −E (amu·m²/s²) for every particle inside an attractive wall's well. */
  potentialEnergy(): number {
    let total = 0;
    for (let k = 0; k < this.particleCount; k++) {
      for (let w = 0; w < this.wallCount; w++) {
        if (this.inWell[k * this.wallCount + w]) total -= this.wellEnergy[w]!;
      }
    }
    return total;
  }

  /**
   * Particle i's next wall event, from its stored state (position at t0), checking the
   * walls registered in `cell`. Writes into `out`.
   */
  predict(p: Particles, i: number, cell: number, out: WallHit): void {
    out.time = NEVER;
    out.kind = WallEvent.BOUNCE;
    out.index = -1;
    const x = p.x[i]!;
    const y = p.y[i]!;
    const vx = p.vx[i]!;
    const vy = p.vy[i]!;
    const r = p.radius[i]!;
    const t0 = p.t0[i]!;
    const species = p.color[i]!;
    const items = this.cellItems;
    for (let m = this.cellStart[cell]!, end = this.cellStart[cell + 1]!; m < end; m++) {
      const item = items[m]!;
      const wall = item >= 0 ? this.wallOf[item]! : this.pointWall[-1 - item]!;
      if (!this.blocks(wall, species)) continue;
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
        out.kind = WallEvent.BOUNCE;
        out.index = item;
      }
    }
    // Attractive walls' wells.
    for (let m = this.cellWellStart[cell]!, end = this.cellWellStart[cell + 1]!; m < end; m++) {
      const w = this.cellWells[m]!;
      const inside = this.inWell[i * this.wallCount + w] === 1;
      const dt = inside ? this.wellExit(w, x, y, vx, vy) : this.wellEntry(w, x, y, vx, vy);
      if (dt === NEVER) continue;
      const t = t0 + dt;
      if (t < out.time) {
        out.time = t;
        out.kind = inside ? WallEvent.EXIT_WELL : WallEvent.ENTER_WELL;
        out.index = w;
      }
    }
  }

  /**
   * When the line x + v·t first enters wall w's well (after now), or NEVER: the earliest
   * entry into any of its segments' capsules.
   */
  private wellEntry(w: number, x: number, y: number, vx: number, vy: number): number {
    let best = NEVER;
    for (let s = this.firstSegment[w]!; s < this.firstSegment[w + 1]!; s++) {
      const [tIn] = this.capsule(s, this.wellWidth[w]!, x, y, vx, vy);
      if (tIn >= 0 && tIn < best) best = tIn;
    }
    return best;
  }

  /**
   * When the line first leaves wall w's well: the earliest capsule exit (after now) at a
   * point outside every other capsule of the wall, or NEVER.
   */
  private wellExit(w: number, x: number, y: number, vx: number, vy: number): number {
    const width = this.wellWidth[w]!;
    let best = NEVER;
    for (let s = this.firstSegment[w]!; s < this.firstSegment[w + 1]!; s++) {
      const [, tOut] = this.capsule(s, width, x, y, vx, vy);
      if (!(tOut >= 0) || tOut >= best) continue;
      const ex = x + vx * tOut;
      const ey = y + vy * tOut;
      let elsewhere = false;
      for (let o = this.firstSegment[w]!; o < this.firstSegment[w + 1]!; o++) {
        if (o !== s && this.segmentDistance(o, ex, ey) < width * (1 - 1e-9)) {
          elsewhere = true;
          break;
        }
      }
      if (!elsewhere) best = tOut;
    }
    // Round-off: a centre a hair outside but still marked inside leaves at once.
    return best === NEVER && this.wallDistance(w, x, y) >= width ? 0 : best;
  }

  /**
   * The interval [tIn, tOut] (relative times) the line x + v·t spends within `width` of
   * segment s (a capsule: a rectangle and two discs), or [NaN, NaN] if it misses.
   */
  private capsule(
    s: number,
    width: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): [number, number] {
    const ux = this.ux[s]!;
    const uy = this.uy[s]!;
    const dx = x - this.ax[s]!;
    const dy = y - this.ay[s]!;
    let lo = Infinity;
    let hi = -Infinity;
    // The rectangle: |normal| ≤ width and 0 ≤ along ≤ length.
    const slab = (p0: number, v: number, min: number, max: number): [number, number] => {
      if (v === 0) return p0 >= min && p0 <= max ? [-Infinity, Infinity] : [NaN, NaN];
      const a = (min - p0) / v;
      const b = (max - p0) / v;
      return a < b ? [a, b] : [b, a];
    };
    const [n0, n1] = slab(dx * -uy + dy * ux, vx * -uy + vy * ux, -width, width);
    const [a0, a1] = slab(dx * ux + dy * uy, vx * ux + vy * uy, 0, this.length[s]!);
    const r0 = Math.max(n0, a0);
    const r1 = Math.min(n1, a1);
    if (r0 <= r1) {
      lo = r0;
      hi = r1;
    }
    // The two end discs.
    const disc = (cx: number, cy: number) => {
      const ox = x - cx;
      const oy = y - cy;
      const A = vx * vx + vy * vy;
      if (A === 0) return;
      const B = ox * vx + oy * vy;
      const C = ox * ox + oy * oy - width * width;
      const rad = B * B - A * C;
      if (rad < 0) return;
      const root = Math.sqrt(rad);
      lo = Math.min(lo, (-B - root) / A);
      hi = Math.max(hi, (-B + root) / A);
    };
    disc(this.ax[s]!, this.ay[s]!);
    disc(this.ax[s]! + ux * this.length[s]!, this.ay[s]! + uy * this.length[s]!);
    return lo <= hi ? [lo, hi] : [NaN, NaN];
  }

  /** Moves particle i to `time` and performs the wall event `kind` at `index`. */
  collide(p: Particles, i: number, time: number, kind: number, index: number): void {
    const dt = time - p.t0[i]!;
    p.x[i] = p.x[i]! + p.vx[i]! * dt;
    p.y[i] = p.y[i]! + p.vy[i]! * dt;
    p.t0[i] = time;
    p.cumTime[i] = p.cumTime[i]! + dt;
    if (kind === WallEvent.BOUNCE) this.bounce(p, i, index);
    else this.crossWell(p, i, index, kind === WallEvent.ENTER_WELL);
  }

  private bounce(p: Particles, i: number, index: number): void {
    let nx: number;
    let ny: number;
    let wall: number;
    if (index >= 0) {
      nx = -this.uy[index]!;
      ny = this.ux[index]!;
      wall = this.wallOf[index]!;
    } else {
      const e = -1 - index;
      const dx = p.x[i]! - this.px[e]!;
      const dy = p.y[i]! - this.py[e]!;
      const d = Math.hypot(dx, dy);
      nx = dx / d;
      ny = dy / d;
      wall = this.pointWall[e]!;
    }
    const vn = p.vx[i]! * nx + p.vy[i]! * ny;
    if (this.type[wall] === THERMAL) {
      // Leave at the wall's flux-weighted normal speed, away from the wall.
      const outward = vn < 0 ? 1 : -1; // the normal's side the particle is on
      const speed = Math.sqrt((2 * BOLTZMANN * this.temperature[wall]!) / (p.mass[i]! * AMU_KG)); // prettier-ignore
      p.vx[i] = p.vx[i]! - vn * nx + outward * speed * nx;
      p.vy[i] = p.vy[i]! - vn * ny + outward * speed * ny;
      return;
    }
    p.vx[i] = p.vx[i]! - 2 * vn * nx;
    p.vy[i] = p.vy[i]! - 2 * vn * ny;
  }

  /** Crossing the edge of wall w's well: gain its depth going in, pay it (or bounce) going out. */
  private crossWell(p: Particles, i: number, w: number, entering: boolean): void {
    // The edge's normal: from the nearest point of the wall to the centre.
    const x = p.x[i]!;
    const y = p.y[i]!;
    let best = Infinity;
    let nx = 0;
    let ny = 0;
    for (let s = this.firstSegment[w]!; s < this.firstSegment[w + 1]!; s++) {
      const dx = x - this.ax[s]!;
      const dy = y - this.ay[s]!;
      const along = Math.min(Math.max(dx * this.ux[s]! + dy * this.uy[s]!, 0), this.length[s]!);
      const ox = dx - along * this.ux[s]!;
      const oy = dy - along * this.uy[s]!;
      const d = Math.hypot(ox, oy);
      if (d < best) {
        best = d;
        nx = ox / d;
        ny = oy / d;
      }
    }
    const vn = p.vx[i]! * nx + p.vy[i]! * ny; // > 0 moving away from the wall
    const twoEOverM = (2 * this.wellEnergy[w]!) / p.mass[i]!;
    let vnNew: number;
    const slot = i * this.wallCount + w;
    if (entering) {
      vnNew = -Math.sqrt(vn * vn + twoEOverM);
      this.inWell[slot] = 1;
    } else {
      const under = vn * vn - twoEOverM;
      if (under >= 0) {
        vnNew = Math.sqrt(under);
        this.inWell[slot] = 0;
      } else {
        vnNew = -vn; // not enough to climb out: back in
      }
    }
    p.vx[i] = p.vx[i]! + (vnNew - vn) * nx;
    p.vy[i] = p.vy[i]! + (vnNew - vn) * ny;
  }
}
