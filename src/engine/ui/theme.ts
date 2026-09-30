/**
 * UI Kit themes (docs/templates/10-ui-motion.md, "Shared behaviour"): unbranded Light and Dark
 * token sets that take the palette as a theme. Neutrals carry a hint of the accent's hue, so a
 * UI reads as one product; the accent is the palette color that best survives on the UI's
 * surfaces (Cobalt's blue on a light card, Tangerine's orange on a dark one).
 */

import {
  type Color,
  contrastRatio,
  ensureContrast,
  fromOklch,
  mixOklab,
  parseHex,
  relativeLuminance,
  toOklch,
} from '../core/color';
import { clamp } from '../core/math';
import type { Palette } from '../template/palettes';

export type UiMode = 'light' | 'dark';

export type UiTheme = {
  readonly mode: UiMode;
  readonly dark: boolean;
  /** Page color behind cards (an app screen's background). */
  readonly canvas: Color;
  /** Cards and panels. */
  readonly surface: Color;
  /** Elevated elements above surfaces: toasts, menus, tooltips. */
  readonly raised: Color;
  /** Recessed areas: inputs, tracks, skeletons. */
  readonly sunken: Color;
  readonly border: Color;
  readonly borderStrong: Color;
  /** Primary text (≥ 7:1 on surface). */
  readonly text: Color;
  /** Secondary text (≥ 4.5:1 on surface). */
  readonly muted: Color;
  /** Placeholders and axis labels (≥ 3:1 on surface). */
  readonly subtle: Color;
  readonly gridline: Color;
  /** Accent fill: primary buttons, bars, lines, selection. */
  readonly accent: Color;
  /** Text and icons on an accent fill. */
  readonly onAccent: Color;
  /** The accent as thin strokes on surfaces (≥ 3:1): chart lines, focus rings, links. */
  readonly accentInk: Color;
  /** A tint of the accent over the surface: area fills, highlights, focus halos. */
  readonly accentSoft: Color;
  readonly success: Color;
  readonly onSuccess: Color;
  readonly successSoft: Color;
  readonly danger: Color;
  readonly dangerSoft: Color;
  /**
   * Shadow tint; `shadowStrength` scales elevation opacities — shadows falling on a dark stage
   * need to be denser to read at all.
   */
  readonly shadow: Color;
  readonly shadowStrength: number;
};

/** Corner radii in UI px (see `UiScale`). */
export const UI_RADIUS = { xs: 4, sm: 6, md: 10, lg: 14, xl: 20, full: 9999 } as const;
export type UiRadius = keyof typeof UI_RADIUS;

/** One shadow of an elevation: offset, blur (σ) and spread in UI px, opacity 0..1. */
export type ShadowLayer = {
  readonly y: number;
  readonly blur: number;
  readonly spread?: number;
  readonly alpha: number;
};

/**
 * Elevations as layered shadows (a tight contact shadow + a soft ambient one), in UI px.
 * 1: cards resting on a page (one soft layer — dense grids stay cheap) · 2: floating cards ·
 * 3: toasts, popovers, hero panels.
 */
export const ELEVATIONS = {
  1: [{ y: 3, blur: 7, spread: -2, alpha: 0.09 }],
  2: [
    { y: 2, blur: 3, alpha: 0.05 },
    { y: 12, blur: 16, spread: -4, alpha: 0.12 },
  ],
  3: [
    { y: 3, blur: 4, alpha: 0.06 },
    { y: 20, blur: 22, spread: -6, alpha: 0.17 },
  ],
} as const satisfies Record<number, readonly ShadowLayer[]>;
export type Elevation = keyof typeof ELEVATIONS;

/** OKLCH lightness of each neutral; chroma is a whisper of the accent's hue. */
const NEUTRALS: Record<
  UiMode,
  Record<
    'canvas' | 'surface' | 'raised' | 'sunken' | 'border' | 'borderStrong' | 'gridline',
    number
  >
> = {
  light: {
    canvas: 0.972,
    surface: 1,
    raised: 1,
    sunken: 0.968,
    border: 0.918,
    borderStrong: 0.862,
    gridline: 0.945,
  },
  dark: {
    canvas: 0.15,
    surface: 0.2,
    raised: 0.245,
    sunken: 0.172,
    border: 0.285,
    borderStrong: 0.345,
    gridline: 0.25,
  },
};

const INK = { light: 0.2, dark: 0.975 };
const MUTED = { light: 0.49, dark: 0.74 };
const SUBTLE = { light: 0.63, dark: 0.58 };

const WHITE = parseHex('#FFFFFF');
const NEAR_BLACK = parseHex('#0B0B0C');
const SUCCESS = { light: parseHex('#138A55'), dark: parseHex('#3DD68C') };
const DANGER = { light: parseHex('#D43A3A'), dark: parseHex('#FF6B6B') };
const SHADOW = { light: parseHex('#0E1422'), dark: parseHex('#000000') };

/** Palette colors with at least this OKLCH chroma count as colorful (an accent candidate). */
const COLORFUL = 0.05;

/**
 * The UI accent a palette gives on `surface`: the first colorful palette color (accent, then
 * bg, accent2, accent3) that stands out on the surface (≥ 3:1); failing that, the first colorful
 * one (used as a fill — its text and strokes get their own contrast); monochrome palettes get
 * `ink`.
 */
export function pickAccent(palette: Palette, surface: Color, ink: Color): Color {
  const { accent, bg, accent2, accent3 } = palette.roles;
  const candidates = [accent, bg, accent2, accent3];
  const colorful = candidates.filter((color) => toOklch(color).C >= COLORFUL);
  return colorful.find((color) => contrastRatio(color, surface) >= 3) ?? colorful[0] ?? ink;
}

/** Text on a fill: white while it holds 3.2:1 (bold UI labels), else near-black. */
export function onFill(fill: Color): Color {
  return contrastRatio(WHITE, fill) >= 3.2 ? WHITE : NEAR_BLACK;
}

/** Light or Dark UI tokens themed by a palette (the accent comes from the palette). */
export function uiTheme(
  palette: Palette,
  mode: UiMode,
  options: {
    /** Force an accent instead of the palette's. */
    accent?: Color;
    /** What the UI floats on (default: the palette's background) — sets shadow density. */
    stage?: Color;
  } = {},
): UiTheme {
  const accentOverride = options.accent;
  const dark = mode === 'dark';
  const provisionalSurface = fromOklch({ L: NEUTRALS[mode].surface, C: 0, h: 0 });
  const provisionalInk = fromOklch({ L: INK[mode], C: 0, h: 0 });
  const accent = accentOverride ?? pickAccent(palette, provisionalSurface, provisionalInk);
  const accentLch = toOklch(accent);
  const hue = accentLch.h;
  // Tinted neutrals: barely there on light UIs, a little more on dark ones.
  const tint = accentLch.C < COLORFUL ? 0 : dark ? 0.009 : 0.005;
  const neutral = (L: number, chroma = tint) =>
    fromOklch({ L, C: L >= 0.999 ? 0 : chroma, h: hue });
  const n = NEUTRALS[mode];
  const surface = neutral(n.surface);
  const text = ensureContrast(neutral(INK[mode], tint * 1.6), surface, 7);
  const muted = ensureContrast(neutral(MUTED[mode]), surface, 4.5);
  const subtle = ensureContrast(neutral(SUBTLE[mode]), surface, 3);
  const accentInk = ensureContrast(accent, surface, 3);
  const success = ensureContrast(SUCCESS[mode], surface, 4.5);
  const danger = ensureContrast(DANGER[mode], surface, 4.5);
  return {
    mode,
    dark,
    canvas: neutral(n.canvas),
    surface,
    raised: neutral(n.raised),
    sunken: neutral(n.sunken),
    border: neutral(n.border),
    borderStrong: neutral(n.borderStrong),
    text,
    muted,
    subtle,
    gridline: neutral(n.gridline),
    accent,
    onAccent: onFill(accent),
    accentInk,
    accentSoft: mixOklab(accent, surface, dark ? 0.8 : 0.88),
    success,
    onSuccess: onFill(success),
    successSoft: mixOklab(success, surface, dark ? 0.82 : 0.88),
    danger,
    dangerSoft: mixOklab(danger, surface, dark ? 0.82 : 0.88),
    shadow: SHADOW[mode],
    shadowStrength: relativeLuminance(options.stage ?? palette.roles.bg) < 0.18 ? 2.4 : 1,
  };
}

/** A vivid version of a color for an icon tile (lightness and chroma kept in range). */
function vivid(color: Color, hueShift = 0): Color {
  const lch = toOklch(color);
  return fromOklch({
    L: clamp(lch.L, 0.58, 0.78),
    C: clamp(lch.C, 0.11, 0.19),
    h: lch.h + hueShift,
  });
}

/**
 * Colors for app icons and category tiles, one per item: the palette's accent, its second
 * accent when that has color, then turns of the accent's hue — one family, each item its own.
 * Monochrome palettes start from a neutral blue.
 */
export function iconColors(
  palette: Palette,
  count: number,
  options: {
    /** Stay close to the accent's hue (color fields, backgrounds) instead of spreading out. */
    analogous?: boolean;
  } = {},
): Color[] {
  const { accent, accent2 } = palette.roles;
  const base = toOklch(accent).C < COLORFUL ? fromOklch({ L: 0.66, C: 0.14, h: 255 }) : accent;
  const turns = options.analogous ? [40, -40, 80, -80] : [150, -95, 55, 200];
  const second = toOklch(accent2).C >= COLORFUL ? vivid(accent2) : vivid(base, turns[0] as number);
  const colors = [
    vivid(base),
    second,
    vivid(base, turns[1] as number),
    vivid(base, turns[2] as number),
    vivid(base, turns[3] as number),
  ];
  return Array.from({ length: Math.max(0, count) }, (_, i) => colors[i % colors.length] as Color);
}
