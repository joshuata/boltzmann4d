// Spawn regions and drawn walls when a scenario is resolved (EDIT-3–7) and run (WALL-2).
import { describe, expect, it } from 'vitest';
import { loadDefaultSetFileText } from '../io/presets';
import { seededRandom } from '../sim/scenes';
import { distanceToSegment } from '../sim/segment-walls';
import { Simulation } from '../sim/simulation';
import { ScenarioError } from './format';
import { resolveScenario, type ResolvedScenario } from './resolve';
import { parseScenario, type ScenarioInput } from './schema';
import { setFileToScenario } from './set-convert';

const NM = 1e-9;

/**
 * The default 70 × 50 nm 2D box with a wall across it at x = 35 nm (full height), 30 red
 * particles in a region on the left and 20 blue anywhere.
 */
async function chamber(redCount = 30): Promise<ScenarioInput> {
  const { scenario } = setFileToScenario(await loadDefaultSetFileText());
  const input = structuredClone(scenario) as ScenarioInput;
  return {
    ...input,
    spawnRegions: [
      { id: 'left', name: 'Left', shape: { type: 'rectangle', min: [5, 5], max: [30, 45] } },
    ],
    walls: [
      {
        id: 'divider',
        points: [
          [35, 0],
          [35, 50],
        ],
        kind: { type: 'reflecting' },
      },
    ],
    populations: [
      { kind: 'red', region: 'left', randomlyPlaced: [{ count: redCount, averageVelocity: 1500 }] }, // prettier-ignore
      { kind: 'blue', randomlyPlaced: [{ count: 20, averageVelocity: 1500 }] },
    ],
  };
}

const resolve = async (input: ScenarioInput, seed = 1) =>
  resolveScenario(parseScenario(input), { random: seededRandom(seed) });

/** Every particle as [x, y, radius] in meters. */
function particlesOf(resolved: ResolvedScenario): [number, number, number][] {
  return resolved.species.flatMap((s) =>
    Array.from({ length: s.positions.length / 3 }, (_, k) => [
      s.positions[3 * k]!,
      s.positions[3 * k + 1]!,
      s.type.particleRadius,
    ]),
  ) as [number, number, number][];
}

describe('spawn regions', () => {
  it('place particles inside their region, clear of walls and each other', async () => {
    const resolved = await resolve(await chamber());
    const [red, blue] = resolved.species;
    expect(red!.positions.length / 3).toBe(30);
    expect(blue!.positions.length / 3).toBe(20);
    const r = red!.type.particleRadius;
    for (let k = 0; k < 30; k++) {
      const x = red!.positions[3 * k]!;
      const y = red!.positions[3 * k + 1]!;
      expect(x).toBeGreaterThanOrEqual(5 * NM + r);
      expect(x).toBeLessThanOrEqual(30 * NM - r);
      expect(y).toBeGreaterThanOrEqual(5 * NM + r);
      expect(y).toBeLessThanOrEqual(45 * NM - r);
    }
    const all = particlesOf(resolved);
    for (const [x, y, radius] of all) {
      expect(distanceToSegment(x, y, 35 * NM, 0, 35 * NM, 50 * NM)).toBeGreaterThanOrEqual(radius);
    }
    for (let a = 0; a < all.length; a++) {
      for (let b = a + 1; b < all.length; b++) {
        const [xa, ya, ra] = all[a]!;
        const [xb, yb, rb] = all[b]!;
        expect(Math.hypot(xa - xb, ya - yb)).toBeGreaterThanOrEqual(ra + rb);
      }
    }
  });

  it('start the same way from the same seed (EDIT-7)', async () => {
    const input = await chamber();
    const a = particlesOf(await resolve(input, 5));
    expect(particlesOf(await resolve(input, 5))).toEqual(a);
    expect(particlesOf(await resolve(input, 6))).not.toEqual(a);
  });

  it('say how many fit when a region is too full (EDIT-6)', async () => {
    const input = await chamber(2000);
    await expect(resolve(input)).rejects.toThrow(ScenarioError);
    await expect(resolve(input)).rejects.toThrow(
      /Only \d+ of 2000 Red particles fit in spawn region Left without overlapping/,
    );
  });

  it('accept polygons', async () => {
    const input = await chamber(10);
    input.spawnRegions = [
      {
        id: 'left',
        shape: {
          type: 'polygon',
          points: [
            [2, 2],
            [30, 2],
            [2, 45],
          ],
        },
      },
    ];
    const [red] = (await resolve(input)).species;
    for (let k = 0; k < 10; k++) {
      const x = red!.positions[3 * k]! / NM;
      const y = red!.positions[3 * k + 1]! / NM;
      // Below the hypotenuse from (30, 2) to (2, 45).
      expect((x - 30) * (45 - 2) + (y - 2) * (30 - 2)).toBeLessThan(0);
    }
  });
});

describe('drawn walls in a running simulation', () => {
  it('keep each side to itself and conserve energy', async () => {
    const resolved = await resolve(await chamber());
    expect(resolved.walls).toHaveLength(1);
    const sim = new Simulation(resolved);
    const p = sim.particles;
    const leftAtStart = Array.from({ length: p.count }, (_, k) => p.x[k]! < 35 * NM);
    const energy = sim.kineticEnergy();
    let last = 0;
    let wallHits = 0;
    for (let k = 0; k < 20_000; k++) {
      const event = sim.step()!;
      last = event.time;
      if (event.type === 19) wallHits++;
    }
    sim.advanceToTime(last);
    expect(wallHits).toBeGreaterThan(0);
    expect(sim.kineticEnergy() / energy).toBeCloseTo(1, 12);
    for (let k = 0; k < p.count; k++) {
      expect(p.x[k]! < 35 * NM).toBe(leftAtStart[k]);
      expect(Math.abs(p.x[k]! - 35 * NM)).toBeGreaterThanOrEqual(p.radius[k]! * (1 - 1e-9));
    }
  });
});
