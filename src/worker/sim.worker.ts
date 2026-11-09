// Simulation Web Worker entry: owns Physics and paces it with ThreadController.
import { Physics } from '../sim';
import type { FromWorker, ToWorker } from './index';
import { ThreadController } from './ThreadController';

const scope = self as unknown as DedicatedWorkerGlobalScope;

const threadController = new ThreadController(new Physics(), (frame) => {
  const message: FromWorker = { type: 'frame', frame };
  scope.postMessage(message, [frame.positions.buffer, frame.types.buffer]);
});

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  switch (event.data.type) {
    case 'play':
      threadController.setPaused(false);
      break;
    case 'pause':
      threadController.setPaused(true);
      break;
    case 'step':
      threadController.advanceOneFrame();
      break;
  }
};

threadController.startSimulationThreads();
