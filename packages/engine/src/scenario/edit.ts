// Editing a scenario the way the Java app's settings dialog does: each kind as one species
// with a count, mass, radius and temperature (PART-1–5). A scenario may hold more detail than
// that (several populations per kind, explicitly placed particles); the summary reads it, and
// writing a species back keeps its placed particles where it can.
import { ARENA_DIVIDER_RADIUS } from '../sim/simulation-info';
import { avgKineticEnergy, speed, temperature as temperatureFromEnergy } from '../stats/formulas';
import { convert } from '../utils/units';
import type { Kind, Population, Scenario } from './schema';

/** Limits the Java app's dialog enforces (docs/specs/particles.md, PART-1–4). */
export const SPECIES_LIMITS = {
  /** All kinds together. */
  totalCount: { min: 0, max: 999 },
  /** amu; 0 would never move. */
  mass: { min: 0.001, max: 999 },
  /** nm. */
  radius: { min: 0.2, max: 20 },
} as const;

/** Arena side lengths, nm (SimulationInfo.MAXIMUM_ARENA_SIDE_LENGTH). */
export const ARENA_SIZE_LIMITS = { min: 1, max: 500 } as const;

export interface SpeciesSetup {
  /** Particles of this kind, placed and random together. */
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

const populationsOf = (scenario: Scenario, kind: string) =>
  scenario.populations.filter((p) => p.kind === kind);

const massKg = (amu: number) => convert('amu', 'kg', amu);

/** A kind's particles as one count, mass, radius and temperature; null if it has none. */
export function describeSpecies(scenario: Scenario, kindId: string): SpeciesSummary | null {
  const kind = scenario.kinds.find((k) => k.id === kindId);
  if (!kind) return null;
  const kg = massKg(kind.mass);
  const dimension = scenario.arena.dimensions;
  let count = 0;
  let placed = 0;
  let energy = 0;
  let explicitTemperature: number | undefined;
  for (const p of populationsOf(scenario, kindId)) {
    const before = count;
    for (const block of p.randomlyPlaced) {
      count += block.count;
      energy += block.count * 0.5 * kg * block.averageVelocity ** 2;
    }
    for (const particle of p.particles) {
      count++;
      placed++;
      energy += 0.5 * kg * particle.speed ** 2;
    }
    if (p.temperature !== undefined && count > before) explicitTemperature = p.temperature;
  }
  if (count === 0) return null;
  const temperature = explicitTemperature ?? temperatureFromEnergy(energy / count, dimension);
  return { count, placed, mass: kind.mass, radius: kind.radius, temperature };
}

const capitalized = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/**
 * Replaces a kind's particles, adding the kind (named after its id) if the scenario lacks it.
 * Particles the scenario places at given positions stay where they are (the first `count` of
 * them) unless `keepPlaced` is false; the rest of `count` are placed at random. The species
 * gets one temperature, so placed particles' speeds are rescaled to it. A count of 0 or null
 * removes the kind's particles; the kind itself stays.
 */
export function withSpecies(
  scenario: Scenario,
  kindId: string,
  setup: SpeciesSetup | null,
  { keepPlaced = true }: { keepPlaced?: boolean } = {},
): Scenario {
  const others = scenario.populations.filter((p) => p.kind !== kindId);
  if (!setup || setup.count <= 0) return { ...scenario, populations: others };

  const existing = scenario.kinds.find((k) => k.id === kindId);
  const kind: Kind = {
    ...(existing ?? { id: kindId, name: capitalized(kindId) }),
    mass: setup.mass,
    radius: setup.radius,
  };
  const kinds = existing
    ? scenario.kinds.map((k) => (k.id === kindId ? kind : k))
    : [...scenario.kinds, kind];

  const placed = keepPlaced
    ? populationsOf(scenario, kindId)
        .flatMap((p) => p.particles)
        .slice(0, setup.count)
    : [];
  const randomCount = setup.count - placed.length;
  const population: Population = {
    kind: kindId,
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
  // In kind order, as the simulation orders species (red before blue).
  const order = new Map(kinds.map((k, i) => [k.id, i]));
  const populations = [...others, population].sort(
    (a, b) => order.get(a.kind)! - order.get(b.kind)!,
  );
  return { ...scenario, kinds, populations };
}

/**
 * The scenario in an arena of a new size (OPT-1, SIM-10; x, y, z in nm). Drawn walls and
 * spawn regions stretch with the arena. Particles are placed anew, each at its own speed:
 * those placed at given positions join the randomly placed ones, since moving them with the
 * arena could make them overlap. Run scenarioProblems on the result to check they fit.
 */
export function withArenaSize(scenario: Scenario, size: [number, number, number]): Scenario {
  const [x, y] = scenario.arena.size;
  const sx = size[0] / x;
  const sy = size[1] / y;
  const scale = ([px, py]: [number, number]): [number, number] => [px * sx, py * sy];
  return {
    ...scenario,
    arena: { ...scenario.arena, size: [...size] },
    populations: scenario.populations.map((p) => ({
      ...p,
      randomlyPlaced: [
        ...p.randomlyPlaced,
        ...p.particles.map((particle) => ({ count: 1, averageVelocity: particle.speed })),
      ],
      particles: [],
    })),
    walls: scenario.walls.map((w) => ({ ...w, points: w.points.map(scale) })),
    spawnRegions: scenario.spawnRegions.map((r) => ({
      ...r,
      shape:
        r.shape.type === 'rectangle'
          ? { ...r.shape, min: scale(r.shape.min), max: scale(r.shape.max) }
          : { ...r.shape, points: r.shape.points.map(scale) },
    })),
  };
}

/**
 * Problems a valid scenario can still have, as the Java dialog checks them: particles placed
 * at random must fit in the space they're placed in, with room to move
 * (SimSettingsController.getTotalNeededVolume), and there may be at most 999 of them.
 */
export function scenarioProblems(scenario: Scenario): string[] {
  const problems: string[] = [];
  const species = scenario.kinds
    .map((k) => describeSpecies(scenario, k.id))
    .filter((s): s is SpeciesSummary => s !== null);
  const total = species.reduce((n, s) => n + s.count, 0);
  if (total > SPECIES_LIMITS.totalCount.max) {
    problems.push(`At most ${SPECIES_LIMITS.totalCount.max} particles in all (this has ${total}).`);
  }
  // Particles at given positions are where the file wants them (2Dliquid is packed tight).
  if (species.every((s) => s.placed === s.count)) return problems;
  // With walls or spawn regions, placement itself says exactly what fits (EDIT-6).
  if (scenario.walls.length > 0 || scenario.spawnRegions.length > 0) return problems;

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
