// Pieces shared by every version of the scenario format: the header, field helpers, the
// particle placement records both versions use, and readable validation errors.
import * as z from 'zod';
import { MAXIMUM_INITIAL_TEMPERATURE } from '../sim/simulation-info';

export const SCENARIO_FORMAT = 'boltzmann4d-scenario';

export const BOUNDARIES = ['PERIODIC', 'REFLECTING', 'DIVIDED', 'HOLE', 'PISTON'] as const;
export type Boundary = (typeof BOUNDARIES)[number];

/** The Java app's reaction energies in kJ/mol (SIM-26); `.set` files can't store others. */
export const DEFAULT_REACTION = { forward: 8.0, reverse: 4.0 } as const;

export const finite = () => z.number();
export const nonNegative = () => z.number().min(0);
export const positive = () => z.number().positive();
export const vec3 = (item: () => z.ZodNumber) => z.tuple([item(), item(), item()]);
export const range = z.tuple([finite(), finite()]);
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, {
  error: (issue) => `Colours must look like #RRGGBB, not ${String(issue.input)}`,
});

export const oneOf = <const T extends readonly [string, ...string[]]>(what: string, values: T) =>
  z.enum(values, {
    error: (issue) => `Unknown ${what}: ${String(issue.input)} (expected ${values.join(', ')})`,
  });

/** A temperature in K, 0 to `max`, with one message for every way of getting it wrong. */
export const temperature = (what: string, max: number) => {
  const message = `${what} must be between 0 and ${max} K`;
  return z.number({ error: message }).min(0, message).max(max, message);
};

/** Starting temperature of a group of particles (PART-4 as the Java loader enforces it). */
export const groupTemperature = () =>
  temperature('Particle group temperature', MAXIMUM_INITIAL_TEMPERATURE);

/** Particles placed uniformly at random, all with the same speed. */
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

export class ScenarioError extends Error {
  /** One line per problem, each starting with its path in the scenario, e.g. `arena.size[0]`. */
  readonly problems: string[];

  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ScenarioError';
    this.problems = problems;
  }
}

export function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path
    .map((key, i) => (typeof key === 'number' ? `[${key}]` : `${i === 0 ? '' : '.'}${String(key)}`))
    .join('');
  return path ? `${path}: ${issue.message}` : issue.message;
}
