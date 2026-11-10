// Engine benchmarks: run with `mise run bench`. Each iteration performs 1,000 events, so
// events per second = hz × 1,000. Starting states are fixed (seeded) for comparability.
import { test } from 'vitest';
import { loadPresetText, loadSettings } from '../io';
import { syntheticGas, seededRandom } from './scenes';
import { Simulation, type InitialState } from './simulation';
import { ArenaType, DividerThermalMode } from './simulation-info';

const EVENTS = 1000;

async function preset(name: string): Promise<InitialState> {
  return loadSettings(await loadPresetText(name), { random: seededRandom(1) }).settings;
}

const scenes: [string, () => Promise<InitialState>][] = [
  ['2Dmixture (60, reflecting)', () => preset('2Dmixture')],
  ['2Dbrownian (200, periodic)', () => preset('2Dbrownian')],
  [
    '2Dhotcold, conducting divider (60)',
    async () => ({
      ...(await preset('2Dhotcold')),
      dividerThermalMode: DividerThermalMode.CONDUCTING,
    }),
  ],
  ['3Dmixture (60, reflecting)', () => preset('3Dmixture')],
  ['3Dbrownian (200, periodic)', () => preset('3Dbrownian')],
  ['synthetic (1000, reflecting)', async () => syntheticGas({ count: 1000 })],
  [
    'synthetic (1000, periodic)',
    async () => syntheticGas({ count: 1000, arenaType: ArenaType.PERIODIC_BOUNDARIES }),
  ],
];

for (const [label, load] of scenes) {
  test(`${EVENTS} events: ${label}`, async ({ bench }) => {
    const init = await load();
    let simulation = new Simulation(init);
    await bench(
      `${EVENTS} events: ${label}`,
      { beforeAll: () => void (simulation = new Simulation(init)) },
      () => {
        for (let k = 0; k < EVENTS; k++) simulation.step();
      },
    ).run();
  });
}
