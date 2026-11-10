// Uniform cell grid over a 2D or 3D arena (plan 0003). Cells are at least as wide as the
// largest contact distance between two particles, so a particle can only touch particles
// in its own cell and the 8 (2D) or 26 (3D) around it, wrapping in periodic arenas. An
// axis with fewer than 3 cells collapses to 1, so neighbour cells are never visited twice.
// Cells are numbered (z · ny + y) · nx + x; a 2D grid has a single z layer.
//
// Membership is a doubly linked list per cell in typed arrays.
import { ArenaType } from './simulation-info';
import type { Arena } from './particles';

export class CellGrid {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly cellDepth: number;
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
  readonly offsetsZ: readonly number[];
  /**
   * Each cell's neighbours (itself included): `neighbourCount` entries per cell, -1 for
   * those outside a reflecting arena. A flat table is quicker to walk than offsets.
   */
  readonly neighbours: Int32Array;
  readonly neighbourCount: number;
  readonly xSize: number;
  readonly ySize: number;
  readonly zSize: number;

  constructor(arena: Arena, particleCount: number, minCellSize: number, dimension: 2 | 3 = 2) {
    // A hair larger than required, so round-off at cell edges can't hide a contact.
    const size = minCellSize * (1 + 1e-9);
    const axisCells = (length: number) => {
      const n = Math.floor(length / size);
      return n >= 3 ? n : 1;
    };
    this.xSize = arena.xSize;
    this.ySize = arena.ySize;
    this.zSize = dimension === 3 ? arena.zSize : 1;
    this.nx = size > 0 ? axisCells(arena.xSize) : 1;
    this.ny = size > 0 ? axisCells(arena.ySize) : 1;
    this.nz = size > 0 && dimension === 3 ? axisCells(arena.zSize) : 1;
    this.cellWidth = arena.xSize / this.nx;
    this.cellHeight = arena.ySize / this.ny;
    this.cellDepth = this.zSize / this.nz;
    this.periodic = arena.type === ArenaType.PERIODIC_BOUNDARIES;
    this.offsetsX = this.nx === 1 ? [0] : [-1, 0, 1];
    this.offsetsY = this.ny === 1 ? [0] : [-1, 0, 1];
    this.offsetsZ = this.nz === 1 ? [0] : [-1, 0, 1];
    this.cellOf = new Int32Array(particleCount).fill(-1);
    const cells = this.nx * this.ny * this.nz;
    this.head = new Int32Array(cells).fill(-1);
    this.neighbourCount = this.offsetsX.length * this.offsetsY.length * this.offsetsZ.length;
    this.neighbours = new Int32Array(cells * this.neighbourCount);
    let m = 0;
    for (let cz = 0; cz < this.nz; cz++) {
      for (let cy = 0; cy < this.ny; cy++) {
        for (let cx = 0; cx < this.nx; cx++) {
          for (const dz of this.offsetsZ) {
            for (const dy of this.offsetsY) {
              for (const dx of this.offsetsX) {
                this.neighbours[m++] = this.neighbour(cx, cy, cz, dx, dy, dz);
              }
            }
          }
        }
      }
    }
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

  layerOf(z: number): number {
    if (this.nz === 1) return 0;
    if (this.periodic && z < 0) z += this.zSize;
    const l = Math.floor(z / this.cellDepth);
    return l < 0 ? 0 : l >= this.nz ? this.nz - 1 : l;
  }

  /** The cell holding position (x, y, z); z is ignored in 2D. */
  cellAt(x: number, y: number, z: number): number {
    return (this.layerOf(z) * this.ny + this.rowOf(y)) * this.nx + this.columnOf(x);
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

  /**
   * Index of the neighbour of cell (cx, cy, cz) at offset (dx, dy, dz), or -1 outside a
   * reflecting arena.
   */
  neighbour(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): number {
    let x = cx + dx;
    let y = cy + dy;
    let z = cz + dz;
    if (x < 0 || x >= this.nx) {
      if (!this.periodic) return -1;
      x = (x + this.nx) % this.nx;
    }
    if (y < 0 || y >= this.ny) {
      if (!this.periodic) return -1;
      y = (y + this.ny) % this.ny;
    }
    if (z < 0 || z >= this.nz) {
      if (!this.periodic) return -1;
      z = (z + this.nz) % this.nz;
    }
    return (z * this.ny + y) * this.nx + x;
  }
}
