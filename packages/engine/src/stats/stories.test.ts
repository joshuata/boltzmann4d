// Seeded, headless versions of classroom stories that give numbers (docs/specs/stories.md).
import { describe, expect, it } from 'vitest';
import { Simulation, type InitialState } from '../sim/simulation';
import { ArenaType } from '../sim/simulation-info';
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
