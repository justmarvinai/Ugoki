/**
 * Stats for Numbers: splitting "12M+ views" into its figure and label, choosing the grid, and
 * the mini visuals (ring for percentages, before/after bars for multipliers, growth bars for
 * everything else).
 */

import {
  type Color,
  type Draw,
  type Figure,
  type FormatId,
  type PathCommand,
  type PathData,
  parseFigure,
  type Rect,
} from '@/engine';

/** A figure (optionally after a symbol such as "€ " or "+"), then the label. */
const SPLIT = /^([^\p{L}\p{N}\s]*\s?[^\s]*?\p{N}[^\s]*)\s*(.*)$/su;

export type StatText = { value: string; label: string; figure: Figure | null };

/**
 * "12M+ views" → figure "12M+", label "views". Text that doesn't start with a number keeps its
 * first word as the (uncounted) value.
 */
export function splitStat(input: string): StatText {
  const text = input.trim().replace(/\s+/g, ' ');
  const match = SPLIT.exec(text);
  if (match) {
    const value = (match[1] ?? '').trim();
    return { value, label: (match[2] ?? '').trim(), figure: parseFigure(value) };
  }
  const [first = '', ...rest] = text.split(' ');
  return { value: first, label: rest.join(' '), figure: null };
}

export type Arrangement = { cols: number; rows: number };

/**
 * The grid for `count` stats. Row runs along the frame's long side — across in landscape and
 * square, as a single column in the portrait formats; Grid is two columns; Auto picks per format.
 */
export function arrange(layout: 'auto' | 'row' | 'grid', format: FormatId, count: number) {
  const across: Arrangement = { cols: Math.max(1, count), rows: 1 };
  const column: Arrangement = { cols: 1, rows: Math.max(1, count) };
  const grid: Arrangement = count <= 1 ? column : { cols: 2, rows: Math.ceil(count / 2) };
  const portrait = format === '9:16' || format === '4:5';
  if (layout === 'row') return portrait ? column : across;
  if (layout === 'grid') return grid;
  switch (format) {
    case '16:9':
      return across;
    case '1:1':
      return count === 4 ? grid : across;
    case '4:5':
      return count === 4 ? grid : count === 3 ? column : across;
    case '9:16':
      return column;
  }
}

export type VisualKind = 'ring' | 'compare' | 'growth';

export function visualKind(figure: Figure): VisualKind {
  const unit = `${figure.prefix}${figure.suffix}`;
  if (unit.includes('%')) return 'ring';
  if (/[×x]/i.test(figure.suffix)) return 'compare';
  return 'growth';
}

/** Width of a visual's box for its height `s`. */
export const visualWidth = (kind: VisualKind, s: number) => (kind === 'ring' ? s : 1.7 * s);

/** The trend line of `growth`: up and to the right, with two honest dips (unit box, y down). */
const TREND: readonly (readonly [number, number])[] = [
  [0, 0.8],
  [0.2, 0.62],
  [0.37, 0.7],
  [0.58, 0.42],
  [0.76, 0.5],
  [1, 0.1],
];

export type VisualColors = { accent: Color; track: Color; before: Color };

/**
 * A mini visual laid out in `box` (build time); the returned function draws it at progress `p`
 * (0..1, already eased): a donut for percentages, before/after bars for multipliers, a trend
 * line for everything else. Each has a quiet track and an accent part that draws on.
 */
export function miniVisual(
  kind: VisualKind,
  figure: Figure,
  box: Rect,
  colors: VisualColors,
): (g: Draw, p: number) => void {
  const s = box.h;
  if (kind === 'ring') {
    const stroke = 0.16 * s;
    const r = s / 2 - stroke / 2;
    const cx = box.x + s / 2;
    const cy = box.y + s / 2;
    const share = Math.min(1, Math.max(0, figure.value / 100));
    return (g, p) => {
      if (p <= 0) return;
      g.circle(cx, cy, r, {
        stroke: { color: colors.track, width: stroke },
        opacity: Math.min(1, p * 4),
      });
      if (share * p > 0) {
        g.circle(cx, cy, r, {
          stroke: { color: colors.accent, width: stroke, cap: 'round', trim: [0, share * p] },
        });
      }
    };
  }
  if (kind === 'compare') {
    // Before (1) and after (the multiplier), as two bars on one scale.
    const thick = 0.3 * s;
    const before = Math.max(0.1, 1 / Math.max(1, figure.value));
    return (g, p) => {
      const q1 = Math.min(1, p / 0.45);
      const q2 = Math.min(1, Math.max(0, (p - 0.25) / 0.75));
      if (q1 > 0) {
        const w = Math.max(thick, box.w * before * q1);
        g.roundRect({ x: box.x, y: box.y + 0.05 * s, w, h: thick }, thick / 2, {
          fill: colors.before,
          opacity: Math.min(1, q1 * 3),
        });
      }
      if (q2 > 0) {
        const w = Math.max(thick, box.w * q2);
        g.roundRect({ x: box.x, y: box.y + s - thick - 0.05 * s, w, h: thick }, thick / 2, {
          fill: colors.accent,
          opacity: Math.min(1, q2 * 3),
        });
      }
    };
  }
  const stroke = 0.11 * s;
  const inset = stroke;
  const points = TREND.map(
    ([x, y]) =>
      [box.x + inset + x * (box.w - 2 * inset), box.y + inset + y * (s - 2 * inset)] as const,
  );
  const path: PathData = points.map(([x, y], i): PathCommand => [i === 0 ? 'M' : 'L', x, y]);
  const [endX, endY] = points[points.length - 1] ?? [box.x, box.y];
  return (g, p) => {
    if (p <= 0) return;
    const line = { width: stroke, cap: 'round' as const, join: 'round' as const };
    g.path(path, { stroke: { ...line, color: colors.track }, opacity: Math.min(1, p * 4) });
    g.path(path, { stroke: { ...line, color: colors.accent, trim: [0, p] } });
    const dot = Math.min(1, Math.max(0, (p - 0.85) / 0.15));
    if (dot > 0) g.circle(endX, endY, stroke * 1.25 * dot, { fill: colors.accent });
  };
}
