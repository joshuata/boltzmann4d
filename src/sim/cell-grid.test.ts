import { describe, expect, it } from 'vitest';
import { CellGrid } from './cell-grid';
import type { Arena } from './particles';
import { ArenaType } from './simulation-info';

const arena = (type: ArenaType, size = 10): Arena => ({ type, xSize: size, ySize: size, zSize: 0 });

describe('CellGrid', () => {
  it('uses cells at least as wide as the contact distance', () => {
    const grid = new CellGrid(arena(ArenaType.REFLECTING_BOUNDARIES), 0, 1.5);
    expect(grid.nx).toBe(6); // floor(10 / 1.5)
    expect(grid.cellWidth).toBeGreaterThanOrEqual(1.5);
  });

  it('collapses an axis with fewer than 3 cells to one cell (no duplicate neighbours)', () => {
    const grid = new CellGrid(arena(ArenaType.PERIODIC_BOUNDARIES), 0, 4);
    expect([grid.nx, grid.ny]).toEqual([1, 1]);
    expect(grid.offsetsX).toEqual([0]);
  });

  it('wraps neighbours in periodic arenas but not in reflecting ones', () => {
    // 0.99 so a 10-wide arena gets exactly 10 cells (cells are made a hair wider than asked).
    const periodic = new CellGrid(arena(ArenaType.PERIODIC_BOUNDARIES), 0, 0.99);
    const reflecting = new CellGrid(arena(ArenaType.REFLECTING_BOUNDARIES), 0, 0.99);
    expect(periodic.neighbour(0, 0, -1, -1)).toBe(9 * 10 + 9);
    expect(reflecting.neighbour(0, 0, -1, 0)).toBe(-1);
    expect(reflecting.neighbour(4, 5, 1, 1)).toBe(6 * 10 + 5);
  });

  it('maps positions to cells, including periodic positions just below zero', () => {
    const grid = new CellGrid(arena(ArenaType.PERIODIC_BOUNDARIES), 0, 0.99);
    expect(grid.nx).toBe(10);
    expect(grid.columnOf(0)).toBe(0);
    expect(grid.columnOf(9.99)).toBe(9);
    expect(grid.columnOf(-0.2)).toBe(9);
    expect(grid.rowOf(10.5)).toBe(9); // clamped
  });

  it('keeps cell membership lists consistent', () => {
    const grid = new CellGrid(arena(ArenaType.REFLECTING_BOUNDARIES), 4, 1);
    for (let i = 0; i < 4; i++) grid.insert(i, 7);
    grid.move(1, 8);
    grid.remove(3);
    const members = (cell: number) => {
      const out: number[] = [];
      for (let k = grid.head[cell]!; k >= 0; k = grid.next[k]!) out.push(k);
      return out.sort();
    };
    expect(members(7)).toEqual([0, 2]);
    expect(members(8)).toEqual([1]);
    expect(Array.from(grid.cellOf)).toEqual([7, 8, 7, -1]);
  });
});
