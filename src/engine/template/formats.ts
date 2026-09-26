/**
 * Formats, the design space and safe areas (docs/templates/00-foundations.md §3).
 *
 * Templates draw in a *design space* measured in 1080p pixels: the frame's short side is always
 * 1080 units (16:9 → 1920 × 1080, 9:16 → 1080 × 1920, 1:1 → 1080², 4:5 → 1080 × 1350).
 * `u` = 1% of the short side = 10.8 units. The renderer scales the design space to any output
 * resolution, so templates are resolution-independent and vector-crisp at 4K.
 */

import type { Rect } from '../core/math';

export const FORMAT_IDS = ['16:9', '9:16', '1:1', '4:5'] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

export type FormatInfo = {
  id: FormatId;
  label: string;
  /** Width / height. */
  aspect: number;
  /** Design-space size (short side = 1080). */
  width: number;
  height: number;
  vertical: boolean;
};

export const FORMATS: Record<FormatId, FormatInfo> = {
  '16:9': {
    id: '16:9',
    label: 'Landscape',
    aspect: 16 / 9,
    width: 1920,
    height: 1080,
    vertical: false,
  },
  '9:16': {
    id: '9:16',
    label: 'Vertical',
    aspect: 9 / 16,
    width: 1080,
    height: 1920,
    vertical: true,
  },
  '1:1': { id: '1:1', label: 'Square', aspect: 1, width: 1080, height: 1080, vertical: false },
  '4:5': { id: '4:5', label: 'Portrait', aspect: 4 / 5, width: 1080, height: 1350, vertical: true },
};

export const DESIGN_SHORT_SIDE = 1080;

/** Export resolutions by short side (docs/07-export.md §1). */
export const RESOLUTIONS = [720, 1080, 1440, 2160] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** Output pixel size for a format at a short-side resolution, rounded to even numbers (H.264). */
export function outputSize(format: FormatId, shortSide: number): { width: number; height: number } {
  const info = FORMATS[format];
  const scale = shortSide / DESIGN_SHORT_SIDE;
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return { width: even(info.width * scale), height: even(info.height * scale) };
}

export type SafeAreas = {
  /** Inner 90% — essential text lives here. */
  title: Rect;
  /** Inner 93% — nothing important outside. */
  action: Rect;
  /**
   * Social platform UI zone (vertical formats): avoids the top 12%, bottom 22% and right 12%
   * where Reels/TikTok/Shorts overlay captions and buttons. Equals `title` for other formats.
   */
  social: Rect;
};

export type FrameSpec = {
  format: FormatId;
  /** Design-space width and height. */
  width: number;
  height: number;
  /** 1% of the short side (10.8 design units). */
  u: number;
  vertical: boolean;
  aspect: number;
  cx: number;
  cy: number;
  safe: SafeAreas;
};

function inset(width: number, height: number, fraction: number): Rect {
  const dx = width * fraction;
  const dy = height * fraction;
  return { x: dx, y: dy, w: width - dx * 2, h: height - dy * 2 };
}

export function createFrame(format: FormatId): FrameSpec {
  const { width, height, vertical, aspect } = FORMATS[format];
  const title = inset(width, height, 0.05);
  const social = vertical
    ? { x: width * 0.05, y: height * 0.12, w: width * 0.83, h: height * 0.66 }
    : title;
  return {
    format,
    width,
    height,
    u: Math.min(width, height) / 100,
    vertical,
    aspect,
    cx: width / 2,
    cy: height / 2,
    safe: { title, action: inset(width, height, 0.035), social },
  };
}

export function isFormatId(value: unknown): value is FormatId {
  return typeof value === 'string' && (FORMAT_IDS as readonly string[]).includes(value);
}
