/**
 * Manifesto's two sides — the "↔" of its Looks — from palette roles only: the palette as it is,
 * and a partner (its inverse, its accent or its second accent as the ground). Emphasis takes a
 * color that reads on each side; where none does (yellow on paper), it becomes a marker block
 * behind the words instead.
 */

import {
  bestContrast,
  type Color,
  contrastRatio,
  ensureContrast,
  mixOklab,
  type Palette,
} from '@/engine';

export type PairId = 'inverse' | 'accent' | 'second';

export type Side = {
  bg: Color;
  text: Color;
  muted: Color;
  /** Emphasis: words in `mark` (`color`), or on a `block` in `onBlock` (`marker`). */
  mode: 'color' | 'marker';
  mark: Color;
  block: Color;
  onBlock: Color;
};

const distinct = (a: Color, b: Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.15;

function side(bg: Color, text: Color, roles: Palette['roles']): Side {
  const ink = ensureContrast(text, bg, 4.5);
  const muted = ensureContrast(mixOklab(ink, bg, 0.4), bg, 4.5);
  const candidates = [roles.accent, roles.accent2, roles.accent3];
  const mark = candidates.find(
    (color) => contrastRatio(color, bg) >= 3 && distinct(color, ink) && distinct(color, bg),
  );
  if (mark) return { bg, text: ink, muted, mode: 'color', mark, block: mark, onBlock: bg };
  const block = candidates.find((color) => distinct(color, bg)) ?? ink;
  const onBlock = ensureContrast(bestContrast(block, [ink, bg]), block, 4.5);
  return { bg, text: ink, muted, mode: 'marker', mark: onBlock, block, onBlock };
}

/** Side A (the palette; the finale's side) and side B (its partner). */
export function sides(roles: Palette['roles'], pair: PairId): readonly [Side, Side] {
  const a = side(roles.bg, roles.fg, roles);
  const partner =
    pair === 'accent' && distinct(roles.accent, roles.bg) && distinct(roles.accent, roles.fg)
      ? roles.accent
      : pair === 'second' && distinct(roles.accent2, roles.bg) && distinct(roles.accent2, roles.fg)
        ? roles.accent2
        : null;
  const b = partner
    ? side(partner, bestContrast(partner, [roles.bg, roles.fg]), roles)
    : side(roles.fg, roles.bg, roles);
  return [a, b];
}
