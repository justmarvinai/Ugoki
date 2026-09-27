/**
 * Punch's color schemes, from palette roles only: the palette as it is (bg + fg), its inverse
 * (the "↔" of the Looks — Acid ↔ Ink cuts between the palette's background and its ink), and
 * captions for footage (the lighter color on the darker one).
 */

import {
  bestContrast,
  type Color,
  contrastRatio,
  ensureContrast,
  type Palette,
  rgb,
} from '@/engine';

export type Scheme = {
  readonly bg: Color;
  readonly text: Color;
  /** Highlight block behind emphasized words, and the words on it. */
  readonly block: Color;
  readonly onBlock: Color;
  /** Underline and colored-word highlight: a color apart from both text and background. */
  readonly mark: Color;
};

const distinct = (a: Color, b: Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.15;

export function scheme(bg: Color, text: Color, roles: Palette['roles']): Scheme {
  // The accent when it stands out from this background, else the text color itself.
  const block = contrastRatio(roles.accent, bg) >= 3 ? roles.accent : text;
  const onBlock = bestContrast(block, [bg, text]);
  const hue =
    [roles.accent, roles.accent2, roles.accent3].find(
      (color) => distinct(color, text) && distinct(color, bg),
    ) ?? roles.accent;
  // Colored words are still words: they keep text contrast (4.5:1), and underlines match them.
  return { bg, text, block, onBlock, mark: ensureContrast(hue, bg, 4.5) };
}

const WHITE = rgb(1, 1, 1);

/** The darker and the lighter of the palette's background and foreground. */
export function tones(roles: Palette['roles']): { dark: Color; light: Color } {
  const dark = bestContrast(WHITE, [roles.bg, roles.fg]);
  return { dark, light: dark === roles.bg ? roles.fg : roles.bg };
}
