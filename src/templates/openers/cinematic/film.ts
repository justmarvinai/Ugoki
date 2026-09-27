/**
 * Film texture for Cinematic: grain that changes on a fixed 24 fps cadence (whatever the export
 * frame rate) and a seeded gate weave. Everything random is drawn from the template's seeded
 * streams in `build`; `render` only looks tables up.
 *
 * Engine candidate: a per-template film finish (grain tiles + weave) — the global Grain finish
 * can't be switched on by a template, and it doesn't weave.
 */

import { type Draw, type Rect, type Rng, stepped } from '@/engine';

/** Film cadence. */
export const FILM_FPS = 24;

/**
 * The film frame showing at `t`. Steps change half-way between 24 fps frames, so every
 * motion-blur sub-frame of a 24 fps export shares its frame's grain and weave (a phase at
 * the frame itself would average two grains into mush).
 */
export const filmFrame = (t: number) =>
  Math.round(stepped(t + 0.5 / FILM_FPS, FILM_FPS) * FILM_FPS);

/** A drawable image (the Draw API's `image` source). */
type Tile = { readonly source: CanvasImageSource; readonly width: number; readonly height: number };

export type Grain = {
  /** Draws the grain of film frame `step` over `area` (design units) at `opacity`. */
  draw(g: Draw, area: Rect, step: number, opacity: number): void;
};

/**
 * Grain tiles repeat, shifted and swapped every film frame. Texels are one design unit and
 * softened in the tile itself (each grain bleeds into its neighbours), so the grain clumps
 * like film and is drawn 1:1 — no per-frame resampling.
 */
const TILE = 256;
const TILES = 4;

/**
 * Signed luminance noise: each texel lightens (white) or darkens (black) by a Gaussian amount,
 * so grain shows in the shadows as film grain does, not only in the midtones.
 */
export function createGrain(rng: Rng, steps: number): Grain | null {
  if (typeof OffscreenCanvas !== 'function') return null;
  const tiles: Tile[] = [];
  const noise = new Float32Array(TILE * TILE);
  for (let k = 0; k < TILES; k++) {
    const canvas = new OffscreenCanvas(TILE, TILE);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    for (let i = 0; i < noise.length; i++) noise[i] = rng.gauss(0.5);
    const image = ctx.createImageData(TILE, TILE);
    const data = image.data;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        // A soft grain: the texel plus a share of its (wrapping) neighbours.
        const at = (dx: number, dy: number) =>
          noise[((y + dy + TILE) % TILE) * TILE + ((x + dx + TILE) % TILE)] ?? 0;
        const n = at(0, 0) * 0.6 + (at(1, 0) + at(-1, 0) + at(0, 1) + at(0, -1)) * 0.14;
        const i = (y * TILE + x) * 4;
        const v = n > 0 ? 255 : 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = Math.min(255, Math.round(Math.abs(n) * 290));
      }
    }
    ctx.putImageData(image, 0, 0);
    tiles.push({ source: canvas, width: TILE, height: TILE });
  }
  // Which tile each film frame shows, and where it starts.
  const pick = new Uint8Array(steps);
  const dx = new Uint16Array(steps);
  const dy = new Uint16Array(steps);
  for (let s = 0; s < steps; s++) {
    // Never the same tile twice in a row.
    pick[s] =
      s > 0 ? ((pick[s - 1] ?? 0) + 1 + rng.int(0, TILES - 2)) % TILES : rng.int(0, TILES - 1);
    dx[s] = rng.int(0, TILE - 1);
    dy[s] = rng.int(0, TILE - 1);
  }
  const dest = { x: 0, y: 0, w: TILE, h: TILE };
  return {
    draw(g, area, step, opacity) {
      if (opacity <= 0.002) return;
      const s = Math.min(steps - 1, Math.max(0, step));
      const tile = tiles[pick[s] ?? 0];
      if (!tile) return;
      // Whole design units: at 1080p every texel lands on a pixel.
      const x0 = Math.floor(area.x) - (dx[s] ?? 0);
      const y0 = Math.floor(area.y) - (dy[s] ?? 0);
      g.group({ opacity }, (g) =>
        g.clip(area, (g) => {
          for (let y = y0; y < area.y + area.h; y += TILE) {
            for (let x = x0; x < area.x + area.w; x += TILE) {
              dest.x = x;
              dest.y = y;
              g.image(tile, dest);
            }
          }
        }),
      );
    },
  };
}

export type Weave = { x: Float32Array; y: Float32Array };

/**
 * Gate weave: the film's registration wandering in the gate — a slow lateral drift (value
 * noise every ~6 film frames) plus a little frame-to-frame chatter, within ±`amplitude`.
 */
export function createWeave(rng: Rng, steps: number, amplitude: number): Weave {
  const noise = (scale: number, chatter: number) => {
    const knots = Math.ceil(steps / 6) + 2;
    const points = Array.from({ length: knots }, () => rng.range(-1, 1));
    const out = new Float32Array(steps);
    for (let s = 0; s < steps; s++) {
      const k = Math.floor(s / 6);
      const f = (s % 6) / 6;
      const smooth = f * f * (3 - 2 * f);
      const a = points[k] ?? 0;
      const b = points[k + 1] ?? 0;
      const v = (a + (b - a) * smooth) * (1 - chatter) + rng.range(-1, 1) * chatter;
      out[s] = v * scale;
    }
    return out;
  };
  return { x: noise(amplitude, 0.3), y: noise(amplitude * 0.6, 0.3) };
}
