/**
 * Runs the render runtime on the calling thread behind the worker messaging shape — for
 * debugging (`/lab?worker=0`) and as a fallback where module workers are unavailable.
 * Messages are delivered asynchronously, as with a real worker, but are not cloned.
 */

import type { RenderEndpoint } from './client';
import type { WorkerMessage } from './protocol';
import { RenderRuntime, type TemplateLoader } from './runtime';

export function createInlineEndpoint(loadTemplate: TemplateLoader): RenderEndpoint {
  const listeners = new Set<(event: MessageEvent<WorkerMessage>) => void>();
  const runtime = new RenderRuntime({
    post: (message) =>
      queueMicrotask(() => {
        const event = new MessageEvent<WorkerMessage>('message', { data: message });
        for (const listener of listeners) listener(event);
      }),
    loadTemplate,
  });
  return {
    postMessage: (message) => queueMicrotask(() => runtime.handle(message)),
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    terminate: () => {
      runtime.dispose();
      listeners.clear();
    },
  };
}
