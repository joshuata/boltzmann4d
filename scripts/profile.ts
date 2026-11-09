// Headless profiling run: loads a preset, advances the simulation, and prints throughput
// and engine counters. Run it under the V8 profiler with `mise run profile`:
//
//   mise run profile                         # 2Dmixture, 20 000 frames
//   mise run profile 2Dbrownian --frames 1e5
//   mise run profile --particles 1000        # synthetic scene instead of a preset
//
// The .cpuprofile lands in profiles/; open it in Chrome DevTools (Performance tab) or
// https://www.speedscope.app.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadSettings } from '../src/io/load';
import { Physics } from '../src/sim/physics';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    frames: { type: 'string', default: '20000' },
    particles: { type: 'string' },
  },
});

const preset = positionals[0] ?? '2Dmixture';
const frames = Number(values.frames);
const presetPath = new URL(`../src/io/simsettingsfiles/presets/${preset}.set`, import.meta.url);

const particleCount = values.particles
  ? Number(values.particles)
  : loadSettings(readFileSync(presetPath, 'utf8')).settings.species.reduce(
      (n, s) => n + s.positions.length / 3,
      0,
    );
const label = values.particles ? `synthetic scene` : preset;

// TODO(plan 0002): build the event-driven simulation from the preset's initial state.
const physics = new Physics({ particleCount });
physics.advanceToNextFrame();

const start = performance.now();
for (let i = 0; i < frames; i++) physics.advanceToNextFrame();
const seconds = (performance.now() - start) / 1000;

console.log(`${label}: ${particleCount} particles, ${frames} frames in ${seconds.toFixed(3)} s`);
console.log(`  ${Math.round(frames / seconds).toLocaleString('en-US')} frames/s`);
console.table(physics.counters);
