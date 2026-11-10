// Simulation Web Worker entry: builds the Simulation from a settings file, paces it with
// ThreadController, and streams frames to the renderer over the port it is given.
import { loadDefaultSettingsText, loadPresetText, loadSettings } from '../io';
import type { RenderStream } from '../render/protocol';
import { Simulation, type SceneInfo } from '../sim';
import { ArenaType } from '../sim/simulation-info';
import type { FromWorker, ToWorker } from './index';
import { ThreadController } from './thread-controller';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: FromWorker) => scope.postMessage(message);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

let frames: MessagePort | null = null;
let threadController: ThreadController | null = null;
let paused = false;
/** Bumped per load request, so a slow load can't replace a newer one. */
let loadGeneration = 0;

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case 'connect':
      frames = message.frames;
      void load(message.preset);
      break;
    case 'load':
      void load(message.preset);
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
  }
};

/**
 * Loads a preset (default.set when absent) and starts running it, replacing the current
 * simulation. If the preset can't be loaded or isn't supported yet, reports the error and
 * keeps the current simulation running. Paused stays paused.
 */
async function load(preset?: string): Promise<void> {
  const generation = ++loadGeneration;
  let simulation: Simulation;
  let typeColors: number[];
  try {
    const text = preset ? await loadPresetText(preset) : await loadDefaultSettingsText();
    const { settings } = loadSettings(text);
    simulation = new Simulation(settings);
    typeColors = settings.species.map((s) => s.type.defaultColor);
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
  send({ type: 'scene', scene: sceneOf(simulation, typeColors) }, []);

  threadController = new ThreadController(simulation, (frame, physicsMs) => {
    send({ type: 'frame', frame }, [frame.positions.buffer, frame.types.buffer]);
    post({ type: 'timing', physicsMs });
  });
  threadController.setPaused(paused);
  threadController.startSimulationThreads();
  // While paused, show the starting state straight away (a no-op while running).
  threadController.advanceOneFrame();
  post({ type: 'loaded', preset: preset ?? 'default', particles: simulation.particles.count });
}

function sceneOf(simulation: Simulation, typeColors: number[]): SceneInfo {
  const p = simulation.particles;
  const arena = simulation.arena;
  const divided =
    arena.type === ArenaType.DIVIDED_ARENA || arena.type === ArenaType.DIVIDED_ARENA_WITH_HOLE;
  return {
    dimension: simulation.dimension,
    arenaXSize: arena.xSize,
    arenaYSize: arena.ySize,
    arenaZSize: arena.zSize,
    radii: p.radius.slice(),
    types: p.type.slice(),
    typeColors,
    divider: divided
      ? {
          leftX: arena.barrierLeftX,
          rightX: arena.barrierRightX,
          edgeY: arena.type === ArenaType.DIVIDED_ARENA_WITH_HOLE ? arena.edgeY : undefined,
          edgeRadius: arena.edgeRadius,
        }
      : undefined,
  };
}
