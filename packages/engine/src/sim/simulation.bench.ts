// Engine benchmarks: run with `mise run bench`. Each iteration performs 1,000 events, so
// events per second = hz × 1,000. Starting states are fixed (seeded) for comparability.
import { test } from 'vitest';
import { loadDefaultSetFileText, loadPresetText, loadSetFile } from '../io';
import { parseScenario, resolveScenario, setFileToScenario, type ScenarioInput } from '../scenario';
import { syntheticGas, seededRandom } from './scenes';
import { PistonMode } from './piston';
import { Simulation, type InitialState } from './simulation';
import { EventRecorder } from './snapshot';
import { ArenaType, DividerThermalMode } from './simulation-info';

const EVENTS = 1000;

async function preset(name: string): Promise<InitialState> {
  return loadSetFile(await loadPresetText(name), { random: seededRandom(1) }).scenario;
}

/**
 * The default 70 × 50 nm box with drawn walls (plan 0010 step 4): a comb of three walls
 * with gaps and a triangle, and `count` particles placed around them.
 */
async function drawnWalls(count: number): Promise<InitialState> {
  const { scenario } = setFileToScenario(await loadDefaultSetFileText());
  const input = structuredClone(scenario) as ScenarioInput;
  const wall = (id: string, points: [number, number][], closed = false) => ({
    id,
    points,
    closed,
    kind: { type: 'reflecting' as const },
  });
  input.walls = [
    wall('a', [[15, 0], [15, 35]]), // prettier-ignore
    wall('b', [[30, 15], [30, 50]]), // prettier-ignore
    wall('c', [[45, 0], [45, 35]]), // prettier-ignore
    wall('t', [[52, 10], [64, 10], [58, 22]], true), // prettier-ignore
  ];
  input.populations = [{ kind: 'a', randomlyPlaced: [{ count, averageVelocity: 1500 }] }];
  return resolveScenario(parseScenario(input), { random: seededRandom(1) });
}

const scenes: [string, () => Promise<InitialState>][] = [
  ['default (50, reflecting)', () => preset('default')],
  ['default, drawn walls (50)', () => drawnWalls(50)],
  ['default, drawn walls (300)', () => drawnWalls(300)],
  ['2Dmixture (60, reflecting)', () => preset('2Dmixture')],
  ['2Dbrownian (200, periodic)', () => preset('2Dbrownian')],
  [
    '2Dhotcold, conducting divider (60)',
    async () => ({
      ...(await preset('2Dhotcold')),
      dividerThermalMode: DividerThermalMode.CONDUCTING,
    }),
  ],
  [
    'default, piston (50)',
    async () => ({ ...(await preset('default')), arenaType: ArenaType.MOVABLE_PISTON }),
  ],
  [
    '2Dmixture, square wells (60)',
    async () => ({
      ...(await preset('2Dmixture')),
      wells: { radiusMultiplier: 1.5, depths: [4.0, 1.0] },
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
    // Piston arenas run with the piston on its way in.
    const create = () => {
      const sim = new Simulation(init);
      if (sim.piston) sim.movePiston(0.5, PistonMode.ADIABATIC, 500);
      return sim;
    };
    let simulation = create();
    await bench(
      `${EVENTS} events: ${label}`,
      { beforeAll: () => void (simulation = create()) },
      () => {
        for (let k = 0; k < EVENTS; k++) simulation.step();
      },
    ).run();
  });
}

// State snapshots' event recording (joshuata/boltzmann4d#84): the same events with every
// one recorded, and a batch taken per 1,000 (about one snapshot's worth). Compare with the
// plain runs above; with events off nothing is chained in.
for (const [label, load] of [scenes[0]!, scenes[10]!]) {
  test(`${EVENTS} events, recorded: ${label}`, async ({ bench }) => {
    const init = await load();
    const recorder = new EventRecorder();
    const create = () => {
      const sim: Simulation = new Simulation(init, {
        afterEvent: (event) => recorder.record(event, sim.particles),
      });
      return sim;
    };
    let simulation = create();
    await bench(
      `${EVENTS} events, recorded: ${label}`,
      { beforeAll: () => void (simulation = create()) },
      () => {
        for (let k = 0; k < EVENTS; k++) simulation.step();
        recorder.take();
      },
    ).run();
  });
}
