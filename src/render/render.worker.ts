// Render worker: draws the simulation on an OffscreenCanvas handed over by the main
// thread, with frames streamed straight from the physics worker (see protocol.ts).
import { createRenderer, type Renderer } from './index';
import type { FromRenderWorker, RenderStream, ToRenderWorker } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let renderer: Renderer | null = null;

const fail = (error: unknown) => {
  const message: FromRenderWorker = {
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
  };
  scope.postMessage(message);
};

scope.onmessage = (event: MessageEvent<ToRenderWorker>) => {
  const message = event.data;
  try {
    switch (message.type) {
      case 'init': {
        const active = createRenderer(message.canvas, message.size);
        renderer = active;
        message.frames.onmessage = (e: MessageEvent<RenderStream>) => {
          if (e.data.type === 'scene') active.setScene(e.data.scene);
          else active.setNextFrameToDisplay(e.data.frame);
        };
        break;
      }
      case 'resize':
        renderer?.setSize(message.size);
        break;
    }
  } catch (error) {
    fail(error);
  }
};
