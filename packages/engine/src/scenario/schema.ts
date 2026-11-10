// The web app's scenario format: a JSON document describing a simulation before it runs.
//
// Version 2 (this file) describes particles by kind (up to 10, KIND-1), placed by
// populations that fill the arena or a spawn region (EDIT-3), plus drawn walls (WALL-*) and
// a table of reaction rules (KIND-13). Version 1 (./schema-v1.ts), an image of the `.set`
// format, is still read: validateScenario converts it (./migrate.ts). Units are those of
// `.set` files: nm, amu, K, m/s, kJ/mol. Requirement IDs refer to docs/specs/editor.md.
//
// Positions for randomly placed particles are generated when the scenario is resolved
// (./resolve.ts).
import * as z from 'zod';
import { DividerThermalMode } from '../sim/simulation-info';
import {
  BOUNDARIES,
  describeIssue,
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
  ScenarioError,
  temperature,
  vec3,
} from './format';
import { migrateV1 } from './migrate';
import { DEFAULT_PALETTE, MAX_KINDS, PALETTE_IDS, PALETTES } from './palettes';
import { ScenarioV1Schema } from './schema-v1';

export const SCENARIO_VERSION = 2;

/** Highest temperature a thermal wall can hold (WALL-4, PART-4's range). */
export const MAXIMUM_WALL_TEMPERATURE = 9999;

/** Identifies a kind, region or wall within a scenario; other parts refer to it by id. */
const id = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, {
  error: (issue) => `Ids must be 1–32 letters, digits, - or _, not ${JSON.stringify(issue.input)}`,
});

/** x, y in nm. */
const point = z.tuple([finite(), finite()]);

/** A particle kind (KIND-1). */
export const KindSchema = z.object({
  id,
  name: z.string().trim().min(1).max(20),
  /** amu. */
  mass: positive(),
  /** nm. */
  radius: positive(),
  /** Overrides the palette's colour for this kind (KIND-10). */
  color: hexColor.optional(),
});

export const RegionShapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rectangle'), min: point, max: point }),
  z.object({ type: z.literal('polygon'), points: z.array(point).min(3) }),
]);

/** An area that particles are spawned in (EDIT-3). 2D only. */
export const SpawnRegionSchema = z.object({
  id,
  name: z.string().max(40).optional(),
  shape: RegionShapeSchema,
});

/**
 * Particles of one kind: randomly placed blocks and explicitly placed particles, in the arena
 * or (randomly placed ones) in a spawn region. Populations are placed in order, as the `.set`
 * format's particle groups are, so the same scenario and random source give the same start.
 */
export const PopulationSchema = z.object({
  kind: id,
  /** Spawn region for the randomly placed blocks; absent means the whole arena (EDIT-5). */
  region: id.optional(),
  /** K. When given, the population's velocities are rescaled to this temperature. */
  temperature: groupTemperature().optional(),
  randomlyPlaced: z.array(RandomlyPlacedSchema).default([]),
  particles: z.array(PlacedParticleSchema).default([]),
});

/** What a drawn wall does to particles (WALL-4). */
export const WallKindSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reflecting') }),
  z.object({
    type: z.literal('thermal'),
    temperature: temperature('Wall temperature', MAXIMUM_WALL_TEMPERATURE),
  }),
  /** Kinds in `passes` go through; the rest reflect. */
  z.object({ type: z.literal('semipermeable'), passes: z.array(id).min(1) }),
  /** A reflecting wall that can be opened and closed while the simulation runs. */
  z.object({ type: z.literal('gate'), open: z.boolean() }),
  /** A reflecting wall with a square well along it: depth in kJ/mol, width in nm. */
  z.object({ type: z.literal('attractive'), depth: positive(), width: positive() }),
]);

export const WALL_KINDS = ['reflecting', 'thermal', 'semipermeable', 'gate', 'attractive'] as const;

/** Display only (WALL-5); anything left out takes the wall kind's default style. */
export const WallStyleSchema = z.object({
  color: hexColor.optional(),
  /** Screen pixels. */
  lineWidth: positive().optional(),
  dash: oneOf('wall dash', ['solid', 'dashed']).optional(),
});

/** A drawn wall: a polyline of segments, closed into a polygon when `closed` (WALL-1). */
export const WallSchema = z.object({
  id,
  points: z.array(point).min(2),
  closed: z.boolean().default(false),
  kind: WallKindSchema,
  style: WallStyleSchema.default({}),
});

/** A reaction rule (KIND-13): `reactants[0] + reactants[1] → products[0] + products[1]`. */
export const ReactionSchema = z.object({
  reactants: z.tuple([id, id]),
  products: z.tuple([id, id]),
  /** Activation energies in kJ/mol. */
  forward: nonNegative(),
  reverse: nonNegative(),
  suppressReverse: z.boolean().default(false),
});

/** Histogram axis limits for one statistic: for all kinds together and per kind. */
export const AbscissaLimitsSchema = z.object({
  all: range.optional(),
  kinds: z.record(id, range).default({}),
});

/** Colours for the CUSTOM colour scheme; kinds' colours are on the kinds. */
export const CustomColorsSchema = z.object({
  background: hexColor,
  divider: hexColor,
  /** 3D wall colours in the order left, right, top, bottom, front, back (a prefix of them). */
  walls3D: z.array(hexColor).max(6).default([]),
});

const ScenarioObjectSchema = z.object({
  format: z.literal(SCENARIO_FORMAT, {
    error: `Not a Boltzmann 4D scenario file (format must be "${SCENARIO_FORMAT}")`,
  }),
  version: z.literal(SCENARIO_VERSION, {
    error: `Unsupported scenario version (this app reads versions 1 and ${SCENARIO_VERSION})`,
  }),
  name: z.string().max(80).optional(),
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
  }),
  kinds: z
    .array(KindSchema)
    .min(1, 'A scenario needs at least one particle kind')
    .max(MAX_KINDS, `A scenario has at most ${MAX_KINDS} particle kinds`),
  populations: z.array(PopulationSchema).default([]),
  spawnRegions: z.array(SpawnRegionSchema).default([]),
  walls: z.array(WallSchema).default([]),
  reactions: z.array(ReactionSchema).default([]),
  run: z.object({
    paused: z.boolean(),
    /** As in `.set` files, e.g. `1x`. */
    speed: z.string().min(1),
  }),
  statistics: z.object({
    /** e.g. `INSTANTANEOUS_SPEED`. */
    name: z.string().min(1),
    /** Which kinds the statistics show (KIND-4). */
    kinds: z.union([z.literal('all'), z.array(id).min(1)]),
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
    /** Where kinds without their own colour get one (KIND-6). */
    palette: oneOf('palette', PALETTE_IDS).default(DEFAULT_PALETTE),
    /** Draw each kind's marker on its particles (KIND-9). */
    markers: z.boolean().default(true),
    lighting: z.boolean(),
    /** 3D camera angles in degrees. */
    viewingAngles: z.tuple([finite(), finite()]),
    coloringMode: z.string().min(1),
    traceMode: z.boolean(),
    tracePointSize: finite(),
  }),
});

type ScenarioObject = z.output<typeof ScenarioObjectSchema>;
type Path = (string | number)[];

export const ScenarioSchema = ScenarioObjectSchema.superRefine((scenario, ctx) => {
  const issue = (path: Path, message: string) => ctx.addIssue({ code: 'custom', path, message });

  if (scenario.display.colorScheme === 'CUSTOM' && !scenario.display.customColors) {
    issue(['display', 'customColors'], 'colorScheme CUSTOM needs customColors');
  }
  checkKinds(scenario, issue);
  checkGeometry(scenario, issue);
  checkReactions(scenario, issue);
});

type Issue = (path: Path, message: string) => void;

function checkUnique(items: { id: string }[], what: string, path: string, issue: Issue): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) issue([path, i, 'id'], `Another ${what} already has the id ${item.id}`);
    seen.add(item.id);
  });
}

function checkKinds(scenario: ScenarioObject, issue: Issue): void {
  const { kinds } = scenario;
  checkUnique(kinds, 'kind', 'kinds', issue);
  const names = new Set<string>();
  kinds.forEach((kind, i) => {
    const name = kind.name.toLowerCase();
    if (names.has(name)) issue(['kinds', i, 'name'], `Another kind is already called ${kind.name}`);
    names.add(name);
  });

  const kindIds = new Set(kinds.map((k) => k.id));
  const checkKind = (kind: string, path: Path) => {
    if (!kindIds.has(kind)) issue(path, `No particle kind has the id ${kind}`);
  };
  scenario.populations.forEach((p, i) => checkKind(p.kind, ['populations', i, 'kind']));
  const shown = scenario.statistics.kinds;
  if (shown !== 'all') shown.forEach((k, i) => checkKind(k, ['statistics', 'kinds', i]));
  for (const [name, limits] of Object.entries(scenario.statistics.abscissaLimits)) {
    for (const k of Object.keys(limits.kinds)) {
      checkKind(k, ['statistics', 'abscissaLimits', name, 'kinds', k]);
    }
  }
  scenario.walls.forEach((wall, i) => {
    if (wall.kind.type !== 'semipermeable') return;
    const passes = wall.kind.passes;
    passes.forEach((k, j) => checkKind(k, ['walls', i, 'kind', 'passes', j]));
    if (kinds.every((k) => passes.includes(k.id))) {
      issue(['walls', i, 'kind', 'passes'], 'A semipermeable wall must stop at least one kind');
    }
  });

  const palette = PALETTES[scenario.display.palette];
  if (kinds.length > palette.colors.length) {
    issue(
      ['display', 'palette'],
      `The ${palette.label} palette has ${palette.colors.length} colours, not enough for ${kinds.length} kinds`,
    );
  }
}

function checkGeometry(scenario: ScenarioObject, issue: Issue): void {
  const { arena, walls, spawnRegions } = scenario;
  checkUnique(spawnRegions, 'spawn region', 'spawnRegions', issue);
  checkUnique(walls, 'wall', 'walls', issue);

  // EDIT-1, WALL-3: drawn walls and spawn regions are 2D, and walls need solid box walls.
  if (arena.dimensions !== 2) {
    if (walls.length > 0) issue(['walls'], 'Drawn walls are only available in 2D');
    if (spawnRegions.length > 0) issue(['spawnRegions'], 'Spawn regions are only available in 2D');
  }
  if (walls.length > 0 && (arena.boundary === 'PERIODIC' || arena.boundary === 'PISTON')) {
    issue(
      ['walls'],
      `Drawn walls can't be used with the ${arena.boundary === 'PERIODIC' ? 'periodic boundary' : 'piston'} yet`,
    );
  }

  const [width, height] = arena.size;
  const checkPoint = ([x, y]: [number, number], path: Path) => {
    if (x < 0 || x > width || y < 0 || y > height) {
      issue(path, `(${x}, ${y}) is outside the ${width} × ${height} nm arena`);
    }
  };
  walls.forEach((wall, i) => {
    wall.points.forEach((p, j) => checkPoint(p, ['walls', i, 'points', j]));
    if (wall.closed && wall.points.length < 3) {
      issue(['walls', i, 'points'], 'A closed wall needs at least 3 points');
    }
  });
  spawnRegions.forEach((region, i) => {
    const { shape } = region;
    const path: Path = ['spawnRegions', i, 'shape'];
    if (shape.type === 'rectangle') {
      checkPoint(shape.min, [...path, 'min']);
      checkPoint(shape.max, [...path, 'max']);
      if (!(shape.min[0] < shape.max[0] && shape.min[1] < shape.max[1])) {
        issue(path, 'A rectangle needs min below and to the left of max');
      }
    } else {
      shape.points.forEach((p, j) => checkPoint(p, [...path, 'points', j]));
    }
  });

  const regionIds = new Set(spawnRegions.map((r) => r.id));
  scenario.populations.forEach((p, i) => {
    if (p.region !== undefined && !regionIds.has(p.region)) {
      issue(['populations', i, 'region'], `No spawn region has the id ${p.region}`);
    }
  });
}

/** KIND-14: each pair of kinds reacts by at most one rule, counting enabled reverse reactions. */
function checkReactions(scenario: ScenarioObject, issue: Issue): void {
  const kindIds = new Set(scenario.kinds.map((k) => k.id));
  const pairKey = ([a, b]: [string, string]) => (a < b ? `${a} + ${b}` : `${b} + ${a}`);
  const usedBy = new Map<string, number>();
  scenario.reactions.forEach((rule, i) => {
    [...rule.reactants, ...rule.products].forEach((k, j) => {
      if (!kindIds.has(k)) {
        issue(
          ['reactions', i, j < 2 ? 'reactants' : 'products', j % 2],
          `No particle kind has the id ${k}`,
        );
      }
    });
    const keys = [pairKey(rule.reactants)];
    if (!rule.suppressReverse) keys.push(pairKey(rule.products));
    for (const key of new Set(keys)) {
      const other = usedBy.get(key);
      if (other !== undefined) {
        issue(['reactions', i], `${key} already reacts by rule ${other + 1}`);
      } else {
        usedBy.set(key, i);
      }
    }
  });
}

/** A scenario as written in a file: fields with defaults may be left out. */
export type ScenarioInput = z.input<typeof ScenarioSchema>;
/** A validated scenario, with defaults filled in. */
export type Scenario = z.output<typeof ScenarioSchema>;
export type Kind = Scenario['kinds'][number];
export type Population = Scenario['populations'][number];
export type SpawnRegion = Scenario['spawnRegions'][number];
export type RegionShape = SpawnRegion['shape'];
export type Wall = Scenario['walls'][number];
export type WallKind = Wall['kind'];
export type WallStyle = Wall['style'];
export type Reaction = Scenario['reactions'][number];

export type ValidationResult =
  { success: true; scenario: Scenario } | { success: false; problems: string[] };

const describeIssues = (error: z.ZodError) => error.issues.map(describeIssue);

/**
 * Checks a parsed JSON value against the schema, with one readable line per problem. Version 1
 * documents are checked against the version 1 schema (so problems name their own paths), then
 * converted to version 2.
 */
export function validateScenario(value: unknown): ValidationResult {
  const version = (value as { version?: unknown } | null)?.version;
  if (version === 1) {
    const v1 = ScenarioV1Schema.safeParse(value);
    if (!v1.success) return { success: false, problems: describeIssues(v1.error) };
    value = migrateV1(v1.data);
  }
  const result = ScenarioSchema.safeParse(value);
  if (result.success) return { success: true, scenario: result.data };
  return { success: false, problems: describeIssues(result.error) };
}

/** Like validateScenario, but throws a ScenarioError. */
export function parseScenario(value: unknown): Scenario {
  const result = validateScenario(value);
  if (!result.success) throw new ScenarioError(result.problems);
  return result.scenario;
}

/** Parses and validates the text of a `.json` scenario file (version 1 or 2). */
export function parseScenarioJson(text: string): Scenario {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ScenarioError([`Not valid JSON: ${(error as Error).message}`]);
  }
  return parseScenario(value);
}

/** Pretty-printed JSON for a scenario file. */
export function stringifyScenario(scenario: ScenarioInput): string {
  return `${JSON.stringify(scenario, null, 2)}\n`;
}

export { ScenarioError };
