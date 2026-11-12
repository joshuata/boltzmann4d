import { describe, expect, it } from 'vitest';
import { loadPresetText, loadSetFile } from '../io';
import { Collision } from './event';
import { compressionLimitPercent, Piston, PistonMode } from './piston';
import { seededRandom } from './scenes';
import { Simulation, type InitialState } from './simulation';
import { ArenaType } from './simulation-info';

async function pistonArena(): Promise<InitialState> {
  const { scenario } = loadSetFile(await loadPresetText('default'), { random: seededRandom(2) });
  return { ...scenario, arenaType: ArenaType.MOVABLE_PISTON };
}

/** Runs frames, checking that every particle stays below the piston face. */
function runFrames(sim: Simulation, frames: number): void {
  const p = sim.particles;
  for (let f = 0; f < frames; f++) {
    sim.advanceToNextFrame();
    const face = sim.piston!.position();
    for (let i = 0; i < p.count; i++) {
      expect(p.y[i]! + p.radius[i]!).toBeLessThanOrEqual(face * (1 + 1e-12));
    }
  }
}

describe('Piston', () => {
  it('moves at its speed towards the target and stops there', () => {
    const piston = new Piston(0, 0, 10e-9);
    piston.targetLevel = 0.5;
    piston.speed = 100; // m/s: 5 nm takes 50 ps
    expect(piston.velocity()).toBe(-100);
    expect(piston.stopTime()).toBeCloseTo(50e-12, 24);
    piston.moveToTime(20e-12);
    expect(piston.position()).toBeCloseTo(8e-9, 21);
    expect(piston.isMoving(20e-12)).toBe(true);
    piston.moveToTime(60e-12);
    expect(piston.curLevel).toBe(0.5);
    expect(piston.isMoving(60e-12)).toBe(false);
  });

  it('leaves room for the particles (compression limit)', () => {
    // 100 discs of 1 nm diameter in a 20 nm wide arena: 5 nm of discs plus 2 nm to spare.
    const arena = { xSize: 20e-9, ySize: 50e-9, zSize: 0 };
    expect(compressionLimitPercent(arena, [{ radius: 0.5e-9, count: 100 }])).toBeCloseTo(14, 10);
  });

  it('leaves room for the particles in 3D (cubes over x·z)', () => {
    // 1000 spheres of 1 nm diameter under a 10 × 10 nm plate: 10 nm of cubes plus 2 nm.
    const arena = { xSize: 10e-9, ySize: 50e-9, zSize: 10e-9 };
    expect(compressionLimitPercent(arena, [{ radius: 0.5e-9, count: 1000 }], 3)).toBeCloseTo(
      24,
      10,
    );
  });
});

describe('piston arena', () => {
  it('heats the gas on adiabatic compression and cools it on expansion', async () => {
    const sim = new Simulation(await pistonArena());
    sim.advanceToNextFrame();
    const start = sim.kineticEnergy();
    runFrames(sim, 20);
    expect(sim.kineticEnergy() / start).toBeCloseTo(1, 12); // at rest: energy conserved

    sim.movePiston(0.5, PistonMode.ADIABATIC, 500);
    runFrames(sim, 400);
    expect(sim.piston!.curLevel).toBe(0.5);
    const compressed = sim.kineticEnergy();
    expect(compressed / start).toBeGreaterThan(1.3);

    sim.movePiston(0, PistonMode.ADIABATIC, 500);
    runFrames(sim, 400);
    expect(sim.kineticEnergy()).toBeLessThan(compressed);
  });

  it('keeps the kinetic energy steady on isothermal compression', async () => {
    const sim = new Simulation(await pistonArena());
    sim.advanceToNextFrame();
    const start = sim.kineticEnergy();
    sim.movePiston(0.5, PistonMode.ISOTHERMAL, 500);
    runFrames(sim, 400);
    expect(sim.piston!.curLevel).toBe(0.5);
    expect(sim.thermostat.enabled).toBe(true);
    expect(sim.kineticEnergy() / start).toBeCloseTo(1, 1.5);
  });

  it('stops where it is when told to', async () => {
    const sim = new Simulation(await pistonArena());
    sim.advanceToNextFrame();
    sim.movePiston(0.5, PistonMode.ADIABATIC, 500);
    runFrames(sim, 30);
    sim.stopPiston();
    const level = sim.piston!.curLevel;
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThan(0.5);
    runFrames(sim, 50);
    expect(sim.piston!.curLevel).toBe(level);
  });

  it('re-predicts after an instantaneous move, so nothing bounces off the old position', async () => {
    // Java doesn't re-predict here (joshuata/boltzmann4d#24).
    const piston: number[] = [];
    const sim = new Simulation(await pistonArena(), {
      onEvent: (e) => {
        if (e.type === Collision.PISTON) piston.push(e.part1);
      },
    });
    sim.advanceToNextFrame();
    sim.movePiston(0.4, PistonMode.ADIABATIC, 800);
    runFrames(sim, 200);
    sim.movePiston(0.1, PistonMode.INSTANTANEOUS, 800);
    piston.length = 0;
    const p = sim.particles;
    const face = sim.piston!.position();
    // Every piston bounce from now on happens at the new face.
    let checked = 0;
    for (let k = 0; k < 3000; k++) {
      const event = sim.step()!;
      if (event.type !== Collision.PISTON) continue;
      expect(p.y[event.part1]! + p.radius[event.part1]!).toBeCloseTo(face, 15);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('refuses moves past the compression limit and instantaneous compression', async () => {
    const sim = new Simulation(await pistonArena());
    expect(() => sim.movePiston(sim.maxPistonLevel() + 0.01, PistonMode.ADIABATIC, 500)).toThrow(
      RangeError,
    );
    expect(() => sim.movePiston(0.2, PistonMode.INSTANTANEOUS, 500)).toThrow(/pull the piston out/);
  });
});
