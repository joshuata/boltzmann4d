// Main-thread handle on the simulation worker; the UI's side of ThreadController.
import type { RenderFrame } from '../sim';
import type { FromWorker, ToWorker } from '../worker';
import SimWorker from '../worker/sim.worker?worker';

export class SimulationClient {
  /** The worker starts running, matching `new PlayPauseButton(false)` in the Java app. */
  paused = $state(false);

  readonly #worker: Worker;

  constructor(onFrame: (frame: RenderFrame) => void) {
    this.#worker = new SimWorker();
    this.#worker.onmessage = (event: MessageEvent<FromWorker>) => {
      if (event.data.type === 'frame') onFrame(event.data.frame);
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
