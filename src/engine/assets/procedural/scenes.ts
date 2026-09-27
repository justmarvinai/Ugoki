/**
 * Scenes (1600 × 1067): stylized travel "photographs" — layered landscapes under a sky
 * gradient, a sun or moon, atmospheric perspective (farther layers hazier and bluer), film
 * grain and a lens vignette. Built to read as a photo at Polaroid size (Stack) and to hold up
 * full-frame behind titles (Cinematic): the key light sits inside the center third, so vertical
 * crops keep it.
 */

import type { Color } from '../../core/color';
import { clamp01, lerp, smoothstep } from '../../core/math';
import {
  below,
  type Ctx,
  css,
  fbm1,
  full,
  glow,
  grain,
  heightAt,
  hex,
  linear,
  mix,
  noise1,
  type Painter,
  type Profile,
  profile,
  type Rng,
  radial,
  ridged1,
  type Stop,
  seeded,
  softFill,
  TAU,
  vignette,
} from './kit';

const WHITE = hex('#ffffff');

// --- sky ----------------------------------------------------------------------------------

function sky(ctx: Ctx, w: number, bottom: number, stops: readonly Stop[]) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, bottom, stops);
  ctx.fillRect(0, 0, w, bottom + 2);
}

/** A sun: wide atmospheric halo, a tight bloom, and a bright disk. */
function sun(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  core: Color,
  halo: Color,
  spread: number,
  strength = 1,
) {
  glow(ctx, x, y, spread, halo, 0.6 * strength);
  glow(ctx, x, y, r * 5, core, 0.75 * strength);
  ctx.fillStyle = radial(ctx, x, y, r, [
    [0, core],
    [0.82, core],
    [1, core, 0],
  ]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A long, thin, soft cloud streak. */
function streak(
  ctx: Ctx,
  x: number,
  y: number,
  length: number,
  thickness: number,
  color: Color,
  alpha: number,
) {
  const path = new Path2D();
  path.ellipse(x, y, length / 2, thickness / 2, 0, 0, TAU);
  softFill(ctx, path, css(color, alpha), thickness * 1.4);
}

/**
 * A fair-weather cumulus: a flat, shaded base of wide ellipses under cauliflower puffs whose
 * sunlit sides (toward `light`: 1 = right, -1 = left) are brighter. Edges stay nearly crisp.
 */
function cumulus(
  ctx: Ctx,
  rng: Rng,
  x: number,
  y: number,
  width: number,
  lit: Color,
  shade: Color,
  light = 1,
) {
  const base = new Path2D();
  const body = new Path2D();
  const sunlit = new Path2D();
  const n = 4 + rng.int(0, 1);
  for (let i = 0; i < n; i++) {
    const cx = x + ((i + 0.5) / n - 0.5) * width * 0.66;
    const rx = width * rng.range(0.1, 0.13);
    const ry = width * rng.range(0.028, 0.038);
    base.moveTo(cx + rx, y - ry * 1.4);
    base.ellipse(cx, y - ry * 1.4, rx, ry, 0, 0, TAU);
  }
  const m = 7 + rng.int(0, 2);
  for (let i = 0; i < m; i++) {
    const t = (i + rng.range(0.2, 0.8)) / m;
    const hump = Math.sin(Math.PI * (0.1 + 0.8 * t));
    const r = width * (0.06 + 0.1 * hump) * rng.range(0.85, 1.15);
    const cx = x + (t - 0.5) * width * 0.74;
    const cy = y - width * 0.045 - r * 0.55 - hump * width * 0.07 * rng.range(0.7, 1.2);
    body.moveTo(cx + r, cy);
    body.arc(cx, cy, r, 0, TAU);
    const sx = cx + light * r * 0.2;
    const sy = cy - r * 0.18;
    sunlit.moveTo(sx + r * 0.78, sy);
    sunlit.arc(sx, sy, r * 0.78, 0, TAU);
  }
  softFill(ctx, base, css(shade), width * 0.01);
  softFill(ctx, body, css(mix(shade, lit, 0.55)), width * 0.009);
  softFill(ctx, sunlit, css(lit), width * 0.008);
}

// --- terrain ------------------------------------------------------------------------------

/** Indices of profile points that are summits standing at least `prominence` px above their cols. */
function summits(p: Profile, prominence: number): number[] {
  const n = p.length / 2;
  const Y = (i: number) => p[2 * i + 1]!;
  const out: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(Y(i) < Y(i - 1) && Y(i) <= Y(i + 1))) continue;
    let left = Y(i);
    for (let j = i - 1; j >= 0 && Y(j) >= Y(i); j--) left = Math.max(left, Y(j));
    let right = Y(i);
    for (let j = i + 1; j < n && Y(j) >= Y(i); j++) right = Math.max(right, Y(j));
    if (Math.min(left, right) - Y(i) >= prominence) out.push(i);
  }
  return out;
}

/**
 * Faces turned away from the light (`light` 1 = from the left): for every summit, the slope
 * between a jagged arête running down from it and the gully under the next col.
 */
function shadowFaces(
  rng: Rng,
  p: Profile,
  bottom: number,
  light: 1 | -1,
  prominence: number,
  lean = 0.4,
): Path2D[] {
  const n = p.length / 2;
  const X = (i: number) => p[2 * i]!;
  const Y = (i: number) => p[2 * i + 1]!;
  const tops = summits(p, prominence);
  const faces: Path2D[] = [];
  for (let k = 0; k < tops.length; k++) {
    const i = tops[k]!;
    const end = light > 0 ? (tops[k + 1] ?? n - 1) : (tops[k - 1] ?? 0);
    let v = i;
    for (let j = i + light; light > 0 ? j <= end : j >= end; j += light) if (Y(j) > Y(v)) v = j;
    if (v === i) continue;
    const span = Math.abs(X(v) - X(i));
    const drop = bottom - Y(i);
    const ax = X(i) + light * Math.min(span * rng.range(0.1, lean), drop * 0.5);
    const valleyDrop = bottom - Y(v);
    // The gully under the col falls away from the arête, so the face widens as it descends.
    let vx = X(v) + light * valleyDrop * rng.range(0.12, 0.4);
    if (light * (vx - ax) < 4) vx = ax + light * 4;
    const face = new Path2D();
    face.moveTo(X(i), Y(i));
    for (let j = i + light; ; j += light) {
      face.lineTo(X(j), Y(j));
      if (j === v) break;
    }
    for (let s = 1; s <= 4; s++) {
      const t = s / 4;
      const jag = s < 4 ? rng.range(-1, 1) * valleyDrop * 0.05 : 0;
      face.lineTo(X(v) + (vx - X(v)) * t ** 1.2 + jag, Y(v) + valleyDrop * t);
    }
    const steps = 7;
    for (let s = steps; s >= 1; s--) {
      const t = s / steps;
      const jag = t * (1 - t) * rng.range(-1, 1) * Math.min(span, drop) * 0.3;
      face.lineTo(X(i) + (ax - X(i)) * t ** 0.8 + jag, Y(i) + drop * t);
    }
    face.closePath();
    faces.push(face);
  }
  return faces;
}

type RangeSpec = {
  /** Foot of the range: where valley mist is thickest. */
  base: number;
  /** Height of the tallest summits. */
  top: number;
  /** Horizontal feature size (px). */
  scale: number;
  /** Share of sharp ridged detail on top of the broad shape (0 … 1). */
  jagged?: number;
  /** A dominant massif: its center and half-width (px). */
  massif?: readonly [number, number];
  lit: Color;
  /** Multiplied over faces turned from the light. */
  shade: Color;
  /** Snow above `line`, with streaks down the gullies (`streaks`: their reach, default 0.26). */
  snow?: { line: number; color: Color; streaks?: number };
  mist: Color;
  mistAlpha: number;
  light?: 1 | -1;
  /** Summits standing less than this (px) above their cols get no face of their own. */
  prominence?: number;
};

type Layer = { profile: Profile; paint: (ctx: Ctx) => void };

/** A mountain range: broad massifs with jagged crests, lit and shaded faces, snow, mist. */
function mountains(rng: Rng, w: number, bottom: number, spec: RangeSpec): Layer {
  const broad = fbm1(rng, 3, 0.45);
  const ridge = ridged1(rng, 5, 0.5);
  const offset = rng.range(0, 64);
  const jagged = spec.jagged ?? 0.45;
  const envelope = (x: number) => {
    if (!spec.massif) return 1;
    const [cx, half] = spec.massif;
    return 0.4 + 0.6 * Math.exp(-(((x - cx) / half) ** 2));
  };
  const p = profile(0, w, 3, (x) => {
    const u = x / spec.scale + offset;
    const shape = (1 - jagged) * (0.5 + 0.6 * broad(u)) + jagged * ridge(u * 1.6);
    const r = clamp01((shape - 0.18) / 0.72);
    return spec.base - (spec.base - spec.top) * r * envelope(x);
  });
  const silhouette = below(p, bottom);
  const faces = shadowFaces(rng, p, bottom, spec.light ?? 1, spec.prominence ?? 14);
  let highest = bottom;
  for (let i = 1; i < p.length; i += 2) highest = Math.min(highest, p[i]!);
  let snow: Path2D | null = null;
  if (spec.snow) {
    const jag = fbm1(rng, 4);
    const streaks = noise1(rng);
    const line = spec.snow.line;
    const reach = spec.base - spec.top;
    snow = new Path2D();
    snow.moveTo(0, highest - 10);
    for (let x = 0; x <= w; x += 3) {
      const crest = heightAt(p, x);
      // Snow lies above the line; steep gullies carry streaks of it further down.
      const gully = Math.max(0, streaks(x / 6.5)) ** 2 * reach * (spec.snow.streaks ?? 0.26);
      const y = line + jag(x / 38) * reach * 0.06 + gully;
      snow.lineTo(x, Math.max(crest - 2, y));
    }
    snow.lineTo(w, highest - 10);
    snow.closePath();
  }
  return {
    profile: p,
    paint(ctx) {
      ctx.fillStyle = linear(ctx, 0, highest, 0, spec.base, [
        [0, mix(spec.lit, WHITE, 0.12)],
        [1, spec.lit],
      ]);
      ctx.fill(silhouette);
      ctx.save();
      ctx.clip(silhouette);
      if (snow && spec.snow) {
        ctx.fillStyle = linear(ctx, 0, highest, 0, spec.snow.line, [
          [0, mix(spec.snow.color, WHITE, 0.4)],
          [1, spec.snow.color],
        ]);
        ctx.fill(snow);
      }
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = css(spec.shade);
      for (const face of faces) ctx.fill(face);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = linear(ctx, 0, highest, 0, spec.base, [
        [0, spec.mist, 0],
        [0.55, spec.mist, spec.mistAlpha * 0.3],
        [1, spec.mist, spec.mistAlpha],
      ]);
      ctx.fillRect(0, highest, w, bottom - highest);
      ctx.restore();
    },
  };
}

/** Rolling hills: a smooth skyline, lighter along its crest, misty at its foot. */
function hills(
  rng: Rng,
  w: number,
  bottom: number,
  spec: { base: number; amp: number; scale: number; color: Color; crest: Color; mist?: Color },
): Layer {
  const n = fbm1(rng, 3, 0.45);
  const offset = rng.range(0, 64);
  const p = profile(
    0,
    w,
    4,
    (x) => spec.base - spec.amp * (0.5 + 0.5 * n(x / spec.scale + offset)),
  );
  const silhouette = below(p, bottom);
  let highest = bottom;
  for (let i = 1; i < p.length; i += 2) highest = Math.min(highest, p[i]!);
  return {
    profile: p,
    paint(ctx) {
      ctx.fillStyle = linear(ctx, 0, highest, 0, bottom, [
        [0, spec.crest],
        [0.35, spec.color],
        [1, spec.mist ?? spec.color],
      ]);
      ctx.fill(silhouette);
    },
  };
}

/**
 * A conifer silhouette: tiers of drooping branches around a trunk, filled at once in the
 * current fill style (one fill per tree: many small shapes in one path fill slowly).
 */
function pine(ctx: Ctx, rng: Rng, x: number, y: number, height: number, width: number) {
  const tiers = 6 + rng.int(0, 3);
  const top = y - height;
  const reach: number[] = [];
  for (let k = 1; k <= tiers; k++) {
    reach.push((width / 2) * (0.18 + 0.82 * (k / tiers) ** 0.9) * rng.range(0.82, 1.12));
  }
  const tipY = (k: number) => top + height * 0.9 * (k / tiers);
  const notch = height * 0.035;
  ctx.beginPath();
  ctx.moveTo(x, top);
  for (let k = 1; k <= tiers; k++) {
    ctx.lineTo(x + reach[k - 1]!, tipY(k));
    if (k < tiers) ctx.lineTo(x + reach[k - 1]! * 0.38, tipY(k) - notch);
  }
  ctx.lineTo(x + width * 0.05, y);
  ctx.lineTo(x - width * 0.05, y);
  for (let k = tiers; k >= 1; k--) {
    if (k < tiers) ctx.lineTo(x - reach[k - 1]! * 0.38, tipY(k) - notch);
    ctx.lineTo(x - reach[k - 1]!, tipY(k));
  }
  ctx.closePath();
  ctx.fill();
}

/** A band of conifers along a profile, from `x0` to `x1`, in the current fill style. */
function forest(
  ctx: Ctx,
  rng: Rng,
  p: Profile,
  x0: number,
  x1: number,
  spec: { spacing: number; height: readonly [number, number]; sink: number; slim?: number },
) {
  for (let x = x0; x < x1; x += spec.spacing * rng.range(0.5, 1.3)) {
    const height = rng.range(spec.height[0], spec.height[1]);
    const y = heightAt(p, x) + rng.range(0, spec.sink);
    pine(ctx, rng, x, y, height, height * (spec.slim ?? 0.36) * rng.range(0.85, 1.15));
  }
}

/** A leafy tree: canopy puffs (shade), their sunlit sides, a short trunk. */
function leafyTree(
  shade: Path2D,
  lit: Path2D,
  trunk: Path2D,
  rng: Rng,
  x: number,
  y: number,
  size: number,
  light: number,
) {
  trunk.rect(x - size * 0.045, y - size * 0.5, size * 0.09, size * 0.5);
  const n = 4 + rng.int(0, 2);
  for (let i = 0; i < n; i++) {
    const cx = x + rng.range(-0.32, 0.32) * size;
    const cy = y - size * 0.95 + rng.range(-0.28, 0.18) * size;
    const r = size * rng.range(0.3, 0.44);
    shade.moveTo(cx + r, cy);
    shade.arc(cx, cy, r, 0, TAU);
    const lx = cx + light * r * 0.22;
    const ly = cy - r * 0.24;
    lit.moveTo(lx + r * 0.68, ly);
    lit.arc(lx, ly, r * 0.68, 0, TAU);
  }
}

// --- water --------------------------------------------------------------------------------

/** A thin horizontal lozenge (a tapered dash) at (x, y), filled on its own. */
function dash(ctx: Ctx, x: number, y: number, length: number, thickness: number) {
  ctx.beginPath();
  ctx.moveTo(x - length / 2, y);
  ctx.lineTo(x, y - thickness / 2);
  ctx.lineTo(x + length / 2, y);
  ctx.lineTo(x, y + thickness / 2);
  ctx.fill();
}

/** Wave texture on open water: short dashes that grow and spread toward the viewer. */
function ripples(
  ctx: Ctx,
  rng: Rng,
  w: number,
  top: number,
  bottom: number,
  light: Color,
  lightAlpha: number,
  dark: Color,
  darkAlpha: number,
  density = 1,
) {
  const marks: number[][] = [[], []];
  let y = top + 1.5;
  while (y < bottom) {
    const d = (y - top) / (bottom - top);
    const spacing = 1.6 + d * d * 30;
    const thick = 0.8 + d * 3.6;
    const count = Math.round((w / (16 + d * 130)) * density);
    for (let i = 0; i < count; i++) {
      const x = rng.next() * w;
      const len = (12 + d * 170) * rng.range(0.35, 1.25);
      const yy = y + rng.range(-0.35, 0.35) * spacing;
      marks[rng.chance(0.5) ? 0 : 1]!.push(x, yy, len, thick);
    }
    y += spacing;
  }
  [dark, light].forEach((color, k) => {
    ctx.fillStyle = css(color, k === 0 ? darkAlpha : lightAlpha);
    const list = marks[k]!;
    for (let i = 0; i < list.length; i += 4)
      dash(ctx, list[i]!, list[i + 1]!, list[i + 2]!, list[i + 3]!);
  });
}

/** Sparkles of a low light on water: a column that widens toward the viewer. */
function glitter(
  ctx: Ctx,
  rng: Rng,
  x: number,
  top: number,
  bottom: number,
  width: number,
  color: Color,
  count: number,
  alpha = 0.9,
) {
  ctx.fillStyle = css(color, alpha);
  for (let i = 0; i < count; i++) {
    const d = rng.next() ** 1.6;
    const y = top + 1 + d * (bottom - top);
    const gx = x + rng.gauss(0.5) * width * (0.18 + d * 1.2);
    dash(ctx, gx, y, (3 + d * 40) * rng.range(0.4, 1.4), 0.9 + d * 2.8);
  }
}

/**
 * Still water: what's painted above `axis` mirrored below it, in thin strips shifted by a
 * gentle swell (`wobble` px at the near edge) — a reflection broken like a real one.
 */
function mirror(ctx: Ctx, rng: Rng, w: number, axis: number, bottom: number, wobble: number) {
  const band = Math.ceil(Math.min(axis, bottom - axis));
  const canvas = new OffscreenCanvas(w, band);
  const c = canvas.getContext('2d');
  if (!c) return;
  c.drawImage(ctx.canvas, 0, axis - band, w, band, 0, 0, w, band);
  // A bitmap draws without a snapshot per call.
  const copy = canvas.transferToImageBitmap();
  const swell = noise1(rng);
  const margin = wobble * 1.5;
  for (let y = 0; y < band; ) {
    const d = y / band;
    const strip = Math.min(band - y, Math.round(2 + d * 7));
    const shift = swell(y * 0.21) * wobble * (0.15 + d);
    ctx.save();
    ctx.translate(shift, axis + y + strip);
    ctx.scale(1, -1);
    ctx.drawImage(copy, 0, band - y - strip, w, strip, -margin, 0, w + 2 * margin, strip);
    ctx.restore();
    y += strip;
  }
  copy.close();
}

// --- foreground ---------------------------------------------------------------------------

/** Blades of grass rising from `base(x)`, leaning by `lean`, in a few colors. */
function grass(
  ctx: Ctx,
  rng: Rng,
  x0: number,
  x1: number,
  base: (x: number) => number,
  height: number,
  colors: readonly Color[],
  count: number,
  lean = 0.2,
) {
  const blades: number[][] = colors.map(() => []);
  for (let i = 0; i < count; i++) {
    const x = rng.range(x0, x1);
    const y = base(x) + rng.range(0, 10);
    const tall = height * rng.range(0.35, 1);
    const bend = (lean + rng.range(-0.35, 0.35)) * tall;
    blades[rng.int(0, colors.length - 1)]!.push(x, y, tall, bend, rng.range(1, 2.6));
  }
  colors.forEach((color, k) => {
    ctx.fillStyle = css(color);
    const list = blades[k]!;
    for (let i = 0; i < list.length; i += 5) {
      const x = list[i]!;
      const y = list[i + 1]!;
      const tall = list[i + 2]!;
      const bend = list[i + 3]!;
      const half = list[i + 4]!;
      ctx.beginPath();
      ctx.moveTo(x - half, y);
      ctx.lineTo(x - half * 0.45 + bend * 0.2, y - tall * 0.55);
      ctx.lineTo(x + bend, y - tall);
      ctx.lineTo(x + half * 0.45 + bend * 0.2, y - tall * 0.55);
      ctx.lineTo(x + half, y);
      ctx.fill();
    }
  });
}

/** Round dots (flowers, lights) in a few colors, sized by depth. */
function dots(
  ctx: Ctx,
  rng: Rng,
  count: number,
  at: () => readonly [number, number, number],
  colors: readonly Color[],
) {
  const paths = colors.map(() => new Path2D());
  for (let i = 0; i < count; i++) {
    const [x, y, r] = at();
    const path = paths[rng.int(0, paths.length - 1)]!;
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, TAU);
  }
  colors.forEach((color, i) => {
    ctx.fillStyle = css(color);
    ctx.fill(paths[i]!);
  });
}

/** The photographic finish: lens vignette and film grain. */
function develop(ctx: Ctx, w: number, h: number, seed: number, vignetteAmount = 0.32) {
  vignette(ctx, w, h, vignetteAmount, 0.45);
  grain(ctx, full(w, h), 0.14, seed);
}

// --- scenes -------------------------------------------------------------------------------

/** Coast — midday sea under a high sun: glittering water, a headland, a pale beach. */
const coast: Painter = (ctx, w, h) => {
  const rng = seeded('scene-coast');
  const horizon = Math.round(h * 0.5);
  const haze = hex('#e3eeee');
  const sunX = w * 0.6;
  const sunY = h * 0.19;
  sky(ctx, w, horizon, [
    [0, hex('#3a7fc4')],
    [0.45, hex('#6fabdc')],
    [0.82, hex('#b6d8ec')],
    [1, haze],
  ]);
  sun(ctx, sunX, sunY, h * 0.03, hex('#fffcf2'), hex('#fff3d6'), h * 0.62);
  streak(ctx, w * 0.2, h * 0.31, w * 0.3, h * 0.02, WHITE, 0.5);
  streak(ctx, w * 0.3, h * 0.345, w * 0.2, h * 0.014, WHITE, 0.4);
  streak(ctx, w * 0.84, h * 0.33, w * 0.28, h * 0.018, WHITE, 0.45);
  streak(ctx, w * 0.52, h * 0.44, w * 0.46, h * 0.012, WHITE, 0.35);
  const cloudLit = mix(WHITE, haze, 0.15);
  cumulus(ctx, rng, w * 0.14, h * 0.47, w * 0.19, cloudLit, hex('#bfd0de'), 1);
  cumulus(ctx, rng, w * 0.33, h * 0.485, w * 0.1, cloudLit, hex('#c3d3e0'), 1);
  cumulus(ctx, rng, w * 0.93, h * 0.475, w * 0.12, cloudLit, hex('#c3d3e0'), -1);

  // Far shore on the left: a low hazy line.
  const farN = fbm1(rng, 3);
  const far = profile(0, w * 0.44, 5, (x) => {
    const u = x / (w * 0.44);
    return horizon - h * 0.028 * (1 - u) ** 0.6 * (0.75 + 0.25 * farN(x / 70));
  });
  ctx.fillStyle = css(mix(hex('#6d95a4'), haze, 0.5));
  ctx.fill(below(far, horizon + 1));

  // The sea: hazy at the horizon, deep blue toward the beach.
  const shore = (x: number) => h * (0.74 + 0.15 * (x / w) ** 1.3) + Math.sin(x / 130) * h * 0.008;
  ctx.fillStyle = linear(ctx, 0, horizon, 0, h, [
    [0, hex('#86b9cf')],
    [0.06, hex('#4f98bf')],
    [0.4, hex('#2a7aa7')],
    [0.75, hex('#1c6b96')],
    [1, hex('#16628c')],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);
  // Sunlight on the water below the sun.
  ctx.save();
  ctx.translate(sunX, horizon);
  ctx.scale(1, 3.2);
  glow(ctx, 0, 0, h * 0.12, hex('#fff6e0'), 0.55);
  ctx.restore();
  ripples(ctx, rng, w, horizon, h * 0.92, hex('#bfe2f0'), 0.45, hex('#0f4f78'), 0.32);
  glitter(ctx, rng, sunX, horizon, h * 0.88, w * 0.06, hex('#fffaf0'), 700);
  ctx.fillStyle = linear(ctx, 0, horizon - 3, 0, horizon + 8, [
    [0, haze, 0],
    [0.35, haze, 0.8],
    [1, haze, 0],
  ]);
  ctx.fillRect(0, horizon - 3, w, 11);

  // Headland on the right: grassy top, pale cliff falling into the sea, a lighthouse.
  const x0 = w * 0.66;
  const topN = fbm1(rng, 4);
  const land = profile(x0, w + 4, 3, (x) => {
    const u = (x - x0) / (w - x0);
    const top = horizon - h * (0.085 + 0.07 * u ** 0.8) + topN(x / 60) * h * 0.007;
    return lerp(horizon + 1, top, smoothstep(0, 0.07, u) ** 0.55);
  });
  const landPath = below(land, horizon + 1);
  const cliffHaze = hex('#c4d7dc');
  ctx.fillStyle = linear(ctx, 0, horizon - h * 0.16, 0, horizon, [
    [0, mix(hex('#b4ab98'), cliffHaze, 0.35)],
    [1, mix(hex('#7f8a86'), cliffHaze, 0.3)],
  ]);
  ctx.fill(landPath);
  ctx.save();
  ctx.clip(landPath);
  // Vertical weathering on the cliff face.
  const strata = new Path2D();
  for (let i = 0; i < 90; i++) {
    const x = x0 + rng.next() * (w - x0);
    const y = heightAt(land, x) + rng.range(6, 30);
    strata.rect(x, y, rng.range(1, 3), rng.range(8, 40));
  }
  ctx.fillStyle = css(hex('#5f6c6c'), 0.25);
  ctx.fill(strata);
  // Grass cap.
  const cap = new Path2D();
  cap.moveTo(land[0]!, land[1]!);
  for (let i = 0; i < land.length; i += 2) cap.lineTo(land[i]!, land[i + 1]!);
  for (let i = land.length - 2; i >= 0; i -= 2) {
    const u = (land[i]! - x0) / (w - x0);
    cap.lineTo(land[i]!, land[i + 1]! + h * (0.012 + 0.03 * smoothstep(0.05, 0.6, u)));
  }
  cap.closePath();
  ctx.fillStyle = linear(ctx, 0, horizon - h * 0.17, 0, horizon - h * 0.06, [
    [0, mix(hex('#6f9a5c'), cliffHaze, 0.3)],
    [1, mix(hex('#557e4c'), cliffHaze, 0.3)],
  ]);
  ctx.fill(cap);
  ctx.restore();
  // Surf at the foot of the cliff.
  const surf = new Path2D();
  for (let x = x0 - 6; x < w; x += rng.range(6, 16)) {
    const len = rng.range(8, 26);
    surf.moveTo(x + len / 2, horizon + 1);
    surf.ellipse(x, horizon + 1, len / 2, rng.range(1, 2.2), 0, 0, TAU);
  }
  ctx.fillStyle = css(WHITE, 0.75);
  ctx.fill(surf);
  // Lighthouse.
  const lx = x0 + (w - x0) * 0.3;
  const ly = heightAt(land, lx) + 2;
  const lw = w * 0.0075;
  const lh = h * 0.05;
  ctx.fillStyle = css(mix(hex('#f4f2ec'), cliffHaze, 0.15));
  ctx.beginPath();
  ctx.moveTo(lx - lw * 0.6, ly);
  ctx.lineTo(lx - lw * 0.42, ly - lh);
  ctx.lineTo(lx + lw * 0.42, ly - lh);
  ctx.lineTo(lx + lw * 0.6, ly);
  ctx.fill();
  ctx.fillStyle = css(mix(hex('#c8453a'), cliffHaze, 0.2));
  ctx.fillRect(lx - lw * 0.52, ly - lh * 0.55, lw * 1.04, lh * 0.16);
  ctx.fillRect(lx - lw * 0.5, ly - lh - lh * 0.2, lw, lh * 0.2);
  ctx.fillStyle = css(mix(hex('#40464a'), cliffHaze, 0.2));
  ctx.fillRect(lx - lw * 0.62, ly - lh - lh * 0.03, lw * 1.24, lh * 0.05);

  // Shallows, surf line, wet and dry sand.
  const beach = profile(-4, w + 4, 4, shore);
  const water = new Path2D();
  water.moveTo(-4, h);
  for (let i = 0; i < beach.length; i += 2) water.lineTo(beach[i]!, beach[i + 1]! - h * 0.05);
  water.lineTo(w + 4, h);
  water.closePath();
  ctx.fillStyle = linear(ctx, 0, h * 0.7, 0, h, [
    [0, hex('#2f9fb0'), 0],
    [0.25, hex('#38b2b4'), 0.55],
    [1, hex('#7fd6c6'), 0.8],
  ]);
  ctx.fill(water);
  const sand = below(beach, h + 2);
  ctx.fillStyle = linear(ctx, 0, h * 0.72, 0, h, [
    [0, hex('#e9d5b0')],
    [1, hex('#dcc196')],
  ]);
  ctx.fill(sand);
  ctx.save();
  ctx.clip(sand);
  const wet = new Path2D();
  wet.moveTo(-4, beach[1]!);
  for (let i = 0; i < beach.length; i += 2) wet.lineTo(beach[i]!, beach[i + 1]!);
  for (let i = beach.length - 2; i >= 0; i -= 2) {
    wet.lineTo(beach[i]!, beach[i + 1]! + h * (0.025 + 0.01 * Math.sin(beach[i]! / 90)));
  }
  wet.closePath();
  ctx.fillStyle = css(hex('#b89c72'), 0.7);
  ctx.fill(wet);
  ctx.restore();
  // Foam: the swash's lacy edge and a broken line of surf offshore.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [dy, width, alpha] of [
    [0, 3.2, 0.95],
    [-h * 0.012, 1.6, 0.55],
    [-h * 0.03, 2.4, 0.45],
  ] as const) {
    const wave = noise1(rng);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < beach.length; i += 2) {
      const x = beach[i]!;
      const gap = dy < 0 && wave(x / 40) < -0.25;
      if (gap) {
        pen = false;
        continue;
      }
      const y = beach[i + 1]! + dy + wave(x / 25) * 3;
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.strokeStyle = css(WHITE, alpha);
    ctx.lineWidth = width;
    ctx.stroke();
  }
  // Dune grass in the corner.
  grass(
    ctx,
    rng,
    -10,
    w * 0.16,
    (x) => h - 4 + (x / (w * 0.16)) * 30,
    h * 0.14,
    [hex('#7c8a4a'), hex('#a3a15e'), hex('#c7b57a'), hex('#5f6e3a')],
    160,
    0.35,
  );
  develop(ctx, w, h, 11, 0.28);
  return full(w, h);
};

/** A dune crest: x, y, windward width, lee width. */
type Crest = readonly [number, number, number, number];

/** A dune skyline: sharp crests (gentle windward side, steep lee), rounded troughs. */
function duneProfile(x0: number, x1: number, base: number, crests: readonly Crest[]): Profile {
  const k = 7;
  return profile(x0, x1, 3, (x) => {
    let sum = Math.exp(-base / k);
    for (const [cx, cy, wl, wr] of crests) {
      const u = x < cx ? (cx - x) / wl : (x - cx) / wr;
      const fall = x < cx ? u ** 1.6 : u ** 0.85;
      sum += Math.exp(-(cy + (base - cy) * Math.min(1, fall)) / k);
    }
    // Soft minimum of the shapes (y points down): troughs round off, crests stay sharp.
    return -k * Math.log(sum);
  });
}

type DuneSpec = {
  /** The crest on the skyline. */
  peak: readonly [number, number];
  /** Foot of the sunlit windward slope (left) and of the lee slope (right). */
  from: readonly [number, number];
  to: readonly [number, number];
  /** Where the brink, sweeping down toward the viewer, leaves the picture (or hides). */
  brink: readonly [number, number];
  /** Sunlit sand, top and bottom. */
  lit: readonly [Color, Color];
  /** The slip face: near the brink, and away from it. */
  shade: readonly [Color, Color];
  rim: Color;
  /** Strength of wind ripples on the sunlit slope (0 = none). */
  ripples?: number;
};

/**
 * A dune lit from the left: a gentle windward slope up to a knife-edge crest, and beyond the
 * brink — which sweeps down toward the viewer — the slip face in shadow, rimmed with light.
 */
function dune(ctx: Ctx, rng: Rng, h: number, spec: DuneSpec) {
  const [px, py] = spec.peak;
  const [lx, ly] = spec.from;
  const [rx, ry] = spec.to;
  const [bx, by] = spec.brink;
  const n = fbm1(rng, 3);
  const skyline = profile(lx, rx, 3, (x) => {
    const y =
      x < px
        ? py + (ly - py) * ((px - x) / (px - lx)) ** 1.5
        : py + (ry - py) * ((x - px) / (rx - px)) ** 0.75;
    return y + n(x / 90) * 3 * Math.min(1, Math.abs(x - px) / 40);
  });
  const body = below(skyline, h + 4);
  ctx.fillStyle = linear(ctx, 0, py, 0, Math.max(ly, ry) + h * 0.1, [
    [0, spec.lit[0]],
    [1, spec.lit[1]],
  ]);
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  const strength = spec.ripples ?? 0;
  if (strength > 0) {
    // Fine wind-drawn lines, their spacing opening up toward the viewer.
    const wave = noise1(rng);
    const dark = new Path2D();
    const light = new Path2D();
    for (let y = py; y < h + 20; ) {
      const d = clamp01((y - py) / (h - py));
      const phase = rng.range(0, 100);
      const amp = 2 + d * 7;
      const tilt = -0.05 - d * 0.04;
      const lift = 1.5 + d * 1.5;
      dark.moveTo(lx - 10, y);
      light.moveTo(lx - 10, y - lift);
      for (let x = lx - 10; x <= rx + 22; x += 16) {
        const yy = y + (x - px) * tilt + wave(x / (60 + d * 40) + phase) * amp;
        dark.lineTo(x, yy);
        light.lineTo(x, yy - lift);
      }
      y += 6 + d * d * 28;
    }
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = css(spec.shade[0], 0.32 * strength);
    ctx.stroke(dark);
    ctx.strokeStyle = css(spec.rim, 0.34 * strength);
    ctx.stroke(light);
  }
  const brink = [
    px + (bx - px) * rng.range(0.15, 0.3),
    py + (by - py) * rng.range(0.45, 0.6),
    px + (bx - px) * rng.range(0.55, 0.7),
    py + (by - py) * rng.range(0.8, 0.9),
    bx,
    by,
  ] as const;
  const face = new Path2D();
  face.moveTo(px, py);
  for (let i = 0; i < skyline.length; i += 2) {
    if (skyline[i]! > px) face.lineTo(skyline[i]!, skyline[i + 1]!);
  }
  face.lineTo(rx + 8, h + 8);
  face.lineTo(bx, h + 8);
  face.lineTo(bx, by);
  face.bezierCurveTo(brink[2], brink[3], brink[0], brink[1], px, py);
  face.closePath();
  ctx.fillStyle = linear(ctx, px, 0, rx, 0, [
    [0, spec.shade[0]],
    [1, spec.shade[1]],
  ]);
  ctx.fill(face);
  ctx.strokeStyle = css(spec.rim, 0.75);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.bezierCurveTo(...brink);
  ctx.stroke();
  ctx.restore();
}

/** Dunes — warm late afternoon over a sea of sand, crisp crests between light and shadow. */
const dunes: Painter = (ctx, w, h) => {
  const rng = seeded('scene-dunes');
  const horizon = h * 0.55;
  const haze = hex('#f7dcc0');
  sky(ctx, w, horizon + h * 0.05, [
    [0, hex('#7aa3ca')],
    [0.42, hex('#afc7d6')],
    [0.78, hex('#ead6c2')],
    [1, haze],
  ]);
  sun(ctx, w * 0.36, h * 0.22, h * 0.034, hex('#fff7e6'), hex('#ffd6a3'), h * 0.75);
  streak(ctx, w * 0.72, h * 0.4, w * 0.36, h * 0.012, hex('#fff1e0'), 0.45);
  streak(ctx, w * 0.2, h * 0.46, w * 0.3, h * 0.01, hex('#fff1e0'), 0.4);

  // Far dunes, soft in the haze.
  for (const [base, crests, color] of [
    [
      horizon + h * 0.02,
      [
        [w * 0.12, horizon - h * 0.012, w * 0.16, w * 0.07],
        [w * 0.46, horizon - h * 0.028, w * 0.2, w * 0.08],
        [w * 0.8, horizon - h * 0.018, w * 0.2, w * 0.08],
      ],
      mix(hex('#efc4a6'), haze, 0.55),
    ],
    [
      horizon + h * 0.06,
      [
        [w * 0.28, horizon + h * 0.004, w * 0.2, w * 0.08],
        [w * 0.64, horizon - h * 0.006, w * 0.22, w * 0.09],
        [w * 0.98, horizon + h * 0.01, w * 0.2, w * 0.08],
      ],
      mix(hex('#eebd98'), haze, 0.42),
    ],
  ] as const) {
    ctx.fillStyle = linear(ctx, 0, horizon - h * 0.03, 0, base + h * 0.05, [
      [0, mix(color, WHITE, 0.15)],
      [1, color],
    ]);
    ctx.fill(below(duneProfile(-4, w + 4, base, crests), h + 2));
  }
  const sand = (c: string, t: number) => mix(hex(c), haze, t);
  dune(ctx, rng, h, {
    peak: [w * 0.8, horizon + h * 0.01],
    from: [w * 0.42, horizon + h * 0.13],
    to: [w + 40, horizon + h * 0.1],
    brink: [w * 0.97, h],
    lit: [sand('#f2c49a', 0.3), sand('#eab286', 0.3)],
    shade: [sand('#c27d5a', 0.3), sand('#d59a78', 0.3)],
    rim: hex('#fff0dc'),
  });
  dune(ctx, rng, h, {
    peak: [w * 0.2, horizon + h * 0.05],
    from: [-60, horizon + h * 0.16],
    to: [w * 0.66, horizon + h * 0.24],
    brink: [w * 0.46, h],
    lit: [sand('#f1bb8b', 0.15), sand('#e8a673', 0.15)],
    shade: [sand('#b56d48', 0.15), sand('#cf8b63', 0.15)],
    rim: hex('#ffe9cc'),
  });
  dune(ctx, rng, h, {
    peak: [w * 0.56, h * 0.67],
    from: [-60, h * 0.92],
    to: [w + 60, h * 0.99],
    brink: [w * 0.8, h + 4],
    lit: [hex('#f3ad6c'), hex('#e08f52')],
    shade: [hex('#9a4a2b'), hex('#c46a3c')],
    rim: hex('#ffdcae'),
    ripples: 1,
  });
  develop(ctx, w, h, 23, 0.3);
  return full(w, h);
};

/** Alpine — a clear day over snow peaks, a forested shore and a still lake that mirrors them. */
const alpine: Painter = (ctx, w, h) => {
  const rng = seeded('scene-alpine');
  const shore = Math.round(h * 0.63);
  const lakeBottom = Math.round(h * 0.86);
  const haze = hex('#d3e3ef');
  sky(ctx, w, shore, [
    [0, hex('#2a64aa')],
    [0.42, hex('#4c88c8')],
    [0.78, hex('#8ab8df')],
    [1, haze],
  ]);
  glow(ctx, w * 0.02, -h * 0.08, h * 0.95, hex('#fff4dc'), 0.35);
  streak(ctx, w * 0.72, h * 0.1, w * 0.22, h * 0.014, WHITE, 0.45);
  streak(ctx, w * 0.8, h * 0.135, w * 0.14, h * 0.01, WHITE, 0.35);
  mountains(rng, w, shore + 2, {
    base: shore - h * 0.07,
    top: h * 0.15,
    scale: w * 0.26,
    jagged: 0.5,
    massif: [w * 0.44, w * 0.26],
    lit: hex('#b1b8c6'),
    shade: hex('#a2b0d0'),
    snow: { line: h * 0.34, color: hex('#fbf8f3') },
    mist: haze,
    mistAlpha: 0.85,
    prominence: 24,
  }).paint(ctx);
  mountains(rng, w, shore + 2, {
    base: shore - h * 0.015,
    top: h * 0.39,
    scale: w * 0.17,
    jagged: 0.35,
    lit: hex('#7c92aa'),
    shade: hex('#8d9cc0'),
    mist: hex('#bcd2e3'),
    mistAlpha: 0.7,
    prominence: 12,
  }).paint(ctx);
  const ridge = hills(rng, w, shore + 2, {
    base: shore - h * 0.004,
    amp: h * 0.055,
    scale: w * 0.18,
    color: hex('#3f6360'),
    crest: hex('#4d726b'),
    mist: hex('#5f8583'),
  });
  ridge.paint(ctx);
  ctx.fillStyle = css(hex('#2f4e4b'));
  forest(ctx, rng, ridge.profile, -10, w + 10, {
    spacing: 7,
    height: [h * 0.02, h * 0.045],
    sink: 6,
  });
  // The lake: the scene mirrored, darkened and cooled, broken by faint ripples.
  mirror(ctx, rng, w, shore, lakeBottom, 3);
  ctx.fillStyle = linear(ctx, 0, shore, 0, lakeBottom, [
    [0, hex('#2c5d78'), 0.3],
    [1, hex('#163f58'), 0.6],
  ]);
  ctx.fillRect(0, shore, w, lakeBottom - shore);
  ripples(ctx, rng, w, shore, lakeBottom, hex('#d7ebf5'), 0.26, hex('#0f3148'), 0.2, 0.45);
  ctx.fillStyle = css(hex('#e4f1f7'), 0.5);
  ctx.fillRect(0, shore, w, 1.5);
  // Near shore: a meadow bank and tall firs framing the view.
  const bankN = fbm1(rng, 3);
  const bank = profile(-4, w + 4, 4, (x) => lakeBottom - 4 + bankN(x / 120) * h * 0.02);
  ctx.fillStyle = linear(ctx, 0, lakeBottom - 10, 0, h, [
    [0, hex('#6c8a4a')],
    [1, hex('#34502e')],
  ]);
  ctx.fill(below(bank, h + 2));
  grass(
    ctx,
    rng,
    -10,
    w + 10,
    (x) => heightAt(bank, x) + 12,
    h * 0.045,
    [hex('#5a7a3e'), hex('#7c9750'), hex('#46652f')],
    420,
    0.1,
  );
  ctx.fillStyle = css(hex('#1b3530'));
  for (const [x, size] of [
    [w * 0.03, 0.42],
    [w * 0.075, 0.33],
    [w * 0.115, 0.26],
    [w * 0.9, 0.36],
    [w * 0.95, 0.46],
    [w * 0.99, 0.3],
  ] as const) {
    pine(ctx, rng, x, h + 6, h * size, h * size * 0.34);
  }
  develop(ctx, w, h, 37, 0.3);
  return full(w, h);
};

/** Meadow — summer hills in layers of green, fields in perspective, wildflowers up close. */
const meadow: Painter = (ctx, w, h) => {
  const rng = seeded('scene-meadow');
  const horizon = h * 0.5;
  const haze = hex('#e2ede9');
  sky(ctx, w, horizon + h * 0.05, [
    [0, hex('#5b9ad6')],
    [0.5, hex('#8fbfe5')],
    [0.85, hex('#cde2ec')],
    [1, haze],
  ]);
  sun(ctx, w * 0.66, h * 0.1, h * 0.028, hex('#fffcef'), hex('#fff4d6'), h * 0.55);
  cumulus(ctx, rng, w * 0.22, h * 0.31, w * 0.28, WHITE, hex('#b9c9d9'), 1);
  cumulus(ctx, rng, w * 0.57, h * 0.38, w * 0.15, WHITE, hex('#c2d0de'), 1);
  cumulus(ctx, rng, w * 0.88, h * 0.29, w * 0.22, WHITE, hex('#b9c9d9'), -1);

  hills(rng, w, h, {
    base: horizon + h * 0.02,
    amp: h * 0.07,
    scale: w * 0.12,
    color: hex('#a6c0b9'),
    crest: hex('#b3cbc3'),
  }).paint(ctx);
  const second = hills(rng, w, h, {
    base: horizon + h * 0.09,
    amp: h * 0.09,
    scale: w * 0.2,
    color: hex('#8fb487'),
    crest: hex('#a3c496'),
  });
  second.paint(ctx);
  // Trees along the second ridge, and a farmhouse among them.
  const shade = new Path2D();
  const lit = new Path2D();
  const trunk = new Path2D();
  for (let x = w * 0.05; x < w * 0.95; x += rng.range(18, 70)) {
    if (rng.chance(0.3)) continue;
    const y = heightAt(second.profile, x) + rng.range(2, 12);
    leafyTree(shade, lit, trunk, rng, x, y, rng.range(14, 26), 1);
  }
  ctx.fillStyle = css(hex('#5b6b50'));
  ctx.fill(trunk);
  ctx.fillStyle = css(hex('#4f7a4f'));
  ctx.fill(shade);
  ctx.fillStyle = css(hex('#77a064'));
  ctx.fill(lit);
  const hx = w * 0.37;
  const hy = heightAt(second.profile, hx) + 14;
  ctx.fillStyle = css(hex('#efe9dc'));
  ctx.fillRect(hx - 18, hy - 16, 36, 16);
  ctx.fillStyle = css(hex('#c9c0ae'));
  ctx.fillRect(hx + 8, hy - 16, 10, 16);
  ctx.fillStyle = css(hex('#a8513d'));
  ctx.beginPath();
  ctx.moveTo(hx - 21, hy - 15);
  ctx.lineTo(hx - 12, hy - 27);
  ctx.lineTo(hx + 14, hy - 27);
  ctx.lineTo(hx + 21, hy - 15);
  ctx.fill();

  // The third hill: fields in perspective — rows thinning into the distance, split by
  // hedgerows that converge toward the center.
  const third = hills(rng, w, h, {
    base: horizon + h * 0.2,
    amp: h * 0.1,
    scale: w * 0.3,
    color: hex('#7eae5f'),
    crest: hex('#90bd6c'),
  });
  third.paint(ctx);
  ctx.save();
  ctx.clip(below(third.profile, h + 2));
  const fieldColors = [
    hex('#a9c46a'),
    hex('#88b457'),
    hex('#c9c77a'),
    hex('#76a651'),
    hex('#b7cf7b'),
    hex('#d4c47e'),
  ].map((c) => mix(c, haze, 0.12));
  const hedges = new Path2D();
  const nearY = h * 0.84;
  const rows = 6;
  const vanish = w * 0.5;
  const row = (k: number) => (x: number) => {
    const t = heightAt(third.profile, x);
    return t + (nearY - t) * (k / rows) ** 1.7;
  };
  for (let k = 0; k < rows; k++) {
    const upper = row(k);
    const lower = row(k + 1);
    const spread = 0.8 + (k / rows) * 0.2;
    let xb = -w * 0.2;
    while (xb < w * 1.2) {
      const next = xb + w * rng.range(0.1, 0.3) * (0.6 + k / rows);
      const cut = (x: number) => vanish + (x - vanish) * spread;
      const patch = new Path2D();
      patch.moveTo(cut(xb), upper(cut(xb)));
      for (let x = xb; x <= next; x += 10) patch.lineTo(cut(x), upper(cut(x)));
      patch.lineTo(cut(next), upper(cut(next)));
      patch.lineTo(next, lower(next));
      for (let x = next; x >= xb; x -= 10) patch.lineTo(x, lower(x));
      patch.lineTo(xb, lower(xb));
      patch.closePath();
      ctx.fillStyle = css(rng.pick(fieldColors));
      ctx.fill(patch);
      hedges.moveTo(cut(next), upper(cut(next)));
      hedges.lineTo(next, lower(next));
      xb = next;
    }
    hedges.moveTo(-10, lower(-10));
    for (let x = -10; x <= w + 10; x += 8) hedges.lineTo(x, lower(x));
  }
  ctx.strokeStyle = css(hex('#4f7d3f'), 0.85);
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.stroke(hedges);
  ctx.restore();

  // The near slope, grass and wildflowers.
  const nearN = fbm1(rng, 3);
  const near = profile(
    -4,
    w + 4,
    4,
    (x) => h * 0.82 - (x / w) * h * 0.05 + nearN(x / 160) * h * 0.02,
  );
  ctx.fillStyle = linear(ctx, 0, h * 0.76, 0, h, [
    [0, hex('#6aa54a')],
    [1, hex('#3f7a32')],
  ]);
  ctx.fill(below(near, h + 2));
  grass(
    ctx,
    rng,
    -10,
    w + 10,
    (x) => heightAt(near, x) + 6,
    h * 0.035,
    [hex('#5b9a40'), hex('#7ab456'), hex('#4a8636')],
    700,
    0.15,
  );
  const blossoms = [hex('#ffffff'), hex('#ffe066'), hex('#f28cb8'), hex('#b69cf0'), hex('#ff9a5c')];
  dots(
    ctx,
    rng,
    380,
    () => {
      const x = rng.next() * w;
      const d = rng.next() ** 0.7;
      const y = heightAt(near, x) + 8 + d * (h - heightAt(near, x));
      return [x, y, 1.2 + d * 4.2];
    },
    blossoms,
  );
  grass(
    ctx,
    rng,
    -10,
    w + 10,
    () => h + 4,
    h * 0.12,
    [hex('#3f7a2e'), hex('#5f9a42'), hex('#86b85c'), hex('#2f6526')],
    560,
    0.25,
  );
  dots(
    ctx,
    rng,
    70,
    () => [rng.next() * w, h - rng.range(h * 0.02, h * 0.1), rng.range(4, 7.5)],
    blossoms,
  );
  develop(ctx, w, h, 41, 0.28);
  return full(w, h);
};

/** A small bird in flight: two arcs. */
function bird(path: Path2D, x: number, y: number, span: number, lift: number) {
  path.moveTo(x - span, y - lift);
  path.quadraticCurveTo(x - span * 0.45, y - lift * 1.4, x, y);
  path.quadraticCurveTo(x + span * 0.45, y - lift * 1.4, x + span, y - lift);
}

/** Dusk — the sun setting between hills into still water, the sky from gold to violet. */
const dusk: Painter = (ctx, w, h) => {
  const rng = seeded('scene-dusk');
  const horizon = Math.round(h * 0.6);
  const sunX = w * 0.5;
  sky(ctx, w, horizon, [
    [0, hex('#221f4c')],
    [0.28, hex('#48336f')],
    [0.52, hex('#93457a')],
    [0.7, hex('#d7666a')],
    [0.85, hex('#f29a61')],
    [0.95, hex('#fbc47e')],
    [1, hex('#ffdc9f')],
  ]);
  sun(ctx, sunX, horizon - h * 0.018, h * 0.05, hex('#fff2c9'), hex('#ffac6b'), h * 0.85, 1.1);
  for (const [x, y, len, thick] of [
    [w * 0.24, h * 0.3, w * 0.34, h * 0.018],
    [w * 0.7, h * 0.24, w * 0.4, h * 0.02],
    [w * 0.58, h * 0.38, w * 0.3, h * 0.012],
    [w * 0.12, h * 0.44, w * 0.22, h * 0.01],
    [w * 0.86, h * 0.47, w * 0.26, h * 0.01],
  ] as const) {
    streak(ctx, x, y, len, thick, hex('#5b3569'), 0.55);
    streak(ctx, x + len * 0.04, y + thick * 0.45, len * 0.82, thick * 0.55, hex('#ff9f7c'), 0.7);
  }
  const left = hills(rng, w, horizon + 2, {
    base: horizon,
    amp: h * 0.1,
    scale: w * 0.1,
    color: hex('#8c5579'),
    crest: hex('#9a6184'),
  });
  const leftFar = profile(-4, w * 0.42, 3, (x) => {
    const u = x / (w * 0.42);
    return lerp(heightAt(left.profile, x), horizon + 1, smoothstep(0.35, 1, u));
  });
  ctx.fillStyle = css(hex('#a8667f'));
  ctx.fill(below(leftFar, horizon + 2));
  const right = hills(rng, w, horizon + 2, {
    base: horizon,
    amp: h * 0.14,
    scale: w * 0.12,
    color: hex('#5c2f5a'),
    crest: hex('#6c3a66'),
  });
  const rightNear = profile(w * 0.6, w + 4, 3, (x) => {
    const u = (x - w * 0.6) / (w * 0.4);
    return lerp(horizon + 1, heightAt(right.profile, x) - h * 0.04 * u, smoothstep(0, 0.45, u));
  });
  ctx.fillStyle = linear(ctx, 0, horizon - h * 0.2, 0, horizon, [
    [0, hex('#61325c')],
    [1, hex('#7a4468')],
  ]);
  ctx.fill(below(rightNear, horizon + 2));
  // Water: the sky mirrored, swelling toward the viewer, darker and cooler.
  mirror(ctx, rng, w, horizon, h, 7);
  ctx.fillStyle = linear(ctx, 0, horizon, 0, h, [
    [0, hex('#3d2150'), 0.15],
    [0.4, hex('#2e1a45'), 0.42],
    [1, hex('#1a1030'), 0.68],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);
  ripples(ctx, rng, w, horizon, h, hex('#ffb98a'), 0.3, hex('#1d1030'), 0.32, 0.8);
  ctx.save();
  ctx.translate(sunX, horizon);
  ctx.scale(0.45, 2.6);
  glow(ctx, 0, 0, h * 0.16, hex('#ffc27a'), 0.45);
  ctx.restore();
  glitter(ctx, rng, sunX, horizon, h, w * 0.035, hex('#ffe2a8'), 650);
  // Reeds in the near corners, birds heading home.
  ctx.fillStyle = css(hex('#170c22'));
  for (const [x0, x1, n] of [
    [-10, w * 0.2, 60],
    [w * 0.86, w + 10, 36],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const x = rng.range(x0, x1);
      const tall = h * rng.range(0.08, 0.26) * (1 - Math.abs((x - (x0 + x1) / 2) / (x1 - x0)));
      const bend = rng.range(-0.08, 0.14) * tall;
      ctx.beginPath();
      ctx.moveTo(x - 1.3, h + 4);
      ctx.lineTo(x + bend * 0.35 - 0.8, h - tall * 0.5);
      ctx.lineTo(x + bend, h - tall);
      ctx.lineTo(x + bend * 0.35 + 0.8, h - tall * 0.5);
      ctx.lineTo(x + 1.3, h + 4);
      ctx.fill();
      if (rng.chance(0.45)) {
        ctx.beginPath();
        ctx.ellipse(x + bend, h - tall - 6, 3, 13, bend / tall, 0, TAU);
        ctx.fill();
      }
    }
  }
  const birds = new Path2D();
  bird(birds, w * 0.66, h * 0.2, 9, 3);
  bird(birds, w * 0.69, h * 0.18, 7, 2.5);
  bird(birds, w * 0.715, h * 0.215, 6, 2);
  ctx.strokeStyle = css(hex('#2a1733'), 0.9);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke(birds);
  develop(ctx, w, h, 53, 0.36);
  return full(w, h);
};

/** Night — the Milky Way over moonlit peaks, a cabin's window mirrored in the lake. */
const night: Painter = (ctx, w, h) => {
  const rng = seeded('scene-night');
  const shore = Math.round(h * 0.66);
  sky(ctx, w, shore, [
    [0, hex('#03061a')],
    [0.35, hex('#08112f')],
    [0.72, hex('#132352')],
    [1, hex('#2b4277')],
  ]);
  // The Milky Way: a soft diagonal glow, a warmer core, dust lanes, a drift of faint stars.
  const band = (t: number) => ({
    x: lerp(-w * 0.05, w * 1.05, t),
    y: lerp(h * 0.66, -h * 0.12, t),
  });
  const angle = Math.atan2(-h * 0.78, w * 1.1);
  const along = (x: number, y: number, r: number, stretch: number, color: Color, a: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(stretch, 1);
    glow(ctx, 0, 0, r, color, a);
    ctx.restore();
  };
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 18; i++) {
    const t = (i + rng.next()) / 18;
    const { x, y } = band(t);
    const off = rng.gauss(0.5) * h * 0.035;
    const warm = t < 0.35 && rng.chance(0.6);
    const color = warm ? hex('#dcc5c6') : rng.chance(0.35) ? hex('#b4a0dc') : hex('#8fa4df');
    along(x, y + off, rng.range(h * 0.07, h * 0.13), 2.6, color, rng.range(0.1, 0.18));
  }
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 14; i++) {
    const { x, y } = band(0.05 + rng.next() * 0.85);
    const off = h * 0.01 + rng.gauss(0.5) * h * 0.01;
    along(x, y + off, rng.range(h * 0.012, h * 0.03), 4, hex('#343a66'), 0.45);
  }
  ctx.globalCompositeOperation = 'source-over';
  const stars = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const place = (n: number, drift: boolean) => {
    for (let i = 0; i < n; i++) {
      let x: number;
      let y: number;
      if (drift) {
        const b = band(rng.next());
        const off = rng.gauss(0.5) * h * 0.075;
        x = b.x + off * 0.45;
        y = b.y + off;
      } else {
        x = rng.next() * w;
        y = rng.next() ** 1.25 * shore;
      }
      const light = rng.next() ** (drift ? 4 : 2.6);
      const bin = Math.min(3, Math.floor(light * 4));
      if (bin < 2) {
        stars[bin]!.rect(x, y, 1.2, 1.2);
      } else {
        const r = 0.7 + light * 1.3;
        stars[bin]!.moveTo(x + r, y);
        stars[bin]!.arc(x, y, r, 0, TAU);
      }
    }
  };
  place(800, false);
  place(1600, true);
  const starlight = hex('#eef1ff');
  [0.4, 0.62, 0.85, 1].forEach((alpha, i) => {
    ctx.fillStyle = css(starlight, alpha);
    ctx.fill(stars[i]!);
  });
  for (let i = 0; i < 14; i++) {
    const x = rng.next() * w;
    const y = rng.next() ** 1.4 * shore * 0.8;
    const tint = rng.pick([hex('#ffffff'), hex('#ffe3c2'), hex('#cfe0ff')]);
    glow(ctx, x, y, rng.range(5, 10), tint, 0.5);
    ctx.fillStyle = css(tint);
    ctx.beginPath();
    ctx.arc(x, y, rng.range(1.3, 2), 0, TAU);
    ctx.fill();
  }
  // A faint afterglow along the horizon.
  ctx.fillStyle = linear(ctx, 0, shore - h * 0.2, 0, shore, [
    [0, hex('#3c5a8e'), 0],
    [1, hex('#56709e'), 0.55],
  ]);
  ctx.fillRect(0, shore - h * 0.2, w, h * 0.2 + 2);
  // A waxing crescent: earthshine on the dark side, a glow around it.
  const moonX = w * 0.7;
  const moonY = h * 0.18;
  const r = h * 0.04;
  glow(ctx, moonX, moonY, h * 0.22, hex('#c9d6ff'), 0.22);
  ctx.fillStyle = css(hex('#131d42'));
  ctx.beginPath();
  ctx.arc(moonX, moonY, r, 0, TAU);
  ctx.fill();
  const crescent = new Path2D();
  crescent.arc(moonX, moonY, r, 0, TAU);
  crescent.arc(moonX + r * 0.42, moonY - r * 0.16, r * 0.98, 0, TAU, true);
  ctx.save();
  ctx.beginPath();
  ctx.arc(moonX, moonY, r, 0, TAU);
  ctx.clip();
  ctx.fillStyle = radial(ctx, moonX - r * 0.3, moonY, r * 1.2, [
    [0, hex('#fffdf2')],
    [1, hex('#e9e6d6')],
  ]);
  ctx.fill(crescent, 'evenodd');
  ctx.restore();
  // Moonlit peaks (light from the right), a forested ridge, the shore.
  mountains(rng, w, shore + 2, {
    base: shore - h * 0.04,
    top: h * 0.36,
    scale: w * 0.24,
    jagged: 0.4,
    massif: [w * 0.3, w * 0.35],
    lit: hex('#1d2a4c'),
    shade: hex('#7d89b6'),
    snow: { line: h * 0.45, color: hex('#7688bb'), streaks: 0.08 },
    mist: hex('#2c3f70'),
    mistAlpha: 0.75,
    light: -1,
    prominence: 16,
  }).paint(ctx);
  const ridge = hills(rng, w, shore + 2, {
    base: shore,
    amp: h * 0.05,
    scale: w * 0.15,
    color: hex('#111a36'),
    crest: hex('#16213f'),
  });
  ridge.paint(ctx);
  ctx.fillStyle = css(hex('#0a1128'));
  forest(ctx, rng, ridge.profile, -10, w + 10, {
    spacing: 8,
    height: [h * 0.022, h * 0.05],
    sink: 6,
  });
  // A cabin on the far shore, its window lit.
  const cx = w * 0.28;
  const cy = shore + 1;
  ctx.fillStyle = css(hex('#070b1c'));
  ctx.fillRect(cx - 22, cy - 18, 44, 18);
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy - 17);
  ctx.lineTo(cx, cy - 33);
  ctx.lineTo(cx + 26, cy - 17);
  ctx.fill();
  glow(ctx, cx - 6, cy - 9, 40, hex('#ffb659'), 0.45);
  ctx.fillStyle = css(hex('#ffd38a'));
  ctx.fillRect(cx - 10, cy - 12, 8, 6);
  // The lake mirrors it all.
  mirror(ctx, rng, w, shore, h, 3);
  ctx.fillStyle = linear(ctx, 0, shore, 0, h, [
    [0, hex('#0a1330'), 0.3],
    [1, hex('#050a1c'), 0.7],
  ]);
  ctx.fillRect(0, shore, w, h - shore);
  ripples(ctx, rng, w, shore, h, hex('#a9b8e6'), 0.14, hex('#02050f'), 0.3, 0.5);
  glitter(ctx, rng, moonX, shore, h, w * 0.02, hex('#e6ecff'), 240, 0.7);
  glitter(ctx, rng, cx - 6, shore + 2, shore + h * 0.14, w * 0.004, hex('#ffcf87'), 60, 0.8);
  // The near bank in silhouette.
  const bankN = fbm1(rng, 3);
  const bank = profile(-4, w + 4, 4, (x) => h * 0.94 + bankN(x / 90) * h * 0.02);
  ctx.fillStyle = css(hex('#050916'));
  ctx.fill(below(bank, h + 2));
  for (const [x, size] of [
    [w * 0.02, 0.5],
    [w * 0.06, 0.36],
    [w * 0.93, 0.4],
    [w * 0.975, 0.55],
  ] as const) {
    pine(ctx, rng, x, h + 6, h * size, h * size * 0.34);
  }
  develop(ctx, w, h, 67, 0.4);
  return full(w, h);
};

/** Scene painters in id order: coast, dunes, alpine, meadow, dusk, night. */
export const SCENES: readonly Painter[] = [coast, dunes, alpine, meadow, dusk, night];
