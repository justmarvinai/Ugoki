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
 * A circular arc as cubic segments (≤ 90° each). Angles are degrees clockwise from 12 o'clock
 * (y down), like `circlePath`; `from > to` runs counter-clockwise. With `move` false the arc
 * continues the current subpath (a line joins it to the arc's start).
 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  move = true,
): PathCommand[] {
  const rad = Math.PI / 180;
  const sweep = to - from;
  const pieces = Math.max(1, Math.ceil(Math.abs(sweep) / 90 - 1e-9));
  const step = sweep / pieces;
  const k = (4 / 3) * Math.tan((step * rad) / 4) * r;
  const px = (a: number) => cx + r * Math.sin(a * rad);
  const py = (a: number) => cy - r * Math.cos(a * rad);
  const path: PathCommand[] = [[move ? 'M' : 'L', px(from), py(from)]];
  for (let i = 0; i < pieces; i++) {
    const a0 = from + step * i;
    const a1 = a0 + step;
    // Tangent of a clockwise-from-12 angle: (cos a, sin a).
    path.push([
      'C',
      px(a0) + k * Math.cos(a0 * rad),
      py(a0) + k * Math.sin(a0 * rad),
      px(a1) - k * Math.cos(a1 * rad),
      py(a1) - k * Math.sin(a1 * rad),
      px(a1),
      py(a1),
    ]);
  }
  return path;
}

/** A rounded rectangle traced counter-clockwise (cut it out of a clockwise shape: nonzero). */
export function roundRectPathReverse(r: Rect, radius: number): PathCommand[] {
  const rr = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  const k = rr * (1 - KAPPA);
  const { x, y, w, h } = r;
  if (rr <= 0) {
    return [['M', x, y], ['L', x, y + h], ['L', x + w, y + h], ['L', x + w, y], ['Z']];
  }
  return [
    ['M', x + rr, y],
    ['C', x + k, y, x, y + k, x, y + rr],
    ['L', x, y + h - rr],
    ['C', x, y + h - k, x + k, y + h, x + rr, y + h],
    ['L', x + w - rr, y + h],
    ['C', x + w - k, y + h, x + w, y + h - k, x + w, y + h - rr],
    ['L', x + w, y + rr],
    ['C', x + w, y + k, x + w - k, y, x + w - rr, y],
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

/**
 * A crescent: the circle (x1, y1, r1) minus the circle (x2, y2, r2), traced along the first
 * circle's far side and back along the second's inner arc (the circles must intersect).
 */
function crescentPath(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): PathCommand[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const px = x1 + (a * dx) / d;
  const py = y1 + (a * dy) / d;
  // The two tips, ordered so the first circle's arc runs clockwise away from the second.
  const tips = [
    { x: px - (h * dy) / d, y: py + (h * dx) / d },
    { x: px + (h * dy) / d, y: py - (h * dx) / d },
  ];
  const angle = (cx: number, cy: number, p: { x: number; y: number }) =>
    (Math.atan2(p.x - cx, -(p.y - cy)) * 180) / Math.PI;
  let [start, end] = tips as [{ x: number; y: number }, { x: number; y: number }];
  let a0 = angle(x1, y1, start);
  let a1 = angle(x1, y1, end);
  while (a1 <= a0) a1 += 360;
  const mid = ((a0 + a1) / 2) * (Math.PI / 180);
  if (Math.hypot(x1 + r1 * Math.sin(mid) - x2, y1 - r1 * Math.cos(mid) - y2) < r2) {
    [start, end] = [end, start];
    a0 = angle(x1, y1, start);
    a1 = angle(x1, y1, end);
    while (a1 <= a0) a1 += 360;
  }
  // The inner arc returns through the part of the second circle inside the first.
  const b0 = angle(x2, y2, end);
  let b1 = angle(x2, y2, start);
  while (b1 >= b0) b1 -= 360;
  return [...arcPath(x1, y1, r1, a0, a1), ...arcPath(x2, y2, r2, b0, b1, false), ['Z']];
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
  chevronLeft: icon([
    ['M', 14.5, 6],
    ['L', 8.5, 12],
    ['L', 14.5, 18],
  ]),
  arrowRight: icon([
    ['M', 5, 12],
    ['L', 18.5, 12],
    ['M', 13, 6.5],
    ['L', 18.5, 12],
    ['L', 13, 17.5],
  ]),
  trendDown: icon([
    ['M', 4, 7.5],
    ['L', 9.5, 13],
    ['L', 13, 9.5],
    ['L', 20, 16.5],
    ['M', 14.5, 16.5],
    ['L', 20, 16.5],
    ['L', 20, 11],
  ]),
  close: icon([
    ['M', 6.5, 6.5],
    ['L', 17.5, 17.5],
    ['M', 17.5, 6.5],
    ['L', 6.5, 17.5],
  ]),
  home: icon([
    ['M', 3.75, 11],
    ['L', 12, 4],
    ['L', 20.25, 11],
    ['M', 6, 9.5],
    ['L', 6, 18.5],
    ['C', 6, 19.6, 6.9, 20.5, 8, 20.5],
    ['L', 16, 20.5],
    ['C', 17.1, 20.5, 18, 19.6, 18, 18.5],
    ['L', 18, 9.5],
    ['M', 10, 20.5],
    ['L', 10, 15.5],
    ['C', 10, 14.9, 10.4, 14.5, 11, 14.5],
    ['L', 13, 14.5],
    ['C', 13.6, 14.5, 14, 14.9, 14, 15.5],
    ['L', 14, 20.5],
  ]),
  bell: icon([
    ['M', 12, 3],
    ['L', 12, 4.5],
    ['M', 18, 16],
    ['L', 18, 10.5],
    ['C', 18, 7.2, 15.3, 4.5, 12, 4.5],
    ['C', 8.7, 4.5, 6, 7.2, 6, 10.5],
    ['L', 6, 16],
    ['L', 4.5, 17.75],
    ['L', 19.5, 17.75],
    ['Z'],
    ['M', 10, 20.25],
    ['C', 10.5, 21, 11.2, 21.4, 12, 21.4],
    ['C', 12.8, 21.4, 13.5, 21, 14, 20.25],
  ]),
  bars: icon([
    ['M', 6, 20],
    ['L', 6, 13],
    ['M', 12, 20],
    ['L', 12, 5],
    ['M', 18, 20],
    ['L', 18, 10],
  ]),
  pie: icon([
    ...arcPath(12, 12, 8.5, 90, 360),
    ['L', 12, 3.5],
    ['L', 12, 12],
    ['Z'],
    ['M', 15, 2.75],
    ...arcPath(15, 9, 6.25, 0, 90, false),
    ['L', 15, 9],
    ['Z'],
  ]),
  sliders: icon([
    ['M', 4, 7],
    ['L', 7, 7],
    ['M', 11, 7],
    ['L', 20, 7],
    ...circlePath(9, 7, 2),
    ['M', 4, 12],
    ['L', 13, 12],
    ['M', 17, 12],
    ['L', 20, 12],
    ...circlePath(15, 12, 2),
    ['M', 4, 17],
    ['L', 5, 17],
    ['M', 9, 17],
    ['L', 20, 17],
    ...circlePath(7, 17, 2),
  ]),
  grid: icon([
    ...roundRectPath({ x: 4, y: 4, w: 6.5, h: 6.5 }, 1.75),
    ...roundRectPath({ x: 13.5, y: 4, w: 6.5, h: 6.5 }, 1.75),
    ...roundRectPath({ x: 4, y: 13.5, w: 6.5, h: 6.5 }, 1.75),
    ...roundRectPath({ x: 13.5, y: 13.5, w: 6.5, h: 6.5 }, 1.75),
  ]),
  send: icon([
    ['M', 20.5, 3.5],
    ['L', 10.5, 13.5],
    ['M', 20.5, 3.5],
    ['L', 14.25, 20.5],
    ['L', 10.5, 13.5],
    ['L', 3.5, 9.75],
    ['Z'],
  ]),
  heart: icon([
    ['M', 12, 20],
    ['C', 12, 20, 3.5, 15, 3.5, 9.25],
    ['C', 3.5, 6.6, 5.5, 4.5, 8, 4.5],
    ['C', 9.75, 4.5, 11.2, 5.5, 12, 7],
    ['C', 12.8, 5.5, 14.25, 4.5, 16, 4.5],
    ['C', 18.5, 4.5, 20.5, 6.6, 20.5, 9.25],
    ['C', 20.5, 15, 12, 20, 12, 20],
    ['Z'],
  ]),
  chat: icon([
    ['M', 6.5, 4.5],
    ['L', 17.5, 4.5],
    ['C', 18.9, 4.5, 20, 5.6, 20, 7],
    ['L', 20, 14],
    ['C', 20, 15.4, 18.9, 16.5, 17.5, 16.5],
    ['L', 10.5, 16.5],
    ['L', 6.5, 20],
    ['L', 6.5, 16.5],
    ['C', 5.1, 16.5, 4, 15.4, 4, 14],
    ['L', 4, 7],
    ['C', 4, 5.6, 5.1, 4.5, 6.5, 4.5],
    ['Z'],
  ]),
  share: icon([
    ['M', 12, 3.5],
    ['L', 12, 14.5],
    ['M', 8, 7.5],
    ['L', 12, 3.5],
    ['L', 16, 7.5],
    ['M', 8.5, 10.5],
    ['L', 7.5, 10.5],
    ['C', 6.1, 10.5, 5, 11.6, 5, 13],
    ['L', 5, 18],
    ['C', 5, 19.4, 6.1, 20.5, 7.5, 20.5],
    ['L', 16.5, 20.5],
    ['C', 17.9, 20.5, 19, 19.4, 19, 18],
    ['L', 19, 13],
    ['C', 19, 11.6, 17.9, 10.5, 16.5, 10.5],
    ['L', 15.5, 10.5],
  ]),
  bookmark: icon([
    ['M', 7.5, 4],
    ['L', 16.5, 4],
    ['C', 17.3, 4, 18, 4.7, 18, 5.5],
    ['L', 18, 20],
    ['L', 12, 16],
    ['L', 6, 20],
    ['L', 6, 5.5],
    ['C', 6, 4.7, 6.7, 4, 7.5, 4],
    ['Z'],
  ]),
  image: icon([
    ...roundRectPath({ x: 3.5, y: 4.5, w: 17, h: 15 }, 2.75),
    ...circlePath(9, 9.75, 1.75),
    ['M', 4.25, 17.5],
    ['L', 9.75, 12.5],
    ['L', 13.5, 16],
    ['L', 16, 13.75],
    ['L', 19.75, 17],
  ]),
  globe: icon([
    ...circlePath(12, 12, 8.5),
    ['M', 12, 3.5],
    ['C', 9.1, 6.2, 9.1, 17.8, 12, 20.5],
    ['M', 12, 3.5],
    ['C', 14.9, 6.2, 14.9, 17.8, 12, 20.5],
    ['M', 3.75, 12],
    ['L', 20.25, 12],
  ]),
  moon: icon(crescentPath(12, 12, 8.25, 16.25, 7.75, 6.75)),
  sun: icon([
    ...circlePath(12, 12, 3.75),
    ['M', 12, 2.75],
    ['L', 12, 4.75],
    ['M', 12, 19.25],
    ['L', 12, 21.25],
    ['M', 2.75, 12],
    ['L', 4.75, 12],
    ['M', 19.25, 12],
    ['L', 21.25, 12],
    ['M', 5.45, 5.45],
    ['L', 6.9, 6.9],
    ['M', 17.1, 17.1],
    ['L', 18.55, 18.55],
    ['M', 5.45, 18.55],
    ['L', 6.9, 17.1],
    ['M', 17.1, 6.9],
    ['L', 18.55, 5.45],
  ]),
  shield: icon([
    ['M', 12, 3.25],
    ['L', 19, 6],
    ['L', 19, 11.5],
    ['C', 19, 15.9, 16, 19.2, 12, 20.75],
    ['C', 8, 19.2, 5, 15.9, 5, 11.5],
    ['L', 5, 6],
    ['Z'],
  ]),
  info: icon(
    [...circlePath(12, 12, 8.5), ['M', 12, 11], ['L', 12, 16.5]],
    circlePath(12, 7.9, 1.15),
  ),
  help: icon(
    [
      ...circlePath(12, 12, 8.5),
      ['M', 9.6, 9.5],
      ['C', 9.6, 8.1, 10.7, 7.1, 12, 7.1],
      ['C', 13.4, 7.1, 14.4, 8.1, 14.4, 9.35],
      ['C', 14.4, 11.1, 12, 11.4, 12, 13.2],
    ],
    circlePath(12, 16.6, 1.15),
  ),
  more: icon(null, [
    ...circlePath(6, 12, 1.7),
    ...circlePath(12, 12, 1.7),
    ...circlePath(18, 12, 1.7),
  ]),
  bag: icon([
    ['M', 6.2, 8],
    ['L', 17.8, 8],
    ['L', 18.9, 18.4],
    ['C', 19.05, 19.6, 18.1, 20.6, 16.9, 20.6],
    ['L', 7.1, 20.6],
    ['C', 5.9, 20.6, 4.95, 19.6, 5.1, 18.4],
    ['Z'],
    ['M', 9, 10.5],
    ['L', 9, 7],
    ['C', 9, 5.3, 10.3, 4, 12, 4],
    ['C', 13.7, 4, 15, 5.3, 15, 7],
    ['L', 15, 10.5],
  ]),
  wallet: icon([
    ...roundRectPath({ x: 3.5, y: 6, w: 17, h: 13.5 }, 3),
    ['M', 20.5, 10.25],
    ['L', 16.25, 10.25],
    ['C', 15, 10.25, 14, 11.25, 14, 12.75],
    ['C', 14, 14.25, 15, 15.25, 16.25, 15.25],
    ['L', 20.5, 15.25],
    ['M', 6.5, 6],
    ['L', 15.5, 3.75],
    ['C', 16.4, 3.5, 17, 4.1, 17, 5],
    ['L', 17, 6],
  ]),
  clock: icon([...circlePath(12, 12, 8.5), ['M', 12, 7.5], ['L', 12, 12], ['L', 15.25, 14]]),
  star: icon([
    ['M', 12, 3.5],
    ['L', 14.6, 8.9],
    ['L', 20.5, 9.65],
    ['L', 16.2, 13.75],
    ['L', 17.3, 19.6],
    ['L', 12, 16.75],
    ['L', 6.7, 19.6],
    ['L', 7.8, 13.75],
    ['L', 3.5, 9.65],
    ['L', 9.4, 8.9],
    ['Z'],
  ]),
  bolt: icon([
    ['M', 13.25, 3],
    ['L', 5.5, 13.5],
    ['L', 11.5, 13.5],
    ['L', 10.75, 21],
    ['L', 18.5, 10.5],
    ['L', 12.5, 10.5],
    ['Z'],
  ]),
  layout: icon([
    ...roundRectPath({ x: 4, y: 4, w: 16, h: 16 }, 2.75),
    ['M', 4, 9.5],
    ['L', 20, 9.5],
    ['M', 10, 9.5],
    ['L', 10, 20],
  ]),
  droplet: icon([
    ['M', 12, 3.5],
    ['C', 12, 3.5, 5.5, 10.4, 5.5, 14.5],
    ['C', 5.5, 18.1, 8.4, 21, 12, 21],
    ['C', 15.6, 21, 18.5, 18.1, 18.5, 14.5],
    ['C', 18.5, 10.4, 12, 3.5, 12, 3.5],
    ['Z'],
  ]),
  download: icon([
    ['M', 12, 4],
    ['L', 12, 15],
    ['M', 7.5, 10.5],
    ['L', 12, 15],
    ['L', 16.5, 10.5],
    ['M', 5, 19.5],
    ['L', 19, 19.5],
  ]),
  film: icon([
    ...roundRectPath({ x: 3, y: 6, w: 13, h: 12 }, 2.75),
    ['M', 16, 10.5],
    ['L', 20.25, 8.1],
    ['C', 20.6, 7.9, 21, 8.15, 21, 8.55],
    ['L', 21, 15.45],
    ['C', 21, 15.85, 20.6, 16.1, 20.25, 15.9],
    ['L', 16, 13.5],
  ]),
  play: icon(null, [
    ['M', 8.5, 5.6],
    ['C', 8.5, 4.85, 9.3, 4.4, 9.95, 4.8],
    ['L', 18.6, 10.95],
    ['C', 19.2, 11.35, 19.2, 12.65, 18.6, 13.05],
    ['L', 9.95, 19.2],
    ['C', 9.3, 19.6, 8.5, 19.15, 8.5, 18.4],
    ['Z'],
  ]),
  doc: icon([
    ['M', 7, 3.5],
    ['L', 14, 3.5],
    ['L', 18.5, 8],
    ['L', 18.5, 19],
    ['C', 18.5, 19.8, 17.8, 20.5, 17, 20.5],
    ['L', 7, 20.5],
    ['C', 6.2, 20.5, 5.5, 19.8, 5.5, 19],
    ['L', 5.5, 5],
    ['C', 5.5, 4.2, 6.2, 3.5, 7, 3.5],
    ['Z'],
    ['M', 14, 3.5],
    ['L', 14, 8],
    ['L', 18.5, 8],
    ['M', 8.75, 12.5],
    ['L', 15.25, 12.5],
    ['M', 8.75, 16],
    ['L', 13, 16],
  ]),
  pin: icon([
    ['M', 12, 21],
    ['C', 12, 21, 5.5, 15, 5.5, 10],
    ['C', 5.5, 6.4, 8.4, 3.5, 12, 3.5],
    ['C', 15.6, 3.5, 18.5, 6.4, 18.5, 10],
    ['C', 18.5, 15, 12, 21, 12, 21],
    ['Z'],
    ...circlePath(12, 10, 2.5),
  ]),
  award: icon([
    ...circlePath(12, 9.5, 5.75),
    ['M', 8.9, 14.4],
    ['L', 7.75, 20.5],
    ['L', 12, 18.25],
    ['L', 16.25, 20.5],
    ['L', 15.1, 14.4],
  ]),
  users: icon([
    ...circlePath(9, 8.5, 3.25),
    ['M', 3, 19.5],
    ['C', 3.6, 16.4, 6, 14.5, 9, 14.5],
    ['C', 12, 14.5, 14.4, 16.4, 15, 19.5],
    ['M', 15.5, 5.6],
    ['C', 17.1, 5.9, 18.25, 7.1, 18.25, 8.6],
    ['C', 18.25, 10.1, 17.1, 11.3, 15.5, 11.6],
    ['M', 17.25, 14.75],
    ['C', 19.2, 15.4, 20.6, 17.1, 21, 19.5],
  ]),
  mic: icon([
    ...roundRectPath({ x: 9, y: 3.5, w: 6, h: 11 }, 3),
    ['M', 5.75, 11.5],
    ['C', 5.75, 15, 8.55, 17.75, 12, 17.75],
    ['C', 15.45, 17.75, 18.25, 15, 18.25, 11.5],
    ['M', 12, 17.75],
    ['L', 12, 20.75],
  ]),
  target: icon([...circlePath(12, 12, 8.5), ...circlePath(12, 12, 4.75)], circlePath(12, 12, 1.6)),
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
