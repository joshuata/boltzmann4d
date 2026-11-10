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

let threadController: ThreadController | null = null;
// Controls that arrive while the settings file is still loading.
let pausedBeforeStart = false;

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case 'connect':
      start(message.frames, message.preset).catch((error: unknown) => {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      });
      break;
    case 'play':
      if (threadController) threadController.setPaused(false);
      else pausedBeforeStart = false;
      break;
    case 'pause':
      if (threadController) threadController.setPaused(true);
      else pausedBeforeStart = true;
      break;
    case 'step':
      threadController?.advanceOneFrame();
      break;
  }
};

async function start(frames: MessagePort, preset?: string): Promise<void> {
  const send = (message: RenderStream, transfer: Transferable[]) =>
    frames.postMessage(message, transfer);

  const text = preset ? await loadPresetText(preset) : await loadDefaultSettingsText();
  const { settings } = loadSettings(text);
  const simulation = new Simulation(settings);
  const p = simulation.particles;
  const arena = simulation.arena;
  const divided =
    arena.type === ArenaType.DIVIDED_ARENA || arena.type === ArenaType.DIVIDED_ARENA_WITH_HOLE;
  const scene: SceneInfo = {
    dimension: simulation.dimension,
    arenaXSize: simulation.arena.xSize,
    arenaYSize: simulation.arena.ySize,
    arenaZSize: simulation.arena.zSize,
    radii: p.radius.slice(),
    types: p.type.slice(),
    typeColors: settings.species.map((s) => s.type.defaultColor),
    divider: divided
      ? {
          leftX: arena.barrierLeftX,
          rightX: arena.barrierRightX,
          edgeY: arena.type === ArenaType.DIVIDED_ARENA_WITH_HOLE ? arena.edgeY : undefined,
          edgeRadius: arena.edgeRadius,
        }
      : undefined,
  };
  send({ type: 'scene', scene }, [scene.radii.buffer, scene.types.buffer]);

  threadController = new ThreadController(simulation, (frame, physicsMs) => {
    send({ type: 'frame', frame }, [frame.positions.buffer, frame.types.buffer]);
    post({ type: 'timing', physicsMs });
  });
  threadController.setPaused(pausedBeforeStart);
  threadController.startSimulationThreads();
}
