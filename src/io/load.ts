// Turns a `.set` file into SimulationSettings. Based on model/io/Load.java (loadNewSetFile),
// with these deliberate differences:
// - Settings that Java read and then discarded (paused, speed, statistic choice, abscissa
//   limits, colour scheme, ...) are kept, so the UI can use them.
// - maxwell_demon_mode is honoured; Java parsed it but never passed it on.
// - Particle colours are case-insensitive, and unknown colours or dimensions are errors
//   instead of being silently treated as Red or left unset.
// The physics-relevant results (arena size, hole diameter, particle types, positions,
// velocities and temperature scaling) follow Java exactly.
import { ParticleType, DefaultParticleInfo } from '../sim/particle-type';
import { ArenaType, DividerThermalMode, MAXIMUM_INITIAL_TEMPERATURE } from '../sim/simulation-info';
import { avgKineticEnergy, speed as speedFromEnergy } from '../stats/formulas';
import { convert, Energy } from '../utils/units';
import { parseSetFile, SetFileError, type SetGroup } from './set-file';

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

export interface LoadResult {
  settings: SimulationSettings;
  /** Header version, e.g. `V2.43`. */
  version: string;
  /** Non-fatal problems worth showing the user. */
  warnings: string[];
}

export interface LoadOptions {
  /** Source of uniform [0, 1) numbers for random placement and directions. */
  random?: () => number;
}

const BOUNDARIES: Record<string, ArenaType> = {
  PERIODIC: ArenaType.PERIODIC_BOUNDARIES,
  REFLECTING: ArenaType.REFLECTING_BOUNDARIES,
  DIVIDED: ArenaType.DIVIDED_ARENA,
  HOLE: ArenaType.DIVIDED_ARENA_WITH_HOLE,
  PISTON: ArenaType.MOVABLE_PISTON,
};

const nmToM = (nm: number) => convert('nm', 'm', nm);

export function loadSettings(text: string, { random = Math.random }: LoadOptions = {}): LoadResult {
  const file = parseSetFile(text);
  const warnings: string[] = [];
  if (file.formatName.toLowerCase() !== 'boltzmann3d') {
    warnings.push('Missing Boltzmann3D header; this may not be a settings file.');
  }

  const gs = file.root.group('GlobalSettings');

  const dimension = gs.number('dimensions');
  if (dimension !== 1 && dimension !== 2 && dimension !== 3) {
    throw new SetFileError(`GlobalSettings.dimensions must be 1, 2 or 3, not ${dimension}`);
  }

  const boundary = gs.string('boundary').toUpperCase();
  const arenaType = BOUNDARIES[boundary];
  if (!arenaType) throw new SetFileError(`Unknown boundary mode: ${boundary}`);

  let dividerThermalMode: DividerThermalMode = DividerThermalMode.INSULATING;
  if (gs.has('divider_thermal_mode')) {
    const mode = gs.string('divider_thermal_mode').toUpperCase();
    if (!(mode in DividerThermalMode)) {
      throw new SetFileError(`Unknown divider thermal mode: ${mode}`);
    }
    dividerThermalMode = mode as DividerThermalMode;
  }

  const statColor = gs.string('stat_color').toUpperCase();
  if (statColor !== 'RED' && statColor !== 'BLUE' && statColor !== 'BOTH') {
    throw new SetFileError(`Unknown stat_color: ${statColor}`);
  }

  const pressurePredictionMode = gs.string('pressure_prediction_mode').toUpperCase();
  if (pressurePredictionMode !== 'IDEAL' && pressurePredictionMode !== 'REAL') {
    throw new SetFileError(`Unknown pressure_prediction_mode: ${pressurePredictionMode}`);
  }

  const colorSchemeValues = gs.values('color_scheme');
  const colorScheme = (colorSchemeValues[0] ?? '').toUpperCase().replace(/:$/, '');

  const arena = {
    x: nmToM(gs.number('size', 0)),
    y: nmToM(gs.number('size', 1)),
    z: nmToM(gs.number('size', 2)),
  };

  const settings: SimulationSettings = {
    dimension,
    arenaType,
    dividerThermalMode,
    arenaXSize: arena.x,
    arenaYSize: arena.y,
    arenaZSize: arena.z,
    holeDiameter: nmToM(Math.round(gs.number('hole_size'))),
    maxwellDemonMode: gs.boolean('maxwell_demon_mode'),
    reactionMode: gs.boolean('reaction_mode'),
    species: loadSpecies(file.root.groups('ParticleGroup'), dimension, arena, random),

    paused: gs.boolean('paused'),
    simulationSpeed: gs.string('simulation_speed'),
    pressureAveragingTime: gs.number('pressure_averaging_time'),
    forgetMultiplier: gs.number('forget_time'),
    pressurePredictionMode,
    statName: gs.string('stat_name'),
    statColor,
    cumulative: gs.boolean('cumulative'),
    width: gs.boolean('width'),
    history: gs.boolean('history'),
    abscissaLimits: loadAbscissaLimits(file.root.optionalGroup('AbscissaLimits')),

    colorScheme,
    customColors: colorScheme === 'CUSTOM' ? loadCustomColors(colorSchemeValues) : undefined,
    lighting: gs.boolean('lighting'),
    viewingAngles: [gs.number('3d_viewing_angles', 0), gs.number('3d_viewing_angles', 1)],
    coloringMode: gs.string('coloring_mode').toUpperCase(),
    traceMode: gs.boolean('trace_mode'),
    tracePointSize: gs.number('trace_point_size'),
  };

  return { settings, version: file.version, warnings };
}

interface SpeciesBuilder {
  type: ParticleType;
  initialTemperature: number;
  positions: number[][];
  velocities: number[][];
}

function loadSpecies(
  groups: SetGroup[],
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
    const color = pg.string('color').toLowerCase();
    if (color !== 'red' && color !== 'blue') {
      throw new SetFileError(`ParticleGroup.color must be Red or Blue, not ${pg.string('color')}`);
    }
    const species = color === 'red' ? red : blue;
    const radius = nmToM(pg.number('radius'));
    // As in Java, a later group of the same colour redefines that colour's mass and radius.
    species.type = new ParticleType(
      pg.number('mass'),
      radius,
      species.type.defaultColor,
      species.type.displayName,
    );
    const firstInGroup = species.velocities.length;

    for (const g of pg.groups('RandomlyPlaced')) {
      const count = Math.trunc(g.number('count'));
      const speed = g.number('average_velocity');
      for (let i = 0; i < count; i++) {
        species.positions.push([
          random() * (arena.x - 2 * radius) + radius,
          random() * (arena.y - 2 * radius) + radius,
          random() * (arena.z - 2 * radius) + radius,
        ]);
        species.velocities.push(randomVelocity(speed, dimension, random));
      }
    }

    for (const p of pg.groups('Particle')) {
      species.positions.push([
        nmToM(p.number('position', 0)),
        nmToM(p.number('position', 1)),
        nmToM(p.number('position', 2)),
      ]);
      const speed = p.number('speed');
      species.velocities.push(
        p.has('angle')
          ? velocityFromAngles(speed, p.number('angle', 0), p.number('angle', 1), dimension)
          : randomVelocity(speed, dimension, random),
      );
    }

    if (pg.has('temperature')) {
      const temperature = pg.number('temperature');
      if (
        !Number.isFinite(temperature) ||
        temperature < 0 ||
        temperature > MAXIMUM_INITIAL_TEMPERATURE
      ) {
        throw new SetFileError(
          `Particle group temperature must be between 0 and ${MAXIMUM_INITIAL_TEMPERATURE} K`,
        );
      }
      scaleVelocitiesToTemperature(
        species.velocities.slice(firstInGroup),
        species.type,
        temperature,
        dimension,
        random,
      );
      species.initialTemperature = temperature;
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

function loadAbscissaLimits(group: SetGroup | undefined): Map<string, AbscissaLimits> {
  const limits = new Map<string, AbscissaLimits>();
  for (const st of group?.groups('StatLimits') ?? []) {
    const entry: AbscissaLimits = {};
    for (const key of ['both', 'red', 'blue'] as const) {
      const property = `${key}_limits`;
      if (st.has(property)) entry[key] = [st.number(property, 0), st.number(property, 1)];
    }
    limits.set(st.string('name').toUpperCase(), entry);
  }
  return limits;
}

/** `color_scheme CUSTOM: red blue background divider [left right top bottom front back]`. */
function loadCustomColors(values: string[]): CustomColors {
  const colors = values
    .slice(1)
    .join(' ')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(decodeColor);
  const [red, blue, background, divider, ...walls] = colors;
  if (divider === undefined) {
    throw new SetFileError(
      'color_scheme CUSTOM: needs at least red, blue, background and divider colours',
    );
  }
  const wallNames = ['left', 'right', 'top', 'bottom', 'front', 'back'] as const;
  const walls3D: CustomColors['walls3D'] = {};
  wallNames.forEach((name, i) => {
    if (walls[i] !== undefined) walls3D[name] = walls[i];
  });
  return { red: red ?? 0, blue: blue ?? 0, background: background ?? 0, divider, walls3D };
}

/**
 * java.awt.Color.decode: `0xRRGGBB`, octal with a leading 0, or decimal. (`#RRGGBB` is accepted
 * too, but a `#` in a .set file starts a comment, so it never reaches here from a file.)
 */
function decodeColor(word: string): number {
  const match = /^([-+]?)(?:(0x|#)([0-9a-f]+)|(0[0-7]+)|(\d+))$/i.exec(word);
  if (!match) throw new SetFileError(`Invalid colour: ${word}`);
  const [, sign, , hex, octal, decimal] = match;
  const magnitude = hex
    ? parseInt(hex, 16)
    : octal
      ? parseInt(octal, 8)
      : parseInt(decimal ?? '', 10);
  return (sign === '-' ? -magnitude : magnitude) & 0xffffff;
}
