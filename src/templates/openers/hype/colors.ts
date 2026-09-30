/**
 * Hype's colors, from palette roles only: the palette's distinct colors become the swatches
 * the edit cuts between (background first), and every shot inks its type in another palette
 * color that keeps text contrast on it — so the color swaps stay legible in any palette.
 */

import { type Color, contrastRatio, type Palette, type PaletteRole, type Rng } from '@/engine';

/** Two colors read as different swatches: enough contrast, or clearly apart in hue. */
export const distinct = (a: Color, b: Color): boolean =>
  contrastRatio(a, b) >= 1.3 || Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.3;

/** Roles in the order the edit reaches for them (the background is the home color). */
const ORDER: readonly PaletteRole[] = ['bg', 'accent', 'accent2', 'fg', 'accent3', 'surface'];

/** The palette's distinct colors, in role order. */
export function paletteColors(roles: Palette['roles']): Color[] {
  const out: Color[] = [];
  for (const role of ORDER) {
    const color = roles[role];
    if (out.every((other) => distinct(other, color))) out.push(color);
  }
  return out;
}

/** Type needs 4.5:1 (it is read in half a second); graphics 2:1 to register as a shape. */
const TEXT = 4.5;
const GRAPHIC = 2;

export type Scheme = {
  /** Background of the shot. */
  readonly bg: Color;
  /** Type and key shapes (≥ 4.5:1 on `bg`). */
  readonly ink: Color;
  /** A third color for secondary graphics (outlines, rings, offsets), apart from both. */
  readonly alt: Color;
};

/** Colors that keep text contrast on `bg` (the most contrasting one when none does). */
export function inksFor(bg: Color, pool: readonly Color[]): Color[] {
  const legible = pool.filter((color) => contrastRatio(color, bg) >= TEXT);
  if (legible.length > 0) return legible;
  let best = pool[0] ?? bg;
  for (const color of pool) {
    if (contrastRatio(color, bg) > contrastRatio(best, bg)) best = color;
  }
  return [best];
}

/** A third color apart from `bg` and `ink` (the ink itself when the palette has none). */
export function altFor(bg: Color, ink: Color, pool: readonly Color[], rng: Rng): Color {
  const options = pool.filter(
    (color) => distinct(color, bg) && distinct(color, ink) && contrastRatio(color, bg) >= GRAPHIC,
  );
  return options.length > 0 ? rng.pick(options) : ink;
}

/**
 * Schemes for a run of shots: backgrounds cycle through the swatches (never the same twice in
 * a row; the first and the last shot avoid the home color, so the cuts from and into the
 * background frames read), and inks vary where the palette allows it.
 */
export function schemes(
  count: number,
  swatches: readonly Color[],
  pool: readonly Color[],
  home: Color,
  rng: Rng,
): Scheme[] {
  const out: Scheme[] = [];
  let previous: Scheme | null = null;
  for (let i = 0; i < count; i++) {
    const edge = i === 0 || i === count - 1;
    let options = swatches.filter((color) => color !== previous?.bg);
    if (edge && options.some((color) => color !== home)) {
      options = options.filter((color) => color !== home);
    }
    if (options.length === 0) options = swatches.slice();
    const bg = rng.pick(options);
    const inks = inksFor(bg, pool);
    const fresh = inks.filter((color) => color !== previous?.ink);
    const ink = rng.pick(fresh.length > 0 ? fresh : inks);
    const scheme = { bg, ink, alt: altFor(bg, ink, pool, rng) };
    out.push(scheme);
    previous = scheme;
  }
  return out;
}

/** The same scheme with background and ink swapped (Wild's half-beat color swap). */
export const flipped = (s: Scheme): Scheme => ({ bg: s.ink, ink: s.bg, alt: s.alt });
