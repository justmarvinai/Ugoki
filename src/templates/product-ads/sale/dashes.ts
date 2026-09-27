/**
 * A dashed rounded-rectangle border that draws on (docs/templates/04-product-ads.md §4.5). The
 * engine's stroke `trim` replaces its `dash` pattern, so the two can't be combined; instead every
 * dash is its own short path along the true perimeter (corners are arcs), the dash count is
 * rounded so the pattern closes without a half dash at the seam, and drawing on reveals whole
 * dashes plus a trimmed partial one — clockwise from the top-left corner.
 */

import type { Draw, PathCommand, PathData, Rect, Stroke } from '@/engine';

export type DashedBorder = {
  readonly dashes: readonly PathData[];
  /** Every dash as one path, stroked once the border is complete. */
  readonly all: PathData;
  /** Distance from one dash start to the next, and one dash's length (perimeter units). */
  readonly step: number;
  readonly dash: number;
  readonly perimeter: number;
};

export function dashedBorder(r: Rect, radius: number, dash: number, gap: number): DashedBorder {
  const rr = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  const w = r.w - 2 * rr;
  const h = r.h - 2 * rr;
  const arc = (Math.PI / 2) * rr;
  const perimeter = 2 * (w + h) + 4 * arc;

  const arcPoint = (cx: number, cy: number, from: number, d: number): [number, number] => {
    const a = from + (rr > 0 ? d / rr : 0);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };
  // Clockwise from the end of the top-left corner.
  const sides: [number, (d: number) => [number, number]][] = [
    [w, (d) => [r.x + rr + d, r.y]],
    [arc, (d) => arcPoint(r.x + r.w - rr, r.y + rr, -Math.PI / 2, d)],
    [h, (d) => [r.x + r.w, r.y + rr + d]],
    [arc, (d) => arcPoint(r.x + r.w - rr, r.y + r.h - rr, 0, d)],
    [w, (d) => [r.x + r.w - rr - d, r.y + r.h]],
    [arc, (d) => arcPoint(r.x + rr, r.y + r.h - rr, Math.PI / 2, d)],
    [h, (d) => [r.x, r.y + r.h - rr - d]],
    [arc, (d) => arcPoint(r.x + rr, r.y + rr, Math.PI, d)],
  ];
  const at = (distance: number): [number, number] => {
    let rest = ((distance % perimeter) + perimeter) % perimeter;
    for (const [length, point] of sides) {
      if (rest <= length) return point(rest);
      rest -= length;
    }
    return [r.x + rr, r.y];
  };

  const count = Math.max(4, Math.round(perimeter / (dash + gap)));
  const step = perimeter / count;
  const length = (step * dash) / (dash + gap);
  // Curved dashes are sampled finely enough to stay round at 4K.
  const sample = Math.max(1, rr / 6);
  const dashes: PathData[] = [];
  const all: PathCommand[] = [];
  for (let k = 0; k < count; k++) {
    const start = k * step;
    const n = Math.max(1, Math.ceil(length / sample));
    const commands: PathCommand[] = [];
    for (let i = 0; i <= n; i++) {
      const [x, y] = at(start + (length * i) / n);
      commands.push(i === 0 ? ['M', x, y] : ['L', x, y]);
    }
    dashes.push(commands);
    all.push(...commands);
  }
  return { dashes, all, step, dash: length, perimeter };
}

/** Draws the border up to `progress` (0..1) of its perimeter. */
export function drawDashedBorder(
  g: Draw,
  border: DashedBorder,
  progress: number,
  stroke: Omit<Stroke, 'trim' | 'dash'>,
  opacity = 1,
): void {
  if (progress <= 0) return;
  if (progress >= 1) {
    g.path(border.all, { stroke, opacity });
    return;
  }
  const reach = progress * border.perimeter;
  for (let k = 0; k < border.dashes.length; k++) {
    const start = k * border.step;
    if (start >= reach) break;
    const dash = border.dashes[k];
    if (!dash) continue;
    const shown = (reach - start) / border.dash;
    g.path(dash, { stroke: shown >= 1 ? stroke : { ...stroke, trim: [0, shown] }, opacity });
  }
}
