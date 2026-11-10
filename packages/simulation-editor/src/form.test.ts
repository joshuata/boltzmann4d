import { describe, expect, it } from 'vitest';
import {
  loadPresetScenario,
  scenarioToSetFile,
  setFileToScenario,
} from '@boltzmann4d/engine/scenario';
import { checkForm, formFromScenario, scenarioFromForm } from './form';

describe('editor form', () => {
  it('leaves every preset unchanged when nothing is edited', async () => {
    for (const name of ['default', '2Dmixture', '2Dhotcold', '2Dliquid', '3Deffuse', '2Dequil']) {
      const base = await loadPresetScenario(name);
      expect(scenarioFromForm(base, formFromScenario(base))).toStrictEqual(base);
    }
  });

  it('reads a preset into fields', async () => {
    const form = formFromScenario(await loadPresetScenario('2Dhotcold'));
    expect(form).toMatchObject({
      dimensions: 2,
      boundary: 'DIVIDED',
      red: { enabled: true, count: 30, placed: 30, temperature: 500 },
      blue: { enabled: true, count: 30, placed: 30, temperature: 300 },
    });
  });

  it('builds a scenario that runs and saves as .set', async () => {
    const base = await loadPresetScenario('2Dequil');
    const form = formFromScenario(base);
    form.boundary = 'HOLE';
    form.maxwellDemon = true;
    form.blue = { enabled: true, count: 20, mass: 32, radius: 1.5, temperature: 600, placed: 0 };
    const { scenario, problems, fields } = checkForm(base, form);
    expect(fields).toEqual({});
    expect(problems).toEqual([]);
    expect(scenario?.modes.maxwellDemon).toBe(true);
    expect(setFileToScenario(scenarioToSetFile(scenario!)).scenario).toStrictEqual(scenario);
  });

  it('drops modes the arena or species no longer allow', async () => {
    const base = await loadPresetScenario('2Dequil');
    const form = formFromScenario(base);
    form.reaction = true;
    form.maxwellDemon = true;
    form.blue.enabled = true;
    const scenario = scenarioFromForm(base, form);
    expect(scenario.modes).toEqual({ maxwellDemon: false });
    expect(scenario.reactions).toEqual([]);
  });

  it('reports fields out of range, and scenarios that cannot run', async () => {
    const base = await loadPresetScenario('2Dequil');
    const form = formFromScenario(base);
    form.red.mass = 0;
    form.size[0] = NaN;
    expect(checkForm(base, form)).toEqual({
      scenario: null,
      fields: { 'size.0': 'Enter a number.', 'red.mass': 'Between 0.001 and 999 amu.' },
      problems: [],
    });
    const crowded = formFromScenario(base);
    crowded.red.radius = 20;
    expect(checkForm(base, crowded).problems).toEqual([expect.stringMatching(/do not fit/)]);
    const empty = formFromScenario(base);
    empty.red.enabled = false;
    expect(checkForm(base, empty).problems).toContain('Add some red or blue particles.');
  });

  it('places everything at random once the arena changes', async () => {
    const base = await loadPresetScenario('default');
    const form = formFromScenario(base);
    form.red.count = 60;
    expect(scenarioFromForm(base, form).populations[0]?.particles).toHaveLength(50);
    form.boundary = 'DIVIDED';
    const divided = scenarioFromForm(base, form).populations[0];
    expect(divided?.particles).toEqual([]);
    expect(divided?.randomlyPlaced).toEqual([{ count: 60, averageVelocity: expect.any(Number) }]);
  });

  it('rewrites temperatures for a new dimension', async () => {
    const base = await loadPresetScenario('2Dequil');
    const form = formFromScenario(base);
    form.dimensions = 3;
    const scenario = scenarioFromForm(base, form);
    expect(formFromScenario(scenario).red.temperature).toBeCloseTo(form.red.temperature, 6);
  });
});
