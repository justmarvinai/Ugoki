/**
 * OKLCH hue partners for Liquid's two-tone palettes. The engine keeps its OKLCH conversions
 * private (`@/engine` exports mixing, contrast and lightness only), so the few lines needed to
 * turn a color around the hue wheel live here — an engine candidate (`rotateHue`).
 */

import type { Color } from '@/engine';

type Lch = { L: number; C: number; h: number };

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

export function toLch(color: Color): Lch {
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const h = C < 1e-6 ? 0 : ((((Math.atan2(B, A) * 180) / Math.PI) % 360) + 360) % 360;
  return { L, C, h };
}

function fromLab(L: number, C: number, h: number): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = C * Math.cos(rad);
  const B = C * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const inGamut = ([r, g, b]: [number, number, number]) =>
  r >= -1e-6 && r <= 1 + 1e-6 && g >= -1e-6 && g <= 1 + 1e-6 && b >= -1e-6 && b <= 1 + 1e-6;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** OKLCH → sRGB, reducing chroma until the color fits the gamut (hue and lightness kept). */
export function fromLch({ L, C, h }: Lch, alpha = 1): Color {
  let rgb = fromLab(L, C, h);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(fromLab(L, mid, h))) lo = mid;
      else hi = mid;
    }
    rgb = fromLab(L, lo, h);
  }
  return { r: clamp01(rgb[0]), g: clamp01(rgb[1]), b: clamp01(rgb[2]), a: alpha };
}

/**
 * A second hue for a two-tone liquid: the same lightness, turned `degrees` around the OKLCH hue
 * wheel, with at least `minChroma` so pale colors still read as a hue (Blush → Lilac).
 */
export function huePartner(color: Color, degrees: number, minChroma: number): Color {
  const { L, C, h } = toLch(color);
  return fromLch({ L: L - 0.02, C: Math.max(C, minChroma), h: (h + degrees + 360) % 360 }, color.a);
}
