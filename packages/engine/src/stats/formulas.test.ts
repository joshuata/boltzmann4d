import { describe, expect, it } from 'vitest';
import { syntheticGas } from '../sim/scenes';
import { ArenaType } from '../sim/simulation-info';
import { convert } from '../utils/units';
import {
  allTypeSubsets,
  statisticSubsets,
  avgKineticEnergy,
  avgRelativeVelocity,
  averageVelocity,
  BOLTZMANN_CONST,
  collisionLifetime,
  correctedAverageVelocity,
  correctedRmsVelocity,
  effectiveVolume,
  gamma,
  gammaFrac,
  lnBinomial,
  lnGamma,
  predictCollisionRate,
  predictCollisionRateForTypes,
  reactionEquilibrium,
  realGasQx,
  rmsVelocity,
  temperature,
  totalKineticEnergy,
  velocityWidth,
} from './formulas';
import { statsContext, weightedAverage, weightedWidth, type StatsContext } from './stats-context';

const kB = BOLTZMANN_CONST;
const amu = 1.660538782e-27;

/** ∫ f over [a, b] by Simpson's rule. */
function integrate(f: (x: number) => number, a: number, b: number, n = 20000): number {
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * f(a + i * h);
  return (sum * h) / 3;
}

/** Maxwell–Boltzmann speed density in d dimensions (the distribution plan 0004 will chart). */
function speedDensity(v: number, m: number, T: number, d: number): number {
  const a = m / (kB * T);
  const exp = Math.exp((-a * v * v) / 2);
  if (d === 1) return 2 * Math.sqrt(a / (2 * Math.PI)) * exp;
  if (d === 2) return a * v * exp;
  return 4 * Math.PI * Math.pow(a / (2 * Math.PI), 1.5) * v * v * exp;
}

describe('speed predictions', () => {
  const m = 2 * amu;
  const T = 300;

  it.each([1, 2, 3])('average, RMS and width match the %iD Maxwell–Boltzmann moments', (d) => {
    const vmax = 12 * Math.sqrt((kB * T) / m);
    const mean = integrate((v) => v * speedDensity(v, m, T, d), 0, vmax);
    const meanSquare = integrate((v) => v * v * speedDensity(v, m, T, d), 0, vmax);
    expect(averageVelocity(T, m, d) / mean).toBeCloseTo(1, 9);
    expect(rmsVelocity(T, m, d) / Math.sqrt(meanSquare)).toBeCloseTo(1, 9);
    expect(velocityWidth(T, m, d) / Math.sqrt(meanSquare - mean * mean)).toBeCloseTo(1, 7);
  });

  it('finite-system corrections approach the ideal values for large N', () => {
    for (const d of [1, 2, 3]) {
      const corrected = correctedAverageVelocity(T, m, d, false, 1e6, 1e6 * m);
      expect(corrected / averageVelocity(T, m, d)).toBeCloseTo(1, 5);
    }
  });

  it('corrected RMS speed is defined for periodic arenas (Java threw)', () => {
    const N = 10;
    const value = correctedRmsVelocity(T, m, 2, true, N, N * m);
    // equal masses: (M - m) / M · N / (N - 1) = 1, so no change
    expect(value / rmsVelocity(T, m, 2)).toBeCloseTo(1, 12);
    expect(correctedRmsVelocity(T, m, 2, false, N, N * m)).toBe(rmsVelocity(T, m, 2));
  });

  it('1D mean relative speed uses the 1D formula (Java used the 2D one)', () => {
    const mu = m / 2;
    expect(avgRelativeVelocity(T, m, m, 1)).toBeCloseTo(
      Math.sqrt((2 * kB * T) / (Math.PI * mu)),
      6,
    );
    expect(avgRelativeVelocity(T, m, m, 2)).toBeCloseTo(
      Math.sqrt((Math.PI * kB * T) / (2 * mu)),
      6,
    );
  });

  it('temperature and average kinetic energy are inverses', () => {
    for (const d of [1, 2, 3]) expect(temperature(avgKineticEnergy(T, d), d)).toBeCloseTo(T, 10);
  });
});

describe('gamma functions', () => {
  it('matches known values on integers and half-integers', () => {
    expect(gamma(5)).toBe(24);
    expect(gamma(2.5)).toBeCloseTo(1.5 * 0.5 * Math.sqrt(Math.PI), 14);
    expect(gamma(0.5)).toBe(Math.sqrt(Math.PI));
  });

  it("joins Stirling's series smoothly at x = 25", () => {
    // ln Γ(26) = ln(25!) computed exactly vs the Stirling branch
    let ln25Factorial = 0;
    for (let k = 2; k <= 25; k++) ln25Factorial += Math.log(k);
    expect(lnGamma(26)).toBeCloseTo(ln25Factorial, 10);
    expect(lnGamma(25)).toBeCloseTo(ln25Factorial - Math.log(25), 10);
  });

  it('gammaFrac(n, n + ½) behaves like n^-½ for large n', () => {
    expect(gammaFrac(1000, 1000.5) * Math.sqrt(1000)).toBeCloseTo(1, 3);
    expect(gammaFrac(0, 3)).toBe(0);
  });
});

describe('statsContext and collision rate', () => {
  const init = syntheticGas({ count: 100, seed: 2 });
  const ctx = statsContext(init);

  it('infers each type temperature from its starting velocities', () => {
    for (const [t, species] of init.species.entries()) {
      const n = species.positions.length / 3;
      const expected = temperature(
        totalKineticEnergy(species.type.particleMass, species.velocities) / n,
        2,
      );
      expect(ctx.types[t]!.initialTemperature).toBe(expected);
      expect(ctx.types[t]!.count).toBe(n);
    }
    expect(ctx.totalParticles).toBe(100);
  });

  it('uses a temperature the settings file asked for', () => {
    const withT = statsContext({
      ...init,
      species: init.species.map((s) => ({ ...s, initialTemperature: 500 })),
    });
    expect(withT.types.map((t) => t.initialTemperature)).toEqual([500, 500]);
  });

  it('predicts the 2D hard-disc collision rate n σ ⟨v_rel⟩ / A', () => {
    const one: StatsContext = {
      ...ctx,
      types: [{ mass: 2, radius: 0.5e-9, count: 101, initialTemperature: 300 }],
    };
    const area = effectiveVolume(one, 0.5e-9);
    const vRel = Math.sqrt((Math.PI * kB * 300) / (2 * amu)); // reduced mass = 1 amu
    const expected = (100 * 2 * 1e-9 * vRel) / area;
    expect(predictCollisionRate(one, 0) / expected).toBeCloseTo(1, 10);
    expect(collisionLifetime(predictCollisionRate(one, 0))).toBeCloseTo(1 / expected, 20);
  });

  it('averages rates over a set of types by particle count', () => {
    const both = predictCollisionRateForTypes(ctx, [0, 1]);
    const n0 = ctx.types[0]!.count;
    const n1 = ctx.types[1]!.count;
    const expected =
      (predictCollisionRate(ctx, 0) * n0 + predictCollisionRate(ctx, 1) * n1) / (n0 + n1);
    expect(both).toBeCloseTo(expected, 6);
  });

  it('subtracts the divider from a divided arena and walls from a reflecting one', () => {
    const periodic = effectiveVolume({ ...ctx, arenaType: ArenaType.PERIODIC_BOUNDARIES }, 1e-9);
    expect(periodic).toBe(ctx.arenaXSize * ctx.arenaYSize);
    const divided = effectiveVolume({ ...ctx, arenaType: ArenaType.DIVIDED_ARENA }, 1e-9);
    expect(divided).toBeCloseTo((ctx.arenaXSize / 2 - 1e-9 - 2e-9) * (ctx.arenaYSize - 2e-9), 25);
  });

  it('weights averages and widths of a mixture by particle count', () => {
    expect(weightedAverage(ctx, [0, 1], (t) => (t === 0 ? 10 : 20))).toBe(
      (10 * ctx.types[0]!.count + 20 * ctx.types[1]!.count) / ctx.totalParticles,
    );
    // Two delta functions at 10 and 20 with equal weights: width 5.
    const equal: StatsContext = {
      ...ctx,
      types: [
        { ...ctx.types[0]!, count: 5 },
        { ...ctx.types[1]!, count: 5 },
      ],
    };
    expect(
      weightedWidth(
        equal,
        [0, 1],
        (t) => (t === 0 ? 10 : 20),
        () => 0,
      ),
    ).toBeCloseTo(5, 12);
  });
});

describe('real-gas correction and subsets', () => {
  it('Q(0) = 1 and 1D is rejected', () => {
    expect(realGasQx(0, 2)).toBe(1);
    expect(realGasQx(0, 3)).toBe(1);
    expect(() => realGasQx(0.1, 1)).toThrow();
  });

  it('lists every non-empty subset of types once, in a fixed order', () => {
    expect(allTypeSubsets(2)).toEqual([[0], [1], [0, 1]]);
    expect(allTypeSubsets(3)).toHaveLength(7);
  });

  it('keeps statistics for every subset up to 3 types, else each type and all (KIND-4)', () => {
    expect(statisticSubsets(2)).toEqual(allTypeSubsets(2));
    expect(statisticSubsets(3)).toEqual(allTypeSubsets(3));
    expect(statisticSubsets(4)).toEqual([[0], [1], [2], [3], [0, 1, 2, 3]]);
    expect(statisticSubsets(10)).toHaveLength(11);
  });
});

describe('reactionEquilibrium (PRED-12–14)', () => {
  const dE = convert('kJ/mol', 'J', 8 - 4);
  const k = BOLTZMANN_CONST;

  it("matches the manual's 13.3 (2D) and 14.1 (3D) products out of 50 at 300 K", () => {
    // The kinetic energy at 300 K, all reactant: d/2 · N k T.
    expect(reactionEquilibrium(50, 2, 50 * k * 300, dE, false).average).toBeCloseTo(13.3, 0.7);
    expect(reactionEquilibrium(50, 3, 75 * k * 300, dE, false).average).toBeCloseTo(14.1, 1);
    const { width } = reactionEquilibrium(50, 2, 50 * k * 300, dE, false);
    expect(width).toBeGreaterThan(2);
    expect(width).toBeLessThan(4);
  });

  it('approaches K = exp(−ΔE / RT) at the final temperature for large N (PRED-13)', () => {
    const n = 4000;
    const e0 = n * k * 300; // 2D, 300 K
    const { average } = reactionEquilibrium(n, 2, e0, dE, false);
    // d N k T / 2 = E₀ − <N₂> ΔE / 2, and (N₂/N₁)² = exp(−ΔE / kT).
    const kT = (e0 - (average * dE) / 2) / n;
    const ratio = average / (n - average);
    expect(ratio / Math.exp(-dE / (2 * kT))).toBeCloseTo(1, 2);
  });

  it('keeps the parity of the starting count and skips states without energy', () => {
    // Too little energy for even two products: none.
    expect(reactionEquilibrium(10, 2, 0.5 * dE, dE, false)).toEqual({ average: 0, width: 0 });
    // Started with one product and just enough for it: stays at one.
    expect(reactionEquilibrium(10, 2, 0.6 * dE, dE, true)).toEqual({ average: 1, width: 0 });
    expect(reactionEquilibrium(10, 2, 0.4 * dE, dE, true).average).toBeNaN();
  });

  it('computes ln C(n, k)', () => {
    expect(Math.exp(lnBinomial(50, 13)) / 354860518600).toBeCloseTo(1, 10);
    expect(lnBinomial(7, 0)).toBe(0);
    expect(lnBinomial(7, 7)).toBe(0);
  });
});
