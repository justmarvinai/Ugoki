/**
 * Test harness for rendering templates in a real browser (template tests and golden frames).
 * Tests live outside `src/templates/` because templates may only import the public engine API.
 */

import type { Rect } from '@/engine/core/math';
import { CanvasDraw } from '@/engine/draw/canvas-draw';
import type { EditableRegion } from '@/engine/draw/types';
import { type BuiltScene, buildScene, renderScene } from '@/engine/runtime/scene';
import type { AnyTemplate } from '@/engine/template/define';
import { isPairingAvailable, PAIRING_IDS, pairingFonts } from '@/engine/template/pairings';
import type { DesignState } from '@/engine/template/state';
import { createTextEngine, type TextEngineHandle } from '@/engine/text/engine';
import { createFetchLoader } from '@/engine/text/font-source';

let engine: Promise<TextEngineHandle> | null = null;

/** One shared text engine with every built pairing's fonts loaded. */
export function textEngine(): Promise<TextEngineHandle> {
  engine ??= (async () => {
    const text = await createTextEngine({ loadBytes: createFetchLoader() });
    const fonts = PAIRING_IDS.filter(isPairingAvailable).flatMap(pairingFonts);
    await text.load([...new Set(fonts)]);
    return text;
  })();
  return engine;
}

export async function build(template: AnyTemplate, state: DesignState): Promise<BuiltScene> {
  return buildScene(template, state, await textEngine());
}

export type Frame = {
  width: number;
  height: number;
  /** Output pixels per design unit. */
  scale: number;
  data: Uint8ClampedArray;
  regions: EditableRegion[];
  canvas: OffscreenCanvas;
};

/** Renders one frame at `scale` output pixels per design unit. */
export function render(built: BuiltScene, t: number, scale = 0.25): Frame {
  const width = Math.round(built.frame.width * scale);
  const height = Math.round(built.frame.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const regions = renderScene(built, new CanvasDraw(), { ctx, scale, t, collectRegions: true });
  return {
    width,
    height,
    scale,
    data: ctx.getImageData(0, 0, width, height).data,
    regions,
    canvas,
  };
}

export const pixelAt = (frame: Frame, x: number, y: number): number => (y * frame.width + x) * 4;

/** Number of pixels that differ from the frame's top-left pixel (the background). */
export function inkedPixels(frame: Frame): number {
  const { data } = frame;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i] !== data[0] ||
      data[i + 1] !== data[1] ||
      data[i + 2] !== data[2] ||
      data[i + 3] !== data[3]
    ) {
      count++;
    }
  }
  return count;
}

/** Pixels differing from the background outside `rect` (design units), with a 2 px allowance. */
export function inkOutside(frame: Frame, rect: Rect): number {
  const { data, scale } = frame;
  const x0 = Math.floor(rect.x * scale) - 2;
  const y0 = Math.floor(rect.y * scale) - 2;
  const x1 = Math.ceil((rect.x + rect.w) * scale) + 2;
  const y1 = Math.ceil((rect.y + rect.h) * scale) + 2;
  let count = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      const i = pixelAt(frame, x, y);
      if (
        data[i] !== data[0] ||
        data[i + 1] !== data[1] ||
        data[i + 2] !== data[2] ||
        data[i + 3] !== data[3]
      ) {
        count++;
      }
    }
  }
  return count;
}

/** FNV-1a over the pixels — a compact fingerprint for determinism checks. */
export function fingerprint(frame: Frame): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < frame.data.length; i++) {
    hash ^= frame.data[i] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
