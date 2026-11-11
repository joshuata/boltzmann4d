import { describe, expect, it } from 'vitest';
import { resolveScenario } from './resolve';
import { describeSpecies, scenarioProblems, withArenaSize, withSpecies } from './edit';
import { loadPresetScenario } from './sources';

function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const xs = (positions: Float64Array) => positions.filter((_, i) => i % 3 === 0);

describe('describeSpecies', () => {
  it('infers the temperature of randomly placed particles from their speed', async () => {
    // 2Dhyd100: hydrogen at 100 K, given as an average velocity.
    const red = describeSpecies(await loadPresetScenario('2Dhyd100'), 'red');
    expect(red).toMatchObject({ placed: 0, mass: 2 });
    expect(red?.temperature).toBeCloseTo(100, 0);
  });

  it('counts placed particles and uses the group temperature', async () => {
    const scenario = await loadPresetScenario('2Dhotcold');
    expect(describeSpecies(scenario, 'red')).toEqual({
      count: 30,
      placed: 30,
      mass: 2,
      radius: 0.7,
      temperature: 500,
    });
    expect(describeSpecies(scenario, 'blue')?.temperature).toBe(300);
  });

  it('is null for a colour with no groups', async () => {
    const scenario = await loadPresetScenario('2Dequil');
    expect(describeSpecies(scenario, 'blue')).toBeNull();
  });
});

describe('withSpecies', () => {
  it('writes a species back as it reads, and runs at that temperature', async () => {
    const base = await loadPresetScenario('2Dequil');
    const setup = { count: 40, mass: 4, radius: 1, temperature: 450 };
    const edited = withSpecies(base, 'blue', setup);
    expect(describeSpecies(edited, 'blue')).toEqual({ ...setup, placed: 0 });
    expect(edited.populations.map((p) => p.kind)).toEqual(['red', 'blue']);
    const blue = resolveScenario(edited, { random: seededRandom(1) }).species[1];
    expect(blue?.positions).toHaveLength(120);
    expect(blue?.initialTemperature).toBe(450);
  });

  it('keeps placed particles, adding or dropping the rest', async () => {
    const base = await loadPresetScenario('2Dhotcold');
    const more = withSpecies(base, 'red', { count: 35, mass: 2, radius: 0.7, temperature: 500 });
    expect(describeSpecies(more, 'red')).toMatchObject({ count: 35, placed: 30 });
    const fewer = withSpecies(base, 'red', { count: 10, mass: 2, radius: 0.7, temperature: 500 });
    expect(describeSpecies(fewer, 'red')).toMatchObject({ count: 10, placed: 10 });
    expect(fewer.populations[0]?.particles).toEqual(base.populations[0]?.particles.slice(0, 10));
  });

  it('removes a colour with a count of 0', async () => {
    const base = await loadPresetScenario('2Dmixture');
    const edited = withSpecies(base, 'red', { count: 0, mass: 2, radius: 1, temperature: 300 });
    expect(edited.populations.map((p) => p.kind)).toEqual(['blue']);
  });
});

describe('random placement in divided arenas (FILE-3)', () => {
  it('puts red on the left and blue on the right of a divider', async () => {
    const base = await loadPresetScenario('2Dmixture');
    const divided = { ...base, arena: { ...base.arena, boundary: 'DIVIDED' as const } };
    const [red, blue] = resolveScenario(divided, { random: seededRandom(2) }).species;
    const half = (base.arena.size[0] / 2) * 1e-9;
    expect(xs(red!.positions).every((x) => x < half)).toBe(true);
    expect(xs(blue!.positions).every((x) => x > half)).toBe(true);
  });

  it('puts everything on the left of a divider with a hole', async () => {
    const base = await loadPresetScenario('2Dmixture');
    const hole = { ...base, arena: { ...base.arena, boundary: 'HOLE' as const } };
    const half = (base.arena.size[0] / 2) * 1e-9;
    for (const s of resolveScenario(hole, { random: seededRandom(3) }).species) {
      expect(xs(s.positions).every((x) => x < half)).toBe(true);
    }
  });
});

describe('scenarioProblems', () => {
  it('accepts every preset', async () => {
    for (const name of ['default', '2Dmixture', '2Dliquid', '3Dmixture', '2Dhotcold']) {
      expect(scenarioProblems(await loadPresetScenario(name))).toEqual([]);
    }
  });

  it('notices particles that do not fit, and too many', async () => {
    const base = await loadPresetScenario('2Dequil');
    const crowded = withSpecies(base, 'red', { count: 900, mass: 2, radius: 5, temperature: 300 });
    expect(scenarioProblems(crowded)).toEqual([expect.stringMatching(/do not fit in the arena/)]);
    const many = withSpecies(base, 'red', { count: 1000, mass: 2, radius: 0.2, temperature: 300 });
    expect(scenarioProblems({ ...many, arena: { ...many.arena, size: [500, 500, 10] } })).toEqual([
      'At most 999 particles in all (this has 1000).',
    ]);
  });
});

describe('withArenaSize (OPT-1)', () => {
  it('re-places every particle at its own speed, on its side of the divider', async () => {
    const scenario = await loadPresetScenario('2Dhotcold');
    const resized = withArenaSize(scenario, [35, 50, 10]);
    expect(resized.arena.size).toEqual([35, 50, 10]);
    for (const kind of ['red', 'blue']) {
      expect(describeSpecies(resized, kind)).toEqual({
        ...describeSpecies(scenario, kind)!,
        placed: 0,
      });
    }
    expect(scenarioProblems(resized)).toEqual([]);
    const resolved = resolveScenario(resized, { random: seededRandom(1) });
    expect(resolved.arenaXSize).toBeCloseTo(35e-9, 20);
    const [red, blue] = resolved.species;
    expect(Math.max(...xs(red!.positions))).toBeLessThan(17.5e-9);
    expect(Math.min(...xs(blue!.positions))).toBeGreaterThan(17.5e-9);
  });

  it('reports an arena too small for its particles', async () => {
    const resized = withArenaSize(await loadPresetScenario('2Dhotcold'), [5, 5, 10]);
    expect(scenarioProblems(resized)).toHaveLength(1);
  });
});
