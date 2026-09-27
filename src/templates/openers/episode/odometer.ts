/**
 * An odometer that can draw outline digits. The engine's `createOdometer` fills its digits;
 * Episode's number is outlined by default, so this local twin lays digits out the same way
 * (fixed-width slots, one-pitch rolling window) and draws them with a fill and/or a stroke.
 *
 * Engine candidate: an `outline` option on `Odometer.draw`.
 */

import {
  type createOdometer,
  type Draw,
  type Fill,
  type Stroke,
  staticWheels,
  type TextBlock,
  type TextStyle,
  type Wheel,
} from '@/engine';

type TextEngine = Parameters<typeof createOdometer>[0];

export type OdometerPaint = { fill?: Fill; outline?: Stroke; opacity?: number };

export type OutlineOdometer = {
  readonly digitWidth: number;
  readonly pitch: number;
  readonly capHeight: number;
  /** Top of the rolling window above the baseline. */
  readonly above: number;
  width(wheels: readonly Wheel[]): number;
  /** Draws wheels from `x` on `baseline`; rolling digits are clipped to a one-pitch window. */
  draw(g: Draw, wheels: readonly Wheel[], x: number, baseline: number, paint: OdometerPaint): void;
};

export function outlineOdometer(text: TextEngine, style: TextStyle): OutlineOdometer {
  // Display digits keep their own shapes (some faces' tabular zero is slashed); every digit
  // gets a slot as wide as the widest one, so rolling never shifts the layout.
  const tabular: TextStyle = style;
  const blocks = new Map<string, TextBlock>();
  const glyph = (char: string): TextBlock => {
    let block = blocks.get(char);
    if (!block) {
      block = text.line(char, tabular);
      blocks.set(char, block);
    }
    return block;
  };
  const digits = Array.from({ length: 10 }, (_, d) => glyph(String(d)));
  const digitWidth = Math.max(...digits.map((block) => block.width));
  const capHeight = digits[0]?.capHeight ?? style.size * 0.7;
  const above = style.size * 0.22;
  const below = style.size * 0.12;
  const pitch = capHeight + above + below;
  const slotWidth = (wheel: Wheel) => ('digit' in wheel ? digitWidth : glyph(wheel.char).width);

  const put = (g: Draw, block: TextBlock, x: number, baseline: number, paint: OdometerPaint) =>
    g.text(block, {
      fill: paint.fill,
      outline: paint.outline,
      opacity: paint.opacity,
      x,
      y: baseline - (block.lines[0]?.baseline ?? capHeight),
    });

  return {
    digitWidth,
    pitch,
    capHeight,
    above,
    width: (wheels) => wheels.reduce((sum, wheel) => sum + slotWidth(wheel), 0),
    draw(g, wheels, x0, baseline, paint) {
      let x = x0;
      const top = baseline - capHeight - above;
      for (const wheel of wheels) {
        if ('char' in wheel) {
          const block = glyph(wheel.char);
          put(g, block, x, baseline, paint);
          x += block.width;
          continue;
        }
        const base = Math.floor(wheel.digit);
        const shift = wheel.digit - base;
        const current = digits[((base % 10) + 10) % 10] as TextBlock;
        const center = x + (digitWidth - current.width) / 2;
        if (shift < 1e-4) {
          put(g, current, center, baseline, paint);
        } else {
          const next = digits[(((base + 1) % 10) + 10) % 10] as TextBlock;
          const nextX = x + (digitWidth - next.width) / 2;
          g.clip({ x, y: top, w: digitWidth, h: pitch }, (g) => {
            put(g, current, center, baseline - shift * pitch, paint);
            put(g, next, nextX, baseline + (1 - shift) * pitch, paint);
          });
        }
        x += digitWidth;
      }
    },
  };
}

/** Wheels rolling every digit of `target` up from 0, each at its own position (`at(slot)`). */
export function rollingWheels(target: string, at: (slot: number) => number): Wheel[] {
  return staticWheels(target).map((wheel, slot) =>
    'digit' in wheel ? { digit: wheel.digit * at(slot) } : wheel,
  );
}
