/**
 * Procedural placeholder imagery (docs/templates/00-foundations.md §7): original, generated at
 * runtime, deterministic, zero bandwidth — so templates look finished without stock photos.
 * Each id has a fixed pixel size; objects are cut-outs on a transparent background (their ink
 * is the object), the other sets are full-bleed.
 *
 * Images are drawn with Canvas 2D into an OffscreenCanvas the first time they're used (render
 * and export workers); where there's no OffscreenCanvas (Node), there's no image.
 */

import type { Rect } from '../core/math';
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

type Canvas2D = OffscreenCanvasRenderingContext2D;

/** Draws one image into `ctx` (w × h) and returns its ink (the object, for cut-outs). */
type Painter = (ctx: Canvas2D, w: number, h: number) => Rect;

const full = (w: number, h: number): Rect => ({ x: 0, y: 0, w, h });

// Stand-ins until the art-directed generators land: gradients and simple shapes of the right
// kind and proportions, so layouts can be built against them.
const painters: Record<ProceduralSet, (index: number) => Painter> = {
  scene: (index) => (ctx, w, h) => {
    const skies = ['#9fd3f0', '#f3c58b', '#b9d8f5', '#bfe3c4', '#f59a6b', '#1c2a4a'];
    const grounds = ['#2f6f8f', '#d9a25f', '#5b6f86', '#5f8f4f', '#6b3f5f', '#0d1426'];
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, skies[index % skies.length]!);
    sky.addColorStop(1, '#ffffff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.38, h * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = grounds[index % grounds.length]!;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.quadraticCurveTo(w * 0.35, h * 0.55, w * 0.62, h * 0.7);
    ctx.quadraticCurveTo(w * 0.85, h * 0.8, w, h * 0.66);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
    return full(w, h);
  },
  artwork: (index) => (ctx, w, h) => {
    const colors = [
      '#f2e8d5',
      '#1d3fbb',
      '#e8452c',
      '#f5c400',
      '#101820',
      '#2f8f6f',
      '#f28ab2',
      '#7a5cff',
    ];
    ctx.fillStyle = colors[index % colors.length]!;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = colors[(index + 3) % colors.length]!;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.42, w * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors[(index + 5) % colors.length]!;
    ctx.fillRect(w * 0.12, h * 0.7, w * 0.76, h * 0.12);
    return full(w, h);
  },
  object: (index) => (ctx, w, h) => {
    const colors = ['#2b6cf2', '#e8452c', '#1f1f24', '#d8d8dc', '#b08d57'];
    const shapes: Rect[] = [
      { x: w * 0.36, y: h * 0.08, w: w * 0.28, h: h * 0.84 },
      { x: w * 0.3, y: h * 0.22, w: w * 0.4, h: h * 0.62 },
      { x: w * 0.22, y: h * 0.2, w: w * 0.56, h: h * 0.66 },
      { x: w * 0.3, y: h * 0.12, w: w * 0.4, h: h * 0.76 },
      { x: w * 0.3, y: h * 0.25, w: w * 0.4, h: h * 0.5 },
    ];
    const r = shapes[index % shapes.length]!;
    const body = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    body.addColorStop(0, colors[index % colors.length]!);
    body.addColorStop(0.35, '#ffffff');
    body.addColorStop(0.5, colors[index % colors.length]!);
    body.addColorStop(1, '#000000');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, r.w * 0.2);
    ctx.fill();
    return r;
  },
  portrait: (index) => (ctx, w, h) => {
    const colors = ['#f2c14e', '#7fb8e6', '#f28ab2', '#8fd19e'];
    ctx.fillStyle = colors[index % colors.length]!;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.42, w * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 1.02, w * 0.36, h * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    return full(w, h);
  },
};

const cache = new Map<ProceduralImageId, RasterGraphic>();

/** The image of a procedural placeholder id (drawn once, then cached), or null without canvas. */
export function proceduralImage(id: ProceduralImageId): RasterGraphic | null {
  const cached = cache.get(id);
  if (cached) return cached;
  if (typeof OffscreenCanvas === 'undefined') return null;
  const spec = PROCEDURAL_IMAGES[id];
  const canvas = new OffscreenCanvas(spec.w, spec.h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const index = proceduralIds(spec.set).indexOf(id);
  const ink = painters[spec.set](index)(ctx, spec.w, spec.h);
  const graphic: RasterGraphic = {
    kind: 'raster',
    image: { source: canvas, width: spec.w, height: spec.h },
    ink,
  };
  cache.set(id, graphic);
  return graphic;
}
