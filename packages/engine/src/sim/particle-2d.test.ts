import { describe, expect, it } from 'vitest';
import { Collision, createEvent, MAX_TIME, Wall, type EventInfo } from './event';
import {
  boundaryCollide2D,
  collide2D,
  initPeriodicFlags2D,
  moveToTime2D,
  predCol2D,
  predictBoundary2D,
  predictPair2D,
} from './particle-2d';
import { createArena, Particles, type Arena } from './particles';
import { ArenaType } from './simulation-info';

const reflecting: Arena = createArena(ArenaType.REFLECTING_BOUNDARIES, 10, 8, 0);
const periodic: Arena = createArena(ArenaType.PERIODIC_BOUNDARIES, 10, 8, 0);

interface Spec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r?: number;
  m?: number;
  t0?: number;
}

function particles(specs: Spec[], arena?: Arena): Particles {
  const p = new Particles(specs.length);
  specs.forEach((s, i) => {
    p.x[i] = s.x;
    p.y[i] = s.y;
    p.vx[i] = s.vx;
    p.vy[i] = s.vy;
    p.radius[i] = s.r ?? 0.5;
    p.mass[i] = s.m ?? 1;
    p.t0[i] = s.t0 ?? 0;
    if (arena) initPeriodicFlags2D(p, i, arena);
  });
  return p;
}

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

describe('predCol2D', () => {
  it('finds a head-on collision', () => {
    // 4 apart, closing at 2 per unit time, touching at distance 1: t = (4 - 1) / 2
    expect(predCol2D(-4, 0, 2, 0, 1, 10)).toBe(11.5);
  });

  it('never collides when separating or passing', () => {
    expect(predCol2D(4, 0, 2, 0, 1, 0)).toBe(MAX_TIME);
    expect(predCol2D(-4, 3, 2, 0, 1, 0)).toBe(MAX_TIME); // misses by 2 > 1
  });

  it('collides at once when already overlapping and approaching', () => {
    expect(predCol2D(-0.5, 0, 1, 0, 1, 7)).toBe(7);
  });
});

describe('predictPair2D', () => {
  it('gives the same time whichever particle comes first', () => {
    const p = particles([
      { x: 2, y: 2, vx: 1, vy: 0.3 },
      { x: 6, y: 3, vx: -1, vy: 0, t0: 0.25 },
    ]);
    const a = predictPair2D(p, 0, 1, reflecting, createEvent());
    const b = predictPair2D(p, 1, 0, reflecting, createEvent());
    expect(a.type).toBe(Collision.PARTICLE);
    expect(a.time).toBeLessThan(MAX_TIME);
    expect(b.time).toBe(a.time);
  });

  it('accounts for particles last updated at different times', () => {
    const lazy = particles([
      { x: 0, y: 0, vx: 1, vy: 0 },
      { x: 4, y: 0, vx: 0, vy: 0, t0: 1 },
    ]);
    // At t = 1 particle 0 is at x = 1; they touch when 3 - 1 = 2 more units have passed.
    expect(predictPair2D(lazy, 0, 1, reflecting, createEvent()).time).toBe(3);
  });

  it('finds collisions across a periodic boundary through the image', () => {
    // 0 overlaps the left edge; 1 sits near the right edge moving right into 0's image.
    const p = particles(
      [
        { x: 0.2, y: 4, vx: 0, vy: 0 },
        { x: 8.5, y: 4, vx: 1, vy: 0 },
      ],
      periodic,
    );
    expect(p.bFlag[0]).toBe(Wall.LEFT);
    const event = predictPair2D(p, 0, 1, periodic, createEvent());
    expect(event.side).toBe(Wall.LEFT);
    // Image of 0 at x = 10.2; contact at distance 1: 10.2 - 8.5 - 1 = 0.7
    expect(event.time).toBeCloseTo(0.7, 12);
  });
});

describe('initPeriodicFlags2D', () => {
  it('moves particles overlapping the high edges to the low side', () => {
    const p = particles([{ x: 9.8, y: 7.9, vx: 0, vy: 0 }], periodic);
    expect(p.x[0]).toBeCloseTo(-0.2, 12);
    expect(p.y[0]).toBeCloseTo(-0.1, 12);
    expect(p.bFlag[0]).toBe(Wall.LEFT | Wall.BOTTOM);
  });

  it('leaves reflecting arenas alone', () => {
    const p = particles([{ x: 9.8, y: 7.9, vx: 0, vy: 0 }], reflecting);
    expect([p.x[0], p.bFlag[0]]).toEqual([9.8, 0]);
  });
});

describe('predictBoundary2D', () => {
  it('finds the first wall, x winning ties', () => {
    const p = particles([{ x: 5, y: 4, vx: 1, vy: -1.4 }]);
    // right wall: (10 - 0.5 - 5) / 1 = 4.5; bottom: (0.5 - 4) / -1.4 = 2.5
    expect(predictBoundary2D(p, 0, reflecting, createEvent())).toEqual({
      type: Collision.WALL,
      time: 2.5,
      part1: 0,
      part2: 0,
      side: Wall.BOTTOM,
    });
    const tie = particles([{ x: 5, y: 4, vx: 1, vy: 1 }], undefined);
    tie.y[0] = 8 - 0.5 - 4.5; // top wall also at t = 4.5
    expect(predictBoundary2D(tie, 0, reflecting, createEvent()).side).toBe(Wall.RIGHT);
  });

  it('reports a BOUNDARY event at MAX_TIME for a particle at rest', () => {
    const p = particles([{ x: 5, y: 4, vx: 0, vy: 0 }]);
    expect(predictBoundary2D(p, 0, reflecting, createEvent())).toMatchObject({
      type: Collision.BOUNDARY,
      time: MAX_TIME,
      side: 0,
    });
  });

  it('enters and leaves periodic overlap regions', () => {
    const p = particles([{ x: 5, y: 4, vx: -1, vy: 0 }], periodic);
    const enter = predictBoundary2D(p, 0, periodic, createEvent());
    expect(enter).toMatchObject({ type: Collision.BOUNDARY, side: Wall.LEFT, time: 4.5 });
    boundaryCollide2D(p, 0, enter, periodic);
    expect([p.x[0], p.bFlag[0]]).toEqual([0.5, Wall.LEFT]);
    const leave = predictBoundary2D(p, 0, periodic, createEvent());
    expect(leave).toMatchObject({ type: Collision.EOB, side: Wall.LEFT, time: 5.5 });
    boundaryCollide2D(p, 0, leave, periodic);
    expect([p.x[0], p.bFlag[0]]).toEqual([9.5, 0]);
  });
});

describe('collide2D', () => {
  it('swaps velocities in a head-on collision of equal masses', () => {
    const p = particles([
      { x: 2, y: 4, vx: 1, vy: 0 },
      { x: 6, y: 4, vx: -2, vy: 0 },
    ]);
    const event = predictPair2D(p, 0, 1, reflecting, createEvent());
    collide2D(p, 0, 1, event, reflecting);
    expect([p.vx[0], p.vx[1]]).toEqual([-2, 1]);
    expect([p.t0[0], p.t0[1]]).toEqual([event.time, event.time]);
  });

  it('conserves momentum and kinetic energy in oblique, unequal-mass collisions', () => {
    const p = particles([
      { x: 2, y: 3.6, vx: 1.3, vy: 0.2, m: 2 },
      { x: 6, y: 4.1, vx: -0.7, vy: -0.1, m: 32, r: 0.8 },
    ]);
    const before = momentumAndEnergy(p);
    collide2D(p, 0, 1, predictPair2D(p, 0, 1, reflecting, createEvent()), reflecting);
    const after = momentumAndEnergy(p);
    expect(after.px).toBeCloseTo(before.px, 12);
    expect(after.py).toBeCloseTo(before.py, 12);
    expect(after.ke).toBeCloseTo(before.ke, 12);
  });
});

function momentumAndEnergy(p: Particles) {
  let px = 0;
  let py = 0;
  let ke = 0;
  for (let i = 0; i < p.count; i++) {
    const m = p.mass[i]!;
    px += m * p.vx[i]!;
    py += m * p.vy[i]!;
    ke += 0.5 * m * (p.vx[i]! ** 2 + p.vy[i]! ** 2);
  }
  return { px, py, ke };
}

/**
 * A brute-force event loop (no calendar): predict every event, perform the soonest,
 * repeat. Slow but obviously correct, so it tests the 2D functions in combination.
 */
function runBruteForce(p: Particles, arena: Arena, events: number, check: () => void): void {
  const candidate: EventInfo = createEvent();
  const best: EventInfo = createEvent();
  for (let step = 0; step < events; step++) {
    best.time = MAX_TIME;
    for (let i = 0; i < p.count; i++) {
      predictBoundary2D(p, i, arena, candidate);
      if (candidate.time < best.time) Object.assign(best, candidate, { part1: i, part2: 0 });
      for (let j = i + 1; j < p.count; j++) {
        predictPair2D(p, i, j, arena, candidate);
        if (candidate.time < best.time) Object.assign(best, candidate, { part1: i, part2: j });
      }
    }
    for (let i = 0; i < p.count; i++) moveToTime2D(p, i, best.time);
    if (best.type === Collision.PARTICLE) collide2D(p, best.part1, best.part2, best, arena);
    else boundaryCollide2D(p, best.part1, best, arena);
    check();
  }
}

function randomGas(n: number, arena: Arena, seed: number): Particles {
  const random = seededRandom(seed);
  const specs: Spec[] = [];
  // Place on a jittered grid so nobody starts overlapping.
  const cols = Math.ceil(Math.sqrt(n));
  for (let k = 0; k < n; k++) {
    specs.push({
      x: ((k % cols) + 0.5 + (random() - 0.5) * 0.2) * (arena.xSize / cols),
      y: (Math.floor(k / cols) + 0.5 + (random() - 0.5) * 0.2) * (arena.ySize / cols),
      vx: random() * 2 - 1,
      vy: random() * 2 - 1,
      r: 0.3,
      m: k % 2 === 0 ? 2 : 5,
    });
  }
  return particles(specs, arena);
}

describe('2D event loop (brute force)', () => {
  it('keeps a reflecting gas in the box, without overlaps, at constant energy', () => {
    const p = randomGas(16, reflecting, 7);
    const { ke } = momentumAndEnergy(p);
    // Plain comparisons, reported once at the end: calling expect() ~400k times in the
    // loop made this test slow enough to time out on CI.
    const violations: string[] = [];
    let step = 0;
    runBruteForce(p, reflecting, 3000, () => {
      step++;
      for (let i = 0; i < p.count; i++) {
        const r = p.radius[i]!;
        const x = p.x[i]!;
        const y = p.y[i]!;
        if (
          x < r - 1e-9 ||
          x > reflecting.xSize - r + 1e-9 ||
          y < r - 1e-9 ||
          y > reflecting.ySize - r + 1e-9
        ) {
          violations.push(`step ${step}: particle ${i} outside the box at (${x}, ${y})`);
        }
        for (let j = i + 1; j < p.count; j++) {
          const d = Math.hypot(x - p.x[j]!, y - p.y[j]!);
          if (d < r + p.radius[j]! - 1e-9) {
            violations.push(`step ${step}: particles ${i} and ${j} overlap (distance ${d})`);
          }
        }
      }
    });
    expect(violations.slice(0, 10)).toEqual([]);
    expect(momentumAndEnergy(p).ke).toBeCloseTo(ke, 10);
  });

  it('conserves momentum and energy in a periodic gas', () => {
    const p = randomGas(16, periodic, 11);
    const before = momentumAndEnergy(p);
    let collisions = 0;
    runBruteForce(p, periodic, 3000, () => {
      for (let i = 0; i < p.count; i++) {
        const r = p.radius[i]!;
        expect(p.x[i]).toBeGreaterThanOrEqual(-r - 1e-9);
        expect(p.x[i]).toBeLessThanOrEqual(periodic.xSize - r + 1e-9);
      }
      collisions++;
    });
    const after = momentumAndEnergy(p);
    expect(collisions).toBe(3000);
    expect(after.px).toBeCloseTo(before.px, 10);
    expect(after.py).toBeCloseTo(before.py, 10);
    expect(after.ke).toBeCloseTo(before.ke, 10);
  });
});
