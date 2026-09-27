/**
 * The export worker's side (bound in `src/workers/export.worker.ts`): loads the template, fonts
 * and files, runs the export and reports back. Its own compositor and text engine, so previews
 * keep playing in the render worker.
 */

import { graphicFromTransfer } from '../assets/transfer';
import type { Graphic } from '../assets/types';
import { createCompositor } from '../compositor';
import type { AnyTemplate } from '../template/define';
import { pairingFonts } from '../template/pairings';
import { sanitizeState } from '../template/state';
import { createTextEngine } from '../text/engine';
import { createFetchLoader } from '../text/font-source';
import { createFallbackMeasure } from '../text/measure';
import { verifyEncoders } from './probe';
import type { ExportMessage, ExportRequest } from './protocol';
import { runExport } from './run';
import { ExportError } from './sinks';

export type ExportScope = {
  postMessage(message: ExportMessage, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ExportRequest>) => void): void;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function serveExportWorker(
  scope: ExportScope,
  loadTemplate: (id: string) => Promise<AnyTemplate>,
): void {
  let controller: AbortController | null = null;
  const post = (message: ExportMessage, transfer: Transferable[] = []) =>
    scope.postMessage(message, transfer);

  const start = async (request: Extract<ExportRequest, { type: 'start' }>, signal: AbortSignal) => {
    let stage: ExportError['stage'] = 'load';
    try {
      const template = await loadTemplate(request.job.state.templateId);
      const state = sanitizeState(template, request.job.state);
      const text = await createTextEngine({
        loadBytes: createFetchLoader(),
        measureFallback: createFallbackMeasure(),
      });
      await text.load(pairingFonts(state.pairing));
      const assets = new Map<string, Graphic>(
        request.assets.map(({ hash, asset }) => [hash, graphicFromTransfer(asset)]),
      );
      stage = 'save';
      const writable = request.file ? await request.file.createWritable() : undefined;
      stage = 'render';
      const result = await runExport(
        { state, settings: request.job.settings },
        {
          template,
          text,
          assets: (hash) => assets.get(hash),
          compositor: createCompositor(),
          writable,
          signal,
          onProgress: (progress) => post({ type: 'progress', ...progress }),
          onPreview: (frame, t) => post({ type: 'preview', frame, t }, [frame]),
        },
      );
      if (request.file && result.blob === null) result.bytes = (await request.file.getFile()).size;
      post({ type: 'done', result });
    } catch (error) {
      if (signal.aborted) post({ type: 'cancelled' });
      else if (error instanceof ExportError) {
        post({ type: 'error', stage: error.stage, message: error.message });
      } else post({ type: 'error', stage, message: messageOf(error) });
    }
  };

  scope.addEventListener('message', (event) => {
    const request = event.data;
    if (request.type === 'probe') {
      void verifyEncoders().then((encoders) => post({ type: 'probed', encoders }));
      return;
    }
    if (request.type === 'cancel') {
      controller?.abort();
      return;
    }
    if (controller) {
      post({ type: 'error', stage: 'load', message: 'An export is already running' });
      return;
    }
    const current = new AbortController();
    controller = current;
    void start(request, current.signal).finally(() => {
      if (controller === current) controller = null;
    });
  });
}
