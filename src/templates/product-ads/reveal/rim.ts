/**
 * The rim light's images, baked once in `build` so a frame only masks them — no color pass and
 * no blur per frame, on the GPU and the Canvas 2D compositor alike:
 *
 * - `lit`: the product under the light — brightened and cast in the light's color, with the same
 *   math as the Draw API's `fx({ adjust })` (brightness, contrast, tint; straight alpha, so the
 *   cut-out's edges stay clean);
 * - `glow`: a soft bloom of its brightest parts (metal, glass, print) — thresholded, then blurred
 *   with three box passes at quarter resolution, padded so the halo can spread beyond the object.
 *
 * Null for vector artwork or where there is no OffscreenCanvas (Node): the caller then lights the
 * product with `fx({ adjust })` per frame, without the glow. The floor reflection is baked the
 * same way (`bakeReflection`).
 *
 * Engine candidate: a cached, pre-graded image per control (`ctx.graded(key, adjust)`) and a
 * baked bloom of it.
 */

import type { Color, Graphic } from '@/engine';

export type Grade = {
  brightness: number;
  contrast: number;
  tint: { color: Color; amount: number };
};

/** A drawable image (the Draw API's `image` source). */
export type Baked = {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
};

export type RimImages = {
  /** The product's ink area (image pixels) the images cover. */
  readonly area: { x: number; y: number; w: number; h: number };
  readonly lit: Baked;
  readonly glow: Baked;
  /** The glow image covers `area` grown by this share of its width/height on each side. */
  readonly padX: number;
  readonly padY: number;
};

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;
/** The glow is computed at this fraction of the product image's resolution. */
const GLOW_SCALE = 0.25;

function canvas2d(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return ctx ? { canvas, ctx } : null;
}

/** Sizes of three box blurs approximating a Gaussian of `sigma` (odd sizes). */
function boxSizes(sigma: number): [number, number, number] {
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let low = Math.floor(ideal);
  if (low % 2 === 0) low--;
  const high = low + 2;
  const m = Math.round((12 * sigma * sigma - n * low * low - 4 * n * low - 3 * n) / (-4 * low - 4));
  return [0, 1, 2].map((i) => (i < m ? low : high)) as [number, number, number];
}

/** One box pass along rows or columns, transparent beyond the edges. */
function boxPass(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
) {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const stride = horizontal ? 4 : width * 4;
  const scale = 1 / (2 * radius + 1);
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * width * 4 : line * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k <= Math.min(radius, length - 1); k++) {
        sum += src[base + k * stride + c] ?? 0;
      }
      for (let i = 0; i < length; i++) {
        dst[base + i * stride + c] = sum * scale;
        const add = i + radius + 1;
        const drop = i - radius;
        if (add < length) sum += src[base + add * stride + c] ?? 0;
        if (drop >= 0) sum -= src[base + drop * stride + c] ?? 0;
      }
    }
  }
}

/**
 * Bakes the lit product and its glow. `threshold` (0..1 luma) picks what glows; `sigma` is the
 * glow's blur in product-image pixels.
 */
export function bakeRim(
  graphic: Graphic | null,
  grade: Grade,
  threshold: number,
  sigma: number,
): RimImages | null {
  if (graphic?.kind !== 'raster' || typeof OffscreenCanvas !== 'function') return null;
  const { image: raster, ink } = graphic;
  // Only the ink (the object) is baked: a cut-out's transparent margins need no light.
  const x0 = Math.max(0, Math.floor(ink.x));
  const y0 = Math.max(0, Math.floor(ink.y));
  const width = Math.min(raster.width, Math.ceil(ink.x + ink.w)) - x0;
  const height = Math.min(raster.height, Math.ceil(ink.y + ink.h)) - y0;
  if (!(width > 0 && height > 0)) return null;

  // --- lit ----------------------------------------------------------------------------------
  const lit = canvas2d(width, height);
  if (!lit) return null;
  lit.ctx.drawImage(raster.source, x0, y0, width, height, 0, 0, width, height);
  const image = lit.ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const gain = grade.brightness / 255;
  const slope = grade.contrast;
  const amount = Math.min(1, Math.max(0, grade.tint.amount));
  const { r: tr, g: tg, b: tb } = grade.tint.color;
  const tl = Math.max(1e-3, LUMA_R * tr + LUMA_G * tg + LUMA_B * tb);
  const above = Math.max(1e-3, 1 - tl);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = Math.min(1, Math.max(0, ((d[i] ?? 0) * gain - 0.5) * slope + 0.5));
    let g = Math.min(1, Math.max(0, ((d[i + 1] ?? 0) * gain - 0.5) * slope + 0.5));
    let b = Math.min(1, Math.max(0, ((d[i + 2] ?? 0) * gain - 0.5) * slope + 0.5));
    if (amount > 0) {
      // Luma onto black → tint → white: the tint sits at its own luma, so lightness is kept.
      const t = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      const f = t < tl ? t / tl : (t - tl) / above;
      r += ((t < tl ? tr * f : tr + (1 - tr) * f) - r) * amount;
      g += ((t < tl ? tg * f : tg + (1 - tg) * f) - g) * amount;
      b += ((t < tl ? tb * f : tb + (1 - tb) * f) - b) * amount;
    }
    d[i] = r * 255;
    d[i + 1] = g * 255;
    d[i + 2] = b * 255;
  }
  lit.ctx.putImageData(image, 0, 0);

  // --- glow ---------------------------------------------------------------------------------
  const s = sigma * GLOW_SCALE;
  const pad = Math.ceil(3 * s) + 2;
  const sw = Math.max(1, Math.round(width * GLOW_SCALE));
  const sh = Math.max(1, Math.round(height * GLOW_SCALE));
  const gw = sw + 2 * pad;
  const gh = sh + 2 * pad;
  const glow = canvas2d(gw, gh);
  if (!glow) return null;
  glow.ctx.imageSmoothingEnabled = true;
  glow.ctx.imageSmoothingQuality = 'high';
  glow.ctx.drawImage(lit.canvas, pad, pad, sw, sh);
  const small = glow.ctx.getImageData(0, 0, gw, gh);
  const p = small.data;
  const a = new Float32Array(p.length);
  const b = new Float32Array(p.length);
  const knee = Math.max(1e-3, 1 - threshold);
  for (let i = 0; i < p.length; i += 4) {
    const alpha = (p[i + 3] ?? 0) / 255;
    if (alpha === 0) continue;
    const r = (p[i] ?? 0) / 255;
    const g = (p[i + 1] ?? 0) / 255;
    const bl = (p[i + 2] ?? 0) / 255;
    const luma = LUMA_R * r + LUMA_G * g + LUMA_B * bl;
    const k = Math.max(0, (luma - threshold) / knee) * alpha;
    // Premultiplied glow color.
    a[i] = r * k;
    a[i + 1] = g * k;
    a[i + 2] = bl * k;
    a[i + 3] = k;
  }
  for (const size of boxSizes(Math.max(0.5, s))) {
    const radius = (size - 1) / 2;
    boxPass(a, b, gw, gh, radius, true);
    boxPass(b, a, gw, gh, radius, false);
  }
  for (let i = 0; i < p.length; i += 4) {
    const alpha = a[i + 3] ?? 0;
    const k = alpha > 0 ? 255 / alpha : 0;
    p[i] = (a[i] ?? 0) * k;
    p[i + 1] = (a[i + 1] ?? 0) * k;
    p[i + 2] = (a[i + 2] ?? 0) * k;
    p[i + 3] = Math.min(255, alpha * 255);
  }
  glow.ctx.putImageData(small, 0, 0);

  return {
    area: { x: x0, y: y0, w: width, h: height },
    lit: { source: lit.canvas, width, height },
    glow: { source: glow.canvas, width: gw, height: gh },
    padX: pad / sw,
    padY: pad / sh,
  };
}

export type Reflection = {
  readonly image: Baked;
  /** Where the image sits relative to the product's ink box, in ink-box units (x, width). */
  readonly x: number;
  readonly w: number;
  /** Its height in ink-box heights (from the floor down). */
  readonly h: number;
};

/**
 * The floor reflection, baked: the lower `depth` (share of the object's height) of the object,
 * flipped at its foot, faded from `peak` at the floor to nothing, and blurred (`sigma` in image
 * pixels) at half resolution — a frame then draws one image instead of a blurred, masked layer.
 */
export function bakeReflection(
  graphic: Graphic | null,
  depth: number,
  peak: number,
  sigma: number,
): Reflection | null {
  if (graphic?.kind !== 'raster' || typeof OffscreenCanvas !== 'function') return null;
  const { image: raster, ink } = graphic;
  if (!(ink.w > 0 && ink.h > 0)) return null;
  const scale = 0.5;
  const s = Math.max(0.5, sigma * scale);
  const pad = Math.ceil(3 * s) + 1;
  const rw = Math.max(1, Math.ceil(ink.w * scale));
  const rh = Math.max(1, Math.ceil(ink.h * depth * scale));
  const width = rw + 2 * pad;
  const height = rh + pad;
  const out = canvas2d(width, height);
  if (!out) return null;
  // Image row (ink bottom − r) lands on canvas row r: flipped at the object's foot.
  out.ctx.imageSmoothingEnabled = true;
  out.ctx.imageSmoothingQuality = 'high';
  out.ctx.setTransform(scale, 0, 0, -scale, pad - ink.x * scale, (ink.y + ink.h) * scale);
  out.ctx.drawImage(raster.source, 0, 0);
  out.ctx.setTransform(1, 0, 0, 1, 0, 0);
  const image = out.ctx.getImageData(0, 0, width, height);
  const p = image.data;
  const a = new Float32Array(p.length);
  const b = new Float32Array(p.length);
  for (let y = 0; y < height; y++) {
    const f = Math.max(0, 1 - y / rh);
    const fade = peak * f ** 2.2;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = ((p[i + 3] ?? 0) / 255) * fade;
      a[i] = (p[i] ?? 0) * alpha;
      a[i + 1] = (p[i + 1] ?? 0) * alpha;
      a[i + 2] = (p[i + 2] ?? 0) * alpha;
      a[i + 3] = alpha;
    }
  }
  for (const size of boxSizes(s)) {
    const radius = (size - 1) / 2;
    boxPass(a, b, width, height, radius, true);
    boxPass(b, a, width, height, radius, false);
  }
  for (let i = 0; i < p.length; i += 4) {
    const alpha = a[i + 3] ?? 0;
    const k = alpha > 0 ? 1 / alpha : 0;
    p[i] = (a[i] ?? 0) * k;
    p[i + 1] = (a[i + 1] ?? 0) * k;
    p[i + 2] = (a[i + 2] ?? 0) * k;
    p[i + 3] = Math.min(255, alpha * 255);
  }
  out.ctx.putImageData(image, 0, 0);
  const unit = 1 / scale / ink.w;
  return {
    image: { source: out.canvas, width, height },
    x: -pad * unit,
    w: width * unit,
    h: height / scale / ink.h,
  };
}
