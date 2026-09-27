/**
 * A soft rectangular shadow without an effects layer: nine pieces — a solid core, four edge
 * bands and four quarter-disc corners — whose falloff comes from two unit gradients built once
 * and stretched by group transforms. A blurred-layer shadow per photo would cost a bounded layer
 * each (~2 ms at 1080p); this costs a handful of gradient fills and scales with blur for free.
 */

import {
  type Color,
  type Draw,
  type Gradient,
  type PathData,
  type Rect,
  withAlpha,
} from '@/engine';

/** Blurred-edge falloff from inside (1) to outside (0): close to a Gaussian's integral. */
const PROFILE: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.3, 0.8],
  [0.5, 0.5],
  [0.7, 0.2],
  [1, 0],
];

/** The quadrant x ≥ 0, y ≥ 0 of the unit disc. */
const QUARTER: PathData = [['M', 0, 0], ['L', 1, 0], ['C', 1, 0.5523, 0.5523, 1, 0, 1], ['Z']];
const UNIT_BAND: Rect = { x: 0, y: -1, w: 1, h: 2 };

export type SoftShadow = {
  /**
   * Draws the shadow of `r` (local coordinates) with a blur reaching `blur` inside and outside
   * each edge, at `opacity`.
   */
  draw(g: Draw, r: Rect, blur: number, opacity: number): void;
};

export function createSoftShadow(color: Color): SoftShadow {
  const stops = PROFILE.map(([offset, alpha]) => ({ offset, color: withAlpha(color, alpha) }));
  // Across a band: y = +1 is inside the rectangle, y = −1 outside.
  const band: Gradient = {
    kind: 'linear',
    x0: 0,
    y0: 1,
    x1: 0,
    y1: -1,
    stops,
  };
  const corner: Gradient = { kind: 'radial', cx: 0, cy: 0, r: 1, stops };
  const solid = withAlpha(color, 1);

  return {
    draw(g, r, blur, opacity) {
      if (opacity <= 0.002 || r.w <= 0 || r.h <= 0) return;
      const s = Math.max(0.01, Math.min(blur, r.w / 2, r.h / 2));
      const x0 = r.x + s;
      const x1 = r.x + r.w - s;
      const y0 = r.y + s;
      const y1 = r.y + r.h - s;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w > 0 && h > 0) g.rect({ x: x0, y: y0, w, h }, { fill: solid, opacity });
      const bandPaint = { fill: band, opacity };
      if (w > 0) {
        g.group({ x: x0, y: r.y, scaleX: w, scaleY: s }, (g) => g.rect(UNIT_BAND, bandPaint));
        g.group({ x: x0, y: r.y + r.h, scaleX: w, scaleY: -s }, (g) =>
          g.rect(UNIT_BAND, bandPaint),
        );
      }
      if (h > 0) {
        g.group({ x: r.x, y: y1, rotate: -90, scaleX: h, scaleY: s }, (g) =>
          g.rect(UNIT_BAND, bandPaint),
        );
        g.group({ x: r.x + r.w, y: y0, rotate: 90, scaleX: h, scaleY: s }, (g) =>
          g.rect(UNIT_BAND, bandPaint),
        );
      }
      const cornerPaint = { fill: corner, opacity };
      const reach = 2 * s;
      g.group({ x: x1, y: y1, scale: reach }, (g) => g.path(QUARTER, cornerPaint));
      g.group({ x: x0, y: y1, rotate: 90, scale: reach }, (g) => g.path(QUARTER, cornerPaint));
      g.group({ x: x0, y: y0, rotate: 180, scale: reach }, (g) => g.path(QUARTER, cornerPaint));
      g.group({ x: x1, y: y0, rotate: -90, scale: reach }, (g) => g.path(QUARTER, cornerPaint));
    },
  };
}
