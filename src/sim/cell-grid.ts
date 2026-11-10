// Uniform cell grid over a 2D arena (plan 0003). Cells are at least as wide as the largest
// contact distance between two particles, so a particle can only touch particles in its
// own cell and the 8 around it (wrapping in periodic arenas). An axis with fewer than 3
// cells collapses to 1, so neighbour cells are never visited twice.
//
// Membership is a doubly linked list per cell in typed arrays.
import { ArenaType } from './simulation-info';
import type { Arena } from './particles';

export class CellGrid {
  readonly nx: number;
  readonly ny: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly periodic: boolean;
  /** Cell of each particle. */
  readonly cellOf: Int32Array;
  /** First particle in each cell, or -1. */
  readonly head: Int32Array;
  readonly next: Int32Array;
  readonly prev: Int32Array;
  /** Neighbour offsets per axis: [0] for a single cell, else [-1, 0, 1]. */
  readonly offsetsX: readonly number[];
  readonly offsetsY: readonly number[];
  readonly xSize: number;
  readonly ySize: number;

  constructor(arena: Arena, particleCount: number, minCellSize: number) {
    // A hair larger than required, so round-off at cell edges can't hide a contact.
    const size = minCellSize * (1 + 1e-9);
    const axisCells = (length: number) => {
      const n = Math.floor(length / size);
      return n >= 3 ? n : 1;
    };
    this.xSize = arena.xSize;
    this.ySize = arena.ySize;
    this.nx = size > 0 ? axisCells(arena.xSize) : 1;
    this.ny = size > 0 ? axisCells(arena.ySize) : 1;
    this.cellWidth = arena.xSize / this.nx;
    this.cellHeight = arena.ySize / this.ny;
    this.periodic = arena.type === ArenaType.PERIODIC_BOUNDARIES;
    this.offsetsX = this.nx === 1 ? [0] : [-1, 0, 1];
    this.offsetsY = this.ny === 1 ? [0] : [-1, 0, 1];
    this.cellOf = new Int32Array(particleCount).fill(-1);
    this.head = new Int32Array(this.nx * this.ny).fill(-1);
    this.next = new Int32Array(particleCount).fill(-1);
    this.prev = new Int32Array(particleCount).fill(-1);
  }

  /** Cell column for an x position (periodic positions may sit just below 0). */
  columnOf(x: number): number {
    if (this.periodic && x < 0) x += this.xSize;
    const c = Math.floor(x / this.cellWidth);
    return c < 0 ? 0 : c >= this.nx ? this.nx - 1 : c;
  }

  rowOf(y: number): number {
    if (this.periodic && y < 0) y += this.ySize;
    const r = Math.floor(y / this.cellHeight);
    return r < 0 ? 0 : r >= this.ny ? this.ny - 1 : r;
  }

  insert(i: number, cell: number): void {
    const first = this.head[cell]!;
    this.next[i] = first;
    this.prev[i] = -1;
    if (first >= 0) this.prev[first] = i;
    this.head[cell] = i;
    this.cellOf[i] = cell;
  }

  remove(i: number): void {
    const cell = this.cellOf[i]!;
    const before = this.prev[i]!;
    const after = this.next[i]!;
    if (before >= 0) this.next[before] = after;
    else this.head[cell] = after;
    if (after >= 0) this.prev[after] = before;
    this.cellOf[i] = -1;
  }

  move(i: number, cell: number): void {
    this.remove(i);
    this.insert(i, cell);
  }

  /** Index of the neighbour of (cx, cy) at offset (dx, dy), or -1 outside a reflecting arena. */
  neighbour(cx: number, cy: number, dx: number, dy: number): number {
    let x = cx + dx;
    let y = cy + dy;
    if (x < 0 || x >= this.nx) {
      if (!this.periodic) return -1;
      x = (x + this.nx) % this.nx;
    }
    if (y < 0 || y >= this.ny) {
      if (!this.periodic) return -1;
      y = (y + this.ny) % this.ny;
    }
    return y * this.nx + x;
  }
}
