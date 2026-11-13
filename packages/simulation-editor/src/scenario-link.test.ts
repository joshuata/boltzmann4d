import { describe, expect, it } from 'vitest';
import { loadPresetScenario, ScenarioError } from '@boltzmann4d/engine/scenario';
import { decodeScenarioLink, encodeScenarioLink } from './scenario-link';

describe('scenario links', () => {
  it('round-trips a scenario with its name, in URL-safe characters', async () => {
    const scenario = await loadPresetScenario('2Dhotcold');
    const code = await encodeScenarioLink(scenario, '  Hot and cold  ');
    expect(code).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(await decodeScenarioLink(code)).toEqual({ ...scenario, name: 'Hot and cold' });
  });

  it('rejects codes that are not links', async () => {
    await expect(decodeScenarioLink('nonsense')).rejects.toThrow(/not a Boltzmann 4D/);
  });

  it('reports damaged links', async () => {
    const code = await encodeScenarioLink(await loadPresetScenario('2Dhotcold'), 'x');
    await expect(decodeScenarioLink(code.slice(0, code.length / 2))).rejects.toThrow(/damaged/);
  });

  it('validates the scenario inside', async () => {
    const scenario = await loadPresetScenario('2Dhotcold');
    const code = await encodeScenarioLink({ ...scenario, kinds: [] }, 'x');
    await expect(decodeScenarioLink(code)).rejects.toBeInstanceOf(ScenarioError);
  });
});
