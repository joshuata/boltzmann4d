import { describe, expect, it } from 'vitest';
import { loadSetFile } from '../io/load';
import { loadDefaultSetFileText, loadPresetText, presetNames } from '../io/presets';
import { SetFileError } from '../io/set-file';
import { toV1 } from './migrate';
import { resolveScenario } from './resolve';
import {
  parseScenario,
  parseScenarioJson,
  ScenarioError,
  stringifyScenario,
  validateScenario,
  type ScenarioInput,
} from './schema';
import { scenarioToSetFile, setFileCompatibility, setFileToScenario } from './set-convert';
import type { ScenarioV1Input } from './schema-v1';

/** Same seeded generator as the loader tests, so runs are reproducible. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe.each(presetNames)('%s', (name) => {
  it('round-trips .set → JSON → .set without loss', async () => {
    const { scenario } = setFileToScenario(await loadPresetText(name));
    const rewritten = scenarioToSetFile(scenario);
    expect(setFileToScenario(rewritten).scenario).toStrictEqual(scenario);
    // Writing is stable: a second pass gives the same text.
    expect(scenarioToSetFile(setFileToScenario(rewritten).scenario)).toBe(rewritten);
  });

  it('reads the same scenario from a version 1 JSON file', async () => {
    const text = await loadPresetText(name);
    const { scenario } = setFileToScenario(text);
    const v1 = v1FromSet(text);
    expect(parseScenarioJson(stringifyScenario(v1 as never))).toStrictEqual(scenario);
  });

  it('can be saved as .set', async () => {
    const { scenario } = setFileToScenario(await loadPresetText(name));
    expect(setFileCompatibility(scenario)).toEqual({ problems: [], warnings: [] });
  });

  it('round-trips through JSON text', async () => {
    const { scenario } = setFileToScenario(await loadPresetText(name));
    expect(parseScenarioJson(stringifyScenario(scenario))).toStrictEqual(scenario);
  });

  it('runs the same from .set, JSON and the rewritten .set', async () => {
    const text = await loadPresetText(name);
    const fromSet = loadSetFile(text, { random: seededRandom(7) }).scenario;
    const json = parseScenarioJson(stringifyScenario(setFileToScenario(text).scenario));
    expect(resolveScenario(json, { random: seededRandom(7) })).toStrictEqual(fromSet);
    const rewritten = scenarioToSetFile(json);
    expect(loadSetFile(rewritten, { random: seededRandom(7) }).scenario).toStrictEqual(fromSet);
  });
});

/** A `.set` file as a version 1 JSON scenario, written by hand from the v2 one. */
function v1FromSet(text: string): ScenarioV1Input {
  const v2 = setFileToScenario(text).scenario;
  const color = (kind: string) => (kind === 'a' ? 'RED' : 'BLUE');
  const massOf = new Map(v2.kinds.map((k) => [k.id, k]));
  return {
    format: 'boltzmann4d-scenario',
    version: 1,
    arena: v2.arena,
    modes: { maxwellDemon: v2.modes.maxwellDemon, reaction: v2.reactions.length > 0 },
    particleGroups: v2.populations.map((p) => ({
      color: color(p.kind),
      mass: massOf.get(p.kind)!.mass,
      radius: massOf.get(p.kind)!.radius,
      ...(p.temperature !== undefined && { temperature: p.temperature }),
      randomlyPlaced: p.randomlyPlaced,
      particles: p.particles,
    })),
    run: v2.run,
    statistics: {
      ...v2.statistics,
      color: v2.statistics.kinds === 'all' ? 'BOTH' : color(v2.statistics.kinds[0]!),
      abscissaLimits: Object.fromEntries(
        Object.entries(v2.statistics.abscissaLimits).map(([name, l]) => [
          name,
          {
            ...(l.all && { both: l.all }),
            ...(l.kinds.a && { red: l.kinds.a }),
            ...(l.kinds.b && { blue: l.kinds.b }),
          },
        ]),
      ),
    },
    display: { ...v2.display, palette: undefined, markers: undefined } as never,
  };
}

async function defaultScenario() {
  return setFileToScenario(await loadDefaultSetFileText()).scenario;
}

describe('scenarioToSetFile', () => {
  it('writes exponents the way Java NumberFormat reads them (E, no +)', async () => {
    const scenario = await defaultScenario();
    scenario.statistics.abscissaLimits = { KINETIC_ENERGY: { all: [1e-7, 1e21], kinds: {} } };
    const text = scenarioToSetFile(scenario);
    expect(text).toContain('both_limits 1E-7 1E21');
    expect(setFileToScenario(text).scenario.statistics.abscissaLimits).toEqual({
      KINETIC_ENERGY: { all: [1e-7, 1e21], kinds: {} },
    });
  });

  it('writes and reads back custom colour schemes', async () => {
    const text = (await loadDefaultSetFileText()).replace(
      'color_scheme DARK',
      'color_scheme CUSTOM: 0xFF0000, 0x0000ff 0 0x808080 0x010203',
    );
    const { scenario } = setFileToScenario(text);
    expect(scenario.kinds.map((k) => k.color)).toEqual(['#FF0000', '#0000FF']);
    expect(scenario.display.customColors).toEqual({
      background: '#000000',
      divider: '#808080',
      walls3D: ['#010203'],
    });
    const rewritten = scenarioToSetFile(scenario);
    expect(rewritten).toContain(
      'color_scheme CUSTOM: 0xFF0000 0x0000FF 0x000000 0x808080 0x010203',
    );
    expect(setFileToScenario(rewritten).scenario).toStrictEqual(scenario);
  });
});

describe('validateScenario', () => {
  const minimal = (): ScenarioInput => ({
    format: 'boltzmann4d-scenario',
    version: 2,
    arena: { dimensions: 2, size: [70, 50, 10], boundary: 'REFLECTING', holeSize: 8 },
    modes: { maxwellDemon: false },
    kinds: [{ id: 'a', name: 'A', mass: 2, radius: 1 }],
    populations: [
      { kind: 'a', temperature: 300, randomlyPlaced: [{ count: 50, averageVelocity: 0 }] },
    ],
    run: { paused: false, speed: '1x' },
    statistics: {
      name: 'INSTANTANEOUS_SPEED',
      kinds: 'all',
      cumulative: false,
      width: false,
      history: false,
      pressureAveragingTime: 60,
      forgetTime: 4,
      pressurePredictionMode: 'IDEAL',
    },
    display: {
      colorScheme: 'DARK',
      lighting: true,
      viewingAngles: [0, 0],
      coloringMode: 'NORMAL',
      traceMode: false,
      tracePointSize: 2,
    },
  });

  it('fills in defaults for optional sections', () => {
    const scenario = parseScenario(minimal());
    expect(scenario.arena.dividerThermalMode).toBe('INSULATING');
    expect(scenario.populations[0]?.particles).toEqual([]);
    expect(scenario.statistics.abscissaLimits).toEqual({});
    expect(scenario.walls).toEqual([]);
    expect(scenario.display.palette).toBe('okabe-ito');
    expect(scenario.display.markers).toBe(true);
  });

  it('shows every sidebar panel unless it lists some to hide (EDIT-24)', () => {
    expect(parseScenario(minimal()).sidebar.hidden).toEqual([]);
    const hiding = parseScenario({ ...minimal(), sidebar: { hidden: ['arena', 'performance'] } });
    expect(hiding.sidebar.hidden).toEqual(['arena', 'performance']);
    const unknown = validateScenario({ ...minimal(), sidebar: { hidden: ['tea'] } });
    expect(!unknown.success && unknown.problems[0]).toMatch(
      /^sidebar\.hidden\[0\]: Unknown sidebar panel: tea/,
    );
    expect(setFileCompatibility(hiding).warnings).toContain('the hidden sidebar panels');
    // The Run panel always shows.
    expect(validateScenario({ ...minimal(), sidebar: { hidden: ['run'] } }).success).toBe(false);
  });

  it('runs a hand-written file', () => {
    const species = resolveScenario(parseScenario(minimal()), { random: seededRandom(3) }).species;
    expect(species).toHaveLength(1);
    expect(species[0]?.positions).toHaveLength(150);
    expect(species[0]?.initialTemperature).toBe(300);
  });

  it('reports every problem with its path', () => {
    const input = minimal() as unknown as Record<string, Record<string, unknown>>;
    input.arena!.dimensions = 4;
    input.arena!.size = [70, -1, 10];
    (input.populations as unknown as Record<string, unknown>[])[0]!.temperature = 2000;
    const result = validateScenario(input);
    expect(result.success).toBe(false);
    expect(!result.success && result.problems).toEqual([
      'arena.dimensions: dimensions must be 1, 2 or 3, not 4',
      'arena.size[1]: Too small: expected number to be >0',
      'populations[0].temperature: Particle group temperature must be between 0 and 1500 K',
    ]);
  });

  it('needs custom colours for the CUSTOM scheme', () => {
    const input = minimal();
    input.display.colorScheme = 'CUSTOM';
    expect(() => parseScenario(input)).toThrow(
      'display.customColors: colorScheme CUSTOM needs customColors',
    );
  });

  it('rejects other JSON documents', () => {
    expect(() => parseScenarioJson('{"hello": 1}')).toThrow(ScenarioError);
    expect(() => parseScenarioJson('{"hello": 1}')).toThrow(/Not a Boltzmann 4D scenario file/);
    expect(() => parseScenarioJson('not json')).toThrow(/Not valid JSON/);
    expect(validateScenario({ format: 'boltzmann4d-scenario', version: 3 })).toEqual({
      success: false,
      problems: ['version: Unsupported scenario version (this app reads versions 1 and 2)'],
    });
    expect(validateScenario([1, 2])).toEqual({
      success: false,
      problems: ['Not a Boltzmann 4D scenario file (expected a JSON object)'],
    });
  });

  it('reports .set problems as SetFileError', async () => {
    const text = (await loadDefaultSetFileText()).replace('boundary REFLECTING', 'boundary BOUNCY');
    expect(() => setFileToScenario(text)).toThrow(SetFileError);
    expect(() => setFileToScenario(text)).toThrow(/Unknown boundary mode: BOUNCY/);
  });
});

describe('version 2 scenarios', () => {
  const base = async (): Promise<ScenarioInput> => {
    const { scenario } = setFileToScenario(await loadDefaultSetFileText());
    return structuredClone(scenario) as ScenarioInput;
  };
  const problemsOf = (input: ScenarioInput) => {
    const result = validateScenario(input);
    return result.success ? [] : result.problems;
  };
  const wall = (
    points: [number, number][],
    kind: NonNullable<ScenarioInput['walls']>[number]['kind'],
  ) => ({
    id: `w${points.length}`,
    points,
    kind,
  });

  it('migrates .set red and blue to Type A and Type B with the Classic palette', async () => {
    const scenario = parseScenario(await base());
    expect(scenario.kinds.map((k) => [k.id, k.name, k.mass, k.radius])).toEqual([
      ['a', 'Type A', 2, 1],
      ['b', 'Type B', 2, 1],
    ]);
    expect(scenario.display.palette).toBe('classic');
    expect(scenario.reactions).toEqual([]);
  });

  it('starts .set scenarios with markers off, so presets look as they did (KIND-7)', async () => {
    const scenario = parseScenario(await base());
    expect(scenario.display.markers).toBe(false);
    expect(resolveScenario(scenario).markers).toBe(false);
    // .set files can't store markers, so turning them on is lost on export.
    const marked = { ...scenario, display: { ...scenario.display, markers: true } };
    expect(setFileCompatibility(marked).warnings).toContain("the kinds' markers");
  });

  it('turns reaction mode into the Type A + Type A → Type B + Type B rule', async () => {
    const { scenario } = setFileToScenario(await loadPresetText('2Dequil'));
    expect(scenario.reactions).toEqual([
      {
        reactants: ['a', 'a'],
        products: ['b', 'b'],
        forward: 8,
        reverse: 4,
        suppressReverse: false,
        enabled: true,
      },
    ]);
    const resolved = resolveScenario(scenario);
    // Type B has no particles but is kept, since the reaction makes it.
    expect(resolved.species.map((s) => s.kindId)).toEqual(['a', 'b']);
    expect(resolved.reactions).toEqual([
      { reactants: [0, 0], products: [1, 1], forward: 8, reverse: 4, suppressReverse: false },
    ]);
  });

  it('runs reaction mode in 3D too (3Dequil, PRED-14)', async () => {
    // The Java app never reacted in 3D; the manual's 3Dequil expects it to.
    const { scenario } = setFileToScenario(await loadPresetText('3Dequil'));
    expect(scenario.reactions.map((r) => r.enabled)).toEqual([true]);
    const resolved = resolveScenario(scenario);
    expect(resolved.reactions).toEqual([
      { reactants: [0, 0], products: [1, 1], forward: 8, reverse: 4, suppressReverse: false },
    ]);
    expect(resolved.species.map((s) => s.kindId)).toEqual(['a', 'b']);
    expect(toV1(scenario).scenario?.modes.reaction).toBe(true);
    expect(toV1(scenario).warnings).toEqual([]);
  });

  it('keeps reaction mode switched off with Type B particles at the start (SIM-25)', async () => {
    const text = (await loadPresetText('2Dequil')).replace(
      /ParticleGroup \{\s*color Blue([^}]*)\}/,
      'ParticleGroup {\n  color Blue$1\n  RandomlyPlaced {\n    count 5\n    average_velocity 1500\n  }\n}',
    );
    const { scenario } = setFileToScenario(text);
    expect(scenario.reactions.map((r) => r.enabled)).toEqual([false]);
    expect(resolveScenario(scenario).reactions).toEqual([]);
    expect(toV1(scenario).scenario?.modes.reaction).toBe(true);
  });

  it('checks references to kinds and regions', async () => {
    const input = await base();
    input.populations![0]!.kind = 'green';
    input.populations![0]!.region = 'left';
    input.statistics.kinds = ['purple'];
    expect(problemsOf(input)).toEqual([
      'populations[0].kind: No particle kind has the id green',
      'statistics.kinds[0]: No particle kind has the id purple',
      'populations[0].region: No spawn region has the id left',
    ]);
  });

  it('keeps kind ids and names unique and fits the palette', async () => {
    const input = await base();
    input.kinds.push({ id: 'a', name: 'TYPE B', mass: 1, radius: 1 });
    input.kinds.push(...['c', 'd', 'e'].map((id) => ({ id, name: id, mass: 1, radius: 1 })));
    expect(problemsOf(input)).toEqual([
      'kinds[2].id: Another kind already has the id a',
      'kinds[2].name: Another kind is already called TYPE B',
      'display.palette: The Classic (not colour-blind safe) palette has 5 colours, not enough for 6 kinds',
    ]);
  });

  it('allows at most 10 kinds', async () => {
    const input = await base();
    input.kinds = Array.from({ length: 11 }, (_, i) => ({
      id: `k${i}`,
      name: `K${i}`,
      mass: 1,
      radius: 1,
    }));
    input.display.palette = 'muted';
    input.populations = [];
    input.statistics.kinds = 'all';
    expect(problemsOf(input)).toContain('kinds: A scenario has at most 10 particle kinds');
  });

  it('checks walls: in the arena, 2D only, not periodic, and semipermeable to some kinds only', async () => {
    const input = await base();
    input.walls = [
      wall(
        [
          [10, 10],
          [80, 10],
        ],
        { type: 'reflecting' },
      ),
      wall(
        [
          [5, 5],
          [5, 20],
          [20, 20],
        ],
        { type: 'semipermeable', passes: ['a', 'b'] },
      ),
    ];
    expect(problemsOf(input)).toEqual([
      'walls[1].kind.passes: A semipermeable wall must stop at least one kind',
      'walls[0].points[1]: (80, 10) is outside the 70 × 50 nm arena',
    ]);
    input.walls = [
      wall(
        [
          [10, 10],
          [20, 10],
        ],
        { type: 'gate', open: false },
      ),
    ];
    input.arena.boundary = 'PERIODIC';
    expect(problemsOf(input)).toEqual([
      "walls: Drawn walls can't be used with the periodic boundary yet",
    ]);
    input.arena.boundary = 'REFLECTING';
    input.arena.dimensions = 3;
    expect(problemsOf(input)).toEqual(['walls: Drawn walls are only available in 2D']);
  });

  it('checks spawn regions and closed walls', async () => {
    const input = await base();
    input.spawnRegions = [{ id: 'r', shape: { type: 'rectangle', min: [30, 10], max: [20, 40] } }];
    input.walls = [
      {
        id: 'w',
        points: [
          [1, 1],
          [2, 2],
        ],
        closed: true,
        kind: { type: 'reflecting' },
      },
    ];
    expect(problemsOf(input)).toEqual([
      'walls[0].points: A closed wall needs at least 3 points',
      'spawnRegions[0].shape: A rectangle needs min below and to the left of max',
    ]);
  });

  it('allows one reaction per pair of kinds, counting reverse reactions (KIND-14)', async () => {
    const input = await base();
    input.kinds.push({ id: 'c', name: 'C', mass: 2, radius: 1 });
    const rule = (a: string, b: string, suppressReverse = false) => ({
      reactants: [a, a] as [string, string],
      products: [b, b] as [string, string],
      forward: 8,
      reverse: 4,
      suppressReverse,
    });
    input.reactions = [rule('a', 'b'), rule('b', 'c')];
    expect(problemsOf(input)).toEqual(['reactions[1]: b + b already reacts by rule 1']);
    input.reactions = [rule('a', 'b', true), rule('b', 'c', true)];
    expect(problemsOf(input)).toEqual([]);
  });

  it("says why a scenario can't be saved as .set, and what .set would lose", async () => {
    const scenario = parseScenario({
      ...(await base()),
      kinds: [
        { id: 'a', name: 'Type A', mass: 2, radius: 1 },
        { id: 'b', name: 'Type B', mass: 2, radius: 1 },
        { id: 'c', name: 'C', mass: 2, radius: 1 },
      ],
      walls: [
        {
          id: 'w',
          points: [
            [1, 1],
            [2, 2],
          ],
          kind: { type: 'reflecting' },
        },
      ],
    });
    expect(setFileCompatibility(scenario).problems).toEqual([
      'it has 3 particle kinds (at most 2)',
      'it has drawn walls',
    ]);
    expect(() => scenarioToSetFile(scenario)).toThrow(
      "Can't save as .set: it has 3 particle kinds (at most 2)",
    );

    const renamed = parseScenario({
      ...(await base()),
      kinds: [
        { id: 'a', name: 'Argon', mass: 40, radius: 1, color: '#123456' },
        { id: 'b', name: 'Type B', mass: 2, radius: 1 },
      ],
      populations: [{ kind: 'a', randomlyPlaced: [{ count: 3, averageVelocity: 100 }] }],
      statistics: { ...(await base()).statistics, kinds: 'all', abscissaLimits: {} },
      display: { ...(await base()).display, palette: 'okabe-ito' },
    });
    expect(setFileCompatibility(renamed)).toEqual({
      problems: [],
      warnings: ['the colour palette', "the kinds' names", "the kinds' colours"],
    });
    // The first kind is written as Red, the second (with no particles) as an empty Blue group.
    const text = scenarioToSetFile(renamed);
    expect(text).toMatch(/color Red\s+radius 1\s+mass 40/);
    expect(text).toMatch(/color Blue\s+radius 1\s+mass 2\s*}/);
  });

  it('resolves wall kinds into SI units and species (WALL-4)', async () => {
    const input = await base();
    const w = (id: string, kind: NonNullable<ScenarioInput['walls']>[number]['kind']) => ({
      id,
      points: [
        [1, 1],
        [2, 2],
      ] as [number, number][],
      kind,
    });
    const scenario = parseScenario({
      ...input,
      walls: [
        w('t', { type: 'thermal', temperature: 300 }),
        w('s', { type: 'semipermeable', passes: ['a'] }),
        w('a', { type: 'attractive', depth: 2, width: 3 }),
      ],
    });
    const physics = resolveScenario(scenario).walls.map((wall) => wall.physics);
    // Kind ids become species indices (a is species 0).
    expect(physics).toEqual([
      { type: 'thermal', temperature: 300 },
      { type: 'semipermeable', passes: [0] },
      { type: 'attractive', depth: 2, width: expect.closeTo(3e-9, 20) },
    ]);
  });

  it('colours kinds from the palette unless they have their own colour', () => {
    const scenario = parseScenario({
      ...{
        format: 'boltzmann4d-scenario',
        version: 2,
        arena: { dimensions: 2, size: [70, 50, 10], boundary: 'REFLECTING', holeSize: 8 },
        modes: { maxwellDemon: false },
        run: { paused: false, speed: '1x' },
        statistics: {
          name: 'INSTANTANEOUS_SPEED',
          kinds: 'all',
          cumulative: false,
          width: false,
          history: false,
          pressureAveragingTime: 60,
          forgetTime: 4,
          pressurePredictionMode: 'IDEAL',
        },
        display: {
          colorScheme: 'DARK',
          lighting: true,
          viewingAngles: [0, 0],
          coloringMode: 'NORMAL',
          traceMode: false,
          tracePointSize: 2,
        },
      },
      kinds: [
        { id: 'a', name: 'A', mass: 2, radius: 1 },
        { id: 'b', name: 'B', mass: 2, radius: 1, color: '#ABCDEF' },
      ],
      populations: [
        { kind: 'a', randomlyPlaced: [{ count: 1, averageVelocity: 1 }] },
        { kind: 'b', randomlyPlaced: [{ count: 1, averageVelocity: 1 }] },
      ],
    } satisfies ScenarioInput);
    const colors = resolveScenario(scenario).species.map((s) => s.type.defaultColor);
    expect(colors).toEqual([0xd55e00, 0xabcdef]);
  });
});
