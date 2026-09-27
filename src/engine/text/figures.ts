/**
 * Figures — numbers as people write them (docs/06-engine.md §7): parse "€48.2k", "12M+", "98%",
 * "+12.4%", "3.2×" or "8,431", format them back at any value (count-ups keep their format),
 * money per locale, and an odometer that rolls tabular digits between values.
 */

import type { Draw, Fill } from '../draw/types';
import type { TextBlock, TextEngine, TextStyle } from './types';

/** A written number: everything around the digits is kept verbatim. */
export type Figure = {
  /** Text before the number, including any sign (`€`, `+`, `−`). */
  readonly prefix: string;
  /** The number's magnitude. */
  readonly value: number;
  readonly decimals: number;
  /** Thousands were grouped (`8,431`). */
  readonly grouping: boolean;
  /** Text after the number (`k`, `M+`, `%`, `×`, ` pt`). */
  readonly suffix: string;
};

const NUMBER = /^(.*?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(.*)$/s;

/** The first number in `text` with what surrounds it, or null when there is none. */
export function parseFigure(text: string): Figure | null {
  const match = NUMBER.exec(text.trim());
  if (!match) return null;
  const [, prefix = '', whole = '0', fraction = '', suffix = ''] = match;
  const grouping = whole.includes(',');
  const value = Number(`${whole.replaceAll(',', '')}.${fraction || '0'}`);
  return { prefix, value, decimals: fraction.length, grouping, suffix };
}

const formats = new Map<string, Intl.NumberFormat>();

/** A cached English number format (count-ups format a figure on every frame). */
function numberFormat(decimals: number, grouping: boolean): Intl.NumberFormat {
  const key = `${decimals}:${grouping}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouping,
    });
    formats.set(key, format);
  }
  return format;
}

/** The figure written with `value` in place of its number, in the figure's own format. */
export function formatFigure(figure: Figure, value = figure.value): string {
  const number = numberFormat(figure.decimals, figure.grouping).format(Math.max(0, value));
  return `${figure.prefix}${number}${figure.suffix}`;
}

/** Money in a locale (defaults: English, EUR — docs/templates/00-foundations.md §7). */
export function formatMoney(
  value: number,
  options: { currency?: string; locale?: string; decimals?: number } = {},
): string {
  const decimals = options.decimals ?? 2;
  return new Intl.NumberFormat(options.locale ?? 'en-US', {
    style: 'currency',
    currency: options.currency ?? 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// --- odometer -----------------------------------------------------------------------------

/**
 * One slot of an odometer: a digit wheel at a continuous position (3.4 shows 3 moving up
 * towards 4), or a character that doesn't roll (`€`, `.`, `,`, `%`).
 */
export type Wheel = { readonly digit: number } | { readonly char: string };

const isDigit = (char: string) => char >= '0' && char <= '9';

/**
 * Wheels of a mechanical counter showing `value` (continuous): the last wheel turns
 * continuously, each wheel to its left turns only while the ones to its right pass 9 → 0.
 * `digits` is the minimum number of whole-number wheels (leading zeros are shown).
 */
export function counterWheels(value: number, options: { digits?: number; decimals?: number } = {}) {
  const decimals = options.decimals ?? 0;
  const scaled = Math.max(0, value) * 10 ** decimals;
  const whole = Math.max(options.digits ?? 1, String(Math.floor(Math.max(0, value))).length);
  const count = whole + decimals;
  const wheels: Wheel[] = [];
  for (let k = count - 1; k >= 0; k--) {
    const place = 10 ** k;
    const below = scaled % place;
    const carry = Math.min(1, Math.max(0, below - (place - 1)));
    const position = k === 0 ? scaled % 10 : (Math.floor(scaled / place) % 10) + carry;
    wheels.push({ digit: position });
    if (k === decimals && decimals > 0) wheels.push({ char: '.' });
  }
  return wheels;
}

/**
 * Wheels turning each digit of `from` into the digit of `to` in the same slot (the strings are
 * aligned on the right; slots only one of them has show that string's character). `progress`
 * is 0..1 per slot (index from the left), so slots can be staggered. Digits turn `up`
 * (increasing, rolling upwards), `down`, or the `shortest` way round.
 */
export function rollWheels(
  from: string,
  to: string,
  progress: number | ((slot: number) => number),
  direction: 'up' | 'down' | 'shortest' = 'shortest',
): Wheel[] {
  const a = [...from];
  const b = [...to];
  const count = Math.max(a.length, b.length);
  const wheels: Wheel[] = [];
  for (let slot = 0; slot < count; slot++) {
    const x = a[slot - (count - a.length)];
    const y = b[slot - (count - b.length)];
    const p = typeof progress === 'number' ? progress : progress(slot);
    const clamped = Math.min(1, Math.max(0, p));
    if (x !== undefined && y !== undefined && isDigit(x) && isDigit(y)) {
      const start = Number(x);
      let end = Number(y);
      if (direction === 'up' && end < start) end += 10;
      if (direction === 'down' && end > start) end -= 10;
      if (direction === 'shortest' && Math.abs(end - start) > 5) end += end > start ? -10 : 10;
      wheels.push({ digit: start + (end - start) * clamped });
    } else {
      const char = (clamped < 0.5 ? (x ?? y) : (y ?? x)) ?? '';
      wheels.push({ char });
    }
  }
  return wheels;
}

/** Wheels for a string at rest (no rolling). */
export const staticWheels = (text: string): Wheel[] =>
  [...text].map((char) => (isDigit(char) ? { digit: Number(char) } : { char }));

export type OdometerDrawOptions = {
  x: number;
  /** Baseline. */
  y: number;
  fill: Fill;
  opacity?: number;
  align?: 'left' | 'center' | 'right';
};

export interface Odometer {
  readonly style: TextStyle;
  /** Width of every digit slot (the widest digit's advance). */
  readonly digitWidth: number;
  /** Distance between neighbouring digits on a wheel; the visible window is one pitch tall. */
  readonly pitch: number;
  readonly capHeight: number;
  /** Width of a row of wheels (or a string laid out as one). */
  width(wheels: readonly Wheel[] | string): number;
  /** Draws wheels on a baseline; digits roll inside a one-pitch window. */
  draw(g: Draw, wheels: readonly Wheel[] | string, options: OdometerDrawOptions): void;
}

/**
 * An odometer in a text style: every digit sits centered in a slot as wide as the widest digit,
 * so rolling never shifts the layout. The digits are the font's default figures unless
 * `figures: 'tabular'` asks for its tabular set — some fonts' tabular sets swap in a slashed zero
 * or a footed one (Mona Sans does), which reads as code rather than a price. Rolling digits are
 * clipped to a window from a little above cap height to a little below the baseline — the next
 * digit enters from below (counting up) or above.
 */
export function createOdometer(
  text: TextEngine,
  style: TextStyle,
  options: { figures?: 'default' | 'tabular' } = {},
): Odometer {
  const tabular: TextStyle =
    options.figures === 'tabular'
      ? { ...style, features: [...(style.features ?? []), 'tnum'] }
      : style;
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

  const slots = (wheels: readonly Wheel[] | string) =>
    typeof wheels === 'string' ? staticWheels(wheels) : wheels;
  const slotWidth = (wheel: Wheel) => ('digit' in wheel ? digitWidth : glyph(wheel.char).width);
  const width = (wheels: readonly Wheel[] | string) =>
    slots(wheels).reduce((sum, wheel) => sum + slotWidth(wheel), 0);

  const drawGlyph = (
    g: Draw,
    block: TextBlock,
    x: number,
    baseline: number,
    o: OdometerDrawOptions,
  ) =>
    g.text(block, {
      fill: o.fill,
      x: x + (digitWidth - block.width) / 2,
      y: baseline - (block.lines[0]?.baseline ?? capHeight),
      opacity: o.opacity,
    });

  return {
    style: tabular,
    digitWidth,
    pitch,
    capHeight,
    width,
    draw(g, input, options) {
      const wheels = slots(input);
      const total = width(wheels);
      let x =
        options.align === 'right'
          ? options.x - total
          : options.align === 'center'
            ? options.x - total / 2
            : options.x;
      const top = options.y - capHeight - above;
      for (const wheel of wheels) {
        if ('char' in wheel) {
          const block = glyph(wheel.char);
          g.text(block, {
            fill: options.fill,
            x,
            y: options.y - (block.lines[0]?.baseline ?? capHeight),
            opacity: options.opacity,
          });
          x += block.width;
          continue;
        }
        const position = wheel.digit;
        const base = Math.floor(position);
        const shift = position - base;
        const current = digits[((base % 10) + 10) % 10] as TextBlock;
        if (shift < 1e-4) {
          drawGlyph(g, current, x, options.y, options);
        } else {
          const next = digits[(((base + 1) % 10) + 10) % 10] as TextBlock;
          const cx = x;
          g.clip({ x: cx, y: top, w: digitWidth, h: pitch }, (g) => {
            drawGlyph(g, current, cx, options.y - shift * pitch, options);
            drawGlyph(g, next, cx, options.y + (1 - shift) * pitch, options);
          });
        }
        x += digitWidth;
      }
    },
  };
}
