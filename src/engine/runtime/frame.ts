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

/** Short side of the low-resolution probes that detect frames without motion. */
const PROBE_SIZE = 48;

export class FrameRenderer {
  private readonly drawer = new CanvasDraw();
  private readonly probeDrawer = new CanvasDraw();
  private scratch: Surface | null = null;
  private probes: [Surface, Surface] | null = null;

  constructor(private readonly compositor: Compositor) {}

  /** Renders a frame of `built` into `ctx` (which covers the whole output). */
  render(built: BuiltScene, ctx: Canvas2D, request: FrameRequest): EditableRegion[] {
    const { canvas } = ctx;
    const { width, height } = canvas;
    const finish = finishOptions(built.state.finish, request.t, request.scale);
    const shutterAngle = built.template.shutter ?? built.timeline.energy.shutter;
    const shutter = (shutterAngle / 360) * request.frameDuration;
    const effects = this.compositor.effects;
    let samples = Math.max(1, Math.round(request.samples));
    if (samples > 1 && (shutter <= 0 || this.isStatic(built, request.t, shutter))) samples = 1;

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

  /** Nothing moves across the shutter (compared on tiny renders): one sample is exact. */
  private isStatic(built: BuiltScene, t: number, shutter: number): boolean {
    const { frame } = built;
    const scale = PROBE_SIZE / Math.min(frame.width, frame.height);
    const w = Math.max(1, Math.round(frame.width * scale));
    const h = Math.max(1, Math.round(frame.height * scale));
    if (!this.probes || this.probes[0].canvas.width !== w || this.probes[0].canvas.height !== h) {
      this.probes = [surface(w, h, true), surface(w, h, true)];
    }
    const [a, b] = this.probes;
    const effects = this.compositor.effects;
    renderScene(built, this.probeDrawer, { ctx: a.ctx, scale, t: t - shutter / 2, effects });
    renderScene(built, this.probeDrawer, { ctx: b.ctx, scale, t: t + shutter / 2, effects });
    const da = a.ctx.getImageData(0, 0, w, h).data;
    const db = b.ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < da.length; i++) {
      if (Math.abs((da[i] ?? 0) - (db[i] ?? 0)) > 2) return false;
    }
    return true;
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
