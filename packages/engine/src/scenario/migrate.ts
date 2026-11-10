// Converts between scenario versions. Version 1 (./schema-v1.ts) is an image of the `.set`
// format, so `.set` files go `.set ⇄ v1 ⇄ v2` (./set-convert.ts):
// - migrateV1 turns any v1 scenario into v2 with the same physics: red and blue become the
//   kinds `red` and `blue` (always both, as the Java app always has both types), particle
//   groups become populations in the same order, and reaction mode becomes the one rule
//   Red + Red → Blue + Blue with the Java app's energies (KIND-15).
// - toV1 goes back where the `.set` format can say it (EDIT-20), listing what stops it or
//   what would be lost. Kinds map by position: the first is Red, the second Blue.
import { DefaultParticleInfo } from '../sim/particle-type';
import { DEFAULT_REACTION, SCENARIO_FORMAT } from './format';
import type { ParticleColorV1, ScenarioV1, ScenarioV1Input } from './schema-v1';
import type { Kind, Scenario, ScenarioInput } from './schema';

/** Ids the migration gives the Java app's two particle types. */
export const RED_KIND = 'red';
export const BLUE_KIND = 'blue';

/** Mass (amu) and radius (nm) the Java app gives a type no particle group mentions. */
const JAVA_DEFAULT_TYPE = { mass: 2.0, radius: 1.0 } as const;

const kindOf = (color: ParticleColorV1) => (color === 'RED' ? RED_KIND : BLUE_KIND);

/** Whether a group places any particles. */
const hasParticles = (g: { randomlyPlaced: { count: number }[]; particles: unknown[] }) =>
  g.particles.length > 0 || g.randomlyPlaced.some((b) => b.count > 0);

/**
 * Whether reaction_mode TRUE runs: the Java app has reactions only in 2D, and only with a
 * single particle type, which turns blue (SIM-25). Otherwise the rule is kept, switched off.
 */
function javaRunsReaction(v1: ScenarioV1): boolean {
  return (
    v1.arena.dimensions === 2 &&
    !v1.particleGroups.some((g) => g.color === 'BLUE' && hasParticles(g))
  );
}

/**
 * A v1 scenario as v2. Where a colour has several particle groups, the kind takes the last
 * group's mass and radius (as Java's particle types do); set-convert warns when they differ.
 */
export function migrateV1(v1: ScenarioV1): ScenarioInput {
  const custom = v1.display.colorScheme === 'CUSTOM' ? v1.display.customColors : undefined;
  const reactionEnabled = v1.modes.reaction && javaRunsReaction(v1);
  const kind = (color: ParticleColorV1, name: string): Kind => {
    const groups = (c: ParticleColorV1) => v1.particleGroups.filter((g) => g.color === c);
    // A reaction's product with no group of its own is a copy of the reactant (SIM-26:
    // "blue particles of the same size"), as the reacted species always was here.
    const last =
      groups(color).at(-1) ??
      (reactionEnabled && color === 'BLUE' ? groups('RED').at(-1) : undefined) ??
      JAVA_DEFAULT_TYPE;
    const override = custom && (color === 'RED' ? custom.red : custom.blue);
    return {
      id: kindOf(color),
      name,
      mass: last.mass,
      radius: last.radius,
      ...(override && { color: override }),
    };
  };

  const st = v1.statistics;
  return {
    format: SCENARIO_FORMAT,
    version: 2,
    arena: v1.arena,
    modes: { maxwellDemon: v1.modes.maxwellDemon },
    kinds: [kind('RED', 'Red'), kind('BLUE', 'Blue')],
    populations: v1.particleGroups.map((g) => ({
      kind: kindOf(g.color),
      ...(g.temperature !== undefined && { temperature: g.temperature }),
      randomlyPlaced: g.randomlyPlaced,
      particles: g.particles,
    })),
    reactions: v1.modes.reaction
      ? [
          {
            reactants: [RED_KIND, RED_KIND],
            products: [BLUE_KIND, BLUE_KIND],
            ...DEFAULT_REACTION,
            suppressReverse: false,
            enabled: reactionEnabled,
          },
        ]
      : [],
    run: v1.run,
    statistics: {
      name: st.name,
      kinds: st.color === 'BOTH' ? 'all' : [kindOf(st.color)],
      cumulative: st.cumulative,
      width: st.width,
      history: st.history,
      pressureAveragingTime: st.pressureAveragingTime,
      forgetTime: st.forgetTime,
      pressurePredictionMode: st.pressurePredictionMode,
      abscissaLimits: Object.fromEntries(
        Object.entries(st.abscissaLimits).map(([name, { both, red, blue }]) => [
          name,
          {
            ...(both && { all: both }),
            kinds: { ...(red && { [RED_KIND]: red }), ...(blue && { [BLUE_KIND]: blue }) },
          },
        ]),
      ),
    },
    display: {
      colorScheme: v1.display.colorScheme,
      ...(custom && {
        customColors: {
          background: custom.background,
          divider: custom.divider,
          walls3D: custom.walls3D,
        },
      }),
      palette: 'classic',
      lighting: v1.display.lighting,
      viewingAngles: v1.display.viewingAngles,
      coloringMode: v1.display.coloringMode,
      traceMode: v1.display.traceMode,
      tracePointSize: v1.display.tracePointSize,
    },
  };
}

export interface V1Conversion {
  /** Absent when `problems` isn't empty. */
  scenario?: ScenarioV1Input;
  /** Why the scenario can't be written as `.set`. */
  problems: string[];
  /** Settings `.set` can't store, which a `.set` file would lose. */
  warnings: string[];
}

const toHex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
const CLASSIC_HEX = { RED: toHex(DefaultParticleInfo.RED), BLUE: toHex(DefaultParticleInfo.BLUE) };

/** A v2 scenario as v1, when the `.set` format can represent it (EDIT-20). */
export function toV1(scenario: Scenario): V1Conversion {
  const problems: string[] = [];
  const warnings: string[] = [];
  const { kinds, statistics: st, display } = scenario;

  if (kinds.length > 2) problems.push(`it has ${kinds.length} particle kinds (at most 2)`);
  if (scenario.walls.length > 0) problems.push('it has drawn walls');
  if (scenario.spawnRegions.length > 0 || scenario.populations.some((p) => p.region)) {
    problems.push('it has spawn regions');
  }
  const [red, blue] = kinds;
  const colorOf = new Map<string, ParticleColorV1>([
    [red?.id ?? '', 'RED'],
    [blue?.id ?? '', 'BLUE'],
  ]);

  let reaction = false;
  if (scenario.reactions.length > 0) {
    const [rule] = scenario.reactions;
    const isJavaRule =
      scenario.reactions.length === 1 &&
      rule !== undefined &&
      blue !== undefined &&
      rule.reactants.every((k) => k === red?.id) &&
      rule.products.every((k) => k === blue.id) &&
      rule.forward === DEFAULT_REACTION.forward &&
      rule.reverse === DEFAULT_REACTION.reverse &&
      !rule.suppressReverse;
    if (isJavaRule) {
      // reaction_mode TRUE; whether it runs follows from the arena and particles
      // (javaRunsReaction), so a rule switched on or off against that is lost.
      reaction = true;
      const runs =
        scenario.arena.dimensions === 2 &&
        !scenario.populations.some((p) => p.kind === blue.id && hasParticles(p));
      if (rule.enabled !== runs) {
        warnings.push(
          rule.enabled
            ? 'the reaction (which only runs in 2D with no Blue particles at the start)'
            : 'the switched-off reaction',
        );
      }
    } else {
      problems.push(
        `its reactions aren't the single rule ${red?.name ?? 'Red'} + ${red?.name ?? 'Red'} → ${blue?.name ?? 'Blue'} + ${blue?.name ?? 'Blue'} with activation energies ${DEFAULT_REACTION.forward} and ${DEFAULT_REACTION.reverse} kJ/mol`,
      );
    }
  }
  if (problems.length > 0) return { problems, warnings };

  if (display.palette !== 'classic') warnings.push('the colour palette');
  if (kinds.some((k, i) => k.name !== (i === 0 ? 'Red' : 'Blue')))
    warnings.push("the kinds' names");
  const custom = display.colorScheme === 'CUSTOM' ? display.customColors : undefined;
  if (!custom && kinds.some((k) => k.color)) warnings.push("the kinds' colours");
  if (!display.markers) warnings.push('turning markers off');

  const color = (kind: string) => colorOf.get(kind)!;
  const kindsWithParticles = new Set(scenario.populations.map((p) => p.kind));
  const group = (kind: Kind) => ({ color: color(kind.id), mass: kind.mass, radius: kind.radius });
  const kindById = new Map(kinds.map((k) => [k.id, k]));

  const v1: ScenarioV1Input = {
    format: SCENARIO_FORMAT,
    version: 1,
    arena: scenario.arena,
    modes: { maxwellDemon: scenario.modes.maxwellDemon, reaction },
    particleGroups: [
      ...scenario.populations.map((p) => ({
        ...group(kindById.get(p.kind)!),
        ...(p.temperature !== undefined && { temperature: p.temperature }),
        randomlyPlaced: p.randomlyPlaced,
        particles: p.particles,
      })),
      // A kind with no particles still needs a group, so its mass and radius survive.
      ...kinds.filter((k) => !kindsWithParticles.has(k.id)).map(group),
    ],
    run: scenario.run,
    statistics: {
      name: st.name,
      color: st.kinds === 'all' || st.kinds.length > 1 ? 'BOTH' : (color(st.kinds[0]!) ?? 'BOTH'),
      cumulative: st.cumulative,
      width: st.width,
      history: st.history,
      pressureAveragingTime: st.pressureAveragingTime,
      forgetTime: st.forgetTime,
      pressurePredictionMode: st.pressurePredictionMode,
      abscissaLimits: Object.fromEntries(
        Object.entries(st.abscissaLimits).map(([name, limits]) => [
          name,
          {
            ...(limits.all && { both: limits.all }),
            ...Object.fromEntries(
              Object.entries(limits.kinds).map(([k, r]) => [color(k).toLowerCase(), r]),
            ),
          },
        ]),
      ),
    },
    display: {
      colorScheme: display.colorScheme,
      ...(custom && {
        customColors: {
          red: red?.color ?? CLASSIC_HEX.RED,
          blue: blue?.color ?? CLASSIC_HEX.BLUE,
          background: custom.background,
          divider: custom.divider,
          walls3D: custom.walls3D,
        },
      }),
      lighting: display.lighting,
      viewingAngles: display.viewingAngles,
      coloringMode: display.coloringMode,
      traceMode: display.traceMode,
      tracePointSize: display.tracePointSize,
    },
  };
  return { scenario: v1, problems, warnings };
}
