/**
 * Stretch's width model: how a line's glyphs advance at any `wdth` × `wght`, so a line can be
 * solved to fill an exact width — and kept there while its letters breathe.
 *
 * Variable fonts interpolate linearly between their masters, so a glyph's advance is piecewise
 * linear in `wdth` (breaks at the default, 100) and in `wght` (breaks at the avar points). Shaping
 * the line on a small grid (every master × every 100 weight units) and interpolating bilinearly
 * reproduces HarfBuzz's advances — kerning included — without shaping per frame. Ink edges (the
 * first and last glyph's outer ink) come from the same grid, sampled more finely at the hold
 * weight, where the line's edges are locked to the frame.
 */

import type { BuildContext, ControlSchema, Glyph, TextStyle } from '@/engine';

type TextEngine = BuildContext<ControlSchema>['text'];

/** Size the samples are shaped at (values are stored in em). */
export const NOMINAL = 100;

export type Axis = { min: number; max: number };

export type LineTable = {
  /** Glyphs of the reference sample (hold weight, `wdth` 100), in reading order. */
  readonly glyphs: readonly Glyph[];
  readonly n: number;
  /** First and last glyph with ink (the line's optical edges); −1 for a blank line. */
  readonly first: number;
  readonly last: number;
  /** Ink above the baseline and below it (em, at the reference sample). */
  readonly top: number;
  readonly bottom: number;
  /** Advance of glyph `i` at `wdth` × `wght` (em, without tracking). */
  advance(i: number, wdth: number, wght: number): number;
  /** Left and right ink of glyph `i` relative to its origin (em). */
  inkLeft(i: number, wdth: number, wght: number): number;
  inkRight(i: number, wdth: number, wght: number): number;
};

/** Index of the grid cell holding `v` and the fraction across it. */
function cell(grid: readonly number[], v: number): [number, number] {
  const last = grid.length - 1;
  if (last <= 0) return [0, 0];
  if (v <= (grid[0] as number)) return [0, 0];
  if (v >= (grid[last] as number)) return [last - 1, 1];
  let j = 0;
  while (j < last - 1 && v > (grid[j + 1] as number)) j++;
  const a = grid[j] as number;
  const b = grid[j + 1] as number;
  return [j, b > a ? (v - a) / (b - a) : 0];
}

/**
 * Shapes `text` on a `wdth` × `wght` grid. `wdthGrid` covers the whole axis (every master);
 * `holdGrid` adds finer `wdth` samples at `holdWeight` for exact ink edges during the hold.
 */
export function sampleLine(
  text: TextEngine,
  source: string,
  style: Omit<TextStyle, 'size' | 'width' | 'weight'>,
  options: {
    wdthGrid: readonly number[];
    wghtGrid: readonly number[];
    holdGrid: readonly number[];
    holdWeight: number;
  },
): LineTable | null {
  const { wdthGrid, wghtGrid, holdGrid, holdWeight } = options;
  const shape = (wdth: number, wght: number) => {
    const line = text.line(source, { ...style, size: NOMINAL, width: wdth, weight: wght }).lines[0];
    return line?.glyphs ?? [];
  };
  const reference = shape(100, holdWeight);
  const n = reference.length;
  if (n === 0) return null;

  type Sample = { adv: Float64Array; left: Float64Array; right: Float64Array };
  const read = (glyphs: readonly Glyph[]): Sample | null => {
    // Axis-dependent substitutions could change the glyph run; such samples are skipped.
    if (glyphs.length !== n) return null;
    const adv = new Float64Array(n);
    const left = new Float64Array(n);
    const right = new Float64Array(n);
    glyphs.forEach((glyph, i) => {
      // Advances carry kerning (HarfBuzz applies it to the first glyph of a pair).
      adv[i] = glyph.advance / NOMINAL;
      left[i] = (glyph.ink ? glyph.ink.x : 0) / NOMINAL;
      right[i] = (glyph.ink ? glyph.ink.x + glyph.ink.w : glyph.advance) / NOMINAL;
    });
    return { adv, left, right };
  };

  // The whole grid; rows with a failed sample fall back to their neighbours.
  const grid: (Sample | null)[][] = wghtGrid.map((wght) =>
    wdthGrid.map((wdth) => read(shape(wdth, wght))),
  );
  const hold = holdGrid.map((wdth) => read(shape(wdth, holdWeight)));
  const fallback = read(reference) as Sample;
  const at = (k: number, j: number): Sample => grid[k]?.[j] ?? fallback;
  const holdAt = (j: number): Sample => hold[j] ?? fallback;

  const bilinear = (field: keyof Sample, i: number, wdth: number, wght: number): number => {
    if (wght === holdWeight) {
      const [j, f] = cell(holdGrid, wdth);
      const a = holdAt(j)[field][i] ?? 0;
      const b = holdAt(Math.min(j + 1, holdGrid.length - 1))[field][i] ?? 0;
      return a + (b - a) * f;
    }
    const [j, fx] = cell(wdthGrid, wdth);
    const [k, fy] = cell(wghtGrid, wght);
    const j1 = Math.min(j + 1, wdthGrid.length - 1);
    const k1 = Math.min(k + 1, wghtGrid.length - 1);
    const v00 = at(k, j)[field][i] ?? 0;
    const v01 = at(k, j1)[field][i] ?? 0;
    const v10 = at(k1, j)[field][i] ?? 0;
    const v11 = at(k1, j1)[field][i] ?? 0;
    const top = v00 + (v01 - v00) * fx;
    const bottom = v10 + (v11 - v10) * fx;
    return top + (bottom - top) * fy;
  };

  let first = -1;
  let last = -1;
  let top = 0;
  let bottom = 0;
  reference.forEach((glyph, i) => {
    if (!glyph.ink && !glyph.fallback) return;
    if (first < 0) first = i;
    last = i;
    if (glyph.ink) {
      top = Math.max(top, -glyph.ink.y / NOMINAL);
      bottom = Math.max(bottom, (glyph.ink.y + glyph.ink.h) / NOMINAL);
    }
  });

  return {
    glyphs: reference,
    n,
    first,
    last,
    top,
    bottom,
    advance: (i, wdth, wght) => bilinear('adv', i, wdth, wght),
    inkLeft: (i, wdth, wght) => bilinear('left', i, wdth, wght),
    inkRight: (i, wdth, wght) => bilinear('right', i, wdth, wght),
  };
}

/**
 * Ink extent of a line (em): from the first glyph's left ink to the last glyph's right ink, with
 * a `wdth` and `wght` per glyph and optional extra spacing (em) after each glyph but the last.
 */
export function extent(
  table: LineTable,
  widths: ArrayLike<number>,
  weights: ArrayLike<number> | number,
  extras?: ArrayLike<number>,
): number {
  const { first, last } = table;
  if (first < 0) return 0;
  const weight = (i: number) =>
    typeof weights === 'number' ? weights : (weights[i] ?? (weights[first] as number));
  let pen = 0;
  for (let i = first; i < last; i++) {
    pen += table.advance(i, widths[i] ?? 100, weight(i)) + (extras?.[i] ?? 0);
  }
  return (
    pen +
    table.inkRight(last, widths[last] ?? 100, weight(last)) -
    table.inkLeft(first, widths[first] ?? 100, weight(first))
  );
}

/** Uniform `wdth` (within `axis`) at which the line's extent is `target` em (monotonic). */
export function solveUniform(
  table: LineTable,
  target: number,
  wght: number,
  axis: Axis,
  scratch: Float64Array,
): number {
  let lo = axis.min;
  let hi = axis.max;
  const at = (w: number) => {
    scratch.fill(w, 0, table.n);
    return extent(table, scratch, wght);
  };
  if (at(lo) >= target) return lo;
  if (at(hi) <= target) return hi;
  for (let k = 0; k < 40 && hi - lo > 1e-4; k++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The offset `c` (in `wdth` units) that makes the line span exactly `target` em with widths
 * `widths[i] + c`, clamped to the axis — the redistribution that keeps a breathing line's edges
 * still. Writes the solved widths into `out`.
 */
export function redistribute(
  table: LineTable,
  widths: ArrayLike<number>,
  weights: ArrayLike<number>,
  extras: ArrayLike<number>,
  target: number,
  axis: Axis,
  out: Float64Array,
): void {
  const range = axis.max - axis.min;
  const at = (offset: number) => {
    for (let i = 0; i < table.n; i++) {
      out[i] = Math.min(axis.max, Math.max(axis.min, (widths[i] ?? 100) + offset));
    }
    return extent(table, out, weights, extras);
  };
  let lo = -range;
  let hi = range;
  for (let k = 0; k < 32 && hi - lo > 1e-3; k++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid;
    else hi = mid;
  }
  at((lo + hi) / 2);
}
