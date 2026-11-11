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
        setInterval(() => {
          const drawn: FromRenderWorker = { type: 'drawn', frames: active.framesDrawn() };
          scope.postMessage(drawn);
        }, 1000);
        message.frames.onmessage = (e: MessageEvent<RenderStream>) => {
          if (e.data.type === 'scene') active.setScene(e.data.scene);
          else if (e.data.type === 'colorLimits') active.setColorLimits(e.data.limits);
          else active.setNextFrameToDisplay(e.data.frame);
        };
        break;
      }
      case 'resize':
        renderer?.setSize(message.size);
        break;
      case 'zoom':
        renderer?.setZoom(message.zoom);
        break;
      case 'rotate':
        renderer?.rotate(message.aboutX, message.aboutY);
        break;
      case 'colorMode':
        renderer?.setColorMode(message.mode);
        break;
      case 'trace':
        renderer?.setTrace(message.enabled, message.pointSize);
        break;
      case 'clearTrace':
        renderer?.clearTrace();
        break;
      case 'markers':
        renderer?.setMarkers(message.enabled);
        break;
      case 'theme':
        renderer?.setTheme(message.theme);
        break;
    }
  } catch (error) {
    fail(error);
  }
};
