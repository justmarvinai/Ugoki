/** Binds a RenderRuntime to a worker scope (or anything with the same messaging shape). */

import type { HostMessage, WorkerMessage } from './protocol';
import { RenderRuntime, type TemplateLoader } from './runtime';

export type MessageScope = {
  postMessage(message: WorkerMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<HostMessage>) => void): void;
};

export function serveRenderWorker(
  scope: MessageScope,
  loadTemplate: TemplateLoader,
): RenderRuntime {
  const runtime = new RenderRuntime({
    post: (message) => scope.postMessage(message),
    loadTemplate,
  });
  scope.addEventListener('message', (event) => runtime.handle(event.data));
  return runtime;
}
