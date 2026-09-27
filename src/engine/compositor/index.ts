/**
 * The compositor facade (docs/06-engine.md §9): layer effects for the drawer, motion-blur
 * accumulation and the finish (grain, soft glow). WebGL2 when the worker has it, Canvas 2D
 * otherwise — chosen once per worker, so preview and export on a device match.
 */

import { rngFor } from '../core/rng';
import { CpuEffects, type EffectImage, type Effects, whole } from './effects';
import { type FinishOptions, GpuCompositor } from './gpu';

export type { EffectImage, Effects } from './effects';
export type { FinishOptions } from './gpu';

export interface Compositor {
  readonly kind: 'gpu' | 'cpu';
  /** Effects for `g.fx` and luma masks. */
  readonly effects: Effects;
  /** Starts averaging sub-frames of `width × height` (motion blur). */
  beginAccumulation(width: number, height: number): void;
  accumulate(frame: OffscreenCanvas, weight: number): void;
  /** The averaged frame, finished when asked. */
  resolve(finish: FinishOptions | null): EffectImage;
  /** A single rendered frame, finished. */
  finish(frame: OffscreenCanvas, finish: FinishOptions): EffectImage;
}

type Surface = { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D };

function surface(): Surface {
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  return { canvas, ctx };
}

function reset(s: Surface, width: number, height: number): Surface {
  if (s.canvas.width !== width || s.canvas.height !== height) {
    s.canvas.width = width;
    s.canvas.height = height;
  } else {
    s.ctx.setTransform(1, 0, 0, 1, 0, 0);
    s.ctx.clearRect(0, 0, width, height);
  }
  s.ctx.globalAlpha = 1;
  s.ctx.globalCompositeOperation = 'source-over';
  return s;
}

/** Canvas 2D frame work: 8-bit additive accumulation, a seeded grain tile, screen glow. */
class CpuCompositor implements Compositor {
  readonly kind = 'cpu';
  readonly effects = new CpuEffects();
  private readonly acc = surface();
  private readonly out = surface();
  private readonly grainScratch = surface();
  private grainTile: OffscreenCanvas | null = null;

  beginAccumulation(width: number, height: number): void {
    reset(this.acc, width, height);
  }

  accumulate(frame: OffscreenCanvas, weight: number): void {
    // Premultiplied colors add up, so transparent areas average correctly.
    const { ctx } = this.acc;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = weight;
    ctx.drawImage(frame, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  resolve(finish: FinishOptions | null): EffectImage {
    return finish ? this.finish(this.acc.canvas, finish) : whole(this.acc.canvas);
  }

  finish(frame: OffscreenCanvas, finish: FinishOptions): EffectImage {
    const { width, height } = frame;
    const out = reset(this.out, width, height);
    out.ctx.drawImage(frame, 0, 0);
    if (finish.glow > 0) {
      const blurred = this.effects.blur(frame, 13 * finish.scale);
      out.ctx.globalCompositeOperation = 'screen';
      out.ctx.globalAlpha = 0.3 * finish.glow;
      out.ctx.drawImage(blurred.source, blurred.x, blurred.y, width, height, 0, 0, width, height);
    }
    if (finish.grain > 0) {
      // Noise limited to the frame's coverage, then overlaid (film-like: strongest in midtones).
      const grain = reset(this.grainScratch, width, height);
      const tile = this.tile();
      const rng = rngFor(finish.step, 'grain');
      const pattern = grain.ctx.createPattern(tile, 'repeat');
      if (pattern) {
        const cell = Math.max(1, finish.scale);
        pattern.setTransform(
          new DOMMatrix([
            cell,
            0,
            0,
            cell,
            rng.next() * tile.width * cell,
            rng.next() * tile.height * cell,
          ]),
        );
        grain.ctx.fillStyle = pattern;
        grain.ctx.fillRect(0, 0, width, height);
        grain.ctx.globalCompositeOperation = 'destination-in';
        grain.ctx.drawImage(frame, 0, 0);
        out.ctx.globalCompositeOperation = 'overlay';
        out.ctx.globalAlpha = 0.35 * finish.grain;
        out.ctx.drawImage(grain.canvas, 0, 0);
      }
    }
    out.ctx.globalAlpha = 1;
    out.ctx.globalCompositeOperation = 'source-over';
    return whole(out.canvas);
  }

  /** A 256² tile of seeded gray noise around 50% (overlay leaves 50% gray unchanged). */
  private tile(): OffscreenCanvas {
    if (this.grainTile) return this.grainTile;
    const size = 256;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    const image = ctx.createImageData(size, size);
    const rng = rngFor(24, 'grain-tile');
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 128 + Math.round((rng.next() - 0.5) * 128);
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    this.grainTile = canvas;
    return canvas;
  }
}

/** Uses the GPU compositor while its context lives, the Canvas 2D one otherwise. */
class AdaptiveCompositor implements Compositor {
  private readonly cpu = new CpuCompositor();
  /** Backend of the current accumulation (it must not change mid-frame). */
  private accumulating: Compositor | null = null;

  constructor(private readonly gpu: GpuCompositor) {}

  get kind(): 'gpu' | 'cpu' {
    return this.gpu.usable ? 'gpu' : 'cpu';
  }

  get effects(): Effects {
    return this.gpu.usable ? this.gpu : this.cpu.effects;
  }

  private backend(): Compositor {
    return this.gpu.usable ? this.gpu : this.cpu;
  }

  beginAccumulation(width: number, height: number): void {
    this.accumulating = this.backend();
    this.accumulating.beginAccumulation(width, height);
  }

  accumulate(frame: OffscreenCanvas, weight: number): void {
    (this.accumulating ?? this.backend()).accumulate(frame, weight);
  }

  resolve(finish: FinishOptions | null): EffectImage {
    const backend = this.accumulating ?? this.backend();
    this.accumulating = null;
    return backend.resolve(finish);
  }

  finish(frame: OffscreenCanvas, finish: FinishOptions): EffectImage {
    return this.backend().finish(frame, finish);
  }
}

/** The best compositor for this worker (`gpu: false` forces Canvas 2D, e.g. in tests). */
export function createCompositor(options: { gpu?: boolean } = {}): Compositor {
  const gpu = options.gpu === false ? null : GpuCompositor.create();
  return gpu ? new AdaptiveCompositor(gpu) : new CpuCompositor();
}
