// Simulation Web Worker entry: builds the Simulation from a scenario (a preset .set file for now), paces it with
// ThreadController, and streams frames to the renderer over the port it is given.
import { loadDefaultSetFileText, loadPresetText, loadSetFile } from '@boltzmann4d/engine/io';
import type { RenderStream } from '../render/protocol';
import type { ResolvedScenario } from '@boltzmann4d/engine/io';
import {
  Simulation,
  type ColorMode,
  type InitialState,
  type SceneInfo,
} from '@boltzmann4d/engine/sim';
import { DefaultParticleInfo, ParticleType } from '@boltzmann4d/engine/sim/particle-type';
import { averageVelocity, avgKineticEnergy } from '@boltzmann4d/engine/stats/formulas';
import {
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
import type { ArenaInfo, ArenaOptions, FromWorker, ToWorker } from './index';
import { parseSimulationSpeed, ThreadController } from './thread-controller';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: FromWorker) => scope.postMessage(message);
/** Statistics are summarised about this often (real milliseconds), like the Java app. */
const SUMMARY_INTERVAL_MS = 1000;

/** The Reactions tab's defaults: forward and reverse activation energies, kJ/mol. */

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

let frames: MessagePort | null = null;
let threadController: ThreadController | null = null;
let running: Simulation | null = null;
let paused = false;
/** The user's speed multiplier on top of each preset's own speed. */
let rateScale = 1;
/** Bumped per load request, so a slow load can't replace a newer one. */
let loadGeneration = 0;

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case 'connect':
      frames = message.frames;
      void load(message.preset, message.arena);
      break;
    case 'load':
      void load(message.preset, message.arena);
      break;
    case 'restart':
      restart();
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
  }
};

/**
 * Loads a preset (default.set when absent) and starts running it, replacing the current
 * simulation. If the preset can't be loaded or isn't supported yet, reports the error and
 * keeps the current simulation running. Paused stays paused.
 */
async function load(preset?: string, arena: ArenaOptions = {}): Promise<void> {
  const generation = ++loadGeneration;
  let prepared: Prepared;
  let built: Built;
  try {
    const text = preset ? await loadPresetText(preset) : await loadDefaultSetFileText();
    const { scenario: loaded } = loadSetFile(text);
    const canHavePiston =
      loaded.arenaType === ArenaType.REFLECTING_BOUNDARIES ||
      loaded.arenaType === ArenaType.MOVABLE_PISTON;
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
    // Reactions (as Java's Reactions tab): one species plus a "Reacted" copy of it that
    // particles turn into. Scenarios with a reaction rule get it with the rule's energies;
    // `.set` files with reaction_mode TRUE get the tab's defaults (Java ignored the key).
    const canReact = scenario.dimension === 2 && scenario.species.length === 1;
    const reactions = canReact
      ? arena.reactions !== undefined
        ? arena.reactions
        : scenario.reaction
          ? { ...scenario.reaction }
          : null
      : null;
    if (reactions) {
      const red = scenario.species[0]!;
      const empty = new Float64Array(0);
      scenario.species = [
        red,
        {
          ...red,
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
      ...(reactions ? { reactions } : {}),
    };
    const arenaInfo: ArenaInfo = {
      canHavePiston,
      canConduct,
      canDemon,
      canHaveWells,
      canReact,
      typeNames: scenario.species.map((s) => s.type.displayName),
      options: {
        piston: scenario.arenaType === ArenaType.MOVABLE_PISTON,
        conductingDivider: scenario.dividerThermalMode === DividerThermalMode.CONDUCTING,
        demon: canDemon && scenario.maxwellDemonMode,
        wells,
        attractiveWall,
        reactions,
      },
    };
    const ctx = statsContext(scenario);
    prepared = {
      preset: preset ?? 'default',
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
      post({ type: 'error', message: `Can't load ${preset ?? 'default'}: ${errorText(error)}` });
    }
    return;
  }
  if (generation !== loadGeneration || !frames) return;
  start(prepared, built);
}

/** A loaded scenario with the user's arena options applied, ready to (re)build. */
interface Prepared {
  preset: string;
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
}

/** The last simulation started, so Restart can build it again from the same state. */
let lastPrepared: Prepared | null = null;

/** Builds the simulation and its statistics from the prepared state. */
function build(prepared: Prepared): Built {
  let stats: Statistics | null = null;
  const simulation = new Simulation(prepared.initialState, {
    onEvent: (event) => stats?.notifyOfEvent(event),
  });
  const statistics = (stats = new Statistics(prepared.ctx, simulation.particles, {
    forgetMultiplier: prepared.scenario.forgetMultiplier,
    typeNames: prepared.scenario.species.map((s) => s.type.displayName),
    typeColors: prepared.typeColors,
  }));
  return { simulation, statistics };
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
function start(prepared: Prepared, { simulation, statistics }: Built): void {
  const port = frames;
  if (!port) return;
  lastPrepared = prepared;
  threadController?.stopSimulationThreads();
  const send = (message: RenderStream, transfer: Transferable[]) =>
    port.postMessage(message, transfer);
  send(
    {
      type: 'scene',
      scene: sceneOf(simulation, prepared.typeColors, prepared.viewingAngles, prepared.view),
    },
    [],
  );

  let lastSummary = -Infinity;
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
      });
      const now = performance.now();
      if (now - lastSummary >= SUMMARY_INTERVAL_MS || controller.isPaused()) {
        lastSummary = now;
        statistics.sampleCurrent();
        post({ type: 'statistics', summary: statistics.summary(simulation.time) });
      }
    },
    { speed: prepared.speed, rateScale },
  );
  threadController = controller;
  running = simulation;
  threadController.setPaused(paused);
  threadController.startSimulationThreads();
  threadController.showCurrentFrame();
  post({
    type: 'loaded',
    preset: prepared.preset,
    particles: simulation.particles.count,
    arena: prepared.arenaInfo,
    piston: simulation.piston
      ? { maxLevel: simulation.maxPistonLevel(), arenaHeight: simulation.arena.ySize }
      : undefined,
    dimension: simulation.dimension,
    view: {
      colorMode: prepared.view.colorMode,
      trace: prepared.view.trace,
      arenaWidth: simulation.arena.xSize,
      arenaHeight: simulation.arena.ySize,
    },
  });
}

function sceneOf(
  simulation: Simulation,
  typeColors: number[],
  viewingAngles: [number, number],
  view: ViewSettings,
): SceneInfo {
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
