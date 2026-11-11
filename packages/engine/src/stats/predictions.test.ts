import { describe, expect, it } from 'vitest';
import { ArenaType } from '../sim/simulation-info';
import {
  averageVelocity,
  GAS_CONSTANT,
  predictCollisionRate,
  realGasQx,
  realGasX,
  rmsVelocity,
} from './formulas';
import { atTemperatures, defaultRange, predict, type PredictionOptions } from './predictions';
import type { DistributionId } from './statistic-ids';
import { statsContext } from './stats-context';
import { gas } from './test-gas';

const AMU = 1.660538782e-27;
const ideal: PredictionOptions = { finite: false, realGas: false, time: 0 };

/** ∫ f over [a, b] by Simpson's rule. */
function integrate(f: (x: number) => number, a: number, b: number, n = 4000): number {
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * f(a + i * h);
  return (sum * h) / 3;
}

const argon2D = statsContext(
  gas([{ count: 50, mass: 40, radius: 0.5, temperature: 300 }], [40, 40, 0]),
);
const argon3D = statsContext(
  gas([{ count: 64, mass: 40, radius: 0.5, temperature: 300 }], [20, 20, 20], { dimension: 3 }),
);
const mixture = statsContext(
  gas(
    [
      { count: 30, mass: 100, radius: 0.8, temperature: 300 },
      { count: 30, mass: 10, radius: 0.4, temperature: 300 },
    ],
    [40, 40, 0],
  ),
);

describe('predictions', () => {
  it.each([
    ['INSTANTANEOUS_SPEED', argon2D],
    ['INSTANTANEOUS_SPEED', argon3D],
    ['RMS_VELOCITY', argon3D],
    ['X_VELOCITY', argon2D],
    ['Z_VELOCITY', argon3D],
    ['KINETIC_ENERGY', argon2D],
    ['KINETIC_ENERGY', argon3D],
    ['PATH', argon2D],
    ['TIME', argon3D],
    ['PATH', mixture],
    ['KINETIC_ENERGY', mixture],
  ] as const)('%s: the density is normalised, with the predicted mean and width', (id, ctx) => {
    const types = ctx.types.map((_, t) => t);
    const p = predict(id as DistributionId, ctx, types, ideal);
    const lo = id.endsWith('_VELOCITY') && id !== 'RMS_VELOCITY' ? -12 * p.width : 0;
    const hi = Math.max(12 * p.width, 25 * p.average);
    expect(integrate(p.density, lo, hi, 40000)).toBeCloseTo(1, 3);
    const mean = integrate((x) => x * p.density(x), lo, hi, 40000);
    const second = integrate((x) => x * x * p.density(x), lo, hi, 40000);
    if (id === 'RMS_VELOCITY') {
      expect(Math.sqrt(second) / p.average).toBeCloseTo(1, 4);
    } else {
      if (p.average === 0) expect(mean / p.width).toBeCloseTo(0, 4);
      else expect(mean / p.average).toBeCloseTo(1, 4);
      expect(Math.sqrt(second - mean * mean) / p.width).toBeCloseTo(1, 4);
    }
  });

  it('PRED-1: kinetic energy is d/2 RT per mole and RMS / average speed is 1.128 (2D), 1.085 (3D)', () => {
    const ke2 = predict('KINETIC_ENERGY', argon2D, [0], ideal).average;
    const ke3 = predict('KINETIC_ENERGY', argon3D, [0], ideal).average;
    expect(ke2 / (GAS_CONSTANT * 300)).toBeCloseTo(1, 6);
    expect(ke3 / (1.5 * GAS_CONSTANT * 300)).toBeCloseTo(1, 6);
    const ratio = (ctx: typeof argon2D) =>
      predict('RMS_VELOCITY', ctx, [0], ideal).average /
      predict('INSTANTANEOUS_SPEED', ctx, [0], ideal).average;
    expect(ratio(argon2D)).toBeCloseTo(Math.sqrt(4 / Math.PI), 9);
    expect(ratio(argon3D)).toBeCloseTo(Math.sqrt((3 * Math.PI) / 8), 9);
  });

  it('PRED-3, 4: free path and collision time are v̄ / rate and 1 / rate, exponential', () => {
    const rate = predictCollisionRate(argon2D, 0);
    const v = averageVelocity(300, 40 * AMU, 2);
    const path = predict('PATH', argon2D, [0], ideal);
    expect(path.average).toBeCloseTo(v / rate / 1e-9, 6);
    expect(path.width).toBeCloseTo(path.average, 9);
    const time = predict('TIME', argon2D, [0], ideal);
    expect(time.average).toBeCloseTo(1 / rate / 1e-12, 6);
    // Close to the textbook A / (4√2 r N) once the walls' excluded area is allowed for.
    const area = (40e-9 - 1e-9) ** 2;
    expect(path.average * 1e-9).toBeCloseTo(area / (4 * Math.SQRT2 * 0.5e-9 * 50), 8);
  });

  it('PRED-6, 7: a mixture weights per-particle averages by count and paths by collisions', () => {
    const [heavy, light] = [0, 1].map((t) => predict('AVERAGE_SPEED', mixture, [t], ideal));
    const both = predict('AVERAGE_SPEED', mixture, [0, 1], ideal);
    expect(both.average).toBeCloseTo((heavy!.average + light!.average) / 2, 9);
    // Equipartition: every kind has the same mean kinetic energy.
    const ke = [0, 1].map((t) => predict('KINETIC_ENERGY', mixture, [t], ideal).average);
    expect(ke[0]).toBeCloseTo(ke[1]!, 12);
    const rates = [0, 1].map((t) => predictCollisionRate(mixture, t));
    const speeds = [100, 10].map((m) => averageVelocity(300, m * AMU, 2));
    const path = predict('PATH', mixture, [0, 1], ideal);
    expect(path.average * 1e-9).toBeCloseTo(
      (speeds[0]! + speeds[1]!) / (rates[0]! + rates[1]!),
      15,
    );
  });

  it('PRED-5: the collision rate and per-particle averages narrow as 1 / sqrt(t)', () => {
    const tau = 1 / predictCollisionRate(argon2D, 0);
    const at = (id: DistributionId, time: number) =>
      predict(id, argon2D, [0], { ...ideal, time }).width;
    expect(at('COLLISION_RATE', 100 * tau) / at('COLLISION_RATE', 400 * tau)).toBeCloseTo(2, 9);
    expect(at('AVERAGE_SPEED', 100 * tau) / at('AVERAGE_SPEED', 400 * tau)).toBeCloseTo(2, 9);
    expect(at('COLLISION_RATE', 100 * tau)).toBeCloseTo((1 / tau) * 1e-12 * 0.1, 9);
    // Before the first collision the width is capped at one collision's worth.
    expect(at('AVERAGE_ENERGY', 0)).toBeCloseTo(at('AVERAGE_ENERGY', tau), 12);
  });

  it('PRED-9: Real divides the path and time by Q(x) and multiplies the rate', () => {
    const dense = statsContext(
      gas([{ count: 100, mass: 40, radius: 0.5, temperature: 300 }], [15, 15, 0]),
    );
    const q = realGasQx(realGasX(dense, 0), 2);
    expect(q).toBeGreaterThan(1.1);
    const real = { ...ideal, realGas: true };
    for (const id of ['PATH', 'TIME'] as const) {
      expect(
        predict(id, dense, [0], ideal).average / predict(id, dense, [0], real).average,
      ).toBeCloseTo(q, 9);
    }
    expect(
      predict('COLLISION_RATE', dense, [0], real).average /
        predict('COLLISION_RATE', dense, [0], ideal).average,
    ).toBeCloseTo(q, 9);
  });

  describe('finite-system corrections (PRED-11)', () => {
    const small = (arenaType: ArenaType, dimension = 2) =>
      statsContext(
        gas([{ count: 8, mass: 40, radius: 0.5, temperature: 300 }], [10, 10, 10], {
          dimension,
          arenaType,
        }),
      );
    const finite = { ...ideal, finite: true };

    it.each([
      ['INSTANTANEOUS_SPEED', ArenaType.REFLECTING_BOUNDARIES, 2],
      ['INSTANTANEOUS_SPEED', ArenaType.PERIODIC_BOUNDARIES, 2],
      ['INSTANTANEOUS_SPEED', ArenaType.PERIODIC_BOUNDARIES, 3],
      ['KINETIC_ENERGY', ArenaType.REFLECTING_BOUNDARIES, 2],
      ['KINETIC_ENERGY', ArenaType.REFLECTING_BOUNDARIES, 3],
      ['X_VELOCITY', ArenaType.REFLECTING_BOUNDARIES, 3],
    ] as const)(
      '%s (%s, %iD): the corrected density matches the corrected mean',
      (id, arena, d) => {
        const ctx = small(arena, d);
        const p = predict(id, ctx, [0], finite);
        const lo = id === 'X_VELOCITY' ? -10 * p.width : 0;
        const hi = id === 'X_VELOCITY' ? 10 * p.width : 10 * p.average;
        expect(integrate(p.density, lo, hi, 20000)).toBeCloseTo(1, 3);
        if (id !== 'X_VELOCITY') {
          const mean = integrate((x) => x * p.density(x), lo, hi, 20000);
          expect(mean / p.average).toBeCloseTo(1, 3);
        }
      },
    );

    it('RMS velocity works on periodic arenas (Java bug 2) and differs from the ideal gas', () => {
      const ctx = small(ArenaType.PERIODIC_BOUNDARIES);
      const corrected = predict('RMS_VELOCITY', ctx, [0], finite).average;
      expect(Number.isFinite(corrected)).toBe(true);
      // correctedKE's (M − m)/M and N/(N − 1) cancel for a single kind, so ⟨v²⟩ is ideal.
      const idealRms = rmsVelocity(300, 40 * AMU, 2);
      expect(corrected / idealRms).toBeCloseTo(1, 9);
      // ... while the mean speed is noticeably higher than the ideal gas's.
      expect(
        predict('INSTANTANEOUS_SPEED', ctx, [0], finite).average /
          predict('INSTANTANEOUS_SPEED', ctx, [0], ideal).average,
      ).toBeGreaterThan(1.01);
    });
  });

  it('default ranges follow Java: 0–2.5 ×, ± 2.5 widths, 0.5–1.5 ×', () => {
    const p = predict('INSTANTANEOUS_SPEED', argon2D, [0], ideal);
    expect(defaultRange('INSTANTANEOUS_SPEED', p)).toEqual({ min: 0, max: 2.5 * p.average });
    const x = predict('X_VELOCITY', argon2D, [0], ideal);
    expect(defaultRange('X_VELOCITY', x)).toEqual({ min: -2.5 * x.width, max: 2.5 * x.width });
    const r = predict('COLLISION_RATE', argon2D, [0], ideal);
    expect(defaultRange('COLLISION_RATE', r)).toEqual({
      min: 0.5 * r.average,
      max: 1.5 * r.average,
    });
  });

  it('predicts at the temperatures given (#23)', () => {
    const hot = atTemperatures(argon2D, [1200]);
    expect(
      predict('INSTANTANEOUS_SPEED', hot, [0], ideal).average /
        predict('INSTANTANEOUS_SPEED', argon2D, [0], ideal).average,
    ).toBeCloseTo(2, 9);
  });
});
