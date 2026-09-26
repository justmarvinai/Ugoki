import { beforeAll, describe, expect, it } from 'vitest';
import { type Color, rgb } from '../core/color';
import { createFrame, type FormatId } from '../template/formats';
import { createTextEngine, type TextEngineHandle } from '../text/engine';
import { createFetchLoader } from '../text/font-source';
import { CanvasDraw, type DrawTarget } from './canvas-draw';
import type { Draw } from './types';

const RED = rgb(1, 0, 0);
const BLUE = rgb(0, 0, 1);

type Harness = { g: Draw; ctx: OffscreenCanvasRenderingContext2D; draw: CanvasDraw };

/** Renders with `fn` into an OffscreenCanvas at `scale` output pixels per design unit. */
function render(
  fn: (g: Draw) => void,
  options: Partial<Omit<DrawTarget, 'ctx' | 'frame'>> & { format?: FormatId } = {},
): Harness & { regions: ReturnType<CanvasDraw['end']> } {
  const frame = createFrame(options.format ?? '1:1');
  const scale = options.scale ?? 0.25;
  const canvas = new OffscreenCanvas(
    Math.round(frame.width * scale),
    Math.round(frame.height * scale),
  );
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  const draw = new CanvasDraw();
  draw.begin({ transparent: false, ...options, ctx, frame, scale });
  fn(draw);
  const regions = draw.end();
  return { g: draw, ctx, draw, regions };
}

/** RGBA of the output pixel covering design point (x, y). */
function at(h: Harness, x: number, y: number, scale = 0.25): number[] {
  return [...h.ctx.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data];
}

const isColor = (px: number[], c: Color, alpha = 1) =>
  Math.abs((px[0] ?? 0) - c.r * 255) <= 2 &&
  Math.abs((px[1] ?? 0) - c.g * 255) <= 2 &&
  Math.abs((px[2] ?? 0) - c.b * 255) <= 2 &&
  Math.abs((px[3] ?? 0) - alpha * 255) <= 2;

const isEmpty = (px: number[]) => px[3] === 0;

describe('CanvasDraw — shapes and transforms', () => {
  it('maps design units to output pixels', () => {
    const h = render((g) => g.rect({ x: 100, y: 100, w: 200, h: 200 }, { fill: RED }));
    expect(isColor(at(h, 200, 200), RED)).toBe(true);
    expect(isEmpty(at(h, 40, 40))).toBe(true);
    expect(isEmpty(at(h, 320, 200))).toBe(true);
    expect(h.g.pixel).toBe(4);
  });

  it('skips the background fill when transparent', () => {
    const opaque = render((g) => g.fill(BLUE, { background: true }));
    expect(isColor(at(opaque, 10, 10), BLUE)).toBe(true);
    const transparent = render((g) => g.fill(BLUE, { background: true }), { transparent: true });
    expect(isEmpty(at(transparent, 10, 10))).toBe(true);
  });

  it('rotates around the origin and translates groups', () => {
    const h = render((g) =>
      g.group({ x: 540, y: 540, rotate: 90 }, (g) =>
        g.rect({ x: 0, y: -20, w: 300, h: 40 }, { fill: RED }),
      ),
    );
    // The bar now points down from the center.
    expect(isColor(at(h, 540, 760), RED)).toBe(true);
    expect(isEmpty(at(h, 760, 540))).toBe(true);
  });

  it('scales around a pivot and nests transforms', () => {
    const h = render((g) =>
      g.group({ scale: 2, originX: 540, originY: 540 }, (g) =>
        g.group({ x: 100 }, (g) => g.rect({ x: 500, y: 500, w: 80, h: 80 }, { fill: RED })),
      ),
    );
    // Rect spans x 600..680, y 500..580 locally → x 660..820, y 460..620 after ×2 around 540.
    expect(isColor(at(h, 740, 540), RED)).toBe(true);
    expect(isEmpty(at(h, 640, 540))).toBe(true);
    expect(isEmpty(at(h, 740, 700))).toBe(true);
  });

  it('multiplies group and paint opacity', () => {
    const h = render((g) =>
      g.group({ opacity: 0.5 }, (g) =>
        g.rect({ x: 0, y: 0, w: 1080, h: 1080 }, { fill: RED, opacity: 0.5 }),
      ),
    );
    const alpha = at(h, 540, 540)[3] ?? 0;
    expect(alpha).toBeGreaterThan(60);
    expect(alpha).toBeLessThan(68);
  });

  it('draws trim paths from the start of the path', () => {
    const h = render((g) => g.line(0, 540, 1080, 540, { color: RED, width: 40, trim: [0, 0.5] }));
    expect(isColor(at(h, 270, 540), RED)).toBe(true);
    expect(isEmpty(at(h, 810, 540))).toBe(true);
    const none = render((g) =>
      g.line(0, 540, 1080, 540, { color: RED, width: 40, trim: [0.4, 0.4] }),
    );
    expect(isEmpty(at(none, 432, 540))).toBe(true);
  });

  it('starts circle trims at 12 o’clock', () => {
    const h = render((g) =>
      g.circle(540, 540, 400, { stroke: { color: RED, width: 40, trim: [0, 0.25] } }),
    );
    expect(isColor(at(h, 540 + 400 * Math.SQRT1_2, 540 - 400 * Math.SQRT1_2), RED)).toBe(true);
    expect(isEmpty(at(h, 540 - 400 * Math.SQRT1_2, 540 - 400 * Math.SQRT1_2))).toBe(true);
  });

  it('clips drawing to a shape', () => {
    const h = render((g) => g.clip({ x: 0, y: 0, w: 540, h: 1080 }, (g) => g.fill(RED)));
    expect(isColor(at(h, 200, 540), RED)).toBe(true);
    expect(isEmpty(at(h, 800, 540))).toBe(true);
  });

  it('fills paths and ignores degenerate input without throwing', () => {
    const h = render((g) => {
      g.path([['M', 100, 100], ['L', 500, 100], ['L', 100, 500], ['Z']], { fill: RED });
      g.circle(540, 540, -5, { fill: RED });
      g.group({ scale: Number.NaN }, (g) =>
        g.rect({ x: 0, y: 0, w: 1080, h: 1080 }, { fill: BLUE }),
      );
    });
    expect(isColor(at(h, 150, 150), RED)).toBe(true);
    expect(isEmpty(at(h, 800, 800))).toBe(true);
  });

  it('interpolates gradients perceptually', () => {
    const h = render((g) =>
      g.rect(
        { x: 0, y: 0, w: 1080, h: 1080 },
        {
          fill: {
            kind: 'linear',
            x0: 0,
            y0: 0,
            x1: 1080,
            y1: 0,
            stops: [
              { offset: 0, color: rgb(0, 0, 1) },
              { offset: 1, color: rgb(1, 1, 0) },
            ],
          },
        },
      ),
    );
    // sRGB mixing of blue → yellow passes through grey (128,128,128); OKLab stays lighter.
    const mid = at(h, 540, 540);
    expect((mid[0] ?? 0) + (mid[1] ?? 0) + (mid[2] ?? 0)).toBeGreaterThan(3 * 140);
  });
});

describe('CanvasDraw — editor regions', () => {
  it('applies layout offsets to movable groups and reports their bounds', () => {
    const bounds = { x: 100, y: 100, w: 200, h: 100 };
    const h = render(
      (g) =>
        g.movable('logo', bounds, (g) => {
          g.rect(bounds, { fill: RED });
          g.editable('headline', { x: 120, y: 120, w: 50, h: 50 });
        }),
      { layout: { logo: { x: 10, y: 0, scale: 1 } }, collectRegions: true },
    );
    // Moved right by 10u = 108 design units.
    expect(isColor(at(h, 380, 150), RED)).toBe(true);
    expect(isEmpty(at(h, 110, 150))).toBe(true);
    const movable = h.regions.find((r) => r.kind === 'movable');
    expect(movable?.target).toBe('logo');
    expect(movable?.bounds.x).toBeCloseTo(208);
    expect(movable?.bounds.w).toBeCloseTo(200);
    const editable = h.regions.find((r) => r.kind === 'editable');
    expect(editable?.target).toBe('headline');
    expect(editable?.bounds.x).toBeCloseTo(228);
  });

  it('collects no regions unless asked', () => {
    const h = render((g) => g.editable('headline', { x: 0, y: 0, w: 10, h: 10 }));
    expect(h.regions).toEqual([]);
  });
});

describe('CanvasDraw — text', () => {
  let text: TextEngineHandle;

  beforeAll(async () => {
    text = await createTextEngine({ loadBytes: createFetchLoader() });
    await text.load(['mona-sans']);
  });

  const style = { font: 'mona-sans', size: 400, weight: 800, width: 100 } as const;

  it('draws HarfBuzz outlines where the layout says the ink is', () => {
    const block = text.line('H', style);
    const ink = block.lines[0]!.ink;
    const h = render((g) => g.text(block, { fill: RED, x: 200, y: 300 }));
    // Left stem of the H, just inside the ink box.
    expect(isColor(at(h, 200 + ink.x + 20, 300 + ink.y + ink.h / 2), RED)).toBe(true);
    // Counter between the stems (above the crossbar) is empty.
    expect(isEmpty(at(h, 200 + ink.x + ink.w / 2, 300 + ink.y + ink.h * 0.2))).toBe(true);
    expect(isEmpty(at(h, 200 + ink.x - 30, 300 + ink.y + ink.h / 2))).toBe(true);
  });

  it('renders per-glyph text like static text when the transform is identity', () => {
    const block = text.line('Motion', { ...style, size: 200 });
    const a = render((g) => g.text(block, { fill: RED, x: 60, y: 400 }), { scale: 0.5 });
    const b = render((g) => g.text(block, { fill: RED, x: 60, y: 400, glyph: () => ({}) }), {
      scale: 0.5,
    });
    const da = a.ctx.getImageData(0, 0, 540, 540).data;
    const db = b.ctx.getImageData(0, 0, 540, 540).data;
    let different = 0;
    let inked = 0;
    for (let i = 3; i < da.length; i += 4) {
      if ((da[i] ?? 0) > 0) inked++;
      if (Math.abs((da[i] ?? 0) - (db[i] ?? 0)) > 16) different++;
    }
    expect(inked).toBeGreaterThan(1000);
    expect(different / inked).toBeLessThan(0.01);
  });

  it('moves, hides and recolors individual glyphs', () => {
    const block = text.line('HH', style);
    const line = block.lines[0]!;
    const [first, second] = line.glyphs;
    const h = render((g) =>
      g.text(block, {
        fill: RED,
        x: 100,
        y: 400,
        glyph: (glyph) => (glyph.index === 0 ? { dy: 300, color: BLUE } : null),
      }),
    );
    const stemX = (glyph: typeof first) => 100 + line.x + glyph!.x + glyph!.ink!.x + 20;
    const stemY = (glyph: typeof first) => 400 + line.baseline + glyph!.ink!.y + glyph!.ink!.h / 2;
    expect(isColor(at(h, stemX(first), stemY(first) + 300), BLUE)).toBe(true);
    expect(isEmpty(at(h, stemX(first), stemY(first)))).toBe(true);
    expect(isEmpty(at(h, stemX(second), stemY(second)))).toBe(true);
  });

  it('strokes outline text', () => {
    const block = text.line('H', style);
    const ink = block.lines[0]!.ink;
    const h = render((g) => g.text(block, { outline: { color: RED, width: 20 }, x: 200, y: 300 }));
    // The stem's interior is empty (outline only), its left edge is stroked.
    const midY = 300 + ink.y + ink.h / 2;
    expect(isEmpty(at(h, 200 + ink.x + 40, midY))).toBe(true);
    expect(isColor(at(h, 200 + ink.x + 1, midY), RED)).toBe(true);
  });
});

describe('CanvasDraw — images', () => {
  /** A 200 × 100 image: left half red, right half blue. */
  function halves() {
    const canvas = new OffscreenCanvas(200, 100);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(100, 0, 100, 100);
    return { source: canvas, width: 200, height: 100 };
  }

  it('covers the destination and crops around the focal point', () => {
    const dest = { x: 0, y: 0, w: 400, h: 400 };
    const left = render((g) => g.image(halves(), dest, { focal: { x: 0, y: 0.5 } }));
    expect(isColor(at(left, 380, 200), RED)).toBe(true);
    const right = render((g) => g.image(halves(), dest, { focal: { x: 1, y: 0.5 } }));
    expect(isColor(at(right, 20, 200), BLUE)).toBe(true);
  });

  it('contains the image inside the destination', () => {
    const h = render((g) => g.image(halves(), { x: 0, y: 0, w: 400, h: 400 }, { fit: 'contain' }));
    expect(isColor(at(h, 100, 200), RED)).toBe(true);
    expect(isColor(at(h, 300, 200), BLUE)).toBe(true);
    expect(isEmpty(at(h, 200, 40))).toBe(true);
  });
});
