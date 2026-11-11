import { describe, expect, it } from 'vitest';
import { ArenaType } from '../sim/simulation-info';
import { avgKineticEnergy } from '../stats/formulas';
import { calculateTotalKE, loadSetFile } from './load';
import { loadDefaultSetFileText, loadPresetText, presetNames } from './presets';
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
    const { scenario, warnings } = loadSetFile(await loadPresetText(name), {
      random: seededRandom(1),
    });
    expect(warnings).toEqual([]);
    expect(scenario.species.length).toBeGreaterThan(0);
    for (const species of scenario.species) {
      expect(species.positions.length).toBe(species.velocities.length);
      expect(species.positions.every(Number.isFinite)).toBe(true);
      expect(species.velocities.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('loadSetFile', () => {
  it('reads global scenario and randomly placed groups (2Dmixture)', async () => {
    const { scenario, version } = loadSetFile(await loadPresetText('2Dmixture'), {
      random: seededRandom(2),
    });
    expect(version).toBe('V2.43');
    expect(scenario).toMatchObject({
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
      statKinds: 'all',
      colorScheme: 'DARK',
      maxwellDemonMode: false,
    });
    expect(scenario.abscissaLimits.get('COLLISION_RATE')?.species.get(0)).toEqual([
      4.8144e-2, 0.14443,
    ]);

    const [red, blue] = scenario.species;
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
    const a = loadSetFile(text, { random: seededRandom(9) }).scenario.species;
    const b = loadSetFile(text, { random: seededRandom(9) }).scenario.species;
    expect(a).toEqual(b);
  });

  it('drops particle groups with no particles (default.set)', async () => {
    const { scenario } = loadSetFile(await loadDefaultSetFileText());
    expect(scenario.species.map((s) => s.type.displayName)).toEqual(['Red']);
    expect(scenario.species[0]!.positions).toHaveLength(50 * 3);
  });

  it('converts explicitly placed particles (2Dequal)', async () => {
    const { scenario } = loadSetFile(await loadPresetText('2Dequal'));
    const [red] = scenario.species;
    const [position, velocity] = [rows(red!.positions)[0], rows(red!.velocities)[0]];
    expect(position).toEqual([33.73 * 1e-9, 6.667 * 1e-9, 0]);
    const speed = 1252.772;
    const theta = 2.12;
    expect(velocity).toEqual([Math.cos(theta) * speed, Math.sin(theta) * speed, 0]);
  });

  it('scales group velocities to the requested temperature (2Dhotcold)', async () => {
    const { scenario } = loadSetFile(await loadPresetText('2Dhotcold'));
    const temperatures = scenario.species.map((s) => s.initialTemperature);
    expect(temperatures).toEqual([500, 300]);
    for (const species of scenario.species) {
      const velocities = rows(species.velocities);
      const meanKE = calculateTotalKE(species.type, velocities) / velocities.length;
      expect(meanKE).toBeCloseTo(avgKineticEnergy(species.initialTemperature, 2), 30);
      expect(meanKE / avgKineticEnergy(species.initialTemperature, 2)).toBeCloseTo(1, 12);
    }
  });

  describe('errors', () => {
    const base = async () => loadDefaultSetFileText();

    it.each([
      ['boundary REFLECTING', 'boundary BOUNCY', /Unknown boundary mode: BOUNCY/],
      ['dimensions 2', 'dimensions 4', /dimensions must be 1, 2 or 3/],
      ['color Red', 'color Green', /must be RED or BLUE, not GREEN/],
      ['color Red', 'color Red\n  temperature 2000', /temperature must be between 0 and 1500/],
      ['  boundary REFLECTING\n', '', /GlobalSettings.boundary is missing/],
    ])('replacing %j with %j fails', async (from, to, message) => {
      const text = (await base()).replace(from, to);
      expect(() => loadSetFile(text)).toThrow(SetFileError);
      expect(() => loadSetFile(text)).toThrow(message);
    });

    it('warns when the header is missing', async () => {
      const text = (await base()).replace(/^#Boltzmann3D/, '#Something');
      expect(loadSetFile(text).warnings).toHaveLength(1);
    });
  });

  it('accepts custom colour schemes', async () => {
    const text = (await loadDefaultSetFileText()).replace(
      'color_scheme DARK',
      // `#` starts a comment in .set files, so hex colours must use 0x.
      'color_scheme CUSTOM: 0xFF0000, 0x0000ff 0 0x808080 0x010203',
    );
    const { scenario } = loadSetFile(text);
    // The kinds' colours (the default file only has red particles).
    expect(scenario.species.map((s) => s.type.defaultColor)).toEqual([0xff0000]);
    expect(scenario.customColors).toEqual({
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
