/**
 * Procedural placeholder imagery (docs/templates/00-foundations.md §7): original, generated at
 * runtime, deterministic, zero bandwidth — so templates look finished without stock photos.
 * Each id has a fixed pixel size; objects are cut-outs on a transparent background (their ink
 * is the object), the other sets are full-bleed.
 *
 * Images are drawn with Canvas 2D into an OffscreenCanvas the first time they're used (render
 * and export workers; each takes tens of milliseconds, then it's cached); where there's no
 * OffscreenCanvas (Node), there's no image. The painters are art-directed and seeded
 * (procedural/): scenes are stylized travel photographs, artworks generative posters, objects
 * studio product renders, portraits flat illustrations.
 */

import { ARTWORKS } from './procedural/artworks';
import type { Painter } from './procedural/kit';
import { OBJECTS } from './procedural/objects';
import { PORTRAITS } from './procedural/portraits';
import { SCENES } from './procedural/scenes';
import type { RasterGraphic } from './types';

export type ProceduralSet = 'scene' | 'artwork' | 'object' | 'portrait';

type Spec = {
  readonly set: ProceduralSet;
  readonly name: string;
  readonly w: number;
  readonly h: number;
};

const scene = (name: string): Spec => ({ set: 'scene', name, w: 1600, h: 1067 });
const artwork = (name: string): Spec => ({ set: 'artwork', name, w: 1200, h: 1500 });
const object = (name: string): Spec => ({ set: 'object', name, w: 1200, h: 1600 });
const portrait = (name: string): Spec => ({ set: 'portrait', name, w: 800, h: 800 });

export const PROCEDURAL_IMAGES = {
  'scene-coast': scene('Coast'),
  'scene-dunes': scene('Dunes'),
  'scene-alpine': scene('Alpine'),
  'scene-meadow': scene('Meadow'),
  'scene-dusk': scene('Dusk'),
  'scene-night': scene('Night'),
  'artwork-1': artwork('Poster 1'),
  'artwork-2': artwork('Poster 2'),
  'artwork-3': artwork('Poster 3'),
  'artwork-4': artwork('Poster 4'),
  'artwork-5': artwork('Poster 5'),
  'artwork-6': artwork('Poster 6'),
  'artwork-7': artwork('Poster 7'),
  'artwork-8': artwork('Poster 8'),
  'object-bottle': object('Bottle'),
  'object-can': object('Can'),
  'object-speaker': object('Speaker'),
  'object-phone': object('Phone'),
  'object-watch': object('Watch'),
  'portrait-1': portrait('Portrait 1'),
  'portrait-2': portrait('Portrait 2'),
  'portrait-3': portrait('Portrait 3'),
  'portrait-4': portrait('Portrait 4'),
} as const satisfies Record<string, Spec>;

export type ProceduralImageId = keyof typeof PROCEDURAL_IMAGES;

export const isProceduralImage = (id: string): id is ProceduralImageId =>
  Object.hasOwn(PROCEDURAL_IMAGES, id);

/** Ids of one set, in declaration order. */
export const proceduralIds = (set: ProceduralSet): ProceduralImageId[] =>
  (Object.keys(PROCEDURAL_IMAGES) as ProceduralImageId[]).filter(
    (id) => PROCEDURAL_IMAGES[id].set === set,
  );

/** Painters of each set, in declaration order (see procedural/ for how each set is made). */
const PAINTERS: Readonly<Record<ProceduralSet, readonly Painter[]>> = {
  scene: SCENES,
  artwork: ARTWORKS,
  object: OBJECTS,
  portrait: PORTRAITS,
};

/** Paints an image at its full size into a new canvas (not cached). */
function paintImage(id: ProceduralImageId): RasterGraphic | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const spec = PROCEDURAL_IMAGES[id];
  const paint = PAINTERS[spec.set][proceduralIds(spec.set).indexOf(id)];
  const canvas = new OffscreenCanvas(spec.w, spec.h);
  const ctx = canvas.getContext('2d');
  if (!paint || !ctx) return null;
  const ink = paint(ctx, spec.w, spec.h);
  return { kind: 'raster', image: { source: canvas, width: spec.w, height: spec.h }, ink };
}

const cache = new Map<ProceduralImageId, RasterGraphic>();

/** The image of a procedural placeholder id (drawn once, then cached), or null without canvas. */
export function proceduralImage(id: ProceduralImageId): RasterGraphic | null {
  const cached = cache.get(id);
  if (cached) return cached;
  const graphic = paintImage(id);
  if (graphic) cache.set(id, graphic);
  return graphic;
}

const previews = new Map<string, RasterGraphic>();

/**
 * A small copy of a procedural image — its long side at most `maxSide` px, its ink scaled
 * along — for thumbnails such as the editor's placeholder pickers. The image is painted at full
 * size, scaled down in halving steps (sharp and alias-free in every browser) and only the small
 * copy is cached: the full-size canvas is dropped unless `proceduralImage` already holds it, so
 * a picker on the main thread keeps kilobytes, not megabytes.
 */
export function proceduralPreview(id: ProceduralImageId, maxSide: number): RasterGraphic | null {
  const spec = PROCEDURAL_IMAGES[id];
  const side = Math.max(1, Math.round(maxSide));
  const key = `${id}@${side}`;
  const cached = previews.get(key);
  if (cached) return cached;
  const full = cache.get(id) ?? paintImage(id);
  if (!full) return null;
  const k = Math.min(1, side / Math.max(spec.w, spec.h));
  const w = Math.max(1, Math.round(spec.w * k));
  const h = Math.max(1, Math.round(spec.h * k));
  let source: CanvasImageSource = full.image.source;
  let sw = spec.w;
  let sh = spec.h;
  while (sw / 2 >= w && sh / 2 >= h) {
    const half = new OffscreenCanvas(Math.ceil(sw / 2), Math.ceil(sh / 2));
    const hctx = half.getContext('2d');
    if (!hctx) break;
    // At exactly half size, bilinear sampling averages 2 × 2 pixels: a clean box filter.
    hctx.imageSmoothingQuality = 'low';
    hctx.drawImage(source, 0, 0, sw, sh, 0, 0, half.width, half.height);
    source = half;
    sw = half.width;
    sh = half.height;
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, w, h);
  const sx = w / spec.w;
  const sy = h / spec.h;
  const { ink } = full;
  const graphic: RasterGraphic = {
    kind: 'raster',
    image: { source: canvas, width: w, height: h },
    ink: { x: ink.x * sx, y: ink.y * sy, w: ink.w * sx, h: ink.h * sy },
  };
  previews.set(key, graphic);
  return graphic;
}
