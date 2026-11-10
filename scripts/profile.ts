// Headless profiling run: loads a preset (or a synthetic gas), runs the simulation, and
// prints throughput and engine counters. Run it under the V8 profiler with
// `mise run profile`:
//
//   mise run profile                              # 2Dmixture, 200 000 events
//   mise run profile 2Dbrownian --events 1e6
//   mise run profile --particles 1000 --periodic  # synthetic gas instead of a preset
//
// The .cpuprofile lands in profiles/; open it in Chrome DevTools (Performance tab) or
// https://www.speedscope.app.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadSettings } from '../src/io/load';
import { seededRandom, syntheticGas } from '../src/sim/scenes';
import { Simulation, type InitialState } from '../src/sim/simulation';
import { ArenaType } from '../src/sim/simulation-info';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    events: { type: 'string', default: '200000' },
    particles: { type: 'string' },
    periodic: { type: 'boolean', default: false },
    seed: { type: 'string', default: '1' },
  },
});

const events = Number(values.events);
const seed = Number(values.seed);
const preset = positionals[0] ?? '2Dmixture';

let label: string;
let init: InitialState;
if (values.particles) {
  const count = Number(values.particles);
  const arenaType = values.periodic
    ? ArenaType.PERIODIC_BOUNDARIES
    : ArenaType.REFLECTING_BOUNDARIES;
  init = syntheticGas({ count, arenaType, seed });
  label = `synthetic gas (${values.periodic ? 'periodic' : 'reflecting'})`;
} else {
  const path = new URL(`../src/io/simsettingsfiles/presets/${preset}.set`, import.meta.url);
  init = loadSettings(readFileSync(path, 'utf8'), { random: seededRandom(seed) }).settings;
  label = preset;
}

const setupStart = performance.now();
const simulation = new Simulation(init);
const setupMs = performance.now() - setupStart;
const energyBefore = simulation.kineticEnergy();

const start = performance.now();
let performed = 0;
while (performed < events && simulation.step()) performed++;
const seconds = (performance.now() - start) / 1000;
const drift = Math.abs(simulation.kineticEnergy() / energyBefore - 1);

const n = simulation.particles.count;
console.log(`${label}: ${n} particles, setup ${setupMs.toFixed(1)} ms`);
console.log(
  `${performed.toLocaleString('en-US')} events in ${seconds.toFixed(3)} s: ` +
    `${Math.round(performed / seconds).toLocaleString('en-US')} events/s`,
);
console.log(`relative kinetic-energy drift: ${drift.toExponential(2)}`);
console.table(simulation.counters);
console.log(`grid: ${simulation.grid.nx} × ${simulation.grid.ny} cells`);
