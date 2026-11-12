// Seeded, headless versions of classroom stories that give numbers (docs/specs/stories.md).
import { describe, expect, it } from 'vitest';
import { census } from '../sim/particle-edits';
import { PistonMode } from '../sim/piston';
import { Simulation, type InitialState } from '../sim/simulation';
import { ArenaType } from '../sim/simulation-info';
import { adiabaticTemperature } from './formulas';
import { Statistics } from './statistics';
import type { DistributionId } from './statistic-ids';
import { statsContext } from './stats-context';
import { gas } from './test-gas';

/** Runs past the forget time and `events` more, then samples at a frame boundary. */
function run(init: InitialState, events: number) {
  let stats: Statistics | null = null;
  const sim = new Simulation(init, { onEvent: (e) => stats?.notifyOfEvent(e) });
  stats = new Statistics(statsContext(init), sim.particles, { forgetMultiplier: 10 });
  while (!stats.forgotten) sim.step();
  let last = 0;
  for (let k = 0; k < events; k++) last = sim.step()?.time ?? last;
  sim.advanceToTime(last);
  stats.sampleCurrent(sim.time);
  const plot = (id: DistributionId, types?: number[]) => {
    const all = stats.summary(sim.time, { statistic: id }).statistics;
    return types ? all.find((s) => s.types.join() === types.join())! : all.at(-1)!;
  };
  return { sim, stats, plot };
}

describe('STORY-4: RMS speed exceeds the average speed', () => {
  it.each([
    [
      2,
      1.128,
      gas([{ count: 100, mass: 40, radius: 0.5, temperature: 300 }], [28, 28, 0], {
        arenaType: ArenaType.PERIODIC_BOUNDARIES,
      }),
    ],
    [
      3,
      1.085,
      gas([{ count: 125, mass: 40, radius: 0.5, temperature: 300 }], [12, 12, 12], {
        dimension: 3,
        arenaType: ArenaType.PERIODIC_BOUNDARIES,
      }),
    ],
  ] as const)('in %iD by a factor of about %f', (_, expected, init) => {
    const { plot } = run(init, 150_000);
    const rms = plot('RMS_VELOCITY').cumulative.average;
    const average = plot('INSTANTANEOUS_SPEED').cumulative.average;
    expect(Math.abs(rms / average / expected - 1)).toBeLessThan(0.005);
  });
});

describe('STORY-20: kinetic energy doesn’t depend on mass or radius', () => {
  it('heavy large and light small particles: speeds differ, kinetic energies match', () => {
    const init = gas(
      [
        { count: 40, mass: 100, radius: 0.8, temperature: 300 },
        { count: 40, mass: 10, radius: 0.4, temperature: 300 },
      ],
      [36, 36, 0],
    );
    const { plot } = run(init, 150_000);
    const [heavySpeed, lightSpeed] = [[0], [1]].map(
      (t) => plot('INSTANTANEOUS_SPEED', t).cumulative.average,
    );
    expect(lightSpeed! / heavySpeed!).toBeCloseTo(Math.sqrt(10), 0.5);
    const [heavyKE, lightKE] = [[0], [1]].map((t) => plot('KINETIC_ENERGY', t).cumulative);
    expect(heavyKE!.average / lightKE!.average).toBeCloseTo(1, 1.3); // within ±2.5%
    // ... and their distributions match too.
    expect(heavyKE!.width / lightKE!.width).toBeCloseTo(1, 1);
    // The Average Kinetic Energy plot agrees.
    const [heavyAvg, lightAvg] = [[0], [1]].map((t) => plot('AVERAGE_ENERGY', t).current.average);
    expect(heavyAvg! / lightAvg!).toBeCloseTo(1, 1.3);
  });
});

/** Moves the piston to `level` at `speed` m/s and runs until it has stopped. */
function pistonTo(sim: Simulation, level: number, mode: PistonMode, speed: number) {
  sim.movePiston(level, mode, speed);
  while (sim.piston!.isMoving(sim.time)) sim.advanceToNextFrame();
  sim.advanceToNextFrame();
}

describe('STORY-24 and STORY-25: compressing the gas with the piston', () => {
  const temperatureOf = (sim: Simulation) => census(sim.currentState()).temperature;
  /** Dense enough that collisions share out the energy the piston adds along y. */
  const pistonGas = (dimension: number) => {
    const [count, radius, side] = dimension === 3 ? [250, 0.4, 30] : [150, 0.3, 60];
    const size: [number, number, number] = [side, side, dimension === 3 ? side : 0];
    const init = gas([{ count, mass: 2, radius, temperature: 300 }], size, {
      dimension,
      arenaType: ArenaType.MOVABLE_PISTON,
    });
    // The height the centres can use, nm: the box's (or the piston's) less a diameter.
    const free = (level: number) => side * (1 - level) - 2 * radius;
    return { sim: new Simulation(init), free };
  };

  it.each([2, 3])(
    'adiabatic: %iD temperature follows T₁ (V₁/V₂)^{2/d} and comes back close',
    (dimension) => {
      const { sim, free } = pistonGas(dimension);
      const t1 = temperatureOf(sim);
      pistonTo(sim, 0.5, PistonMode.ADIABATIC, 50);
      const predicted = adiabaticTemperature(t1, free(0), free(0.5), dimension);
      expect(temperatureOf(sim) / predicted).toBeCloseTo(1, 1);
      pistonTo(sim, 0, PistonMode.ADIABATIC, 50);
      // Close to the start, and usually a little above it (PRED-15).
      const back = temperatureOf(sim) / t1;
      expect(back).toBeGreaterThan(0.98);
      expect(back).toBeLessThan(1.08);
    },
  );

  it.each([2, 3])('isothermal: %iD temperature stays put', (dimension) => {
    const { sim } = pistonGas(dimension);
    const t1 = temperatureOf(sim);
    pistonTo(sim, 0.5, PistonMode.ISOTHERMAL, 50);
    expect(temperatureOf(sim) / t1).toBeCloseTo(1, 1);
    expect(sim.thermostat.enabled).toBe(true);
  });
});
