// Simulation Web Worker entry: builds the Simulation from a scenario (a bundled preset or one
// the page supplies), paces it with ThreadController, and streams frames to the renderer over the port it is given.
import {
  loadPresetScenario,
  MARKERS,
  parseScenario,
  resolveScenario,
  scenarioProblems,
  withArenaSize,
  type ResolvedScenario,
} from '@boltzmann4d/engine/scenario';
import type { RenderStream } from '../render/protocol';
import {
  javaReaction,
  Simulation,
  type ColorMode,
  type InitialState,
  type SceneInfo,
} from '@boltzmann4d/engine/sim';
import { DefaultParticleInfo, ParticleType } from '@boltzmann4d/engine/sim/particle-type';
import { averageVelocity, avgKineticEnergy } from '@boltzmann4d/engine/stats/formulas';
import {
  DEFAULT_PRESSURE_AVERAGING_TIME,
  PressureMeter,
  Statistics,
  statsContext,
  weightedAverage,
  type StatsContext,
} from '@boltzmann4d/engine/stats';
import { convert } from '@boltzmann4d/engine/utils/units';

/** kg per amu. */
const AMU_KG = 1.660538782e-27;
import {
  ArenaType,
  DividerThermalMode,
  PISTON_SHAFT_RADIUS,
  PISTON_VALVE_RADIUS,
} from '@boltzmann4d/engine/sim/simulation-info';
import type { ArenaInfo, ArenaOptions, FromWorker, ScenarioSource, ToWorker } from './index';
import { parseSimulationSpeed, ThreadController } from './thread-controller';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: FromWorker) => scope.postMessage(message);
/** Statistics are summarised about this often (real milliseconds), like the Java app. */
const SUMMARY_INTERVAL_MS = 1000;
/** The pressure readout is sent about this often (real milliseconds). */
const PRESSURE_INTERVAL_MS = 250;

/** The Reactions tab's defaults: forward and reverse activation energies, kJ/mol. */

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

let frames: MessagePort | null = null;
let threadController: ThreadController | null = null;
let running: Simulation | null = null;
let paused = false;
/** The user's speed multiplier on top of each scenario's own speed. */
let rateScale = 1;
/** Bumped per load request, so a slow load can't replace a newer one. */
let loadGeneration = 0;
/** The running simulation's statistics. */
let runningStatistics: Statistics | null = null;
/** Kinds the user picked for the statistics (KIND-4), if not a tracked set. */
let statKinds: number[] | null = null;
/** The running simulation's pressure meter. */
let runningPressure: PressureMeter | null = null;
/** The averaging time (s) the user chose, kept by Restart and arena changes; null: the scenario's. */
let averagingTime: number | null = null;

/** Sends the statistics, including the picked set of kinds. */
function postSummary(statistics: Statistics, time: number): void {
  post({ type: 'statistics', summary: statistics.summary(time, statKinds ? [statKinds] : []) });
}

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case 'connect':
      frames = message.frames;
      void load(message.source, message.arena);
      break;
    case 'load':
      averagingTime = message.pressureAveragingTime ?? null;
      void load(message.source, message.arena);
      break;
    case 'pressureAveragingTime':
      averagingTime = message.seconds;
      if (runningPressure) {
        runningPressure.setAveragingTime(message.seconds);
        post({ type: 'pressure', reading: runningPressure.read() });
      }
      break;
    case 'restart':
      restart();
      break;
    case 'setGate':
      try {
        running?.setGateOpen(message.index, message.open);
      } catch (error) {
        post({ type: 'error', message: `Gate: ${errorText(error)}` });
      }
      break;
    case 'setHoleOpen':
      // Takes effect at the start of the next frame (Physics.setArenaHoleOpen).
      running?.setHoleOpen(message.open);
      break;
    case 'movePiston':
    case 'stopPiston':
      try {
        if (message.type === 'movePiston') {
          running?.movePiston(message.level, message.mode, message.speed);
        } else {
          running?.stopPiston();
        }
      } catch (error) {
        post({ type: 'error', message: `Piston: ${errorText(error)}` });
      }
      break;
    case 'play':
      paused = false;
      threadController?.setPaused(false);
      break;
    case 'pause':
      paused = true;
      threadController?.setPaused(true);
      break;
    case 'step':
      threadController?.advanceOneFrame();
      break;
    case 'rate':
      rateScale = message.scale;
      threadController?.setRateScale(rateScale);
      break;
    case 'statKinds':
      statKinds = message.types;
      if (running && runningStatistics) postSummary(runningStatistics, running.time);
      break;
  }
};

/**
 * Loads a scenario (the default preset when absent) and starts running it, replacing the
 * current simulation. If it can't be loaded or isn't supported yet, reports the error and
 * keeps the current simulation running. Paused stays paused.
 */
async function load(
  source: ScenarioSource = { kind: 'preset', name: 'default' },
  arena: ArenaOptions = {},
): Promise<void> {
  const generation = ++loadGeneration;
  let prepared: Prepared;
  let built: Built;
  try {
    let input =
      source.kind === 'preset'
        ? await loadPresetScenario(source.name)
        : parseScenario(source.scenario);
    if (arena.size && arena.size.some((s, axis) => s !== input.arena.size[axis])) {
      // A new arena size re-places the particles (OPT-1); they must still fit.
      input = withArenaSize(input, arena.size);
      const [problem] = scenarioProblems(input);
      if (problem) throw new Error(problem);
    }
    const loaded = resolveScenario(input);
    // Drawn walls can't be combined with the piston yet (WALL-3).
    const canHavePiston =
      loaded.walls.length === 0 &&
      (loaded.arenaType === ArenaType.REFLECTING_BOUNDARIES ||
        loaded.arenaType === ArenaType.MOVABLE_PISTON);
    const canConduct =
      loaded.arenaType === ArenaType.DIVIDED_ARENA ||
      loaded.arenaType === ArenaType.DIVIDED_ARENA_WITH_HOLE;
    const canDemon = loaded.arenaType === ArenaType.DIVIDED_ARENA_WITH_HOLE;
    const scenario = { ...loaded };
    if (canDemon && arena.demon !== undefined) scenario.maxwellDemonMode = arena.demon;
    if (canHavePiston && arena.piston !== undefined) {
      scenario.arenaType = arena.piston
        ? ArenaType.MOVABLE_PISTON
        : ArenaType.REFLECTING_BOUNDARIES;
    }
    if (canConduct && arena.conductingDivider !== undefined) {
      scenario.dividerThermalMode = arena.conductingDivider
        ? DividerThermalMode.CONDUCTING
        : DividerThermalMode.INSULATING;
    }
    // Reactions: the scenario's rules. The sidebar's switch (Java's Reactions tab) edits
    // the Java rule, species 0 + 0 → 1 + 1, in 2D scenarios with a single species (a
    // "Reacted" copy of it is added for particles to turn into) or with that rule already
    // (`.set` files with reaction_mode TRUE, which get the tab's defaults).
    const [rule, ...otherRules] = scenario.reactions;
    const javaRule =
      rule !== undefined &&
      otherRules.length === 0 &&
      scenario.species.length === 2 &&
      rule.reactants.every((k) => k === 0) &&
      rule.products.every((k) => k === 1);
    const canReact =
      scenario.dimension === 2 &&
      ((scenario.species.length === 1 && rule === undefined) || javaRule);
    let reactions: ArenaOptions['reactions'] = javaRule
      ? { forward: rule.forward, reverse: rule.reverse, suppressReverse: rule.suppressReverse }
      : null;
    if (canReact && arena.reactions !== undefined) {
      reactions = arena.reactions;
      scenario.reactions = reactions
        ? [javaReaction(reactions.forward, reactions.reverse, reactions.suppressReverse)]
        : [];
    }
    if (reactions && scenario.species.length === 1) {
      const red = scenario.species[0]!;
      const empty = new Float64Array(0);
      scenario.species = [
        red,
        {
          ...red,
          kindId: 'reacted',
          marker: MARKERS[1]!,
          type: new ParticleType(
            red.type.particleMass,
            red.type.particleRadius,
            DefaultParticleInfo.BLUE,
            'Reacted',
          ),
          positions: empty,
          velocities: empty,
        },
      ];
    }
    const canHaveWells = scenario.arenaType !== ArenaType.PERIODIC_BOUNDARIES;
    const wells = canHaveWells && arena.wells ? arena.wells : null;
    const attractiveWall = canHaveWells && arena.attractiveWall ? arena.attractiveWall : null;
    const initialState = {
      ...scenario,
      ...(wells ? { wells } : {}),
      ...(attractiveWall ? { attractiveWall } : {}),
    };
    const arenaInfo: ArenaInfo = {
      canHavePiston,
      canConduct,
      canDemon,
      canHaveWells,
      canReact,
      typeNames: scenario.species.map((s) => s.type.displayName),
      size: [...input.arena.size],
      drawnWalls: scenario.walls.length > 0,
      gates: scenario.walls.flatMap((w, index) =>
        w.physics?.type === 'gate'
          ? [{ index, id: w.id, points: w.points.flat(), closed: w.closed ?? false }]
          : [],
      ),
      options: {
        piston: scenario.arenaType === ArenaType.MOVABLE_PISTON,
        conductingDivider: scenario.dividerThermalMode === DividerThermalMode.CONDUCTING,
        demon: canDemon && scenario.maxwellDemonMode,
        wells,
        attractiveWall,
        reactions,
        size: [...input.arena.size],
      },
    };
    const ctx = statsContext(scenario);
    prepared = {
      name: source.name,
      scenario,
      initialState,
      ctx,
      arenaInfo,
      speed: parseSimulationSpeed(scenario.simulationSpeed),
      typeColors: scenario.species.map((s) => s.type.defaultColor),
      viewingAngles: scenario.viewingAngles,
      view: viewOf(scenario, ctx),
    };
    built = build(prepared);
  } catch (error) {
    if (generation === loadGeneration) {
      post({ type: 'error', message: `Can't load ${source.name}: ${errorText(error)}` });
    }
    return;
  }
  if (generation !== loadGeneration || !frames) return;
  start(prepared, built);
}

/** A loaded scenario with the user's arena options applied, ready to (re)build. */
interface Prepared {
  name: string;
  scenario: ResolvedScenario;
  initialState: InitialState;
  ctx: StatsContext;
  arenaInfo: ArenaInfo;
  speed: number;
  typeColors: number[];
  viewingAngles: [number, number];
  view: ViewSettings;
}

interface Built {
  simulation: Simulation;
  statistics: Statistics;
  pressure: PressureMeter;
}

/** The scenario's averaging time in seconds (`.set` files give ps). */
const scenarioAveragingTime = (scenario: ResolvedScenario) =>
  scenario.pressureAveragingTime > 0
    ? scenario.pressureAveragingTime * 1e-12
    : DEFAULT_PRESSURE_AVERAGING_TIME;

/** The last simulation started, so Restart can build it again from the same state. */
let lastPrepared: Prepared | null = null;

/** Builds the simulation and its statistics from the prepared state. */
function build(prepared: Prepared): Built {
  let stats: Statistics | null = null;
  let meter: PressureMeter | null = null;
  const simulation = new Simulation(prepared.initialState, {
    onEvent: (event) => {
      stats?.notifyOfEvent(event);
      meter?.beforeEvent(event);
    },
    afterEvent: (event) => meter?.afterEvent(event),
  });
  const pressure = (meter = new PressureMeter(
    simulation,
    prepared.scenario.species.length,
    averagingTime ?? scenarioAveragingTime(prepared.scenario),
  ));
  const statistics = (stats = new Statistics(prepared.ctx, simulation.particles, {
    forgetMultiplier: prepared.scenario.forgetMultiplier,
    typeNames: prepared.scenario.species.map((s) => s.type.displayName),
    typeColors: prepared.typeColors,
    typeMarkers: prepared.scenario.species.map((s) => s.marker),
  }));
  return { simulation, statistics, pressure };
}

/**
 * Restart (Physics.reset): the same starting positions and velocities again, rather than
 * re-placing particles at random. Unlike Java's reset, a periodic arena's momentum is
 * zeroed again, so the run repeats the first exactly (joshuata/boltzmann4d#24).
 */
function restart(): void {
  if (!lastPrepared || !frames) return;
  ++loadGeneration; // a load still in flight mustn't replace the restarted run
  try {
    start(lastPrepared, build(lastPrepared));
  } catch (error) {
    post({ type: 'error', message: `Can't restart: ${errorText(error)}` });
  }
}

/** Runs a built simulation: streams its scene and frames, and reports it loaded. */
function start(prepared: Prepared, { simulation, statistics, pressure }: Built): void {
  const port = frames;
  if (!port) return;
  lastPrepared = prepared;
  threadController?.stopSimulationThreads();
  const send = (message: RenderStream, transfer: Transferable[]) =>
    port.postMessage(message, transfer);
  send(
    {
      type: 'scene',
      scene: sceneOf(simulation, prepared),
    },
    [],
  );

  let lastSummary = -Infinity;
  let lastPressure = -Infinity;
  const controller = new ThreadController(
    simulation,
    (frame, physicsMs) => {
      send({ type: 'frame', frame }, [
        frame.positions.buffer,
        frame.types.buffer,
        frame.speeds.buffer,
      ]);
      const piston = simulation.piston;
      post({
        type: 'timing',
        physicsMs,
        time: frame.time,
        piston: piston
          ? { level: piston.curLevel, moving: piston.isMoving(simulation.time) }
          : undefined,
        holeOpen: simulation.arena.maxwellDemonMode ? simulation.holeOpen : undefined,
        openGates: frame.openGates ? [...frame.openGates] : undefined,
      });
      const now = performance.now();
      if (now - lastPressure >= PRESSURE_INTERVAL_MS || controller.isPaused()) {
        lastPressure = now;
        post({ type: 'pressure', reading: pressure.read() });
      }
      if (now - lastSummary >= SUMMARY_INTERVAL_MS || controller.isPaused()) {
        lastSummary = now;
        statistics.sampleCurrent();
        postSummary(statistics, simulation.time);
      }
    },
    { speed: prepared.speed, rateScale },
  );
  threadController = controller;
  running = simulation;
  runningStatistics = statistics;
  runningPressure = pressure;
  statKinds = null; // a new scenario has its own kinds
  threadController.setPaused(paused);
  threadController.startSimulationThreads();
  threadController.showCurrentFrame();
  post({
    type: 'loaded',
    name: prepared.name,
    particles: simulation.particles.count,
    arena: prepared.arenaInfo,
    piston: simulation.piston
      ? { maxLevel: simulation.maxPistonLevel(), arenaHeight: simulation.arena.ySize }
      : undefined,
    dimension: simulation.dimension,
    kinds: prepared.scenario.species.map((s, t) => ({
      name: s.type.displayName,
      color: prepared.typeColors[t]!,
      marker: s.marker,
    })),
    view: {
      markers: prepared.scenario.markers,
      colorMode: prepared.view.colorMode,
      trace: prepared.view.trace,
      arenaWidth: simulation.arena.xSize,
      arenaHeight: simulation.arena.ySize,
    },
    pressure: {
      averagingTime: averagingTime ?? scenarioAveragingTime(prepared.scenario),
      prediction: prepared.scenario.pressurePredictionMode,
    },
  });
}

function sceneOf(simulation: Simulation, prepared: Prepared): SceneInfo {
  const { typeColors, viewingAngles, view, scenario } = prepared;
  const p = simulation.particles;
  const arena = simulation.arena;
  const divided =
    arena.type === ArenaType.DIVIDED_ARENA || arena.type === ArenaType.DIVIDED_ARENA_WITH_HOLE;
  const hole = arena.type === ArenaType.DIVIDED_ARENA_WITH_HOLE;
  return {
    dimension: simulation.dimension,
    arenaXSize: arena.xSize,
    arenaYSize: arena.ySize,
    arenaZSize: arena.zSize,
    periodic: arena.type === ArenaType.PERIODIC_BOUNDARIES,
    radii: p.radius.slice(),
    types: p.type.slice(),
    typeColors,
    // Always sent, so the View menu can turn them on; the scenario says whether they start on.
    typeMarkers: scenario.species.map((s) => s.marker),
    walls: scenario.walls.map((w) => ({
      points: Float64Array.from(w.points.flat()),
      closed: w.closed ?? false,
      color: w.style.color,
      lineWidth: w.style.lineWidth,
      dash: w.style.dash,
      gate: w.physics?.type === 'gate',
      well: w.physics?.type === 'attractive' ? w.physics.width : undefined,
    })),
    viewingAngles,
    divider: divided
      ? {
          leftX: arena.barrierLeftX,
          rightX: arena.barrierRightX,
          edgeY: hole ? arena.edgeY.slice() : undefined,
          edgeZ: hole ? arena.edgeZ.slice() : undefined,
          edgeRadius: arena.edgeRadius,
          holeDiameter: hole ? arena.holeDiameter : undefined,
          demon: hole && arena.maxwellDemonMode,
        }
      : undefined,
    piston: simulation.piston
      ? { valveRadius: PISTON_VALVE_RADIUS, shaftRadius: PISTON_SHAFT_RADIUS }
      : undefined,
    masses: p.mass.slice(),
    colorLimits: view.colorLimits,
    colorMode: view.colorMode,
    trace: view.trace,
  };
}

/** The scenario's view settings and the colour-mode limits (MainGuiFullView). */
function viewOf(scenario: ResolvedScenario, ctx: StatsContext): ViewSettings {
  const all = ctx.types.map((_, t) => t);
  const speed = weightedAverage(ctx, all, (t) =>
    averageVelocity(ctx.types[t]!.initialTemperature, ctx.types[t]!.mass * AMU_KG, ctx.dimension),
  );
  const energy = weightedAverage(ctx, all, (t) =>
    convert('J', 'kJ/mol', avgKineticEnergy(ctx.types[t]!.initialTemperature, ctx.dimension)),
  );
  const mode = scenario.coloringMode;
  return {
    colorLimits: { speed: 2.5 * speed, energy: 2.5 * energy },
    colorMode: mode === 'SPEED' || mode === 'KE' ? mode : 'NORMAL',
    trace: { enabled: scenario.traceMode, pointSize: scenario.tracePointSize || 2 },
  };
}

interface ViewSettings {
  colorLimits: { speed: number; energy: number };
  colorMode: ColorMode;
  trace: { enabled: boolean; pointSize: number };
}
