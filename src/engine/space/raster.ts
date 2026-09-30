/**
 * Textures from drawings: content too rich to redraw once per triangle of a plane (an app
 * screen, a page of text) is painted once, in `build`, into an offscreen image with the same
 * Draw API, and the plane maps that image. Deterministic (the same drawing gives the same
 * pixels); where there's no OffscreenCanvas (Node) there's no texture.
 */

import type { RasterGraphic } from '../assets/types';
import { CanvasDraw } from '../draw/canvas-draw';
import type { Draw } from '../draw/types';
import type { FrameSpec } from '../template/formats';

export type RasterizeOptions = {
  /** Size of the drawing in design units (its coordinates run from 0, 0). */
  width: number;
  height: number;
  /** Pixels per design unit (2 keeps a texture crisp up to 4K at its design size). */
  scale: number;
  /** The template's frame: `u` and friends stay the same inside the drawing. */
  frame: FrameSpec;
  draw: (g: Draw) => void;
};

/** Largest texture side in pixels. */
const MAX_SIDE = 4096;

/** Paints `draw` into a new image (transparent where nothing is drawn). */
export function rasterize(options: RasterizeOptions): RasterGraphic | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const { width, height, frame } = options;
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(options.scale, MAX_SIDE / width, MAX_SIDE / height);
  const pw = Math.max(1, Math.round(width * scale));
  const ph = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(pw, ph);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const area = { x: 0, y: 0, w: width, h: height };
  const drawer = new CanvasDraw();
  drawer.begin({
    ctx,
    frame: {
      ...frame,
      width,
      height,
      cx: width / 2,
      cy: height / 2,
      safe: { title: area, action: area, social: area },
    },
    scale: pw / width,
    transparent: true,
  });
  try {
    options.draw(drawer);
  } finally {
    drawer.end();
  }
  return {
    kind: 'raster',
    image: { source: canvas, width: pw, height: ph },
    ink: { x: 0, y: 0, w: pw, h: ph },
  };
}
