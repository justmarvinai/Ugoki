/**
 * The logo drawn once in `build` into OffscreenCanvases: its coverage as a small alpha grid
 * (where the shards are cut, and how much ink each carries), and one sprite per shard — the
 * logo clipped to the shard's triangle — so a flying shard costs one image draw per frame
 * instead of a clipped fill of the whole logo. Both return null where OffscreenCanvas is
 * missing (Node): the cut then falls back to the ink box and shards to clipped vector draws.
 *
 * Engine candidates: `rasterizeGraphic(graphic, dest, area, scale, paint)` (Resolve needs the
 * same) and `g.cache` (docs/06-engine.md §13) for sprites like these.
 */

import type { Color, Draw, Graphic, Paint, PathData, RasterGraphic, Rect } from '@/engine';

export type AlphaGrid = {
  /** Design-space origin and output pixels per design unit of the grid. */
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  /** Coverage 0..1 per pixel, row by row. */
  readonly alpha: Float32Array;
};

/** The logo's colors, as `g.graphic` paints them. */
export type LogoPaint = { readonly tint: Color | null; readonly current: Color };

/** A pre-drawn piece: the image and the design-space rect it covers. */
export type Sprite = { readonly image: RasterGraphic['image']; readonly rect: Rect };

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
export function colorOf(value: Color | 'current' | null, paint: LogoPaint): Color | null {
  if (!value) return null;
  return paint.tint ?? (value === 'current' ? paint.current : value);
}

/** Draws a logo fitted into `dest` like `g.graphic` (contain, by ink), in the given colors. */
export function logoDrawer(graphic: Graphic | null, dest: Rect, paint: LogoPaint) {
  if (!graphic) return (_g: Draw) => {};
  if (graphic.kind !== 'vector') {
    const options = { tint: paint.tint, current: paint.current };
    return (g: Draw) => g.graphic(graphic, dest, options);
  }
  const at = placement(graphic, dest);
  if (!at) return (_g: Draw) => {};
  const place = { x: at.x, y: at.y, scale: at.k };
  const layers: { path: PathData; paint: Paint }[] = [];
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

function trace(path: PathData): Path2D {
  const p = new Path2D();
  for (const command of path) {
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

function context(width: number, height: number, read = false) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', read ? { willReadFrequently: true } : undefined);
    return ctx ? { canvas, ctx } : null;
  } catch {
    return null;
  }
}

/**
 * Paints `graphic` fitted into `dest` onto a canvas that shows the design-space `area` at
 * `scale` pixels per unit, clipped to `clip` if given.
 */
function paintGraphic(
  ctx: OffscreenCanvasRenderingContext2D,
  graphic: Graphic,
  dest: Rect,
  area: Rect,
  scale: number,
  paint: LogoPaint,
  clip?: PathData,
): void {
  const at = placement(graphic, dest);
  if (!at) return;
  ctx.setTransform(scale, 0, 0, scale, -scale * area.x, -scale * area.y);
  if (clip) ctx.clip(trace(clip));
  if (graphic.kind === 'vector') {
    ctx.transform(at.k, 0, 0, at.k, at.x, at.y);
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
    ctx.globalAlpha = 1;
    return;
  }
  const { image } = graphic;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.source, at.x, at.y, image.width * at.k, image.height * at.k);
  if (paint.tint) {
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = css(paint.tint, 1);
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Coverage of `graphic` fitted into `dest`, sampled over the design-space `area`. */
export function rasterAlpha(
  graphic: Graphic | null,
  dest: Rect,
  area: Rect,
  scale: number,
): AlphaGrid | null {
  if (!graphic) return null;
  const width = Math.max(1, Math.ceil(area.w * scale));
  const height = Math.max(1, Math.ceil(area.h * scale));
  const surface = context(width, height, true);
  if (!surface) return null;
  const black = { r: 0, g: 0, b: 0, a: 1 };
  paintGraphic(surface.ctx, graphic, dest, area, scale, { tint: black, current: black });
  const data = surface.ctx.getImageData(0, 0, width, height).data;
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = (data[i * 4 + 3] ?? 0) / 255;
  return { x: area.x, y: area.y, scale, width, height, alpha };
}

/** The logo clipped to `path` (a shard), drawn at `scale` pixels per design unit. */
export function sprite(
  graphic: Graphic | null,
  dest: Rect,
  path: PathData,
  scale: number,
  paint: LogoPaint,
): Sprite | null {
  if (!graphic) return null;
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const command of path) {
    if (command[0] === 'Z') continue;
    x0 = Math.min(x0, command[1]);
    y0 = Math.min(y0, command[2]);
    x1 = Math.max(x1, command[1]);
    y1 = Math.max(y1, command[2]);
  }
  if (!(x1 > x0 && y1 > y0)) return null;
  // Whole pixels around the triangle, so the sprite maps back onto the design space exactly.
  const px0 = Math.floor(x0 * scale) - 1;
  const py0 = Math.floor(y0 * scale) - 1;
  const width = Math.ceil(x1 * scale) + 1 - px0;
  const height = Math.ceil(y1 * scale) + 1 - py0;
  const surface = context(width, height);
  if (!surface) return null;
  const rect: Rect = { x: px0 / scale, y: py0 / scale, w: width / scale, h: height / scale };
  paintGraphic(surface.ctx, graphic, dest, rect, scale, paint, path);
  return { image: { source: surface.canvas, width, height }, rect };
}
