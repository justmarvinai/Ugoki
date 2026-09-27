/**
 * Frame rendering (docs/06-engine.md §2, §9–10; docs/04-motion-language.md §9): one scene render,
 * or motion blur by temporal supersampling — sub-frames across the shutter, averaged by the
 * compositor — followed by the finish (grain, soft glow). Previews, stills and exports all go
 * through here, so a paused preview is exactly what exports.
 */

import type { Compositor, FinishOptions } from '../compositor';
import { type Canvas2D, CanvasDraw } from '../draw/canvas-draw';
import type { EditableRegion } from '../draw/types';
import type { Finish } from '../template/state';
import { type BuiltScene, renderScene } from './scene';

export type FrameRequest = {
  /** Seconds. */
  t: number;
  /** Output pixels per design unit. */
  scale: number;
  /** Motion-blur sub-frames (1 = sharp). Frames without motion always render once. */
  samples: number;
  /**
   * Adaptive motion blur: fast motion gets more sub-frames — up to `maxSamples` — until each
   * sub-frame moves at most `maxStep` output pixels, so fast edges smear smoothly instead of in
   * visible steps. Without it, moving frames use exactly `samples`.
   */
  maxSamples?: number;
  maxStep?: number;
  /** Seconds per frame (1 / fps): the shutter stays open for `shutter° / 360` of it. */
  frameDuration: number;
  collectRegions?: boolean;
};

/** Grain changes 24 times a second — film cadence, whatever the export frame rate. */
export const GRAIN_FPS = 24;

export function finishOptions(finish: Finish, t: number, scale: number): FinishOptions | null {
  if (finish === 'clean') return null;
  return {
    grain: finish === 'grain' ? 1 : 0,
    glow: finish === 'glow' ? 1 : 0,
    step: Math.floor(t * GRAIN_FPS + 1e-6),
    scale,
  };
}

type Surface = { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D };

function surface(width: number, height: number, readback = false): Surface {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const ctx = canvas.getContext('2d', { willReadFrequently: readback });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  return { canvas, ctx };
}

/** Short side of the low-resolution probes that measure motion across the shutter. */
const PROBE_SIZE = 160;
/** A probe pixel changed at all (motion, however slow). */
const CHANGED = 2;
/** A probe pixel changed a lot: something passed over it (fades stay below this). */
const SWEPT = 24;

/**
 * How far things move across the shutter, in probe pixels, from two renders at its edges: a
 * moving edge sweeps a band of pixels as wide as its travel along its direction of motion (and
 * as long as the edge across it), so the shorter of the longest row and column runs of swept
 * pixels approximates the displacement. 0 when nothing changed; at least ½ when anything did.
 */
export function displacement(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, h: number) {
  const diff = new Uint8Array(w * h);
  let changed = false;
  for (let i = 0, p = 0; p < diff.length; i += 4, p++) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs((a[i + c] ?? 0) - (b[i + c] ?? 0)));
    if (d > CHANGED) changed = true;
    diff[p] = d > SWEPT ? 1 : 0;
  }
  if (!changed) return 0;
  let rows = 0;
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      run = diff[y * w + x] ? run + 1 : 0;
      if (run > rows) rows = run;
    }
  }
  let columns = 0;
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y < h; y++) {
      run = diff[y * w + x] ? run + 1 : 0;
      if (run > columns) columns = run;
    }
  }
  return Math.max(0.5, Math.min(rows, columns));
}

export class FrameRenderer {
  private readonly drawer = new CanvasDraw();
  private readonly probeDrawer = new CanvasDraw();
  private scratch: Surface | null = null;
  private probes: [Surface, Surface] | null = null;
  private used = 1;

  constructor(private readonly compositor: Compositor) {}

  /** Sub-frames the last frame used (diagnostics: the Lab, tests). */
  get samples(): number {
    return this.used;
  }

  /** Renders a frame of `built` into `ctx` (which covers the whole output). */
  render(built: BuiltScene, ctx: Canvas2D, request: FrameRequest): EditableRegion[] {
    const { canvas } = ctx;
    const { width, height } = canvas;
    const finish = finishOptions(built.state.finish, request.t, request.scale);
    const shutterAngle = built.template.shutter ?? built.timeline.energy.shutter;
    const shutter = (shutterAngle / 360) * request.frameDuration;
    const effects = this.compositor.effects;
    let samples = Math.max(1, Math.round(request.samples));
    if (samples > 1) samples = this.adapt(built, request, shutter, samples);
    this.used = samples;

    if (samples === 1) {
      const regions = renderScene(built, this.drawer, {
        ctx,
        scale: request.scale,
        t: request.t,
        collectRegions: request.collectRegions,
        effects,
      });
      if (finish && canvas instanceof OffscreenCanvas) {
        this.put(ctx, this.compositor.finish(canvas, finish));
      }
      return regions;
    }

    const scratch = this.scratchSurface(width, height);
    this.compositor.beginAccumulation(width, height);
    const middle = Math.floor(samples / 2);
    let regions: EditableRegion[] = [];
    for (let i = 0; i < samples; i++) {
      // Sub-frames centered on t (After Effects' default shutter phase).
      const t = request.t + ((i + 0.5) / samples - 0.5) * shutter;
      const collected = renderScene(built, this.drawer, {
        ctx: scratch.ctx,
        scale: request.scale,
        t,
        collectRegions: request.collectRegions === true && i === middle,
        effects,
      });
      if (i === middle) regions = collected;
      this.compositor.accumulate(scratch.canvas, 1 / samples);
    }
    this.put(ctx, this.compositor.resolve(finish));
    return regions;
  }

  /**
   * Sub-frames for this frame: 1 when nothing moves across the shutter (one render is exact),
   * `samples` for motion, more for fast motion when the request allows it.
   */
  private adapt(built: BuiltScene, request: FrameRequest, shutter: number, samples: number) {
    if (shutter <= 0) return 1;
    const { frame } = built;
    const probeScale = PROBE_SIZE / Math.min(frame.width, frame.height);
    const w = Math.max(1, Math.round(frame.width * probeScale));
    const h = Math.max(1, Math.round(frame.height * probeScale));
    if (!this.probes || this.probes[0].canvas.width !== w || this.probes[0].canvas.height !== h) {
      this.probes = [surface(w, h, true), surface(w, h, true)];
    }
    const [a, b] = this.probes;
    const effects = this.compositor.effects;
    const { t } = request;
    const scale = probeScale;
    renderScene(built, this.probeDrawer, { ctx: a.ctx, scale, t: t - shutter / 2, effects });
    renderScene(built, this.probeDrawer, { ctx: b.ctx, scale, t: t + shutter / 2, effects });
    const moved = displacement(
      a.ctx.getImageData(0, 0, w, h).data,
      b.ctx.getImageData(0, 0, w, h).data,
      w,
      h,
    );
    if (moved === 0) return 1;
    const { maxSamples, maxStep } = request;
    if (maxSamples === undefined || maxStep === undefined || maxSamples <= samples) return samples;
    // Probe pixels → output pixels travelled while the shutter is open.
    const travel = (moved / probeScale) * request.scale;
    return Math.min(maxSamples, Math.max(samples, Math.ceil(travel / maxStep)));
  }

  private scratchSurface(width: number, height: number): Surface {
    const s = this.scratch;
    if (s && s.canvas.width === width && s.canvas.height === height) return s;
    if (s) {
      s.canvas.width = width;
      s.canvas.height = height;
      return s;
    }
    this.scratch = surface(width, height);
    return this.scratch;
  }

  /** Replaces the output with a compositor result. */
  private put(
    ctx: Canvas2D,
    image: { source: CanvasImageSource; x: number; y: number; width: number; height: number },
  ): void {
    const { width, height } = ctx.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image.source, image.x, image.y, image.width, image.height, 0, 0, width, height);
  }
}
