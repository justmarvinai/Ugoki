/** The export worker as tests build it (Vite), mirroring src/workers/export.worker.ts. */

import { serveExportWorker } from '@/engine/export/serve';
import { loadTemplate } from '@/templates/registry';

serveExportWorker(self as unknown as Parameters<typeof serveExportWorker>[0], loadTemplate);
