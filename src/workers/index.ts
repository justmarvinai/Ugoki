/** Creates the workers features talk to (module workers, or in-thread for debugging). */

import type { ExportEndpoint, RenderEndpoint } from '@/engine/host';

export async function createRenderEndpoint(
  options: { inline?: boolean } = {},
): Promise<RenderEndpoint> {
  if (options.inline || typeof Worker === 'undefined') {
    const [{ createInlineEndpoint }, { loadTemplate }] = await Promise.all([
      import('@/engine/host/inline'),
      import('@/templates/registry'),
    ]);
    return createInlineEndpoint(loadTemplate);
  }
  return new Worker(new URL('./render.worker.ts', import.meta.url), {
    type: 'module',
    name: 'ugoki-render',
  });
}

/** A fresh export worker (one per export; the client terminates it when the export ends). */
export function createExportEndpoint(): ExportEndpoint {
  return new Worker(new URL('./export.worker.ts', import.meta.url), {
    type: 'module',
    name: 'ugoki-export',
  });
}
