/**
 * The name's decode (adapted from Decode's slots): every character owns a slot as wide as its
 * final glyph; while it scrambles, seeded glyphs of a similar width are scaled to fit the slot
 * exactly, so nothing shifts as characters lock. Steps run on a stepped 24 fps clock.
 */

import type {
  BuildContext,
  ControlSchema,
  Draw,
  Fill,
  GlyphTransform,
  Rng,
  TextBlock,
  TextLine,
  TextStyle,
} from '@/engine';

type TextEngine = BuildContext<ControlSchema>['text'];

const CHARS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/'];
/** Precomputed steps per slot: the longest duration (20 s) at 24 steps a second. */
export const SCRAMBLE_STEPS = 20 * 24 + 2;

type Slot = {
  /** Origin and baseline in block coordinates. */
  x: number;
  baseline: number;
  /** Visual advance (without tracking). */
  width: number;
  ink: boolean;
};

export type Scramble = {
  readonly count: number;
  inked(i: number): boolean;
  /** Draws slot `i`'s scrambled glyph for a step of the 24 fps clock. */
  draw(g: Draw, i: number, tick: number, fill: Fill, x: number, y: number): void;
};

export function createScramble(
  text: TextEngine,
  block: TextBlock,
  style: TextStyle,
  rng: Rng,
): Scramble {
  const setStyle: TextStyle = { ...style, size: block.size, tracking: 0, case: 'none' };
  const lines = CHARS.map((char) => text.line(char, setStyle).lines[0] as TextLine);
  const advances = lines.map((line) => line.glyphs[0]?.advance ?? block.size * 0.6);
  const tracking = (style.tracking ?? 0) * block.size;

  const slots: Slot[] = [];
  const candidates: number[][] = [];
  for (const line of block.lines) {
    for (const glyph of line.glyphs) {
      const width = Math.max(glyph.advance - tracking, 0.2 * block.size);
      slots.push({ x: line.x + glyph.x, baseline: line.baseline, width, ink: glyph.ink !== null });
      // Glyphs of a similar width scramble in this slot (then scale to fit it exactly).
      const ranked = CHARS.map((_, i) => ({
        i,
        d: Math.abs(Math.log(width / (advances[i] ?? width))),
      })).sort((a, b) => a.d - b.d);
      const close = ranked.filter((entry) => entry.d < Math.log(1.3));
      candidates.push((close.length >= 4 ? close : ranked.slice(0, 6)).map((entry) => entry.i));
    }
  }
  // Seeded picks per slot and step, never the same glyph twice in a row.
  const table = candidates.map((pool) => {
    const steps = new Uint8Array(SCRAMBLE_STEPS);
    let previous = -1;
    for (let s = 0; s < SCRAMBLE_STEPS; s++) {
      let k = Math.floor(rng.next() * pool.length);
      if (pool[k] === previous && pool.length > 1) k = (k + 1) % pool.length;
      steps[s] = pool[k] ?? 0;
      previous = steps[s] ?? 0;
    }
    return steps;
  });

  const scaled: GlyphTransform = { scaleX: 1, originX: 0 };
  const scaledGlyph = () => scaled;
  return {
    count: slots.length,
    inked: (i) => slots[i]?.ink ?? false,
    draw(g, i, tick, fill, x, y) {
      const slot = slots[i];
      if (!slot?.ink) return;
      const pick = table[i]?.[tick % SCRAMBLE_STEPS] ?? 0;
      const line = lines[pick];
      const glyph = line?.glyphs[0];
      if (!line || !glyph) return;
      const advance = advances[pick] ?? slot.width;
      scaled.scaleX = Math.min(1.6, Math.max(0.55, slot.width / advance));
      g.text(line, {
        fill,
        x: x + slot.x + slot.width / 2 - (advance * scaled.scaleX) / 2 - line.x - glyph.x,
        y: y + slot.baseline - line.baseline,
        glyph: scaledGlyph,
      });
    },
  };
}
