/**
 * Prices for Deal: what people type ("39", "39.00", "1,299", "1.299,99", "€27"), formatted with
 * `formatMoney` in the chosen currency and locale, and rolled from the old price to the new one
 * on the engine's odometer (`createOdometer` + `rollWheels`).
 *
 * The roll keeps the currency symbol and separators still and only turns digits. When the two
 * prices have different lengths (€129.00 → €89.00), the leading slot the new price doesn't need
 * rolls to 0, fades and collapses, so the price closes up smoothly instead of jumping.
 */

import { type Draw, type Fill, formatMoney, type Odometer, rollWheels, type Wheel } from '@/engine';

export const CURRENCIES = {
  eur: { currency: 'EUR', locale: 'en-US', decimals: 2, label: '€ Euro' },
  'eur-de': { currency: 'EUR', locale: 'de-DE', decimals: 2, label: '€ Euro (27,00 €)' },
  usd: { currency: 'USD', locale: 'en-US', decimals: 2, label: '$ US dollar' },
  gbp: { currency: 'GBP', locale: 'en-GB', decimals: 2, label: '£ Pound' },
  chf: { currency: 'CHF', locale: 'de-CH', decimals: 2, label: 'CHF Swiss franc' },
  jpy: { currency: 'JPY', locale: 'en-US', decimals: 0, label: '¥ Yen' },
} as const;

export type CurrencyId = keyof typeof CURRENCIES;

export type TypedPrice = {
  value: number;
  /** The person wrote cents ("39.00", "39,90"). */
  cents: boolean;
};

/**
 * Reads a typed price. The last `.` or `,` is the decimal separator when both appear; a single
 * separator followed by one or two digits is decimal, otherwise it groups thousands. Null when
 * there are no digits (the price is then shown as typed).
 */
export function parsePrice(text: string): TypedPrice | null {
  const cleaned = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const dot = cleaned.lastIndexOf('.');
  const comma = cleaned.lastIndexOf(',');
  let decimal = -1;
  if (dot >= 0 && comma >= 0) {
    decimal = Math.max(dot, comma);
  } else if (dot >= 0 || comma >= 0) {
    const at = Math.max(dot, comma);
    const separator = cleaned[at];
    const count = cleaned.split(separator ?? '').length - 1;
    const after = cleaned.length - at - 1;
    if (count === 1 && after >= 1 && after <= 2) decimal = at;
  }
  const whole = (decimal >= 0 ? cleaned.slice(0, decimal) : cleaned).replace(/[.,]/g, '');
  const fraction = decimal >= 0 ? cleaned.slice(decimal + 1).replace(/[.,]/g, '') : '';
  const value = Number(`${whole || '0'}.${(fraction || '0').slice(0, 2)}`);
  if (!Number.isFinite(value) || value > 1e9) return null;
  return { value, cents: fraction.length > 0 };
}

/** No-break spaces become plain spaces: several fonts lack U+202F, and nothing wraps here. */
const NO_BREAK_SPACES = [0x00a0, 0x202f, 0x2009].map((code) => String.fromCharCode(code));
const plainSpaces = (text: string) =>
  NO_BREAK_SPACES.reduce((out, space) => out.replaceAll(space, ' '), text);

export function money(value: number, currency: CurrencyId, cents: boolean): string {
  const spec = CURRENCIES[currency];
  return plainSpaces(
    formatMoney(value, {
      currency: spec.currency,
      locale: spec.locale,
      decimals: cents ? spec.decimals : 0,
    }),
  );
}

/** Automatic badge: the saving in whole percent, or null when there is none. */
export function savingPercent(from: number, to: number): number | null {
  if (!(from > 0) || !(to >= 0) || to >= from) return null;
  const percent = Math.round((1 - to / from) * 100);
  return percent >= 1 ? Math.min(percent, 99) : null;
}

const isDigit = (char: string) => char >= '0' && char <= '9';

/** Splits "€1,299.00" into the part before the first digit, the number and what follows. */
function split(text: string): { head: string; core: string; tail: string } {
  const chars = [...text];
  const first = chars.findIndex(isDigit);
  if (first < 0) return { head: text, core: '', tail: '' };
  let last = chars.length - 1;
  while (last > first && !isDigit(chars[last] ?? '')) last--;
  return {
    head: chars.slice(0, first).join(''),
    core: chars.slice(first, last + 1).join(''),
    tail: chars.slice(last + 1).join(''),
  };
}

type Slot = {
  /** Visible at the start / end of the roll (0 or 1). */
  readonly from: number;
  readonly to: number;
  readonly digit: boolean;
};

/**
 * A price that rolls from `from` to `to` on an odometer. Both strings come from `money` with the
 * same currency, so they share their head and tail ("€", " €", "CHF ").
 */
export type PriceRoll = {
  readonly odometer: Odometer;
  readonly head: string;
  readonly tail: string;
  /** Right-aligned numbers, padded to the same length. */
  readonly fromCore: string;
  readonly toCore: string;
  readonly slots: readonly Slot[];
  /** Number of digit slots (for staggering). */
  readonly digits: number;
  /** Index among digit slots, per slot (−1 for separators). */
  readonly order: readonly number[];
  readonly direction: 'up' | 'down';
  /** Width at the start and at the end of the roll. */
  readonly startWidth: number;
  readonly endWidth: number;
};

export function priceRoll(odometer: Odometer, from: string, to: string): PriceRoll {
  const a = split(from);
  const b = split(to);
  const x = [...a.core];
  const y = [...b.core];
  const count = Math.max(x.length, y.length);
  let fromCore = '';
  let toCore = '';
  const slots: Slot[] = [];
  const order: number[] = [];
  let digits = 0;
  for (let i = 0; i < count; i++) {
    const p = x[i - (count - x.length)];
    const q = y[i - (count - y.length)];
    const sample = p ?? q ?? '';
    const digit = isDigit(sample);
    // A slot only one price has: digits roll from/to 0, separators stay put, and it fades.
    const pad = digit ? '0' : sample;
    fromCore += p ?? pad;
    toCore += q ?? pad;
    slots.push({ from: p === undefined ? 0 : 1, to: q === undefined ? 0 : 1, digit });
    order.push(digit ? digits++ : -1);
  }
  const value = (text: string) => Number(text.replace(/\D/g, '') || '0');
  return {
    odometer,
    head: b.head || a.head,
    tail: b.tail || a.tail,
    fromCore,
    toCore,
    slots,
    digits,
    order,
    direction: value(toCore) > value(fromCore) ? 'up' : 'down',
    startWidth: odometer.width(from),
    endWidth: odometer.width(to),
  };
}

/** Per-slot visibility → widths, reused between frames. */
export type RollFrame = {
  /** Roll progress per slot (0..1), including separators. */
  progress: Float64Array;
  /** Extra full turns of every digit wheel (slot-machine spin). */
  turns: number;
};

export function createRollFrame(roll: PriceRoll): RollFrame {
  return { progress: new Float64Array(roll.slots.length), turns: 0 };
}

const smooth = (p: number) => p * p * (3 - 2 * p);

/** Width of the price at this frame (slots that appear or disappear grow and shrink). */
export function rollWidth(roll: PriceRoll, frame: RollFrame, wheels: readonly Wheel[]): number {
  const { odometer } = roll;
  let width = odometer.width(roll.head) + odometer.width(roll.tail);
  roll.slots.forEach((slot, i) => {
    const wheel = wheels[i];
    if (!wheel) return;
    const shown = slot.from + (slot.to - slot.from) * smooth(frame.progress[i] ?? 0);
    width += (slot.digit ? odometer.digitWidth : odometer.width([wheel])) * shown;
  });
  return width;
}

/** The wheels of this frame: `rollWheels` per slot, plus the extra spin. */
export function rollFrameWheels(roll: PriceRoll, frame: RollFrame): Wheel[] {
  const wheels = rollWheels(
    roll.fromCore,
    roll.toCore,
    (slot) => frame.progress[slot] ?? 0,
    roll.direction,
  );
  if (frame.turns === 0) return wheels;
  const sign = roll.direction === 'down' ? -1 : 1;
  return wheels.map((wheel, i) =>
    'digit' in wheel
      ? { digit: wheel.digit + sign * 10 * frame.turns * (frame.progress[i] ?? 0) }
      : wheel,
  );
}

/**
 * Draws the rolling price with its baseline at `y`: `x` is its left edge, center or right edge
 * by `align`.
 */
export function drawRoll(
  g: Draw,
  roll: PriceRoll,
  frame: RollFrame,
  options: {
    x: number;
    y: number;
    fill: Fill;
    align: 'left' | 'center' | 'right';
    opacity?: number;
  },
): void {
  const { odometer } = roll;
  const wheels = rollFrameWheels(roll, frame);
  const total = rollWidth(roll, frame, wheels);
  let x =
    options.align === 'right'
      ? options.x - total
      : options.align === 'center'
        ? options.x - total / 2
        : options.x;
  const base = { y: options.y, fill: options.fill, opacity: options.opacity };
  if (roll.head) {
    odometer.draw(g, roll.head, { ...base, x });
    x += odometer.width(roll.head);
  }
  roll.slots.forEach((slot, i) => {
    const wheel = wheels[i];
    if (!wheel) return;
    const shown = slot.from + (slot.to - slot.from) * smooth(frame.progress[i] ?? 0);
    const width = (slot.digit ? odometer.digitWidth : odometer.width([wheel])) * shown;
    if (shown > 0.002) {
      // A collapsing slot keeps its glyph centered in the space it still has.
      const full = slot.digit ? odometer.digitWidth : odometer.width([wheel]);
      odometer.draw(g, [wheel], {
        ...base,
        x: x - (full - width) / 2,
        opacity: (options.opacity ?? 1) * shown,
      });
    }
    x += width;
  });
  if (roll.tail) odometer.draw(g, roll.tail, { ...base, x });
}
