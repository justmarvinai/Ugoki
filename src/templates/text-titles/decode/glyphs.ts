/** Scramble glyph sets for Decode. */

export type GlyphSetId = 'letters' | 'numbers' | 'symbols' | 'binary' | 'blocks';

/**
 * Block elements, drawn as shapes (the engine's fonts are subset to Latin, without U+2580–259F):
 * rectangles in a unit cell (x, y, w, h — y down) with their opacity.
 */
export const BLOCKS: readonly (readonly (readonly [number, number, number, number, number])[])[] = [
  [[0, 0, 1, 1, 1]], // █
  [[0, 0, 1, 0.5, 1]], // ▀
  [[0, 0.5, 1, 0.5, 1]], // ▄
  [[0, 0, 0.5, 1, 1]], // ▌
  [[0.5, 0, 0.5, 1, 1]], // ▐
  [[0, 0, 1, 1, 0.3]], // ░
  [[0, 0, 1, 1, 0.55]], // ▒
  [[0, 0, 1, 1, 0.8]], // ▓
  [
    [0, 0, 0.5, 0.5, 1],
    [0.5, 0.5, 0.5, 0.5, 1],
  ], // ▚
  [
    [0.5, 0, 0.5, 0.5, 1],
    [0, 0.5, 0.5, 0.5, 1],
  ], // ▞
  [[0, 0.5, 0.5, 0.5, 1]], // ▖
  [[0.5, 0, 0.5, 0.5, 1]], // ▝
];

export const GLYPH_SETS: Readonly<
  Record<GlyphSetId, { readonly chars: readonly string[]; readonly blocks: boolean }>
> = {
  letters: { chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], blocks: false },
  numbers: { chars: [...'0123456789'], blocks: false },
  symbols: { chars: [...'#$%&*+=?@<>/\\{}[]~^!'], blocks: false },
  binary: { chars: ['0', '1'], blocks: false },
  blocks: { chars: BLOCKS.map((_, i) => String(i)), blocks: true },
};

/** Precomputed scramble steps per slot: the longest duration (10 s) at 24 steps a second. */
export const SCRAMBLE_STEPS = 10 * 24 + 2;
