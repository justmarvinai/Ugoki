/** The render worker as tests build it (Vite), mirroring src/workers/render.worker.ts. */

import { serveRenderWorker } from '@/engine/host/serve';
import { loadTemplate } from '@/templates/registry';

serveRenderWorker(self, loadTemplate);
