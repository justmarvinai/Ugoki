/** Creates the endpoint features render through (a module worker, or in-thread for debugging). */

import type { RenderEndpoint } from '@/engine/host';

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
