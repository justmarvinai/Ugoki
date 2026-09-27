/**
 * Export settings (docs/07-export.md): formats, sizes, frame rates, quality presets, frame
 * timing and file names. Pure data, shared by the export sheet (main thread) and the export
 * worker.
 */

import type { Backdrop } from '../runtime/backdrop';
import type { EncoderSupport } from '../runtime/capabilities';
import { FORMATS, type FormatId, outputSize } from '../template/formats';

export const EXPORT_FORMATS = ['mp4', 'webm', 'png-zip', 'gif', 'still'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Short sides for video, PNG sequences and stills. */
export const EXPORT_RESOLUTIONS = [720, 1080, 1440, 2160] as const;
export const FRAME_RATES = [24, 25, 30, 50, 60] as const;
/** GIFs are sized by width and play at lower frame rates. */
export const GIF_WIDTHS = [480, 640, 720] as const;
export const GIF_FRAME_RATES = [15, 20, 25] as const;

export const EXPORT_QUALITIES = ['standard', 'high', 'max'] as const;
export type ExportQuality = (typeof EXPORT_QUALITIES)[number];

export type ExportSettings = {
  format: ExportFormat;
  /** Short side in pixels for video, PNG sequences and stills; the width for GIFs. */
  resolution: number;
  fps: number;
  quality: ExportQuality;
  /** Stills: the time of the frame, in seconds. */
  time?: number;
  /**
   * Baked under a transparent design, for an opaque file (transitions: Scene A → B; lower
   * thirds: footage or the user's still). Without it, transparent designs stay transparent
   * where the format allows (WebM, PNG) and show their own background where it doesn't.
   */
  backdrop?: Backdrop;
};

export const EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  mp4: 'mp4',
  webm: 'webm',
  'png-zip': 'zip',
  gif: 'gif',
  still: 'png',
};

export const MIME_TYPES: Readonly<Record<ExportFormat, string>> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  'png-zip': 'application/zip',
  gif: 'image/gif',
  still: 'image/png',
};

/** Formats that keep an alpha channel (GIF's 1-bit transparency doesn't count). */
export const KEEPS_ALPHA: Readonly<Record<ExportFormat, boolean>> = {
  mp4: false,
  webm: true,
  'png-zip': true,
  gif: false,
  still: true,
};

export type MotionBudget = { samples: number; maxSamples: number; maxStep: number };

/**
 * Motion blur per quality (docs/04-motion-language.md §9): sub-frames for anything that moves,
 * and more for fast motion — until each sub-frame moves at most `maxStep` pixels — up to
 * `maxSamples`. GIFs stay sharp (blur only adds colors a 256-color palette can't hold), and so
 * do stills.
 */
export function motionBudget(settings: ExportSettings): MotionBudget {
  if (settings.format === 'gif' || settings.format === 'still') {
    return { samples: 1, maxSamples: 1, maxStep: Number.POSITIVE_INFINITY };
  }
  if (settings.quality === 'max') return { samples: 16, maxSamples: 64, maxStep: 1.5 };
  if (settings.quality === 'high') return { samples: 8, maxSamples: 32, maxStep: 2.5 };
  return { samples: 4, maxSamples: 16, maxStep: 4 };
}

/** Sub-frames for moving frames (at least; fast motion may get more). */
export const motionSamples = (settings: ExportSettings): number => motionBudget(settings).samples;

/** Megabits per second at 30 and 60 fps, by short side and quality (docs/07-export.md §3). */
const BITRATES: Readonly<Record<number, Record<ExportQuality, [number, number]>>> = {
  720: { standard: [5, 8], high: [8, 12], max: [12, 18] },
  1080: { standard: [10, 16], high: [16, 24], max: [24, 36] },
  1440: { standard: [16, 24], high: [24, 36], max: [36, 54] },
  2160: { standard: [35, 50], high: [50, 70], max: [70, 100] },
};

/** Target bitrate (bits per second) for H.264 and VP9. */
export function videoBitrate(shortSide: number, fps: number, quality: ExportQuality): number {
  const sides = Object.keys(BITRATES).map(Number);
  const side = sides.reduce((best, s) =>
    Math.abs(s - shortSide) < Math.abs(best - shortSide) ? s : best,
  );
  const [at30, at60] = (BITRATES[side] as Record<ExportQuality, [number, number]>)[quality];
  const k = Math.min(1, Math.max(0, (fps - 30) / 30));
  return Math.round((at30 + (at60 - at30) * k) * 1_000_000);
}

/** Pixel size of the exported frames (even, as H.264 requires; GIFs by width). */
export function exportSize(
  format: FormatId,
  settings: ExportSettings,
): { width: number; height: number } {
  if (settings.format !== 'gif') return outputSize(format, settings.resolution);
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  const width = even(settings.resolution);
  return { width, height: even(width / FORMATS[format].aspect) };
}

/** Frames of a video export: f = 0 … n − 1 at t = f / fps (the end itself isn't a frame). */
export function frameCount(duration: number, fps: number): number {
  return Math.max(1, Math.round(duration * fps));
}

/** The frame at a transition's cut point (named in the file so editors can cut there). */
export function cutFrame(cut: number, fps: number): number {
  return Math.round(cut * fps);
}

/** `ugoki-{template}-{w}x{h}-{fps}fps[-cut-f{n}].{ext}`, or `…-{t}s.png` for stills. */
export function exportFileName(options: {
  templateId: string;
  settings: ExportSettings;
  size: { width: number; height: number };
  cut: number | null;
}): string {
  const { templateId, settings, size, cut } = options;
  const base = `ugoki-${templateId}-${size.width}x${size.height}`;
  if (settings.format === 'still') return `${base}-${(settings.time ?? 0).toFixed(2)}s.png`;
  const cutPart = cut === null ? '' : `-cut-f${cutFrame(cut, settings.fps)}`;
  return `${base}-${settings.fps}fps${cutPart}.${EXTENSIONS[settings.format]}`;
}

export type FormatAvailability = { available: true } | { available: false; reason: string };

/**
 * Whether this browser can make a format (from the worker's capability probe). `alpha`: the
 * export keeps a transparent design's transparency. The exact configuration is checked again
 * when an export starts.
 */
export function formatAvailability(
  format: ExportFormat,
  encoders: EncoderSupport | null,
  { alpha = false }: { alpha?: boolean } = {},
): FormatAvailability {
  if (format === 'mp4' && !encoders?.avc) {
    return {
      available: false,
      reason: encoders?.vp9
        ? 'Your browser can’t encode MP4. WebM works here.'
        : 'Your browser can’t encode video. PNG sequences and GIFs work everywhere.',
    };
  }
  if (format === 'webm' && !encoders?.vp9) {
    return {
      available: false,
      reason: 'Your browser can’t encode WebM. PNG sequences keep transparency everywhere.',
    };
  }
  if (format === 'webm' && alpha && !encoders?.vp9Alpha) {
    return {
      available: false,
      reason: 'Your browser can’t keep transparency in WebM. PNG sequences keep it everywhere.',
    };
  }
  return { available: true };
}
