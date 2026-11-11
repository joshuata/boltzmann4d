// Reverse (SIM-32) and chaos (SIM-4): the motion retraces itself after reverse(), and
// round-off differences grow exponentially, as `2Dequal` shows (STORY-21, STORY-22).
import { describe, expect, it } from 'vitest';
import { loadPresetText, loadSetFile } from '../io';
import { PistonMode } from './piston';
import { seededRandom, syntheticGas } from './scenes';
import { Simulation, type InitialState } from './simulation';
import { ArenaType } from './simulation-info';

const PS = 1e-12;
const NM = 1e-9;

async function preset(name: string, overrides: Partial<InitialState> = {}): Promise<InitialState> {
  const { scenario } = loadSetFile(await loadPresetText(name), { random: seededRandom(4) });
  return { ...scenario, reactions: [], ...overrides };
}

interface State {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  vz: Float64Array;
}

function state(sim: Simulation): State {
  const p = sim.particles;
  return {
    x: p.x.slice(),
    y: p.y.slice(),
    z: p.z.slice(),
    vx: p.vx.slice(),
    vy: p.vy.slice(),
    vz: p.vz.slice(),
  };
}

/** Largest distance (m) between where particles are and where they were, nearest image if periodic. */
function maxDisplacement(sim: Simulation, from: State): number {
  const p = sim.particles;
  const { xSize, ySize, zSize } = sim.arena;
  const periodic = sim.arena.type === ArenaType.PERIODIC_BOUNDARIES;
  const wrap = (d: number, size: number) => (periodic ? d - size * Math.round(d / size) : d);
  let max = 0;
  for (let k = 0; k < p.count; k++) {
    const dx = wrap(p.x[k]! - from.x[k]!, xSize);
    const dy = wrap(p.y[k]! - from.y[k]!, ySize);
    const dz = sim.dimension === 3 ? wrap(p.z[k]! - from.z[k]!, zSize) : 0;
    max = Math.max(max, Math.hypot(dx, dy, dz));
  }
  return max;
}

function momentum(sim: Simulation): [number, number, number] {
  const p = sim.particles;
  const total: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < p.count; k++) {
    total[0] += p.mass[k]! * p.vx[k]!;
    total[1] += p.mass[k]! * p.vy[k]!;
    total[2] += p.mass[k]! * p.vz[k]!;
  }
  return total;
}

/** Sum of |m v|, to scale momentum tolerances. */
function momentumScale(sim: Simulation): number {
  const p = sim.particles;
  let sum = 0;
  for (let k = 0; k < p.count; k++) {
    sum += p.mass[k]! * Math.hypot(p.vx[k]!, p.vy[k]!, p.vz[k]!);
  }
  return sum;
}

/** Runs frames of `frame` seconds until `until`, as the worker does. */
function runFrames(sim: Simulation, until: number, frame = 0.4 * PS): void {
  while (sim.time < until) sim.advanceToTime(Math.min(sim.time + frame, until));
}

describe('reverse (SIM-32)', () => {
  // Chaos amplifies round-off (SIM-4), so each run is short enough to come back to well
  // under a thousandth of a radius; a missed or wrong event would be off by nanometres.
  it.each([
    ['2D reflecting', () => syntheticGas({ count: 60, seed: 3 }), 15 * PS],
    [
      '2D periodic',
      () => syntheticGas({ count: 60, seed: 4, arenaType: ArenaType.PERIODIC_BOUNDARIES }),
      15 * PS,
    ],
    ['2D divided with a hole', () => preset('2Deffuse'), 15 * PS],
    [
      '2D square wells',
      () => preset('default', { wells: { radiusMultiplier: 1.5, depths: [2] } }),
      15 * PS,
    ],
    ['3D reflecting', () => preset('3Dpresnum'), 30 * PS],
    [
      '3D periodic',
      () => preset('3Dhyd1000', { arenaType: ArenaType.PERIODIC_BOUNDARIES }),
      40 * PS,
    ],
    ['3D divided with a hole', () => preset('3Deffuse'), 30 * PS],
  ] as const)('retraces the motion: %s', async (_, init, duration) => {
    const sim = new Simulation(await init());
    const start = state(sim);
    const energy = sim.kineticEnergy();
    const scale = momentumScale(sim);
    runFrames(sim, duration);
    expect(sim.counters.particleCollisions).toBeGreaterThan(5);
    const [px, py, pz] = momentum(sim);
    // With wells, kinetic energy alone isn't conserved (particles can start inside a well).
    if (_ !== '2D square wells') expect(sim.kineticEnergy()).toBeCloseTo(energy, 25);
    const beforeReverse = sim.kineticEnergy();

    sim.reverse();
    expect(sim.time).toBe(duration); // the clock keeps running forward
    const [rx, ry, rz] = momentum(sim);
    // (+ 0 so that -0 and 0 compare equal)
    expect([rx + 0, ry + 0, rz + 0]).toEqual([-px + 0, -py + 0, -pz + 0]);
    expect(sim.kineticEnergy()).toBeCloseTo(beforeReverse, 25);

    runFrames(sim, 2 * duration);
    expect(maxDisplacement(sim, start)).toBeLessThan(1e-3 * NM);
    // Back where it started, moving the opposite way.
    const p = sim.particles;
    let velocityError = 0;
    for (let k = 0; k < p.count; k++) {
      const error = Math.hypot(
        p.vx[k]! + start.vx[k]!,
        p.vy[k]! + start.vy[k]!,
        p.vz[k]! + start.vz[k]!,
      );
      velocityError = Math.max(
        velocityError,
        error / Math.hypot(start.vx[k]!, start.vy[k]!, start.vz[k]!),
      );
    }
    expect(velocityError).toBeLessThan(1e-5);
    expect(sim.kineticEnergy() / energy).toBeCloseTo(1, 12);
    const [bx, by, bz] = momentum(sim);
    if (sim.arena.type === ArenaType.PERIODIC_BOUNDARIES) {
      // Periodic arenas conserve momentum (zero here); walls exchange it.
      for (const m of [bx, by, bz]) expect(Math.abs(m)).toBeLessThan(1e-10 * scale);
    }
  });

  it('retraces after step(), when particles are at different times', () => {
    const sim = new Simulation(syntheticGas({ count: 40, seed: 8 }));
    const start = state(sim);
    let last = 0;
    for (let k = 0; k < 150; k++) last = sim.step()!.time;
    sim.reverse();
    expect(sim.time).toBe(last);
    expect(Array.from(sim.particles.t0).every((t) => t === last)).toBe(true);
    sim.advanceToTime(2 * last);
    expect(maxDisplacement(sim, start)).toBeLessThan(1e-3 * NM);
  });

  it('reversing twice gives back the same velocities, exactly', () => {
    const sim = new Simulation(syntheticGas({ count: 30, seed: 2 }));
    runFrames(sim, 5 * PS);
    const before = state(sim);
    sim.reverse();
    sim.reverse();
    expect(state(sim)).toEqual(before);
    // ... and the run carries on as if nothing happened.
    const twin = new Simulation(syntheticGas({ count: 30, seed: 2 }));
    runFrames(twin, 5 * PS);
    runFrames(sim, 8 * PS);
    runFrames(twin, 8 * PS);
    expect(maxDisplacement(sim, state(twin))).toBeLessThan(1e-6 * NM);
  });

  it('sends a moving piston back to where its move started', async () => {
    const sim = new Simulation(await preset('default', { arenaType: ArenaType.MOVABLE_PISTON }));
    const piston = sim.piston!;
    const start = state(sim);
    const energy = sim.kineticEnergy();
    sim.movePiston(0.4, PistonMode.ADIABATIC, 200);
    runFrames(sim, 15 * PS); // 3 nm in
    expect(piston.curLevel).toBeGreaterThan(0.04);
    expect(piston.isMoving(sim.time)).toBe(true);

    sim.reverse();
    runFrames(sim, 30 * PS);
    expect(piston.curLevel).toBeCloseTo(0, 12);
    // Adiabatic bounces off the moving piston are reversible too.
    expect(maxDisplacement(sim, start)).toBeLessThan(1e-3 * NM);
    expect(sim.kineticEnergy() / energy).toBeCloseTo(1, 9);
    // It stops at the top; reversing a stopped piston leaves it alone.
    runFrames(sim, 35 * PS);
    expect(piston.isMoving(sim.time)).toBe(false);
    sim.reverse();
    expect(piston.targetLevel).toBe(piston.curLevel);
  });
});

describe('chaos (SIM-4, STORY-21)', () => {
  it('2Dequal: the halves move identically, then diverge around 90–120 ps', async () => {
    // Two copies of the same 20 particles, 41 nm apart on either side of a solid divider.
    const sim = new Simulation(await preset('2Dequal'));
    const p = sim.particles;
    const n = p.count / 2;
    const offset = p.x[n]! - p.x[0]!;
    expect(offset).toBeCloseTo(41 * NM, 20);
    for (let k = 0; k < n; k++) {
      expect(p.vx[n + k]).toBe(p.vx[k]);
      expect(p.vy[n + k]).toBe(p.vy[k]);
    }
    /** Largest distance between a particle and its copy, nm. */
    const difference = () => {
      let max = 0;
      for (let k = 0; k < n; k++) {
        max = Math.max(max, Math.hypot(p.x[n + k]! - offset - p.x[k]!, p.y[n + k]! - p.y[k]!));
      }
      return max / NM;
    };
    const samples: number[] = []; // difference at each ps
    for (let ps = 0; ps <= 130; ps++) {
      runFrames(sim, ps * PS);
      samples.push(difference());
    }
    // Only round-off at first (the copies' positions differ in the last bits)...
    expect(samples[10]).toBeLessThan(1e-12);
    // ... growing exponentially, by orders of magnitude every 10 ps or so ...
    expect(samples[50]! / samples[10]!).toBeGreaterThan(1e4);
    // ... until a particle and its copy are visibly apart (a radius, 1 nm) ...
    const visible = samples.findIndex((d) => d > 1);
    expect(visible).toBeGreaterThanOrEqual(80);
    expect(visible).toBeLessThanOrEqual(100);
    // ... and then unrelated (apart by a quarter of the box or more).
    const unrelated = samples.findIndex((d) => d > 20);
    expect(unrelated).toBeGreaterThan(visible);
    expect(unrelated).toBeLessThanOrEqual(120);
  });
});
