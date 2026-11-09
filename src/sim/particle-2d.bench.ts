// 2D prediction and collision micro-benchmarks: run with `mise run bench`.
// Each iteration re-predicts one particle against all others (what the engine does
// after every event), so results are per particle-update, not per pair.
import { test } from 'vitest';
import { createEvent } from './event';
import { collide2D, initPeriodicFlags2D, predictBoundary2D, predictPair2D } from './particle-2d';
import { Particles, type Arena } from './particles';
import { ArenaType } from './simulation-info';

// Local copies, so the timed loops don't go through module bindings (see plan 0002).
const predictPair = predictPair2D;
const predictBoundary = predictBoundary2D;
const collide = collide2D;

const N = 200;

function gas(arena: Arena): Particles {
  const p = new Particles(N);
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const cols = Math.ceil(Math.sqrt(N));
  for (let k = 0; k < N; k++) {
    p.x[k] = ((k % cols) + 0.5) * (arena.xSize / cols);
    p.y[k] = (Math.floor(k / cols) + 0.5) * (arena.ySize / cols);
    p.vx[k] = random() * 2 - 1;
    p.vy[k] = random() * 2 - 1;
    p.radius[k] = 0.2;
    p.mass[k] = 1 + (k % 2);
    initPeriodicFlags2D(p, k, arena);
  }
  return p;
}

const arenas: Arena[] = [
  { type: ArenaType.REFLECTING_BOUNDARIES, xSize: 40, ySize: 40, zSize: 0 },
  { type: ArenaType.PERIODIC_BOUNDARIES, xSize: 40, ySize: 40, zSize: 0 },
];

for (const arena of arenas) {
  const label = arena.type === ArenaType.PERIODIC_BOUNDARIES ? 'periodic' : 'reflecting';

  test(`2D predictions: ${label}`, async ({ bench }) => {
    const p = gas(arena);
    const out = createEvent();
    let i = 0;
    await bench(`re-predict 1 of ${N} particles (${label})`, () => {
      for (let j = 0; j < N; j++) if (j !== i) predictPair(p, i, j, arena, out);
      predictBoundary(p, i, arena, out);
      i = (i + 1) % N;
    }).run();
  });

  test(`2D collision response: ${label}`, async ({ bench }) => {
    const p = gas(arena);
    const event = createEvent();
    await bench(`collide2D (${label})`, () => {
      // Same pair each time; positions don't advance (t0 = event time), so it stays valid.
      collide(p, 0, 1, event, arena);
    }).run();
  });
}
