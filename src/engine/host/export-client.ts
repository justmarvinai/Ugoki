/**
 * Main-thread side of exports (docs/07-export.md §3, §8): starts a job in an export worker,
 * holds a Web Lock while it runs (Chrome doesn't freeze pages holding one), relays progress
 * and preview frames, and resolves with the result. One worker per export.
 */

import type { ExportAsset, ExportMessage, ExportRequest } from '../export/protocol';
import type { ExportJob, ExportProgress, ExportResult } from '../export/run';
import type { ExportStage } from '../export/sinks';
import type { EncoderSupport } from '../runtime/capabilities';

/** A Worker, or anything with the same messaging shape. */
export type ExportEndpoint = {
  postMessage(message: ExportRequest, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ExportMessage>) => void): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<ExportMessage>) => void,
  ): void;
  terminate(): void;
};

/** A failed export, with the stage it failed in. */
export class ExportFailure extends Error {
  override name = 'ExportFailure';
  constructor(
    readonly stage: ExportStage,
    message: string,
  ) {
    super(message);
  }
}

export type ExportRun = {
  /** Resolves with the result, rejects with an ExportFailure, or an AbortError when cancelled. */
  readonly done: Promise<ExportResult>;
  cancel(): void;
};

export function startExport(
  endpoint: ExportEndpoint,
  job: ExportJob,
  options: {
    assets?: readonly ExportAsset[];
    file?: FileSystemFileHandle;
    onProgress?: (progress: ExportProgress) => void;
    onPreview?: (frame: ImageBitmap, t: number) => void;
  } = {},
): ExportRun {
  let settle: { resolve: (r: ExportResult) => void; reject: (e: unknown) => void } | null = null;
  const done = new Promise<ExportResult>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const listener = (event: MessageEvent<ExportMessage>) => {
    const message = event.data;
    switch (message.type) {
      case 'progress':
        options.onProgress?.(message);
        break;
      case 'preview':
        if (options.onPreview) options.onPreview(message.frame, message.t);
        else message.frame.close();
        break;
      case 'done':
        settle?.resolve(message.result);
        break;
      case 'cancelled':
        settle?.reject(new DOMException('Export cancelled', 'AbortError'));
        break;
      case 'error':
        settle?.reject(new ExportFailure(message.stage, message.message));
        break;
    }
  };
  endpoint.addEventListener('message', listener);
  const assets = options.assets ?? [];
  const transfer = assets.flatMap(({ asset }) => (asset.kind === 'raster' ? [asset.bitmap] : []));
  endpoint.postMessage(
    { type: 'start', job, assets, ...(options.file ? { file: options.file } : {}) },
    transfer,
  );
  const finished = done.finally(() => {
    endpoint.removeEventListener('message', listener);
    endpoint.terminate();
  });
  // Hold a Web Lock while exporting: pages holding one aren't frozen in the background.
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('ugoki-export', { mode: 'shared' }, () =>
      finished.catch(() => undefined),
    );
  }
  return {
    done: finished,
    cancel: () => endpoint.postMessage({ type: 'cancel' }, []),
  };
}

/** How long a probe may take before its answer is given up on (a stuck encoder, a crash). */
const PROBE_TIMEOUT = 15_000;

/**
 * Which video formats work in this browser, verified by round trips in an export worker
 * (ADR-034); null if the worker doesn't answer. The worker is terminated afterwards.
 */
export function probeExport(endpoint: ExportEndpoint): Promise<EncoderSupport | null> {
  return new Promise((resolve) => {
    const finish = (encoders: EncoderSupport | null) => {
      clearTimeout(timer);
      endpoint.removeEventListener('message', listener);
      endpoint.terminate();
      resolve(encoders);
    };
    const listener = (event: MessageEvent<ExportMessage>) => {
      if (event.data.type === 'probed') finish(event.data.encoders);
    };
    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT);
    endpoint.addEventListener('message', listener);
    endpoint.postMessage({ type: 'probe' }, []);
  });
}
