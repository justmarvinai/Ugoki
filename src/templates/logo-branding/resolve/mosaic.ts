/**
 * The pixel mosaic: the logo drawn once in `build` into a small OffscreenCanvas, then averaged
 * over square blocks for every level — true area averages of premultiplied sRGB, so a block
 * shows exactly what the finished frame holds on average over its square (canvas composites
 * in sRGB too), never a nearest-neighbour sample.
 *
 * Blocks are drawn in batches: one path per color and coverage, so the blocks of one batch
 * share their edges inside a single fill and never show seams between them.
 *
 * Engine candidates: `rasterizeGraphic(graphic, dest, area, scale, paint)` (Shards needs the
 * same) and a mosaic/downsample helper for the compositor's planned pixelate effect.
 */

import {
  type Color,
  type Draw,
  type Paint as DrawPaint,
  type Graphic,
  type PathCommand,
  type PathData,
  type Rect,
  rgb,
} from '@/engine';

export type Block = {
  /** Top-left corner in design units. */
  readonly x: number;
  readonly y: number;
  /** Straight (unpremultiplied) sRGB color and coverage, 0..1. */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
  /** Row in the level's grid (for glitch tears). */
  readonly row: number;
};

export type Level = {
  /** Block size in design units. */
  readonly size: number;
  readonly rows: number;
  /** Blocks with any coverage. */
  readonly blocks: readonly Block[];
};

/** Paint for one batch: a path and its fill. */
export type Batch = { readonly path: PathData; readonly fill: Color };

export type Paint = { tint: Color | null; current: Color };

/** Where `g.graphic` places artwork fitted into `dest` (contain, by ink, centered). */
export function placement(
  graphic: Graphic,
  dest: Rect,
): { x: number; y: number; k: number } | null {
  const box = graphic.ink;
  if (!(box.w > 0 && box.h > 0 && dest.w > 0 && dest.h > 0)) return null;
  const k = Math.min(dest.w / box.w, dest.h / box.h);
  return {
    x: dest.x + (dest.w - box.w * k) * 0.5 - box.x * k,
    y: dest.y + (dest.h - box.h * k) * 0.5 - box.y * k,
    k,
  };
}

/**
 * A shape's paint in the logo's colors: a tint recolors what is painted, and never paints what
 * isn't (`g.graphic`'s tint also fills unfilled shapes and strokes unstroked ones, with the
 * SVG default width — an engine fix to make; until then logos are drawn with `logoDrawer`).
 */
export function colorOf(value: Color | 'current' | null, paint: Paint): Color | null {
  if (!value) return null;
  return paint.tint ?? (value === 'current' ? paint.current : value);
}

/** Draws a logo fitted into `dest` like `g.graphic` (contain, by ink), in the given colors. */
export function logoDrawer(graphic: Graphic | null, dest: Rect, paint: Paint) {
  if (!graphic) return (_g: Draw) => {};
  if (graphic.kind !== 'vector') {
    const options = { tint: paint.tint, current: paint.current };
    return (g: Draw) => g.graphic(graphic, dest, options);
  }
  const at = placement(graphic, dest);
  if (!at) return (_g: Draw) => {};
  const place = { x: at.x, y: at.y, scale: at.k };
  const layers: { path: PathData; paint: DrawPaint }[] = [];
  for (const shape of graphic.shapes) {
    const fill = colorOf(shape.fill, paint);
    if (fill) {
      const opacity = shape.opacity * shape.fillOpacity;
      layers.push({ path: shape.path, paint: { fill, fillRule: shape.fillRule, opacity } });
    }
    const stroke = colorOf(shape.stroke, paint);
    if (stroke && shape.strokeWidth > 0) {
      const line = {
        color: stroke,
        width: shape.strokeWidth,
        cap: shape.lineCap,
        join: shape.lineJoin,
      };
      layers.push({
        path: shape.path,
        paint: { stroke: line, opacity: shape.opacity * shape.strokeOpacity },
      });
    }
  }
  const shapes = (g: Draw) => {
    for (const layer of layers) g.path(layer.path, layer.paint);
  };
  return (g: Draw) => g.group(place, shapes);
}

const css = (c: Color, alpha = c.a) =>
  `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;

function trace(commands: readonly PathCommand[]): Path2D {
  const p = new Path2D();
  for (const command of commands) {
    switch (command[0]) {
      case 'M':
        p.moveTo(command[1], command[2]);
        break;
      case 'L':
        p.lineTo(command[1], command[2]);
        break;
      case 'Q':
        p.quadraticCurveTo(command[1], command[2], command[3], command[4]);
        break;
      case 'C':
        p.bezierCurveTo(command[1], command[2], command[3], command[4], command[5], command[6]);
        break;
      case 'Z':
        p.closePath();
        break;
    }
  }
  return p;
}

/** Draws the logo as `g.graphic` would (same fit and colors) into a fresh canvas. */
function paintLogo(
  graphic: Graphic,
  dest: Rect,
  area: Rect,
  scale: number,
  paint: Paint,
): Uint8ClampedArray | null {
  const at = placement(graphic, dest);
  if (!at || typeof OffscreenCanvas === 'undefined') return null;
  const width = Math.max(1, Math.ceil(area.w * scale));
  const height = Math.max(1, Math.ceil(area.h * scale));
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  try {
    ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  } catch {
    return null;
  }
  if (!ctx) return null;
  if (graphic.kind === 'vector') {
    ctx.setTransform(
      scale * at.k,
      0,
      0,
      scale * at.k,
      scale * (at.x - area.x),
      scale * (at.y - area.y),
    );
    for (const shape of graphic.shapes) {
      const path = trace(shape.path);
      const fill = colorOf(shape.fill, paint);
      if (fill) {
        ctx.globalAlpha = shape.opacity * shape.fillOpacity;
        ctx.fillStyle = css(fill);
        ctx.fill(path, shape.fillRule);
      }
      const stroke = colorOf(shape.stroke, paint);
      if (stroke && shape.strokeWidth > 0) {
        ctx.globalAlpha = shape.opacity * shape.strokeOpacity;
        ctx.strokeStyle = css(stroke);
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineCap = shape.lineCap;
        ctx.lineJoin = shape.lineJoin;
        ctx.stroke(path);
      }
    }
  } else {
    const { image } = graphic;
    ctx.setTransform(scale, 0, 0, scale, -scale * area.x, -scale * area.y);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, at.x, at.y, image.width * at.k, image.height * at.k);
    if (paint.tint) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = css(paint.tint, 1);
      ctx.fillRect(0, 0, width, height);
    }
  }
  return ctx.getImageData(0, 0, width, height).data;
}

/**
 * Mosaic levels of `graphic` fitted into `dest`, one per block size (coarse to fine), each grid
 * centered on the logo. Null where OffscreenCanvas is missing (Node).
 */
export function mosaicLevels(
  graphic: Graphic | null,
  dest: Rect,
  sizes: readonly number[],
  paint: Paint,
): Level[] | null {
  if (!graphic || sizes.length === 0) return null;
  const cx = dest.x + dest.w / 2;
  const cy = dest.y + dest.h / 2;
  const grids = sizes.map((size) => {
    const cols = Math.max(1, Math.ceil(dest.w / size - 1e-6));
    const rows = Math.max(1, Math.ceil(dest.h / size - 1e-6));
    return { size, cols, rows, x: cx - (cols * size) / 2, y: cy - (rows * size) / 2 };
  });
  let x0 = dest.x;
  let y0 = dest.y;
  let x1 = dest.x + dest.w;
  let y1 = dest.y + dest.h;
  for (const grid of grids) {
    x0 = Math.min(x0, grid.x);
    y0 = Math.min(y0, grid.y);
    x1 = Math.max(x1, grid.x + grid.cols * grid.size);
    y1 = Math.max(y1, grid.y + grid.rows * grid.size);
  }
  const area: Rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  // At least eight samples across the finest block, within a modest canvas.
  const finest = Math.min(...sizes);
  const scale = Math.min(2, Math.max(0.5, 8 / finest), 2048 / area.w, 2048 / area.h);
  const data = paintLogo(graphic, dest, area, scale, paint);
  if (!data) return null;
  const width = Math.max(1, Math.ceil(area.w * scale));
  const height = Math.max(1, Math.ceil(area.h * scale));

  return grids.map((grid) => {
    const cells = grid.cols * grid.rows;
    const sum = new Float64Array(cells * 5);
    for (let py = 0; py < height; py++) {
      const row = Math.floor((area.y + (py + 0.5) / scale - grid.y) / grid.size);
      if (row < 0 || row >= grid.rows) continue;
      for (let px = 0; px < width; px++) {
        const col = Math.floor((area.x + (px + 0.5) / scale - grid.x) / grid.size);
        if (col < 0 || col >= grid.cols) continue;
        const i = (py * width + px) * 4;
        const a = (data[i + 3] ?? 0) / 255;
        const k = (row * grid.cols + col) * 5;
        sum[k + 4] = (sum[k + 4] ?? 0) + 1;
        if (a <= 0) continue;
        sum[k] = (sum[k] ?? 0) + ((data[i] ?? 0) / 255) * a;
        sum[k + 1] = (sum[k + 1] ?? 0) + ((data[i + 1] ?? 0) / 255) * a;
        sum[k + 2] = (sum[k + 2] ?? 0) + ((data[i + 2] ?? 0) / 255) * a;
        sum[k + 3] = (sum[k + 3] ?? 0) + a;
      }
    }
    const blocks: Block[] = [];
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const k = (row * grid.cols + col) * 5;
        const count = sum[k + 4] ?? 0;
        const covered = sum[k + 3] ?? 0;
        if (count <= 0 || covered / count < 0.5 / 255) continue;
        blocks.push({
          x: grid.x + col * grid.size,
          y: grid.y + row * grid.size,
          r: (sum[k] ?? 0) / covered,
          g: (sum[k + 1] ?? 0) / covered,
          b: (sum[k + 2] ?? 0) / covered,
          a: Math.min(1, covered / count),
          row,
        });
      }
    }
    return { size: grid.size, rows: grid.rows, blocks };
  });
}

/** Coverage steps a batch key distinguishes (finer than any visible difference). */
const ALPHA_STEPS = 64;
/** Share of a block a full dot covers (its diameter). */
const DOT = 0.9;
/** Circle as four cubics. */
const KAPPA = 0.5522847498;

/**
 * Batches a level for drawing: blocks grouped by color and coverage. `alpha` scales a block's
 * coverage (flicker), `shift` moves it sideways (glitch tears); both by block index.
 */
export function batch(
  level: Level,
  style: 'square' | 'dot',
  options: { alpha?: (i: number) => number; shift?: (i: number) => number } = {},
): Batch[] {
  const groups = new Map<string, { commands: PathCommand[]; fill: Color }>();
  const s = level.size;
  level.blocks.forEach((block, i) => {
    // Strengths above 1 overexpose a block (2 = 2.6× its coverage, up to fully lit).
    const k = options.alpha ? options.alpha(i) : 1;
    const alpha = Math.min(1, k <= 1 ? block.a * k : block.a * (1 + 1.6 * (k - 1)));
    if (alpha < 0.5 / ALPHA_STEPS) return;
    const x = block.x + (options.shift ? options.shift(i) : 0);
    const q = (v: number) => Math.round(v * 63);
    // Squares keep their coverage as opacity; dots show it as area (a halftone).
    const steps = style === 'square' ? Math.round(alpha * ALPHA_STEPS) : ALPHA_STEPS;
    const key = `${q(block.r)},${q(block.g)},${q(block.b)},${steps}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        commands: [],
        fill: rgb(q(block.r) / 63, q(block.g) / 63, q(block.b) / 63, steps / ALPHA_STEPS),
      };
      groups.set(key, group);
    }
    const c = group.commands;
    if (style === 'square') {
      c.push(['M', x, block.y], ['L', x + s, block.y], ['L', x + s, block.y + s]);
      c.push(['L', x, block.y + s], ['Z']);
    } else {
      const r = 0.5 * s * DOT * Math.sqrt(alpha);
      const c1 = r * KAPPA;
      const mx = x + s / 2;
      const my = block.y + s / 2;
      c.push(['M', mx + r, my]);
      c.push(['C', mx + r, my + c1, mx + c1, my + r, mx, my + r]);
      c.push(['C', mx - c1, my + r, mx - r, my + c1, mx - r, my]);
      c.push(['C', mx - r, my - c1, mx - c1, my - r, mx, my - r]);
      c.push(['C', mx + c1, my - r, mx + r, my - c1, mx + r, my]);
      c.push(['Z']);
    }
  });
  return [...groups.values()].map((group) => ({ path: group.commands, fill: group.fill }));
}
