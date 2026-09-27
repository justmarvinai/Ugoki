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

/**
 * Canvas 2D effects: blur with the canvas `filter` where supported, otherwise a
 * downsample/upsample chain (a soft approximation). Bloom has no threshold here — it glows the
 * whole layer, which suits what templates bloom (light bands, highlights). Luma mattes need
 * per-pixel math, so they read back small mattes; large ones fall back to their alpha.
 */
export class CpuEffects implements Effects {
  readonly kind = 'cpu';
  private readonly a = surface(1, 1);
  private readonly b = surface(1, 1);
  /** Bloom's output: blur results may live in `a` or `b`. */
  private readonly glow = surface(1, 1);
  private readonly filter = canvasFilterSupported();

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
    return this.downsampleBlur(layer, sigma);
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

  /** Halves the image until the scale matches the blur, then scales back up smoothly. */
  private downsampleBlur(layer: OffscreenCanvas, sigma: number): OffscreenCanvas {
    const { width, height } = layer;
    // Each halving blurs by roughly σ ≈ 0.6 × the scale step.
    const steps = Math.max(1, Math.min(6, Math.round(Math.log2(Math.max(1, sigma / 0.6)))));
    let source: OffscreenCanvas = layer;
    let w = width;
    let h = height;
    const surfaces = [this.a, this.b];
    for (let i = 0; i < steps; i++) {
      const nw = Math.max(1, Math.round(w / 2));
      const nh = Math.max(1, Math.round(h / 2));
      // Alternate buffers, so the one we read from is never the one we clear.
      const target = surfaces[i % 2] as Surface;
      sized(target, nw, nh);
      target.ctx.imageSmoothingEnabled = true;
      target.ctx.imageSmoothingQuality = 'high';
      target.ctx.drawImage(source, 0, 0, w, h, 0, 0, nw, nh);
      source = target.canvas;
      w = nw;
      h = nh;
    }
    // Upscale into the other buffer at full size.
    const other = surfaces[steps % 2] as Surface;
    const small = source;
    const sw = w;
    const sh = h;
    sized(other, width, height);
    other.ctx.imageSmoothingEnabled = true;
    other.ctx.imageSmoothingQuality = 'high';
    other.ctx.drawImage(small, 0, 0, sw, sh, 0, 0, width, height);
    return other.canvas;
  }
}
