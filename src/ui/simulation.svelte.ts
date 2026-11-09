// Main-thread handle on the simulation worker; the UI's side of ThreadController.
import type { RenderFrame, SceneInfo } from '../sim';
import type { FromWorker, ToWorker } from '../worker';
import SimWorker from '../worker/sim.worker?worker';

export interface SimulationClientHandlers {
  onScene: (scene: SceneInfo) => void;
  onFrame: (frame: RenderFrame) => void;
}

export class SimulationClient {
  /** The worker starts running, matching `new PlayPauseButton(false)` in the Java app. */
  paused = $state(false);
  /** Wall-clock milliseconds the physics took for the latest frame. */
  physicsMs = $state(0);
  /** Set if the worker failed to start the simulation. */
  error = $state<string | null>(null);

  readonly #worker: Worker;

  constructor({ onScene, onFrame }: SimulationClientHandlers) {
    this.#worker = new SimWorker();
    this.#worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data;
      switch (message.type) {
        case 'scene':
          onScene(message.scene);
          break;
        case 'frame':
          this.physicsMs = message.physicsMs;
          onFrame(message.frame);
          break;
        case 'error':
          this.error = message.message;
          break;
      }
    };
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.#send({ type: paused ? 'pause' : 'play' });
  }

  advanceOneFrame(): void {
    if (this.paused) this.#send({ type: 'step' });
  }

  dispose(): void {
    this.#worker.terminate();
  }

  #send(message: ToWorker): void {
    this.#worker.postMessage(message);
  }
}
