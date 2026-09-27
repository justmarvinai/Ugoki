import { describe, expect, it } from 'vitest';
import { type Compositor, createCompositor } from '../compositor';
import { GpuCompositor } from '../compositor/gpu';
import { rgb } from '../core/color';
import { CanvasDraw } from '../draw/canvas-draw';
import type { Draw } from '../draw/types';
import { defineTemplate } from '../template/define';
import { initialState } from '../template/state';
import type { TextEngine } from '../text/types';
import { FrameRenderer } from './frame';
import { buildScene } from './scene';

/** A midtone: overlay grain (Canvas 2D) leaves pure 0/1 channels alone, as film grain does. */
const TERRACOTTA = rgb(0.8, 0.45, 0.3);
const SCALE = 0.25; // 1:1 → 270 × 270 px

/** A red bar sliding across the frame during 0..1 s, at rest afterwards. */
const slider = defineTemplate({
  id: 'slider',
  version: 1,
  meta: { name: 'Slider', tagline: '', category: 'text-titles', tags: [], useCases: [] },
  formats: ['1:1'],
  structure: 'in-hold-out',
  duration: { default: 3, min: 3, max: 3 },
  alpha: 'optional',
  poster: 2,
  palettes: [{ kind: 'library', id: 'paper' }],
  pairings: ['grotesk'],
  controls: {},
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
  ],
  timing: () => ({ in: 1, out: 0 }),
  build: () => ({
    render: ({ t, g }: { t: number; g: Draw }) => {
      const x = 100 + Math.min(1, t) * 700;
      g.rect({ x, y: 440, w: 200, h: 200 }, { fill: TERRACOTTA });
    },
  }),
});

const noText = {} as TextEngine;

function scene(
  options: { finish?: 'clean' | 'grain' | 'glow'; energy?: 'calm' | 'balanced' | 'punchy' } = {},
) {
  const state = {
    ...initialState(slider),
    transparent: true,
    finish: options.finish ?? 'clean',
    energy: options.energy ?? 'punchy',
  };
  return buildScene(slider, state, noText);
}

function renderFrame(
  compositor: Compositor,
  t: number,
  samples: number,
  options: Parameters<typeof scene>[0] = {},
) {
  const canvas = new OffscreenCanvas(270, 270);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  new FrameRenderer(compositor).render(scene(options), ctx, {
    t,
    scale: SCALE,
    samples,
    frameDuration: 1 / 30,
  });
  return ctx.getImageData(0, 0, 270, 270).data;
}

/** Alpha along the bar's horizontal centerline. */
const row = (data: Uint8ClampedArray) =>
  Array.from({ length: 270 }, (_, x) => data[(135 * 270 + x) * 4 + 3] ?? 0);

const partial = (alphas: number[]) => alphas.filter((a) => a > 8 && a < 247).length;

const backends: [string, () => Compositor][] = [
  ['canvas 2d', () => createCompositor({ gpu: false })],
];
if (GpuCompositor.create()) backends.push(['webgl2', () => createCompositor()]);

describe.each(backends)('frame rendering (%s)', (_, make) => {
  it('smears fast motion across the shutter and keeps rest frames sharp', () => {
    const compositor = make();
    const sharp = row(renderFrame(compositor, 0.5, 1));
    const blurred = row(renderFrame(compositor, 0.5, 8));
    expect(partial(sharp)).toBeLessThanOrEqual(2);
    // Punchy (270°) at 700 units/s × 0.25 px/unit: the edges smear over ~4 px each.
    expect(partial(blurred)).toBeGreaterThanOrEqual(4);
    // Same coverage in total: motion blur redistributes, it doesn't add or remove paint.
    const total = (alphas: number[]) => alphas.reduce((sum, a) => sum + a, 0);
    expect(Math.abs(total(blurred) - total(sharp))).toBeLessThan(255 * 1.5);
  });

  it('gives fast motion more sub-frames, within the budget', () => {
    const compositor = make();
    const renderer = new FrameRenderer(compositor);
    const canvas = new OffscreenCanvas(270, 270);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    const request = { scale: SCALE, samples: 2, maxSamples: 12, frameDuration: 1 / 30 };
    // Punchy at 30 fps: the bar travels ~17 design units (~4 px here) while the shutter is open.
    renderer.render(scene(), ctx, { ...request, t: 0.5, maxStep: 0.5 });
    const fine = renderer.samples;
    renderer.render(scene(), ctx, { ...request, t: 0.5, maxStep: 2 });
    const coarse = renderer.samples;
    expect(fine).toBeGreaterThan(coarse);
    expect(fine).toBeLessThanOrEqual(12);
    expect(coarse).toBeGreaterThanOrEqual(2);
    renderer.render(scene(), ctx, { ...request, t: 2, maxStep: 0.5 });
    expect(renderer.samples).toBe(1);
    renderer.render(scene(), ctx, { ...request, t: 0.5, maxStep: 0.5, maxSamples: undefined });
    expect(renderer.samples).toBe(2);
  });

  it('renders static frames once, identical to a single sample', () => {
    const compositor = make();
    expect(renderFrame(compositor, 2, 8)).toEqual(renderFrame(compositor, 2, 1));
  });

  it('is deterministic', () => {
    const compositor = make();
    expect(renderFrame(compositor, 0.5, 8)).toEqual(renderFrame(compositor, 0.5, 8));
    expect(renderFrame(compositor, 2, 1, { finish: 'grain' })).toEqual(
      renderFrame(compositor, 2, 1, { finish: 'grain' }),
    );
  });

  it('adds grain only where there is paint, changing on film cadence', () => {
    const compositor = make();
    const clean = renderFrame(compositor, 2, 1);
    const grain = renderFrame(compositor, 2, 1, { finish: 'grain' });
    const next = renderFrame(compositor, 2 + 1 / 24, 1, { finish: 'grain' });
    let changed = 0;
    let leaked = 0;
    for (let i = 0; i < clean.length; i += 4) {
      if ((clean[i + 3] ?? 0) === 0 && (grain[i + 3] ?? 0) > 0) leaked++;
      if (Math.abs((clean[i] ?? 0) - (grain[i] ?? 0)) > 0) changed++;
    }
    expect(leaked).toBe(0);
    expect(changed).toBeGreaterThan(100);
    expect(next).not.toEqual(grain);
  });
});

describe('compositor effects parity', () => {
  it('blurs about as much on the GPU as on Canvas 2D', () => {
    const gpu = GpuCompositor.create();
    if (!gpu) return; // Workers without WebGL2 use the Canvas 2D path tested elsewhere.
    const layer = new OffscreenCanvas(200, 200);
    const ctx = layer.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = 'red';
    ctx.fillRect(80, 80, 40, 40);
    const readAlpha = (image: ReturnType<GpuCompositor['blur']>) => {
      const out = new OffscreenCanvas(200, 200);
      const octx = out.getContext('2d', { willReadFrequently: true });
      if (!octx) throw new Error('no 2d context');
      octx.drawImage(image.source, image.x, image.y, 200, 200, 0, 0, 200, 200);
      return Array.from({ length: 200 }, (_, x) => octx.getImageData(x, 100, 1, 1).data[3] ?? 0);
    };
    const cpu = createCompositor({ gpu: false });
    const a = readAlpha(gpu.blur(layer, 8));
    const b = readAlpha(cpu.effects.blur(layer, 8));
    // Same spread (alpha > 5% reaches about as far), same peak within a few percent.
    const reach = (alphas: number[]) => alphas.findIndex((v) => v > 13);
    expect(Math.abs(reach(a) - reach(b))).toBeLessThanOrEqual(4);
    expect(Math.abs((a[100] ?? 0) - (b[100] ?? 0))).toBeLessThan(30);
  });

  it('blurs by the same amount, in the same place, whatever the layer size', () => {
    const gpu = GpuCompositor.create();
    if (!gpu) return;
    /** Centroid and spread (standard deviation) of the alpha along x and y. */
    const moments = (w: number, h: number, sigma: number) => {
      const layer = new OffscreenCanvas(w, h);
      const ctx = layer.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = 'white';
      ctx.fillRect(100, 40, 21, 17);
      const image = gpu.blur(layer, sigma);
      const out = new OffscreenCanvas(w, h);
      const octx = out.getContext('2d', { willReadFrequently: true });
      if (!octx) throw new Error('no 2d context');
      octx.drawImage(image.source, image.x, image.y, w, h, 0, 0, w, h);
      const data = octx.getImageData(0, 0, w, h).data;
      let sum = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let syy = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = data[(y * w + x) * 4 + 3] ?? 0;
          sum += a;
          sx += a * (x + 0.5);
          sy += a * (y + 0.5);
          sxx += a * (x + 0.5) ** 2;
          syy += a * (y + 0.5) ** 2;
        }
      }
      const cx = sx / sum;
      const cy = sy / sum;
      return { cx, cy, dx: Math.sqrt(sxx / sum - cx * cx), dy: Math.sqrt(syy / sum - cy * cy) };
    };
    for (const sigma of [6, 9, 14]) {
      const reference = moments(256, 128, sigma);
      for (const [w, h] of [
        [271, 139],
        [333, 97],
        [201, 203],
      ] as const) {
        const m = moments(w, h, sigma);
        // The square's center is (110.5, 48.5) in every layer; the spread is the blur's.
        // (Pyramid levels of odd sizes once skipped part of their averaging: up to 2% off.)
        expect(Math.abs(m.cx - 110.5)).toBeLessThan(0.2);
        expect(Math.abs(m.cy - 48.5)).toBeLessThan(0.2);
        expect(Math.abs(m.dx / reference.dx - 1)).toBeLessThan(0.015);
        expect(Math.abs(m.dy / reference.dy - 1)).toBeLessThan(0.015);
      }
    }
  });

  it('keeps drawing with Canvas 2D effects when asked', () => {
    const draw = new CanvasDraw();
    expect(draw).toBeDefined();
    expect(createCompositor({ gpu: false }).kind).toBe('cpu');
  });
});
