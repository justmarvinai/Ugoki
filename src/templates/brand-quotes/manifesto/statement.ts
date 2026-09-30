/**
 * Manifesto's statement layout: each statement is set flush left as large as its box allows
 * (up to the format's size), on one line or stacked when that makes it markedly bigger, with
 * the rectangles its emphasized words (`*word*`) sit on when they need a marker.
 */

import type { Rect, TextBlock, TextBlockOptions, TextStyle } from '@/engine';

type Layout = (text: string, options: TextBlockOptions) => TextBlock;

/** One emphasized run on a line: its marker block (block coordinates) and its extent. */
export type Mark = { line: number; rect: Rect };

export type Laid = {
  block: TextBlock;
  /** Block origin (its first line's cap top, the measure's left edge). */
  x: number;
  y: number;
  /** Ink bounds in frame coordinates; the scale pivot. */
  bounds: Rect;
  cx: number;
  cy: number;
  marks: Mark[];
};

export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Largest size, the most lines, the smallest size (all design units). */
  maxSize: number;
  maxLines: number;
  minSize: number;
  /** Where the ink's center sits, as a share of the box height. */
  place: number;
};

/** Stacking costs a little: one line wins unless more lines make the words markedly bigger. */
const STACK_COST = 0.14;
/** Least clear space between stacked lines' ink, in em. */
const LINE_GAP = 0.12;

function inkGap(block: TextBlock): number {
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < block.lines.length; i++) {
    const above = block.lines[i - 1];
    const below = block.lines[i];
    if (above && below) gap = Math.min(gap, below.ink.y - (above.ink.y + above.ink.h));
  }
  return gap;
}

export function fitStatement(
  layout: Layout,
  text: string,
  style: TextStyle,
  emphasisStyle: Partial<TextStyle>,
  lineHeight: number,
  box: Box,
): Laid {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const most = Math.max(1, Math.min(box.maxLines, words));
  const set = (size: number, lines: number, height: number) =>
    layout(text, {
      style: { ...style, size },
      maxWidth: box.w,
      maxLines: lines,
      lineHeight: height,
      align: 'left',
      emphasis: true,
      emphasisStyle,
      fit: { minSize: Math.min(box.minSize, size * 0.999) },
    });
  const at = (size: number, lines: number) => {
    const block = set(size, lines, lineHeight);
    // Accents and descenders open the line gap rather than collide.
    const gap = inkGap(block);
    const want = LINE_GAP * block.size;
    return gap >= want ? block : set(block.size, lines, lineHeight + (want - gap) / block.size);
  };
  let best: TextBlock | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let lines = 1; lines <= most; lines++) {
    let block = at(box.maxSize, lines);
    if (block.ink.h > box.h) {
      block = at(Math.max(box.minSize, (block.size * box.h) / block.ink.h), lines);
    }
    const score =
      block.size / (1 + STACK_COST * (block.lines.length - 1)) - (block.overflow ? 1e6 : 0);
    if (score > bestScore) {
      best = block;
      bestScore = score;
    }
    if (block.lines.length < lines) break;
  }
  const block = best ?? at(box.minSize, box.maxLines);
  const x = box.x;
  const y = box.y + box.h * box.place - (block.ink.y + block.ink.h / 2);
  const bounds: Rect = {
    x: x + block.ink.x,
    y: y + block.ink.y,
    w: block.ink.w,
    h: block.ink.h,
  };
  return {
    block,
    x,
    y,
    bounds,
    cx: bounds.x + bounds.w / 2,
    cy: bounds.y + bounds.h / 2,
    marks: markRuns(block),
  };
}

/** Marker rectangles behind each line's emphasized runs (block coordinates). */
function markRuns(block: TextBlock): Mark[] {
  const marks: Mark[] = [];
  const size = block.size;
  const padX = 0.1 * size;
  for (const line of block.lines) {
    let x0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    const flush = () => {
      if (x0 < x1) {
        const top = line.baseline - block.capHeight - 0.14 * size;
        const bottom = line.baseline + 0.2 * size;
        marks.push({
          line: line.index,
          rect: { x: x0 - padX, y: top, w: x1 - x0 + 2 * padX, h: bottom - top },
        });
      }
      x0 = Number.POSITIVE_INFINITY;
      x1 = Number.NEGATIVE_INFINITY;
    };
    for (const glyph of line.glyphs) {
      if (!glyph.emphasis) {
        flush();
        continue;
      }
      if (!glyph.ink) continue;
      const left = line.x + glyph.x + glyph.ink.x;
      x0 = Math.min(x0, left);
      x1 = Math.max(x1, left + glyph.ink.w);
    }
    flush();
  }
  return marks;
}
