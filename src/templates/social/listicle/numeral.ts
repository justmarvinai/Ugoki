/**
 * Listicle's numeral: one digit that turns like an odometer wheel — the old digit rolls up and
 * out as the new one rolls in from below — inside the engine odometer's window (its pitch and
 * cap height). It draws proportional lining figures: a lone numeral needs no tabular widths, and
 * Mona Sans's tabular set has a footed one and a slashed zero. Digits sit in the odometer's
 * tabular slot, so every digit's ink is known for alignment and optical cropping.
 */

import {
  type Color,
  createOdometer,
  type Draw,
  type Odometer,
  type Rect,
  type Stroke,
  type TextBlock,
  type TextStyle,
} from '@/engine';

type Text = Parameters<typeof createOdometer>[0];

export type NumeralPaint = { readonly fill: Color } | { readonly outline: Stroke };

export interface Numeral {
  readonly odometer: Odometer;
  readonly size: number;
  /** Ink box of a digit, relative to its slot's left edge (x) and the baseline (y). */
  ink(digit: number): Rect;
  /**
   * Draws the numeral turning from `from` to `to` (`p` 0..1). Either may be null: a digit
   * rolling in from nothing, or out to nothing.
   */
  draw(
    g: Draw,
    from: number | null,
    to: number | null,
    p: number,
    x: number,
    baseline: number,
    paint: NumeralPaint,
  ): void;
}

export function createNumeral(text: Text, style: TextStyle): Numeral {
  const odometer = createOdometer(text, style);
  const digits: TextBlock[] = Array.from({ length: 10 }, (_, d) => text.line(String(d), style));
  const { digitWidth, pitch, capHeight } = odometer;
  const above = style.size * 0.22;

  const put = (g: Draw, digit: number, x: number, baseline: number, paint: NumeralPaint) => {
    const block = digits[digit];
    if (!block) return;
    const at = {
      x: x + (digitWidth - block.width) / 2,
      y: baseline - (block.lines[0]?.baseline ?? capHeight),
    };
    if ('fill' in paint) g.text(block, { ...at, fill: paint.fill });
    else g.text(block, { ...at, outline: paint.outline });
  };

  return {
    odometer,
    size: style.size,
    ink(digit) {
      const block = digits[digit];
      if (!block) return { x: 0, y: -capHeight, w: digitWidth, h: capHeight };
      const baseline = block.lines[0]?.baseline ?? capHeight;
      return {
        x: (digitWidth - block.width) / 2 + block.ink.x,
        y: block.ink.y - baseline,
        w: block.ink.w,
        h: block.ink.h,
      };
    },
    draw(g, from, to, p, x, baseline, paint) {
      if (p >= 1 || (p > 0 && from === to)) {
        if (to !== null) put(g, to, x, baseline, paint);
        return;
      }
      if (p <= 0) {
        if (from !== null) put(g, from, x, baseline, paint);
        return;
      }
      // The window clips vertically only (proportional digits may be wider than the slot).
      const spare = style.size * 0.3;
      const window = {
        x: x - spare,
        y: baseline - capHeight - above,
        w: digitWidth + 2 * spare,
        h: pitch,
      };
      g.clip(window, (g) => {
        if (from !== null) put(g, from, x, baseline - p * pitch, paint);
        if (to !== null) put(g, to, x, baseline + (1 - p) * pitch, paint);
      });
    },
  };
}
