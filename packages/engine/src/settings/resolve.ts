// Turns validated settings (./schema.ts) into the SimulationSettings the simulation runs:
// unit conversion to SI, randomly placed particles, and temperature scaling. Based on
// model/io/Load.java (loadNewSetFile), with these deliberate differences:
// - Settings that Java read and then discarded (paused, speed, statistic choice, abscissa
//   limits, colour scheme, ...) are kept, so the UI can use them.
// - maxwell_demon_mode is honoured; Java parsed it but never passed it on.
// The physics-relevant results (arena size, hole diameter, particle types, positions,
// velocities and temperature scaling) follow Java exactly, including the order in which
// random numbers are drawn.
import { ParticleType, DefaultParticleInfo } from '../sim/particle-type';
import { ArenaType } from '../sim/simulation-info';
import type { DividerThermalMode } from '../sim/simulation-info';
import { avgKineticEnergy, speed as speedFromEnergy } from '../stats/formulas';
import { convert, Energy } from '../utils/units';
import { parseHexColor } from './set-convert';
import type { Boundary, ParticleGroup, Settings } from './schema';

export type Dimension = 1 | 2 | 3;
export type StatColor = 'RED' | 'BLUE' | 'BOTH';

/** One particle type and all its particles. Vectors are stored flat, 3 components each. */
export interface ParticleSpecies {
  type: ParticleType;
  /** Initial temperature in K requested by the file, or NaN to infer it from the velocities. */
  initialTemperature: number;
  /** x, y, z per particle, in meters. */
  positions: Float64Array;
  /** x, y, z per particle, in m/s. */
  velocities: Float64Array;
}

export interface AbscissaLimits {
  both?: [number, number];
  red?: [number, number];
  blue?: [number, number];
}

/** Colours as 0xRRGGBB, from `color_scheme CUSTOM: ...`. */
export interface CustomColors {
  red: number;
  blue: number;
  background: number;
  divider: number;
  /** Arena wall colours for 3D views, when the file gives all six or some of them. */
  walls3D: Partial<Record<'left' | 'right' | 'top' | 'bottom' | 'front' | 'back', number>>;
}

export interface SimulationSettings {
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
  reactionMode: boolean;
  /** Red first, then Blue; a colour with no particles is left out (as DummyMain did). */
  species: ParticleSpecies[];

  // Run state and statistics
  paused: boolean;
  /** As written in the file, e.g. `1x`. */
  simulationSpeed: string;
  pressureAveragingTime: number;
  forgetMultiplier: number;
  pressurePredictionMode: 'IDEAL' | 'REAL';
  statName: string;
  statColor: StatColor;
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
  traceMode: boolean;
  tracePointSize: number;
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

/** Builds the simulation's starting state from validated settings. */
export function resolveSettings(
  settings: Settings,
  { random = Math.random }: ResolveOptions = {},
): SimulationSettings {
  const { arena: a, modes, run, statistics: st, display } = settings;
  const arena = { x: nmToM(a.size[0]), y: nmToM(a.size[1]), z: nmToM(a.size[2]) };
  const colors = display.customColors;
  const wallNames = ['left', 'right', 'top', 'bottom', 'front', 'back'] as const;

  return {
    dimension: a.dimensions,
    arenaType: ARENA_TYPES[a.boundary],
    dividerThermalMode: a.dividerThermalMode,
    arenaXSize: arena.x,
    arenaYSize: arena.y,
    arenaZSize: arena.z,
    holeDiameter: nmToM(Math.round(a.holeSize)),
    maxwellDemonMode: modes.maxwellDemon,
    reactionMode: modes.reaction,
    species: resolveSpecies(settings.particleGroups, a.dimensions, arena, random),

    paused: run.paused,
    simulationSpeed: run.speed,
    pressureAveragingTime: st.pressureAveragingTime,
    forgetMultiplier: st.forgetTime,
    pressurePredictionMode: st.pressurePredictionMode,
    statName: st.name,
    statColor: st.color,
    cumulative: st.cumulative,
    width: st.width,
    history: st.history,
    abscissaLimits: new Map(
      Object.entries(st.abscissaLimits).map(([name, limits]) => [name.toUpperCase(), limits]),
    ),

    colorScheme: display.colorScheme,
    customColors:
      display.colorScheme === 'CUSTOM' && colors
        ? {
            red: parseHexColor(colors.red),
            blue: parseHexColor(colors.blue),
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
    traceMode: display.traceMode,
    tracePointSize: display.tracePointSize,
  };
}

interface SpeciesBuilder {
  type: ParticleType;
  initialTemperature: number;
  positions: number[][];
  velocities: number[][];
}

function resolveSpecies(
  groups: ParticleGroup[],
  dimension: Dimension,
  arena: { x: number; y: number; z: number },
  random: () => number,
): ParticleSpecies[] {
  const red: SpeciesBuilder = {
    type: new ParticleType(2.0, 1.0e-9, DefaultParticleInfo.RED, 'Red'),
    initialTemperature: NaN,
    positions: [],
    velocities: [],
  };
  const blue: SpeciesBuilder = {
    type: new ParticleType(2.0, 1.0e-9, DefaultParticleInfo.BLUE, 'Blue'),
    initialTemperature: NaN,
    positions: [],
    velocities: [],
  };

  for (const pg of groups) {
    const species = pg.color === 'RED' ? red : blue;
    const radius = nmToM(pg.radius);
    // As in Java, a later group of the same colour redefines that colour's mass and radius.
    species.type = new ParticleType(
      pg.mass,
      radius,
      species.type.defaultColor,
      species.type.displayName,
    );
    const firstInGroup = species.velocities.length;

    for (const block of pg.randomlyPlaced) {
      for (let i = 0; i < block.count; i++) {
        species.positions.push([
          random() * (arena.x - 2 * radius) + radius,
          random() * (arena.y - 2 * radius) + radius,
          random() * (arena.z - 2 * radius) + radius,
        ]);
        species.velocities.push(randomVelocity(block.averageVelocity, dimension, random));
      }
    }

    for (const p of pg.particles) {
      species.positions.push(p.position.map(nmToM));
      species.velocities.push(
        p.angle
          ? velocityFromAngles(p.speed, p.angle[0], p.angle[1], dimension)
          : randomVelocity(p.speed, dimension, random),
      );
    }

    if (pg.temperature !== undefined) {
      scaleVelocitiesToTemperature(
        species.velocities.slice(firstInGroup),
        species.type,
        pg.temperature,
        dimension,
        random,
      );
      species.initialTemperature = pg.temperature;
    }
  }

  return [red, blue]
    .filter((s) => s.positions.length > 0)
    .map((s) => ({
      type: s.type,
      initialTemperature: s.initialTemperature,
      positions: Float64Array.from(s.positions.flat()),
      velocities: Float64Array.from(s.velocities.flat()),
    }));
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
