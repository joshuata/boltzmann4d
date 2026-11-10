import { describe, expect, it } from 'vitest';
import { loadSettings } from '../io/load';
import { loadDefaultSettingsText, loadPresetText, presetNames } from '../io/presets';
import { SetFileError } from '../io/set-file';
import { resolveSettings } from './resolve';
import {
  parseSettings,
  parseSettingsJson,
  SettingsError,
  stringifySettings,
  validateSettings,
  type SettingsInput,
} from './schema';
import { settingsToSet, setToSettings } from './set-convert';

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
    const { settings } = setToSettings(await loadPresetText(name));
    const rewritten = settingsToSet(settings);
    expect(setToSettings(rewritten).settings).toStrictEqual(settings);
    // Writing is stable: a second pass gives the same text.
    expect(settingsToSet(setToSettings(rewritten).settings)).toBe(rewritten);
  });

  it('round-trips through JSON text', async () => {
    const { settings } = setToSettings(await loadPresetText(name));
    expect(parseSettingsJson(stringifySettings(settings))).toStrictEqual(settings);
  });

  it('runs the same from .set, JSON and the rewritten .set', async () => {
    const text = await loadPresetText(name);
    const fromSet = loadSettings(text, { random: seededRandom(7) }).settings;
    const json = parseSettingsJson(stringifySettings(setToSettings(text).settings));
    expect(resolveSettings(json, { random: seededRandom(7) })).toStrictEqual(fromSet);
    const rewritten = settingsToSet(json);
    expect(loadSettings(rewritten, { random: seededRandom(7) }).settings).toStrictEqual(fromSet);
  });
});

async function defaultSettings() {
  return setToSettings(await loadDefaultSettingsText()).settings;
}

describe('settingsToSet', () => {
  it('writes exponents the way Java NumberFormat reads them (E, no +)', async () => {
    const settings = await defaultSettings();
    settings.statistics.abscissaLimits = { KINETIC_ENERGY: { both: [1e-7, 1e21] } };
    const text = settingsToSet(settings);
    expect(text).toContain('both_limits 1E-7 1E21');
    expect(setToSettings(text).settings.statistics.abscissaLimits).toEqual({
      KINETIC_ENERGY: { both: [1e-7, 1e21] },
    });
  });

  it('writes and reads back custom colour schemes', async () => {
    const text = (await loadDefaultSettingsText()).replace(
      'color_scheme DARK',
      'color_scheme CUSTOM: 0xFF0000, 0x0000ff 0 0x808080 0x010203',
    );
    const { settings } = setToSettings(text);
    expect(settings.display.customColors).toEqual({
      red: '#FF0000',
      blue: '#0000FF',
      background: '#000000',
      divider: '#808080',
      walls3D: ['#010203'],
    });
    const rewritten = settingsToSet(settings);
    expect(rewritten).toContain(
      'color_scheme CUSTOM: 0xFF0000 0x0000FF 0x000000 0x808080 0x010203',
    );
    expect(setToSettings(rewritten).settings).toStrictEqual(settings);
  });
});

describe('validateSettings', () => {
  const minimal = (): SettingsInput => ({
    format: 'boltzmann4d-settings',
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
    const settings = parseSettings(minimal());
    expect(settings.arena.dividerThermalMode).toBe('INSULATING');
    expect(settings.particleGroups[0]?.particles).toEqual([]);
    expect(settings.statistics.abscissaLimits).toEqual({});
  });

  it('runs a hand-written file', () => {
    const species = resolveSettings(parseSettings(minimal()), { random: seededRandom(3) }).species;
    expect(species).toHaveLength(1);
    expect(species[0]?.positions).toHaveLength(150);
    expect(species[0]?.initialTemperature).toBe(300);
  });

  it('reports every problem with its path', () => {
    const input = minimal() as unknown as Record<string, Record<string, unknown>>;
    input.arena!.dimensions = 4;
    input.arena!.size = [70, -1, 10];
    (input.particleGroups as unknown as Record<string, unknown>[])[0]!.temperature = 2000;
    const result = validateSettings(input);
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
    expect(() => parseSettings(input)).toThrow(
      'display.customColors: colorScheme CUSTOM needs customColors',
    );
  });

  it('rejects other JSON documents', () => {
    expect(() => parseSettingsJson('{"hello": 1}')).toThrow(SettingsError);
    expect(() => parseSettingsJson('{"hello": 1}')).toThrow(/Not a Boltzmann 4D settings file/);
    expect(() => parseSettingsJson('not json')).toThrow(/Not valid JSON/);
  });

  it('reports .set problems as SetFileError', async () => {
    const text = (await loadDefaultSettingsText()).replace(
      'boundary REFLECTING',
      'boundary BOUNCY',
    );
    expect(() => setToSettings(text)).toThrow(SetFileError);
    expect(() => setToSettings(text)).toThrow(/Unknown boundary mode: BOUNCY/);
  });
});
