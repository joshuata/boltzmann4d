// Physics throughput as the particle count grows, for comparison with the Java app.
// Mirrors boltzmann3d's PhysicsBenchmark (ant benchmark): same synthetic gas, same frame
// duration, same warm-up and measurement method. See benchmarks/README.md.
//
//   mise run web:bench                           # writes benchmarks/results/web-node.json
//   node --expose-gc --import tsx scripts/bench-scaling.ts --counts 100,1000 --measure 2 --out /tmp/x.json
import { writeFileSync } from 'node:fs';
import { cpus, platform, release, arch } from 'node:os';
import { parseArgs } from 'node:util';
import { syntheticGas } from '@boltzmann4d/engine/sim/scenes';
import { DEFAULT_FRAME_DURATION, Simulation } from '@boltzmann4d/engine/sim/simulation';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'benchmarks/results/web-node.json' },
    warmup: { type: 'string', default: '2' },
    measure: { type: 'string', default: '5' },
    'max-frame': { type: 'string', default: '30' },
    counts: { type: 'string', default: '100,300,1000,3000,10000,20000,50000,100000' },
  },
});

const warmup = Number(values.warmup);
const measure = Number(values.measure);
const maxFrame = Number(values['max-frame']);
const counts = values.counts.split(',').map(Number);
const seed = 1;
const packing = 0.1;

const gc = (globalThis as { gc?: () => void }).gc ?? (() => {});
const memoryMB = () => {
  const m = process.memoryUsage();
  return Math.round((m.heapUsed + m.arrayBuffers) / (1024 * 1024));
};

type Result = Record<string, string | number>;
const results: Result[] = [];
let stopped = false;

for (const particles of counts) {
  const result: Result = { variant: 'web-node', particles };
  results.push(result);
  if (stopped) {
    result.status = 'skipped (previous count hit a limit)';
    continue;
  }
  try {
    const init = syntheticGas({ count: particles, seed, packing });
    gc();
    const setupStart = performance.now();
    const sim = new Simulation(init);
    result.setupMs = performance.now() - setupStart;
    gc();
    result.memoryMB = memoryMB();
    console.log(
      `${particles} particles: setup ${Math.round(Number(result.setupMs))} ms, ${result.memoryMB} MB`,
    );

    sim.advanceToNextFrame(); // first call only creates the first frame
    const warmEnd = performance.now() + warmup * 1000;
    let tooSlow = false;
    while (performance.now() < warmEnd) {
      const frameStart = performance.now();
      sim.advanceToNextFrame();
      if ((performance.now() - frameStart) / 1000 > maxFrame) {
        tooSlow = true;
        break;
      }
    }
    if (tooSlow) {
      result.status = `frame slower than ${maxFrame} s`;
      stopped = true;
      continue;
    }

    const events0 = sim.counters.events;
    const time0 = sim.time;
    let frames = 0;
    const start = performance.now();
    const end = start + measure * 1000;
    do {
      sim.advanceToNextFrame();
      frames++;
    } while (performance.now() < end);
    const seconds = (performance.now() - start) / 1000;
    const events = sim.counters.events - events0;
    Object.assign(result, {
      status: 'ok',
      frames,
      events,
      seconds,
      eventsPerSecond: events / seconds,
      framesPerSecond: frames / seconds,
      simSecondsPerSecond: (sim.time - time0) / seconds,
    });
    console.log(
      `  ${Math.round(events / seconds)} events/s, ${(frames / seconds).toFixed(1)} frames/s`,
    );
  } catch (error) {
    result.status = error instanceof RangeError ? 'out of memory' : `error: ${String(error)}`;
    stopped = true;
  }
}

const report = {
  runner: 'boltzmann4d scripts/bench-scaling.ts',
  runtime: `Node ${process.version} (V8 ${process.versions.v8})`,
  os: `${platform()} ${release()} ${arch()}`,
  cpus: cpus().length,
  warmupSeconds: warmup,
  measureSeconds: measure,
  frameDuration: DEFAULT_FRAME_DURATION,
  seed,
  packing,
  results,
};
writeFileSync(values.out, JSON.stringify(report, null, 1) + '\n');
console.log(`Wrote ${values.out}`);
