/**
 * A color grade baked into a copy of a raster image once, in `build` — the same math as the
 * Draw API's `fx({ adjust })` (docs/06-engine.md §9), without re-grading the whole picture on
 * every frame (the Canvas 2D path reads pixels back for that). Null where there's no
 * OffscreenCanvas (Node) or for vector artwork: callers then grade with `fx({ adjust })`.
 *
 * Engine candidate: `ctx.graded(controlKey, adjust)` (a cached, pre-graded image).
 */

import type { Color, Graphic } from '@/engine';

export type Grade = {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  tint?: { color: Color; amount: number };
};

/** A drawable image (the Draw API's `image` source). */
export type Baked = {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
};

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

export function bakeGrade(graphic: Graphic | null, grade: Grade): Baked | null {
  if (graphic?.kind !== 'raster' || typeof OffscreenCanvas !== 'function') return null;
  const { width, height, source } = graphic.image;
  if (!(width > 0 && height > 0)) return null;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const gain = (grade.brightness ?? 1) / 255;
  const slope = grade.contrast ?? 1;
  const sat = grade.saturation ?? 1;
  const tint = grade.tint;
  const amount = tint ? Math.min(1, Math.max(0, tint.amount)) : 0;
  const tr = tint?.color.r ?? 1;
  const tg = tint?.color.g ?? 1;
  const tb = tint?.color.b ?? 1;
  const tl = Math.max(1e-3, LUMA_R * tr + LUMA_G * tg + LUMA_B * tb);
  const above = Math.max(1e-3, 1 - tl);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = ((d[i] ?? 0) * gain - 0.5) * slope + 0.5;
    let g = ((d[i + 1] ?? 0) * gain - 0.5) * slope + 0.5;
    let b = ((d[i + 2] ?? 0) * gain - 0.5) * slope + 0.5;
    const l = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    r = Math.min(1, Math.max(0, l + (r - l) * sat));
    g = Math.min(1, Math.max(0, l + (g - l) * sat));
    b = Math.min(1, Math.max(0, l + (b - l) * sat));
    if (amount > 0) {
      // Luma onto black → tint → white: the tint sits at its own luma, so lightness is kept.
      const t = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      const f = t < tl ? t / tl : (t - tl) / above;
      r += ((t < tl ? tr * f : tr + (1 - tr) * f) - r) * amount;
      g += ((t < tl ? tg * f : tg + (1 - tg) * f) - g) * amount;
      b += ((t < tl ? tb * f : tb + (1 - tb) * f) - b) * amount;
    }
    d[i] = r * 255;
    d[i + 1] = g * 255;
    d[i + 2] = b * 255;
  }
  ctx.putImageData(image, 0, 0);
  return { source: canvas, width, height };
}
