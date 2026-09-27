/**
 * Previews of what image controls show, drawn on the main thread for the inspector: placeholder
 * swatches and the focal-point picker (docs/03-design-system.md §8, Image drop). Placeholders
 * come from the engine (`placeholderGraphic`: the logos and procedural images the render worker
 * draws too); the user's files are read again from their bytes with the import's own checks.
 *
 * A preview is the artwork's ink box — the part templates fit, which the focal point is relative
 * to — scaled down once and cached. They're made one at a time, each in a task of its own.
 */

import { type AssetRef, type Graphic, placeholderGraphic, toCss } from '@/engine/host';
import { readImage } from './import-file';

export type Preview = {
  /** The artwork's ink box, at most `SIDE` px on its long side. */
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  /** A cut-out (transparency around the artwork): shown whole, over a checkerboard. */
  readonly cutout: boolean;
};

/** Long side of a preview (px): sharp in the focal picker on 2× screens. */
const SIDE = 640;
/** What `currentColor` paints in vector artwork: the interface's foreground. */
const CURRENT = '#f5f5f4';

type Rect = { x: number; y: number; w: number; h: number };
type VectorShape = Extract<Graphic, { kind: 'vector' }>['shapes'][number];
type ShapePaint = VectorShape['fill'];

/** The user's files by the SHA-256 of their bytes (content-addressed, so safe to share). */
const files = new Map<string, Blob>();
const ready = new Map<string, Preview | null>();
const pending = new Map<string, Promise<Preview | null>>();

/** Keeps a user's file so its artwork can be previewed (its hash from `importFile`). */
export function keepPreviewFile(hash: string, file: Blob): void {
  files.set(hash, file);
}

/** Names a reference's artwork for `usePreview` (null: nothing to show). */
export function previewSource(ref: AssetRef | null): string | null {
  if (!ref) return null;
  return ref.kind === 'placeholder' ? `placeholder:${ref.id}` : `user:${ref.hash}`;
}

/** The preview if it's already made; undefined while it's being made (or not asked for yet). */
export function peekPreview(source: string | null): Preview | null | undefined {
  if (source === null) return null;
  const made = ready.get(source);
  if (made !== undefined) return made;
  // A user's file this page doesn't have (a draft's file that's gone): nothing to show.
  if (source.startsWith('user:') && !files.has(source.slice(5))) return null;
  return undefined;
}

/** Makes (once) and returns the preview of `source`. */
export function loadPreview(source: string | null): Promise<Preview | null> {
  const known = peekPreview(source);
  if (known !== undefined || source === null) return Promise.resolve(known ?? null);
  let promise = pending.get(source);
  if (!promise) {
    promise = schedule(() => make(source))
      .then(
        (preview) => {
          ready.set(source, preview);
          return preview;
        },
        // Not remembered: asking again tries again.
        () => null,
      )
      .finally(() => pending.delete(source));
    pending.set(source, promise);
  }
  return promise;
}

let queue: Promise<unknown> = Promise.resolve();

/** The next idle moment (soon, at the latest), or the next task where there's no such thing. */
const idle = () =>
  new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 400 });
    } else {
      setTimeout(resolve, 0);
    }
  });

/**
 * Runs `job` after the ones before it, in a task of its own: an art-directed procedural image
 * takes ~100 ms to draw at full size, so a set of them yields to input between images.
 */
function schedule<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(idle).then(job);
  queue = run.catch(() => undefined);
  return run;
}

async function make(source: string): Promise<Preview | null> {
  const colon = source.indexOf(':');
  const kind = source.slice(0, colon);
  const id = source.slice(colon + 1);
  if (kind === 'placeholder') {
    const graphic = placeholderGraphic(id);
    return graphic ? fromGraphic(graphic) : null;
  }
  const file = files.get(id);
  if (!file) return null;
  const { asset } = await readImage(file);
  if (asset.kind === 'vector') return fromGraphic(asset.graphic);
  try {
    return fromRaster(asset.bitmap, asset.ink, asset.bitmap.width, asset.bitmap.height);
  } finally {
    asset.bitmap.close();
  }
}

function fromGraphic(graphic: Graphic): Preview | null {
  if (graphic.kind === 'vector') return fromVector(graphic);
  const { source, width, height } = graphic.image;
  return fromRaster(source, graphic.ink, width, height);
}

/**
 * A 2D canvas for artwork of this size at the preview size: scaled to `SIDE` (vector units have
 * no pixel size), or only down for pixels (`fit: 'down'`).
 */
function canvasFor(w: number, h: number, fit: 'side' | 'down') {
  if (!(w > 0 && h > 0)) return null;
  const k = fit === 'down' ? Math.min(1, SIDE / Math.max(w, h)) : SIDE / Math.max(w, h);
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(w * k)),
    Math.max(1, Math.round(h * k)),
  );
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx, k } : null;
}

function finish(canvas: OffscreenCanvas, cutout: boolean): Preview {
  const { width, height } = canvas;
  return { image: canvas.transferToImageBitmap(), width, height, cutout };
}

function fromRaster(
  source: CanvasImageSource,
  ink: Rect,
  width: number,
  height: number,
): Preview | null {
  const target = canvasFor(ink.w, ink.h, 'down');
  if (!target) return null;
  const { canvas, ctx } = target;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, ink.x, ink.y, ink.w, ink.h, 0, 0, canvas.width, canvas.height);
  return finish(canvas, ink.w < width * 0.98 || ink.h < height * 0.98);
}

function fromVector(graphic: Extract<Graphic, { kind: 'vector' }>): Preview | null {
  const { ink } = graphic;
  const target = canvasFor(ink.w, ink.h, 'side');
  if (!target) return null;
  const { ctx, k } = target;
  ctx.setTransform(k, 0, 0, k, -ink.x * k, -ink.y * k);
  const paint = (value: ShapePaint) =>
    value === 'current' ? CURRENT : value === null ? null : toCss(value);
  for (const shape of graphic.shapes) {
    const path = toPath(shape.path);
    const fill = paint(shape.fill);
    if (fill) {
      ctx.globalAlpha = shape.opacity * shape.fillOpacity;
      ctx.fillStyle = fill;
      ctx.fill(path, shape.fillRule);
    }
    const stroke = paint(shape.stroke);
    if (stroke && shape.strokeWidth > 0) {
      ctx.globalAlpha = shape.opacity * shape.strokeOpacity;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = shape.strokeWidth;
      ctx.lineCap = shape.lineCap;
      ctx.lineJoin = shape.lineJoin;
      ctx.stroke(path);
    }
  }
  return finish(target.canvas, true);
}

function toPath(data: VectorShape['path']): Path2D {
  const path = new Path2D();
  for (const command of data) {
    switch (command[0]) {
      case 'M':
        path.moveTo(command[1], command[2]);
        break;
      case 'L':
        path.lineTo(command[1], command[2]);
        break;
      case 'Q':
        path.quadraticCurveTo(command[1], command[2], command[3], command[4]);
        break;
      case 'C':
        path.bezierCurveTo(command[1], command[2], command[3], command[4], command[5], command[6]);
        break;
      case 'Z':
        path.closePath();
        break;
    }
  }
  return path;
}
