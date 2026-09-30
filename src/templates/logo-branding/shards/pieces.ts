/**
 * Vector shards: the logo's own outlines cut by each shard's triangle, once in `build`. The
 * outlines are flattened and every ring is clipped to the (convex) triangle with
 * Sutherland–Hodgman, which keeps each point's winding inside the triangle — so nonzero and
 * even-odd shapes (letter counters, rings) cut exactly. A flying shard is then one small fill
 * per shape: sharp at any size and far cheaper than clipping the whole logo per shard.
 *
 * Logos with strokes, and raster logos, use sprites instead (raster.ts).
 * Engine candidate: `clipPath(path, convexPolygon)` for shatter/slice effects.
 */

import type { Color, Graphic, Paint, PathCommand, PathData, Rect, VectorGraphic } from '@/engine';
import { type AlphaGrid, colorOf, type LogoPaint, placement } from './raster';

/** One shape of the logo inside one shard, and how it is painted. */
export type Part = { readonly path: PathData; readonly paint: Paint };

/** Flattening step along curves, in design units (fine at 4K). */
const STEP = 2.5;

type Ring = number[];

/** Flattens a path (artwork units) into rings, placed into design units by x + k·p. */
function flatten(path: PathData, x: number, y: number, k: number): Ring[] {
  const rings: Ring[] = [];
  let ring: Ring = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const push = (px: number, py: number) => {
    ring.push(x + k * px, y + k * py);
  };
  const close = () => {
    if (ring.length >= 6) rings.push(ring);
    ring = [];
  };
  for (const command of path) {
    switch (command[0]) {
      case 'M':
        close();
        cx = sx = command[1];
        cy = sy = command[2];
        push(cx, cy);
        break;
      case 'L':
        cx = command[1];
        cy = command[2];
        push(cx, cy);
        break;
      case 'Q': {
        const [, qx, qy, ex, ey] = command;
        const length = (Math.hypot(qx - cx, qy - cy) + Math.hypot(ex - qx, ey - qy)) * k;
        const n = Math.max(2, Math.ceil(length / STEP));
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const mt = 1 - t;
          push(
            mt * mt * cx + 2 * mt * t * qx + t * t * ex,
            mt * mt * cy + 2 * mt * t * qy + t * t * ey,
          );
        }
        cx = ex;
        cy = ey;
        break;
      }
      case 'C': {
        const [, ax, ay, bx, by, ex, ey] = command;
        const length =
          (Math.hypot(ax - cx, ay - cy) +
            Math.hypot(bx - ax, by - ay) +
            Math.hypot(ex - bx, ey - by)) *
          k;
        const n = Math.max(2, Math.ceil(length / STEP));
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const mt = 1 - t;
          const a = mt * mt * mt;
          const b = 3 * mt * mt * t;
          const c = 3 * mt * t * t;
          const d = t * t * t;
          push(a * cx + b * ax + c * bx + d * ex, a * cy + b * ay + c * by + d * ey);
        }
        cx = ex;
        cy = ey;
        break;
      }
      case 'Z':
        cx = sx;
        cy = sy;
        close();
        break;
    }
  }
  close();
  return rings;
}

/** Sutherland–Hodgman: a ring clipped to a convex polygon whose corners turn positively. */
function clipRing(ring: Ring, clip: readonly number[]): Ring {
  let input = ring;
  const corners = clip.length / 2;
  for (let e = 0; e < corners && input.length >= 6; e++) {
    const ax = clip[2 * e] as number;
    const ay = clip[2 * e + 1] as number;
    const bx = clip[(2 * e + 2) % clip.length] as number;
    const by = clip[(2 * e + 3) % clip.length] as number;
    const side = (px: number, py: number) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const out: Ring = [];
    const n = input.length / 2;
    let px = input[2 * n - 2] as number;
    let py = input[2 * n - 1] as number;
    let ps = side(px, py);
    for (let i = 0; i < n; i++) {
      const qx = input[2 * i] as number;
      const qy = input[2 * i + 1] as number;
      const qs = side(qx, qy);
      if (ps >= 0 !== qs >= 0) {
        const t = ps / (ps - qs);
        out.push(px + (qx - px) * t, py + (qy - py) * t);
      }
      if (qs >= 0) out.push(qx, qy);
      px = qx;
      py = qy;
      ps = qs;
    }
    input = out;
  }
  return input;
}

/**
 * The logo's coverage over the design-space `area` at `scale` cells per unit, from its own
 * outlines (a scanline through every cell row, honouring each shape's fill rule) — the same
 * cut in every browser, and without a canvas. Null for logos with strokes and raster logos.
 */
export function vectorCoverage(
  graphic: Graphic | null,
  dest: Rect,
  area: Rect,
  scale: number,
): AlphaGrid | null {
  if (graphic?.kind !== 'vector') return null;
  if (graphic.shapes.some((shape) => shape.stroke && shape.strokeWidth > 0)) return null;
  const at = placement(graphic, dest);
  if (!at) return null;
  const width = Math.max(1, Math.ceil(area.w * scale));
  const height = Math.max(1, Math.ceil(area.h * scale));
  const alpha = new Float32Array(width * height);
  const crossings: { x: number; dir: number }[] = [];
  for (const shape of graphic.shapes) {
    if (!shape.fill) continue;
    const value = shape.opacity * shape.fillOpacity;
    const rings = flatten(shape.path, at.x, at.y, at.k);
    const evenOdd = shape.fillRule === 'evenodd';
    for (let row = 0; row < height; row++) {
      const y = area.y + (row + 0.5) / scale;
      crossings.length = 0;
      for (const ring of rings) {
        const n = ring.length / 2;
        for (let i = 0; i < n; i++) {
          const x1 = ring[2 * i] as number;
          const y1 = ring[2 * i + 1] as number;
          const j = (i + 1) % n;
          const x2 = ring[2 * j] as number;
          const y2 = ring[2 * j + 1] as number;
          if (y1 <= y === y2 <= y) continue;
          crossings.push({ x: x1 + ((y - y1) * (x2 - x1)) / (y2 - y1), dir: y2 > y1 ? 1 : -1 });
        }
      }
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let c = 0; c < crossings.length - 1; c++) {
        const cross = crossings[c] as { x: number; dir: number };
        winding += cross.dir;
        if (evenOdd ? (winding & 1) === 0 : winding === 0) continue;
        // Cells whose centers lie between this crossing and the next.
        const from = Math.max(0, Math.ceil((cross.x - area.x) * scale - 0.5));
        const to = Math.min(
          width - 1,
          Math.floor(((crossings[c + 1]?.x ?? 0) - area.x) * scale - 0.5),
        );
        for (let col = from; col <= to; col++) {
          const k = row * width + col;
          alpha[k] = Math.max(alpha[k] ?? 0, value);
        }
      }
    }
  }
  return { x: area.x, y: area.y, scale, width, height, alpha };
}

const bounds = (ring: Ring): Rect => {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < ring.length; i += 2) {
    x0 = Math.min(x0, ring[i] as number);
    x1 = Math.max(x1, ring[i] as number);
    y0 = Math.min(y0, ring[i + 1] as number);
    y1 = Math.max(y1, ring[i + 1] as number);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/**
 * The logo's fills cut by each triangle (corners as x, y pairs in design units), for the logo's
 * own colors and for a single `lit` color. Null when the logo has strokes (use sprites).
 */
export function vectorPieces(
  graphic: VectorGraphic,
  dest: Rect,
  triangles: readonly (readonly number[])[],
  paint: LogoPaint,
  lit: Color,
): { parts: Part[][]; lit: Part[][] } | null {
  const at = placement(graphic, dest);
  if (!at) return null;
  if (graphic.shapes.some((shape) => shape.stroke && shape.strokeWidth > 0)) return null;
  const shapes = graphic.shapes.flatMap((shape) => {
    const fill = colorOf(shape.fill, paint);
    if (!fill) return [];
    const rings = flatten(shape.path, at.x, at.y, at.k).map((ring) => ({
      ring,
      box: bounds(ring),
    }));
    return [{ rings, fill, rule: shape.fillRule, opacity: shape.opacity * shape.fillOpacity }];
  });
  const parts: Part[][] = [];
  const litParts: Part[][] = [];
  for (const corners of triangles) {
    const box = bounds([...corners]);
    const mine: Part[] = [];
    const mineLit: Part[] = [];
    for (const shape of shapes) {
      const path: PathCommand[] = [];
      for (const { ring, box: rb } of shape.rings) {
        if (
          rb.x > box.x + box.w ||
          rb.x + rb.w < box.x ||
          rb.y > box.y + box.h ||
          rb.y + rb.h < box.y
        ) {
          continue;
        }
        const cut = clipRing(ring, corners);
        if (cut.length < 6) continue;
        path.push(['M', cut[0] as number, cut[1] as number]);
        for (let i = 2; i < cut.length; i += 2)
          path.push(['L', cut[i] as number, cut[i + 1] as number]);
        path.push(['Z']);
      }
      if (path.length === 0) continue;
      const { rule: fillRule, opacity } = shape;
      mine.push({ path, paint: { fill: shape.fill, fillRule, opacity } });
      mineLit.push({ path, paint: { fill: lit, fillRule, opacity } });
    }
    parts.push(mine);
    litParts.push(mineLit);
  }
  return { parts, lit: litParts };
}
