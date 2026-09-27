/**
 * Objects (1200 × 1600): studio "product renders" on a transparent background — bottle, can,
 * speaker, phone, watch. No floor shadow (templates draw their own contact shadows); the ink
 * is the tight bounds of the object.
 *
 * Round bodies are surfaces of revolution lit by one studio rig (key softbox front-left, fill
 * card front-right, strip lights behind both edges, an overhead softbox): the rig is baked into
 * textures — diffuse light and specular reflection for every position across the surface and
 * every tilt of it — which are mapped onto the silhouette row by row. Albedo (paint, print,
 * fabric) is drawn first, the diffuse light multiplied over it, reflections screened on top:
 * highlights, rim lights and Fresnel edges come out of the rig, and printed marks are lit like
 * the surface they sit on.
 */

import type { Color } from '../../core/color';
import { clamp01, type Rect, smoothstep } from '../../core/math';
import {
  bounds,
  type Ctx,
  css,
  grain,
  hex,
  linear,
  mix,
  type Painter,
  type Rng,
  radial,
  seeded,
  softFill,
  TAU,
} from './kit';

const WHITE = hex('#ffffff');
const BLACK = hex('#000000');

// --- the studio -----------------------------------------------------------------------------

/** Texture columns across a surface (left edge → right edge). */
const U = 128;
/** Tilts of a surface, from facing down to facing up (texture rows, each stored 3× against bleed). */
const T = 41;
const TILT = Math.PI * 0.94;

/** Angular distance, wrapped to [-π, π]. */
const angle = (a: number, b: number) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/** 1 inside a soft-edged band of half-width `half` around 0, fading over `edge`. */
const band = (d: number, half: number, edge: number) =>
  1 - smoothstep(half, half + edge, Math.abs(d));

/**
 * The studio's lights (θ azimuth, 0 = toward the camera, positive to the right; ψ elevation):
 * a big key softbox front-left and a thin kicker strip beside it, a fill card front-right, strip
 * lights behind the object's edges. Each is a soft-edged band in θ times one in ψ: radiance,
 * θ center, half-width, edge, then the same for ψ.
 */
const PANELS: readonly (readonly [number, number, number, number, number, number, number])[] = [
  [5, -0.78, 0.28, 0.12, 0.15, 0.55, 0.2],
  [7, -1.3, 0.018, 0.02, 0.1, 0.9, 0.2],
  [1.4, 0.95, 0.18, 0.12, 0.1, 0.5, 0.2],
  [3.4, -2.5, 0.06, 0.06, 0.1, 0.85, 0.25],
  [4.4, 2.52, 0.07, 0.06, 0.1, 0.85, 0.25],
];

/** The room around the panels, by elevation: dark walls, a softbox overhead, a pale floor. */
const room = (psi: number) =>
  0.03 +
  0.05 * Math.max(0, psi) +
  2.4 * smoothstep(0.85, 1.25, psi) +
  0.35 * smoothstep(0.35, 0.9, -psi);

/** The studio as an equirectangular map: θ in 1.5° bins, ψ in 3° bins. */
const EW = 240;
const EH = 60;
let studioMap: Float32Array | null = null;
const blurredMaps = new Map<number, Float32Array>();

/** One box-blur pass along θ (wrapping around) and one along ψ (clamped), radii in bins. */
function boxBlur(src: Float32Array, rt: number, rp: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const spanT = 2 * rt + 1;
  for (let j = 0; j < EH; j++) {
    const row = j * EW;
    let sum = 0;
    for (let k = -rt; k <= rt; k++) sum += src[row + ((k + EW) % EW)]!;
    for (let i = 0; i < EW; i++) {
      tmp[row + i] = sum / spanT;
      sum += src[row + ((i + rt + 1) % EW)]! - src[row + ((i - rt + EW) % EW)]!;
    }
  }
  const spanP = 2 * rp + 1;
  const clampRow = (j: number) => (j < 0 ? 0 : j >= EH ? EH - 1 : j) * EW;
  for (let i = 0; i < EW; i++) {
    let sum = 0;
    for (let k = -rp; k <= rp; k++) sum += tmp[clampRow(k) + i]!;
    for (let j = 0; j < EH; j++) {
      out[j * EW + i] = sum / spanP;
      sum += tmp[clampRow(j + rp + 1) + i]! - tmp[clampRow(j - rp) + i]!;
    }
  }
  return out;
}

/** The studio map blurred by `roughness` (radians): what a rough surface reflects. */
function reflections(roughness: number): Float32Array {
  const key = Math.round(roughness * 1000);
  const cached = blurredMaps.get(key);
  if (cached) return cached;
  if (!studioMap) {
    // Panels are separable (a band in θ times one in ψ): each axis is evaluated once.
    const map = new Float32Array(EW * EH);
    for (let j = 0; j < EH; j++)
      map.fill(room(((j + 0.5) / EH - 0.5) * Math.PI), j * EW, (j + 1) * EW);
    for (const [k, t0, th, te, p0, ph, pe] of PANELS) {
      const across = new Float32Array(EW);
      for (let i = 0; i < EW; i++) {
        across[i] = k * band(angle(((i + 0.5) / EW - 0.5) * TAU, t0), th, te);
      }
      for (let j = 0; j < EH; j++) {
        const up = band(((j + 0.5) / EH - 0.5) * Math.PI - p0, ph, pe);
        if (up <= 0) continue;
        for (let i = 0; i < EW; i++) map[j * EW + i] = map[j * EW + i]! + across[i]! * up;
      }
    }
    studioMap = map;
  }
  // Two box passes approximate a Gaussian of σ ≈ roughness.
  const rt = Math.round(roughness / (TAU / EW) / 1.4);
  const rp = Math.round(roughness / (Math.PI / EH) / 1.4);
  const map = boxBlur(boxBlur(studioMap, rt, rp), rt, rp);
  blurredMaps.set(key, map);
  return map;
}

/** Bilinear lookup of a studio map. */
function lookup(map: Float32Array, theta: number, psi: number): number {
  const x = (theta / TAU + 0.5) * EW - 0.5;
  const y = Math.max(0, Math.min(EH - 1.001, (psi / Math.PI + 0.5) * EH - 0.5));
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const i0 = ((i % EW) + EW) % EW;
  const i1 = (i0 + 1) % EW;
  const a = map[j * EW + i0]! + (map[j * EW + i1]! - map[j * EW + i0]!) * fx;
  const b = map[(j + 1) * EW + i0]! + (map[(j + 1) * EW + i1]! - map[(j + 1) * EW + i0]!) * fx;
  return a + (b - a) * fy;
}

/** Diffuse lights matching the studio: direction (toward the light) and strength. */
const LIGHTS: readonly (readonly [number, number, number, number])[] = [
  [-0.68, 0.28, 0.68, 0.9],
  [0.72, 0.12, 0.68, 0.28],
  [0, 0.97, 0.24, 0.35],
];
const AMBIENT = 0.07;

type Finish = {
  /** Strength of reflections (0 matte … 1 lacquer). */
  gloss: number;
  /** Blur of reflections (0 mirror … 1 very rough), in radians of the studio. */
  roughness: number;
  /** Metals: reflections carry the color (multiplied later) and there's no diffuse. */
  metal?: boolean;
};

/** Baked textures, as bitmaps: drawn row by row, they must not be snapshotted per call. */
type Shading = { diffuse: ImageBitmap; specular: ImageBitmap };

const toByte = (v: number) => Math.round(clamp01(v) * 255);
/** Linear light (0 … 1 in 1/1023 steps) → sRGB-ish bytes: multiplied encodings multiply light. */
const ENCODE = Uint8ClampedArray.from({ length: 1024 }, (_, i) => 255 * (i / 1023) ** (1 / 2.2));

const bakes = new Map<string, Shading>();

/** The studio baked for a finish: diffuse and specular textures, U × 3T. */
function bake(finish: Finish): Shading | null {
  const key = `${finish.gloss}:${finish.roughness}:${finish.metal ? 1 : 0}`;
  const cached = bakes.get(key);
  if (cached) return cached;
  const diffuse = new OffscreenCanvas(U, 3 * T);
  const specular = new OffscreenCanvas(U, 3 * T);
  const dctx = diffuse.getContext('2d');
  const sctx = specular.getContext('2d');
  if (!dctx || !sctx) return null;
  const d = dctx.createImageData(U, 3 * T);
  const s = sctx.createImageData(U, 3 * T);
  const map = reflections(finish.roughness);
  for (let t = 0; t < T; t++) {
    const tau = (t / (T - 1) - 0.5) * TILT;
    const ct = Math.cos(tau);
    const st = Math.sin(tau);
    for (let i = 0; i < U; i++) {
      const u = ((i + 0.5) / U) * 2 - 1;
      const across = Math.sqrt(Math.max(0, 1 - u * u));
      const nx = u * ct;
      const ny = st;
      const nz = across * ct;
      const fresnel = finish.metal ? 1 : 0.04 + 0.96 * (1 - Math.max(0, nz)) ** 5;
      let light = AMBIENT;
      for (const [lx, ly, lz, k] of LIGHTS) light += k * Math.max(0, nx * lx + ny * ly + nz * lz);
      light = finish.metal ? 0 : light * (1 - fresnel * 0.9);
      // The view (0, 0, 1) reflected about the normal.
      const ry = 2 * nz * ny;
      const env = lookup(map, Math.atan2(2 * nz * nx, 2 * nz * nz - 1), Math.asin(clamp(ry)));
      const reflect = finish.gloss * (finish.metal ? 1 : 0.22 + 0.78 * fresnel) * env;
      const dv = ENCODE[Math.round(clamp01(light) * 1023)]!;
      const sv = toByte(1 - Math.exp(-reflect));
      for (let copy = 0; copy < 3; copy++) {
        const k = ((3 * t + copy) * U + i) * 4;
        d.data[k] = dv;
        d.data[k + 1] = dv;
        d.data[k + 2] = dv;
        d.data[k + 3] = 255;
        s.data[k] = sv;
        s.data[k + 1] = sv;
        s.data[k + 2] = sv;
        s.data[k + 3] = 255;
      }
    }
  }
  dctx.putImageData(d, 0, 0);
  sctx.putImageData(s, 0, 0);
  const shading = {
    diffuse: diffuse.transferToImageBitmap(),
    specular: specular.transferToImageBitmap(),
  };
  bakes.set(key, shading);
  return shading;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

// --- surfaces of revolution -----------------------------------------------------------------

/** Seen slightly from above: a rim of radius r shows as an ellipse r × r·ELLIPSE. */
const ELLIPSE = 0.13;

type Lathe = {
  cx: number;
  top: number;
  bottom: number;
  /** Half-width at y (top ≤ y ≤ bottom). */
  radius: (y: number) => number;
};

/** The outline of a lathe: its sides, the front arc of its bottom rim, the back arc of its top. */
function outline(p: Lathe): Path2D {
  const path = new Path2D();
  const r0 = p.radius(p.top);
  const r1 = p.radius(p.bottom);
  path.moveTo(p.cx - r0, p.top);
  for (let y = p.top; y < p.bottom; y += 2) path.lineTo(p.cx - p.radius(y), y);
  path.lineTo(p.cx - r1, p.bottom);
  if (r1 > 0) path.ellipse(p.cx, p.bottom, r1, r1 * ELLIPSE, 0, Math.PI, 0, true);
  for (let y = p.bottom; y > p.top; y -= 2) path.lineTo(p.cx + p.radius(y), y);
  path.lineTo(p.cx + r0, p.top);
  if (r0 > 0) path.ellipse(p.cx, p.top, r0, r0 * ELLIPSE, 0, 0, -Math.PI, true);
  path.closePath();
  return path;
}

/** Bounds of a lathe's outline. */
function latheBounds(p: Lathe): Rect {
  let r = 0;
  for (let y = p.top; y <= p.bottom; y += 1) r = Math.max(r, p.radius(y));
  const r0 = p.radius(p.top);
  const r1 = p.radius(p.bottom);
  return {
    x: p.cx - r,
    y: p.top - r0 * ELLIPSE,
    w: 2 * r,
    h: p.bottom + r1 * ELLIPSE - (p.top - r0 * ELLIPSE),
  };
}

/**
 * Maps a baked texture onto a lathe row by row (runs of equal rows are drawn at once), in the
 * current composite mode. The caller clips to the outline.
 */
function mapRows(ctx: Ctx, p: Lathe, texture: ImageBitmap) {
  const last = p.bottom + p.radius(p.bottom) * ELLIPSE + 1;
  const rowOf = (y: number) => {
    const a = p.radius(Math.max(p.top, y - 1.5));
    const b = p.radius(Math.min(p.bottom, y + 1.5));
    const tau = Math.atan((b - a) / 3);
    return Math.max(0, Math.min(T - 1, Math.round((tau / TILT + 0.5) * (T - 1))));
  };
  let y = Math.floor(p.top - p.radius(p.top) * ELLIPSE);
  while (y < last) {
    const yy = Math.min(Math.max(y, p.top), p.bottom);
    const r = p.radius(yy);
    const row = rowOf(yy);
    let run = 1;
    while (y + run < last) {
      const next = Math.min(Math.max(y + run, p.top), p.bottom);
      if (Math.abs(p.radius(next) - r) > 0.3 || rowOf(next) !== row) break;
      run++;
    }
    ctx.drawImage(texture, 0, 3 * row + 1, U, 1, p.cx - r - 1, y, 2 * r + 2, run);
    y += run;
  }
}

/**
 * Paints a lathe: `albedo` (paint, print), the studio's diffuse light multiplied over it and its
 * reflections screened on top — metals take their color from `albedo` multiplied over the
 * reflections instead — then `detail` (texture, seams). The shading happens on an opaque layer
 * that is composited once through the outline, so blend modes never touch a half-covered edge
 * pixel: the silhouette keeps clean anti-aliasing, without fringes.
 */
function lathe(
  ctx: Ctx,
  p: Lathe,
  finish: Finish,
  albedo: (ctx: Ctx) => void,
  detail?: (ctx: Ctx) => void,
) {
  const box = latheBounds(p);
  const x = Math.floor(box.x) - 2;
  const y = Math.floor(box.y) - 2;
  const layer = new OffscreenCanvas(Math.ceil(box.w) + 5, Math.ceil(box.h) + 5);
  const c = layer.getContext('2d');
  const shading = bake(finish);
  if (!c || !shading) return;
  c.translate(-x, -y);
  if (finish.metal) {
    mapRows(c, p, shading.specular);
    c.globalCompositeOperation = 'multiply';
    albedo(c);
  } else {
    albedo(c);
    c.globalCompositeOperation = 'multiply';
    mapRows(c, p, shading.diffuse);
    c.globalCompositeOperation = 'screen';
    mapRows(c, p, shading.specular);
  }
  c.globalCompositeOperation = 'source-over';
  detail?.(c);
  ctx.save();
  ctx.clip(outline(p));
  ctx.drawImage(layer, x, y);
  ctx.restore();
}

/** The top face of a lathe (seen from above): an ellipse lit by the overhead softbox. */
function topFace(ctx: Ctx, cx: number, y: number, r: number, base: Color, light: Color) {
  const ry = r * ELLIPSE;
  ctx.fillStyle = linear(ctx, cx - r, y - ry, cx + r * 0.6, y + ry, [
    [0, light],
    [0.55, mix(light, base, 0.5)],
    [1, base],
  ]);
  ctx.beginPath();
  ctx.ellipse(cx, y, r, ry, 0, 0, TAU);
  ctx.fill();
}

/** A shape's position across a round surface: x for angle `a` (0 = facing the camera). */
const around = (cx: number, r: number, a: number) => cx + r * Math.sin(a);

// --- the objects --------------------------------------------------------------------------

/** Aero Bottle — an insulated steel bottle: coral powder coat, steel collar, black loop cap. */
const bottle: Painter = (ctx) => {
  const cx = 600;
  const body: Lathe = {
    cx,
    top: 392,
    bottom: 1486,
    radius: (y) => {
      if (y < 402) return 152;
      if (y < 560) return 152 + 50 * smoothstep(402, 560, y) ** 0.9;
      if (y < 1452) return 202 - 3 * ((y - 560) / 892);
      const k = (y - 1452) / 34;
      return 199 - 26 * (1 - Math.sqrt(Math.max(0, 1 - k * k)));
    },
  };
  const collar: Lathe = { cx, top: 352, bottom: 396, radius: () => 156 };
  const cap: Lathe = {
    cx,
    top: 176,
    bottom: 356,
    radius: (y) => {
      const k = clamp01((y - 176) / 22);
      return 118 + 26 * Math.sqrt(1 - (1 - k) * (1 - k));
    },
  };
  const coral = hex('#f0694a');
  lathe(
    ctx,
    body,
    { gloss: 0.55, roughness: 0.1 },
    (c) => {
      c.fillStyle = css(coral);
      c.fillRect(0, 0, 1200, 1600);
      // The Aero mark, printed in white on the front.
      const mx = cx;
      const my = 880;
      const s = 46;
      c.fillStyle = css(hex('#fbf4ee'));
      c.beginPath();
      c.arc(mx - s * 0.18, my, s, 0, TAU);
      c.arc(mx - s * 0.18, my, s * 0.62, 0, TAU, true);
      c.fill();
      c.fillRect(mx + s * 0.64, my - s, s * 0.36, s * 2);
    },
    (c) => {
      // A satin finish: fine texture in the powder coat.
      grain(c, latheBounds(body), 0.1, 7);
      // Where the body meets the collar, a hairline of shadow.
      c.fillStyle = css(BLACK, 0.35);
      c.beginPath();
      c.ellipse(cx, 398, 152, 152 * ELLIPSE, 0, 0, Math.PI);
      c.ellipse(cx, 404, 152, 152 * ELLIPSE, 0, Math.PI, 0, true);
      c.fill();
    },
  );
  lathe(ctx, collar, { gloss: 1, roughness: 0.05, metal: true }, (c) => {
    c.fillStyle = css(hex('#d9dde2'));
    c.fillRect(0, 0, 1200, 1600);
  });
  // The cap: matte black with fine vertical grip ribs on its lower part.
  lathe(ctx, cap, { gloss: 0.35, roughness: 0.4 }, (c) => {
    c.fillStyle = css(hex('#26272b'));
    c.fillRect(0, 0, 1200, 1600);
    c.fillStyle = css(hex('#3a3b40'));
    for (let a = -1.5; a <= 1.5; a += 0.07) {
      const x = around(cx, 144, a);
      c.fillRect(x - 1.6 * Math.cos(a), 250, 3.2 * Math.cos(a), 104);
    }
  });
  topFace(ctx, cx, 176, 118, hex('#1d1e21'), hex('#55575d'));
  // The carry loop standing on the cap.
  const loop = new Path2D();
  const base = 180;
  loop.moveTo(cx - 86, base);
  loop.lineTo(cx - 86, base - 52);
  loop.arc(cx, base - 52, 86, Math.PI, 0);
  loop.lineTo(cx + 86, base);
  loop.lineTo(cx + 56, base);
  loop.lineTo(cx + 56, base - 52);
  loop.arc(cx, base - 52, 56, 0, Math.PI, true);
  loop.lineTo(cx - 56, base);
  loop.closePath();
  ctx.fillStyle = linear(ctx, cx - 86, 0, cx + 86, 0, [
    [0, hex('#3c3d42')],
    [0.18, hex('#6d6f76')],
    [0.34, hex('#2b2c30')],
    [0.7, hex('#1c1d20')],
    [0.93, hex('#2e2f34')],
    [1, hex('#8a8c93')],
  ]);
  ctx.fill(loop);
  ctx.save();
  ctx.clip(loop);
  ctx.fillStyle = radial(ctx, cx - 30, base - 130, 70, [
    [0, WHITE, 0.35],
    [1, WHITE, 0],
  ]);
  ctx.fillRect(cx - 100, base - 150, 200, 100);
  ctx.restore();
  return bounds(latheBounds(body), latheBounds(collar), latheBounds(cap), {
    x: cx - 86,
    y: base - 52 - 86,
    w: 172,
    h: 60,
  });
};

/** Condensation on a can: drops that catch the key light, a dark rim below each. */
function condensation(c: Ctx, rng: Rng, cx: number, r: number, top: number, bottom: number) {
  for (let i = 0; i < 90; i++) {
    const a = rng.range(-1.35, 1.35);
    const x = around(cx, r, a);
    const y = rng.range(top, bottom);
    const size = rng.range(2.5, 7.5) * Math.cos(a) ** 0.5;
    const squash = Math.cos(a);
    c.fillStyle = css(BLACK, 0.18);
    c.beginPath();
    c.ellipse(x, y + size * 0.25, size * squash, size * 1.15, 0, 0, TAU);
    c.fill();
    c.fillStyle = css(WHITE, 0.25);
    c.beginPath();
    c.ellipse(x, y, size * squash * 0.85, size, 0, 0, TAU);
    c.fill();
    c.fillStyle = css(WHITE, 0.9);
    c.beginPath();
    c.arc(x - size * 0.35 * squash, y - size * 0.4, Math.max(0.8, size * 0.28), 0, TAU);
    c.fill();
  }
}

/** A cold drink can: glossy printed aluminium, bare metal neck and lid, condensation drops. */
const can: Painter = (ctx) => {
  const cx = 600;
  const rng = seeded('object-can');
  const body: Lathe = {
    cx,
    top: 318,
    bottom: 1330,
    radius: (y) => {
      if (y < 404) return 176 + 34 * smoothstep(318, 404, y) ** 0.8;
      if (y < 1262) return 210;
      return 210 - 36 * smoothstep(1262, 1330, y) ** 1.2;
    },
  };
  const rim: Lathe = { cx, top: 300, bottom: 322, radius: () => 178 };
  const mint = hex('#3ccfa8');
  const navy = hex('#14244b');
  const cream = hex('#fff1d0');
  // The print wraps around the can: a wave band, a sun disc, a thin silver line.
  lathe(
    ctx,
    body,
    { gloss: 0.85, roughness: 0.05 },
    (c) => {
      c.fillStyle = css(hex('#c9ced4'));
      c.fillRect(0, 0, 1200, 1600);
      c.fillStyle = css(mint);
      c.fillRect(0, 430, 1200, 820);
      c.fillStyle = css(navy);
      c.beginPath();
      c.moveTo(0, 1250);
      for (let a = -Math.PI / 2; a <= Math.PI / 2 + 0.01; a += 0.02) {
        c.lineTo(around(cx, 210, a), 960 + 46 * Math.sin(a * 3.4 + 0.6));
      }
      c.lineTo(1200, 1250);
      c.closePath();
      c.fill();
      c.fillStyle = css(cream);
      c.beginPath();
      for (let a = -Math.PI / 2; a <= Math.PI / 2 + 0.01; a += 0.02) {
        c.lineTo(around(cx, 210, a), 1030 + 40 * Math.sin(a * 3.4 + 1.2));
      }
      for (let a = Math.PI / 2; a >= -Math.PI / 2 - 0.01; a -= 0.02) {
        c.lineTo(around(cx, 210, a), 1052 + 40 * Math.sin(a * 3.4 + 1.2));
      }
      c.fill();
      c.beginPath();
      c.ellipse(cx - 12, 760, 104, 112, 0, 0, TAU);
      c.fill();
      c.strokeStyle = css(navy);
      c.lineWidth = 7;
      c.beginPath();
      c.ellipse(cx - 12, 760, 126, 136, 0, 0, TAU);
      c.stroke();
      c.fillStyle = css(hex('#ff7a59'));
      c.beginPath();
      c.ellipse(cx + 82, 668, 22, 24, 0, 0, TAU);
      c.fill();
    },
    (c) => condensation(c, rng, cx, 210, 440, 1250),
  );
  lathe(ctx, rim, { gloss: 1, roughness: 0.05, metal: true }, (c) => {
    c.fillStyle = css(hex('#e2e5ea'));
    c.fillRect(0, 0, 1200, 1600);
  });
  // The lid: brushed aluminium, a recessed panel and the tab.
  topFace(ctx, cx, 300, 172, hex('#9aa0a8'), hex('#eef1f4'));
  ctx.fillStyle = css(hex('#7d838c'), 0.55);
  ctx.beginPath();
  ctx.ellipse(cx, 302, 150, 150 * ELLIPSE, 0, 0, TAU);
  ctx.fill();
  topFace(ctx, cx, 300, 144, hex('#aeb4bb'), hex('#f4f6f8'));
  ctx.fillStyle = css(hex('#8b9199'));
  ctx.beginPath();
  ctx.ellipse(cx + 8, 296, 46, 9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = css(hex('#dfe3e8'));
  ctx.beginPath();
  ctx.ellipse(cx + 4, 294, 36, 6, 0, 0, TAU);
  ctx.fill();
  return bounds(latheBounds(body), latheBounds(rim));
};

/** Nova One — a speaker: knit fabric with a dot mesh, aluminium top with a light ring. */
const speaker: Painter = (ctx) => {
  const cx = 600;
  const top = 356;
  const r = 250;
  const cap: Lathe = {
    cx,
    top,
    bottom: 432,
    radius: (y) => {
      const k = clamp01((y - top) / 34);
      return r - 34 + 34 * Math.sqrt(1 - (1 - k) * (1 - k));
    },
  };
  const fabric: Lathe = {
    cx,
    top: 428,
    bottom: 1300,
    radius: (y) => {
      const k = clamp01((1300 - y) / 40);
      return r - 1 - 30 * (1 - Math.sqrt(1 - (1 - k) * (1 - k)));
    },
  };
  const foot: Lathe = { cx, top: 1296, bottom: 1318, radius: () => r - 36 };
  lathe(ctx, foot, { gloss: 0.2, roughness: 0.4 }, (c) => {
    c.fillStyle = css(hex('#1f2023'));
    c.fillRect(0, 0, 1200, 1600);
  });
  lathe(ctx, fabric, { gloss: 0.12, roughness: 0.4 }, (c) => {
    c.fillStyle = css(hex('#50545c'));
    c.fillRect(0, 0, 1200, 1600);
    // The mesh: rows of dots, compressed toward the edges as the fabric turns away.
    c.fillStyle = css(hex('#2d3036'));
    let row = 0;
    for (let y = 446; y < 1290; y += 9, row++) {
      const offset = row % 2 ? 0.02 : 0;
      for (let a = -1.52 + offset; a < 1.52; a += 0.04) {
        const x = around(cx, r, a);
        const size = 4.2 * Math.cos(a);
        c.fillRect(x - size / 2, y - 2, size, 4);
      }
    }
    // A woven tag with the Nova mark.
    const a = -0.62;
    const tx = around(cx, r, a);
    const squash = Math.cos(a);
    c.fillStyle = css(hex('#ff7a45'));
    c.beginPath();
    c.roundRect(tx - 26 * squash, 1150, 52 * squash, 70, 8);
    c.fill();
    c.fillStyle = css(hex('#fff3ea'));
    c.beginPath();
    const sx = tx;
    const sy = 1185;
    const k = 16;
    c.moveTo(sx, sy - k);
    c.quadraticCurveTo(sx + 2 * squash, sy - 2, sx + k * squash, sy);
    c.quadraticCurveTo(sx + 2 * squash, sy + 2, sx, sy + k);
    c.quadraticCurveTo(sx - 2 * squash, sy + 2, sx - k * squash, sy);
    c.quadraticCurveTo(sx - 2 * squash, sy - 2, sx, sy - k);
    c.fill();
  });
  // Anodised aluminium: a light satin surface rather than a mirror.
  lathe(ctx, cap, { gloss: 0.7, roughness: 0.22 }, (c) => {
    c.fillStyle = css(hex('#c3c8ce'));
    c.fillRect(0, 0, 1200, 1600);
  });
  // The top: brushed aluminium, a soft light ring and three touch dots.
  topFace(ctx, cx, top, r - 34, hex('#a9afb7'), hex('#f1f3f5'));
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, top, r - 34, (r - 34) * ELLIPSE, 0, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = css(hex('#9ed8ff'), 0.9);
  ctx.lineWidth = 3;
  ctx.shadowColor = css(hex('#7cc8ff'), 0.9);
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.ellipse(cx, top, 150, 150 * ELLIPSE, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = css(hex('#8a9098'));
  for (const dx of [-38, 0, 38]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx, top + 1, 7, 7 * ELLIPSE * 1.6, 0, 0, TAU);
    ctx.fill();
  }
  return bounds(latheBounds(cap), latheBounds(fabric), latheBounds(foot));
};

/** A phone, face on: titanium frame, black glass, an abstract wallpaper, a glass sheen. */
const phone: Painter = (ctx) => {
  const x = 312;
  const y = 176;
  const w = 576;
  const h = 1248;
  const radius = 92;
  // Buttons, just proud of the frame.
  ctx.fillStyle = linear(ctx, x - 8, 0, x + 4, 0, [
    [0, hex('#6f737a')],
    [0.5, hex('#d9dce0')],
    [1, hex('#8d9198')],
  ]);
  ctx.beginPath();
  ctx.roundRect(x - 7, y + 250, 12, 70, 4);
  ctx.roundRect(x - 7, y + 350, 12, 110, 4);
  ctx.roundRect(x - 7, y + 480, 12, 110, 4);
  ctx.fill();
  ctx.fillStyle = linear(ctx, x + w - 4, 0, x + w + 8, 0, [
    [0, hex('#8d9198')],
    [0.5, hex('#e6e8eb')],
    [1, hex('#6f737a')],
  ]);
  ctx.beginPath();
  ctx.roundRect(x + w - 5, y + 380, 12, 170, 4);
  ctx.fill();
  // The frame: a polished band catching the rim lights.
  ctx.fillStyle = linear(ctx, x, 0, x + w, 0, [
    [0, hex('#f2f3f5')],
    [0.02, hex('#8b9097')],
    [0.05, hex('#c7cbd0')],
    [0.5, hex('#9ba0a7')],
    [0.95, hex('#c3c7cc')],
    [0.98, hex('#7c8188')],
    [1, hex('#f7f8f9')],
  ]);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.fillStyle = css(hex('#0b0b0e'));
  ctx.beginPath();
  ctx.roundRect(x + 9, y + 9, w - 18, h - 18, radius - 9);
  ctx.fill();
  // The screen: an abstract wallpaper of soft light.
  const sx = x + 24;
  const sy = y + 24;
  const sw = w - 48;
  const sh = h - 48;
  const screen = new Path2D();
  screen.roundRect(sx, sy, sw, sh, radius - 24);
  ctx.save();
  ctx.clip(screen);
  ctx.fillStyle = linear(ctx, 0, sy, 0, sy + sh, [
    [0, hex('#1b1450')],
    [0.45, hex('#3b1f7a')],
    [0.75, hex('#b0407a')],
    [1, hex('#ff9a5a')],
  ]);
  ctx.fillRect(sx, sy, sw, sh);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = radial(ctx, sx + sw * 0.25, sy + sh * 0.3, sw * 0.9, [
    [0, hex('#5b8cff'), 0.85],
    [0.5, hex('#3b4fd0'), 0.3],
    [1, hex('#3b4fd0'), 0],
  ]);
  ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = radial(ctx, sx + sw * 0.85, sy + sh * 0.72, sw * 0.8, [
    [0, hex('#ffb36b'), 0.8],
    [1, hex('#ff6b8a'), 0],
  ]);
  ctx.fillRect(sx, sy, sw, sh);
  ctx.globalCompositeOperation = 'source-over';
  // A glassy sphere floating in it.
  const bx = sx + sw * 0.52;
  const by = sy + sh * 0.5;
  const br = sw * 0.3;
  ctx.fillStyle = radial(ctx, bx - br * 0.35, by - br * 0.4, br * 1.3, [
    [0, hex('#ffe9f4')],
    [0.35, hex('#f08bc8')],
    [0.75, hex('#6a3bd8')],
    [1, hex('#2a1a70')],
  ]);
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = css(WHITE, 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(bx, by, br * 1.35, 0, TAU);
  ctx.stroke();
  // The island and the home bar.
  ctx.fillStyle = css(hex('#050507'));
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - 70, sy + 22, 140, 40, 20);
  ctx.fill();
  ctx.fillStyle = css(WHITE, 0.8);
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - 80, sy + sh - 26, 160, 9, 4.5);
  ctx.fill();
  ctx.restore();
  // Glass: a broad soft reflection across the upper left, and a crisp edge highlight.
  ctx.save();
  ctx.clip(screen);
  ctx.fillStyle = linear(ctx, sx, sy, sx + sw * 0.8, sy + sh * 0.5, [
    [0, WHITE, 0.2],
    [0.45, WHITE, 0.06],
    [0.46, WHITE, 0],
    [1, WHITE, 0],
  ]);
  ctx.fillRect(sx, sy, sw, sh);
  ctx.restore();
  ctx.strokeStyle = css(WHITE, 0.25);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 10, w - 20, h - 20, radius - 10);
  ctx.stroke();
  return bounds({ x: x - 7, y, w: w + 14, h });
};

/** A hand of the watch: a tapered sword, two facets. */
function hand(
  ctx: Ctx,
  cx: number,
  cy: number,
  angle: number,
  length: number,
  width: number,
  light: Color,
  dark: Color,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = css(light);
  ctx.beginPath();
  ctx.moveTo(0, -length);
  ctx.lineTo(-width / 2, -length * 0.25);
  ctx.lineTo(-width * 0.3, length * 0.08);
  ctx.lineTo(0, length * 0.08);
  ctx.fill();
  ctx.fillStyle = css(dark);
  ctx.beginPath();
  ctx.moveTo(0, -length);
  ctx.lineTo(width / 2, -length * 0.25);
  ctx.lineTo(width * 0.3, length * 0.08);
  ctx.lineTo(0, length * 0.08);
  ctx.fill();
  ctx.restore();
}

/** A watch, face on: polished case, sunburst dial, applied indices, leather strap at 10:09. */
const watch: Painter = (ctx) => {
  const cx = 600;
  const cy = 800;
  const R = 262;
  const strapW = 236;
  const leather = hex('#9a5a33');
  // Straps: domed leather, darker where they bend away, stitched along the edges.
  const strap = (y0: number, y1: number, taper: number, toward: number) => {
    const top = Math.min(y0, y1);
    const height = Math.abs(y1 - y0);
    const path = new Path2D();
    const half = strapW / 2;
    const end = half - taper;
    if (toward < 0) {
      path.moveTo(cx - half, y0);
      path.lineTo(cx - end, y1 + 60);
      path.quadraticCurveTo(cx - end, y1, cx - end + 60, y1);
      path.lineTo(cx + end - 60, y1);
      path.quadraticCurveTo(cx + end, y1, cx + end, y1 + 60);
      path.lineTo(cx + half, y0);
    } else {
      path.moveTo(cx - half, y0);
      path.lineTo(cx - end, y1 - 60);
      path.quadraticCurveTo(cx - end, y1, cx, y1);
      path.quadraticCurveTo(cx + end, y1, cx + end, y1 - 60);
      path.lineTo(cx + half, y0);
    }
    path.closePath();
    ctx.fillStyle = linear(ctx, cx - half, 0, cx + half, 0, [
      [0, mix(leather, BLACK, 0.35)],
      [0.2, mix(leather, WHITE, 0.08)],
      [0.55, leather],
      [1, mix(leather, BLACK, 0.4)],
    ]);
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = linear(ctx, 0, y0, 0, y1, [
      [0, BLACK, 0.25],
      [0.25, BLACK, 0],
      [0.7, BLACK, 0.05],
      [1, BLACK, 0.45],
    ]);
    ctx.fillRect(cx - half, top, strapW, height);
    grain(ctx, { x: cx - half, y: top, w: strapW, h: height }, 0.25, 5);
    ctx.strokeStyle = css(hex('#e8c9a6'), 0.7);
    ctx.lineWidth = 2.2;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.moveTo(cx - half + 14, y0);
    ctx.lineTo(cx - end + 14, y1 - toward * 40);
    ctx.moveTo(cx + half - 14, y0);
    ctx.lineTo(cx + end - 14, y1 - toward * 40);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };
  strap(cy - R + 40, 120, 18, -1);
  strap(cy + R - 40, 1480, 18, 1);
  // Holes in the lower strap, a keeper loop, and the buckle on the upper one.
  ctx.fillStyle = css(hex('#2a160c'));
  for (const hy of [1300, 1350, 1400]) {
    ctx.beginPath();
    ctx.ellipse(cx, hy, 9, 7, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = linear(ctx, 0, 1170, 0, 1215, [
    [0, mix(leather, BLACK, 0.2)],
    [0.5, mix(leather, WHITE, 0.1)],
    [1, mix(leather, BLACK, 0.45)],
  ]);
  ctx.fillRect(cx - strapW / 2 + 12, 1170, strapW - 24, 44);
  const steel = (x0: number, x1: number) =>
    linear(ctx, x0, 0, x1, 0, [
      [0, hex('#6d737b')],
      [0.25, hex('#f4f6f8')],
      [0.45, hex('#a3a9b0')],
      [0.7, hex('#dfe3e7')],
      [1, hex('#5d636b')],
    ]);
  ctx.fillStyle = steel(cx - 140, cx + 140);
  ctx.beginPath();
  ctx.roundRect(cx - 138, 96, 276, 110, 26);
  ctx.roundRect(cx - 110, 118, 220, 66, 14);
  ctx.fill('evenodd');
  ctx.fillRect(cx - 7, 118, 14, 72);
  // Lugs.
  for (const dir of [-1, 1]) {
    for (const side of [-1, 1]) {
      const lx = cx + side * (strapW / 2 + 4);
      const ly = cy + dir * (R - 30);
      ctx.fillStyle = steel(lx - 18, lx + 12);
      ctx.beginPath();
      ctx.moveTo(lx - side * 18, ly);
      ctx.lineTo(lx + side * 12, ly);
      ctx.lineTo(lx + side * 8, ly + dir * 64);
      ctx.lineTo(lx - side * 12, ly + dir * 64);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Crown at three o'clock: knurled.
  ctx.fillStyle = steel(cx + R - 10, cx + R + 44);
  ctx.beginPath();
  ctx.roundRect(cx + R - 12, cy - 34, 52, 68, 10);
  ctx.fill();
  ctx.fillStyle = css(hex('#4d535a'), 0.6);
  for (let k = cy - 30; k < cy + 30; k += 6) ctx.fillRect(cx + R + 8, k, 30, 2);
  // The case shades the leather it sits on.
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - strapW / 2, 0, strapW, 1600);
  ctx.clip();
  const shade = new Path2D();
  shade.arc(cx + 10, cy + 22, R, 0, TAU);
  softFill(ctx, shade, css(BLACK, 0.55), 36);
  ctx.restore();
  // Case: a polished ring that mirrors the studio around it.
  const conic =
    typeof ctx.createConicGradient === 'function' ? ctx.createConicGradient(-2.2, cx, cy) : null;
  if (conic) {
    for (const [at, color] of [
      [0, '#f7f8fa'],
      [0.08, '#9aa1a9'],
      [0.2, '#4a5058'],
      [0.36, '#c9ced4'],
      [0.46, '#f2f4f6'],
      [0.56, '#7c838b'],
      [0.7, '#3c4148'],
      [0.84, '#b7bdc4'],
      [0.94, '#eef0f3'],
      [1, '#f7f8fa'],
    ] as const) {
      conic.addColorStop(at, color);
    }
  }
  ctx.fillStyle = conic ?? steel(cx - R, cx + R);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.fillStyle = radial(ctx, cx, cy, R, [
    [0.82, BLACK, 0],
    [0.9, WHITE, 0.25],
    [0.97, BLACK, 0.1],
    [1, BLACK, 0.45],
  ]);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  // The dial: deep blue sunburst.
  const D = 214;
  ctx.fillStyle = radial(ctx, cx - 40, cy - 60, D * 1.3, [
    [0, hex('#2b4a8a')],
    [0.6, hex('#15285a')],
    [1, hex('#0a1330')],
  ]);
  ctx.beginPath();
  ctx.arc(cx, cy, D, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, D, 0, TAU);
  ctx.clip();
  ctx.lineWidth = 1;
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * TAU;
    const lit = 0.5 + 0.5 * Math.cos(2 * (a + 0.8));
    ctx.strokeStyle = css(lit > 0.5 ? WHITE : BLACK, 0.05 + 0.06 * Math.abs(lit - 0.5));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * D, cy + Math.sin(a) * D);
    ctx.stroke();
  }
  ctx.restore();
  // Minute track and applied indices.
  ctx.strokeStyle = css(hex('#c9d3ea'), 0.8);
  for (let i = 0; i < 60; i++) {
    if (i % 5 === 0) continue;
    const a = (i / 60) * TAU;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (D - 14), cy + Math.sin(a) * (D - 14));
    ctx.lineTo(cx + Math.cos(a) * (D - 4), cy + Math.sin(a) * (D - 4));
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2;
    const long = i % 3 === 0;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * (D - 52), cy + Math.sin(a) * (D - 52));
    ctx.rotate(a + Math.PI / 2);
    const bw = long ? 16 : 11;
    const bh = long ? 56 : 42;
    for (const dx of i === 0 ? [-12, 12] : [0]) {
      ctx.fillStyle = linear(ctx, dx - bw / 2, 0, dx + bw / 2, 0, [
        [0, hex('#f5f7fa')],
        [0.5, hex('#b9c0c9')],
        [1, hex('#6c737c')],
      ]);
      ctx.fillRect(dx - bw / 2, -bh / 2, bw, bh);
    }
    ctx.restore();
  }
  // Hands at 10:09:36, the classic pose.
  const light = hex('#f4f6f9');
  const dark = hex('#9aa2ac');
  ctx.shadowColor = css(BLACK, 0.45);
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 5;
  hand(ctx, cx, cy, ((10 + 9 / 60) / 12) * TAU, 118, 22, light, dark);
  hand(ctx, cx, cy, (9.6 / 60) * TAU, 178, 18, light, dark);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((36 / 60) * TAU);
  ctx.fillStyle = css(hex('#ff6a3d'));
  ctx.fillRect(-1.6, -196, 3.2, 246);
  ctx.beginPath();
  ctx.arc(0, 40, 9, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = radial(ctx, cx - 3, cy - 3, 14, [
    [0, hex('#ffffff')],
    [1, hex('#8e969f')],
  ]);
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, TAU);
  ctx.fill();
  // The crystal: a broad soft reflection.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, D, 0, TAU);
  ctx.clip();
  ctx.fillStyle = linear(ctx, cx - D, cy - D, cx + D * 0.2, cy + D * 0.2, [
    [0, WHITE, 0.16],
    [0.5, WHITE, 0.05],
    [0.52, WHITE, 0],
    [1, WHITE, 0],
  ]);
  ctx.fillRect(cx - D, cy - D, 2 * D, 2 * D);
  ctx.restore();
  return bounds(
    { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R },
    { x: cx + R - 12, y: cy - 34, w: 52, h: 68 },
    { x: cx - 138, y: 96, w: 276, h: 1480 - 96 },
  );
};

/** Object painters in id order: bottle, can, speaker, phone, watch. */
export const OBJECTS: readonly Painter[] = [bottle, can, speaker, phone, watch];
