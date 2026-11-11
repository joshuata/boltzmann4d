// Each plot of STAT-1 recorded from a seeded run and compared with its prediction, plus the
// plot controls: axis limits (STAT-8–10), history (STAT-20), forget time (OPT-4).
import { describe, expect, it } from 'vitest';
import { Simulation, type InitialState } from '../sim/simulation';
import { ArenaType } from '../sim/simulation-info';
import { HISTORY_LENGTH } from './history';
import { Statistics, type StatisticsOptions } from './statistics';
import type { DistributionId } from './statistic-ids';
import { statsContext } from './stats-context';
import { gas } from './test-gas';

function simulate(init: InitialState, options: StatisticsOptions = {}) {
  let stats: Statistics | null = null;
  const sim = new Simulation(init, { onEvent: (e) => stats?.notifyOfEvent(e) });
  stats = new Statistics(statsContext(init), sim.particles, options);
  return { sim, stats };
}

/** One kind of 40 amu discs at 300 K, 10% packed, periodic. */
const argon = (count = 100, seed = 1) =>
  gas(
    [{ count, mass: 40, radius: 0.5, temperature: 300 }],
    [Math.sqrt(count) * 2.8, Math.sqrt(count) * 2.8, 0],
    {
      arenaType: ArenaType.PERIODIC_BOUNDARIES,
      seed,
    },
  );

describe('every plot against its prediction', () => {
  // One long run shared by the checks below.
  const { sim, stats } = simulate(argon(), { forgetMultiplier: 10 });
  while (!stats.forgotten) sim.step();
  let last = 0;
  for (let k = 0; k < 150_000; k++) last = sim.step()?.time ?? last;
  sim.advanceToTime(last); // every particle at one time, as at a frame
  stats.sampleCurrent(sim.time);
  const plot = (id: DistributionId, realGas = false) => {
    stats.setPredictionOptions({ realGas });
    return stats.summary(sim.time, { statistic: id }).statistics[0]!;
  };

  it.each([
    ['INSTANTANEOUS_SPEED', 0.01],
    ['RMS_VELOCITY', 0.01],
    ['KINETIC_ENERGY', 0.015],
    ['AVERAGE_SPEED', 0.01],
    ['AVERAGE_RMS_VELOCITY', 0.01],
    ['AVERAGE_ENERGY', 0.02],
  ] as const)('%s: the cumulative average matches', (id, tolerance) => {
    const s = plot(id);
    expect(Math.abs(s.cumulative.average / s.cumulative.prediction.average - 1)).toBeLessThan(
      tolerance,
    );
  });

  it.each(['X_VELOCITY', 'Y_VELOCITY'] as const)(
    '%s: centred on 0, with the predicted width',
    (id) => {
      const s = plot(id);
      expect(Math.abs(s.cumulative.average)).toBeLessThan(0.02 * s.cumulative.prediction.width);
      expect(s.cumulative.width / s.cumulative.prediction.width).toBeCloseTo(1, 1.5);
    },
  );

  it.each(['PATH', 'TIME', 'AVERAGE_PATH', 'COLLISION_RATE'] as const)(
    '%s: matches the Real prediction (10% packing)',
    (id) => {
      const s = plot(id, true);
      const view = s.weighting === 'perParticle' ? s.current : s.cumulative;
      expect(Math.abs(view.average / view.prediction.average - 1)).toBeLessThan(0.05);
      if (id === 'PATH' || id === 'TIME') {
        // Nearly exponential: width ≈ average (PRED-4). Paths come out ~6% wider, since a
        // particle's speed and its time to the next collision are correlated.
        expect(Math.abs(view.width / view.average - 1)).toBeLessThan(0.1);
        // The current view (each particle's last interval) agrees.
        expect(Math.abs(s.current.average / view.prediction.average - 1)).toBeLessThan(0.15);
      }
    },
  );

  it('the per-particle averages narrow like their predictions (STORY-6)', () => {
    const s = plot('AVERAGE_SPEED');
    expect(s.current.width / s.current.prediction.width).toBeGreaterThan(0.5);
    expect(s.current.width / s.current.prediction.width).toBeLessThan(2);
    expect(s.cumulative.average).toBe(s.current.average); // one value per particle either way
  });
});

describe('plot controls', () => {
  it('offers the plots that apply (STAT-1)', () => {
    const { stats } = simulate(argon(16));
    expect(stats.available).toContain('Y_VELOCITY');
    expect(stats.available).not.toContain('Z_VELOCITY');
    expect(stats.available).not.toContain('NUMBER_OF_PARTICLES');
    const reacting = simulate(argon(16), { reactions: true }).stats;
    expect(reacting.available).toContain('NUMBER_OF_PARTICLES');
    const threeD = gas([{ count: 8, mass: 40, radius: 0.5, temperature: 300 }], [10, 10, 10], {
      dimension: 3,
    });
    expect(simulate(threeD).stats.available).toContain('Z_VELOCITY');
  });

  it('STAT-9: a maximum below the minimum becomes 110% of it, a minimum above the maximum 90%', () => {
    const { stats } = simulate(argon(16));
    stats.setLimit('KINETIC_ENERGY', 'min', 2);
    expect(stats.setLimit('KINETIC_ENERGY', 'max', 1)).toEqual({ min: 2, max: 2.2 });
    stats.setLimit('KINETIC_ENERGY', 'max', 10);
    expect(stats.setLimit('KINETIC_ENERGY', 'min', 20).min).toBeCloseTo(9, 12);
    // Ignored when not a number.
    expect(stats.setLimit('KINETIC_ENERGY', 'min', NaN).min).toBeCloseTo(9, 12);
  });

  it('STAT-10: new limits clear that plot’s cumulative data only', () => {
    const { sim, stats } = simulate(argon(36), { forgetMultiplier: 0 });
    for (let k = 0; k < 2000; k++) sim.step();
    const weight = (id: DistributionId) =>
      stats.recorder(id).compose([0], 'cumulative').values.weight;
    expect(weight('KINETIC_ENERGY')).toBeGreaterThan(0);
    expect(weight('INSTANTANEOUS_SPEED')).toBeGreaterThan(0);
    stats.setLimit('KINETIC_ENERGY', 'max', 20);
    expect(weight('KINETIC_ENERGY')).toBe(0);
    expect(weight('INSTANTANEOUS_SPEED')).toBeGreaterThan(0);
    const summary = stats.summary(sim.time, { statistic: 'KINETIC_ENERGY' });
    expect(summary.statistics[0]!.range[1]).toBe(20);
  });

  it('VIEW-4: the colour limits are the speed and energy plots’ limits', () => {
    const { stats } = simulate(argon(16));
    stats.setLimit('INSTANTANEOUS_SPEED', 'min', 100);
    stats.setLimit('KINETIC_ENERGY', 'max', 7);
    const { colorLimits } = stats.summary(0);
    expect(colorLimits.speed[0]).toBe(100);
    expect(colorLimits.energy[1]).toBe(7);
  });

  it('STAT-11: starts from the limits given (a scenario’s)', () => {
    const limits = new Map([['PATH', { min: 1, max: 9 }]]);
    const { stats } = simulate(argon(16), { limits });
    expect(stats.range('PATH')).toEqual({ min: 1, max: 9 });
  });

  it('STAT-20: keeps the last 150 samples of every plot, for any set of kinds', () => {
    const init = gas(
      [
        { count: 8, mass: 40, radius: 0.5, temperature: 300 },
        { count: 8, mass: 4, radius: 0.3, temperature: 300 },
      ],
      [12, 12, 0],
    );
    const { sim, stats } = simulate(init);
    for (let k = 0; k < HISTORY_LENGTH + 10; k++) {
      sim.advanceToTime(sim.time + 1e-12);
      stats.sampleCurrent(sim.time);
    }
    const summary = stats.summary(sim.time, { statistic: 'KINETIC_ENERGY' });
    expect(summary.historyTimes).toHaveLength(HISTORY_LENGTH);
    expect(summary.historyTimes.at(-1)).toBe(sim.time);
    expect(summary.counts.at(-1)).toEqual([8, 8]);
    const both = summary.statistics.find((s) => s.types.length === 2)!;
    expect(both.history.current).toHaveLength(HISTORY_LENGTH);
    expect(both.history.current.at(-1)).toBeCloseTo(both.current.average, 9);
    expect(both.history.cumulative.at(-1)).toBeCloseTo(both.cumulative.average, 9);
    // Number of Particles has no distribution, only the counts (STAT-22).
    const counts = simulate(init, { reactions: true }).stats.summary(0, {
      statistic: 'NUMBER_OF_PARTICLES',
    });
    expect(counts.selected).toBe('NUMBER_OF_PARTICLES');
    expect(counts.statistics).toEqual([]);
  });

  it('OPT-4: the forget multiplier moves the forget time', () => {
    const { stats } = simulate(argon(16), { forgetMultiplier: 4 });
    const four = stats.forgetTime;
    stats.setForgetMultiplier(8);
    expect(stats.forgetTime / four).toBeCloseTo(2, 12);
    expect(stats.summary(0).settings.forgetMultiplier).toBe(8);
  });
});
