import { resolveScenario, validateScenario } from '@boltzmann4d/engine/scenario';
import { describe, expect, it } from 'vitest';
import {
  addKind,
  addRegion,
  addWall,
  blankScenario,
  deleteShapes,
  describeShape,
  fillsOf,
  kindUsage,
  MAX_KINDS,
  movePoint,
  moveShapes,
  populationOf,
  problemTarget,
  regionKey,
  removeKind,
  rowOf,
  setFills,
  wallKey,
} from './scenario-ops';

describe('scenario operations', () => {
  it('start from a blank scenario that runs (EDIT-17)', () => {
    const blank = blankScenario();
    expect(validateScenario(blank).success).toBe(true);
    const resolved = resolveScenario(blank);
    expect(resolved.species[0]!.positions.length / 3).toBe(50);
  });

  it('add walls and regions with fresh ids', () => {
    let s = blankScenario();
    const first = addWall(s, [[10, 10], [20, 10]], false); // prettier-ignore
    s = first.scenario;
    const second = addWall(s, [[30, 10], [30, 20], [40, 20]], true); // prettier-ignore
    s = second.scenario;
    expect([first.key, second.key]).toEqual(['wall:wall1', 'wall:wall2']);
    const region = addRegion(s, { type: 'rectangle', min: [1, 1], max: [9, 9] });
    s = region.scenario;
    expect(region.key).toBe('region:region1');
    // A new region comes filled, so it does something straight away.
    expect(fillsOf(s, 'region1').map(rowOf)).toEqual([{ kind: 'a', count: 20, temperature: 300 }]);
    expect(validateScenario(s).success).toBe(true);
    expect(describeShape(s, second.key)).toBe('Reflecting wall, closed, 3 points');
    expect(describeShape(s, region.key)).toBe('Spawn region Region 1, rectangle, 20 particles');
  });

  it('move shapes and points, keeping rectangles the right way round', () => {
    let s = addWall(blankScenario(), [[10, 10], [20, 10]], false).scenario; // prettier-ignore
    s = addRegion(s, { type: 'rectangle', min: [1, 1], max: [9, 9] }).scenario;
    s = moveShapes(s, [wallKey('wall1'), regionKey('region1')], 2, -1);
    expect(s.walls[0]!.points).toEqual([[12, 9], [22, 9]]); // prettier-ignore
    expect(s.spawnRegions[0]!.shape).toEqual({ type: 'rectangle', min: [3, 0], max: [11, 8] });
    s = movePoint(s, regionKey('region1'), 1, [1, 1]); // max dragged past min
    expect(s.spawnRegions[0]!.shape).toEqual({ type: 'rectangle', min: [1, 0], max: [3, 1] });
    s = movePoint(s, wallKey('wall1'), 0, [5, 5]);
    expect(s.walls[0]!.points[0]).toEqual([5, 5]);
  });

  it("delete shapes with their regions' fill rows", () => {
    let s = addRegion(blankScenario(), { type: 'rectangle', min: [1, 1], max: [9, 9] }).scenario;
    s = addWall(s, [[10, 10], [20, 10]], false).scenario; // prettier-ignore
    s = deleteShapes(s, [regionKey('region1'), wallKey('wall1')]);
    expect(s.walls).toEqual([]);
    expect(s.spawnRegions).toEqual([]);
    expect(s.populations).toHaveLength(1); // the arena fill
  });

  it('edit fill rows of a region without touching the others', () => {
    let s = addRegion(blankScenario(), { type: 'rectangle', min: [1, 1], max: [9, 9] }).scenario;
    const [row] = fillsOf(s, undefined);
    s = setFills(s, undefined, [
      populationOf(s, { ...rowOf(row!), count: 10, temperature: 500 }, undefined, row),
    ]);
    expect(fillsOf(s, undefined).map(rowOf)).toEqual([{ kind: 'a', count: 10, temperature: 500 }]);
    expect(fillsOf(s, 'region1').map(rowOf)).toEqual([{ kind: 'a', count: 20, temperature: 300 }]);
  });

  it('add kinds up to ten, switching to a larger palette (KIND-7)', () => {
    let s = blankScenario();
    for (let k = 1; k < 12; k++) s = addKind(s);
    expect(s.kinds).toHaveLength(MAX_KINDS);
    expect(s.kinds.map((k) => k.name).slice(0, 3)).toEqual(['A', 'B', 'C']);
    expect(s.display.palette).toBe('muted');
    expect(validateScenario(s).success).toBe(true);
  });

  it("refuse to remove a kind that's in use, saying where (KIND-3)", () => {
    let s = addKind(blankScenario());
    s = addRegion(s, { type: 'rectangle', min: [1, 1], max: [9, 9] }).scenario;
    expect(kindUsage(s, 'a')).toEqual(['the arena fill', 'the fill of Region 1']);
    expect(removeKind(s, 'a')).toEqual({
      refused: ['the arena fill', 'the fill of Region 1'],
    });
    const removed = removeKind(s, 'kind1');
    expect('scenario' in removed && removed.scenario.kinds.map((k) => k.id)).toEqual(['a']);
  });

  it('find the shape a problem is about (EDIT-16)', () => {
    let s = addWall(blankScenario(), [[10, 10], [80, 10]], false).scenario; // prettier-ignore
    s = addRegion(s, { type: 'rectangle', min: [1, 1], max: [9, 9] }).scenario;
    const result = validateScenario(s);
    expect(result.success).toBe(false);
    const problem = !result.success ? result.problems[0]! : '';
    expect(problemTarget(s, problem)).toBe('wall:wall1');
    expect(
      problemTarget(s, 'Only 3 of 20 A particles fit in spawn region Region 1 without overlapping'),
    ).toBe('region:region1');
    expect(problemTarget(s, 'Something else')).toBeNull();
  });
});
