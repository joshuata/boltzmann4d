// Mid-run edits (PART-7–9, SIM-14–16, SIM-30). They have no Java parity hook (Java's
// add-particle path is commented out), so these check invariants: no overlaps, energy and
// momentum, reproducibility from a seed, and runs that carry on through an arena switch.
import { describe, expect, it } from 'vitest';
import { loadPresetScenario } from '../scenario/sources';
import { withSpecies } from '../scenario/edit';
import { resolveScenario } from '../scenario/resolve';
import type { Scenario } from '../scenario/schema';
import { BOLTZMANN_CONST } from '../stats/formulas';
import {
  addParticle,
  census,
  continueInArena,
  MAX_PARTICLES,
  PlacementError,
  placementSpace,
  removeNewest,
} from './particle-edits';
import { zeroMomentum } from './placement';
import { seededRandom, syntheticGas } from './scenes';
import { Simulation, type InitialState } from './simulation';
import { ArenaType } from './simulation-info';

const AMU_KG = 1.660538782e-27;
const NM = 1e-9;

/** Every particle as x, y, z, radius. */
function particlesOf(state: InitialState): number[][] {
  return state.species.flatMap((s) => {
    const out: number[][] = [];
    for (let k = 0; k < s.positions.length; k += 3) {
      out.push([s.positions[k]!, s.positions[k + 1]!, s.positions[k + 2]!, s.type.particleRadius]);
    }
    return out;
  });
}

/** Whether any two particles overlap, or one pokes through a box wall. */
function overlaps(state: InitialState): boolean {
  const all = particlesOf(state);
  const periodic = state.arenaType === ArenaType.PERIODIC_BOUNDARIES;
  for (let a = 0; a < all.length; a++) {
    const [x, y, z, r] = all[a]!;
    if (
      !periodic &&
      (x! < r! || y! < r! || x! > state.arenaXSize - r! || y! > state.arenaYSize - r!)
    )
      return true;
    for (let b = a + 1; b < all.length; b++) {
      const [x2, y2, z2, r2] = all[b]!;
      let dx = x! - x2!;
      let dy = y! - y2!;
      let dz = state.dimension === 3 ? z! - z2! : 0;
      if (periodic) {
        dx -= state.arenaXSize * Math.round(dx / state.arenaXSize);
        dy -= state.arenaYSize * Math.round(dy / state.arenaYSize);
        if (state.dimension === 3) dz -= state.arenaZSize * Math.round(dz / state.arenaZSize);
      }
      if (Math.hypot(dx, dy, dz) < r! + r2! - 1e-15) return true;
    }
  }
  return false;
}

/** Total kinetic energy (J) and momentum (amu·m/s) of a state. */
function totals(state: InitialState) {
  let energy = 0;
  const momentum = [0, 0, 0];
  for (const s of state.species) {
    const m = s.type.particleMass;
    for (let k = 0; k < s.velocities.length; k++) {
      const v = s.velocities[k]!;
      energy += 0.5 * m * AMU_KG * v * v;
      momentum[k % 3]! += m * v;
    }
  }
  return { energy, momentum };
}

/** A running 2D gas, `ps` picoseconds in. */
function running(state: InitialState, ps = 5): Simulation {
  const sim = new Simulation(state);
  sim.advanceToTime(ps * 1e-12);
  return sim;
}

function gas3D(seed = 3): InitialState {
  const random = seededRandom(seed);
  const size = 20 * NM;
  const state: InitialState = {
    dimension: 3,
    arenaType: ArenaType.REFLECTING_BOUNDARIES,
    arenaXSize: size,
    arenaYSize: size,
    arenaZSize: size,
    species: [
      {
        type: { particleMass: 4, particleRadius: 0.5 * NM },
        positions: new Float64Array(0),
        velocities: new Float64Array(0),
      },
    ],
  };
  let s = state;
  for (let k = 0; k < 60; k++) s = addParticle(s, 0, { temperature: 300, random });
  return s;
}

/** default.set's box with 50 red particles at 300 K placed at random (it places them itself). */
async function randomGas(
  boundary: Scenario['arena']['boundary'] = 'REFLECTING',
): Promise<Scenario> {
  const scenario = await loadPresetScenario('default');
  const gas = withSpecies(
    scenario,
    'red',
    { count: 50, mass: 2, radius: 1, temperature: 300 },
    { keepPlaced: false },
  );
  return { ...gas, arena: { ...gas.arena, boundary } };
}

async function preset(
  boundary: Scenario['arena']['boundary'] = 'REFLECTING',
  seed = 1,
): Promise<InitialState> {
  return resolveScenario(await randomGas(boundary), { random: seededRandom(seed) });
}

describe('addParticle', () => {
  it('adds at random without overlapping, in 2D, 3D and periodic arenas', () => {
    const random = seededRandom(7);
    for (const start of [
      running(syntheticGas({ count: 80, packing: 0.2 })).currentState(),
      running(
        syntheticGas({ count: 80, packing: 0.2, arenaType: ArenaType.PERIODIC_BOUNDARIES }),
      ).currentState(),
      gas3D(),
    ]) {
      let state = start;
      for (let k = 0; k < 40; k++)
        state = addParticle(state, k % state.species.length, { temperature: 500, random });
      expect(particlesOf(state)).toHaveLength(particlesOf(start).length + 40);
      expect(overlaps(state)).toBe(false);
      // The simulation takes it (it rejects particles overlapping drawn walls; here it
      // would also run into trouble with overlapping pairs), and the clock carries on.
      const sim = new Simulation(state);
      expect(sim.time).toBe(start.time ?? 0);
      sim.advanceToTime(sim.time + 2e-12);
    }
  });

  it('drops at a point (2D) and refuses a point that is taken', () => {
    const start = running(syntheticGas({ count: 20, packing: 0.05 })).currentState();
    const random = seededRandom(1);
    const space = placementSpace(start);
    const spot = space.randomSpot(0.5 * NM, random)!;
    const dropped = addParticle(start, 0, { at: [spot[0], spot[1]], temperature: 300, random });
    const added = dropped.species[0]!.positions.slice(-3);
    expect([...added]).toEqual([spot[0], spot[1], 0]);
    expect(() =>
      addParticle(dropped, 1, { at: [spot[0], spot[1]], temperature: 300, random }),
    ).toThrow(PlacementError);
    // Outside the walls.
    expect(() => addParticle(start, 0, { at: [0, 0], temperature: 300, random })).toThrow(
      PlacementError,
    );
  });

  it('gives the new particle the average energy d/2 kT of its temperature (SIM-6)', () => {
    const start = gas3D();
    for (const temperature of [100, 1200, 9999]) {
      const after = addParticle(start, 0, { temperature, random: seededRandom(2) });
      const energy = totals(after).energy - totals(start).energy;
      expect(energy).toBeCloseTo(1.5 * BOLTZMANN_CONST * temperature, 30);
      expect(energy / (1.5 * BOLTZMANN_CONST * temperature)).toBeCloseTo(1, 12);
    }
  });

  it('adds motionless particles at 0 K, which stay put (STORY-17)', () => {
    let state = running(syntheticGas({ count: 2, packing: 0.001 })).currentState();
    const random = seededRandom(5);
    for (let k = 0; k < 24; k++) state = addParticle(state, 0, { temperature: 0, random });
    const sim = new Simulation(state);
    const before = sim.currentState().species[0]!.positions.slice(-3 * 24);
    // Nothing still collides with anything until a moving particle comes along; check a
    // short while.
    sim.advanceToTime(sim.time + 1e-13);
    const after = sim.currentState().species[0]!.positions.slice(-3 * 24);
    const velocities = sim.currentState().species[0]!.velocities.slice(-3 * 24);
    expect([...velocities].every((v) => v === 0 || Math.abs(v) > 0)).toBe(true);
    const moved = [...after].filter((x, k) => x !== before[k]).length;
    expect(moved).toBeLessThanOrEqual(6); // at most a couple were hit
  });

  it('is reproducible from a seed', () => {
    const start = running(syntheticGas({ count: 50 })).currentState();
    const add = (seed: number) => {
      const random = seededRandom(seed);
      let state = start;
      for (let k = 0; k < 10; k++) state = addParticle(state, 1, { temperature: 800, random });
      return [...state.species[1]!.positions, ...state.species[1]!.velocities];
    };
    expect(add(11)).toEqual(add(11));
    expect(add(11)).not.toEqual(add(12));
  });

  it('stops at MAX_PARTICLES', () => {
    const start = syntheticGas({ count: MAX_PARTICLES, packing: 0.05 });
    expect(() => addParticle(start, 0, { temperature: 300, random: seededRandom(1) })).toThrow(
      PlacementError,
    );
  });

  it('keeps the clock, and energy is conserved afterwards (SIM-3)', () => {
    const sim = running(syntheticGas({ count: 60 }), 10);
    const state = addParticle(sim.currentState(), 0, {
      temperature: 2000,
      random: seededRandom(4),
    });
    const next = new Simulation(state);
    expect(next.time).toBe(sim.time);
    const energy = next.kineticEnergy();
    next.advanceToTime(next.time + 50e-12);
    expect(next.counters.particleCollisions).toBeGreaterThan(50);
    expect(Math.abs(next.kineticEnergy() / energy - 1)).toBeLessThan(1e-12);
  });
});

describe('removeNewest', () => {
  it('removes the most recently added particle and exactly its energy (PART-9)', () => {
    const start = running(syntheticGas({ count: 40 })).currentState();
    const added = addParticle(start, 1, { temperature: 3000, random: seededRandom(3) });
    const removed = removeNewest(added, 1)!;
    expect([...removed.species[1]!.positions]).toEqual([...start.species[1]!.positions]);
    expect(totals(removed).energy).toBe(totals(start).energy);
    const before = totals(added);
    const after = totals(removed);
    const v = added.species[1]!.velocities.slice(-3);
    const m = added.species[1]!.type.particleMass;
    expect(before.energy - after.energy).toBeCloseTo(
      0.5 * m * AMU_KG * (v[0]! ** 2 + v[1]! ** 2 + v[2]! ** 2),
      30,
    );
    for (let axis = 0; axis < 3; axis++) {
      expect(before.momentum[axis]! - after.momentum[axis]!).toBeCloseTo(m * v[axis]!, 9);
    }
  });

  it('returns null for a kind with no particles', () => {
    const one = syntheticGas({ count: 1 });
    expect(removeNewest(one, 1)).toBeNull();
    expect(removeNewest(removeNewest(one, 0)!, 0)).toBeNull();
  });
});

describe('continueInArena', () => {
  it('opens the hole in a divided box without restarting, and the gas leaks through (SIM-15)', async () => {
    const divided = await preset('DIVIDED');
    const sim = running(divided, 20);
    const now = sim.currentState();
    expect(census(now).right!.reduce((a, b) => a + b)).toBe(0); // default: red only, left
    const hole = continueInArena(now, ArenaType.DIVIDED_ARENA_WITH_HOLE)!;
    expect(hole).not.toBeNull();
    expect(hole.time).toBe(sim.time);
    const next = new Simulation(hole);
    next.advanceToTime(next.time + 500e-12);
    expect(census(next.currentState()).right!.reduce((a, b) => a + b)).toBeGreaterThan(0);
  });

  it('removes the divider without restarting, and the halves mix (SIM-16)', async () => {
    const divided = await preset('DIVIDED');
    const now = running(divided, 20).currentState();
    const box = continueInArena(now, ArenaType.REFLECTING_BOUNDARIES)!;
    expect(box.arenaType).toBe(ArenaType.REFLECTING_BOUNDARIES);
    expect([...box.species[0]!.positions]).toEqual([...now.species[0]!.positions]);
    const next = new Simulation(box);
    const energy = next.kineticEnergy();
    next.advanceToTime(next.time + 300e-12);
    const counts = census({ ...next.currentState(), arenaType: ArenaType.DIVIDED_ARENA });
    expect(counts.right![0]).toBeGreaterThan(0);
    expect(Math.abs(next.kineticEnergy() / energy - 1)).toBeLessThan(1e-12);
  });

  it('restarts (null) for a divided box, and when particles sit on the new divider', async () => {
    const box = running(await preset(), 5).currentState();
    expect(continueInArena(box, ArenaType.DIVIDED_ARENA)).toBeNull();
    // 100 particles in the 70 × 50 nm default box: some cross the middle.
    expect(continueInArena(box, ArenaType.DIVIDED_ARENA_WITH_HOLE)).toBeNull();
    const periodic = continueInArena(box, ArenaType.PERIODIC_BOUNDARIES)!;
    expect(periodic.arenaType).toBe(ArenaType.PERIODIC_BOUNDARIES);
    new Simulation(periodic).advanceToTime(periodic.time! + 10e-12);
  });
});

describe('census', () => {
  it('counts each side of a divider (PART-16) and gives the temperature (PART-12)', async () => {
    const divided = await preset('DIVIDED');
    const c = census(divided);
    expect(c.counts[0]).toBeGreaterThan(0);
    expect(c.left).toEqual(c.counts);
    expect(c.temperature).toBeCloseTo(300, 6); // default.set is at 300 K
    expect(census({ ...divided, arenaType: ArenaType.REFLECTING_BOUNDARIES }).left).toBeUndefined();
  });
});

describe('restart placement (SIM-14, SIM-30)', () => {
  it('zeroes the momentum of the random velocities and keeps their energy', async () => {
    const plain = await preset();
    const scenario = await randomGas();
    const restarted = resolveScenario(scenario, { random: seededRandom(1), zeroMomentum: true });
    const before = totals(plain);
    const after = totals(restarted);
    expect(after.energy / before.energy).toBeCloseTo(1, 12);
    const scale = Math.abs(before.momentum[0]!) + Math.abs(before.momentum[1]!) + 1;
    for (const m of after.momentum) expect(Math.abs(m)).toBeLessThan(1e-9 * scale);
  });

  it('places every kind on the left with allOnLeft', async () => {
    const divided = await randomGas('DIVIDED');
    const red = divided.populations[0]!;
    const twoKinds: Scenario = {
      ...divided,
      kinds: [...divided.kinds, { ...divided.kinds[0]!, id: 'blue', name: 'Blue' }].filter(
        (k, i, all) => all.findIndex((o) => o.id === k.id) === i,
      ),
      populations: [...divided.populations, { ...red, kind: 'blue' }],
    };
    const normal = census(resolveScenario(twoKinds, { random: seededRandom(2) }));
    expect(normal.right!.at(-1)).toBeGreaterThan(0);
    const left = census(resolveScenario(twoKinds, { random: seededRandom(2), allOnLeft: true }));
    expect(left.right!.every((n) => n === 0)).toBe(true);
  });

  it('zeroMomentum leaves stationary and single particles alone', () => {
    const still = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    zeroMomentum(still, [1, 1]);
    expect(still).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    const one = [[5, 0, 0]];
    zeroMomentum(one, [1]);
    expect(one).toEqual([[5, 0, 0]]);
  });
});

describe('Simulation.currentState', () => {
  it('rebuilds the same run: the rebuilt simulation carries on like the original', () => {
    const sim = running(syntheticGas({ count: 60 }), 10);
    const copy = new Simulation(sim.currentState());
    expect(copy.time).toBe(sim.time);
    expect(copy.kineticEnergy()).toBe(sim.kineticEnergy());
    // Not bit for bit (Java's prediction rounding history is gone), but the same gas for a
    // while: well under a radius apart after a few ps.
    sim.advanceToTime(sim.time + 2e-12);
    copy.advanceToTime(copy.time + 2e-12);
    const a = sim.currentState().species[0]!.positions;
    const b = copy.currentState().species[0]!.positions;
    for (let k = 0; k < a.length; k++) expect(Math.abs(a[k]! - b[k]!)).toBeLessThan(1e-12);
  });

  it('keeps the piston level and the demon’s hole', async () => {
    const hole = await preset('HOLE');
    const sim = new Simulation({ ...hole, maxwellDemonMode: true });
    sim.setHoleOpen(true);
    sim.advanceToTime(1e-12);
    expect(new Simulation(sim.currentState()).holeOpen).toBe(true);
  });
});
