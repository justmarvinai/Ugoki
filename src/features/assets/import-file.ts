/**
 * The user's own logos and images (docs/05-architecture.md §10–11): read, checked and decoded
 * on the device, identified by the SHA-256 of their bytes, then handed to the render worker.
 * Nothing is uploaded. SVGs become vector artwork when the engine understands everything they
 * use; otherwise they are sanitized and rasterized (an honest fallback, reported as a note).
 */

import { importSvg, sanitizeSvg, type TransferableGraphic } from '@/engine/host';

export const ACCEPTED_FILES =
  '.svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp';

/** Largest file we read (a 4K PNG with alpha is ~15 MB). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Longest side kept for raster images (and rasterized SVGs). */
const MAX_SIDE = 4096;
const SVG_RASTER_SIDE = 2048;
/** Ink bounds are found on a copy this size, then mapped back. */
const INK_PROBE = 512;

export type ImportedFile = {
  /** SHA-256 of the file's bytes (hex). */
  hash: string;
  name: string;
  asset: TransferableGraphic;
  /** Things the user should know (e.g. "converted to pixels"). */
  notes: string[];
};

export class ImportError extends Error {
  override name = 'ImportError';
}

type Kind = 'svg' | 'png' | 'jpeg' | 'webp';

/** Identifies the format from the file's first bytes (never trusting the name or MIME type). */
function sniff(bytes: Uint8Array): Kind | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'png';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^﻿/, '');
  if (/^\s*</.test(head) && /<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Bounds of the pixels that aren't (almost) transparent, in the bitmap's pixels. */
export function inkBounds(bitmap: ImageBitmap): { x: number; y: number; w: number; h: number } {
  const k = Math.min(1, INK_PROBE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
  const whole = { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  if (!ctx) return whole;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return whole;
  // One probe pixel of margin, so downscaling never trims real ink.
  const left = Math.max(0, (x0 - 1) / k);
  const top = Math.max(0, (y0 - 1) / k);
  const right = Math.min(bitmap.width, (x1 + 2) / k);
  const bottom = Math.min(bitmap.height, (y1 + 2) / k);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

async function decodeRaster(blob: Blob): Promise<ImageBitmap> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new ImportError('This image could not be decoded.');
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_SIDE) return bitmap;
  const k = MAX_SIDE / longest;
  const resized = await createImageBitmap(bitmap, {
    resizeWidth: Math.max(1, Math.round(bitmap.width * k)),
    resizeHeight: Math.max(1, Math.round(bitmap.height * k)),
    resizeQuality: 'high',
  });
  bitmap.close();
  return resized;
}

/** Loads markup into an <img> (sandboxed: no scripts, no external requests). */
async function loadSvgImage(markup: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Rasterizes an SVG the vector importer can't take (after sanitizing it). */
async function rasterizeSvg(source: string): Promise<ImageBitmap> {
  const probe = sanitizeSvg(source);
  if (!probe) throw new ImportError('This SVG could not be read.');
  const natural = await loadSvgImage(probe);
  const aspect =
    natural.naturalWidth > 0 && natural.naturalHeight > 0
      ? natural.naturalWidth / natural.naturalHeight
      : 1;
  const width = Math.round(aspect >= 1 ? SVG_RASTER_SIDE : SVG_RASTER_SIDE * aspect);
  const height = Math.round(aspect >= 1 ? SVG_RASTER_SIDE / aspect : SVG_RASTER_SIDE);
  const sized = sanitizeSvg(source, { width, height });
  if (!sized) throw new ImportError('This SVG could not be read.');
  const image = await loadSvgImage(sized);
  return createImageBitmap(image, { resizeWidth: width, resizeHeight: height });
}

/** Reads a user's file into artwork for an image/logo control or a preview backdrop. */
export async function importFile(file: File): Promise<ImportedFile> {
  if (file.size > MAX_FILE_BYTES) throw new ImportError('Files up to 25 MB, please.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) throw new ImportError('Use an SVG, PNG, JPG or WebP file.');
  const hash = await sha256(bytes);
  const name = file.name;

  if (kind === 'svg') {
    const source = new TextDecoder().decode(bytes);
    const result = importSvg(source);
    if (result.ok) {
      return {
        hash,
        name,
        asset: { kind: 'vector', graphic: result.graphic },
        notes: result.warnings,
      };
    }
    if (result.reason !== 'unsupported') {
      throw new ImportError(
        result.reason === 'empty' ? 'This SVG has nothing to draw.' : 'This SVG could not be read.',
      );
    }
    const bitmap = await rasterizeSvg(source);
    return {
      hash,
      name,
      asset: { kind: 'raster', bitmap, ink: inkBounds(bitmap) },
      notes: [`Converted to pixels (${result.detail}); vector effects use its outline.`],
    };
  }

  const bitmap = await decodeRaster(new Blob([bytes], { type: `image/${kind}` }));
  return { hash, name, asset: { kind: 'raster', bitmap, ink: inkBounds(bitmap) }, notes: [] };
}
