import { describe, expect, it } from 'vitest';
import { loadDefaultSetFileText, loadPresetText } from '../io/presets';
import { resolveScenario } from './resolve';
import { ScenarioError, stringifyScenario } from './schema';
import { setFileToScenario } from './set-convert';
import { loadPresetScenario, readScenarioFile } from './sources';

describe('loadPresetScenario', () => {
  it('loads a bundled preset, and the default without a name', async () => {
    expect(await loadPresetScenario('2Dmixture')).toStrictEqual(
      setFileToScenario(await loadPresetText('2Dmixture')).scenario,
    );
    expect(await loadPresetScenario()).toStrictEqual(
      setFileToScenario(await loadDefaultSetFileText()).scenario,
    );
  });
});

describe('readScenarioFile', () => {
  it('reads .set and .json files by extension', async () => {
    const text = await loadPresetText('2Dhotcold');
    const fromSet = readScenarioFile('hot.set', text);
    expect(fromSet.format).toBe('set');
    const fromJson = readScenarioFile('hot.json', stringifyScenario(fromSet.scenario));
    expect(fromJson).toStrictEqual({ scenario: fromSet.scenario, format: 'json', warnings: [] });
  });

  it('falls back to the content for other extensions', async () => {
    const { scenario } = readScenarioFile('a.set', await loadPresetText('2Dhotcold'));
    expect(readScenarioFile('a.txt', stringifyScenario(scenario)).format).toBe('json');
    expect(readScenarioFile('a.txt', await loadPresetText('2Dhotcold')).format).toBe('set');
  });

  it('lists problems as a ScenarioError for both formats', async () => {
    const broken = (await loadDefaultSetFileText()).replace(
      'boundary REFLECTING',
      'boundary BOUNCY',
    );
    expect(() => readScenarioFile('bad.set', broken)).toThrow(ScenarioError);
    expect(() => readScenarioFile('bad.set', broken)).toThrow(/Unknown boundary mode: BOUNCY/);
    expect(() => readScenarioFile('bad.json', '{')).toThrow(ScenarioError);
  });
});

/** A deterministic stand-in for Math.random (mulberry32). */
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

describe('opening a file from the user (FILE-3, FILE-4)', () => {
  const xs = (positions: Float64Array) => positions.filter((_, i) => i % 3 === 0);

  it('places a divided .set file without positions: red left, blue right', async () => {
    const text = (await loadPresetText('2Dmixture')).replace(
      'boundary REFLECTING',
      'boundary DIVIDED',
    );
    const { scenario } = readScenarioFile('mine.set', text);
    expect(scenario.populations.every((p) => p.particles.length === 0)).toBe(true);
    for (const seed of [1, 2, 3]) {
      const [red, blue] = resolveScenario(scenario, { random: seededRandom(seed) }).species;
      const half = (scenario.arena.size[0] / 2) * 1e-9;
      expect(xs(red!.positions).length).toBeGreaterThan(0);
      expect(xs(blue!.positions).length).toBeGreaterThan(0);
      expect(xs(red!.positions).every((x) => x < half)).toBe(true);
      expect(xs(blue!.positions).every((x) => x > half)).toBe(true);
    }
  });

  it('keeps a file paused when it was saved paused, as 2Deffuse is', async () => {
    const effuse = readScenarioFile('2Deffuse.set', await loadPresetText('2Deffuse')).scenario;
    expect(resolveScenario(effuse).paused).toBe(true);
    const asJson = readScenarioFile('2Deffuse.json', stringifyScenario(effuse)).scenario;
    expect(resolveScenario(asJson).paused).toBe(true);
    const mixture = readScenarioFile('2Dmixture.set', await loadPresetText('2Dmixture')).scenario;
    expect(resolveScenario(mixture).paused).toBe(false);
  });
});
