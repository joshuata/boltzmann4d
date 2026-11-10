// Simulation Web Worker entry: builds the Simulation from a settings file, paces it with
// ThreadController, and streams frames to the renderer over the port it is given.
import { loadDefaultSettingsText, loadPresetText, loadSettings } from '../io';
import type { RenderStream } from '../render/protocol';
import { Simulation, type SceneInfo } from '../sim';
import { Statistics, statsContext } from '../stats';
import {
  ArenaType,
  DividerThermalMode,
  PISTON_SHAFT_RADIUS,
  PISTON_VALVE_RADIUS,
} from '../sim/simulation-info';
import type { ArenaInfo, ArenaOptions, FromWorker, ToWorker } from './index';
import { parseSimulationSpeed, ThreadController } from './thread-controller';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: FromWorker) => scope.postMessage(message);
/** Statistics are summarised about this often (real milliseconds), like the Java app. */
const SUMMARY_INTERVAL_MS = 1000;

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
  let simulation: Simulation;
  let statistics: Statistics;
  let typeColors: number[];
  let viewingAngles: [number, number];
  let speed: number;
  let arenaInfo: ArenaInfo;
  try {
    const text = preset ? await loadPresetText(preset) : await loadDefaultSettingsText();
    const { settings: loaded } = loadSettings(text);
    const canHavePiston =
      loaded.arenaType === ArenaType.REFLECTING_BOUNDARIES ||
      loaded.arenaType === ArenaType.MOVABLE_PISTON;
    const canConduct =
      loaded.arenaType === ArenaType.DIVIDED_ARENA ||
      loaded.arenaType === ArenaType.DIVIDED_ARENA_WITH_HOLE;
    const settings = { ...loaded };
    if (canHavePiston && arena.piston !== undefined) {
      settings.arenaType = arena.piston
        ? ArenaType.MOVABLE_PISTON
        : ArenaType.REFLECTING_BOUNDARIES;
    }
    if (canConduct && arena.conductingDivider !== undefined) {
      settings.dividerThermalMode = arena.conductingDivider
        ? DividerThermalMode.CONDUCTING
        : DividerThermalMode.INSULATING;
    }
    const canHaveWells = settings.arenaType !== ArenaType.PERIODIC_BOUNDARIES;
    const wells = canHaveWells && arena.wells ? arena.wells : null;
    const simulationSettings = wells ? { ...settings, wells } : settings;
    arenaInfo = {
      canHavePiston,
      canConduct,
      canHaveWells,
      typeNames: settings.species.map((s) => s.type.displayName),
      options: {
        piston: settings.arenaType === ArenaType.MOVABLE_PISTON,
        conductingDivider: settings.dividerThermalMode === DividerThermalMode.CONDUCTING,
        wells,
      },
    };
    speed = parseSimulationSpeed(settings.simulationSpeed);
    let stats: Statistics | null = null;
    simulation = new Simulation(simulationSettings, {
      onEvent: (event) => stats?.notifyOfEvent(event),
    });
    typeColors = settings.species.map((s) => s.type.defaultColor);
    viewingAngles = settings.viewingAngles;
    statistics = stats = new Statistics(statsContext(settings), simulation.particles, {
      forgetMultiplier: settings.forgetMultiplier,
      typeNames: settings.species.map((s) => s.type.displayName),
      typeColors,
    });
  } catch (error) {
    if (generation === loadGeneration) {
      post({ type: 'error', message: `Can't load ${preset ?? 'default'}: ${errorText(error)}` });
    }
    return;
  }
  if (generation !== loadGeneration || !frames) return;

  threadController?.stopSimulationThreads();
  const port = frames;
  const send = (message: RenderStream, transfer: Transferable[]) =>
    port.postMessage(message, transfer);
  send({ type: 'scene', scene: sceneOf(simulation, typeColors, viewingAngles) }, []);

  let lastSummary = -Infinity;
  const controller = new ThreadController(
    simulation,
    (frame, physicsMs) => {
      send({ type: 'frame', frame }, [frame.positions.buffer, frame.types.buffer]);
      const piston = simulation.piston;
      post({
        type: 'timing',
        physicsMs,
        time: frame.time,
        piston: piston
          ? { level: piston.curLevel, moving: piston.isMoving(simulation.time) }
          : undefined,
      });
      const now = performance.now();
      if (now - lastSummary >= SUMMARY_INTERVAL_MS || controller.isPaused()) {
        lastSummary = now;
        statistics.sampleCurrent();
        post({ type: 'statistics', summary: statistics.summary(simulation.time) });
      }
    },
    { speed, rateScale },
  );
  threadController = controller;
  running = simulation;
  threadController.setPaused(paused);
  threadController.startSimulationThreads();
  threadController.showCurrentFrame();
  post({
    type: 'loaded',
    preset: preset ?? 'default',
    particles: simulation.particles.count,
    arena: arenaInfo,
    piston: simulation.piston
      ? { maxLevel: simulation.maxPistonLevel(), arenaHeight: simulation.arena.ySize }
      : undefined,
    dimension: simulation.dimension,
  });
}

function sceneOf(
  simulation: Simulation,
  typeColors: number[],
  viewingAngles: [number, number],
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
        }
      : undefined,
    piston: simulation.piston
      ? { valveRadius: PISTON_VALVE_RADIUS, shaftRadius: PISTON_SHAFT_RADIUS }
      : undefined,
  };
}
