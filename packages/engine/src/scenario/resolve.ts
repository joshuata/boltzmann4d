// Turns a validated scenario (./schema.ts) into the ResolvedScenario the simulation runs:
// unit conversion to SI, randomly placed particles, and temperature scaling. Based on
// model/io/Load.java (loadNewSetFile), with these deliberate differences:
// - Settings that Java read and then discarded (paused, speed, statistic choice, abscissa
//   limits, colour scheme, ...) are kept, so the UI can use them.
// - maxwell_demon_mode is honoured; Java parsed it but never passed it on.
// The physics-relevant results (arena size, hole diameter, particle types, positions,
// velocities and temperature scaling) follow Java exactly, including the order in which
// random numbers are drawn.
//
// Scenarios with drawn walls or spawn regions place randomly placed particles anew
// (EDIT-3): uniformly inside their region (or the arena), clear of walls, the divider and
// every particle placed before them. Scenarios without either, such as every `.set` file,
// keep Java's placement and its random draws exactly.
//
import type { ReactionRule } from '../sim/reactions';
import { distanceToSegment, type WallPhysics, type WallShape } from '../sim/segment-walls';
import { ParticleType } from '../sim/particle-type';
import { ARENA_DIVIDER_RADIUS, ArenaType } from '../sim/simulation-info';
import type { DividerThermalMode } from '../sim/simulation-info';
import { avgKineticEnergy, speed as speedFromEnergy } from '../stats/formulas';
import { convert, Energy } from '../utils/units';
import { ScenarioError, type Boundary } from './format';
import { MARKERS, paletteColor, type Marker } from './palettes';
import { wallStyle, type ResolvedWallStyle, type WallKindType } from './wall-styles';
import type { Kind, Population, Scenario, WallKind } from './schema';

/** `#RRGGBB` as a number. */
export const parseHexColor = (hex: string) => parseInt(hex.slice(1), 16);

export type Dimension = 1 | 2 | 3;
/** Which species the statistics show (KIND-4): all of them, or these species indices. */
export type StatKinds = 'all' | number[];

/** One particle type and all its particles. Vectors are stored flat, 3 components each. */
export interface ParticleSpecies {
  /** The scenario kind's id. */
  kindId: string;
  /** Drawn on the kind's particles in 2D, in legends and charts (KIND-9). */
  marker: Marker;
  type: ParticleType;
  /** Initial temperature in K requested by the file, or NaN to infer it from the velocities. */
  initialTemperature: number;
  /** x, y, z per particle, in meters. */
  positions: Float64Array;
  /** x, y, z per particle, in m/s. */
  velocities: Float64Array;
}

/** Histogram axis limits for one statistic: for all species together and by species index. */
export interface AbscissaLimits {
  all?: [number, number];
  species: Map<number, [number, number]>;
}

/** Colours as 0xRRGGBB for the CUSTOM colour scheme; kinds' colours are on their types. */
export interface CustomColors {
  background: number;
  divider: number;
  /** Arena wall colours for 3D views, when the file gives all six or some of them. */
  walls3D: Partial<Record<'left' | 'right' | 'top' | 'bottom' | 'front' | 'back', number>>;
}

export interface ResolvedScenario {
  // Physics
  dimension: Dimension;
  arenaType: ArenaType;
  dividerThermalMode: DividerThermalMode;
  /** Arena side lengths in meters. */
  arenaXSize: number;
  arenaYSize: number;
  arenaZSize: number;
  /** Diameter of the hole in the divider, in meters. */
  holeDiameter: number;
  maxwellDemonMode: boolean;
  /** Drawn walls, points in meters. */
  walls: ResolvedWall[];
  /** The enabled reaction rules, with kinds as species indices (KIND-13). */
  reactions: ReactionRule[];
  /**
   * One per kind, in the scenario's order (Red then Blue for `.set` files). A kind with no
   * particles is left out (as DummyMain did), unless a reaction rule can produce it.
   */
  species: ParticleSpecies[];

  // Run state and statistics
  paused: boolean;
  /** As written in the file, e.g. `1x`. */
  simulationSpeed: string;
  pressureAveragingTime: number;
  forgetMultiplier: number;
  pressurePredictionMode: 'IDEAL' | 'REAL';
  statName: string;
  statKinds: StatKinds;
  cumulative: boolean;
  width: boolean;
  history: boolean;
  /** Keyed by statistic name, e.g. `INSTANTANEOUS_SPEED`. */
  abscissaLimits: Map<string, AbscissaLimits>;

  // Display
  /** `DARK`, `LIGHT`, ... or `CUSTOM` (see customColors). */
  colorScheme: string;
  customColors?: CustomColors;
  lighting: boolean;
  /** 3D camera angles as written in the file. */
  viewingAngles: [number, number];
  coloringMode: string;
  /** Whether kinds' markers are drawn (KIND-9). */
  markers: boolean;
  traceMode: boolean;
  tracePointSize: number;
}

/** A drawn wall: its shape for the simulation, plus its kind and style for display. */
export interface ResolvedWall extends WallShape {
  id: string;
  kind: WallKindType;
  style: ResolvedWallStyle;
}

export interface ResolveOptions {
  /** Source of uniform [0, 1) numbers for random placement and directions. */
  random?: () => number;
}

const ARENA_TYPES: Record<Boundary, ArenaType> = {
  PERIODIC: ArenaType.PERIODIC_BOUNDARIES,
  REFLECTING: ArenaType.REFLECTING_BOUNDARIES,
  DIVIDED: ArenaType.DIVIDED_ARENA,
  HOLE: ArenaType.DIVIDED_ARENA_WITH_HOLE,
  PISTON: ArenaType.MOVABLE_PISTON,
};

const nmToM = (nm: number) => convert('nm', 'm', nm);

/** Builds the simulation's starting state from a validated scenario. */
export function resolveScenario(
  scenario: Scenario,
  { random = Math.random }: ResolveOptions = {},
): ResolvedScenario {
  const { arena: a, modes, run, statistics: st, display, kinds } = scenario;
  const arena = { x: nmToM(a.size[0]), y: nmToM(a.size[1]), z: nmToM(a.size[2]) };
  const colors = display.customColors;
  const wallNames = ['left', 'right', 'top', 'bottom', 'front', 'back'] as const;
  const rules = scenario.reactions.filter((r) => r.enabled);
  const kindColor = (index: number) => {
    const kind = kinds[index];
    return kind?.color !== undefined
      ? parseHexColor(kind.color)
      : (paletteColor(display.palette, index) ?? 0xffffff);
  };

  const species = resolveSpecies(scenario, rules, kindColor, arena, random);
  const speciesIndex = new Map(species.map((s, i) => [s.kindId, i]));
  // Kinds left out (no particles, no reaction makes them) can't be shown; -1 drops them.
  const speciesOf = (kind: string) => speciesIndex.get(kind) ?? -1;
  const shownKinds = (ids: string[]) => ids.map(speciesOf).filter((i) => i >= 0);

  return {
    dimension: a.dimensions,
    arenaType: ARENA_TYPES[a.boundary],
    dividerThermalMode: a.dividerThermalMode,
    arenaXSize: arena.x,
    arenaYSize: arena.y,
    arenaZSize: arena.z,
    holeDiameter: nmToM(Math.round(a.holeSize)),
    maxwellDemonMode: modes.maxwellDemon,
    reactions: rules.map((r) => ({
      reactants: [speciesOf(r.reactants[0]), speciesOf(r.reactants[1])],
      products: [speciesOf(r.products[0]), speciesOf(r.products[1])],
      forward: r.forward,
      reverse: r.reverse,
      suppressReverse: r.suppressReverse,
    })),
    species,
    walls: scenario.walls.map((w) => ({
      id: w.id,
      points: w.points.map(([x, y]) => [nmToM(x), nmToM(y)] as const),
      closed: w.closed,
      kind: w.kind.type,
      physics: wallPhysics(w.kind, speciesOf),
      style: wallStyle(w.kind.type, w.style),
    })),

    paused: run.paused,
    simulationSpeed: run.speed,
    pressureAveragingTime: st.pressureAveragingTime,
    forgetMultiplier: st.forgetTime,
    pressurePredictionMode: st.pressurePredictionMode,
    statName: st.name,
    statKinds: st.kinds === 'all' ? 'all' : shownKinds(st.kinds),
    cumulative: st.cumulative,
    width: st.width,
    history: st.history,
    abscissaLimits: new Map(
      Object.entries(st.abscissaLimits).map(([name, limits]) => {
        const resolved: AbscissaLimits = { species: new Map() };
        if (limits.all) resolved.all = limits.all;
        for (const [kind, range] of Object.entries(limits.kinds)) {
          const index = speciesOf(kind);
          if (index >= 0) resolved.species.set(index, range);
        }
        return [name.toUpperCase(), resolved];
      }),
    ),

    colorScheme: display.colorScheme,
    customColors:
      display.colorScheme === 'CUSTOM' && colors
        ? {
            background: parseHexColor(colors.background),
            divider: parseHexColor(colors.divider),
            walls3D: Object.fromEntries(
              colors.walls3D.map((hex, i) => [wallNames[i], parseHexColor(hex)]),
            ),
          }
        : undefined,
    lighting: display.lighting,
    viewingAngles: display.viewingAngles,
    coloringMode: display.coloringMode,
    markers: display.markers,
    traceMode: display.traceMode,
    tracePointSize: display.tracePointSize,
  };
}

/** A wall's kind (WALL-4) as the simulation takes it: SI units, species indices. */
function wallPhysics(kind: WallKind, speciesOf: (kind: string) => number): WallPhysics {
  switch (kind.type) {
    case 'reflecting':
      return { type: 'reflecting' };
    case 'thermal':
      return { type: 'thermal', temperature: kind.temperature };
    case 'semipermeable':
      // Kinds with no particles (and no reaction making them) can't be there to pass.
      return { type: 'semipermeable', passes: kind.passes.map(speciesOf).filter((t) => t >= 0) };
    case 'gate':
      return { type: 'gate', open: kind.open };
    case 'attractive':
      return { type: 'attractive', depth: kind.depth, width: nmToM(kind.width) };
  }
}

interface SpeciesBuilder {
  type: ParticleType;
  initialTemperature: number;
  positions: number[][];
  velocities: number[][];
}

function resolveSpecies(
  scenario: Scenario,
  rules: Scenario['reactions'],
  kindColor: (index: number) => number,
  arena: { x: number; y: number; z: number },
  random: () => number,
): ParticleSpecies[] {
  const dimension = scenario.arena.dimensions;
  const builders = new Map<string, SpeciesBuilder>(
    scenario.kinds.map((kind: Kind, index) => [
      kind.id,
      {
        type: new ParticleType(kind.mass, nmToM(kind.radius), kindColor(index), kind.name),
        initialTemperature: NaN,
        positions: [],
        velocities: [],
      },
    ]),
  );

  const kindIndex = new Map(scenario.kinds.map((k, i) => [k.id, i]));
  const placer =
    scenario.walls.length > 0 || scenario.spawnRegions.length > 0
      ? new Placer(scenario, builders, arena, random)
      : null;
  for (const population of scenario.populations) {
    const side = randomSide(scenario.arena.boundary, kindIndex.get(population.kind)!, arena.x);
    const species = builders.get(population.kind)!;
    const place = placer?.forPopulation(population, side, species.type.displayName);
    placePopulation(population, species, dimension, arena, side, random, place);
  }

  const reacting = new Set(rules.flatMap((r) => [...r.reactants, ...r.products]));
  return [...builders.entries()]
    .filter(([id, s]) => s.positions.length > 0 || reacting.has(id))
    .map(([kindId, s]) => ({
      kindId,
      marker: MARKERS[kindIndex.get(kindId)!]!,
      type: s.type,
      initialTemperature: s.initialTemperature,
      positions: Float64Array.from(s.positions.flat()),
      velocities: Float64Array.from(s.velocities.flat()),
    }));
}

/**
 * Places one population's particles, in the order (and with the random draws) Java used,
 * or with `place` for the randomly placed ones in scenarios with walls or spawn regions.
 */
function placePopulation(
  population: Population,
  species: SpeciesBuilder,
  dimension: Dimension,
  arena: { x: number; y: number; z: number },
  side: { min: number; max: number } | undefined,
  random: () => number,
  place?: (radius: number, placed: number, total: number) => number[],
): void {
  const radius = species.type.particleRadius;
  const firstInGroup = species.velocities.length;
  const total = population.randomlyPlaced.reduce((n, b) => n + b.count, 0);
  let placed = 0;

  for (const block of population.randomlyPlaced) {
    for (let i = 0; i < block.count; i++) {
      species.positions.push(
        place
          ? place(radius, placed++, total)
          : [
              side
                ? random() * (side.max - side.min - 2 * radius) + side.min + radius
                : random() * (arena.x - 2 * radius) + radius,
              random() * (arena.y - 2 * radius) + radius,
              random() * (arena.z - 2 * radius) + radius,
            ],
      );
      species.velocities.push(randomVelocity(block.averageVelocity, dimension, random));
    }
  }

  for (const p of population.particles) {
    species.positions.push(p.position.map(nmToM));
    species.velocities.push(
      p.angle
        ? velocityFromAngles(p.speed, p.angle[0], p.angle[1], dimension)
        : randomVelocity(p.speed, dimension, random),
    );
  }

  if (population.temperature !== undefined) {
    scaleVelocitiesToTemperature(
      species.velocities.slice(firstInGroup),
      species.type,
      population.temperature,
      dimension,
      random,
    );
    species.initialTemperature = population.temperature;
  }
}

/**
 * Where randomly placed particles go along x in a divided arena (FILE-3), as the Java app's
 * settings dialog does it (SimSettingsController.randomlyPlaceParticles): the first kind (red)
 * on the left and the others (blue) on the right of a closed divider, everything on the left
 * of one with a hole so it can leak through. Undefined means the whole width.
 */
function randomSide(
  boundary: Boundary,
  kindIndex: number,
  width: number,
): { min: number; max: number } | undefined {
  const left = { min: 0, max: width / 2 - ARENA_DIVIDER_RADIUS };
  if (boundary === 'HOLE') return left;
  if (boundary !== 'DIVIDED') return undefined;
  return kindIndex === 0 ? left : { min: width / 2 + ARENA_DIVIDER_RADIUS, max: width };
}

/** theta is the azimuth, phi the polar angle; 1D keeps only the sign of cos(theta). */
function velocityFromAngles(
  speed: number,
  theta: number,
  phi: number,
  dimension: Dimension,
): number[] {
  if (dimension === 1) return [Math.cos(theta) < 0.0 ? -speed : speed, 0, 0];
  if (dimension === 2) return [Math.cos(theta) * speed, Math.sin(theta) * speed, 0];
  return [
    Math.sin(phi) * Math.cos(theta) * speed,
    Math.sin(phi) * Math.sin(theta) * speed,
    Math.cos(phi) * speed,
  ];
}

/** Uniformly random direction (uniform on the sphere in 3D). */
function randomVelocity(speed: number, dimension: Dimension, random: () => number): number[] {
  const theta = random() * 2.0 * Math.PI;
  const phi = Math.acos(1 - 2 * random());
  return velocityFromAngles(speed, theta, phi, dimension);
}

/** Combined kinetic energy in J; velocities in m/s, mass from the particle type in amu. */
export function calculateTotalKE(type: ParticleType, velocities: number[][]): number {
  let totalSpeedSquared = 0.0;
  for (const [vx = 0, vy = 0, vz = 0] of velocities)
    totalSpeedSquared += vx * vx + vy * vy + vz * vz;
  return convert(Energy.AMU_JOULE, Energy.JOULE, 0.5 * totalSpeedSquared * type.particleMass);
}

/** Rescales a group's velocities in place so its mean kinetic energy matches `temperature`. */
function scaleVelocitiesToTemperature(
  velocities: number[][],
  type: ParticleType,
  temperature: number,
  dimension: Dimension,
  random: () => number,
): void {
  if (velocities.length === 0) return;
  const targetEnergy = avgKineticEnergy(temperature, dimension) * velocities.length;
  const currentEnergy = calculateTotalKE(type, velocities);
  if (currentEnergy > 0.0) {
    const factor = Math.sqrt(targetEnergy / currentEnergy);
    for (const v of velocities)
      for (let axis = 0; axis < v.length; axis++) v[axis] = (v[axis] ?? 0) * factor;
  } else {
    const speed =
      targetEnergy > 0.0
        ? speedFromEnergy(
            avgKineticEnergy(temperature, dimension),
            convert('amu', 'kg', type.particleMass),
          )
        : 0;
    for (const v of velocities) v.splice(0, 3, ...randomVelocity(speed, dimension, random));
  }
}

/** Attempts at a random spot per particle before a region counts as full (EDIT-6). */
const PLACEMENT_ATTEMPTS = 2000;

/**
 * Places particles uniformly at random in a spawn region or the arena (EDIT-3): the whole
 * disc inside the shape, clear of drawn walls and the divider, and not overlapping any
 * particle placed before (explicitly placed ones count from the start).
 */
class Placer {
  /** Placed particles: x, y, radius (m). */
  private readonly placed: number[] = [];
  /** Wall segments as x1, y1, x2, y2 (m). */
  private readonly segments: number[] = [];
  private readonly regions: Map<string, { name: string; points: [number, number][] }>;
  private readonly dividerX: number | null;

  constructor(
    private readonly scenario: Scenario,
    builders: Map<string, SpeciesBuilder>,
    private readonly arena: { x: number; y: number },
    private readonly random: () => number,
  ) {
    for (const wall of scenario.walls) {
      const pts = wall.points;
      const count = wall.closed ? pts.length : pts.length - 1;
      for (let k = 0; k < count; k++) {
        const [x1, y1] = pts[k]!;
        const [x2, y2] = pts[(k + 1) % pts.length]!;
        this.segments.push(nmToM(x1), nmToM(y1), nmToM(x2), nmToM(y2));
      }
    }
    this.regions = new Map(
      scenario.spawnRegions.map((r, i) => {
        const shape = r.shape;
        const nm: [number, number][] =
          shape.type === 'rectangle'
            ? [shape.min, [shape.max[0], shape.min[1]], shape.max, [shape.min[0], shape.max[1]]]
            : shape.points;
        const points = nm.map(([x, y]) => [nmToM(x), nmToM(y)] as [number, number]);
        return [r.id, { name: r.name ?? `region ${i + 1}`, points }];
      }),
    );
    const boundary = scenario.arena.boundary;
    this.dividerX = boundary === 'DIVIDED' || boundary === 'HOLE' ? arena.x / 2 : null;
    for (const population of scenario.populations) {
      const radius = builders.get(population.kind)!.type.particleRadius;
      for (const p of population.particles) {
        this.placed.push(nmToM(p.position[0]), nmToM(p.position[1]), radius);
      }
    }
  }

  /** The placement function for one population's randomly placed particles. */
  forPopulation(
    population: Population,
    side: { min: number; max: number } | undefined,
    kindName: string,
  ): (radius: number, placed: number, total: number) => number[] {
    const region =
      population.region !== undefined ? this.regions.get(population.region) : undefined;
    const xMin = side?.min ?? 0;
    const xMax = side?.max ?? this.arena.x;
    const shape = region?.points ?? [
      [xMin, 0],
      [xMax, 0],
      [xMax, this.arena.y],
      [xMin, this.arena.y],
    ];
    const where = region ? `spawn region ${region.name}` : 'the arena';
    return (radius, placed, total) => {
      const spot = this.place(shape, radius);
      if (!spot) {
        throw new ScenarioError([
          `Only ${placed} of ${total} ${kindName} particles fit in ${where} without overlapping`,
        ]);
      }
      return spot;
    };
  }

  private place(shape: [number, number][], radius: number): number[] | null {
    let xLo = Infinity;
    let xHi = -Infinity;
    let yLo = Infinity;
    let yHi = -Infinity;
    for (const [x, y] of shape) {
      xLo = Math.min(xLo, x);
      xHi = Math.max(xHi, x);
      yLo = Math.min(yLo, y);
      yHi = Math.max(yHi, y);
    }
    // Inside the box walls too.
    xLo = Math.max(xLo, 0) + radius;
    xHi = Math.min(xHi, this.arena.x) - radius;
    yLo = Math.max(yLo, 0) + radius;
    yHi = Math.min(yHi, this.arena.y) - radius;
    if (!(xLo <= xHi && yLo <= yHi)) return null;
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const x = this.random() * (xHi - xLo) + xLo;
      const y = this.random() * (yHi - yLo) + yLo;
      if (this.fits(shape, x, y, radius)) {
        this.placed.push(x, y, radius);
        return [x, y, 0];
      }
    }
    return null;
  }

  private fits(shape: [number, number][], x: number, y: number, radius: number): boolean {
    if (!insidePolygon(shape, x, y)) return false;
    const n = shape.length;
    for (let k = 0; k < n; k++) {
      const [x1, y1] = shape[k]!;
      const [x2, y2] = shape[(k + 1) % n]!;
      if (distanceToSegment(x, y, x1, y1, x2, y2) < radius) return false;
    }
    if (this.dividerX !== null && Math.abs(x - this.dividerX) < ARENA_DIVIDER_RADIUS + radius) {
      return false;
    }
    const s = this.segments;
    for (let k = 0; k < s.length; k += 4) {
      if (distanceToSegment(x, y, s[k]!, s[k + 1]!, s[k + 2]!, s[k + 3]!) < radius) return false;
    }
    const p = this.placed;
    for (let k = 0; k < p.length; k += 3) {
      const reach = radius + p[k + 2]!;
      const dx = x - p[k]!;
      const dy = y - p[k + 1]!;
      if (dx * dx + dy * dy < reach * reach) return false;
    }
    return true;
  }
}

/** Whether (x, y) is inside the polygon (even–odd rule). */
function insidePolygon(points: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
