// Editing a scenario the way the Java app's settings dialog does: one red and one blue
// species, each with a count, mass, radius and temperature (PART-1–5). A scenario may hold
// more detail than that (several groups per colour, explicitly placed particles); the
// summary reads it, and writing a species back keeps its placed particles where it can.
import { ARENA_DIVIDER_RADIUS } from '../sim/simulation-info';
import { avgKineticEnergy, speed, temperature as temperatureFromEnergy } from '../stats/formulas';
import { convert } from '../utils/units';
import type { ParticleColor, ParticleGroup, Scenario } from './schema';

/** Limits the Java app's dialog enforces (docs/specs/particles.md, PART-1–4). */
export const SPECIES_LIMITS = {
  /** Red and blue together. */
  totalCount: { min: 0, max: 999 },
  /** amu; 0 would never move. */
  mass: { min: 0.001, max: 999 },
  /** nm. */
  radius: { min: 0.2, max: 20 },
} as const;

/** Arena side lengths, nm (SimulationInfo.MAXIMUM_ARENA_SIDE_LENGTH). */
export const ARENA_SIZE_LIMITS = { min: 1, max: 500 } as const;

export interface SpeciesSetup {
  /** Particles of this colour, placed and random together. */
  count: number;
  /** amu. */
  mass: number;
  /** nm. */
  radius: number;
  /** K. */
  temperature: number;
}

export interface SpeciesSummary extends SpeciesSetup {
  /** How many of `count` the scenario places at given positions (the rest go at random). */
  placed: number;
}

const groupsOf = (scenario: Scenario, color: ParticleColor) =>
  scenario.particleGroups.filter((g) => g.color === color);

const massKg = (amu: number) => convert('amu', 'kg', amu);

/** A colour's species as one count, mass, radius and temperature; null if it has none. */
export function describeSpecies(scenario: Scenario, color: ParticleColor): SpeciesSummary | null {
  const groups = groupsOf(scenario, color);
  const last = groups.at(-1);
  if (!last) return null;
  const dimension = scenario.arena.dimensions;
  let count = 0;
  let placed = 0;
  let energy = 0;
  let explicitTemperature: number | undefined;
  for (const g of groups) {
    const kg = massKg(g.mass);
    const before = count;
    for (const block of g.randomlyPlaced) {
      count += block.count;
      energy += block.count * 0.5 * kg * block.averageVelocity ** 2;
    }
    for (const p of g.particles) {
      count++;
      placed++;
      energy += 0.5 * kg * p.speed ** 2;
    }
    if (g.temperature !== undefined && count > before) explicitTemperature = g.temperature;
  }
  if (count === 0) return null;
  const temperature = explicitTemperature ?? temperatureFromEnergy(energy / count, dimension);
  return { count, placed, mass: last.mass, radius: last.radius, temperature };
}

/**
 * Replaces a colour's species. Particles the scenario places at given positions stay where
 * they are (the first `count` of them) unless `keepPlaced` is false; the rest of `count` are
 * placed at random. The species gets one temperature, so placed particles' speeds are
 * rescaled to it. A count of 0 or null removes the colour.
 */
export function withSpecies(
  scenario: Scenario,
  color: ParticleColor,
  setup: SpeciesSetup | null,
  { keepPlaced = true }: { keepPlaced?: boolean } = {},
): Scenario {
  const others = scenario.particleGroups.filter((g) => g.color !== color);
  if (!setup || setup.count <= 0) return { ...scenario, particleGroups: others };
  const placed = keepPlaced
    ? groupsOf(scenario, color)
        .flatMap((g) => g.particles)
        .slice(0, setup.count)
    : [];
  const randomCount = setup.count - placed.length;
  const group: ParticleGroup = {
    color,
    mass: setup.mass,
    radius: setup.radius,
    temperature: setup.temperature,
    // Every particle starts at the speed for this temperature (SIM-6), as in Java's saves.
    randomlyPlaced:
      randomCount > 0
        ? [
            {
              count: randomCount,
              averageVelocity: speed(
                avgKineticEnergy(setup.temperature, scenario.arena.dimensions),
                massKg(setup.mass),
              ),
            },
          ]
        : [],
    particles: placed,
  };
  // Red before blue, as the simulation orders them.
  const particleGroups = color === 'RED' ? [group, ...others] : [...others, group];
  return { ...scenario, particleGroups };
}

/**
 * Problems a valid scenario can still have, as the Java dialog checks them: particles placed
 * at random must fit in the space they're placed in, with room to move
 * (SimSettingsController.getTotalNeededVolume), and there may be at most 999 of them.
 */
export function scenarioProblems(scenario: Scenario): string[] {
  const problems: string[] = [];
  const species = (['RED', 'BLUE'] as const)
    .map((c) => describeSpecies(scenario, c))
    .filter((s): s is SpeciesSummary => s !== null);
  const total = species.reduce((n, s) => n + s.count, 0);
  if (total > SPECIES_LIMITS.totalCount.max) {
    problems.push(`At most ${SPECIES_LIMITS.totalCount.max} particles in all (this has ${total}).`);
  }
  // Particles at given positions are where the file wants them (2Dliquid is packed tight).
  if (species.every((s) => s.placed === s.count)) return problems;

  const d = scenario.arena.dimensions;
  const [x, y, z] = scenario.arena.size;
  const divided = scenario.arena.boundary === 'DIVIDED' || scenario.arena.boundary === 'HOLE';
  const dividerNm = convert('m', 'nm', ARENA_DIVIDER_RADIUS);
  const width = divided ? x / 2 - dividerNm : x;
  const available = d === 1 ? width : d === 2 ? width * y : width * y * z;
  let needed = 0;
  let biggest = 0;
  for (const s of species) {
    const diameter = 2 * s.radius;
    biggest = Math.max(biggest, diameter);
    needed += diameter ** d * s.count;
  }
  needed += 2 * biggest * (d === 1 ? 1 : d === 2 ? x : x * y);
  if (needed > available) {
    problems.push(
      'These particles do not fit in the arena. Reduce their count or radius, or enlarge the arena.',
    );
  }
  return problems;
}
