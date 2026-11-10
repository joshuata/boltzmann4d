// Simulation Web Worker entry: builds the Simulation from a settings file, paces it with
// ThreadController, and streams frames to the renderer over the port it is given.
import { loadDefaultSettingsText, loadSettings } from '../io';
import type { RenderStream } from '../render/protocol';
import { Simulation, type SceneInfo } from '../sim';
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
      start(message.frames).catch((error: unknown) => {
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

async function start(frames: MessagePort): Promise<void> {
  const send = (message: RenderStream, transfer: Transferable[]) =>
    frames.postMessage(message, transfer);

  const { settings } = loadSettings(await loadDefaultSettingsText());
  const simulation = new Simulation(settings);
  const p = simulation.particles;
  const scene: SceneInfo = {
    dimension: simulation.dimension,
    arenaXSize: simulation.arena.xSize,
    arenaYSize: simulation.arena.ySize,
    arenaZSize: simulation.arena.zSize,
    radii: p.radius.slice(),
    types: p.type.slice(),
    typeColors: settings.species.map((s) => s.type.defaultColor),
  };
  send({ type: 'scene', scene }, [scene.radii.buffer, scene.types.buffer]);

  threadController = new ThreadController(simulation, (frame, physicsMs) => {
    send({ type: 'frame', frame }, [frame.positions.buffer, frame.types.buffer]);
    post({ type: 'timing', physicsMs });
  });
  threadController.setPaused(pausedBeforeStart);
  threadController.startSimulationThreads();
}
