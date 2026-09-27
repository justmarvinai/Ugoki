/**
 * Preview backdrops (docs/templates/00-foundations.md §7): what shows behind a transparent
 * design while it is previewed — never part of the design, and exported only when the user
 * bakes it in. Procedural and original: a softly drifting, defocused "footage" plate, and the
 * *Scene A / Scene B* stills that swap at a transition's cut point.
 */

import type { Graphic } from '../assets/types';
import { createRng } from '../core/rng';

export type Backdrop =
  | { kind: 'none' }
  /** Moving, defocused footage-like plate (lower thirds, logos, transitions as overlays). */
  | { kind: 'footage' }
  /** Scene A before the cut point, Scene B after it (transitions: "A → B"). */
  | { kind: 'scenes' }
  | { kind: 'color'; color: string }
  /** The user's own still ("Preview on my footage"), by content hash. */
  | { kind: 'image'; hash: string };

export const NO_BACKDROP: Backdrop = { kind: 'none' };

/** Validates a backdrop from the page (hashes are SHA-256 hex, colors #rrggbb). */
export function sanitizeBackdrop(value: unknown): Backdrop {
  if (typeof value !== 'object' || value === null) return NO_BACKDROP;
  const b = value as Record<string, unknown>;
  if (b.kind === 'footage' || b.kind === 'scenes') return { kind: b.kind };
  if (b.kind === 'color' && typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color)) {
    return { kind: 'color', color: b.color };
  }
  if (b.kind === 'image' && typeof b.hash === 'string' && /^[0-9a-f]{64}$/.test(b.hash)) {
    return { kind: 'image', hash: b.hash };
  }
  return NO_BACKDROP;
}

type Surface = { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D };

function surface(width: number, height: number): Surface {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  return { canvas, ctx };
}

type Ctx = OffscreenCanvasRenderingContext2D;

/** A ridge line: a few seeded sines, so hills look drawn, not generated. */
function ridge(
  ctx: Ctx,
  w: number,
  h: number,
  seed: number,
  base: number,
  amplitude: number,
  fill: string | CanvasGradient,
) {
  const rng = createRng(seed);
  const waves = Array.from({ length: 3 }, (_, i) => ({
    f: ((1.2 + rng.next() * 1.6) * (i + 1) * Math.PI * 2) / w,
    phase: rng.next() * Math.PI * 2,
    a: amplitude / (i + 1.4),
  }));
  ctx.beginPath();
  ctx.moveTo(0, h);
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    let y = base;
    for (const wave of waves) y -= wave.a * Math.sin(wave.f * x + wave.phase);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Scene A — rolling hills under a hazy day sky. */
function paintHills(ctx: Ctx, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.66);
  sky.addColorStop(0, '#6f9cc0');
  sky.addColorStop(0.7, '#c9d6dc');
  sky.addColorStop(1, '#eadcc4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const sx = w * 0.7;
  const sy = h * 0.36;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.5);
  glow.addColorStop(0, 'rgba(255, 246, 222, 0.85)');
  glow.addColorStop(0.12, 'rgba(255, 240, 210, 0.45)');
  glow.addColorStop(1, 'rgba(255, 240, 210, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ridge(ctx, w, h, 11, h * 0.6, h * 0.05, '#9fb3ab');
  ridge(ctx, w, h, 23, h * 0.69, h * 0.06, '#6f8f76');
  const front = ctx.createLinearGradient(0, h * 0.72, 0, h);
  front.addColorStop(0, '#4d6d4c');
  front.addColorStop(1, '#2c4230');
  ridge(ctx, w, h, 37, h * 0.8, h * 0.07, front);
}

/** Scene B — a calm sea at dusk, the sun on the horizon. */
function paintDusk(ctx: Ctx, w: number, h: number) {
  const horizon = h * 0.6;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#1c2748');
  sky.addColorStop(0.55, '#5d4a72');
  sky.addColorStop(1, '#ef8e5a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 1);
  const sx = w * 0.32;
  const glow = ctx.createRadialGradient(sx, horizon, 0, sx, horizon, h * 0.55);
  glow.addColorStop(0, 'rgba(255, 214, 160, 0.9)');
  glow.addColorStop(0.1, 'rgba(255, 170, 110, 0.5)');
  glow.addColorStop(1, 'rgba(255, 150, 100, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, horizon + 1);
  const sea = ctx.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, '#3a3f63');
  sea.addColorStop(1, '#0f1629');
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, w, h - horizon);
  // The sun's path on the water: thinning, fading streaks.
  const rng = createRng(5);
  for (let i = 0; i < 26; i++) {
    const k = i / 26;
    const y = horizon + (h - horizon) * k ** 1.4 + 2;
    const half = w * (0.02 + 0.09 * k) * (0.6 + rng.next() * 0.8);
    ctx.fillStyle = `rgba(255, 196, 140, ${0.55 * (1 - k)})`;
    ctx.fillRect(sx - half + (rng.next() - 0.5) * w * 0.03, y, half * 2, Math.max(1, h * 0.004));
  }
  ridge(ctx, w * 0.38, horizon + h * 0.02, 41, horizon, h * 0.035, '#18203a');
}

type Cached = { key: string; surface: Surface };

/** Paints backdrops at output size, caching the expensive stills per size. */
export class BackdropPainter {
  private readonly cache = new Map<string, Cached>();

  draw(
    ctx: Ctx,
    backdrop: Backdrop,
    options: { t: number; cut: number | null; image?: Graphic | undefined },
  ): void {
    const { width, height } = ctx.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    switch (backdrop.kind) {
      case 'none':
        ctx.clearRect(0, 0, width, height);
        break;
      case 'color':
        ctx.fillStyle = backdrop.color;
        ctx.fillRect(0, 0, width, height);
        break;
      case 'scenes': {
        const b = options.cut !== null && options.t >= options.cut;
        ctx.drawImage(this.still(b ? 'b' : 'a', width, height).canvas, 0, 0);
        break;
      }
      case 'footage':
        this.footage(ctx, width, height, options.t);
        break;
      case 'image': {
        const image = options.image;
        if (image?.kind === 'raster') {
          const { width: iw, height: ih } = image.image;
          const k = Math.max(width / iw, height / ih);
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(
            image.image.source,
            (width - iw * k) / 2,
            (height - ih * k) / 2,
            iw * k,
            ih * k,
          );
        } else {
          ctx.drawImage(this.still('a', width, height).canvas, 0, 0);
        }
        break;
      }
    }
    ctx.restore();
  }

  private still(scene: 'a' | 'b', width: number, height: number): Surface {
    const key = `${scene}:${width}x${height}`;
    const hit = this.cache.get(scene);
    if (hit?.key === key) return hit.surface;
    const s = surface(width, height);
    if (scene === 'a') paintHills(s.ctx, width, height);
    else paintDusk(s.ctx, width, height);
    this.cache.set(scene, { key, surface: s });
    return s;
  }

  /**
   * Footage: Scene A rendered small (so upscaling defocuses it), wider than the frame, drifting
   * slowly side to side; out-of-focus highlights float across it.
   */
  private footage(ctx: Ctx, width: number, height: number, t: number): void {
    const key = `footage:${width}x${height}`;
    let plate = this.cache.get('footage');
    if (plate?.key !== key) {
      const w = Math.max(8, Math.round(width / 10));
      const h = Math.max(8, Math.round(height / 10));
      const s = surface(Math.round(w * 1.3), h);
      paintHills(s.ctx, s.canvas.width, h);
      plate = { key, surface: s };
      this.cache.set('footage', plate);
    }
    const source = plate.surface.canvas;
    const scale = height / source.height;
    const overhang = source.width * scale - width;
    const x = -overhang * (0.5 + 0.5 * Math.sin(t * 0.21));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, x, 0, source.width * scale, height);
    // Bokeh: soft discs drifting on slow, looping paths.
    const rng = createRng(17);
    const unit = Math.min(width, height);
    for (let i = 0; i < 7; i++) {
      const bx = width * (rng.next() + 0.04 * Math.sin(t * 0.3 + i * 1.7));
      const by = height * (0.2 + 0.6 * rng.next() + 0.03 * Math.cos(t * 0.23 + i));
      const r = unit * (0.05 + 0.08 * rng.next());
      const disc = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      const a = 0.08 + 0.1 * rng.next();
      disc.addColorStop(0, `rgba(255, 244, 225, ${a})`);
      disc.addColorStop(0.75, `rgba(255, 244, 225, ${a * 0.8})`);
      disc.addColorStop(1, 'rgba(255, 244, 225, 0)');
      ctx.fillStyle = disc;
      ctx.fillRect(bx - r, by - r, r * 2, r * 2);
    }
  }
}
