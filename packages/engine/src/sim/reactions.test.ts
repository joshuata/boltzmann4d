import { describe, expect, it } from 'vitest';
import { loadPresetText, loadSettings } from '../io';
import { seededRandom, syntheticGas } from './scenes';
import { Simulation, type InitialState } from './simulation';

const kB = 1.3806504e-23;
const KJ_PER_MOL = 1e3 / 6.02214179e23; // J per particle

/** One species plus an empty "reacted" copy of it, as the Reactions tab sets up. */
function withReacted(
  init: InitialState,
  forward: number,
  reverse: number,
  suppressReverse = false,
) {
  const red = init.species[0]!;
  const empty = new Float64Array(0);
  return {
    ...init,
    species: [red, { ...red, positions: empty, velocities: empty }],
    reactions: { forward, reverse, suppressReverse },
  };
}

function blue(sim: Simulation): number {
  let n = 0;
  for (const c of sim.particles.color) n += c;
  return n;
}

/** Kinetic energy plus ΔE/2 per blue particle (a reacting pair stores ΔE), in J. */
function energy(sim: Simulation, forward: number, reverse: number): number {
  return sim.kineticEnergy() + blue(sim) * ((forward - reverse) / 2) * KJ_PER_MOL;
}

function run(sim: Simulation, events: number): void {
  let last = 0;
  for (let k = 0; k < events; k++) last = sim.step()!.time;
  sim.advanceToTime(last);
}

async function equil(): Promise<InitialState> {
  const { settings } = loadSettings(await loadPresetText('2Dequil'), { random: seededRandom(6) });
  return settings;
}

describe('red↔blue reactions', () => {
  it.each([
    [3.0, 2.0],
    [3.0, 4.0], // exothermic
  ])('conserve kinetic + chemical energy (Ef %f, Er %f)', async (forward, reverse) => {
    const sim = new Simulation(withReacted(await equil(), forward, reverse));
    const total = energy(sim, forward, reverse);
    run(sim, 30_000);
    expect(blue(sim)).toBeGreaterThan(0);
    expect(energy(sim, forward, reverse) / total).toBeCloseTo(1, 9);
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

  it('need a second species to turn into', async () => {
    const init = await equil();
    const sim = new Simulation({
      ...init,
      reactions: { forward: 3, reverse: 2, suppressReverse: false },
    });
    expect(sim.reaction).toBeNull();
  });
});
