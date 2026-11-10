import { describe, expect, it } from 'vitest';
import { ArenaType } from '../sim/simulation-info';
import { avgKineticEnergy } from '../stats/formulas';
import { calculateTotalKE, loadSettings } from './load';
import { loadDefaultSettingsText, loadPresetText, presetNames } from './presets';
import { SetFileError } from './set-file';

/** Same seeded generator as the stub physics, so runs are reproducible. */
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

const rows = (array: Float64Array) =>
  Array.from({ length: array.length / 3 }, (_, i) => Array.from(array.subarray(i * 3, i * 3 + 3)));

describe('presets', () => {
  it('bundles all 27 Boltzmann 3D presets', () => {
    expect(presetNames).toHaveLength(27);
    expect(presetNames).toContain('2Dmixture');
    expect(presetNames).toContain('default');
  });

  it.each(presetNames)('loads %s', async (name) => {
    const { settings, warnings } = loadSettings(await loadPresetText(name), {
      random: seededRandom(1),
    });
    expect(warnings).toEqual([]);
    expect(settings.species.length).toBeGreaterThan(0);
    for (const species of settings.species) {
      expect(species.positions.length).toBe(species.velocities.length);
      expect(species.positions.every(Number.isFinite)).toBe(true);
      expect(species.velocities.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('loadSettings', () => {
  it('reads global settings and randomly placed groups (2Dmixture)', async () => {
    const { settings, version } = loadSettings(await loadPresetText('2Dmixture'), {
      random: seededRandom(2),
    });
    expect(version).toBe('V2.43');
    expect(settings).toMatchObject({
      dimension: 2,
      arenaType: ArenaType.REFLECTING_BOUNDARIES,
      // nm -> m is `value * 1e-9`, exactly as in Java.
      arenaXSize: 70 * 1e-9,
      arenaYSize: 50 * 1e-9,
      arenaZSize: 10 * 1e-9,
      holeDiameter: 8e-9,
      paused: false,
      simulationSpeed: '1x',
      statName: 'INSTANTANEOUS_SPEED',
      statColor: 'BOTH',
      colorScheme: 'DARK',
      maxwellDemonMode: false,
    });
    expect(settings.abscissaLimits.get('COLLISION_RATE')?.red).toEqual([4.8144e-2, 0.14443]);

    const [red, blue] = settings.species;
    expect(red?.type).toMatchObject({
      displayName: 'Red',
      particleMass: 2,
      particleRadius: 0.7 * 1e-9,
    });
    expect(blue?.type).toMatchObject({
      displayName: 'Blue',
      particleMass: 32,
      particleRadius: 1.1 * 1e-9,
    });
    expect(red?.positions.length).toBe(30 * 3);
    expect(blue?.positions.length).toBe(30 * 3);

    for (const [x = 0, y = 0] of rows(red?.positions ?? new Float64Array())) {
      expect(x).toBeGreaterThanOrEqual(0.7e-9);
      expect(x).toBeLessThanOrEqual(70e-9 - 0.7e-9);
      expect(y).toBeGreaterThanOrEqual(0.7e-9);
      expect(y).toBeLessThanOrEqual(50e-9 - 0.7e-9);
    }
    for (const [vx = 0, vy = 0, vz = 0] of rows(blue?.velocities ?? new Float64Array())) {
      expect(Math.hypot(vx, vy)).toBeCloseTo(394.837, 9);
      expect(vz).toBe(0);
    }
  });

  it('is reproducible for a given random source', async () => {
    const text = await loadPresetText('3Dmixture');
    const a = loadSettings(text, { random: seededRandom(9) }).settings.species;
    const b = loadSettings(text, { random: seededRandom(9) }).settings.species;
    expect(a).toEqual(b);
  });

  it('converts explicitly placed particles (default.set)', async () => {
    const { settings } = loadSettings(await loadDefaultSettingsText());
    // The Blue group has no particles, so only Red remains.
    expect(settings.species.map((s) => s.type.displayName)).toEqual(['Red']);
    const [red] = settings.species;
    const [position, velocity] = [rows(red!.positions)[0], rows(red!.velocities)[0]];
    expect(position).toEqual([30.662509904308962 * 1e-9, 39.252027832806874 * 1e-9, 0]);
    const speed = 1579.3484959644366;
    const theta = 2.4096476097076787;
    expect(velocity).toEqual([Math.cos(theta) * speed, Math.sin(theta) * speed, 0]);
  });

  it('scales group velocities to the requested temperature (2Dhotcold)', async () => {
    const { settings } = loadSettings(await loadPresetText('2Dhotcold'));
    const temperatures = settings.species.map((s) => s.initialTemperature);
    expect(temperatures).toEqual([500, 300]);
    for (const species of settings.species) {
      const velocities = rows(species.velocities);
      const meanKE = calculateTotalKE(species.type, velocities) / velocities.length;
      expect(meanKE).toBeCloseTo(avgKineticEnergy(species.initialTemperature, 2), 30);
      expect(meanKE / avgKineticEnergy(species.initialTemperature, 2)).toBeCloseTo(1, 12);
    }
  });

  describe('errors', () => {
    const base = async () => loadDefaultSettingsText();

    it.each([
      ['boundary REFLECTING', 'boundary BOUNCY', /Unknown boundary mode: BOUNCY/],
      ['dimensions 2', 'dimensions 4', /dimensions must be 1, 2 or 3/],
      ['color Red', 'color Green', /must be RED or BLUE, not GREEN/],
      ['color Red', 'color Red\n  temperature 2000', /temperature must be between 0 and 1500/],
      ['  boundary REFLECTING\n', '', /GlobalSettings.boundary is missing/],
    ])('replacing %j with %j fails', async (from, to, message) => {
      const text = (await base()).replace(from, to);
      expect(() => loadSettings(text)).toThrow(SetFileError);
      expect(() => loadSettings(text)).toThrow(message);
    });

    it('warns when the header is missing', async () => {
      const text = (await base()).replace(/^#Boltzmann3D/, '#Something');
      expect(loadSettings(text).warnings).toHaveLength(1);
    });
  });

  it('accepts custom colour schemes', async () => {
    const text = (await loadDefaultSettingsText()).replace(
      'color_scheme DARK',
      // `#` starts a comment in .set files, so hex colours must use 0x.
      'color_scheme CUSTOM: 0xFF0000, 0x0000ff 0 0x808080 0x010203',
    );
    expect(loadSettings(text).settings.customColors).toEqual({
      red: 0xff0000,
      blue: 0x0000ff,
      background: 0,
      divider: 0x808080,
      walls3D: { left: 0x010203 },
    });
  });
});

describe('presetCatalog', () => {
  it('lists every bundled preset exactly once', async () => {
    const { presetCatalog } = await import('./presets');
    expect(presetCatalog.map((p) => p.name).sort()).toEqual([...presetNames]);
  });
});
