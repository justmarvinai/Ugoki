import { describe, expect, it } from 'vitest';
import { placeholderGraphic } from '../assets/placeholders';
import type { Graphic } from '../assets/types';
import type { Effects } from '../compositor/effects';
import { CpuEffects } from '../compositor/effects';
import { GpuCompositor } from '../compositor/gpu';
import { type Color, rgb } from '../core/color';
import { createFrame } from '../template/formats';
import { CanvasDraw } from './canvas-draw';
import type { Draw } from './types';

const RED = rgb(1, 0, 0);
const BLUE = rgb(0, 0, 1);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);
const SCALE = 0.25;

type Frame = { ctx: OffscreenCanvasRenderingContext2D; draw: CanvasDraw };

function render(fn: (g: Draw) => void, frameState?: Frame, effects?: Effects): Frame {
  const frame = createFrame('1:1');
  const state =
    frameState ??
    (() => {
      const canvas = new OffscreenCanvas(frame.width * SCALE, frame.height * SCALE);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('no 2d context');
      return { ctx, draw: new CanvasDraw() };
    })();
  state.draw.begin({ ctx: state.ctx, frame, scale: SCALE, transparent: true, effects });
  fn(state.draw);
  state.draw.end();
  return state;
}

const renderWith = (fn: (g: Draw) => void, effects: Effects) => render(fn, undefined, effects);

const at = (f: Frame, x: number, y: number) => [
  ...f.ctx.getImageData(Math.floor(x * SCALE), Math.floor(y * SCALE), 1, 1).data,
];

const near = (px: number[], c: Color, alpha = 1, tolerance = 3) =>
  Math.abs((px[3] ?? 0) - alpha * 255) <= tolerance &&
  (alpha === 0 ||
    (Math.abs((px[0] ?? 0) - c.r * 255) <= tolerance &&
      Math.abs((px[1] ?? 0) - c.g * 255) <= tolerance &&
      Math.abs((px[2] ?? 0) - c.b * 255) <= tolerance));

describe('isolated layers', () => {
  const overlapping = (g: Draw) => {
    g.rect({ x: 100, y: 100, w: 400, h: 400 }, { fill: RED });
    g.rect({ x: 300, y: 300, w: 400, h: 400 }, { fill: RED });
  };

  it('applies layer opacity to the composite, not per primitive', () => {
    const layered = render((g) => g.layer({ opacity: 0.5 }, overlapping));
    const grouped = render((g) => g.group({ opacity: 0.5 }, overlapping));
    // Where the rects overlap, the isolated layer stays at 50%; per-primitive opacity stacks.
    expect(at(layered, 400, 400)[3]).toBeCloseTo(128, -1);
    expect(at(layered, 200, 200)[3]).toBeCloseTo(128, -1);
    expect(at(grouped, 400, 400)[3]).toBeGreaterThan(180);
  });

  it('keeps drawing state intact after a layer throws', () => {
    const f = render(() => {});
    expect(() =>
      render(
        (g) =>
          g.layer({}, (g) =>
            g.clip({ x: 0, y: 0, w: 10, h: 10 }, () => {
              throw new Error('boom');
            }),
          ),
        f,
      ),
    ).toThrow('boom');
    // The next frame draws on the target again, unclipped.
    render((g) => g.rect({ x: 500, y: 500, w: 200, h: 200 }, { fill: BLUE }), f);
    expect(near(at(f, 600, 600), BLUE)).toBe(true);
  });
});

/** Every effects backend this browser has (WebGL2 where the worker has a GPU context). */
const backends: [string, Effects][] = [
  ['canvas 2d', new CpuEffects()],
  // Safari's path (no Canvas `filter`): box blurs.
  ['canvas 2d · box blur', new CpuEffects({ filter: false })],
];
const gpu = GpuCompositor.create();
if (gpu) backends.push(['webgl2', gpu]);

describe.each(backends)('masks (%s)', (_, effects) => {
  const render = (fn: (g: Draw) => void) => renderWith(fn, effects);
  const content = (g: Draw) => g.rect({ x: 0, y: 0, w: 1080, h: 1080 }, { fill: RED });
  const disk = (g: Draw) => g.circle(540, 540, 200, { fill: WHITE });

  it('shows content only inside an alpha matte, or only outside it when inverted', () => {
    const masked = render((g) => g.mask(disk, content));
    expect(near(at(masked, 540, 540), RED)).toBe(true);
    expect(near(at(masked, 100, 100), RED, 0)).toBe(true);
    const inverted = render((g) => g.mask(disk, content, { invert: true }));
    expect(near(at(inverted, 540, 540), RED, 0)).toBe(true);
    expect(near(at(inverted, 100, 100), RED)).toBe(true);
  });

  it('uses brightness for luma mattes', () => {
    const f = render((g) =>
      g.mask(
        (g) => {
          g.rect({ x: 0, y: 0, w: 540, h: 1080 }, { fill: BLACK });
          g.rect({ x: 540, y: 0, w: 540, h: 1080 }, { fill: WHITE });
        },
        content,
        { mode: 'luma' },
      ),
    );
    expect(near(at(f, 800, 540), RED)).toBe(true);
    expect(near(at(f, 200, 540), RED, 0)).toBe(true);
  });
});

describe.each(backends)('effects (%s)', (_, effects) => {
  const render = (fn: (g: Draw) => void) => renderWith(fn, effects);
  const square = (g: Draw) => g.rect({ x: 440, y: 440, w: 200, h: 200 }, { fill: RED });

  it('blurs by a radius in u', () => {
    const sharp = render(square);
    const blurred = render((g) => g.fx({ blur: 3 }, square));
    // 3u ≈ 32 design units ≈ 8 output px at this scale: light spreads past the edge.
    expect(at(sharp, 425, 540)[3]).toBe(0);
    expect(at(blurred, 425, 540)[3]).toBeGreaterThan(20);
    expect(at(blurred, 540, 540)[3]).toBeGreaterThan(200);
  });

  it('adds a soft shadow below the layer', () => {
    const f = render((g) =>
      g.fx({ shadow: { color: BLACK, blur: 1, opacity: 0.8, y: 4 } }, square),
    );
    expect(near(at(f, 540, 540), RED)).toBe(true);
    // Below the square: shadow (dark, partly opaque).
    const below = at(f, 540, 660);
    expect(below[3]).toBeGreaterThan(40);
    expect(below[0]).toBeLessThan(40);
  });

  it('adds glow around bright content with bloom', () => {
    // Bloom lights up content above its luminance threshold (white here; red wouldn't glow).
    const bright = (g: Draw) => g.rect({ x: 440, y: 440, w: 200, h: 200 }, { fill: WHITE });
    const plain = render((g) => g.fx({}, bright));
    const bloomed = render((g) => g.fx({ bloom: { radius: 3, intensity: 1 } }, bright));
    expect(at(plain, 420, 540)[3]).toBe(0);
    expect(at(bloomed, 420, 540)[3]).toBeGreaterThan(10);
  });
});

describe.each(backends)('bounded layers (%s)', (_, effects) => {
  const render = (fn: (g: Draw) => void) => renderWith(fn, effects);
  const square = (g: Draw) => g.rect({ x: 440, y: 440, w: 200, h: 200 }, { fill: RED });
  const pixels = (f: Frame) => f.ctx.getImageData(0, 0, 270, 270).data;
  /** Largest difference in premultiplied color or alpha (color is meaningless where α ≈ 0). */
  const maxDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
    let max = 0;
    for (let i = 0; i < a.length; i += 4) {
      const aa = a[i + 3] ?? 0;
      const ba = b[i + 3] ?? 0;
      max = Math.max(max, Math.abs(aa - ba));
      for (let c = 0; c < 3; c++) {
        const pa = ((a[i + c] ?? 0) * aa) / 255;
        const pb = ((b[i + c] ?? 0) * ba) / 255;
        max = Math.max(max, Math.abs(pa - pb));
      }
    }
    return max;
  };
  const around = { x: 400, y: 400, w: 280, h: 280 };

  it('renders the same as a frame-sized layer when the content fits', () => {
    for (const options of [{ opacity: 0.5 }, { blur: 3 }, { bloom: { radius: 2, intensity: 1 } }]) {
      const full = pixels(render((g) => g.fx(options, square)));
      const bounded = pixels(render((g) => g.fx({ ...options, bounds: around }, square)));
      // Pyramid blurs aren't exactly shift-invariant: allow a few levels.
      expect(maxDiff(full, bounded)).toBeLessThanOrEqual(6);
    }
    // An L-shaped matte across the square's corner, with pixel-aligned edges so any engine
    // rasterizes it exactly: the comparison checks placement and bounds, pixel for pixel.
    // (Curves can't be compared across layer sizes in WebKit, which rasterizes large canvases on
    // the GPU and small ones on the CPU — they anti-alias differently.)
    const matte = (g: Draw) => {
      g.rect({ x: 400, y: 400, w: 160, h: 80 }, { fill: WHITE });
      g.rect({ x: 400, y: 480, w: 80, h: 120 }, { fill: WHITE });
    };
    const masked = (bounds?: typeof around) => render((g) => g.mask(matte, square, { bounds }));
    const full = masked();
    expect(near(at(full, 460, 460), RED)).toBe(true);
    expect(near(at(full, 460, 590), RED)).toBe(true);
    expect(near(at(full, 540, 540), RED, 0)).toBe(true);
    expect(maxDiff(pixels(full), pixels(masked(around)))).toBe(0);
  });

  it('keeps blur that spreads beyond the bounds (the effect adds its reach)', () => {
    const tight = { x: 440, y: 440, w: 200, h: 200 };
    const f = render((g) => g.fx({ blur: 3, bounds: tight }, square));
    expect(at(f, 425, 540)[3]).toBeGreaterThan(20);
  });

  it('cuts off content outside the bounds', () => {
    const f = render((g) =>
      g.layer({ bounds: { x: 440, y: 440, w: 100, h: 200 } }, (g) => square(g)),
    );
    expect(near(at(f, 480, 540), RED)).toBe(true);
    expect(at(f, 600, 540)[3]).toBe(0);
  });

  it('reads the bounds in the current coordinate space, and nests', () => {
    const f = render((g) =>
      g.group({ x: 200, y: 0, scale: 0.5, originX: 540, originY: 540 }, (g) =>
        g.layer({ bounds: { x: 440, y: 440, w: 200, h: 200 } }, (g) =>
          g.fx({ opacity: 0.5, bounds: { x: 440, y: 440, w: 200, h: 200 } }, square),
        ),
      ),
    );
    // The square, halved around the center and moved right by 200: 490..590 → 690..790.
    expect(at(f, 740, 540)[3]).toBeCloseTo(128, -1);
    expect(at(f, 540, 540)[3]).toBe(0);
  });
});

describe('graphics', () => {
  const nova = placeholderGraphic('nova') as Graphic;

  it('fits vector logos by their ink and paints currentColor or a tint', () => {
    const dest = { x: 140, y: 440, w: 800, h: 200 };
    const plain = render((g) => g.graphic(nova, dest, { current: BLUE }));
    const tinted = render((g) => g.graphic(nova, dest, { tint: RED, current: BLUE }));
    // Contain: the lockup's height fills the 200-unit box; the star's center is solid.
    const inkW = (nova.ink.w / nova.ink.h) * 200;
    const starX = dest.x + (dest.w - inkW) / 2 + 100;
    expect(near(at(plain, starX, 540), BLUE)).toBe(true);
    expect(near(at(tinted, starX, 540), RED)).toBe(true);
    expect(near(at(plain, dest.x + 2, 540), BLUE, 0)).toBe(true);
  });

  it('respects fill rules (ring holes stay empty)', () => {
    const halden = placeholderGraphic('halden') as Graphic;
    const f = render((g) => g.graphic(halden, { x: 0, y: 0, w: 1080, h: 351 }, { by: 'box' }));
    // The mark is the first 100 × 100 box → 351 units tall here: its upper inside is empty.
    const k = 351 / 100;
    expect(at(f, 50 * k, 30 * k)[3]).toBe(0);
    expect(at(f, 50 * k, 3 * k)[3]).toBeGreaterThan(200);
  });

  it('draws and tints raster images through their alpha', async () => {
    const source = new OffscreenCanvas(40, 20);
    const ctx = source.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = 'red';
    ctx.fillRect(20, 0, 20, 20);
    const bitmap = await createImageBitmap(source);
    const image: Graphic = {
      kind: 'raster',
      image: { source: bitmap, width: 40, height: 20 },
      ink: { x: 20, y: 0, w: 20, h: 20 },
    };
    const dest = { x: 340, y: 340, w: 400, h: 400 };
    const plain = render((g) => g.graphic(image, dest));
    const tinted = render((g) => g.graphic(image, dest, { tint: BLUE }));
    // Fitted by ink: the opaque half fills the square box.
    // (Edges are smoothly upscaled 20×, so sample inside them.)
    expect(near(at(plain, 540, 540), RED)).toBe(true);
    expect(near(at(plain, 400, 400), RED)).toBe(true);
    expect(near(at(tinted, 540, 540), BLUE)).toBe(true);
    expect(near(at(tinted, 300, 540), BLUE, 0)).toBe(true);
  });

  it('crops to the box with cover', () => {
    const f = render((g) => g.graphic(nova, { x: 440, y: 440, w: 200, h: 200 }, { fit: 'cover' }));
    expect(at(f, 430, 540)[3]).toBe(0);
    expect(at(f, 650, 540)[3]).toBe(0);
  });
});
