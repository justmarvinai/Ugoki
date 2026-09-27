/**
 * The countdown's number drum: a reel printed in descending order, so the current number rolls
 * up and out as the next one (one less) rolls in from below — an odometer's wheels would roll
 * the other way when counting down. It turns inside the odometer's window (its pitch and cap
 * height), but draws proportional lining figures: a lone numeral needs no tabular widths, and
 * Mona Sans's tabular set has a slashed zero and a footed one.
 */

import type { Draw, Fill, Odometer, TextBlock, TextStyle } from '@/engine';

type Line = (text: string, style: TextStyle) => TextBlock;

export interface Drum {
  /** Draws `from` turning into `to` (`p` 0..1); either may be empty (rolling in or out). */
  draw(g: Draw, from: string, to: string, p: number, fill: Fill): void;
  /** Ink bounds of a number at rest, in frame coordinates. */
  bounds(value: string): { x: number; y: number; w: number; h: number };
}

/** A drum centered on `cx` (by ink), on `baseline`, in the odometer's style without `tnum`. */
export function createDrum(
  line: Line,
  odometer: Odometer,
  style: TextStyle,
  cx: number,
  baseline: number,
): Drum {
  const numbers = new Map<string, TextBlock>();
  const block = (value: string) => {
    let found = numbers.get(value);
    if (!found) {
      found = line(value, style);
      numbers.set(value, found);
    }
    return found;
  };
  const { pitch, capHeight } = odometer;
  const above = style.size * 0.22;
  // Wide enough for any number the drum shows; tall as the odometer's window.
  const window = (value: string) => {
    const b = block(value);
    return { x: cx - b.width, y: baseline - capHeight - above, w: b.width * 2, h: pitch };
  };
  const put = (g: Draw, value: string, y: number, fill: Fill) => {
    if (!value) return;
    const b = block(value);
    const top = b.lines[0]?.baseline ?? capHeight;
    g.text(b, { fill, x: cx - (b.ink.x + b.ink.w / 2), y: y - top });
  };

  return {
    draw(g, from, to, p, fill) {
      const q = Math.min(1, Math.max(0, p));
      if (q <= 0 || from === to) {
        put(g, from, baseline, fill);
        return;
      }
      if (q >= 1) {
        put(g, to, baseline, fill);
        return;
      }
      const a = window(from || to);
      const b = window(to || from);
      const clip = a.w >= b.w ? a : b;
      g.clip(clip, (g) => {
        put(g, from, baseline - q * pitch, fill);
        put(g, to, baseline + (1 - q) * pitch, fill);
      });
    },
    bounds(value) {
      const b = block(value);
      const top = b.lines[0]?.baseline ?? capHeight;
      const x = cx - (b.ink.x + b.ink.w / 2);
      return { x: x + b.ink.x, y: baseline - top + b.ink.y, w: b.ink.w, h: b.ink.h };
    },
  };
}
