// The web app's settings format: a JSON document describing a simulation before it runs.
//
// It mirrors the `.set` format (see ./set-convert.ts) so the two convert both ways without
// loss: the same sections, the same units (nm, amu, K, m/s), and particles described as
// recipes (randomly placed blocks) plus optional explicitly placed particles. Positions for
// randomly placed particles are generated when the settings are resolved (./resolve.ts).
//
// Enumerated values use the `.set` spelling (`PERIODIC`, `BOTH`, `RED`, ...).
import * as z from 'zod';
import { DividerThermalMode, MAXIMUM_INITIAL_TEMPERATURE } from '../sim/simulation-info';

export const SETTINGS_FORMAT = 'boltzmann4d-settings';
export const SETTINGS_VERSION = 1;

const finite = () => z.number();
const nonNegative = () => z.number().min(0);
const positive = () => z.number().positive();
const vec3 = (item: () => z.ZodNumber) => z.tuple([item(), item(), item()]);
const range = z.tuple([finite(), finite()]);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, {
  error: (issue) => `Colours must look like #RRGGBB, not ${String(issue.input)}`,
});

const oneOf = <const T extends readonly [string, ...string[]]>(what: string, values: T) =>
  z.enum(values, {
    error: (issue) => `Unknown ${what}: ${String(issue.input)} (expected ${values.join(', ')})`,
  });

export const BOUNDARIES = ['PERIODIC', 'REFLECTING', 'DIVIDED', 'HOLE', 'PISTON'] as const;
export type Boundary = (typeof BOUNDARIES)[number];

export const ParticleColorSchema = z.enum(['RED', 'BLUE'], {
  error: (issue) => `Particle group color must be RED or BLUE, not ${String(issue.input)}`,
});

/** Particles of one colour placed uniformly at random, all with the same speed. */
export const RandomlyPlacedSchema = z.object({
  count: z.int().min(0),
  /** Speed of every particle in the block, in m/s; directions are random. */
  averageVelocity: nonNegative(),
});

/** One particle at a given position. */
export const PlacedParticleSchema = z.object({
  /** x, y, z in nm. */
  position: vec3(finite),
  /** m/s. */
  speed: nonNegative(),
  /** [theta, phi] in radians: azimuth and polar angle. Absent means a random direction. */
  angle: z.tuple([finite(), finite()]).optional(),
});

/**
 * A group of particles of one colour. As in `.set` files, a later group of the same colour
 * redefines that colour's mass and radius.
 */
export const ParticleGroupSchema = z.object({
  color: ParticleColorSchema,
  /** amu. */
  mass: positive(),
  /** nm. */
  radius: positive(),
  /** K. When given, the group's velocities are rescaled to this temperature. */
  temperature: z
    .number({
      error: `Particle group temperature must be between 0 and ${MAXIMUM_INITIAL_TEMPERATURE} K`,
    })
    .min(0, `Particle group temperature must be between 0 and ${MAXIMUM_INITIAL_TEMPERATURE} K`)
    .max(
      MAXIMUM_INITIAL_TEMPERATURE,
      `Particle group temperature must be between 0 and ${MAXIMUM_INITIAL_TEMPERATURE} K`,
    )
    .optional(),
  randomlyPlaced: z.array(RandomlyPlacedSchema).default([]),
  particles: z.array(PlacedParticleSchema).default([]),
});

export const AbscissaLimitsSchema = z.object({
  both: range.optional(),
  red: range.optional(),
  blue: range.optional(),
});

export const CustomColorsSchema = z.object({
  red: hexColor,
  blue: hexColor,
  background: hexColor,
  divider: hexColor,
  /** 3D wall colours in the order left, right, top, bottom, front, back (a prefix of them). */
  walls3D: z.array(hexColor).max(6).default([]),
});

export const SettingsSchema = z
  .object({
    format: z.literal(SETTINGS_FORMAT, {
      error: `Not a Boltzmann 4D settings file (format must be "${SETTINGS_FORMAT}")`,
    }),
    version: z.literal(SETTINGS_VERSION, {
      error: `Unsupported settings version (this app reads version ${SETTINGS_VERSION})`,
    }),
    arena: z.object({
      dimensions: z.union([z.literal(1), z.literal(2), z.literal(3)], {
        error: (issue) => `dimensions must be 1, 2 or 3, not ${String(issue.input)}`,
      }),
      /** Side lengths x, y, z in nm. */
      size: vec3(positive),
      boundary: oneOf('boundary mode', BOUNDARIES),
      /** Diameter of the hole in the divider, in nm (rounded to a whole nm when loaded). */
      holeSize: nonNegative(),
      dividerThermalMode: oneOf(
        'divider thermal mode',
        Object.values(DividerThermalMode) as [DividerThermalMode, ...DividerThermalMode[]],
      ).default(DividerThermalMode.INSULATING),
      /** Kept from `.set` files that have it; the simulation doesn't read it yet. */
      pistonSpeed: finite().optional(),
    }),
    modes: z.object({
      maxwellDemon: z.boolean(),
      reaction: z.boolean(),
    }),
    particleGroups: z.array(ParticleGroupSchema),
    run: z.object({
      paused: z.boolean(),
      /** As in `.set` files, e.g. `1x`. */
      speed: z.string().min(1),
    }),
    statistics: z.object({
      /** e.g. `INSTANTANEOUS_SPEED`. */
      name: z.string().min(1),
      color: oneOf('stat_color', ['RED', 'BLUE', 'BOTH']),
      cumulative: z.boolean(),
      width: z.boolean(),
      history: z.boolean(),
      pressureAveragingTime: finite(),
      forgetTime: finite(),
      pressurePredictionMode: oneOf('pressure_prediction_mode', ['IDEAL', 'REAL']),
      /** Keyed by statistic name. */
      abscissaLimits: z.record(z.string(), AbscissaLimitsSchema).default({}),
    }),
    display: z.object({
      /** `DARK`, `LIGHT`, ... or `CUSTOM` (then customColors is required). */
      colorScheme: z.string().min(1),
      customColors: CustomColorsSchema.optional(),
      lighting: z.boolean(),
      /** 3D camera angles in degrees. */
      viewingAngles: z.tuple([finite(), finite()]),
      coloringMode: z.string().min(1),
      traceMode: z.boolean(),
      tracePointSize: finite(),
    }),
  })
  .superRefine((settings, ctx) => {
    if (settings.display.colorScheme === 'CUSTOM' && !settings.display.customColors) {
      ctx.addIssue({
        code: 'custom',
        path: ['display', 'customColors'],
        message: 'colorScheme CUSTOM needs customColors',
      });
    }
  });

/** Settings as written in a file: fields with defaults may be left out. */
export type SettingsInput = z.input<typeof SettingsSchema>;
/** Validated settings, with defaults filled in. */
export type Settings = z.output<typeof SettingsSchema>;
export type ParticleGroup = Settings['particleGroups'][number];
export type ParticleColor = z.output<typeof ParticleColorSchema>;

export class SettingsError extends Error {
  /** One line per problem, each starting with its path in the settings, e.g. `arena.size[0]`. */
  readonly problems: string[];

  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.name = 'SettingsError';
    this.problems = problems;
  }
}

export type ValidationResult =
  { success: true; settings: Settings } | { success: false; problems: string[] };

/** Checks a parsed JSON value against the schema, with one readable line per problem. */
export function validateSettings(value: unknown): ValidationResult {
  const result = SettingsSchema.safeParse(value);
  if (result.success) return { success: true, settings: result.data };
  return { success: false, problems: result.error.issues.map(describeIssue) };
}

/** Like validateSettings, but throws a SettingsError. */
export function parseSettings(value: unknown): Settings {
  const result = validateSettings(value);
  if (!result.success) throw new SettingsError(result.problems);
  return result.settings;
}

/** Parses and validates the text of a `.json` settings file. */
export function parseSettingsJson(text: string): Settings {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new SettingsError([`Not valid JSON: ${(error as Error).message}`]);
  }
  return parseSettings(value);
}

/** Pretty-printed JSON for a settings file. */
export function stringifySettings(settings: SettingsInput): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path
    .map((key, i) => (typeof key === 'number' ? `[${key}]` : `${i === 0 ? '' : '.'}${String(key)}`))
    .join('');
  return path ? `${path}: ${issue.message}` : issue.message;
}
