/**
 * Contact sheet of the procedural placeholder imagery (`pnpm sheet imagery [set]`): every scene,
 * artwork, object and portrait on a checkerboard (so transparency shows) in
 * `.sheets/imagery.png`, or one set large in `.sheets/imagery-<set>.png`. Objects get their ink
 * rect outlined (magenta: declared, cyan: measured from the pixels); portraits get the circle an
 * avatar crops to. Logs how long each image takes to paint. Not part of CI.
 */

import { inject, test } from 'vitest';
import { commands } from 'vitest/browser';
import {
  PROCEDURAL_IMAGES,
  type ProceduralImageId,
  type ProceduralSet,
  proceduralIds,
  proceduralImage,
  proceduralPreview,
} from '@/engine/assets/procedural';
import { ARTWORKS } from '@/engine/assets/procedural/artworks';
import type { Painter } from '@/engine/assets/procedural/kit';
import { OBJECTS } from '@/engine/assets/procedural/objects';
import { PORTRAITS } from '@/engine/assets/procedural/portraits';
import { SCENES } from '@/engine/assets/procedural/scenes';
import type { RasterGraphic } from '@/engine/assets/types';
import type { Rect } from '@/engine/core/math';

declare module 'vitest' {
  export interface ProvidedContext {
    sheet: string;
    sheetMode: string;
  }
}

const SETS: ProceduralSet[] = ['scene', 'artwork', 'object', 'portrait'];
const GAP = 16;
const HEADER = 24;
const CHECK = 12;

/** Output height of a cell per set: the overview, and one set on its own (larger). */
const OVERVIEW: Record<ProceduralSet, number> = {
  scene: 300,
  artwork: 380,
  object: 380,
  portrait: 260,
};
const LARGE: Record<ProceduralSet, number> = {
  scene: 640,
  artwork: 720,
  object: 760,
  portrait: 420,
};
const PER_ROW: Record<ProceduralSet, number> = { scene: 3, artwork: 4, object: 5, portrait: 4 };

type Painted = { id: ProceduralImageId; graphic: RasterGraphic; ms: number; measured?: Rect };

/** Bounds of the non-transparent pixels (alpha > 0). */
function alphaBounds(graphic: RasterGraphic): Rect | undefined {
  const { width, height, source } = graphic.image;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(source, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? undefined : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function paint(id: ProceduralImageId): Painted {
  const start = performance.now();
  const graphic = proceduralImage(id);
  if (graphic?.kind !== 'raster') throw new Error(`${id}: no image`);
  // Reading one pixel back waits for the canvas to finish drawing.
  const probe = new OffscreenCanvas(1, 1).getContext('2d');
  probe?.drawImage(graphic.image.source, 0, 0, 1, 1, 0, 0, 1, 1);
  probe?.getImageData(0, 0, 1, 1);
  const ms = performance.now() - start;
  const measured = PROCEDURAL_IMAGES[id].set === 'object' ? alphaBounds(graphic) : undefined;
  return { id, graphic, ms, measured };
}

function checkerboard(ctx: OffscreenCanvasRenderingContext2D, r: Rect) {
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#b4b4b4';
  for (let y = 0; y < r.h; y += CHECK) {
    for (let x = (y / CHECK) % 2 ? CHECK : 0; x < r.w; x += 2 * CHECK) {
      ctx.fillRect(r.x + x, r.y + y, Math.min(CHECK, r.w - x), Math.min(CHECK, r.h - y));
    }
  }
}

async function sheet(sets: ProceduralSet[], sizes: Record<ProceduralSet, number>, name: string) {
  const groups = sets.map((set) => ({ set, images: proceduralIds(set).map(paint) }));
  for (const { images } of groups) {
    for (const { id, ms } of images) console.info(`${id}: ${ms.toFixed(1)} ms`);
  }
  // Layout: each set in rows of PER_ROW cells of its own height.
  type Cell = Painted & { rect: Rect };
  const cells: Cell[] = [];
  let y = GAP;
  let width = 0;
  const labels: { text: string; y: number }[] = [];
  for (const { set, images } of groups) {
    labels.push({ text: set, y });
    y += HEADER;
    const cellH = sizes[set];
    for (let i = 0; i < images.length; i += PER_ROW[set]) {
      let x = GAP;
      for (const image of images.slice(i, i + PER_ROW[set])) {
        const spec = PROCEDURAL_IMAGES[image.id];
        const cellW = Math.round((cellH * spec.w) / spec.h);
        cells.push({ ...image, rect: { x, y: y + HEADER, w: cellW, h: cellH } });
        x += cellW + GAP;
      }
      width = Math.max(width, x);
      y += cellH + HEADER + GAP;
    }
  }
  const canvas = new OffscreenCanvas(width, y);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = '#1b1c1e';
  ctx.fillRect(0, 0, width, y);
  ctx.font = '14px sans-serif';
  for (const label of labels) {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText(label.text.toUpperCase(), GAP, label.y + 16);
  }
  for (const cell of cells) {
    const { rect, graphic } = cell;
    const spec = PROCEDURAL_IMAGES[cell.id];
    ctx.fillStyle = '#9a9a9a';
    ctx.fillText(`${cell.id} · ${cell.ms.toFixed(0)} ms`, rect.x, rect.y - 7);
    checkerboard(ctx, rect);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(graphic.image.source, rect.x, rect.y, rect.w, rect.h);
    const k = rect.w / spec.w;
    const outline = (r: Rect, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x + r.x * k + 0.5, rect.y + r.y * k + 0.5, r.w * k - 1, r.h * k - 1);
    };
    if (spec.set === 'object') {
      outline(graphic.ink, 'rgba(255,0,200,0.9)');
      if (cell.measured) outline(cell.measured, 'rgba(0,220,255,0.9)');
      const m = cell.measured;
      const d = graphic.ink;
      if (m) {
        const off = Math.max(
          Math.abs(m.x - d.x),
          Math.abs(m.y - d.y),
          Math.abs(m.x + m.w - d.x - d.w),
          Math.abs(m.y + m.h - d.y - d.h),
        );
        console.info(`${cell.id}: ink ${JSON.stringify(d)} measured ${JSON.stringify(m)} Δ${off}`);
      }
    }
    if (spec.set === 'portrait') {
      ctx.strokeStyle = 'rgba(255,0,200,0.9)';
      ctx.beginPath();
      ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2 - 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  await save(canvas, name);
}

async function save(canvas: OffscreenCanvas, name: string) {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const path = `.sheets/${name}.png`;
  await commands.writeFile(path, btoa(binary), 'base64');
  console.info(`sheet: ${path}`);
}

const id = inject('sheet');
const modes = (inject('sheetMode') || '').split(',');

/** One image at its own size (`pnpm sheet imagery scene-coast`), to judge grain and detail. */
async function actual(image: ProceduralImageId) {
  const { graphic, ms } = paint(image);
  console.info(`${image}: ${ms.toFixed(1)} ms`);
  const { width, height, source } = graphic.image;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  checkerboard(ctx, { x: 0, y: 0, w: width, h: height });
  ctx.drawImage(source, 0, 0);
  await save(canvas, `imagery-${image}`);
}

const PAINTERS: Record<ProceduralSet, readonly Painter[]> = {
  scene: SCENES,
  artwork: ARTWORKS,
  object: OBJECTS,
  portrait: PORTRAITS,
};

/** Median paint time of each image over fresh canvases (`pnpm sheet imagery time`). */
function timing() {
  for (const set of SETS) {
    const painters = PAINTERS[set];
    if (!painters) continue;
    proceduralIds(set).forEach((image, i) => {
      const { w, h } = PROCEDURAL_IMAGES[image];
      const runs: number[] = [];
      for (let run = 0; run < 5; run++) {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D is unavailable');
        const start = performance.now();
        painters[i]!(ctx, w, h);
        const probe = new OffscreenCanvas(1, 1).getContext('2d');
        probe?.drawImage(canvas, 0, 0, 1, 1, 0, 0, 1, 1);
        probe?.getImageData(0, 0, 1, 1);
        runs.push(performance.now() - start);
      }
      runs.sort((a, b) => a - b);
      console.info(`${image}: median ${runs[2]!.toFixed(1)} ms · min ${runs[0]!.toFixed(1)} ms`);
    });
  }
}

/**
 * Silhouette edges of the objects over cobalt and white, 4× (`pnpm sheet imagery edges`): cut-outs
 * must composite without dark or light fringes on any background.
 */
async function edges() {
  const crop = 90;
  const zoom = 4;
  const ids = proceduralIds('object');
  const canvas = new OffscreenCanvas(
    ids.length * (crop * zoom + GAP) + GAP,
    2 * (crop * zoom + GAP) + GAP,
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = '#1b1c1e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ids.forEach((image, i) => {
    const graphic = paint(image).graphic;
    const { ink } = graphic;
    // The left edge at mid-height of the ink.
    const sx = ink.x - crop / 3;
    const sy = ink.y + ink.h / 2 - crop / 2;
    ['#1f38e8', '#ffffff'].forEach((color, row) => {
      const tile = new OffscreenCanvas(crop, crop);
      const t = tile.getContext('2d');
      if (!t) return;
      t.fillStyle = color;
      t.fillRect(0, 0, crop, crop);
      t.drawImage(graphic.image.source, sx, sy, crop, crop, 0, 0, crop, crop);
      const x = GAP + i * (crop * zoom + GAP);
      const y = GAP + row * (crop * zoom + GAP);
      ctx.drawImage(tile, x, y, crop * zoom, crop * zoom);
    });
  });
  await save(canvas, 'imagery-edges');
}

/** Every image as a 240 px preview, at its own size (`pnpm sheet imagery preview`). */
async function previews() {
  const side = 240;
  const all = SETS.flatMap((set) => proceduralIds(set));
  const perRow = 6;
  const cell = side + GAP;
  const canvas = new OffscreenCanvas(
    perRow * cell + GAP,
    Math.ceil(all.length / perRow) * cell + GAP,
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = '#1b1c1e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  all.forEach((image, i) => {
    const start = performance.now();
    const preview = proceduralPreview(image, side);
    if (!preview) throw new Error(`${image}: no preview`);
    const again = proceduralPreview(image, side);
    if (again !== preview) throw new Error(`${image}: preview not cached`);
    const { width, height } = preview.image;
    if (Math.max(width, height) !== side)
      throw new Error(`${image}: preview is ${width}×${height}`);
    console.info(
      `${image} preview ${width}×${height}: ${(performance.now() - start).toFixed(1)} ms`,
    );
    const x = GAP + (i % perRow) * cell;
    const y = GAP + Math.floor(i / perRow) * cell;
    checkerboard(ctx, { x, y, w: width, h: height });
    ctx.drawImage(preview.image.source, x, y);
    if (PROCEDURAL_IMAGES[image].set === 'object') {
      const { ink } = preview;
      ctx.strokeStyle = 'rgba(255,0,200,0.9)';
      ctx.strokeRect(x + ink.x, y + ink.y, ink.w, ink.h);
    }
  });
  await save(canvas, 'imagery-preview');
}

test.runIf(id === 'imagery')('procedural imagery', { timeout: 120_000 }, async () => {
  if (modes.includes('preview')) await previews();
  if (modes.includes('edges')) await edges();
  if (modes.includes('time')) timing();
  const sets = modes.filter((mode): mode is ProceduralSet => SETS.includes(mode as ProceduralSet));
  const ids = modes.filter((mode): mode is ProceduralImageId => mode in PROCEDURAL_IMAGES);
  if (sets.length === 0 && ids.length === 0) await sheet(SETS, OVERVIEW, 'imagery');
  for (const set of sets) await sheet([set], LARGE, `imagery-${set}`);
  for (const image of ids) await actual(image);
});
