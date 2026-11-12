import { describe, expect, it } from 'vitest';
import { javaReaction } from './reactions';
import { seededRandom } from './scenes';
import { Simulation, type InitialSpecies, type InitialState } from './simulation';
import { ArenaType, DividerThermalMode } from './simulation-info';

const NM = 1e-9;

/** n rods per species, evenly spaced along a 100 nm line, each at ±speed (random sign). */
function line(
  kinds: { n: number; mass: number; radius: number; speed: number }[],
  overrides: Partial<InitialState> = {},
  seed = 1,
): InitialState {
  const random = seededRandom(seed);
  const total = kinds.reduce((sum, k) => sum + k.n, 0);
  const length = 100 * NM;
  // Interleave the kinds along the line.
  const slots = Array.from({ length: total }, (_, i) => ((i + 0.5) * length) / total);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  let next = 0;
  const species: InitialSpecies[] = kinds.map((k) => {
    const positions = new Float64Array(3 * k.n);
    const velocities = new Float64Array(3 * k.n);
    for (let i = 0; i < k.n; i++) {
      positions[3 * i] = slots[next++]!;
      velocities[3 * i] = random() < 0.5 ? -k.speed : k.speed;
    }
    return { type: { particleMass: k.mass, particleRadius: k.radius * NM }, positions, velocities };
  });
  return {
    dimension: 1,
    arenaType: ArenaType.REFLECTING_BOUNDARIES,
    arenaXSize: length,
    arenaYSize: 50 * NM,
    arenaZSize: 50 * NM,
    species,
    ...overrides,
  };
}

function run(sim: Simulation, events: number): void {
  let last = 0;
  for (let k = 0; k < events; k++) last = sim.step()!.time;
  sim.advanceToTime(last);
}

/** Particle indices from left to right. */
function order(sim: Simulation): number[] {
  const p = sim.particles;
  return Array.from({ length: p.count }, (_, i) => i).sort((a, b) => p.x[a]! - p.x[b]!);
}

const sorted = (values: Iterable<number>) => [...values].sort((a, b) => a - b);

describe('1D', () => {
  it('keeps every particle on the line, in order (SIM-8)', () => {
    const sim = new Simulation(
      line([
        { n: 15, mass: 2, radius: 0.5, speed: 1100 },
        { n: 5, mass: 32, radius: 0.8, speed: 280 },
      ]),
    );
    const before = order(sim);
    for (let k = 0; k < 20; k++) {
      run(sim, 500);
      expect(order(sim)).toEqual(before);
    }
    expect(Array.from(sim.particles.y).every((y) => y === 0)).toBe(true);
    expect(Array.from(sim.particles.vy).every((v) => v === 0)).toBe(true);
  });

  it('one mass only swaps speeds, so it never relaxes (STORY-23)', () => {
    const sim = new Simulation(withSpeeds(line([{ n: 20, mass: 2, radius: 0.5, speed: 1 }])));
    const start = sorted(Array.from(sim.particles.vx, Math.abs));
    run(sim, 20_000);
    const end = sorted(Array.from(sim.particles.vx, Math.abs));
    end.forEach((v, k) => expect(v / start[k]!).toBeCloseTo(1, 12));
  });

  it('one heavier particle makes it relax (STORY-23)', () => {
    const speed = 1100;
    const sim = new Simulation(
      line([
        { n: 19, mass: 2, radius: 0.5, speed },
        { n: 1, mass: 10, radius: 0.5, speed: 300 },
      ]),
    );
    run(sim, 200_000);
    const light = Array.from(sim.particles.vx).slice(0, 19).map(Math.abs);
    // All started at one speed; now they're spread out like a thermal distribution.
    const spread = Math.max(...light) - Math.min(...light);
    expect(spread).toBeGreaterThan(speed);
  });

  it('square wells conserve kinetic + well energy (Java forgot to convert the depth)', () => {
    const sim = new Simulation(
      line(
        [
          { n: 16, mass: 2, radius: 0.5, speed: 1100 },
          { n: 4, mass: 32, radius: 0.8, speed: 280 },
        ],
        { wells: { radiusMultiplier: 1.5, depths: [4, 1] } },
      ),
    );
    const total = sim.kineticEnergy() + sim.potentialEnergy();
    run(sim, 20_000);
    expect((sim.kineticEnergy() + sim.potentialEnergy()) / total).toBeCloseTo(1, 9);
    expect(sim.pairsInWells().length).toBeGreaterThan(0);
    // In kJ/mol, wells this deep bind pairs and so heat the gas noticeably.
    expect(sim.kineticEnergy()).toBeGreaterThan(1.05 * total);
  });

  it('without wells there is no well energy, though Java-style exits are still predicted', () => {
    const sim = new Simulation(line([{ n: 20, mass: 2, radius: 0.5, speed: 1100 }]));
    const ke = sim.kineticEnergy();
    run(sim, 5_000);
    expect(sim.potentialEnergy()).toBe(0);
    expect(sim.pairsInWells()).toEqual([]);
    expect(sim.kineticEnergy() / ke).toBeCloseTo(1, 12);
  });

  it('reactions keep the particles in order, whichever side the first one is on', () => {
    const init = line([{ n: 20, mass: 2, radius: 0.5, speed: 3000 }]);
    const reactant = init.species[0]!;
    const sim = new Simulation({
      ...init,
      species: [
        reactant,
        { ...reactant, positions: new Float64Array(0), velocities: new Float64Array(0) },
      ],
      reactions: [javaReaction(1, 0.5, false)],
    });
    const before = order(sim);
    let reacted = 0;
    for (let k = 0; k < 20; k++) {
      run(sim, 500);
      expect(order(sim)).toEqual(before);
      reacted += Array.from(sim.particles.color).filter((c) => c === 1).length;
    }
    expect(reacted).toBeGreaterThan(0);
  });

  it.each([ArenaType.PERIODIC_BOUNDARIES, ArenaType.DIVIDED_ARENA])(
    'conserves energy in a %s arena',
    (arenaType) => {
      const sim = new Simulation(
        line(
          [
            { n: 10, mass: 2, radius: 0.5, speed: 1100 },
            { n: 10, mass: 32, radius: 0.8, speed: 280 },
          ],
          { arenaType, dividerThermalMode: DividerThermalMode.INSULATING },
        ),
      );
      const ke = sim.kineticEnergy();
      run(sim, 10_000);
      expect(sim.kineticEnergy() / ke).toBeCloseTo(1, 10);
    },
  );

  it('rejects a hole in the divider', () => {
    expect(
      () =>
        new Simulation(
          line([{ n: 4, mass: 2, radius: 0.5, speed: 1 }], {
            arenaType: ArenaType.DIVIDED_ARENA_WITH_HOLE,
            holeDiameter: 8 * NM,
          }),
        ),
    ).toThrow(/2D or 3D/);
  });
});

/** Gives particle k the speed 500 + 50 k m/s, keeping its direction. */
function withSpeeds(init: InitialState): InitialState {
  const v = init.species[0]!.velocities;
  for (let k = 0; k < v.length / 3; k++) v[3 * k] = Math.sign(v[3 * k]!) * (500 + 50 * k);
  return init;
}
