/**
 * A marquee laid out as an exact repeat unit (docs/templates/04-product-ads.md §4.5): the text
 * and its separators are shaped once, the unit's width is the sum of their advances and gaps, and
 * copies are always drawn at whole multiples of that width — so any offset (mod the unit) shows
 * the same pixels and a scrolling loop can never pop.
 *
 * Separator characters (● • ·) are drawn as vector dots rather than glyphs: most display faces
 * lack U+25CF, and a system-font fallback would differ between operating systems.
 */

import {
  type BuildContext,
  type ControlSchema,
  type Draw,
  type Fill,
  mod,
  type TextBlock,
  type TextStyle,
} from '@/engine';

type TextEngine = BuildContext<ControlSchema>['text'];

const SEPARATORS = /[●•·]/u;

type Piece = { kind: 'text'; block: TextBlock; x: number } | { kind: 'dot'; cx: number };

export type Marquee = {
  /** Width of one repeat unit (design units). */
  readonly unit: number;
  readonly capHeight: number;
  /**
   * Draws copies over [from, to] along x (the local axis), shifted by `offset` (any value; it
   * wraps by the unit), with the text's baseline at `baseline`.
   */
  draw(
    g: Draw,
    options: { offset: number; from: number; to: number; baseline: number; fill: Fill },
  ): void;
};

export function createMarquee(text: TextEngine, content: string, style: TextStyle): Marquee {
  const size = style.size;
  const capHeight = text.line('H', style).capHeight;
  const radius = capHeight * 0.16;
  const gap = size * 0.42;
  const parts = content.trim().split(SEPARATORS);
  const pieces: Piece[] = [];
  let x = 0;
  const addDot = () => {
    if (pieces.length > 0) x += gap;
    pieces.push({ kind: 'dot', cx: x + radius });
    x += 2 * radius;
  };
  parts.forEach((part, i) => {
    const words = part.trim();
    if (words) {
      if (pieces.length > 0) x += gap;
      const block = text.line(words, style);
      pieces.push({ kind: 'text', block, x });
      x += block.width;
    }
    // A separator stood between this part and the next.
    if (i < parts.length - 1) addDot();
  });
  if (pieces.length === 0) addDot();
  // The unit ends with the space before the next copy: a gap after a dot, a wider one after text
  // (no separator was typed, so the copies still read as separate words).
  const endsWithDot = pieces[pieces.length - 1]?.kind === 'dot';
  x += endsWithDot ? gap : parts.length > 1 ? gap : size * 0.9;
  const unit = Math.max(size * 0.5, x);

  return {
    unit,
    capHeight,
    draw(g, { offset, from, to, baseline, fill }) {
      const start = from - mod(from - offset, unit);
      const dotY = baseline - capHeight / 2;
      for (let origin = start; origin < to; origin += unit) {
        for (const piece of pieces) {
          if (piece.kind === 'text') {
            const left = origin + piece.x;
            if (left > to || left + piece.block.width < from) continue;
            g.text(piece.block, { fill, x: left, y: baseline - piece.block.capHeight });
          } else {
            const cx = origin + piece.cx;
            if (cx - radius > to || cx + radius < from) continue;
            g.circle(cx, dotY, radius, { fill });
          }
        }
      }
    },
  };
}
