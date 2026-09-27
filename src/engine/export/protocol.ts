/**
 * Export worker protocol (docs/07-export.md §3). One worker per export: the page sends the
 * job, the user's files it uses and — where the browser can write files as they're made — a
 * handle to the file the user picked; the worker reports progress, small preview frames and
 * the result.
 */

import type { TransferableGraphic } from '../host/protocol';
import type { EncoderSupport } from '../runtime/capabilities';
import type { ExportJob, ExportProgress, ExportResult } from './run';
import type { ExportStage } from './sinks';

export type ExportAsset = { hash: string; asset: TransferableGraphic };

export type ExportRequest =
  | {
      type: 'start';
      job: ExportJob;
      assets: readonly ExportAsset[];
      /** The file the user picked (written as the export goes), if any. */
      file?: FileSystemFileHandle;
    }
  | { type: 'cancel' }
  /** Which video formats work here (round trips); answered with `probed`. */
  | { type: 'probe' };

export type ExportMessage =
  | ({ type: 'progress' } & ExportProgress)
  | { type: 'preview'; frame: ImageBitmap; t: number }
  | { type: 'done'; result: ExportResult }
  | { type: 'cancelled' }
  | { type: 'error'; stage: ExportStage; message: string }
  | { type: 'probed'; encoders: EncoderSupport };
