// Randomly placed particles in scenarios without drawn walls or spawn regions (every bundled
// preset) must not start overlapping each other.
import { describe, expect, it } from 'vitest';
import { loadSetFile } from '../io/load';
import { loadPresetText, presetCatalog } from '../io/presets';
import { seededRandom } from '../sim/scenes';
import { Simulation } from '../sim/simulation';
import { ScenarioError } from './format';
import { resolveScenario } from './resolve';
import { parseScenario, type ScenarioInput } from './schema';
import { setFileToScenario } from './set-convert';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** The closest pair as [gap, contact distance] (m) over every particle of every species. */
function closestPair(
  species: { positions: Float64Array; type: { particleRadius: number } }[],
  dimension: number,
): { distance: number; contact: number } {
  const all = species.flatMap((s) =>
    Array.from({ length: s.positions.length / 3 }, (_, k) => ({
      p: s.positions.subarray(3 * k, 3 * k + dimension),
      r: s.type.particleRadius,
    })),
  );
  let worst = { distance: Infinity, contact: 0 };
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      let d2 = 0;
      for (let axis = 0; axis < dimension; axis++) d2 += (all[a]!.p[axis]! - all[b]!.p[axis]!) ** 2;
      const contact = all[a]!.r + all[b]!.r;
      if (Math.sqrt(d2) - contact < worst.distance - worst.contact) {
        worst = { distance: Math.sqrt(d2), contact };
      }
    }
  }
  return worst;
}

describe('random placement without walls or spawn regions', () => {
  it('reproduces the 3Doxy1000 report: particles 0 and 9 no longer overlap', async () => {
    const { scenario } = loadSetFile(await loadPresetText('3Doxy1000'), {
      random: seededRandom(4),
    });
    const [s] = scenario.species;
    const p = s!.positions;
    const d = Math.hypot(p[0]! - p[27]!, p[1]! - p[28]!, p[2]! - p[29]!);
    expect(d).toBeGreaterThanOrEqual(2 * s!.type.particleRadius);
  });

  describe.each(presetCatalog.map((p) => [p.name, p.dimensions] as const))(
    '%s',
    (name, dimension) => {
      it.each(SEEDS)('seed %i: no pair starts closer than the sum of their radii', async (seed) => {
        const { scenario } = loadSetFile(await loadPresetText(name), {
          random: seededRandom(seed),
        });
        const { distance, contact } = closestPair(scenario.species, dimension);
        expect(distance).toBeGreaterThanOrEqual(contact);
      });
    },
  );

  it('reports a box too full to hold every particle', async () => {
    const { scenario } = setFileToScenario(await loadPresetText('3Doxy1000'));
    const input = structuredClone(scenario) as ScenarioInput;
    input.populations = input.populations!.map((p) => ({
      ...p,
      randomlyPlaced: p.randomlyPlaced?.map((b) => ({ ...b, count: 100000 })),
    }));
    expect(() => resolveScenario(parseScenario(input), { random: seededRandom(1) })).toThrow(
      ScenarioError,
    );
    expect(() => resolveScenario(parseScenario(input), { random: seededRandom(1) })).toThrow(
      /Only \d+ of 100000 .* particles fit in the arena without overlapping/,
    );
  });
});

// Issue #10: overlapping starts made pairs re-collide at the same instant, so event order
// hung on the calendar's tie-breaking. 2Dequal is left out: its explicitly placed halves
// mirror each other across the divider, so its simultaneous events are real.
describe('no equal-time events from overlapping starts (issue #10)', () => {
  const EVENTS = 5000;
  it.each(presetCatalog.filter((p) => p.name !== '2Dequal').map((p) => p.name))(
    '%s: no two consecutive events share a time',
    async (name) => {
      const { scenario } = loadSetFile(await loadPresetText(name), { random: seededRandom(1) });
      const simulation = new Simulation(scenario);
      let previous = NaN;
      for (let k = 0; k < EVENTS; k++) {
        const time = simulation.nextEventTime();
        if (!simulation.step()) break;
        expect(time, `event ${k}`).not.toBe(previous);
        previous = time;
      }
    },
  );
});
