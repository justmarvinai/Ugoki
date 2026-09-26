/**
 * Color science for the engine: sRGB ⇄ linear ⇄ OKLab ⇄ OKLCH (Björn Ottosson, 2020),
 * perceptual mixing, WCAG contrast and gamut mapping. Dependency-free so it runs in workers.
 */

import { clamp, clamp01, lerp, mod } from './math';

/** sRGB color with straight alpha; channels in [0, 1]. */
export type Color = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
};

export type Oklab = { L: number; a: number; b: number };
export type Oklch = { L: number; C: number; h: number };

export function rgb(r: number, g: number, b: number, a = 1): Color {
  return { r, g, b, a };
}

const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function parseHex(hex: string): Color {
  const match = HEX.exec(hex.trim());
  if (!match?.[1]) throw new Error(`Invalid hex color: ${hex}`);
  let digits = match[1];
  if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('');
  const n = (i: number) => Number.parseInt(digits.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) : 1 };
}

const toByte = (v: number) => Math.round(clamp01(v) * 255);

export function toHex(color: Color, withAlpha = color.a < 1): string {
  const parts = [color.r, color.g, color.b, ...(withAlpha ? [color.a] : [])];
  return `#${parts.map((v) => toByte(v).toString(16).padStart(2, '0')).join('')}`;
}

const cssCache = new Map<string, string>();

/** Canvas-ready CSS string (cached; colors are immutable). */
export function toCss(color: Color): string {
  const key = `${color.r},${color.g},${color.b},${color.a}`;
  let css = cssCache.get(key);
  if (css === undefined) {
    css = toHex(color, color.a < 1);
    if (cssCache.size > 4096) cssCache.clear();
    cssCache.set(key, css);
  }
  return css;
}

export function withAlpha(color: Color, a: number): Color {
  return { r: color.r, g: color.g, b: color.b, a: clamp01(a) };
}

// --- transfer functions -------------------------------------------------------------------

export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

// --- OKLab / OKLCH ------------------------------------------------------------------------

export function toOklab(color: Color): Oklab {
  const r = srgbToLinear(color.r);
  const g = srgbToLinear(color.g);
  const b = srgbToLinear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab → sRGB (unclamped: channels may fall outside [0, 1] for out-of-gamut colors). */
export function fromOklabUnclamped(lab: Oklab, alpha = 1): Color {
  const l = (lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const m = (lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const s = (lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  };
}

export function oklabToOklch({ L, a, b }: Oklab): Oklch {
  const C = Math.hypot(a, b);
  const h = C < 1e-6 ? 0 : mod((Math.atan2(b, a) * 180) / Math.PI, 360);
  return { L, C, h };
}

export function oklchToOklab({ L, C, h }: Oklch): Oklab {
  const rad = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

export function toOklch(color: Color): Oklch {
  return oklabToOklch(toOklab(color));
}

const inGamut = (c: Color, eps = 1e-6) =>
  c.r >= -eps && c.r <= 1 + eps && c.g >= -eps && c.g <= 1 + eps && c.b >= -eps && c.b <= 1 + eps;

const clampColor = (c: Color): Color => ({
  r: clamp01(c.r),
  g: clamp01(c.g),
  b: clamp01(c.b),
  a: clamp01(c.a),
});

/**
 * OKLCH → sRGB with gamut mapping by chroma reduction (hue and lightness are preserved, as in
 * CSS Color 4), so derived colors never shift hue when they leave the sRGB gamut.
 */
export function fromOklch(lch: Oklch, alpha = 1): Color {
  const L = clamp01(lch.L);
  const direct = fromOklabUnclamped(oklchToOklab({ L, C: lch.C, h: lch.h }), alpha);
  if (inGamut(direct)) return clampColor(direct);
  let lo = 0;
  let hi = lch.C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(fromOklabUnclamped(oklchToOklab({ L, C: mid, h: lch.h }), alpha))) lo = mid;
    else hi = mid;
  }
  return clampColor(fromOklabUnclamped(oklchToOklab({ L, C: lo, h: lch.h }), alpha));
}

/** Perceptual interpolation in OKLCH along the shortest hue arc (docs/04-motion-language.md §11). */
export function mixOklch(from: Color, to: Color, t: number): Color {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = toOklch(from);
  const b = toOklch(to);
  // Achromatic endpoints adopt the other color's hue so greys don't swing through hues.
  const ha = a.C < 1e-4 ? b.h : a.h;
  const hb = b.C < 1e-4 ? a.h : b.h;
  let dh = hb - ha;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return fromOklch(
    { L: lerp(a.L, b.L, t), C: lerp(a.C, b.C, t), h: mod(ha + dh * t, 360) },
    lerp(from.a, to.a, t),
  );
}

// --- WCAG ---------------------------------------------------------------------------------

export function relativeLuminance(color: Color): number {
  return (
    0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b)
  );
}

export function contrastRatio(a: Color, b: Color): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Moves `fg` along OKLCH lightness (away from `bg`) until it reaches `minRatio` against `bg`.
 * Hue and (gamut permitting) chroma are preserved. Returns black/white if no lightness suffices.
 */
export function ensureContrast(fg: Color, bg: Color, minRatio: number): Color {
  if (contrastRatio(fg, bg) >= minRatio) return fg;
  const lch = toOklch(fg);
  const darker = relativeLuminance(bg) > 0.18;
  const target = darker ? 0 : 1;
  let lo = lch.L;
  let hi = target;
  let found: Color | null = null;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const candidate = fromOklch({ L: mid, C: lch.C, h: lch.h }, fg.a);
    if (contrastRatio(candidate, bg) >= minRatio) {
      found = candidate;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  if (found) return found;
  return darker ? rgb(0, 0, 0, fg.a) : rgb(1, 1, 1, fg.a);
}

/** Picks whichever of `options` contrasts most with `bg`. */
export function bestContrast(bg: Color, options: readonly Color[]): Color {
  let best = options[0] ?? rgb(0, 0, 0);
  let bestRatio = -1;
  for (const option of options) {
    const ratio = contrastRatio(option, bg);
    if (ratio > bestRatio) {
      best = option;
      bestRatio = ratio;
    }
  }
  return best;
}

export function adjustLightness(color: Color, delta: number): Color {
  const lch = toOklch(color);
  return fromOklch({ ...lch, L: clamp(lch.L + delta, 0, 1) }, color.a);
}
