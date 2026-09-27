/**
 * Punch's beat layout: each beat is set as large as its box allows — on one line, or stacked
 * into a few when that makes it markedly bigger — centered on the frame's axis, with the
 * rectangles its emphasized words (`*word*`) highlight.
 */

import {
  type Rect,
  type TextBlock,
  type TextBlockOptions,
  type TextLine,
  type TextStyle,
  unionRect,
} from '@/engine';
import { plain } from './plan';

type Layout = (text: string, options: TextBlockOptions) => TextBlock;

/** One emphasized run of glyphs on a line: its highlight block and its underline bar. */
export type Mark = {
  readonly line: TextLine;
  /** Padded block behind the run (frame coordinates). */
  readonly block: Rect;
  /** Underline bar below the run (frame coordinates). */
  readonly bar: Rect;
};

export type Beat = {
  readonly block: TextBlock;
  /** Where the block's origin (its first line's cap top, left edge of the measure) sits. */
  readonly x: number;
  readonly y: number;
  /** Ink bounds in frame coordinates (the editor region). */
  readonly bounds: Rect;
  /** Pivot for the entrance scale and tilt: the ink's center. */
  readonly cx: number;
  readonly cy: number;
  readonly marks: readonly Mark[];
  /** Everything the beat may paint: its ink and its highlight marks (frame coordinates). */
  readonly reach: Rect;
};

export type BeatBox = {
  style: TextStyle;
  lineHeight: number;
  /** Horizontal center, measure and the tallest the ink may get. */
  cx: number;
  width: number;
  height: number;
  /** Where the ink's center sits vertically. */
  cy: number;
  /** Most lines one beat may stack into. */
  lines: number;
  minSize: number;
  maxSize: number;
};

/** Stacking costs a little: one line wins unless more lines make the words markedly bigger. */
const STACK_COST = 0.12;
/** Least clear space between stacked lines' ink, in em. */
const LINE_GAP = 0.1;

/** The narrowest vertical gap between the ink of consecutive lines (infinite for one line). */
function inkGap(block: TextBlock): number {
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < block.lines.length; i++) {
    const above = block.lines[i - 1];
    const below = block.lines[i];
    if (above && below) gap = Math.min(gap, below.ink.y - (above.ink.y + above.ink.h));
  }
  return gap;
}

/** Sets one beat as large as the box allows. */
export function fitBeat(layout: Layout, beat: string, box: BeatBox): Beat {
  const words = plain(beat).split(/\s+/).filter(Boolean).length;
  const most = Math.max(1, Math.min(box.lines, words));
  const set = (size: number, lines: number, lineHeight: number) =>
    layout(beat, {
      style: { ...box.style, size },
      maxWidth: box.width,
      maxLines: lines,
      lineHeight,
      align: 'center',
      emphasis: true,
      fit: { minSize: Math.min(box.minSize, size * 0.999) },
    });
  const at = (size: number, lines: number) => {
    const block = set(size, lines, box.lineHeight);
    // Stacked lines keep their ink apart: accents (É, Ñ) and descenders open the line gap.
    const gap = inkGap(block);
    const want = LINE_GAP * block.size;
    return gap >= want ? block : set(block.size, lines, box.lineHeight + (want - gap) / block.size);
  };

  let best: TextBlock | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let lines = 1; lines <= most; lines++) {
    let block = at(box.maxSize, lines);
    if (block.ink.h > box.height) {
      block = at(Math.max(box.minSize, (block.size * box.height) / block.ink.h), lines);
    }
    const score =
      block.size / (1 + STACK_COST * (block.lines.length - 1)) - (block.overflow ? 1e6 : 0);
    if (score > bestScore) {
      best = block;
      bestScore = score;
    }
    // Fewer lines than allowed: more lines can't make it any bigger.
    if (block.lines.length < lines) break;
  }
  const block = best ?? at(box.minSize, box.lines);

  const x = box.cx - box.width / 2;
  const y = box.cy - (block.ink.y + block.ink.h / 2);
  const bounds: Rect = {
    x: x + block.ink.x,
    y: y + block.ink.y,
    w: block.ink.w,
    h: block.ink.h,
  };
  const marks = emphasisMarks(block, x, y);
  let reach = bounds;
  for (const mark of marks) reach = unionRect(unionRect(reach, mark.block), mark.bar);
  return {
    block,
    x,
    y,
    bounds,
    cx: bounds.x + bounds.w / 2,
    cy: bounds.y + bounds.h / 2,
    marks,
    reach,
  };
}

/**
 * Highlight rectangles for the block's emphasized runs: from cap height (or the ink, when it
 * rises higher) to the baseline (or the descenders), padded like a marker stroke.
 */
function emphasisMarks(block: TextBlock, ox: number, oy: number): Mark[] {
  const marks: Mark[] = [];
  const size = block.size;
  const padX = 0.13 * size;
  const padY = 0.09 * size;
  for (const line of block.lines) {
    let x0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let top = line.baseline - block.capHeight;
    let bottom = line.baseline;
    const flush = () => {
      if (x0 < x1) {
        marks.push({
          line,
          block: {
            x: ox + x0 - padX,
            y: oy + top - padY,
            w: x1 - x0 + padX * 2,
            h: bottom - top + padY * 2,
          },
          bar: {
            x: ox + x0 - 0.02 * size,
            y: oy + line.baseline + 0.07 * size,
            w: x1 - x0 + 0.04 * size,
            h: 0.1 * size,
          },
        });
      }
      x0 = Number.POSITIVE_INFINITY;
      x1 = Number.NEGATIVE_INFINITY;
      top = line.baseline - block.capHeight;
      bottom = line.baseline;
    };
    for (const glyph of line.glyphs) {
      if (!glyph.emphasis) {
        flush();
        continue;
      }
      // Spaces inside an emphasized span keep the run going.
      if (!glyph.ink) continue;
      const left = line.x + glyph.x + glyph.ink.x;
      x0 = Math.min(x0, left);
      x1 = Math.max(x1, left + glyph.ink.w);
      top = Math.min(top, line.baseline + glyph.y + glyph.ink.y);
      bottom = Math.max(bottom, line.baseline + glyph.y + glyph.ink.y + glyph.ink.h);
    }
    flush();
  }
  return marks;
}
