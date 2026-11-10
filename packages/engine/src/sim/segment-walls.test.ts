import { describe, expect, it } from 'vitest';
import { Collision } from './event';
import { seededRandom } from './scenes';
import { distanceToSegment, type WallShape } from './segment-walls';
import { Simulation, type InitialState } from './simulation';
import { ArenaType } from './simulation-info';

const NM = 1e-9;
const SIDE = 60 * NM;
const RADIUS = 1 * NM;

/** Particles of 2 amu, radius 1 nm, in a 60 nm reflecting box with the given walls. */
function scene(
  walls: WallShape[],
  particles: { x: number; y: number; vx: number; vy: number }[],
): InitialState {
  return {
    dimension: 2,
    arenaType: ArenaType.REFLECTING_BOUNDARIES,
    arenaXSize: SIDE,
    arenaYSize: SIDE,
    arenaZSize: 0,
    walls,
    species: [
      {
        type: { particleMass: 2, particleRadius: RADIUS },
        positions: Float64Array.from(particles.flatMap((p) => [p.x * NM, p.y * NM, 0])),
        velocities: Float64Array.from(particles.flatMap((p) => [p.vx, p.vy, 0])),
      },
    ],
  };
}

/** Points in nm to meters. */
const nm = (points: [number, number][]) => points.map(([x, y]) => [x * NM, y * NM] as const);

/** Particles on a jittered grid inside [x0, x1] × [y0, y1] nm, with random directions. */
function gas(count: number, [x0, y0, x1, y1]: number[], seed: number) {
  const random = seededRandom(seed);
  const cols = Math.ceil(Math.sqrt(count));
  const dx = (x1! - x0!) / cols;
  const dy = (y1! - y0!) / cols;
  return Array.from({ length: count }, (_, k) => {
    const theta = random() * 2 * Math.PI;
    return {
      x: x0! + ((k % cols) + 0.5 + (random() - 0.5) * 0.3) * dx,
      y: y0! + (Math.floor(k / cols) + 0.5 + (random() - 0.5) * 0.3) * dy,
      vx: 1500 * Math.cos(theta),
      vy: 1500 * Math.sin(theta),
    };
  });
}

function run(sim: Simulation, events: number): number {
  let last = 0;
  let wallHits = 0;
  for (let k = 0; k < events; k++) {
    const event = sim.step()!;
    last = event.time;
    if (event.type === Collision.DRAWN_WALL) wallHits++;
  }
  sim.advanceToTime(last);
  return wallHits;
}

/** Distance from each particle to the nearest wall, in units of its radius. */
function clearance(sim: Simulation, walls: WallShape[]): number {
  const p = sim.particles;
  let least = Infinity;
  for (let k = 0; k < p.count; k++) {
    for (const wall of walls) {
      const pts = wall.points;
      const n = wall.closed ? pts.length : pts.length - 1;
      for (let s = 0; s < n; s++) {
        const [x1, y1] = pts[s]!;
        const [x2, y2] = pts[(s + 1) % pts.length]!;
        least = Math.min(least, distanceToSegment(p.x[k]!, p.y[k]!, x1, y1, x2, y2) / p.radius[k]!); // prettier-ignore
      }
    }
  }
  return least;
}

describe('drawn walls', () => {
  it('reflect off a face one radius from the line', () => {
    const wall = { points: nm([[20, 10], [20, 30]]) }; // prettier-ignore
    const sim = new Simulation(scene([wall], [{ x: 10, y: 20, vx: 1000, vy: 300 }]));
    const event = sim.step()!;
    expect(event.type).toBe(Collision.DRAWN_WALL);
    expect(event.part2).toBe(0); // segment 0
    expect(event.time).toBeCloseTo((9 * NM) / 1000, 24);
    const p = sim.particles;
    expect(p.x[0]).toBeCloseTo(19 * NM, 20);
    expect([p.vx[0], p.vy[0]]).toEqual([-1000, 300]);
  });

  it('reflect off an end point along the line of centres', () => {
    // Heading straight at the end (20, 30), offset so the contact is off-axis.
    const wall = { points: nm([[20, 10], [20, 30]]) }; // prettier-ignore
    const offset = 0.6; // nm below the end's line of travel
    const sim = new Simulation(scene([wall], [{ x: 30, y: 30 + offset, vx: -1000, vy: 0 }]));
    const event = sim.step()!;
    expect(event.type).toBe(Collision.DRAWN_WALL);
    expect(event.part2).toBeLessThan(0); // an end point
    const p = sim.particles;
    // At contact the centre is one radius from the point.
    expect(Math.hypot(p.x[0]! - 20 * NM, p.y[0]! - 30 * NM)).toBeCloseTo(RADIUS, 20);
    // Speed kept, and the velocity mirrored about the line of centres.
    expect(Math.hypot(p.vx[0]!, p.vy[0]!)).toBeCloseTo(1000, 9);
    const nx = (p.x[0]! - 20 * NM) / RADIUS;
    const ny = (p.y[0]! - 30 * NM) / RADIUS;
    expect(p.vx[0]! * nx + p.vy[0]! * ny).toBeCloseTo(1000 * nx, 9);
  });

  it('pass by a segment they miss', () => {
    const wall = { points: nm([[20, 10], [20, 30]]) }; // prettier-ignore
    const sim = new Simulation(scene([wall], [{ x: 10, y: 35, vx: 1000, vy: 0 }]));
    expect(sim.step()!.type).toBe(Collision.WALL); // the box's right wall
  });

  it('hold particles inside a closed polygon through its corners', () => {
    // A triangle, so particles meet sharp corners.
    const triangle = { points: nm([[5, 5], [55, 5], [30, 55]]), closed: true }; // prettier-ignore
    const particles = gas(25, [22, 12, 38, 28], 3);
    const sim = new Simulation(scene([triangle], particles));
    const energy = sim.kineticEnergy();
    const hits = run(sim, 40_000);
    expect(hits).toBeGreaterThan(1000);
    expect(sim.kineticEnergy() / energy).toBeCloseTo(1, 12);
    expect(clearance(sim, [triangle])).toBeGreaterThan(1 - 1e-6);
    // Still inside: above the base and below both slanted sides.
    const p = sim.particles;
    for (let k = 0; k < p.count; k++) {
      const x = p.x[k]! / NM;
      const y = p.y[k]! / NM;
      expect(y).toBeGreaterThan(5);
      expect((x - 5) * 50 - (y - 5) * 25).toBeGreaterThan(0);
      expect((x - 55) * 50 + (y - 5) * 25).toBeLessThan(0);
    }
  });

  it('keep particles out of crossing walls and their ends', () => {
    // An X of two crossing segments, with open ends for particles to hit.
    const walls = [
      { points: nm([[10, 10], [50, 50]]) }, // prettier-ignore
      { points: nm([[10, 50], [50, 10]]) }, // prettier-ignore
    ];
    const particles = [
      ...gas(8, [22, 4, 38, 14], 4), // below the crossing
      ...gas(8, [22, 46, 38, 56], 5), // above it
    ];
    const sim = new Simulation(scene(walls, particles));
    const energy = sim.kineticEnergy();
    // Particles go round the open ends, so check after every event that none ever gets
    // closer than a radius to either wall (the crossing point included).
    let closest = Infinity;
    for (let k = 0; k < 30_000; k++) {
      const event = sim.step()!;
      if (k % 50 === 0) {
        sim.advanceToTime(event.time);
        closest = Math.min(closest, clearance(sim, walls));
      }
    }
    expect(sim.kineticEnergy() / energy).toBeCloseTo(1, 12);
    expect(closest).toBeGreaterThan(1 - 1e-6);
  });

  it.each([
    [1, 25],
    [3, 25],
    [6, 25],
  ])(
    'retrace their motion when reversed (SIM-32): %i particles, %i events',
    (PARTICLES, EVENTS) => {
      const walls = [
        { points: nm([[15, 15], [45, 15], [45, 45]]) }, // prettier-ignore
        { points: nm([[20, 40], [26, 34]]) }, // prettier-ignore
      ];
      // Clear of the short wall, which ends 2.8 nm from this area's corner.
      const start = gas(PARTICLES, [28, 18, 42, 32], 7);
      const forward = new Simulation(scene(walls, start));
      const p = forward.particles;
      // Collisions with discs and end points amplify round-off exponentially, so reversal
      // only retraces a short run (as with any hard-disc simulation).
      const hits = run(forward, EVENTS);
      expect(hits).toBeGreaterThan(3);
      const elapsed = forward.time;
      const back = scene(
        walls,
        Array.from({ length: p.count }, (_, k) => ({
          x: p.x[k]! / NM,
          y: p.y[k]! / NM,
          vx: -p.vx[k]!,
          vy: -p.vy[k]!,
        })),
      );
      const reversed = new Simulation(back);
      reversed.advanceToTime(elapsed);
      const q = reversed.particles;
      for (let k = 0; k < p.count; k++) {
        // Within 10⁻⁴ nm (radii are 1 nm); a wrong reflection would be off by nanometres.
        expect(q.x[k]! / NM).toBeCloseTo(start[k]!.x, 4);
        expect(q.y[k]! / NM).toBeCloseTo(start[k]!.y, 4);
      }
    },
  );

  it('refuse particles that start on a wall, and other arenas', () => {
    const wall = { points: nm([[20, 10], [20, 30]]) }; // prettier-ignore
    expect(() => new Simulation(scene([wall], [{ x: 20.5, y: 20, vx: 0, vy: 0 }]))).toThrow(
      /overlapping a drawn wall/,
    );
    const periodic = {
      ...scene([wall], [{ x: 10, y: 20, vx: 0, vy: 0 }]),
      arenaType: ArenaType.PERIODIC_BOUNDARIES,
    };
    expect(() => new Simulation(periodic)).toThrow(/periodic boundaries or the piston/);
  });
});
