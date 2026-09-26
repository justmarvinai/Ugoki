/**
 * The render worker (docs/06-engine.md §3): the composition root that binds the engine's render
 * runtime to the template registry. Templates load lazily, inside this worker only.
 */

import { serveRenderWorker } from '@/engine/host/serve';
import { loadTemplate } from '@/templates/registry';

serveRenderWorker(self, loadTemplate);
