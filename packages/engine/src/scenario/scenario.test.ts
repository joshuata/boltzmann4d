import { describe, expect, it } from 'vitest';
import { loadSetFile } from '../io/load';
import { loadDefaultSetFileText, loadPresetText, presetNames } from '../io/presets';
import { SetFileError } from '../io/set-file';
import { resolveScenario } from './resolve';
import {
  parseScenario,
  parseScenarioJson,
  ScenarioError,
  stringifyScenario,
  validateScenario,
  type ScenarioInput,
} from './schema';
import { scenarioToSetFile, setFileToScenario } from './set-convert';

/** Same seeded generator as the loader tests, so runs are reproducible. */
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

describe.each(presetNames)('%s', (name) => {
  it('round-trips .set → JSON → .set without loss', async () => {
    const { scenario } = setFileToScenario(await loadPresetText(name));
    const rewritten = scenarioToSetFile(scenario);
    expect(setFileToScenario(rewritten).scenario).toStrictEqual(scenario);
    // Writing is stable: a second pass gives the same text.
    expect(scenarioToSetFile(setFileToScenario(rewritten).scenario)).toBe(rewritten);
  });

  it('round-trips through JSON text', async () => {
    const { scenario } = setFileToScenario(await loadPresetText(name));
    expect(parseScenarioJson(stringifyScenario(scenario))).toStrictEqual(scenario);
  });

  it('runs the same from .set, JSON and the rewritten .set', async () => {
    const text = await loadPresetText(name);
    const fromSet = loadSetFile(text, { random: seededRandom(7) }).scenario;
    const json = parseScenarioJson(stringifyScenario(setFileToScenario(text).scenario));
    expect(resolveScenario(json, { random: seededRandom(7) })).toStrictEqual(fromSet);
    const rewritten = scenarioToSetFile(json);
    expect(loadSetFile(rewritten, { random: seededRandom(7) }).scenario).toStrictEqual(fromSet);
  });
});

async function defaultScenario() {
  return setFileToScenario(await loadDefaultSetFileText()).scenario;
}

describe('scenarioToSetFile', () => {
  it('writes exponents the way Java NumberFormat reads them (E, no +)', async () => {
    const scenario = await defaultScenario();
    scenario.statistics.abscissaLimits = { KINETIC_ENERGY: { both: [1e-7, 1e21] } };
    const text = scenarioToSetFile(scenario);
    expect(text).toContain('both_limits 1E-7 1E21');
    expect(setFileToScenario(text).scenario.statistics.abscissaLimits).toEqual({
      KINETIC_ENERGY: { both: [1e-7, 1e21] },
    });
  });

  it('writes and reads back custom colour schemes', async () => {
    const text = (await loadDefaultSetFileText()).replace(
      'color_scheme DARK',
      'color_scheme CUSTOM: 0xFF0000, 0x0000ff 0 0x808080 0x010203',
    );
    const { scenario } = setFileToScenario(text);
    expect(scenario.display.customColors).toEqual({
      red: '#FF0000',
      blue: '#0000FF',
      background: '#000000',
      divider: '#808080',
      walls3D: ['#010203'],
    });
    const rewritten = scenarioToSetFile(scenario);
    expect(rewritten).toContain(
      'color_scheme CUSTOM: 0xFF0000 0x0000FF 0x000000 0x808080 0x010203',
    );
    expect(setFileToScenario(rewritten).scenario).toStrictEqual(scenario);
  });
});

describe('validateScenario', () => {
  const minimal = (): ScenarioInput => ({
    format: 'boltzmann4d-scenario',
    version: 1,
    arena: { dimensions: 2, size: [70, 50, 10], boundary: 'REFLECTING', holeSize: 8 },
    modes: { maxwellDemon: false, reaction: false },
    particleGroups: [
      {
        color: 'RED',
        mass: 2,
        radius: 1,
        temperature: 300,
        randomlyPlaced: [{ count: 50, averageVelocity: 0 }],
      },
    ],
    run: { paused: false, speed: '1x' },
    statistics: {
      name: 'INSTANTANEOUS_SPEED',
      color: 'BOTH',
      cumulative: false,
      width: false,
      history: false,
      pressureAveragingTime: 60,
      forgetTime: 4,
      pressurePredictionMode: 'IDEAL',
    },
    display: {
      colorScheme: 'DARK',
      lighting: true,
      viewingAngles: [0, 0],
      coloringMode: 'NORMAL',
      traceMode: false,
      tracePointSize: 2,
    },
  });

  it('fills in defaults for optional sections', () => {
    const scenario = parseScenario(minimal());
    expect(scenario.arena.dividerThermalMode).toBe('INSULATING');
    expect(scenario.particleGroups[0]?.particles).toEqual([]);
    expect(scenario.statistics.abscissaLimits).toEqual({});
  });

  it('runs a hand-written file', () => {
    const species = resolveScenario(parseScenario(minimal()), { random: seededRandom(3) }).species;
    expect(species).toHaveLength(1);
    expect(species[0]?.positions).toHaveLength(150);
    expect(species[0]?.initialTemperature).toBe(300);
  });

  it('reports every problem with its path', () => {
    const input = minimal() as unknown as Record<string, Record<string, unknown>>;
    input.arena!.dimensions = 4;
    input.arena!.size = [70, -1, 10];
    (input.particleGroups as unknown as Record<string, unknown>[])[0]!.temperature = 2000;
    const result = validateScenario(input);
    expect(result.success).toBe(false);
    expect(!result.success && result.problems).toEqual([
      'arena.dimensions: dimensions must be 1, 2 or 3, not 4',
      'arena.size[1]: Too small: expected number to be >0',
      'particleGroups[0].temperature: Particle group temperature must be between 0 and 1500 K',
    ]);
  });

  it('needs custom colours for the CUSTOM scheme', () => {
    const input = minimal();
    input.display.colorScheme = 'CUSTOM';
    expect(() => parseScenario(input)).toThrow(
      'display.customColors: colorScheme CUSTOM needs customColors',
    );
  });

  it('rejects other JSON documents', () => {
    expect(() => parseScenarioJson('{"hello": 1}')).toThrow(ScenarioError);
    expect(() => parseScenarioJson('{"hello": 1}')).toThrow(/Not a Boltzmann 4D scenario file/);
    expect(() => parseScenarioJson('not json')).toThrow(/Not valid JSON/);
  });

  it('reports .set problems as SetFileError', async () => {
    const text = (await loadDefaultSetFileText()).replace('boundary REFLECTING', 'boundary BOUNCY');
    expect(() => setFileToScenario(text)).toThrow(SetFileError);
    expect(() => setFileToScenario(text)).toThrow(/Unknown boundary mode: BOUNCY/);
  });
});
