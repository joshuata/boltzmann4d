import { describe, expect, it } from 'vitest';
import { Collision, createEvent, MAX_TIME, Wall } from './event';
import {
  boundaryCollide3D,
  collide3D,
  initPeriodicFlags3D,
  moveToTime3D,
  predCol3D,
  predictBoundary3D,
  predictPair3D,
} from './particle-3d';
import { createArena, Particles, type Arena } from './particles';
import { seededRandom } from './scenes';
import { ArenaType } from './simulation-info';

const reflecting: Arena = createArena(ArenaType.REFLECTING_BOUNDARIES, 10, 8, 6, -1, false, 3);
const periodic: Arena = createArena(ArenaType.PERIODIC_BOUNDARIES, 10, 8, 6, -1, false, 3);

interface Spec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r?: number;
  m?: number;
}

function particles(specs: Spec[], arena?: Arena): Particles {
  const p = new Particles(specs.length);
  specs.forEach((s, i) => {
    p.x[i] = s.x;
    p.y[i] = s.y;
    p.z[i] = s.z;
    p.vx[i] = s.vx;
    p.vy[i] = s.vy;
    p.vz[i] = s.vz;
    p.radius[i] = s.r ?? 0.5;
    p.mass[i] = s.m ?? 1;
    if (arena) initPeriodicFlags3D(p, i, arena);
  });
  return p;
}

describe('predCol3D', () => {
  it('finds a head-on collision along z', () => {
    // 4 apart, closing at 2/s, touching at distance 1: after 1.5 s.
    expect(predCol3D(0, 0, -4, 0, 0, 2, 1, 10)).toBeCloseTo(11.5, 12);
  });

  it('never collides when separating or passing', () => {
    expect(predCol3D(0, 0, 4, 0, 0, 1, 1, 0)).toBe(MAX_TIME);
    expect(predCol3D(-4, 0, 3, 1, 0, 0, 1, 0)).toBe(MAX_TIME);
  });
});

describe('predictPair3D', () => {
  it('finds collisions across a periodic boundary through the corner image', () => {
    // One sphere overlaps the low x, y and z boundaries; the other sits near the high
    // corner and moves toward it, so they meet through the xyz image.
    const p = particles(
      [
        { x: 0.2, y: 0.2, z: 0.2, vx: 0, vy: 0, vz: 0 },
        { x: 8.8, y: 6.8, z: 4.8, vx: 1, vy: 1, vz: 1 },
      ],
      periodic,
    );
    expect(p.bFlag[0]).toBe(Wall.LEFT | Wall.BOTTOM | Wall.BACK);
    const out = predictPair3D(p, 0, 1, periodic, createEvent());
    expect(out.side).toBe(Wall.LEFT | Wall.BOTTOM | Wall.BACK);
    const gap = Math.hypot(10.2 - 8.8, 8.2 - 6.8, 6.2 - 4.8) - 1;
    expect(out.time).toBeCloseTo(gap / Math.sqrt(3), 12);
  });
});

describe('predictBoundary3D', () => {
  it('finds the soonest wall, including the z walls', () => {
    const p = particles([{ x: 5, y: 4, z: 1, vx: 1, vy: 1, vz: -1 }]);
    const out = predictBoundary3D(p, 0, reflecting, createEvent());
    expect(out.type).toBe(Collision.WALL);
    expect(out.side).toBe(Wall.BACK);
    expect(out.time).toBeCloseTo(0.5, 12);
    boundaryCollide3D(p, 0, out, reflecting);
    expect(p.z[0]).toBe(0.5);
    expect(p.vz[0]).toBe(1);
    expect([p.x[0], p.y[0]]).toEqual([5.5, 4.5]);
  });

  // Hole geometry is in meters (the divider is 1 nm thick), so these use nanometres.
  const nm = 1e-9;
  const holed = createArena(ArenaType.DIVIDED_ARENA_WITH_HOLE, 40 * nm, 40 * nm, 40 * nm, 10 * nm, false, 3); // prettier-ignore

  it('lets particles through the hole and bounces them off the divider elsewhere', () => {
    expect(holed.edgeY.length).toBe(Math.round(4 * Math.PI * 6)); // ring radius 6 nm
    const p = particles([
      { x: 5 * nm, y: 20 * nm, z: 20 * nm, vx: 1, vy: 0, vz: 0, r: 0.5 * nm }, // through the centre
      { x: 5 * nm, y: 5 * nm, z: 5 * nm, vx: 1, vy: 0, vz: 0, r: 0.5 * nm }, // into the divider
    ]);
    expect(predictBoundary3D(p, 0, holed, createEvent()).type).toBe(Collision.WALL);
    const hit = predictBoundary3D(p, 1, holed, createEvent());
    expect(hit.type).toBe(Collision.BARRIER);
    expect(hit.side).toBe(Wall.LEFT);
  });

  it('bounces off the spheres lining the hole', () => {
    // Aimed just inside edge sphere 0 (the +y side of the ring, at z = 20 nm): clear of the
    // divider, but grazing the sphere.
    const y = holed.edgeY[0]! - 0.8 * nm;
    const p = particles([{ x: 5 * nm, y, z: holed.edgeZ[0]!, vx: 1, vy: 0, vz: 0, r: 0.5 * nm }]);
    const out = predictBoundary3D(p, 0, holed, createEvent());
    expect(out.type).toBe(Collision.EDGE);
    expect(out.side).toBe(0);
    boundaryCollide3D(p, 0, out, holed);
    expect(p.vx[0]).toBeLessThan(0);
    expect(p.vy[0]).toBeLessThan(0); // deflected away from the sphere, toward the hole's centre
    expect(Math.hypot(p.vx[0]!, p.vy[0]!, p.vz[0]!)).toBeCloseTo(1, 12);
  });
});

describe('collide3D', () => {
  it('conserves momentum and kinetic energy in oblique, unequal-mass collisions', () => {
    const random = seededRandom(7);
    for (let trial = 0; trial < 100; trial++) {
      const v = () => (random() - 0.5) * 10;
      const p = particles([
        { x: 3, y: 3, z: 3, vx: v(), vy: v(), vz: v(), m: 1 + random() * 5 },
        { x: 4, y: 3.3, z: 2.8, vx: v(), vy: v(), vz: v(), m: 1 + random() * 5 },
      ]);
      const mom = () => [p.vx, p.vy, p.vz].map((v) => p.mass[0]! * v[0]! + p.mass[1]! * v[1]!);
      const ke = () =>
        [0, 1].reduce(
          (sum, i) => sum + 0.5 * p.mass[i]! * (p.vx[i]! ** 2 + p.vy[i]! ** 2 + p.vz[i]! ** 2),
          0,
        );
      const [m0, e0] = [mom(), ke()];
      collide3D(p, 0, 1, createEvent(Collision.PARTICLE, 0, 0, 1), reflecting);
      mom().forEach((m, k) => expect(m).toBeCloseTo(m0[k]!, 10));
      expect(ke()).toBeCloseTo(e0, 10);
    }
  });

  it('moves both spheres to the event time first', () => {
    const p = particles([
      { x: 1, y: 1, z: 1, vx: 0, vy: 0, vz: 1 },
      { x: 1, y: 1, z: 4, vx: 0, vy: 0, vz: -1 },
    ]);
    collide3D(p, 0, 1, createEvent(Collision.PARTICLE, 1, 0, 1), reflecting);
    expect([p.z[0], p.z[1], p.vz[0], p.vz[1]]).toEqual([2, 3, -1, 1]);
    moveToTime3D(p, 0, 2);
    expect(p.z[0]).toBe(1);
  });
});
