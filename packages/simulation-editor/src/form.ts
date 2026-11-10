// The editor's form: the parts of a scenario it lets you change, as plain fields, and the
// conversion both ways. Everything the form doesn't show (statistics, display, abscissa
// limits, particles at given positions) is kept from the scenario it started from. The form
// shows the scenario's first two kinds as red and blue, as the Java dialog does; plan 0010
// replaces it with an editor for any number of kinds.
import {
  ARENA_SIZE_LIMITS,
  BLUE_KIND,
  DEFAULT_REACTION,
  describeSpecies,
  RED_KIND,
  scenarioProblems,
  SPECIES_LIMITS,
  validateScenario,
  withSpecies,
  type Boundary,
  type Scenario,
} from '@boltzmann4d/engine/scenario';
import { MAXIMUM_INITIAL_TEMPERATURE } from '@boltzmann4d/engine/sim/simulation-info';

export interface SpeciesFields {
  /** Off means none of this colour. */
  enabled: boolean;
  count: number;
  /** amu. */
  mass: number;
  /** nm. */
  radius: number;
  /** K. */
  temperature: number;
  /** Read-only: how many of the scenario's particles of this colour have given positions. */
  placed: number;
}

export interface EditorForm {
  dimensions: 1 | 2 | 3;
  /** nm. */
  size: [number, number, number];
  boundary: Boundary;
  /** nm. */
  holeSize: number;
  conductingDivider: boolean;
  red: SpeciesFields;
  blue: SpeciesFields;
  maxwellDemon: boolean;
  reaction: boolean;
  paused: boolean;
}

/** default.set's particles (FILE-2): 2 amu, 1 nm, 300 K. */
const DEFAULT_SPECIES = { count: 50, mass: 2, radius: 1, temperature: 300 };

export const BOUNDARY_LABELS: Record<Boundary, string> = {
  PERIODIC: 'Periodic (no walls)',
  REFLECTING: 'Box with walls',
  DIVIDED: 'Divided box',
  HOLE: 'Divided box with a hole',
  PISTON: 'Box with a movable piston',
};

/** The boundaries a dimension allows: a hole needs 2D or 3D (SIM-15). */
export function boundariesFor(dimensions: 1 | 2 | 3): Boundary[] {
  const all = Object.keys(BOUNDARY_LABELS) as Boundary[];
  return dimensions === 1 ? all.filter((b) => b !== 'HOLE') : all;
}

const isDivided = (b: Boundary) => b === 'DIVIDED' || b === 'HOLE';
/** Maxwell's demon works the hole (SIM-24). */
export const canDemon = (form: EditorForm) => form.boundary === 'HOLE';
export const canConduct = (form: EditorForm) => isDivided(form.boundary);
/** Reactions start from one species, red, in 2D (SIM-25; the worker's 2D reactions). */
export const canReact = (form: EditorForm) => form.dimensions === 2 && !form.blue.enabled;

/** The ids of the kinds the form shows as red and blue. */
function kindIds(scenario: Scenario): { red: string; blue: string } {
  const [red, blue] = scenario.kinds;
  return { red: red?.id ?? RED_KIND, blue: blue?.id ?? BLUE_KIND };
}

function speciesFields(scenario: Scenario, kind: string): SpeciesFields {
  const summary = describeSpecies(scenario, kind);
  if (!summary) return { enabled: false, ...DEFAULT_SPECIES, placed: 0 };
  return {
    enabled: true,
    count: summary.count,
    mass: summary.mass,
    radius: summary.radius,
    // Temperatures inferred from particle speeds come out as e.g. 299.9999914: show 0.1 K.
    temperature: Math.round(summary.temperature * 10) / 10,
    placed: summary.placed,
  };
}

export function formFromScenario(scenario: Scenario): EditorForm {
  const { arena, modes, run } = scenario;
  const ids = kindIds(scenario);
  return {
    dimensions: arena.dimensions,
    size: [...arena.size],
    boundary: arena.boundary,
    holeSize: arena.holeSize,
    conductingDivider: arena.dividerThermalMode === 'CONDUCTING',
    red: speciesFields(scenario, ids.red),
    blue: speciesFields(scenario, ids.blue),
    maxwellDemon: modes.maxwellDemon,
    reaction: scenario.reactions.some((r) => r.enabled),
    paused: run.paused,
  };
}

/**
 * Whether the base scenario's particle positions still fit: they were made for its arena, so
 * a new dimension, size or wall layout places every particle at random instead.
 */
export function keepsPositions(base: Scenario, form: EditorForm): boolean {
  const a = base.arena;
  return (
    a.dimensions === form.dimensions &&
    a.boundary === form.boundary &&
    a.size.every((side, i) => side === form.size[i])
  );
}

/** True when a species' fields differ from what the base scenario already holds. */
function speciesChanged(base: Scenario, kind: string, fields: SpeciesFields): boolean {
  const before = speciesFields(base, kind);
  return (
    fields.enabled !== before.enabled ||
    (fields.enabled &&
      (fields.count !== before.count ||
        fields.mass !== before.mass ||
        fields.radius !== before.radius ||
        fields.temperature !== before.temperature))
  );
}

/**
 * The form applied to `base`. A species the form hasn't changed keeps the base's groups
 * exactly (so a preset with several groups or per-group temperatures stays as it was).
 */
export function scenarioFromForm(base: Scenario, form: EditorForm): Scenario {
  let scenario: Scenario = {
    ...base,
    arena: {
      ...base.arena,
      dimensions: form.dimensions,
      size: [...form.size],
      boundary: form.boundary,
      holeSize: form.holeSize,
      dividerThermalMode: canConduct(form) && form.conductingDivider ? 'CONDUCTING' : 'INSULATING',
    },
    modes: { maxwellDemon: canDemon(form) && form.maxwellDemon },
    run: { ...base.run, paused: form.paused },
  };
  const ids = kindIds(base);
  const keepPlaced = keepsPositions(base, form);
  for (const [kind, fields] of [
    [ids.red, form.red],
    [ids.blue, form.blue],
  ] as const) {
    if (speciesChanged(base, kind, fields) || !keepPlaced) {
      scenario = withSpecies(scenario, kind, fields.enabled ? fields : null, { keepPlaced });
    }
  }
  return withReaction(scenario, ids, canReact(form) && form.reaction);
}

/**
 * Reaction mode as the Java app has it (SIM-25): red + red → blue + blue, keeping the base's
 * activation energies when it has the rule. The blue kind it turns into is added if missing.
 */
function withReaction(
  scenario: Scenario,
  ids: { red: string; blue: string },
  on: boolean,
): Scenario {
  const [rule] = scenario.reactions;
  // Off keeps a rule that was already switched off (3D `.set` files' reaction_mode TRUE).
  if (!on) return { ...scenario, reactions: rule && !rule.enabled ? [rule] : [] };
  const kinds = scenario.kinds.some((k) => k.id === ids.blue)
    ? scenario.kinds
    : [...scenario.kinds, { ...scenario.kinds[0]!, id: ids.blue, name: 'Blue', color: undefined }];
  return {
    ...scenario,
    kinds,
    reactions: [
      rule
        ? { ...rule, enabled: true }
        : {
            reactants: [ids.red, ids.red],
            products: [ids.blue, ids.blue],
            ...DEFAULT_REACTION,
            suppressReverse: false,
            enabled: true,
          },
    ],
  };
}

/** Field paths (`red.mass`, `size.0`, ...) to a message, for fields out of range. */
export type FieldErrors = Partial<Record<string, string>>;

function checkRange(
  errors: FieldErrors,
  key: string,
  value: number,
  { min, max }: { min: number; max: number },
  unit: string,
  integer = false,
) {
  if (!Number.isFinite(value)) errors[key] = 'Enter a number.';
  else if (integer && !Number.isInteger(value)) errors[key] = 'Enter a whole number.';
  else if (value < min || value > max) errors[key] = `Between ${min} and ${max}${unit}.`;
}

export function fieldErrors(form: EditorForm): FieldErrors {
  const errors: FieldErrors = {};
  const axes = form.dimensions === 3 ? 3 : form.dimensions === 2 ? 2 : 1;
  for (let i = 0; i < axes; i++) {
    checkRange(errors, `size.${i}`, form.size[i] ?? NaN, ARENA_SIZE_LIMITS, ' nm');
  }
  if (form.boundary === 'HOLE') {
    // The hole is an opening in the divider, which spans the arena's height.
    checkRange(errors, 'holeSize', form.holeSize, { min: 1, max: form.size[1] }, ' nm');
  }
  for (const color of ['red', 'blue'] as const) {
    const s = form[color];
    if (!s.enabled) continue;
    checkRange(
      errors,
      `${color}.count`,
      s.count,
      { min: 1, max: SPECIES_LIMITS.totalCount.max },
      '',
      true,
    );
    checkRange(errors, `${color}.mass`, s.mass, SPECIES_LIMITS.mass, ' amu');
    checkRange(errors, `${color}.radius`, s.radius, SPECIES_LIMITS.radius, ' nm');
    checkRange(
      errors,
      `${color}.temperature`,
      s.temperature,
      { min: 0, max: MAXIMUM_INITIAL_TEMPERATURE },
      ' K',
    );
  }
  return errors;
}

export interface FormCheck {
  /** The scenario the form describes, or null while a field is invalid. */
  scenario: Scenario | null;
  fields: FieldErrors;
  /** Problems with the scenario as a whole. */
  problems: string[];
}

/** Everything the editor shows about the form's state, in one pass. */
export function checkForm(base: Scenario, form: EditorForm): FormCheck {
  const fields = fieldErrors(form);
  if (Object.keys(fields).length > 0) return { scenario: null, fields, problems: [] };
  const problems: string[] = [];
  if (!form.red.enabled && !form.blue.enabled) problems.push('Add some red or blue particles.');
  const scenario = scenarioFromForm(base, form);
  const result = validateScenario(scenario);
  if (!result.success)
    return { scenario: null, fields, problems: [...problems, ...result.problems] };
  problems.push(...scenarioProblems(result.scenario));
  return { scenario: problems.length > 0 ? null : result.scenario, fields, problems };
}
