/**
 * UI Kit shapes: soft elevation shadows, rounded-rect geometry and a small stroke icon set.
 */

import { type Color, withAlpha } from '../core/color';
import type { Rect } from '../core/math';
import type { Draw, Fill, Gradient, PathCommand, PathData } from '../draw/types';
import type { ShadowLayer } from './theme';

/** Standard normal CDF Φ(z) (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

// --- path geometry ------------------------------------------------------------------------

/** Cubic-bézier circle constant: control distance for a quarter arc of radius 1. */
const KAPPA = 0.5522847498;

/** A rounded rectangle as path commands (clockwise from the top-left corner's end). */
export function roundRectPath(r: Rect, radius: number): PathCommand[] {
  const rr = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  const k = rr * (1 - KAPPA);
  const { x, y, w, h } = r;
  if (rr <= 0) {
    return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  }
  return [
    ['M', x + rr, y],
    ['L', x + w - rr, y],
    ['C', x + w - k, y, x + w, y + k, x + w, y + rr],
    ['L', x + w, y + h - rr],
    ['C', x + w, y + h - k, x + w - k, y + h, x + w - rr, y + h],
    ['L', x + rr, y + h],
    ['C', x + k, y + h, x, y + h - k, x, y + h - rr],
    ['L', x, y + rr],
    ['C', x, y + k, x + k, y, x + rr, y],
    ['Z'],
  ];
}

/** A circle as path commands, starting at 12 o'clock and running clockwise. */
export function circlePath(cx: number, cy: number, r: number): PathCommand[] {
  const k = r * KAPPA;
  return [
    ['M', cx, cy - r],
    ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ['Z'],
  ];
}

/**
 * The rounded rect of a pill ↔ circle morph that keeps its center and its radius continuous:
 * the width eases from `w` to `h` (a circle) while the radius runs from `radius` to `h / 2`
 * in step with it — at `p = 1` the shape is exactly the circle, and no frame jumps.
 */
export function morphRect(
  cx: number,
  cy: number,
  w: number,
  h: number,
  radius: number,
  p: number,
  out: Rect = { x: 0, y: 0, w: 0, h: 0 },
): { rect: Rect; radius: number } {
  const width = w + (h - w) * p;
  const r = Math.min(radius + (h / 2 - radius) * p, width / 2, h / 2);
  out.x = cx - width / 2;
  out.y = cy - h / 2;
  out.w = width;
  out.h = h;
  return { rect: out, radius: r };
}

// --- shadows ------------------------------------------------------------------------------

/** A shadow's reach beyond its shape, in σ (Φ(−2.2) ≈ 1.4% of its opacity: nothing shows). */
const REACH = 2.2;
/**
 * Gradient stops sampling Φ across a slice; the drawer adds OKLab steps between them, and
 * every stop costs a little on every frame, so a few suffice for a smooth falloff.
 */
const STOPS = 3;
/** Corner squares larger than this (design units) skip the part the element covers. */
const SPLIT_CORNER = 72;

type Slice = { rect: Rect; fill: Fill };

/**
 * The soft shadow of a rounded rect of fixed size — CSS `box-shadow` semantics: Gaussian
 * falloff (Φ of the signed distance to the rounded rect), layered (`ELEVATIONS`), and painted
 * only outside the element, which covers the rest. Built once as gradient slices in local
 * coordinates, so a frame costs a handful of rect fills — no blur, no layer, no bitmap, and
 * no Canvas `filter` (Safari has none). `unit` is the size of one UI px in design units.
 */
export class BoxShadow {
  private readonly slices: Slice[] = [];
  private readonly paint = (g: Draw) => {
    for (const slice of this.slices) g.rect(slice.rect, { fill: slice.fill });
  };
  private readonly group = { x: 0, y: 0, opacity: 1 };

  constructor(
    readonly w: number,
    readonly h: number,
    readonly radius: number,
    layers: readonly ShadowLayer[],
    unit: number,
    color: Color,
    strength = 1,
  ) {
    for (const layer of layers) {
      const spread = (layer.spread ?? 0) * unit;
      const alpha = Math.min(1, layer.alpha * strength) * color.a;
      if (alpha <= 0) continue;
      this.addLayer(
        { x: -spread, y: layer.y * unit - spread, w: w + 2 * spread, h: h + 2 * spread },
        Math.max(0, radius + spread),
        Math.max(0.5, layer.blur * unit),
        withAlpha(color, alpha),
      );
    }
  }

  /** Draws the shadow of the element whose top-left is (x, y). */
  draw(g: Draw, x: number, y: number, opacity = 1): void {
    if (opacity <= 0 || this.slices.length === 0) return;
    this.group.x = x;
    this.group.y = y;
    this.group.opacity = opacity;
    g.group(this.group, this.paint);
  }

  private addLayer(s: Rect, radius: number, sigma: number, color: Color): void {
    const { w, h } = this;
    const e = REACH * sigma;
    const m = Math.max(0.5, Math.min(Math.max(radius, e), s.w / 2, s.h / 2));
    const ox0 = s.x - e;
    const oy0 = s.y - e;
    const ox1 = s.x + s.w + e;
    const oy1 = s.y + s.h + e;
    const kx0 = s.x + m;
    const ky0 = s.y + m;
    const kx1 = Math.max(kx0, s.x + s.w - m);
    const ky1 = Math.max(ky0, s.y + s.h - m);
    const tint = (a: number) => withAlpha(color, color.a * a);
    const add = (rect: Rect, fill: Fill) => {
      if (rect.w > 0.01 && rect.h > 0.01) this.slices.push({ rect, fill });
    };
    const span = (x0: number, y0: number, x1: number, y1: number): Rect => ({
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
    });
    // Edges: alpha = Φ(distance inside the shape's edge / σ), from the reach to the inner rect.
    const edge = (x0: number, y0: number, x1: number, y1: number, depth: number): Gradient => ({
      kind: 'linear',
      x0,
      y0,
      x1,
      y1,
      stops: Array.from({ length: STOPS + 1 }, (_, i) => {
        const o = i / STOPS;
        return { offset: o, color: tint(i === 0 ? 0 : phi((o * (e + depth) - e) / sigma)) };
      }),
    });
    add(span(kx0, oy0, kx1, Math.min(ky0, 0)), edge(0, oy0, 0, ky0, m));
    add(span(kx0, Math.max(ky1, h), kx1, oy1), edge(0, oy1, 0, ky1, m));
    add(span(ox0, ky0, Math.min(kx0, 0), ky1), edge(ox0, 0, kx0, 0, m));
    add(span(Math.max(kx1, w), ky0, ox1, ky1), edge(ox1, 0, kx1, 0, m));
    // Corners: alpha = Φ((m − distance from the corner's center) / σ).
    const corner = (cx: number, cy: number): Gradient => ({
      kind: 'radial',
      cx,
      cy,
      r: m + e,
      stops: Array.from({ length: STOPS + 1 }, (_, i) => {
        const o = i / STOPS;
        return { offset: o, color: tint(i === STOPS ? 0 : phi((m - o * (m + e)) / sigma)) };
      }),
    });
    // Each corner square, minus what the element covers — except the element's own rounded
    // corner, which leaves its square's outer part uncovered.
    const r = this.radius;
    const cornerSlices = (x0: number, y0: number, x1: number, y1: number, fill: Gradient) => {
      // The element's covered part of this square (its rounded corner excluded).
      const cx0 = Math.max(x0, 0);
      const cy0 = Math.max(y0, 0);
      const cx1 = Math.min(x1, w);
      const cy1 = Math.min(y1, h);
      if (cx1 <= cx0 || cy1 <= cy0 || Math.max(x1 - x0, y1 - y0) < SPLIT_CORNER) {
        add(span(x0, y0, x1, y1), fill);
        return;
      }
      // Outside strips around the covered block.
      add(span(x0, y0, x1, cy0), fill);
      add(span(x0, cy1, x1, y1), fill);
      add(span(x0, cy0, cx0, cy1), fill);
      add(span(cx1, cy0, x1, cy1), fill);
      // The element's corner zones (r × r) inside the covered block.
      const zones = [
        [0, 0],
        [w - r, 0],
        [0, h - r],
        [w - r, h - r],
      ] as const;
      for (const [zx, zy] of zones) {
        const ax = Math.max(cx0, zx);
        const ay = Math.max(cy0, zy);
        const bx = Math.min(cx1, zx + r);
        const by = Math.min(cy1, zy + r);
        if (bx > ax && by > ay) add(span(ax, ay, bx, by), fill);
      }
    };
    cornerSlices(ox0, oy0, kx0, ky0, corner(kx0, ky0));
    cornerSlices(kx1, oy0, ox1, ky0, corner(kx1, ky0));
    cornerSlices(ox0, ky1, kx0, oy1, corner(kx0, ky1));
    cornerSlices(kx1, ky1, ox1, oy1, corner(kx1, ky1));
    // The solid core, where it reaches beyond the element (large spreads or offsets).
    const core = tint(phi(m / sigma));
    if (ky0 < 0) add(span(kx0, ky0, kx1, Math.min(0, ky1)), core);
    if (ky1 > h) add(span(kx0, Math.max(h, ky0), kx1, ky1), core);
    if (kx0 < 0) add(span(kx0, Math.max(0, ky0), Math.min(0, kx1), Math.min(h, ky1)), core);
    if (kx1 > w) add(span(Math.max(w, kx0), Math.max(0, ky0), kx1, Math.min(h, ky1)), core);
  }
}

// --- icons --------------------------------------------------------------------------------

/** A 24 × 24 icon: stroked outlines (2 units, round caps and joins) and filled shapes. */
export type Icon = { readonly stroke: PathData | null; readonly fill: PathData | null };

const icon = (stroke: PathCommand[] | null, fill: PathCommand[] | null = null): Icon => ({
  stroke,
  fill,
});

export const ICONS = {
  check: icon([
    ['M', 5.5, 12.5],
    ['L', 10, 17],
    ['L', 18.5, 7.5],
  ]),
  chevronRight: icon([
    ['M', 9.5, 6],
    ['L', 15.5, 12],
    ['L', 9.5, 18],
  ]),
  chevronDown: icon([
    ['M', 6, 9.5],
    ['L', 12, 15.5],
    ['L', 18, 9.5],
  ]),
  arrowUp: icon([
    ['M', 12, 19],
    ['L', 12, 5.5],
    ['M', 6.5, 11],
    ['L', 12, 5.5],
    ['L', 17.5, 11],
  ]),
  arrowDown: icon([
    ['M', 12, 5],
    ['L', 12, 18.5],
    ['M', 6.5, 13],
    ['L', 12, 18.5],
    ['L', 17.5, 13],
  ]),
  trendUp: icon([
    ['M', 4, 16.5],
    ['L', 9.5, 11],
    ['L', 13, 14.5],
    ['L', 20, 7.5],
    ['M', 14.5, 7.5],
    ['L', 20, 7.5],
    ['L', 20, 13],
  ]),
  lock: icon([
    ...roundRectPath({ x: 5, y: 10.5, w: 14, h: 10 }, 2.5),
    ['M', 8, 10.5],
    ['L', 8, 7.5],
    ['C', 8, 5.3, 9.8, 3.5, 12, 3.5],
    ['C', 14.2, 3.5, 16, 5.3, 16, 7.5],
    ['L', 16, 10.5],
  ]),
  calendar: icon([
    ...roundRectPath({ x: 4, y: 5.5, w: 16, h: 15 }, 3),
    ['M', 4, 10.5],
    ['L', 20, 10.5],
    ['M', 8.5, 3.5],
    ['L', 8.5, 7.5],
    ['M', 15.5, 3.5],
    ['L', 15.5, 7.5],
  ]),
  mail: icon([
    ...roundRectPath({ x: 3.5, y: 5.5, w: 17, h: 13 }, 3),
    ['M', 4.5, 7.5],
    ['L', 12, 13],
    ['L', 19.5, 7.5],
  ]),
  user: icon([
    ...circlePath(12, 8.5, 3.75),
    ['M', 5, 20],
    ['C', 5.8, 16.6, 8.6, 14.75, 12, 14.75],
    ['C', 15.4, 14.75, 18.2, 16.6, 19, 20],
  ]),
  search: icon([...circlePath(10.75, 10.75, 6.25), ['M', 15.5, 15.5], ['L', 20, 20]]),
  plus: icon([
    ['M', 12, 5],
    ['L', 12, 19],
    ['M', 5, 12],
    ['L', 19, 12],
  ]),
  card: icon([
    ...roundRectPath({ x: 3, y: 5.5, w: 18, h: 13 }, 2.5),
    ['M', 3, 10],
    ['L', 21, 10],
    ['M', 6.5, 14.5],
    ['L', 10, 14.5],
  ]),
  sparkle: icon(null, [
    ['M', 12, 3],
    ['C', 12.7, 8.4, 14.6, 10.8, 20, 12],
    ['C', 14.6, 13.2, 12.7, 15.6, 12, 21],
    ['C', 11.3, 15.6, 9.4, 13.2, 4, 12],
    ['C', 9.4, 10.8, 11.3, 8.4, 12, 3],
    ['Z'],
  ]),
  dot: icon(null, circlePath(12, 12, 4)),
  checkCircle: icon(
    [
      ['M', 8, 12.25],
      ['L', 10.75, 15],
      ['L', 16, 9.25],
    ],
    null,
  ),
} as const satisfies Record<string, Icon>;

export type IconName = keyof typeof ICONS;

/**
 * Draws a 24-unit icon centered on (cx, cy) at `size` design units. `weight` is the stroke
 * width in icon units (2 by default); `trim` draws strokes on (0..1).
 */
export function drawIcon(
  g: Draw,
  name: IconName,
  cx: number,
  cy: number,
  size: number,
  color: Color,
  options: { weight?: number; opacity?: number; trim?: number } = {},
): void {
  const { stroke, fill } = ICONS[name];
  const k = size / 24;
  const trim = options.trim ?? 1;
  if (trim <= 0) return;
  g.group({ x: cx - size / 2, y: cy - size / 2, scale: k, opacity: options.opacity }, (g) => {
    if (fill) g.path(fill, { fill: color });
    if (stroke) {
      g.path(stroke, {
        stroke: {
          color,
          width: options.weight ?? 2,
          cap: 'round',
          join: 'round',
          trim: trim < 1 ? [0, trim] : undefined,
        },
      });
    }
  });
}
