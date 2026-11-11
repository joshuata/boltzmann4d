// Checks the statistics against kinetic theory rather than against the Java app: long,
// seeded runs whose measured distributions must match what the theory predicts.
import { describe, expect, it } from 'vitest';
import { syntheticGas } from '../sim/scenes';
import { Simulation, type InitialState } from '../sim/simulation';
import { ArenaType } from '../sim/simulation-info';
import {
  averageVelocity,
  correctedAverageVelocity,
  correctedVelocityWidth,
  temperature,
  velocityWidth,
} from './formulas';
import { velocityDistribution } from './predictions';
import type { WeightedValueTracker } from './weighted-value-tracker';
import { Statistics } from './statistics';
import { statsContext, type StatsContext } from './stats-context';

const AMU = 1.660538782e-27;

function run(init: InitialState, events: number) {
  let stats: Statistics | null = null;
  const sim = new Simulation(init, { onEvent: (e) => stats?.notifyOfEvent(e) });
  stats = new Statistics(statsContext(init), sim.particles, { forgetMultiplier: 20 });
  while (!stats.forgotten) sim.step();
  for (let k = 0; k < events; k++) sim.step();
  return { sim, stats, ctx: stats.ctx };
}

/** ∫ f over [a, b] by Simpson's rule. */
function integrate(f: (x: number) => number, a: number, b: number, n = 400): number {
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * f(a + i * h);
  return (sum * h) / 3;
}

/** Largest gap between a histogram's share of the weight in a bin and that bin's probability. */
function worstBinError(
  bins: { limits: Float64Array; range: { min: number }; total: Float64Array },
  density: (v: number) => number,
): number {
  const total = bins.total.reduce((a, b) => a + b, 0);
  let lower = bins.range.min;
  let worst = 0;
  bins.limits.forEach((upper, i) => {
    worst = Math.max(worst, Math.abs(bins.total[i]! / total - integrate(density, lower, upper)));
    lower = upper;
  });
  return worst;
}

/** The temperature that a set of speeds with this mean and width corresponds to. */
function measuredTemperature(values: WeightedValueTracker, massAmu: number): number {
  const mean = values.average();
  const width = values.width();
  return temperature(0.5 * massAmu * AMU * (width * width + mean * mean), 2);
}

/** One species of syntheticGas, with zero total momentum on a periodic arena. */
function singleSpecies(count: number, arenaType: ArenaType, seed: number): InitialState {
  const init = syntheticGas({ count: count * 2, arenaType, seed });
  const species = init.species[0]!;
  const v = Float64Array.from(species.velocities);
  if (arenaType === ArenaType.PERIODIC_BOUNDARIES) {
    // Periodic arenas conserve momentum, and the finite-system formulas assume it's zero.
    const n = v.length / 3;
    let px = 0;
    let py = 0;
    let before = 0;
    for (let i = 0; i < n; i++) {
      px += v[3 * i]!;
      py += v[3 * i + 1]!;
      before += v[3 * i]! ** 2 + v[3 * i + 1]! ** 2;
    }
    let after = 0;
    for (let i = 0; i < n; i++) {
      v[3 * i] = v[3 * i]! - px / n;
      v[3 * i + 1] = v[3 * i + 1]! - py / n;
      after += v[3 * i]! ** 2 + v[3 * i + 1]! ** 2;
    }
    const scale = Math.sqrt(before / after); // keep the kinetic energy
    for (let i = 0; i < v.length; i++) v[i] = v[i]! * scale;
  }
  return { ...init, species: [{ ...species, velocities: v }] };
}

/** One set of kinds' cumulative speeds: bins (summed over the kinds) and running sums. */
function speeds(stats: Statistics, types: number[], view: 'current' | 'cumulative' = 'cumulative') {
  const recorder = stats.recorder('INSTANTANEOUS_SPEED');
  const bins = view === 'current' ? recorder.current : recorder.cumulative;
  const { values } = recorder.compose(types, view);
  const total = new Float64Array(bins.total.length);
  for (const t of types) bins.byType[t]!.forEach((w, i) => (total[i] = total[i]! + w));
  return { values, bins: { limits: bins.limits, range: bins.range, total } };
}

/** Count-weighted mean and width of the speeds of `types` at the given temperatures. */
function predicted(ctx: StatsContext, types: number[], temperatures: ArrayLike<number>) {
  const n = types.reduce((sum, t) => sum + ctx.types[t]!.count, 0);
  let mean = 0;
  let second = 0;
  for (const t of types) {
    const m = ctx.types[t]!.mass * AMU;
    const w = ctx.types[t]!.count / n;
    const avg = averageVelocity(temperatures[t]!, m, 2);
    const width = velocityWidth(temperatures[t]!, m, 2);
    mean += w * avg;
    second += w * (width * width + avg * avg);
  }
  return { average: mean, width: Math.sqrt(second - mean * mean) };
}

const SETS = [[0], [1], [0, 1]];

describe('speed statistics against kinetic theory', () => {
  it('a mixture: each species is Maxwell–Boltzmann at the shared temperature', () => {
    // 2 and 32 amu at the same temperature: the light species is 4× faster.
    const { stats, ctx } = run(
      syntheticGas({ count: 400, arenaType: ArenaType.PERIODIC_BOUNDARIES, seed: 5 }),
      200_000,
    );
    const initial = ctx.types.map((t) => t.initialTemperature);
    for (const types of SETS) {
      const s = speeds(stats, types);
      const p = predicted(ctx, types, initial);
      expect(s.values.average() / p.average).toBeCloseTo(1, 1.5);
      expect(s.values.width() / p.width).toBeCloseTo(1, 1.5);
      // The set's density is the count-weighted mix of its species' densities.
      const n = types.reduce((sum, t) => sum + ctx.types[t]!.count, 0);
      const density = (v: number) =>
        types.reduce((sum, t) => {
          const type = ctx.types[t]!;
          return (
            sum +
            (type.count / n) * velocityDistribution(v, type.mass * AMU, type.initialTemperature, 2)
          );
        }, 0);
      expect(worstBinError(s.bins, density)).toBeLessThan(0.015);
    }
    // Equipartition: both species hold the same mean kinetic energy.
    const [light, heavy] = [speeds(stats, [0]).values, speeds(stats, [1]).values];
    const ratio =
      measuredTemperature(light, ctx.types[0]!.mass) /
      measuredTemperature(heavy, ctx.types[1]!.mass);
    expect(ratio).toBeCloseTo(1, 1.5);
  });

  it('species that start at different temperatures share one temperature at equilibrium', () => {
    const init = syntheticGas({ count: 400, arenaType: ArenaType.PERIODIC_BOUNDARIES, seed: 5 });
    const heavy = init.species[1]!;
    // Twice the speed: the heavy species starts 4× hotter.
    const hot: InitialState = {
      ...init,
      species: [init.species[0]!, { ...heavy, velocities: heavy.velocities.map((v) => 2 * v) }],
    };
    const { sim, stats, ctx } = run(hot, 200_000);
    const tLight = measuredTemperature(speeds(stats, [0]).values, ctx.types[0]!.mass);
    const tHeavy = measuredTemperature(speeds(stats, [1]).values, ctx.types[1]!.mass);
    // Within ±3%: one finite run fluctuates by ~2% (it differs a little between machines),
    // while species that kept their starting temperatures would be 4× apart.
    expect(tLight / tHeavy).toBeCloseTo(1, 1.2);
    // ... the count-weighted mean of the starting temperatures, since energy is conserved.
    const tStart = (ctx.types[0]!.initialTemperature + ctx.types[1]!.initialTemperature) / 2;
    expect((tLight + tHeavy) / 2 / tStart).toBeCloseTo(1, 1.2);

    // Predictions use the measured temperatures (#23), so they describe this gas: each
    // species and the mix match, bin by bin. (At the starting temperatures they were
    // 21–59% off.)
    const temperatures = stats.temperatures('cumulative');
    expect(temperatures[0]! / tLight).toBeCloseTo(1, 10);
    for (const types of SETS) {
      const s = speeds(stats, types);
      const p = predicted(ctx, types, temperatures);
      expect(s.values.average() / p.average).toBeCloseTo(1, 1.5);
      expect(s.values.width() / p.width).toBeCloseTo(1, 1.5);
      const n = types.reduce((sum, t) => sum + ctx.types[t]!.count, 0);
      const density = (v: number) =>
        types.reduce(
          (sum, t) =>
            sum +
            (ctx.types[t]!.count / n) *
              velocityDistribution(v, ctx.types[t]!.mass * AMU, temperatures[t]!, 2),
          0,
        );
      expect(worstBinError(s.bins, density)).toBeLessThan(0.015);
    }
    const summary = stats.summary(sim.time).statistics[2]!.cumulative.prediction;
    expect(summary.average).toBeCloseTo(predicted(ctx, [0, 1], temperatures).average, 9);
    expect(summary.temperatures).toEqual([temperatures[0], temperatures[1]]);
  });

  it('predicts from the starting temperature until there is data', () => {
    const init = syntheticGas({ count: 40, seed: 7 });
    let stats: Statistics | null = null;
    const sim = new Simulation(init, { onEvent: (e) => stats?.notifyOfEvent(e) });
    stats = new Statistics(statsContext(init), sim.particles);
    const start = stats.ctx.types.map((t) => t.initialTemperature);
    expect(Array.from(stats.temperatures('cumulative'))).toEqual(start);
    expect(Array.from(stats.temperatures('current'))).toEqual(start);
    // Every particle starts at its type's speed, so the current sample is exactly that.
    stats.sampleCurrent(sim.time);
    const current = stats.temperatures('current');
    start.forEach((t, i) => expect(current[i]! / t).toBeCloseTo(1, 10));
  });

  it('the current histogram, sampled every frame, matches the time-weighted one', () => {
    // Sampling every particle at fixed times is an independent estimate of the same
    // distribution, without the collision-interval weighting.
    const init = syntheticGas({ count: 400, arenaType: ArenaType.PERIODIC_BOUNDARIES, seed: 6 });
    const single: InitialState = { ...init, species: [init.species[0]!] };
    const { sim, stats, ctx } = run(single, 0);
    const recorder = stats.recorder('INSTANTANEOUS_SPEED');
    const bins = new Float64Array(recorder.current.total.length);
    let sum = 0;
    let sumSquares = 0;
    let samples = 0;
    for (let frame = 0; frame < 3000; frame++) {
      sim.advanceToTime(sim.time + sim.frameDuration);
      stats.sampleCurrent(sim.time);
      recorder.current.total.forEach((w, i) => (bins[i] = bins[i]! + w));
      const values = recorder.currentByType[0]!;
      const n = values.weight;
      const mean = values.average();
      const width = values.width();
      sum += mean * n;
      sumSquares += (width * width + mean * mean) * n;
      samples += n;
    }
    const type = ctx.types[0]!;
    const mean = sum / samples;
    const width = Math.sqrt(sumSquares / samples - mean * mean);
    const p = predicted(ctx, [0], [type.initialTemperature]);
    expect(mean / p.average).toBeCloseTo(1, 1.5);
    expect(width / p.width).toBeCloseTo(1, 1.5);
    const density = (v: number) =>
      velocityDistribution(v, type.mass * AMU, type.initialTemperature, 2);
    expect(worstBinError({ ...recorder.current, total: bins }, density)).toBeLessThan(0.01);
  });

  describe.each([
    ['periodic', ArenaType.PERIODIC_BOUNDARIES],
    ['reflecting', ArenaType.REFLECTING_BOUNDARIES],
  ] as const)('a few particles on a %s arena', (_, arenaType) => {
    it('match the finite-system corrections, not the ideal gas', () => {
      // With fixed total energy, N particles' speeds aren't quite Maxwell–Boltzmann: the
      // mean speed of 4 discs is 3–4% above the ideal-gas value.
      const n = 4;
      const { stats, ctx } = run(singleSpecies(n, arenaType, 3), 200_000);
      const type = ctx.types[0]!;
      const m = type.mass * AMU;
      const T = type.initialTemperature;
      const periodic = arenaType === ArenaType.PERIODIC_BOUNDARIES;
      const { values } = speeds(stats, [0]);
      const mean = values.average();
      const width = values.width();
      expect(mean / correctedAverageVelocity(T, m, 2, periodic, n, n * m)).toBeCloseTo(1, 2);
      expect(width / correctedVelocityWidth(T, m, 2, periodic, n, n * m)).toBeCloseTo(1, 2);
      expect(mean / averageVelocity(T, m, 2)).toBeGreaterThan(1.02);
      expect(width / velocityWidth(T, m, 2)).toBeLessThan(0.98);
    });
  });
});
