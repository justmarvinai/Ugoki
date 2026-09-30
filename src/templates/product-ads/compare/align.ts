/**
 * Focal-point alignment for a before/after pair. Both pictures are placed so that their focal
 * points land on the same spot of the frame — the mean of where each would sit on its own — each
 * still covering the frame; pictures of the same proportions are drawn at the same size, so the
 * same shot taken twice lines up feature for feature. When the focal points are so far apart that
 * aligning them would need a big zoom, each picture falls back to its own cover crop.
 */

import type { FocalPoint, Graphic, Rect } from '@/engine';

/** The artwork's frame in its own units (a raster's pixels, a vector's box). */
export function frameOf(graphic: Graphic): { w: number; h: number } {
  return graphic.kind === 'raster'
    ? { w: graphic.image.width, h: graphic.image.height }
    : { w: graphic.box.w, h: graphic.box.h };
}

/** Where the whole picture is drawn (it may reach beyond `card`, which crops it). */
export type Placement = Rect;

const clampFocal = (v: number) => Math.min(0.98, Math.max(0.02, v));

/** Width of the smallest cover placement with the focal point (`fx`, `fy`) at (`ax`, `ay`). */
function coverAt(
  card: Rect,
  aspect: number,
  fx: number,
  fy: number,
  ax: number,
  ay: number,
): number {
  const right = card.x + card.w;
  const bottom = card.y + card.h;
  return Math.max(
    card.w,
    card.h * aspect,
    (ax - card.x) / fx,
    (right - ax) / (1 - fx),
    ((ay - card.y) / fy) * aspect,
    ((bottom - ay) / (1 - fy)) * aspect,
  );
}

/** Standard cover crop around a focal point (the engine's `fit: 'cover'` placement). */
function cover(card: Rect, aspect: number, focal: FocalPoint): Placement {
  const w = Math.max(card.w, card.h * aspect);
  const h = w / aspect;
  return {
    x: card.x + (card.w - w) * focal.x,
    y: card.y + (card.h - h) * focal.y,
    w,
    h,
  };
}

/** Placements for a pair, aligned by their focal points (see the file comment). */
export function alignPair(
  card: Rect,
  a: { graphic: Graphic; focal: FocalPoint },
  b: { graphic: Graphic; focal: FocalPoint },
  maxZoom = 1.6,
): [Placement, Placement] {
  const fa = frameOf(a.graphic);
  const fb = frameOf(b.graphic);
  const aspectA = fa.w > 0 && fa.h > 0 ? fa.w / fa.h : 1.5;
  const aspectB = fb.w > 0 && fb.h > 0 ? fb.w / fb.h : 1.5;
  const ax = card.x + card.w * ((a.focal.x + b.focal.x) / 2);
  const ay = card.y + card.h * ((a.focal.y + b.focal.y) / 2);
  const fxa = clampFocal(a.focal.x);
  const fya = clampFocal(a.focal.y);
  const fxb = clampFocal(b.focal.x);
  const fyb = clampFocal(b.focal.y);
  let wa = coverAt(card, aspectA, fxa, fya, ax, ay);
  let wb = coverAt(card, aspectB, fxb, fyb, ax, ay);
  if (Math.abs(aspectA / aspectB - 1) < 0.01) {
    wa = Math.max(wa, wb);
    wb = wa;
  }
  const zoomA = wa / Math.max(card.w, card.h * aspectA);
  const zoomB = wb / Math.max(card.w, card.h * aspectB);
  if (zoomA > maxZoom || zoomB > maxZoom) {
    return [cover(card, aspectA, a.focal), cover(card, aspectB, b.focal)];
  }
  const place = (w: number, aspect: number, fx: number, fy: number): Placement => {
    const h = w / aspect;
    return { x: ax - fx * w, y: ay - fy * h, w, h };
  };
  return [place(wa, aspectA, fxa, fya), place(wb, aspectB, fxb, fyb)];
}
