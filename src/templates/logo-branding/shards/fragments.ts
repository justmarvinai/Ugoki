/**
 * Cuts a logo into shards: seeded, evenly spread points inside the logo's ink (best-candidate
 * sampling), a ring of points around its box, a Delaunay triangulation of both, and only the
 * triangles that carry ink. The point sequence is the same for every shard count, so Low,
 * Medium and High cut the same logo progressively finer.
 */

import type { Graphic, PathData, Rect, Rng } from '@/engine';
import { delaunay, type Point } from './delaunay';
import { vectorCoverage } from './pieces';
import { type AlphaGrid, rasterAlpha } from './raster';

export type Shard = {
  /** The triangle in design units (a clip path). */
  readonly path: PathData;
  /** Ink centroid — the shard's pivot. */
  readonly x: number;
  readonly y: number;
  /** Ink area in design units² (the triangle's area without a coverage grid). */
  readonly ink: number;
};

/** Candidates tried per point: higher spreads points more evenly. */
const CANDIDATES = 12;

export function cutShards(options: {
  graphic: Graphic | null;
  /** Where the logo is drawn (design units). */
  rect: Rect;
  /** How many shards to aim for. */
  target: number;
  rng: Rng;
}): Shard[] {
  const { graphic, rect, target, rng } = options;
  if (!(rect.w > 0 && rect.h > 0)) return [];
  // The ring of border points sits a little outside the ink, so every inked pixel is covered.
  const margin = Math.max(2, 0.04 * Math.min(rect.w, rect.h));
  const box: Rect = {
    x: rect.x - margin,
    y: rect.y - margin,
    w: rect.w + 2 * margin,
    h: rect.h + 2 * margin,
  };
  // Coverage from the vector outlines where possible (the same cut in every browser).
  const scale = Math.min(1, 220 / Math.min(box.w, box.h));
  const grid = vectorCoverage(graphic, rect, box, scale) ?? rasterAlpha(graphic, rect, box, scale);

  const border = ring(box, Math.sqrt((rect.w * rect.h) / Math.max(4, target)));
  const inside = candidates(grid);
  const count = Math.max(4, Math.round(target * 1.4) + 8);
  const points = spread(inside, border, count, rng, grid);

  // Take as many interior points as it needs to land near the target shard count.
  let n = Math.max(3, Math.round(target * 0.5));
  let best: Shard[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const shards = triangulate([...border, ...points.slice(0, n)], grid);
    if (Math.abs(shards.length - target) < Math.abs(best.length - target)) best = shards;
    const miss = target - shards.length;
    if (Math.abs(miss) <= Math.max(1, target * 0.06)) break;
    const next = Math.min(points.length, Math.max(3, n + Math.round(miss * 0.55)));
    if (next === n) break;
    n = next;
  }
  return best;
}

/** Points around the box: its corners and, along long sides, a gentle outward bulge. */
function ring(box: Rect, spacing: number): Point[] {
  const out: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
  const side = (length: number, emit: (f: number, bulge: number) => void) => {
    const k = Math.max(0, Math.round(length / (spacing * 1.6)) - 1);
    for (let j = 1; j <= k; j++) {
      const f = j / (k + 1);
      emit(f, 0.03 * Math.min(box.w, box.h) * Math.sin(Math.PI * f));
    }
  };
  side(box.w, (f, bulge) => {
    out.push({ x: box.x + f * box.w, y: box.y - bulge });
    out.push({ x: box.x + f * box.w, y: box.y + box.h + bulge });
  });
  side(box.h, (f, bulge) => {
    out.push({ x: box.x - bulge, y: box.y + f * box.h });
    out.push({ x: box.x + box.w + bulge, y: box.y + f * box.h });
  });
  return out;
}

/** Grid cells well inside the ink (null without a grid, or for an empty logo). */
function candidates(grid: AlphaGrid | null): Int32Array | null {
  if (!grid) return null;
  const cells: number[] = [];
  for (let i = 0; i < grid.alpha.length; i++) if ((grid.alpha[i] ?? 0) >= 0.6) cells.push(i);
  return cells.length > 0 ? Int32Array.from(cells) : null;
}

/** Best-candidate sampling: each new point is the candidate farthest from all others. */
function spread(
  inside: Int32Array | null,
  border: readonly Point[],
  count: number,
  rng: Rng,
  grid: AlphaGrid | null,
): Point[] {
  const out: Point[] = [];
  const all: Point[] = [...border];
  const sample = (): Point => {
    if (inside && grid) {
      const cell = inside[Math.floor(rng.next() * inside.length)] ?? 0;
      const cx = cell % grid.width;
      const cy = Math.floor(cell / grid.width);
      return {
        x: grid.x + (cx + rng.next()) / grid.scale,
        y: grid.y + (cy + rng.next()) / grid.scale,
      };
    }
    // No coverage grid: anywhere inside the ring's box, away from its edges.
    const [a, , c] = border as [Point, Point, Point];
    return {
      x: a.x + (c.x - a.x) * rng.range(0.06, 0.94),
      y: a.y + (c.y - a.y) * rng.range(0.06, 0.94),
    };
  };
  for (let i = 0; i < count; i++) {
    let best: Point | null = null;
    let bestD = -1;
    for (let k = 0; k < CANDIDATES; k++) {
      const p = sample();
      let d = Number.POSITIVE_INFINITY;
      for (const q of all) d = Math.min(d, (p.x - q.x) ** 2 + (p.y - q.y) ** 2);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best || bestD < 1e-6) continue;
    out.push(best);
    all.push(best);
  }
  return out;
}

/** Delaunay triangles that carry ink, with their ink centroid and area. */
function triangulate(points: readonly Point[], grid: AlphaGrid | null): Shard[] {
  const shards: Shard[] = [];
  for (const [ia, ib, ic] of delaunay(points)) {
    const a = points[ia] as Point;
    const b = points[ib] as Point;
    const c = points[ic] as Point;
    const path: PathData = [['M', a.x, a.y], ['L', b.x, b.y], ['L', c.x, c.y], ['Z']];
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
    if (!grid) {
      shards.push({ path, x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, ink: area });
      continue;
    }
    // Sum the coverage of grid pixels whose centers lie inside the triangle.
    const s = grid.scale;
    const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - grid.x) * s));
    const x1 = Math.min(grid.width - 1, Math.ceil((Math.max(a.x, b.x, c.x) - grid.x) * s));
    const y0 = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - grid.y) * s));
    const y1 = Math.min(grid.height - 1, Math.ceil((Math.max(a.y, b.y, c.y) - grid.y) * s));
    let sum = 0;
    let sx = 0;
    let sy = 0;
    for (let y = y0; y <= y1; y++) {
      const py = grid.y + (y + 0.5) / s;
      for (let x = x0; x <= x1; x++) {
        const alpha = grid.alpha[y * grid.width + x] ?? 0;
        if (alpha <= 0) continue;
        const px = grid.x + (x + 0.5) / s;
        if (!insideTriangle(px, py, a, b, c)) continue;
        sum += alpha;
        sx += alpha * px;
        sy += alpha * py;
      }
    }
    // Specks of a pixel or two would flicker rather than read as fragments.
    if (sum < 2.5) continue;
    shards.push({ path, x: sx / sum, y: sy / sum, ink: sum / (s * s) });
  }
  return shards;
}

function insideTriangle(px: number, py: number, a: Point, b: Point, c: Point): boolean {
  const d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
  const d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
  const d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}
