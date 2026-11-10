import { describe, expect, it } from 'vitest';
import { loadPresetText, loadSetFile } from '../io';
import type { AttractiveWallOptions } from './attractive-wall';
import { Collision } from './event';
import { seededRandom, syntheticGas } from './scenes';
import { Simulation, type InitialState } from './simulation';
import { ArenaType } from './simulation-info';

const kB = 1.3806504e-23;

async function withWall(wall: AttractiveWallOptions, preset = 'default'): Promise<InitialState> {
  const { scenario } = loadSetFile(await loadPresetText(preset), { random: seededRandom(5) });
  return { ...scenario, attractiveWall: wall };
}

/** Steps `events` events and moves everyone to the last one, calling `each` per step. */
function run(sim: Simulation, events: number, each?: () => void): void {
  let last = 0;
  for (let k = 0; k < events; k++) {
    last = sim.step()!.time;
    each?.();
  }
  sim.advanceToTime(last);
}

describe('attractive wall', () => {
  it('conserves kinetic + well energy (Java lost energy here, #24)', async () => {
    const sim = new Simulation(await withWall({ width: 10e-9, depth: 2.5 }));
    const total = sim.kineticEnergy() + sim.potentialEnergy();
    run(sim, 40_000);
    expect((sim.kineticEnergy() + sim.potentialEnergy()) / total).toBeCloseTo(1, 9);
    expect(sim.particlesInWallWell()).toBeGreaterThan(0);
  });

  it('keeps particles inside the arena and the well bookkeeping right', async () => {
    const width = 10e-9;
    const sim = new Simulation(await withWall({ width, depth: 6 }));
    run(sim, 30_000);
    const p = sim.particles;
    let inside = 0;
    for (let i = 0; i < p.count; i++) {
      expect(p.y[i]!).toBeGreaterThanOrEqual(p.radius[i]! * (1 - 1e-12));
      expect(p.y[i]!).toBeLessThanOrEqual(sim.arena.ySize - p.radius[i]! * (1 - 1e-12));
      if (p.y[i]! < width) inside++;
    }
    // Particles sitting exactly on the well's edge may be either; allow for that.
    expect(Math.abs(sim.particlesInWallWell() - inside)).toBeLessThanOrEqual(2);
  });

  it('holds particles in the well by the Boltzmann factor exp(E / kT)', () => {
    // A dilute gas over a step potential: the density inside the well, relative to
    // outside, is exp(E / kT). (Denser gases fall short: hard discs crowd each other in
    // the well.) Time-averaged over many snapshots.
    const gas = syntheticGas({ count: 200, seed: 3, packing: 0.02 });
    const init: InitialState = { ...gas, species: [gas.species[0]!] };
    const width = init.arenaYSize / 5;
    const depth = 2.5; // kJ/mol
    const sim = new Simulation({ ...init, attractiveWall: { width, depth } });
    const p = sim.particles;
    const radius = p.radius[0]!;
    run(sim, 100_000);
    let inside = 0;
    let outside = 0;
    let kineticEnergy = 0;
    const samples = 400;
    for (let s = 0; s < samples; s++) {
      run(sim, 500);
      for (let i = 0; i < p.count; i++) {
        if (p.y[i]! < width) inside++;
        else outside++;
      }
      kineticEnergy += sim.kineticEnergy() / p.count;
    }
    const kT = kineticEnergy / samples; // 2D: mean kinetic energy per particle = kT
    const E = (depth * 1e3) / 6.02214179e23;
    // Where centres can be: [r, width) inside, [width, height − r] outside.
    const areaRatio = (width - radius) / (sim.arena.ySize - radius - width);
    expect(inside / outside / (Math.exp(E / kT) * areaRatio)).toBeCloseTo(1, 1.3); // ±2.5%
    expect(kT / kB).toBeGreaterThan(300); // falling into the well heats the gas
  });

  it('bounces particles that cannot climb out back into the well', async () => {
    // A deep well: many attempts to leave lack the energy and bounce back down, and
    // nothing is gained doing so.
    let exits = 0;
    let bounced = 0;
    let leaving = -1;
    const sim = new Simulation(await withWall({ width: 10e-9, depth: 20 }), {
      onEvent: (e) => (leaving = e.type === Collision.EXIT_GRAVITY_WELL ? e.part1 : -1),
    });
    const total = sim.kineticEnergy() + sim.potentialEnergy();
    let last = 0;
    for (let k = 0; k < 50_000; k++) {
      last = sim.step()!.time;
      if (leaving < 0) continue;
      exits++;
      if (sim.particles.vy[leaving]! < 0) bounced++;
    }
    sim.advanceToTime(last);
    expect(bounced).toBeGreaterThan(0);
    expect(bounced).toBeLessThan(exits);
    expect((sim.kineticEnergy() + sim.potentialEnergy()) / total).toBeCloseTo(1, 9);
  });

  it('has no effect on periodic arenas, and must be wider than a particle', async () => {
    const init = await withWall({ width: 10e-9, depth: 2.5 });
    const periodic = new Simulation({ ...init, arenaType: ArenaType.PERIODIC_BOUNDARIES });
    expect(periodic.wall).toBeNull();
    const thin = await withWall({ width: 1e-10, depth: 2.5 });
    expect(() => new Simulation(thin)).toThrow(RangeError);
  });
});
