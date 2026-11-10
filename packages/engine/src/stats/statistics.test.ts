import { describe, expect, it } from 'vitest';
import { syntheticGas } from '../sim/scenes';
import { Simulation, type InitialState } from '../sim/simulation';
import { ArenaType } from '../sim/simulation-info';
import { HistogramBins } from './histogram-bins';
import { velocityDistribution } from './instantaneous-speed';
import { Statistics } from './statistics';
import { statsContext } from './stats-context';
import { WeightedValueTracker } from './weighted-value-tracker';

function simulate(init: InitialState, options = {}) {
  let stats: Statistics | null = null;
  const sim = new Simulation(init, { onEvent: (e) => stats?.notifyOfEvent(e) });
  stats = new Statistics(statsContext(init), sim.particles, options);
  return { sim, stats };
}

/** ∫ f over [a, b] by Simpson's rule. */
function integrate(f: (x: number) => number, a: number, b: number, n = 2000): number {
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * f(a + i * h);
  return (sum * h) / 3;
}

describe('HistogramBins', () => {
  it('bins on Java edges and drops values outside', () => {
    const bins = new HistogramBins({ min: 0, max: 10 }, 5, 2);
    bins.add(0, 1, 0); // first bin
    bins.add(1.999, 1, 1); // first bin
    bins.add(2, 1, 0); // second bin (edges are exclusive above)
    bins.add(9.99, 2, 1); // last bin
    bins.add(10, 1, 0); // at the last edge: dropped
    bins.add(-1, 1, 0); // below min: dropped
    bins.add(NaN, 1, 0); // dropped
    expect(Array.from(bins.total)).toEqual([2, 1, 0, 0, 2]);
    expect(Array.from(bins.byType[0]!)).toEqual([1, 1, 0, 0, 0]);
    expect(Array.from(bins.byType[1]!)).toEqual([1, 0, 0, 0, 2]);
  });
});

describe('WeightedValueTracker', () => {
  it('computes a weighted mean and standard deviation', () => {
    const t = new WeightedValueTracker();
    expect([t.average(), t.width()]).toEqual([0, 0]);
    t.add(1, 1);
    t.add(3, 3);
    expect(t.average()).toBe(2.5);
    expect(t.width()).toBeCloseTo(Math.sqrt(0.75), 12);
  });
});

describe('Statistics', () => {
  it('handles many kinds, each alone and all together', () => {
    const gas = syntheticGas({ count: 200, seed: 2 });
    const [a, b] = gas.species;
    // Ten kinds: five copies of each of the two species.
    const species = Array.from({ length: 10 }, (_, k) => {
      const s = k % 2 === 0 ? a! : b!;
      const n = s.positions.length / 3 / 5;
      const part = Math.floor(k / 2);
      return {
        ...s,
        positions: s.positions.slice(3 * n * part, 3 * n * (part + 1)),
        velocities: s.velocities.slice(3 * n * part, 3 * n * (part + 1)),
      };
    });
    const { sim, stats } = simulate({ ...gas, species });
    for (let k = 0; k < 2000; k++) sim.step();
    stats.sampleCurrent();
    const summary = stats.summary(sim.time);
    expect(summary.statistics.map((s) => s.types.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 10]); // prettier-ignore
    const all = summary.statistics.at(-1)!.current;
    expect(all.binsByType).toHaveLength(10);
    const counted = all.binsByType.flat().reduce((x, y) => x + y, 0);
    expect(counted).toBeGreaterThan(0.95 * sim.particles.count); // a few may be off the axis

    // Any subset on request (KIND-4), composed from the all-kinds data.
    const composed = stats.summary(sim.time, [[2, 0], [3]]).statistics;
    expect(composed).toHaveLength(12); // [3] is tracked already
    const pair = composed.at(-1)!;
    expect(pair.types).toEqual([0, 2]);
    const allKinds = composed[10]!;
    expect(pair.cumulative.binsByType).toEqual([
      allKinds.cumulative.binsByType[0],
      allKinds.cumulative.binsByType[2],
    ]);
    // Its average is the two kinds' averages weighted by their data.
    const [k0, k2] = [stats.speed[0]!.cumulativeValues, stats.speed[2]!.cumulativeValues];
    const expected =
      (k0.average() * k0.weight + k2.average() * k2.weight) / (k0.weight + k2.weight);
    expect(pair.cumulative.average).toBeCloseTo(expected, 6);
    expect(pair.cumulative.prediction.temperatures).toHaveLength(2);
  });

  it('records every non-empty set of types, bins aligned across them', () => {
    const { stats } = simulate(syntheticGas({ count: 50 }));
    expect(stats.speed.map((s) => s.types)).toEqual([[0], [1], [0, 1]]);
    const ranges = stats.speed.map((s) => [s.cumulative.range.min, s.cumulative.range.max]);
    expect(new Set(ranges.map((r) => r.join()))).toHaveProperty('size', 1);
    // The light species is fastest, so its own range sets the shared maximum.
    expect(ranges[0]![1]).toBe(stats.speed[0]!.range.max);
  });

  it('samples every particle of the recorded types for the current histogram', () => {
    const { sim, stats } = simulate(syntheticGas({ count: 60 }));
    sim.advanceToTime(1e-12);
    stats.sampleCurrent();
    const counts = stats.speed.map((s) => s.current.total.reduce((a, b) => a + b, 0));
    expect(counts).toEqual([30, 30, 60]);
  });

  it('forgets cumulative data once, after the forget time', () => {
    const { sim, stats } = simulate(syntheticGas({ count: 60 }), { forgetMultiplier: 1 });
    let weightBefore = 0;
    while (!stats.forgotten) {
      weightBefore = stats.speed[2]!.cumulativeValues.weight;
      sim.step();
    }
    expect(weightBefore).toBeGreaterThan(0);
    // Only the interval(s) of the event that triggered the forget remain.
    expect(stats.speed[2]!.cumulativeValues.weight).toBeLessThan(weightBefore);
    const after = stats.speed[2]!.cumulativeValues.weight;
    for (let k = 0; k < 200; k++) sim.step();
    expect(stats.forgotten).toBe(true);
    expect(stats.speed[2]!.cumulativeValues.weight).toBeGreaterThan(after);
  });

  it('prediction curve is a density over the axis range', () => {
    const { stats } = simulate(syntheticGas({ count: 50 }));
    for (const s of stats.speed) {
      const curve = s.predictionCurve(400);
      const dx = (s.range.max - s.range.min) / curve.length;
      const area = curve.reduce((a, b) => a + b, 0) * dx;
      expect(area).toBeLessThan(1.0);
      if (s.types.length === 1) {
        // 2.5 × the mean speed holds over 99% of one 2D Maxwell–Boltzmann distribution.
        expect(area).toBeGreaterThan(0.98);
      } else {
        // A mixture's axis stops at 2.5 × the mixed mean, cutting off the fast light
        // species' tail (as in Java).
        expect(area).toBeGreaterThan(0.9);
      }
    }
  });

  it('time-weighted speeds settle into the Maxwell–Boltzmann distribution', () => {
    // One species, so the mixture question doesn't arise; start far from equilibrium
    // (every particle at the same speed) and let collisions do the work.
    const init = syntheticGas({ count: 400, arenaType: ArenaType.PERIODIC_BOUNDARIES, seed: 4 });
    const single: InitialState = { ...init, species: [init.species[0]!] };
    const { sim, stats } = simulate(single, { forgetMultiplier: 20 });
    while (!stats.forgotten) sim.step();
    for (let k = 0; k < 200_000; k++) sim.step();

    const s = stats.speed[0]!;
    expect(s.cumulativeValues.average() / s.predictedAverage()).toBeCloseTo(1, 1);
    expect(s.cumulativeValues.width() / s.predictedWidth()).toBeCloseTo(1, 1);

    // Each bin's share of the time against the predicted probability of that speed range.
    const ctx = statsContext(single);
    const type = ctx.types[0]!;
    const massKg = type.mass * 1.660538782e-27;
    const bins = s.cumulative;
    const totalWeight = bins.total.reduce((a, b) => a + b, 0);
    let lower = bins.range.min;
    let worst = 0;
    bins.limits.forEach((upper, i) => {
      const expected = integrate(
        (v) => velocityDistribution(v, massKg, type.initialTemperature, 2),
        lower,
        upper,
      );
      worst = Math.max(worst, Math.abs(bins.total[i]! / totalWeight - expected));
      lower = upper;
    });
    expect(worst).toBeLessThan(0.01);
  });
});
