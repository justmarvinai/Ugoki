/** Text engine types (docs/06-engine.md §7). All sizes are design units (1080p px). */

import type { Rect } from '../core/math';
import type { FontId } from '../template/pairings';

export type TextCase = 'none' | 'upper' | 'lower';
export type TextAlign = 'left' | 'center' | 'right';

export type TextStyle = {
  font: FontId;
  /** Font id used when `italic` is set (falls back to `font`). */
  italicFont?: FontId;
  size: number;
  weight?: number;
  width?: number;
  /** Optical size: 'auto' derives it from `size`; a number pins the axis. */
  opsz?: number | 'auto';
  italic?: boolean;
  /** Tracking in em. */
  tracking?: number;
  features?: readonly string[];
  case?: TextCase;
  /** BCP 47 language for case mapping and shaping (default 'en'). */
  lang?: string;
};

export type TextBlockOptions = {
  style: TextStyle;
  /** Available line width. */
  maxWidth: number;
  maxLines?: number;
  /** Line advance as a multiple of the font size. */
  lineHeight: number;
  align?: TextAlign;
  /** Balanced line breaking (default true). */
  balance?: boolean;
  /** Shrink the size down to `minSize` until the text fits `maxWidth` and `maxLines`. */
  fit?: { minSize: number };
  /** Parse `*emphasis*` markup. */
  emphasis?: boolean;
  /** Style overrides for emphasized spans. */
  emphasisStyle?: Partial<TextStyle>;
};

/** Glyph outline commands in font units (y up): M x y, L x y, Q cx cy x y, C c1x c1y c2x c2y x y, Z. */
export type GlyphOutline = {
  readonly commands: Float32Array;
  readonly verbs: Uint8Array;
};

export const VERB_MOVE = 0;
export const VERB_LINE = 1;
export const VERB_QUAD = 2;
export const VERB_CUBIC = 3;
export const VERB_CLOSE = 4;

/** A shaped font at one variation instance. */
export interface FontFace {
  readonly key: string;
  readonly id: FontId;
  readonly upem: number;
  readonly ascender: number;
  readonly descender: number;
  readonly capHeight: number;
  readonly xHeight: number;
  outline(glyph: number): GlyphOutline;
}

export type Glyph = {
  /** Glyph id (0 = missing → drawn with the fallback font). */
  readonly id: number;
  readonly face: FontFace;
  /** Pen position relative to the line origin (design units). */
  readonly x: number;
  /** Vertical offset from the baseline (design units, y down). */
  readonly y: number;
  readonly advance: number;
  /** Font size of this glyph's run. */
  readonly size: number;
  /** Source text of the glyph's cluster (a grapheme for normal text). */
  readonly text: string;
  /** Index of the glyph in its block (reading order). */
  readonly index: number;
  readonly word: number;
  readonly line: number;
  readonly emphasis: boolean;
  /** Ink bounds relative to the glyph origin (design units, y down); null for spaces. */
  readonly ink: Rect | null;
  /** Native-font fallback for glyphs the font lacks (emoji, CJK in a Latin font). */
  readonly fallback: { readonly font: string } | null;
};

export type TextWord = {
  readonly index: number;
  readonly text: string;
  /** Glyph index range [start, end) within the line. */
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly width: number;
};

export type TextLine = {
  readonly index: number;
  readonly text: string;
  readonly glyphs: readonly Glyph[];
  readonly words: readonly TextWord[];
  /** Line origin (after alignment) relative to the block's top-left. */
  readonly x: number;
  readonly baseline: number;
  /** Advance width including tracking (without trailing tracking). */
  readonly width: number;
  /** Union of glyph ink (block coordinates), or the line box for blank lines. */
  readonly ink: Rect;
  /** Line-reveal mask: ink bounds padded by 8% of the size vertically, generous horizontally. */
  readonly mask: Rect;
};

export type TextBlock = {
  readonly lines: readonly TextLine[];
  readonly glyphCount: number;
  readonly wordCount: number;
  /** Final font size after fitting. */
  readonly size: number;
  readonly lineHeight: number;
  /** Widest line. */
  readonly width: number;
  /** From the first line's top (baseline − ascender) to the last line's descender. */
  readonly height: number;
  /** Union of all glyph ink (block coordinates). */
  readonly ink: Rect;
  /** Text did not fit even at `fit.minSize`. */
  readonly overflow: boolean;
  readonly style: TextStyle;
  readonly capHeight: number;
};

export interface TextEngine {
  /** Lays out a block of text. Fonts must have been loaded (see `loadFonts`). */
  layout(text: string, options: TextBlockOptions): TextBlock;
  /** Shapes a single line without wrapping. */
  line(text: string, style: TextStyle): TextBlock;
  /** Face for a font id at a variation (used for per-frame axis animation). */
  face(style: TextStyle): FontFace;
  hasFont(font: FontId): boolean;
}
