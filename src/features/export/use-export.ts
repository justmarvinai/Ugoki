'use client';

/**
 * Exporting from the page (docs/07-export.md §7–8): asks where to save first where the browser
 * can stream into a file (so memory stays flat), otherwise downloads the result; keeps the
 * screen awake while the tab is visible; reports progress, a small preview of the frame being
 * exported, the result, or what failed — with details the user can copy (no telemetry: ADR-016).
 */

import { useEffect, useRef, useState } from 'react';
import {
  type Capabilities,
  EXTENSIONS,
  type ExportAsset,
  ExportFailure,
  type ExportJob,
  type ExportResult,
  type ExportRun,
  exportFileName,
  exportSize,
  MIME_TYPES,
  startExport,
} from '@/engine/host';
import { createExportEndpoint } from '@/workers';

export type ExportStatus =
  | { phase: 'idle' }
  | {
      phase: 'running';
      frame: number;
      frames: number;
      /** Seconds left (rolling estimate), once known. */
      remaining: number | null;
      preview: ImageBitmap | null;
    }
  | { phase: 'done'; result: ExportResult; url: string | null; saved: boolean }
  | { phase: 'error'; stage: string; message: string; details: string };

type SavePicker = (options: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

const savePicker = (): SavePicker | null =>
  typeof window !== 'undefined'
    ? ((window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker ?? null)
    : null;

/** Browsers that can write the file as the export goes (Chromium). */
export const canStreamToFile = () => savePicker() !== null;

function download(url: string, name: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
}

/** What an export error report contains: the setup, never the user's content. */
function errorDetails(
  job: ExportJob,
  capabilities: Capabilities | null,
  stage: string,
  message: string,
) {
  const { state, settings } = job;
  return JSON.stringify(
    {
      error: { stage, message },
      template: `${state.templateId}@${state.templateVersion}`,
      format: state.format,
      duration: state.duration,
      energy: state.energy,
      transparent: state.transparent,
      settings: { ...settings, backdrop: settings.backdrop?.kind },
      browser: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      capabilities,
    },
    null,
    2,
  );
}

export function useExport(capabilities: Capabilities | null) {
  const [status, setStatus] = useState<ExportStatus>({ phase: 'idle' });
  const run = useRef<ExportRun | null>(null);
  const url = useRef<string | null>(null);

  // Release the last file and stop a running export when the page goes away.
  useEffect(
    () => () => {
      run.current?.cancel();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  /**
   * Starts an export. Call it straight from the click: where supported, it first asks where to
   * save (that needs the user's gesture), then streams the file there.
   */
  const start = async (
    job: ExportJob,
    options: { cut: number | null; assets: () => Promise<ExportAsset[]>; save?: boolean },
  ) => {
    if (run.current) return;
    const size = exportSize(job.state.format, job.settings);
    const name = exportFileName({
      templateId: job.state.templateId,
      settings: job.settings,
      size,
      cut: options.cut,
    });
    let file: FileSystemFileHandle | undefined;
    const picker = savePicker();
    if (options.save !== false && picker) {
      const ext = EXTENSIONS[job.settings.format];
      try {
        file = await picker({
          suggestedName: name,
          types: [
            {
              description: ext.toUpperCase(),
              accept: { [MIME_TYPES[job.settings.format]]: [`.${ext}`] },
            },
          ],
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return; // closed the picker
        throw error;
      }
    }
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setStatus({ phase: 'running', frame: 0, frames: 0, remaining: null, preview: null });

    // Set from callbacks: kept in one object so they're read fresh at the end.
    const held: { wake: WakeLockSentinel | null; preview: ImageBitmap | null } = {
      wake: null,
      preview: null,
    };
    const keepAwake = async () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      held.wake = await navigator.wakeLock.request('screen').catch(() => null);
    };
    // The screen lock ends when the tab is hidden; take it again on return.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void keepAwake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void keepAwake();

    try {
      const current = startExport(createExportEndpoint(), job, {
        assets: await options.assets(),
        ...(file ? { file } : {}),
        onProgress: ({ frame, frames, elapsed }) => {
          const remaining =
            frame > 0 && frame < frames ? (elapsed / frame) * (frames - frame) : null;
          setStatus({ phase: 'running', frame, frames, remaining, preview: held.preview });
        },
        onPreview: (bitmap) => {
          held.preview?.close();
          held.preview = bitmap;
          setStatus((s) => (s.phase === 'running' ? { ...s, preview: bitmap } : s));
        },
      });
      run.current = current;
      const result = await current.done;
      const saved = result.blob === null;
      if (result.blob) {
        url.current = URL.createObjectURL(result.blob);
        download(url.current, result.name);
      }
      setStatus({ phase: 'done', result, url: url.current, saved });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus({ phase: 'idle' });
      } else {
        const stage = error instanceof ExportFailure ? error.stage : 'load';
        const message = error instanceof Error ? error.message : String(error);
        setStatus({
          phase: 'error',
          stage,
          message,
          details: errorDetails(job, capabilities, stage, message),
        });
      }
    } finally {
      run.current = null;
      held.preview?.close();
      document.removeEventListener('visibilitychange', onVisibility);
      await held.wake?.release().catch(() => undefined);
    }
  };

  return {
    status,
    start,
    cancel: () => run.current?.cancel(),
    reset: () => setStatus({ phase: 'idle' }),
  };
}
