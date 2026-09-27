'use client';

/**
 * Lab export panel: every export format with its settings, for checking exports on real devices
 * before the editor's export sheet exists (which reuses `useExport`).
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import {
  type Backdrop,
  type Capabilities,
  type DesignState,
  EXPORT_QUALITIES,
  EXPORT_RESOLUTIONS,
  type ExportAsset,
  type ExportFormat,
  type ExportQuality,
  type ExportSettings,
  exportSize,
  FRAME_RATES,
  formatAvailability,
  GIF_FRAME_RATES,
  GIF_WIDTHS,
  KEEPS_ALPHA,
} from '@/engine/host';
import { canStreamToFile, useExport } from '../export/use-export';

const FORMAT_LABELS: Record<ExportFormat, string> = {
  mp4: 'MP4',
  webm: 'WebM',
  'png-zip': 'PNG seq.',
  gif: 'GIF',
  still: 'Still',
};

const QUALITY_LABELS: Record<ExportQuality, string> = {
  standard: 'Standard',
  high: 'High',
  max: 'Max',
};

type ExportPanelProps = {
  state: DesignState;
  /** Transitions: the cut point (named in the file). */
  cut: number | null;
  transition: boolean;
  capabilities: Capabilities | null;
  /** The preview's time (stills). */
  time: () => number;
  /** The preview backdrop, offered for baking under transparent designs. */
  backdrop: Backdrop;
  /** The user's files the design uses, freshly decoded for the export worker. */
  assets: () => Promise<ExportAsset[]>;
};

const formatBytes = (bytes: number) =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

export function ExportPanel(props: ExportPanelProps) {
  const { state, capabilities } = props;
  const encoders = capabilities?.encoders ?? null;
  const [format, setFormat] = useState<ExportFormat>(state.transparent ? 'webm' : 'mp4');
  const [resolution, setResolution] = useState(1080);
  const [fps, setFps] = useState(30);
  const [gifWidth, setGifWidth] = useState(640);
  const [gifFps, setGifFps] = useState(20);
  const [quality, setQuality] = useState<ExportQuality>('high');
  const [bake, setBake] = useState(false);
  const { status, start, cancel, reset } = useExport(capabilities);
  const available = formatAvailability(format, encoders);
  const gif = format === 'gif';
  const resolutionId = useId();
  const fpsId = useId();

  const settings: ExportSettings = {
    format,
    resolution: gif ? gifWidth : resolution,
    fps: gif ? gifFps : fps,
    quality,
    ...(format === 'still' ? { time: props.time() } : {}),
    ...(bake && state.transparent && props.backdrop.kind !== 'none'
      ? { backdrop: props.backdrop }
      : {}),
  };
  const size = exportSize(state.format, settings);
  const running = status.phase === 'running';

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label="Export format"
        size="sm"
        value={format}
        options={(['mp4', 'webm', 'png-zip', 'gif', 'still'] as const).map((value) => ({
          value,
          label: FORMAT_LABELS[value],
        }))}
        onValueChange={setFormat}
        className="w-full"
      />
      <div className="grid grid-cols-2 gap-2">
        <label htmlFor={resolutionId} className="flex flex-col gap-1 text-[12px] text-fg-2">
          {gif ? 'Width' : 'Resolution'}
          <select
            id={resolutionId}
            value={gif ? gifWidth : resolution}
            onChange={(event) =>
              gif
                ? setGifWidth(Number(event.target.value))
                : setResolution(Number(event.target.value))
            }
            className="h-8 rounded-md border border-line bg-bg-3 px-2 text-[13px] font-[550] text-fg"
          >
            {(gif ? GIF_WIDTHS : EXPORT_RESOLUTIONS).map((value) => (
              <option key={value} value={value}>
                {gif ? `${value} px` : value === 2160 ? '4K' : `${value}p`}
              </option>
            ))}
          </select>
        </label>
        {format !== 'still' && (
          <label htmlFor={fpsId} className="flex flex-col gap-1 text-[12px] text-fg-2">
            Frame rate
            <select
              id={fpsId}
              value={gif ? gifFps : fps}
              onChange={(event) =>
                gif ? setGifFps(Number(event.target.value)) : setFps(Number(event.target.value))
              }
              className="h-8 rounded-md border border-line bg-bg-3 px-2 text-[13px] font-[550] text-fg"
            >
              {(gif ? GIF_FRAME_RATES : FRAME_RATES).map((value) => (
                <option key={value} value={value}>
                  {value} fps
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!gif && format !== 'still' && (
        <SegmentedControl
          label="Quality"
          size="sm"
          value={quality}
          options={EXPORT_QUALITIES.map((value) => ({ value, label: QUALITY_LABELS[value] }))}
          onValueChange={setQuality}
          className="w-full"
        />
      )}
      {state.transparent && props.backdrop.kind !== 'none' && format !== 'still' && (
        <label className="flex items-center gap-2 text-[12px] text-fg-2">
          <input
            type="checkbox"
            checked={bake}
            onChange={(event) => setBake(event.target.checked)}
          />
          Bake the backdrop ({props.transition ? 'A → B' : 'footage'}) — an opaque file
        </label>
      )}
      <p className="text-[12px] leading-snug text-fg-3">
        {size.width} × {size.height}
        {state.transparent && !settings.backdrop
          ? KEEPS_ALPHA[format]
            ? ' · transparent'
            : ' · on the design’s background (this format has no transparency)'
          : ''}
        {canStreamToFile() ? ' · saved as it renders' : ' · downloaded when done'}
      </p>
      {!available.available && (
        <p role="status" className="text-[12px] leading-snug text-warning">
          {available.reason}
        </p>
      )}

      {running ? (
        <Progress status={status} onCancel={cancel} />
      ) : (
        <Button
          className="w-full"
          disabled={!available.available}
          onClick={() => void start({ state, settings }, { cut: props.cut, assets: props.assets })}
        >
          Export {FORMAT_LABELS[format]}
        </Button>
      )}

      {status.phase === 'done' && (
        <div className="flex flex-col gap-1 rounded-md border border-line p-3 text-[12px]">
          <span className="font-[550] text-fg break-all">{status.result.name}</span>
          <span className="text-fg-3">
            {status.result.width} × {status.result.height}
            {status.result.duration > 0 ? ` · ${status.result.frames} frames` : ''}
            {status.result.bytes > 0 ? ` · ${formatBytes(status.result.bytes)}` : ''}
            {status.saved ? ' · saved' : ''}
          </span>
          {status.url && (
            <a href={status.url} download={status.result.name} className="text-fg underline">
              Download again
            </a>
          )}
          <button type="button" className="self-start text-fg-3 hover:text-fg" onClick={reset}>
            Clear
          </button>
        </div>
      )}
      {status.phase === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-line p-3 text-[12px]"
        >
          <span className="text-danger">
            {status.stage}: {status.message}
          </span>
          <Button size="sm" onClick={() => void navigator.clipboard?.writeText(status.details)}>
            Copy details
          </Button>
        </div>
      )}
    </div>
  );
}

function Progress({
  status,
  onCancel,
}: {
  status: Extract<ReturnType<typeof useExport>['status'], { phase: 'running' }>;
  onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const share = status.frames > 0 ? status.frame / status.frames : 0;
  useEffect(() => {
    const element = canvas.current;
    const frame = status.preview;
    if (!element || !frame) return;
    element.width = frame.width;
    element.height = frame.height;
    element.getContext('2d')?.drawImage(frame, 0, 0);
  }, [status.preview]);
  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvas}
        role="img"
        aria-label="The frame being exported"
        className="w-full rounded-md bg-bg-3"
      />
      <div
        role="progressbar"
        aria-label="Export progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
        className="h-1.5 overflow-hidden rounded-full bg-bg-3"
      >
        <div className="h-full bg-fg" style={{ width: `${share * 100}%` }} />
      </div>
      <div className="flex items-center justify-between text-[12px] text-fg-2">
        <span className="font-mono tabular-nums">
          {Math.round(share * 100)}% · {status.frame}/{status.frames}
          {status.remaining !== null ? ` · ${Math.ceil(status.remaining)} s left` : ''}
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-[12px] text-fg-3">Keep this tab in front for long exports.</p>
    </div>
  );
}
