import { describe, expect, it } from 'vitest';
import { loadPresetText, loadSettings, presetNames } from '../io';
import { Collision, MAX_TIME, createEvent, type EventInfo } from './event';
import {
  boundaryCollide2D,
  collide2D,
  moveToTime2D,
  predictBoundary2D,
  predictPair2D,
} from './particle-2d';
import { seededRandom, syntheticGas } from './scenes';
import { Simulation, snapSubtract, type InitialState } from './simulation';
import { ArenaType } from './simulation-info';

const SUPPORTED = new Set<string>([ArenaType.REFLECTING_BOUNDARIES, ArenaType.PERIODIC_BOUNDARIES]);

function momentum(sim: Simulation): [number, number] {
  const p = sim.particles;
  let px = 0;
  let py = 0;
  for (let i = 0; i < p.count; i++) {
    px += p.mass[i]! * p.vx[i]!;
    py += p.mass[i]! * p.vy[i]!;
  }
  return [px, py];
}

/** Largest |mv| of any particle, to scale momentum tolerances. */
function momentumScale(sim: Simulation): number {
  const p = sim.particles;
  let max = 0;
  for (let i = 0; i < p.count; i++) {
    max = Math.max(max, p.mass[i]! * Math.hypot(p.vx[i]!, p.vy[i]!));
  }
  return max;
}

function expectNoOverlapsInside(sim: Simulation): void {
  const p = sim.particles;
  const { xSize, ySize } = sim.arena;
  const reflecting = sim.arena.type === ArenaType.REFLECTING_BOUNDARIES;
  const slack = 1e-12 * Math.max(xSize, ySize);
  for (let i = 0; i < p.count; i++) {
    const r = p.radius[i]!;
    if (reflecting) {
      expect(p.x[i]).toBeGreaterThanOrEqual(r - slack);
      expect(p.x[i]).toBeLessThanOrEqual(xSize - r + slack);
      expect(p.y[i]).toBeGreaterThanOrEqual(r - slack);
      expect(p.y[i]).toBeLessThanOrEqual(ySize - r + slack);
    }
    for (let j = i + 1; j < p.count; j++) {
      // nearest image in periodic arenas
      let dx = Math.abs(p.x[i]! - p.x[j]!);
      let dy = Math.abs(p.y[i]! - p.y[j]!);
      if (!reflecting) {
        dx = Math.min(dx, xSize - dx);
        dy = Math.min(dy, ySize - dy);
      }
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(r + p.radius[j]! - slack);
    }
  }
}

describe('Simulation', () => {
  const presets2D = presetNames.filter((name) => name.startsWith('2D') || name === 'default');

  it.each(presets2D)('runs %s (if supported) conserving energy, without overlaps', async (name) => {
    const { settings } = loadSettings(await loadPresetText(name), { random: seededRandom(3) });
    if (!SUPPORTED.has(settings.arenaType)) {
      expect(() => new Simulation(settings)).toThrow(/not supported yet/);
      return;
    }
    const sim = new Simulation(settings);
    const energy = sim.kineticEnergy();
    let last = 0;
    for (let k = 0; k < 2000; k++) {
      const event = sim.step();
      expect(event).not.toBeNull();
      expect(event!.time).toBeGreaterThanOrEqual(last);
      last = event!.time;
    }
    sim.advanceToTime(last);
    expect(sim.kineticEnergy() / energy).toBeCloseTo(1, 12);
    expectNoOverlapsInside(sim);
  });

  it('zeroes total momentum in periodic arenas and keeps it there', () => {
    const sim = new Simulation(
      syntheticGas({ count: 80, arenaType: ArenaType.PERIODIC_BOUNDARIES, seed: 5 }),
    );
    const scale = momentumScale(sim);
    const [px0, py0] = momentum(sim);
    expect(Math.abs(px0)).toBeLessThan(1e-12 * scale);
    expect(Math.abs(py0)).toBeLessThan(1e-12 * scale);
    for (let k = 0; k < 5000; k++) sim.step();
    const [px, py] = momentum(sim);
    expect(Math.abs(px)).toBeLessThan(1e-10 * scale);
    expect(Math.abs(py)).toBeLessThan(1e-10 * scale);
  });

  it('advances frames: the first only snapshots, later ones move everyone to the frame time', () => {
    const sim = new Simulation(syntheticGas({ count: 20 }), { frameDuration: 1e-12 });
    sim.advanceToNextFrame();
    expect(sim.getCurrentFrame().time).toBe(0);
    sim.advanceToNextFrame();
    sim.advanceToNextFrame();
    const frame = sim.getCurrentFrame();
    expect(frame.time).toBe(2e-12);
    expect(frame.positions).toHaveLength(40);
    expect(Array.from(sim.particles.t0).every((t) => t === 2e-12)).toBe(true);
  });

  it('reports each event to onEvent before performing it', () => {
    const seen: number[] = [];
    const sim = new Simulation(syntheticGas({ count: 10 }), {
      onEvent: (event) => seen.push(event.time),
    });
    for (let k = 0; k < 50; k++) sim.step();
    expect(seen).toHaveLength(50);
    expect(sim.counters.events).toBe(50);
  });

  it('returns null when nothing will ever happen', () => {
    const still: InitialState = {
      dimension: 2,
      arenaType: ArenaType.REFLECTING_BOUNDARIES,
      arenaXSize: 10,
      arenaYSize: 10,
      arenaZSize: 0,
      species: [
        {
          type: { particleMass: 1, particleRadius: 1 },
          positions: new Float64Array([5, 5, 0]),
          velocities: new Float64Array(3),
        },
      ],
    };
    const sim = new Simulation(still);
    expect(sim.nextEventTime()).toBe(MAX_TIME);
    expect(sim.step()).toBeNull();
  });

  it('rejects arenas and dimensions not ported yet', () => {
    const init = syntheticGas({ count: 4 });
    expect(() => new Simulation({ ...init, dimension: 3 })).toThrow(/3D/);
    expect(() => new Simulation({ ...init, arenaType: ArenaType.DIVIDED_ARENA })).toThrow(
      /not supported yet/,
    );
  });

  it.each([ArenaType.REFLECTING_BOUNDARIES, ArenaType.PERIODIC_BOUNDARIES])(
    'performs the same events as a brute-force search (%s)',
    (arenaType) => {
      // Reference: predict every event from scratch each step and take the soonest, with
      // the same lazy motion as the engine (only the particles an event involves move).
      // The arithmetic is then identical, so the calendar must pick exactly the same
      // events at exactly the same times.
      const init = syntheticGas({ count: 12, arenaType, seed: 9, packing: 0.3 });
      const sim = new Simulation(init);
      const reference = new Simulation(init); // same initial state, incl. periodic momentum fix
      const p = reference.particles;
      const arena = reference.arena;
      const candidate: EventInfo = createEvent();
      const best: EventInfo = createEvent();

      for (let step = 0; step < 2000; step++) {
        best.time = MAX_TIME;
        for (let i = 0; i < p.count; i++) {
          predictBoundary2D(p, i, arena, candidate);
          if (candidate.time < best.time) Object.assign(best, candidate, { part1: i, part2: 0 });
          for (let j = i + 1; j < p.count; j++) {
            predictPair2D(p, i, j, arena, candidate);
            if (candidate.time < best.time) Object.assign(best, candidate, { part1: i, part2: j });
          }
        }
        if (best.type === Collision.PARTICLE) {
          moveToTime2D(p, best.part1, best.time);
          moveToTime2D(p, best.part2, best.time);
          collide2D(p, best.part1, best.part2, best, arena);
        } else {
          boundaryCollide2D(p, best.part1, best, arena);
        }

        const event = sim.step()!;
        expect({ ...event }).toEqual({ ...best });
      }
    },
  );
});

describe('snapSubtract', () => {
  it('snaps near-cancellation to zero but keeps real differences', () => {
    expect(snapSubtract(1, 1 - 1e-16)).toBe(0);
    expect(snapSubtract(1, 1)).toBe(0);
    expect(snapSubtract(1, 0.5)).toBe(0.5);
    expect(snapSubtract(1, 1 - 1e-12)).toBe(1 - (1 - 1e-12));
  });
});
