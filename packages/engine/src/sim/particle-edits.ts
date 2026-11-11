// Changing a running gas (PART-7–9, SIM-14–16): pure functions from one starting state to
// the next. Take the present moment with Simulation.currentState(), edit it here, and build
// a new Simulation from the result; the clock carries on from the state's `time`.
//
// Java's own add-particle path is commented out (Load.java), so there's no parity hook:
// particle-edits.test.ts checks these by their invariants instead.
import { BOLTZMANN_CONST } from '../stats/formulas';
import { ArenaType } from './simulation-info';
import { PlacementSpace, randomVelocity, speedForTemperature } from './placement';
import type { InitialState } from './simulation';

/** A particle can't go where it was asked to (it would overlap something, or there's no room). */
export class PlacementError extends Error {
  override name = 'PlacementError';
}

/** The ArenaTypes that keep the particles' starting arrangement meaningful (no piston). */
export type Boundary =
  | typeof ArenaType.PERIODIC_BOUNDARIES
  | typeof ArenaType.REFLECTING_BOUNDARIES
  | typeof ArenaType.DIVIDED_ARENA
  | typeof ArenaType.DIVIDED_ARENA_WITH_HOLE;

const particleCount = (state: InitialState) =>
  state.species.reduce((n, s) => n + s.positions.length / 3, 0);

/** Drawn walls as segments x1, y1, x2, y2 (m). */
function segmentsOf(state: InitialState): number[] {
  const segments: number[] = [];
  for (const wall of state.walls ?? []) {
    const pts = wall.points;
    const count = wall.closed ? pts.length : pts.length - 1;
    for (let k = 0; k < count; k++) {
      const [x1, y1] = pts[k]!;
      const [x2, y2] = pts[(k + 1) % pts.length]!;
      segments.push(x1, y1, x2, y2);
    }
  }
  return segments;
}

/** The space a state's particles take up, in the state's arena or in `arenaType`. */
export function placementSpace(
  state: InitialState,
  arenaType: ArenaType = state.arenaType,
): PlacementSpace {
  if (state.dimension !== 2 && state.dimension !== 3) {
    throw new Error(`${state.dimension}D arenas aren't supported yet`);
  }
  const pistonY =
    arenaType === ArenaType.MOVABLE_PISTON
      ? (1 - (state.pistonLevel ?? 0)) * state.arenaYSize
      : undefined;
  const space = new PlacementSpace({
    dimension: state.dimension,
    arenaType,
    xSize: state.arenaXSize,
    ySize: state.arenaYSize,
    zSize: state.arenaZSize,
    holeDiameter: state.holeDiameter,
    pistonY,
    segments: segmentsOf(state),
  });
  for (const species of state.species) {
    const r = species.type.particleRadius;
    const pos = species.positions;
    for (let k = 0; k < pos.length; k += 3) space.add(pos[k]!, pos[k + 1]!, pos[k + 2]!, r);
  }
  return space;
}

export interface AddOptions {
  /**
   * Where (m): x, y and, in 3D, z. Absent: at random (anywhere it fits, on either side of
   * a divider).
   */
  at?: readonly number[];
  /** K: the particle gets the speed for this temperature (SIM-6) in a random direction. */
  temperature: number;
  /** Uniform [0, 1) numbers for the position and direction. */
  random: () => number;
}

/** At most this many particles in all (PART-1). */
export const MAX_PARTICLES = 999;

/**
 * Adds one particle of species `kind` (PART-7, PART-8): at a point, which must be free, or
 * at random where it fits. Takes the species' mass and radius. Throws PlacementError when
 * it doesn't fit (or the gas already has MAX_PARTICLES).
 */
export function addParticle(state: InitialState, kind: number, options: AddOptions): InitialState {
  const species = state.species[kind];
  if (!species) throw new RangeError(`No species ${kind}`);
  if (particleCount(state) >= MAX_PARTICLES) {
    throw new PlacementError(`At most ${MAX_PARTICLES} particles`);
  }
  const radius = species.type.particleRadius;
  const space = placementSpace(state);
  let position: number[];
  if (options.at) {
    const [x = 0, y = 0, z = state.arenaZSize / 2] = options.at;
    if (!space.fits(x, y, state.dimension === 3 ? z : 0, radius)) {
      throw new PlacementError('There is no room for a particle there');
    }
    position = [x, y, state.dimension === 3 ? z : 0];
  } else {
    const spot = space.randomSpot(radius, options.random);
    if (!spot) throw new PlacementError('There is no room for another particle');
    position = spot;
  }
  const speed = speedForTemperature(
    options.temperature,
    species.type.particleMass,
    state.dimension,
  );
  const velocity = randomVelocity(speed, state.dimension, options.random);
  const positions = new Float64Array(species.positions.length + 3);
  positions.set(species.positions);
  positions.set(position, species.positions.length);
  const velocities = new Float64Array(species.velocities.length + 3);
  velocities.set(species.velocities);
  velocities.set(velocity, species.velocities.length);
  const n = species.positions.length / 3;
  const colors = new Uint16Array(n + 1).fill(kind);
  if (species.colors) colors.set(species.colors);
  // A changed gas has its own temperature (PART-12): the statistics infer it again.
  return withSpecies(state, kind, { ...species, positions, velocities, colors });
}

/**
 * Removes species `kind`'s newest particle (PART-9): particles are added at the end, so
 * the last one. The energy it had goes with it. Null when the species has none.
 */
export function removeNewest(state: InitialState, kind: number): InitialState | null {
  const species = state.species[kind];
  if (!species) throw new RangeError(`No species ${kind}`);
  const n = species.positions.length / 3;
  if (n === 0) return null;
  return withSpecies(state, kind, {
    ...species,
    positions: species.positions.slice(0, 3 * (n - 1)),
    velocities: species.velocities.slice(0, 3 * (n - 1)),
    ...(species.colors ? { colors: species.colors.slice(0, n - 1) } : {}),
  });
}

function withSpecies(
  state: InitialState,
  kind: number,
  species: InitialState['species'][number],
): InitialState {
  return {
    ...state,
    species: state.species.map((s, t) =>
      t === kind ? { ...species, initialTemperature: NaN } : s,
    ),
  };
}

/**
 * The same particles in another kind of arena (SIM-15, SIM-16): a divided box opening its
 * hole, or losing its divider, carries on as it is. Null when some particle doesn't fit
 * in the new arena (it sits on the new divider, or across a periodic edge into a wall):
 * the caller restarts instead. A switch to a divided box always restarts (SIM-14), so it's
 * null too. Drawn walls need box walls, so periodic arenas are null with them.
 */
export function continueInArena(state: InitialState, arenaType: Boundary): InitialState | null {
  if (arenaType === state.arenaType) return state;
  if (arenaType === ArenaType.DIVIDED_ARENA) return null;
  if (arenaType === ArenaType.PERIODIC_BOUNDARIES && (state.walls?.length ?? 0) > 0) return null;
  if (arenaType === ArenaType.DIVIDED_ARENA_WITH_HOLE && !(state.holeDiameter! > 0)) return null;
  const empty = {
    ...state,
    species: state.species.map((s) => ({ ...s, positions: new Float64Array(0) })),
  };
  const space = placementSpace(empty, arenaType);
  for (const species of state.species) {
    const r = species.type.particleRadius;
    const pos = species.positions;
    for (let k = 0; k < pos.length; k += 3) {
      let x = pos[k]!;
      let y = pos[k + 1]!;
      let z = pos[k + 2]!;
      if (state.arenaType === ArenaType.PERIODIC_BOUNDARIES) {
        // Periodic arenas keep particles across the low edges at negative coordinates.
        if (x < 0) x += state.arenaXSize;
        if (y < 0) y += state.arenaYSize;
        if (z < 0) z += state.arenaZSize;
      }
      if (!space.fits(x, y, z, r)) return null;
      space.add(x, y, z, r);
    }
  }
  // Leaving a piston arena: the top wall is back where the piston started.
  return { ...state, arenaType, pistonLevel: 0 };
}

/** Particle counts and temperatures, for the sidebar's readouts (PART-12, PART-16). */
export interface Census {
  /** Per species. */
  counts: number[];
  /** Divided arenas: per species, how many are left and right of the divider's centre. */
  left?: number[];
  right?: number[];
  /** Per species, K, from their kinetic energy (NaN without particles). */
  temperatures: number[];
  /** Every particle together, K (PART-12). */
  temperature: number;
}

/**
 * Counts and temperatures of a state's particles (T = 2⟨KE⟩ / (d k), SIM-6), e.g. of
 * `simulation.currentState()`.
 */
export function census(state: InitialState): Census {
  const d = state.dimension;
  const divided =
    state.arenaType === ArenaType.DIVIDED_ARENA ||
    state.arenaType === ArenaType.DIVIDED_ARENA_WITH_HOLE;
  const middle = state.arenaXSize / 2;
  const counts: number[] = [];
  const left: number[] = [];
  const right: number[] = [];
  const temperatures: number[] = [];
  let energy = 0;
  let total = 0;
  for (const s of state.species) {
    const n = s.positions.length / 3;
    let onLeft = 0;
    for (let k = 0; k < n; k++) if (s.positions[3 * k]! < middle) onLeft++;
    let speedSquared = 0;
    for (const v of s.velocities) speedSquared += v * v;
    const e = 0.5 * s.type.particleMass * AMU_KG * speedSquared;
    counts.push(n);
    left.push(onLeft);
    right.push(n - onLeft);
    temperatures.push(n > 0 ? temperatureOf(e / n, d) : NaN);
    energy += e;
    total += n;
  }
  return {
    counts,
    ...(divided ? { left, right } : {}),
    temperatures,
    temperature: total > 0 ? temperatureOf(energy / total, d) : NaN,
  };
}

const AMU_KG = 1.660538782e-27;
const temperatureOf = (energy: number, d: number) => (2 * energy) / (d * BOLTZMANN_CONST);
