// Version 1 of the scenario format: a direct image of the `.set` format (same sections, same
// units, red and blue particle groups). Still read, and converted to version 2 by ./migrate.ts;
// `.set` files are read and written through it (./set-convert.ts).
//
// Enumerated values use the `.set` spelling (`PERIODIC`, `BOTH`, `RED`, ...).
import * as z from 'zod';
import { DividerThermalMode } from '../sim/simulation-info';
import {
  BOUNDARIES,
  finite,
  groupTemperature,
  hexColor,
  nonNegative,
  oneOf,
  PlacedParticleSchema,
  positive,
  RandomlyPlacedSchema,
  range,
  SCENARIO_FORMAT,
  vec3,
} from './format';

export const ParticleColorSchema = z.enum(['RED', 'BLUE'], {
  error: (issue) => `Particle group color must be RED or BLUE, not ${String(issue.input)}`,
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
  temperature: groupTemperature().optional(),
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

export const ScenarioV1Schema = z
  .object({
    format: z.literal(SCENARIO_FORMAT, {
      error: `Not a Boltzmann 4D scenario file (format must be "${SCENARIO_FORMAT}")`,
    }),
    version: z.literal(1),
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
  .superRefine((scenario, ctx) => {
    if (scenario.display.colorScheme === 'CUSTOM' && !scenario.display.customColors) {
      ctx.addIssue({
        code: 'custom',
        path: ['display', 'customColors'],
        message: 'colorScheme CUSTOM needs customColors',
      });
    }
  });

/** A version 1 scenario as written in a file: fields with defaults may be left out. */
export type ScenarioV1Input = z.input<typeof ScenarioV1Schema>;
/** A validated version 1 scenario, with defaults filled in. */
export type ScenarioV1 = z.output<typeof ScenarioV1Schema>;
export type ParticleGroupV1 = ScenarioV1['particleGroups'][number];
export type ParticleColorV1 = z.output<typeof ParticleColorSchema>;
