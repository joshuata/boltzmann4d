import { describe, expect, it } from 'vitest';
import { loadPresetText, loadSetFile } from '../io';
import { Particles } from './particles';
import { javaReaction, ReactionTable, type ReactionRule } from './reactions';
import { seededRandom, syntheticGas } from './scenes';
import { Simulation, type InitialSpecies, type InitialState } from './simulation';

const kB = 1.3806504e-23;
const KJ_PER_MOL = 1e3 / 6.02214179e23; // J per particle
const empty = new Float64Array(0);

/** A species with no particles, of the same type as `s`, for particles to turn into. */
const emptyCopy = (s: InitialSpecies): InitialSpecies => ({
  ...s,
  positions: empty,
  velocities: empty,
});

/** One species plus an empty "reacted" copy of it, as the Reactions tab sets up. */
function withReacted(
  init: InitialState,
  forward: number,
  reverse: number,
  suppressReverse = false,
): InitialState {
  const red = init.species[0]!;
  return {
    ...init,
    species: [red, emptyCopy(red)],
    reactions: [javaReaction(forward, reverse, suppressReverse)],
  };
}

/** How many particles show each kind. */
function counts(sim: Simulation, kinds: number): number[] {
  const n = new Array<number>(kinds).fill(0);
  for (const c of sim.particles.color) n[c]!++;
  return n;
}

const blue = (sim: Simulation) => counts(sim, 2)[1]!;

/**
 * Kinetic plus chemical energy in J, given each kind's chemical energy in kJ/mol (a rule
 * A + B → C + D with ΔE = Ef − Er needs u(C) + u(D) − u(A) − u(B) = ΔE).
 */
function totalEnergy(sim: Simulation, chemical: number[]): number {
  const n = counts(sim, chemical.length);
  return sim.kineticEnergy() + n.reduce((e, count, k) => e + count * chemical[k]! * KJ_PER_MOL, 0);
}

function run(sim: Simulation, events: number): void {
  let last = 0;
  for (let k = 0; k < events; k++) last = sim.step()!.time;
  sim.advanceToTime(last);
}

async function equil(): Promise<InitialState> {
  const { scenario } = loadSetFile(await loadPresetText('2Dequil'), { random: seededRandom(6) });
  return scenario;
}

describe('red↔blue reactions', () => {
  it('come from 2Dequil as the Java rule', async () => {
    const init = await equil();
    expect(init.reactions).toEqual([javaReaction(8, 4, false)]);
    expect(init.species).toHaveLength(2);
    expect(new Simulation(init).reactions).not.toBeNull();
  });

  it.each([
    [3.0, 2.0],
    [3.0, 4.0], // exothermic
  ])('conserve kinetic + chemical energy (Ef %f, Er %f)', async (forward, reverse) => {
    const sim = new Simulation(withReacted(await equil(), forward, reverse));
    const chemical = [0, (forward - reverse) / 2];
    const total = totalEnergy(sim, chemical);
    run(sim, 30_000);
    expect(blue(sim)).toBeGreaterThan(0);
    expect(totalEnergy(sim, chemical) / total).toBeCloseTo(1, 9);
    // Reactions recolour particles; their species (mass, radius) stays.
    expect(Array.from(sim.particles.type).every((t) => t === 0)).toBe(true);
  });

  it('reach the equilibrium [blue]/[red] = exp(−ΔE / 2kT)', () => {
    // Java's thresholds are microscopically reversible (a pair that reacts forward has
    // enough energy to react back), so the populations follow the Boltzmann factor for
    // the energy each blue particle stores.
    const gas = syntheticGas({ count: 400, seed: 8, packing: 0.1 });
    const forward = 3.0;
    const reverse = 2.0;
    const sim = new Simulation(withReacted(gas, forward, reverse));
    const n = sim.particles.count;
    run(sim, 200_000);
    let blueSum = 0;
    let kT = 0;
    const samples = 400;
    for (let s = 0; s < samples; s++) {
      run(sim, 500);
      blueSum += blue(sim);
      kT += sim.kineticEnergy() / n; // 2D: mean kinetic energy per particle = kT
    }
    kT /= samples;
    const blueFraction = blueSum / samples / n;
    const expected = Math.exp((-((forward - reverse) / 2) * KJ_PER_MOL) / kT);
    expect(blueFraction / (1 - blueFraction) / expected).toBeCloseTo(1, 1.3); // ±2.5%
    expect(kT / kB).toBeGreaterThan(100);
  });

  it('turn everything blue when the reverse reaction is suppressed', async () => {
    const sim = new Simulation(withReacted(await equil(), 3.0, 2.0, true));
    run(sim, 60_000);
    expect(blue(sim)).toBe(sim.particles.count);
  });

  it('need a species to turn into', async () => {
    const init = await equil();
    expect(() => new Simulation({ ...init, species: [init.species[0]!] })).toThrow(
      /uses kind 1, but there are 1 kinds/,
    );
  });
});

describe('reaction rules between N kinds', () => {
  it('A + B → C + C conserves energy and keeps #A − #B', () => {
    const gas = syntheticGas({ count: 300, seed: 3, packing: 0.15 });
    const [a, b] = gas.species as [InitialSpecies, InitialSpecies];
    const rule: ReactionRule = {
      reactants: [0, 1],
      products: [2, 2],
      forward: 2.0,
      reverse: 1.0,
      suppressReverse: false,
    };
    const sim = new Simulation({ ...gas, species: [a, b, emptyCopy(a)], reactions: [rule] });
    const chemical = [0, 0, (rule.forward - rule.reverse) / 2];
    const total = totalEnergy(sim, chemical);
    const [a0, b0] = counts(sim, 3);
    run(sim, 40_000);
    const [na, nb, nc] = counts(sim, 3);
    expect(nc).toBeGreaterThan(0);
    // Each reaction takes one A and one B (or gives them back).
    expect(na! - nb!).toBe(a0! - b0!);
    expect(totalEnergy(sim, chemical) / total).toBeCloseTo(1, 9);
    expect(Array.from(sim.particles.type).every((t) => t < 2)).toBe(true);
  });

  it('chains rules: A + A → B + B, then B + B → C + C', async () => {
    const init = await equil();
    const a = init.species[0]!;
    const rules: ReactionRule[] = [
      { reactants: [0, 0], products: [1, 1], forward: 1, reverse: 1, suppressReverse: true },
      { reactants: [1, 1], products: [2, 2], forward: 1, reverse: 1, suppressReverse: true },
    ];
    const sim = new Simulation({
      ...init,
      species: [a, emptyCopy(a), emptyCopy(a)],
      reactions: rules,
    });
    run(sim, 60_000);
    expect(counts(sim, 3)).toEqual([0, 0, sim.particles.count]);
  });

  it('run in 3D and conserve energy', async () => {
    const { scenario } = loadSetFile(await loadPresetText('3Dmixture'), {
      random: seededRandom(4),
    });
    expect(scenario.dimension).toBe(3);
    expect(scenario.species).toHaveLength(2);
    // Red + Blue → Blue + Blue: each forward reaction stores ΔE in one more blue particle.
    const rule: ReactionRule = {
      reactants: [0, 1],
      products: [1, 1],
      forward: 1.0,
      reverse: 0.5,
      suppressReverse: false,
    };
    const sim = new Simulation({ ...scenario, reactions: [rule] });
    const chemical = [0, rule.forward - rule.reverse];
    const total = totalEnergy(sim, chemical);
    const before = counts(sim, 2);
    run(sim, 30_000);
    expect(counts(sim, 2)).not.toEqual(before);
    expect(totalEnergy(sim, chemical) / total).toBeCloseTo(1, 9);
  });

  it('ignore pairs without a rule', () => {
    const gas = syntheticGas({ count: 200, seed: 5 });
    const [a, b] = gas.species as [InitialSpecies, InitialSpecies];
    // Only C + C reacts, and nothing is C.
    const rule: ReactionRule = {
      reactants: [2, 2],
      products: [0, 1],
      forward: 0,
      reverse: 0,
      suppressReverse: true,
    };
    const plain = new Simulation({ ...gas, species: [a, b, emptyCopy(a)] });
    const ruled = new Simulation({ ...gas, species: [a, b, emptyCopy(a)], reactions: [rule] });
    run(plain, 5_000);
    run(ruled, 5_000);
    expect(Array.from(ruled.particles.x)).toEqual(Array.from(plain.particles.x));
    expect(Array.from(ruled.particles.color)).toEqual(Array.from(plain.particles.color));
  });
});

describe('ReactionTable', () => {
  const rule = (
    reactants: [number, number],
    products: [number, number],
    suppressReverse = false,
  ): ReactionRule => ({ reactants, products, forward: 2, reverse: 1, suppressReverse });

  /** Two particles showing kinds ci and cj; returns what they show after colliding. */
  function collide(table: ReactionTable, ci: number, cj: number, eRel: number): number[] {
    const p = new Particles(2);
    p.color[0] = ci;
    p.color[1] = cj;
    table.react(p, 0, 1, eRel);
    return [p.color[0]!, p.color[1]!];
  }

  it('matches reactants in either order', () => {
    const table = new ReactionTable([rule([0, 1], [2, 3])], 4);
    expect(collide(table, 0, 1, 5)).toEqual([2, 3]);
    expect(collide(table, 1, 0, 5)).toEqual([3, 2]);
    // Reverse, above Er = 1.
    expect(collide(table, 3, 2, 1.5)).toEqual([1, 0]);
    // Below the thresholds nothing happens.
    expect(collide(table, 0, 1, 2)).toEqual([0, 1]);
    expect(collide(table, 2, 3, 1)).toEqual([2, 3]);
  });

  it('returns the energy the pair loses', () => {
    const table = new ReactionTable([rule([0, 0], [1, 1])], 2);
    const p = new Particles(2);
    const forward = table.react(p, 0, 1, 5);
    const back = table.react(p, 0, 1, 5);
    expect(forward).toBeGreaterThan(0);
    expect(back).toBe(-forward);
    expect(table.react(p, 0, 1, 0.5)).toBe(0);
  });

  it('refuses two rules for one pair, counting reverse reactions', () => {
    expect(() => new ReactionTable([rule([0, 0], [1, 1]), rule([1, 1], [2, 2])], 3)).toThrow(
      /rule 2: kinds 1 and 1 already react/,
    );
    expect(() => new ReactionTable([rule([0, 1], [2, 2]), rule([1, 0], [3, 3])], 4)).toThrow(
      /already react/,
    );
    // A suppressed reverse frees the products' pair for another rule.
    expect(
      () => new ReactionTable([rule([0, 0], [1, 1], true), rule([1, 1], [2, 2])], 3),
    ).not.toThrow();
  });
});
