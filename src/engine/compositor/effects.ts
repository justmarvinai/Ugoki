/**
 * Layer effects (docs/06-engine.md §9): what `g.fx` and luma masks need from the compositor.
 * Two backends implement it — WebGL2 (`gpu.ts`, preferred) and Canvas 2D (`CpuEffects`, used
 * when a worker has no WebGL2). A device uses the same backend for preview and export, so what
 * you see is what you export.
 *
 * Inputs are frame-sized layer canvases with premultiplied content; results are images the
 * drawer composites back into the parent surface (valid until the next effect call).
 */

export type BloomOptions = {
  /** Glow spread: Gaussian σ in output pixels. */
  radius: number;
  /** Strength of the added glow (1 = the layer's highlights added once). */
  intensity: number;
  /** Luminance above which content glows (0..1). */
  threshold: number;
};

/**
 * A color adjustment, resolved and clamped (`ColorAdjust` in draw/types.ts documents the
 * ranges). Both backends apply it to straight color in this order, with the same math.
 */
export type AdjustOptions = {
  /** Color factor (1 = unchanged). */
  readonly brightness: number;
  /** Slope around mid grey (1 = unchanged). */
  readonly contrast: number;
  /** Factor around the luma (1 = unchanged, 0 = grey). */
  readonly saturation: number;
  /** Tint color: straight sRGB channels, 0 … 1. */
  readonly tint: readonly [number, number, number];
  /** 0 … 1. */
  readonly tintAmount: number;
};

/**
 * An effect's result: the region (`x, y, width, height`, in `source` pixels) holding a
 * frame-sized image to composite at the layer's origin. Valid until the next effect call.
 */
export type EffectImage = {
  readonly source: CanvasImageSource;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export interface Effects {
  readonly kind: 'gpu' | 'cpu';
  /** Gaussian blur; `sigma` in output pixels. */
  blur(layer: OffscreenCanvas, sigma: number): EffectImage;
  /** The glow of a layer's bright parts, to be added (`lighter`) on top of it. */
  bloom(layer: OffscreenCanvas, options: BloomOptions): EffectImage;
  /** Converts a matte's luminance to alpha (alpha mattes need no conversion). */
  lumaToAlpha(layer: OffscreenCanvas): EffectImage;
  /** Color adjustment of a layer, after an optional Gaussian blur (`sigma` in output pixels). */
  adjust(layer: OffscreenCanvas, options: AdjustOptions, sigma?: number): EffectImage;
}

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/**
 * Applies a color adjustment to straight RGBA bytes in place, alpha untouched — the Canvas 2D
 * twin of the WebGL2 `adjust` shader (same order, same math).
 */
export function adjustPixels(d: Uint8ClampedArray, o: AdjustOptions): void {
  const gain = o.brightness / 255;
  const slope = o.contrast;
  const sat = o.saturation;
  const [tr, tg, tb] = o.tint;
  const amount = o.tintAmount;
  const tl = Math.max(1e-3, LUMA_R * tr + LUMA_G * tg + LUMA_B * tb);
  const above = Math.max(1e-3, 1 - tl);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = ((d[i] ?? 0) * gain - 0.5) * slope + 0.5;
    let g = ((d[i + 1] ?? 0) * gain - 0.5) * slope + 0.5;
    let b = ((d[i + 2] ?? 0) * gain - 0.5) * slope + 0.5;
    const l = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    r = Math.min(1, Math.max(0, l + (r - l) * sat));
    g = Math.min(1, Math.max(0, l + (g - l) * sat));
    b = Math.min(1, Math.max(0, l + (b - l) * sat));
    if (amount > 0) {
      // Luma onto black → tint → white: the tint sits at its own luma, so lightness is kept.
      const t = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      const f = t < tl ? t / tl : (t - tl) / above;
      const mr = t < tl ? tr * f : tr + (1 - tr) * f;
      const mg = t < tl ? tg * f : tg + (1 - tg) * f;
      const mb = t < tl ? tb * f : tb + (1 - tb) * f;
      r += (mr - r) * amount;
      g += (mg - g) * amount;
      b += (mb - b) * amount;
    }
    d[i] = r * 255;
    d[i + 1] = g * 255;
    d[i + 2] = b * 255;
  }
}

/** A whole canvas as an effect result. */
export const whole = (canvas: OffscreenCanvas): EffectImage => ({
  source: canvas,
  x: 0,
  y: 0,
  width: canvas.width,
  height: canvas.height,
});

type Surface = { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D };

function surface(width: number, height: number): Surface {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  return { canvas, ctx };
}

/** Resizes (and so clears) a surface, or clears it if the size already matches. */
function sized(s: Surface, width: number, height: number): Surface {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (s.canvas.width !== w || s.canvas.height !== h) {
    s.canvas.width = w;
    s.canvas.height = h;
  } else {
    s.ctx.setTransform(1, 0, 0, 1, 0, 0);
    s.ctx.globalAlpha = 1;
    s.ctx.globalCompositeOperation = 'source-over';
    s.ctx.clearRect(0, 0, w, h);
  }
  s.ctx.filter = 'none';
  return s;
}

let filterSupport: boolean | undefined;

/** Canvas `filter` works here (Chromium, Firefox; not Safari). */
export function canvasFilterSupported(): boolean {
  if (filterSupport === undefined) {
    try {
      const ctx = new OffscreenCanvas(1, 1).getContext('2d');
      if (ctx && 'filter' in ctx) {
        ctx.filter = 'blur(2px)';
        filterSupport = ctx.filter === 'blur(2px)';
      } else {
        filterSupport = false;
      }
    } catch {
      filterSupport = false;
    }
  }
  return filterSupport;
}

/** Widths of three box blurs whose succession approximates a Gaussian of σ (Wells, 1986). */
export function boxSizes(sigma: number): [number, number, number] {
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let low = Math.floor(ideal);
  if (low % 2 === 0) low--;
  const high = low + 2;
  const m = Math.round((12 * sigma * sigma - n * low * low - 4 * n * low - 3 * n) / (-4 * low - 4));
  return [0, 1, 2].map((i) => (i < m ? low : high)) as [number, number, number];
}

/** One box pass along rows (`step` 1) or columns, transparent beyond the edges. */
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
      for (let k = 0; k <= Math.min(radius, length - 1); k++)
        sum += src[base + k * stride + c] ?? 0;
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

/** Rows read back at a time by per-pixel effects (bounds the pixel buffer for 4K layers). */
const STRIP = 512;

/**
 * Canvas 2D effects: blur with the canvas `filter` where supported, otherwise three box blurs
 * on premultiplied pixels (a close Gaussian, the same wherever the content sits). Bloom has no
 * threshold here — it glows the whole layer, which suits what templates bloom (light bands,
 * highlights). Luma mattes need per-pixel math, so they read back small mattes; large ones fall
 * back to their alpha. Color adjustment reads the layer back in strips (the WebGL2 shader's
 * math in JavaScript — slower, but the same result).
 */
export class CpuEffects implements Effects {
  readonly kind = 'cpu';
  /** Blur results. */
  private readonly a = surface(1, 1);
  /** Bloom's output (it reads a blur result from `a`). */
  private readonly glow = surface(1, 1);
  /** Color adjustment's output (it reads a blur result from `a`, or the layer). */
  private readonly adjusted = surface(1, 1);
  private readonly filter: boolean;

  /** `filter: false` forces the box blur (as in Safari), e.g. to test it where `filter` works. */
  constructor(options: { filter?: boolean } = {}) {
    this.filter = options.filter ?? canvasFilterSupported();
  }

  blur(layer: OffscreenCanvas, sigma: number): EffectImage {
    return whole(this.blurCanvas(layer, sigma));
  }

  private blurCanvas(layer: OffscreenCanvas, sigma: number): OffscreenCanvas {
    const { width, height } = layer;
    if (!(sigma > 0.25)) return layer;
    if (this.filter) {
      const out = sized(this.a, width, height);
      out.ctx.filter = `blur(${sigma}px)`;
      out.ctx.drawImage(layer, 0, 0);
      out.ctx.filter = 'none';
      return out.canvas;
    }
    return this.boxBlur(layer, sigma);
  }

  bloom(layer: OffscreenCanvas, options: BloomOptions): EffectImage {
    const blurred = this.blurCanvas(layer, options.radius);
    const { width, height } = layer;
    const out = sized(this.glow, width, height);
    // Intensity > 1 adds the glow more than once.
    let remaining = Math.max(0, options.intensity);
    while (remaining > 0.001) {
      out.ctx.globalAlpha = Math.min(1, remaining);
      out.ctx.globalCompositeOperation = 'lighter';
      out.ctx.drawImage(blurred, 0, 0);
      remaining -= 1;
    }
    out.ctx.globalAlpha = 1;
    out.ctx.globalCompositeOperation = 'source-over';
    return whole(out.canvas);
  }

  lumaToAlpha(layer: OffscreenCanvas): EffectImage {
    const { width, height } = layer;
    if (width * height > 4_000_000) return whole(layer);
    const ctx = layer.getContext('2d');
    if (!ctx) return whole(layer);
    const image = ctx.getImageData(0, 0, width, height);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      // Rec. 709 luma of the (unpremultiplied) color, times its alpha.
      const luma = 0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
      const alpha = ((d[i + 3] ?? 0) * luma) / 255;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = alpha;
    }
    const out = sized(this.a, width, height);
    out.ctx.putImageData(image, 0, 0);
    return whole(out.canvas);
  }

  adjust(layer: OffscreenCanvas, options: AdjustOptions, sigma = 0): EffectImage {
    const source = this.blurCanvas(layer, sigma);
    const ctx = source.getContext('2d');
    if (!ctx) return whole(source);
    const { width, height } = source;
    const out = sized(this.adjusted, width, height);
    for (let y = 0; y < height; y += STRIP) {
      // ImageData is straight alpha: the adjustment never sees premultiplied color.
      const image = ctx.getImageData(0, y, width, Math.min(STRIP, height - y));
      adjustPixels(image.data, options);
      out.ctx.putImageData(image, 0, y);
    }
    return whole(out.canvas);
  }

  /** Three box blurs on premultiplied pixels (Safari: no Canvas `filter`). */
  private boxBlur(layer: OffscreenCanvas, sigma: number): OffscreenCanvas {
    const { width, height } = layer;
    const ctx = layer.getContext('2d');
    if (!ctx) return layer;
    const image = ctx.getImageData(0, 0, width, height);
    const d = image.data;
    const a = new Float32Array(d.length);
    const b = new Float32Array(d.length);
    for (let i = 0; i < d.length; i += 4) {
      const alpha = (d[i + 3] ?? 0) / 255;
      a[i] = (d[i] ?? 0) * alpha;
      a[i + 1] = (d[i + 1] ?? 0) * alpha;
      a[i + 2] = (d[i + 2] ?? 0) * alpha;
      a[i + 3] = d[i + 3] ?? 0;
    }
    for (const size of boxSizes(sigma)) {
      const radius = (size - 1) / 2;
      boxPass(a, b, width, height, radius, true);
      boxPass(b, a, width, height, radius, false);
    }
    // Back to straight alpha (putImageData expects it).
    for (let i = 0; i < d.length; i += 4) {
      const alpha = a[i + 3] ?? 0;
      const k = alpha > 0 ? 255 / alpha : 0;
      d[i] = (a[i] ?? 0) * k;
      d[i + 1] = (a[i + 1] ?? 0) * k;
      d[i + 2] = (a[i + 2] ?? 0) * k;
      d[i + 3] = alpha;
    }
    const out = sized(this.a, width, height);
    out.ctx.putImageData(image, 0, 0);
    return out.canvas;
  }
}
