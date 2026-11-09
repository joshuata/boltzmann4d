// Simulation Web Worker entry: builds the Simulation from a settings file and paces it
// with ThreadController.
import { loadDefaultSettingsText, loadSettings } from '../io';
import { Simulation, type SceneInfo } from '../sim';
import type { FromWorker, ToWorker } from './index';
import { ThreadController } from './thread-controller';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: FromWorker, transfer: Transferable[] = []) =>
  scope.postMessage(message, transfer);

let threadController: ThreadController | null = null;
// Messages that arrive while the settings file is still loading.
let pausedBeforeStart = false;

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  switch (event.data.type) {
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

async function start(): Promise<void> {
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
  post({ type: 'scene', scene }, [scene.radii.buffer, scene.types.buffer]);

  threadController = new ThreadController(simulation, (frame, physicsMs) => {
    post({ type: 'frame', frame, physicsMs }, [frame.positions.buffer, frame.types.buffer]);
  });
  threadController.setPaused(pausedBeforeStart);
  threadController.startSimulationThreads();
}

start().catch((error: unknown) => {
  post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
});
