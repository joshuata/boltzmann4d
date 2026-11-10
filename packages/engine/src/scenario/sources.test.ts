import { describe, expect, it } from 'vitest';
import { loadDefaultSetFileText, loadPresetText } from '../io/presets';
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
