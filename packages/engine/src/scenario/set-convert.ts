// Converts between `.set` files (Boltzmann 3D's format, read by model/io/Load.java) and the
// JSON scenarios in ./schema.ts, by way of version 1 of the format (./schema-v1.ts), which
// mirrors `.set`. Both directions keep every setting the loader reads, so
// `.set → JSON → .set` loses nothing and the result still loads in the Java app (FILE-6).
// Scenarios the `.set` format can't represent (drawn walls, more kinds, ...) can't be written
// (EDIT-20); setFileCompatibility says why.
import { parseSetFile, SetFileError, type SetGroup } from '../io/set-file';
import { describeIssue, SCENARIO_FORMAT, ScenarioError } from './format';
import { migrateV1, toV1 } from './migrate';
import { ScenarioSchema, type Scenario } from './schema';
import {
  ScenarioV1Schema,
  type ParticleGroupV1,
  type ScenarioV1,
  type ScenarioV1Input,
} from './schema-v1';

export interface SetConversion {
  scenario: Scenario;
  /** Header version, e.g. `V2.43`. */
  version: string;
  /** Non-fatal problems worth showing the user. */
  warnings: string[];
}

/** The header version written to `.set` files: the last Boltzmann 3D release. */
export const SET_FILE_VERSION = 'V2.43';

/** Reads a `.set` file into a validated scenario. Throws SetFileError on any problem. */
export function setFileToScenario(text: string): SetConversion {
  const file = parseSetFile(text);
  const warnings: string[] = [];
  if (file.formatName.toLowerCase() !== 'boltzmann3d') {
    warnings.push('Missing Boltzmann3D header; this may not be a scenario file.');
  }

  const gs = file.root.group('GlobalSettings');
  const upper = (property: string) => gs.string(property).toUpperCase();
  const colorSchemeValues = gs.values('color_scheme');
  const colorScheme = (colorSchemeValues[0] ?? '').toUpperCase().replace(/:$/, '');

  const input: ScenarioV1Input = {
    format: SCENARIO_FORMAT,
    version: 1,
    arena: {
      dimensions: gs.number('dimensions') as 1 | 2 | 3,
      size: [gs.number('size', 0), gs.number('size', 1), gs.number('size', 2)],
      boundary: upper('boundary') as ScenarioV1['arena']['boundary'],
      holeSize: gs.number('hole_size'),
      ...(gs.has('divider_thermal_mode') && {
        dividerThermalMode: upper(
          'divider_thermal_mode',
        ) as ScenarioV1['arena']['dividerThermalMode'],
      }),
      ...(gs.has('piston_speed') && { pistonSpeed: gs.number('piston_speed') }),
    },
    modes: {
      maxwellDemon: gs.boolean('maxwell_demon_mode'),
      reaction: gs.boolean('reaction_mode'),
    },
    particleGroups: file.root.groups('ParticleGroup').map(readParticleGroup),
    run: {
      paused: gs.boolean('paused'),
      speed: gs.string('simulation_speed'),
    },
    statistics: {
      name: gs.string('stat_name'),
      color: upper('stat_color') as ScenarioV1['statistics']['color'],
      cumulative: gs.boolean('cumulative'),
      width: gs.boolean('width'),
      history: gs.boolean('history'),
      pressureAveragingTime: gs.number('pressure_averaging_time'),
      forgetTime: gs.number('forget_time'),
      pressurePredictionMode: upper(
        'pressure_prediction_mode',
      ) as ScenarioV1['statistics']['pressurePredictionMode'],
      abscissaLimits: readAbscissaLimits(file.root.optionalGroup('AbscissaLimits')),
    },
    display: {
      colorScheme,
      ...(colorScheme === 'CUSTOM' && { customColors: readCustomColors(colorSchemeValues) }),
      lighting: gs.boolean('lighting'),
      viewingAngles: [gs.number('3d_viewing_angles', 0), gs.number('3d_viewing_angles', 1)],
      coloringMode: upper('coloring_mode'),
      traceMode: gs.boolean('trace_mode'),
      tracePointSize: gs.number('trace_point_size'),
    },
  };

  const v1 = ScenarioV1Schema.safeParse(input);
  if (!v1.success) throw new SetFileError(v1.error.issues.map(describeIssue).join('\n'));
  warnings.push(...redefinedTypes(v1.data));
  const v2 = ScenarioSchema.safeParse(migrateV1(v1.data));
  if (!v2.success) throw new SetFileError(v2.error.issues.map(describeIssue).join('\n'));
  return { scenario: v2.data, version: file.version, warnings };
}

/**
 * In `.set` files a later group of a colour redefines that colour's mass and radius for all of
 * its particles; scenarios give each kind one mass and radius, the last group's.
 */
function redefinedTypes(v1: ScenarioV1): string[] {
  return (['RED', 'BLUE'] as const).flatMap((color) => {
    const groups = v1.particleGroups.filter((g) => g.color === color);
    const last = groups.at(-1);
    const differs = groups.some((g) => g.mass !== last?.mass || g.radius !== last.radius);
    return differs
      ? [
          `${color === 'RED' ? 'Red' : 'Blue'} particle groups have different masses or radii; all use the last group's (${last?.mass} amu, ${last?.radius} nm).`,
        ]
      : [];
  });
}

/** Whether a scenario can be written as `.set` (EDIT-20). */
export function setFileCompatibility(scenario: Scenario): {
  /** Why it can't; empty when it can. */
  problems: string[];
  /** Settings a `.set` file would lose. */
  warnings: string[];
} {
  const { problems, warnings } = toV1(scenario);
  return { problems, warnings };
}

function readParticleGroup(pg: SetGroup): ScenarioV1Input['particleGroups'][number] {
  return {
    color: pg.string('color').toUpperCase() as ParticleGroupV1['color'],
    mass: pg.number('mass'),
    radius: pg.number('radius'),
    ...(pg.has('temperature') && { temperature: pg.number('temperature') }),
    randomlyPlaced: pg.groups('RandomlyPlaced').map((g) => ({
      // Load.java truncates the count to an int.
      count: Math.trunc(g.number('count')),
      averageVelocity: g.number('average_velocity'),
    })),
    particles: pg.groups('Particle').map((p) => ({
      position: [p.number('position', 0), p.number('position', 1), p.number('position', 2)],
      speed: p.number('speed'),
      ...(p.has('angle') && { angle: [p.number('angle', 0), p.number('angle', 1)] }),
    })),
  };
}

function readAbscissaLimits(
  group: SetGroup | undefined,
): ScenarioV1['statistics']['abscissaLimits'] {
  const limits: ScenarioV1['statistics']['abscissaLimits'] = {};
  for (const st of group?.groups('StatLimits') ?? []) {
    const entry: ScenarioV1['statistics']['abscissaLimits'][string] = {};
    for (const key of ['both', 'red', 'blue'] as const) {
      const property = `${key}_limits`;
      // `+ 0` turns the files' `-0.00000` into 0, which JSON can represent (-0 it can't).
      if (st.has(property)) entry[key] = [st.number(property, 0) + 0, st.number(property, 1) + 0];
    }
    limits[st.string('name').toUpperCase()] = entry;
  }
  return limits;
}

/** `color_scheme CUSTOM: red blue background divider [left right top bottom front back]`. */
function readCustomColors(values: string[]): NonNullable<ScenarioV1['display']['customColors']> {
  const colors = values
    .slice(1)
    .join(' ')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((word) => toHex(decodeColor(word)));
  const [red, blue, background, divider, ...walls3D] = colors;
  if (divider === undefined) {
    throw new SetFileError(
      'color_scheme CUSTOM: needs at least red, blue, background and divider colours',
    );
  }
  return {
    red: red ?? '#000000',
    blue: blue ?? '#000000',
    background: background ?? '#000000',
    divider,
    walls3D,
  };
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

const toHex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;

/**
 * A number as Java's US NumberFormat parses it back exactly: shortest round-trip digits, with
 * an upper-case `E` and no `+` in the exponent (NumberFormat stops reading at `e` or `+`).
 */
function formatNumber(value: number): string {
  if (Object.is(value, -0)) return '-0';
  return String(value).replace('e+', 'e').toUpperCase();
}

const formatBoolean = (value: boolean) => (value ? 'TRUE' : 'FALSE');
const colorName = (color: ParticleGroupV1['color']) => (color === 'RED' ? 'Red' : 'Blue');

/**
 * Writes a scenario as a `.set` file in the layout of the bundled presets. Throws a
 * ScenarioError when the `.set` format can't represent it (see setFileCompatibility).
 */
export function scenarioToSetFile(scenario: Scenario): string {
  const { scenario: v1, problems } = toV1(scenario);
  if (!v1) throw new ScenarioError(problems.map((p) => `Can't save as .set: ${p}`));
  return writeSetFile(ScenarioV1Schema.parse(v1));
}

function writeSetFile(scenario: ScenarioV1): string {
  const lines: string[] = [`#Boltzmann3D ${SET_FILE_VERSION}`, ''];
  let depth = 0;
  const line = (text: string) => lines.push(`${'  '.repeat(depth)}${text}`);
  const property = (name: string, ...values: (string | number | boolean)[]) =>
    line(
      [
        name,
        ...values.map((v) =>
          typeof v === 'number' ? formatNumber(v) : typeof v === 'boolean' ? formatBoolean(v) : v,
        ),
      ].join(' '),
    );
  const group = (name: string, body: () => void, blankLineInside = false) => {
    line(`${name} {`);
    depth++;
    if (blankLineInside) lines.push('');
    body();
    if (lines.at(-1) === '') lines.pop();
    depth--;
    line('}');
    lines.push('');
  };

  const { arena, modes, run, statistics, display } = scenario;
  group('GlobalSettings', () => {
    property('size', ...arena.size);
    property('dimensions', arena.dimensions);
    property('hole_size', arena.holeSize);
    if (arena.pistonSpeed !== undefined) property('piston_speed', arena.pistonSpeed);
    property('pressure_averaging_time', statistics.pressureAveragingTime);
    property('boundary', arena.boundary);
    property('divider_thermal_mode', arena.dividerThermalMode);
    const colors = display.customColors;
    if (display.colorScheme === 'CUSTOM' && colors) {
      const all = [colors.red, colors.blue, colors.background, colors.divider, ...colors.walls3D];
      property('color_scheme', 'CUSTOM:', ...all.map((hex) => `0x${hex.slice(1)}`));
    } else {
      property('color_scheme', display.colorScheme);
    }
    property('forget_time', statistics.forgetTime);
    property('lighting', display.lighting);
    property('stat_name', statistics.name);
    property('stat_color', statistics.color);
    property('cumulative', statistics.cumulative);
    property('width', statistics.width);
    property('history', statistics.history);
    property('simulation_speed', run.speed);
    property('paused', run.paused);
    property('pressure_prediction_mode', statistics.pressurePredictionMode);
    property('3d_viewing_angles', ...display.viewingAngles);
    property('coloring_mode', display.coloringMode);
    property('trace_point_size', display.tracePointSize);
    property('maxwell_demon_mode', modes.maxwellDemon);
    property('reaction_mode', modes.reaction);
    property('trace_mode', display.traceMode);
  });

  const limits = Object.entries(statistics.abscissaLimits);
  if (limits.length > 0) {
    group(
      'AbscissaLimits',
      () => {
        for (const [name, entry] of limits) {
          group('StatLimits', () => {
            property('name', name);
            for (const key of ['both', 'red', 'blue'] as const) {
              const range = entry[key];
              if (range) property(`${key}_limits`, ...range);
            }
          });
        }
      },
      true,
    );
  }

  for (const pg of scenario.particleGroups) {
    group('ParticleGroup', () => {
      property('color', colorName(pg.color));
      property('radius', pg.radius);
      property('mass', pg.mass);
      if (pg.temperature !== undefined) property('temperature', pg.temperature);
      if (pg.randomlyPlaced.length + pg.particles.length > 0) lines.push('');
      for (const block of pg.randomlyPlaced) {
        group('RandomlyPlaced', () => {
          property('count', block.count);
          property('average_velocity', block.averageVelocity);
        });
      }
      for (const p of pg.particles) {
        group('Particle', () => {
          property('position', ...p.position);
          if (p.angle) property('angle', ...p.angle);
          property('speed', p.speed);
        });
      }
    });
  }

  // One trailing newline, CRLF-free.
  while (lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}\n`;
}
