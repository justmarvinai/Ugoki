/**
 * The export worker (docs/07-export.md §3): the composition root that binds the engine's export
 * pipeline to the template registry. One per export.
 */

import { serveExportWorker } from '@/engine/export/serve';
import { loadTemplate } from '@/templates/registry';

serveExportWorker(self as unknown as Parameters<typeof serveExportWorker>[0], loadTemplate);
