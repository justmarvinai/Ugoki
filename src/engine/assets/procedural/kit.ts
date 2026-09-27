/**
 * Tools shared by the procedural painters: colors, seeded noise, ridge profiles, soft shapes,
 * film grain. Canvas 2D only, and portable to every worker: no `filter` (Safari has none), no
 * `fillText` (system fonts would break determinism) — softness comes from gradients and shadows,
 * variation from seeded streams (never `Math.random`).
 */

import { type Color, mixOklab, parseHex } from '../../core/color';
import { clamp01, type Rect } from '../../core/math';
import { createRng, type Rng } from '../../core/rng';

export type Ctx = OffscreenCanvasRenderingContext2D;

/** Paints one image into `ctx` (w × h) and returns its ink (the object, for cut-outs). */
export type Painter = (ctx: Ctx, w: number, h: number) => Rect;

export const TAU = Math.PI * 2;

export const full = (w: number, h: number): Rect => ({ x: 0, y: 0, w, h });

// --- color --------------------------------------------------------------------------------

export const hex = parseHex;

/** Perceptual mix (OKLab). */
export const mix = (a: Color, b: Color, t: number): Color => mixOklab(a, b, clamp01(t));

const byte = (v: number) => Math.round(clamp01(v) * 255);

/** Canvas color string, with an optional alpha (default: the color's own). */
export function css(c: Color, alpha = c.a): string {
  return `rgba(${byte(c.r)},${byte(c.g)},${byte(c.b)},${Math.round(clamp01(alpha) * 1000) / 1000})`;
}

/** Gradient stop: offset, color, optional alpha. */
export type Stop = readonly [number, Color, number?];

function addStops(gradient: CanvasGradient, stops: readonly Stop[]): CanvasGradient {
  for (const [offset, color, alpha] of stops)
    gradient.addColorStop(clamp01(offset), css(color, alpha));
  return gradient;
}

export function linear(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: readonly Stop[],
): CanvasGradient {
  return addStops(ctx.createLinearGradient(x0, y0, x1, y1), stops);
}

export function radial(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  stops: readonly Stop[],
  inner = 0,
): CanvasGradient {
  return addStops(ctx.createRadialGradient(x, y, inner, x, y, r), stops);
}

// --- noise --------------------------------------------------------------------------------

const smooth = (f: number) => f * f * (3 - 2 * f);

/** Smooth 1D value noise in [-1, 1] (lattice of `size` cells, then it repeats). */
export function noise1(rng: Rng, size = 256): (x: number) => number {
  const v = Float64Array.from({ length: size }, () => rng.next() * 2 - 1);
  return (x) => {
    const i = Math.floor(x);
    const a = v[((i % size) + size) % size]!;
    const b = v[(((i + 1) % size) + size) % size]!;
    return a + (b - a) * smooth(x - i);
  };
}

/** Fractal 1D noise in [-1, 1]: `octaves` layers, each twice the frequency at `gain` × weight. */
export function fbm1(rng: Rng, octaves: number, gain = 0.5): (x: number) => number {
  const layers = Array.from({ length: octaves }, () => noise1(rng));
  let norm = 0;
  for (let i = 0, a = 1; i < octaves; i++, a *= gain) norm += a;
  return (x) => {
    let sum = 0;
    let a = 1;
    let f = 1;
    for (const layer of layers) {
      sum += a * layer(x * f);
      a *= gain;
      f *= 2.03;
    }
    return sum / norm;
  };
}

/** Ridged fractal noise in [0, 1]: sharp crests (mountain skylines). */
export function ridged1(rng: Rng, octaves: number, gain = 0.5): (x: number) => number {
  const layers = Array.from({ length: octaves }, () => noise1(rng));
  let norm = 0;
  for (let i = 0, a = 1; i < octaves; i++, a *= gain) norm += a;
  return (x) => {
    let sum = 0;
    let a = 1;
    let f = 1;
    for (const layer of layers) {
      const r = 1 - Math.abs(layer(x * f));
      sum += a * r * r;
      a *= gain;
      f *= 2.1;
    }
    return sum / norm;
  };
}

/** Smooth 2D value noise in [-1, 1] on a `size` × `size` lattice (repeats beyond it). */
export function noise2(rng: Rng, size = 64): (x: number, y: number) => number {
  const v = Float64Array.from({ length: size * size }, () => rng.next() * 2 - 1);
  const at = (i: number, j: number) =>
    v[(((j % size) + size) % size) * size + (((i % size) + size) % size)]!;
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = smooth(x - i);
    const fy = smooth(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

// --- profiles (skylines, ridges, shorelines) ------------------------------------------------

/** A polyline across the image: x, y pairs, x increasing. */
export type Profile = number[];

/** Samples `y(x)` from `x0` to `x1` every `step` pixels (both ends included). */
export function profile(x0: number, x1: number, step: number, y: (x: number) => number): Profile {
  const out: Profile = [];
  const n = Math.max(1, Math.ceil((x1 - x0) / step));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    out.push(x, y(x));
  }
  return out;
}

/** The area under a profile down to `bottom`, as a path. */
export function below(p: Profile, bottom: number): Path2D {
  const path = new Path2D();
  path.moveTo(p[0]!, bottom);
  for (let i = 0; i < p.length; i += 2) path.lineTo(p[i]!, p[i + 1]!);
  path.lineTo(p[p.length - 2]!, bottom);
  path.closePath();
  return path;
}

/** The y of a profile at x (linear between samples). */
export function heightAt(p: Profile, x: number): number {
  if (x <= p[0]!) return p[1]!;
  for (let i = 2; i < p.length; i += 2) {
    if (p[i]! >= x) {
      const x0 = p[i - 2]!;
      const t = (x - x0) / (p[i]! - x0 || 1);
      return p[i - 1]! + (p[i + 1]! - p[i - 1]!) * t;
    }
  }
  return p[p.length - 1]!;
}

// --- soft shapes and light ------------------------------------------------------------------

/**
 * Fills `path` blurred (σ ≈ `blur` / 2 px) in `color`: the shape is drawn far outside the
 * canvas and only its shadow lands on it (the portable blur: no Canvas `filter`).
 */
export function softFill(ctx: Ctx, path: Path2D, color: string, blur: number): void {
  const away = ctx.canvas.width * 3 + 1000;
  ctx.save();
  ctx.translate(-away, 0);
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = away;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#000';
  ctx.fill(path);
  ctx.restore();
}

/** A radial glow (light, haze, halo) around (x, y). */
export function glow(ctx: Ctx, x: number, y: number, r: number, color: Color, alpha: number) {
  ctx.fillStyle = radial(ctx, x, y, r, [
    [0, color, alpha],
    [0.25, color, alpha * 0.45],
    [0.55, color, alpha * 0.14],
    [1, color, 0],
  ]);
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

/** Darkens the corners like a lens (elliptical, following the image's aspect). */
export function vignette(ctx: Ctx, w: number, h: number, strength: number, inner = 0.5): void {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(w / h, 1);
  const r = (h / 2) * Math.SQRT2;
  const black = hex('#000');
  ctx.fillStyle = radial(ctx, 0, 0, r, [
    [inner, black, 0],
    [0.8, black, strength * 0.5],
    [1, black, strength],
  ]);
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.restore();
}

// --- grain --------------------------------------------------------------------------------

let grainTile: OffscreenCanvas | null = null;

/**
 * A 160² tile of seeded grain: specks of white or black whose opacity follows a normal
 * distribution — drawn over an image, it lightens and darkens pixels at random.
 */
function tile(): OffscreenCanvas | null {
  if (grainTile) return grainTile;
  const size = 160;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const rng = createRng('procedural-grain');
  for (let i = 0; i < image.data.length; i += 4) {
    const g = rng.gauss(1);
    const v = g > 0 ? 255 : 0;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = byte(Math.abs(g) * 0.3);
  }
  ctx.putImageData(image, 0, 0);
  grainTile = canvas;
  return canvas;
}

/**
 * Film grain over what's painted: the grain tile at `strength` (0 … 1), shifted by `seed` so
 * images don't share a pattern; `scale` sizes the grain. Inside a clip, only the clipped area
 * gets grain (objects keep their transparency).
 */
export function grain(ctx: Ctx, area: Rect, strength: number, seed: number, scale = 1): void {
  const noise = tile();
  if (!noise) return;
  const pattern = ctx.createPattern(noise, 'repeat');
  if (!pattern) return;
  const rng = createRng(seed);
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.translate(Math.floor(rng.next() * 160), Math.floor(rng.next() * 160));
  ctx.scale(scale, scale);
  ctx.fillStyle = pattern;
  const inv = 1 / scale;
  ctx.fillRect(area.x * inv - 200, area.y * inv - 200, area.w * inv + 400, area.h * inv + 400);
  ctx.restore();
}

// --- misc ---------------------------------------------------------------------------------

export { createRng, type Rng };

/** A seeded stream for one image (`name` keeps images independent of each other). */
export const seeded = (name: string): Rng => createRng(`procedural:${name}`);

/** Bounds of a set of rects (ink of composite objects), rounded out to whole pixels. */
export function bounds(...rects: Rect[]): Rect {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  const x = Math.floor(x0);
  const y = Math.floor(y0);
  return { x, y, w: Math.ceil(x1) - x, h: Math.ceil(y1) - y };
}
