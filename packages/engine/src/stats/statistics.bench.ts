// Cost of the statistics: run with `mise run bench`. The engine benchmarks
// (src/sim/simulation.bench.ts) give the same scenes without statistics; each iteration
// here also performs 1,000 events, so the difference is what the statistics add.
import { test } from 'vitest';
import { loadPresetText, loadSetFile } from '../io';
import { seededRandom, syntheticGas } from '../sim/scenes';
import { Simulation, type InitialState } from '../sim/simulation';
import { ArenaType } from '../sim/simulation-info';
import { Statistics } from './statistics';
import { statsContext } from './stats-context';

const EVENTS = 1000;

async function preset(name: string): Promise<InitialState> {
  return loadSetFile(await loadPresetText(name), { random: seededRandom(1) }).scenario;
}

const scenes: [string, () => Promise<InitialState>][] = [
  ['2Dmixture (60, reflecting)', () => preset('2Dmixture')],
  ['2Dbrownian (200, periodic)', () => preset('2Dbrownian')],
  [
    'synthetic (1000, periodic)',
    async () => syntheticGas({ count: 1000, arenaType: ArenaType.PERIODIC_BOUNDARIES }),
  ],
];

function withStatistics(init: InitialState) {
  let stats: Statistics | null = null;
  const simulation = new Simulation(init, { onEvent: (e) => stats?.notifyOfEvent(e) });
  stats = new Statistics(statsContext(init), simulation.particles);
  return { simulation, stats };
}

for (const [label, load] of scenes) {
  test(`${EVENTS} events with statistics: ${label}`, async ({ bench }) => {
    const init = await load();
    let run = withStatistics(init);
    await bench(
      `${EVENTS} events with statistics: ${label}`,
      { beforeAll: () => void (run = withStatistics(init)) },
      () => {
        for (let k = 0; k < EVENTS; k++) run.simulation.step();
      },
    ).run();
  });

  // What the physics worker does about once a second.
  test(`current sample + summary: ${label}`, async ({ bench }) => {
    const { simulation, stats } = withStatistics(await load());
    for (let k = 0; k < 10 * EVENTS; k++) simulation.step();
    await bench(`current sample + summary: ${label}`, () => {
      stats.sampleCurrent();
      stats.summary(simulation.time);
    }).run();
  });
}
