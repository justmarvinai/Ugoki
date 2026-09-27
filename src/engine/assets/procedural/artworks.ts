/**
 * Artworks (1200 × 1500): eight generative posters, each with its own palette and idea —
 * Bauhaus geometry, a gradient aura, Truchet arcs, a halftone sphere, mid-century arches, a
 * striped sun, a risograph overprint, topographic contours. No text. They tile a masonry
 * portfolio (Columns), so each keeps a strong focal shape near the center that survives crops.
 * Seeded: variation comes from each poster's own stream.
 */

import type { Color } from '../../core/color';
import { lerp } from '../../core/math';
import { type Ctx, css, full, grain, hex, linear, noise2, type Painter, seeded, TAU } from './kit';

function paper(ctx: Ctx, w: number, h: number, color: Color) {
  ctx.fillStyle = css(color);
  ctx.fillRect(0, 0, w, h);
}

function disc(ctx: Ctx, x: number, y: number, r: number, color: Color) {
  ctx.fillStyle = css(color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A filled circular sector from angle a0 to a1 (radians, clockwise from +x). */
function sector(ctx: Ctx, x: number, y: number, r: number, a0: number, a1: number, color: Color) {
  ctx.fillStyle = css(color);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, a0, a1);
  ctx.closePath();
  ctx.fill();
}

/** Print texture: grain a little stronger than a photograph's. */
const print = (ctx: Ctx, w: number, h: number, seed: number, amount = 0.16) =>
  grain(ctx, full(w, h), amount, seed);

/** 1 — Bauhaus: primary shapes and a heavy bar on cream paper. */
const bauhaus: Painter = (ctx, w, h) => {
  const rng = seeded('artwork-1');
  const cream = hex('#efe6d4');
  const red = hex('#e0301e');
  const blue = hex('#1f4fb8');
  const yellow = hex('#f2b705');
  const ink = hex('#151515');
  paper(ctx, w, h, cream);
  const jx = rng.range(-20, 20);
  // Construction lines.
  ctx.strokeStyle = css(ink, 0.18);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const x of [w * 0.25, w * 0.5, w * 0.75]) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  ctx.moveTo(0, h * 0.6);
  ctx.lineTo(w, h * 0.6);
  ctx.stroke();
  sector(ctx, 0, h, 380, -Math.PI / 2, 0, yellow);
  disc(ctx, 470 + jx, 560, 330, red);
  disc(ctx, 470 + jx, 560, 120, cream);
  ctx.fillStyle = css(yellow);
  ctx.fillRect(960, 150, 64, 470);
  disc(ctx, 930, 330, 54, ink);
  sector(ctx, 850, 978, 236, 0, Math.PI, blue);
  ctx.fillStyle = css(ink);
  ctx.fillRect(110, 934, 980, 46);
  sector(ctx, 250, 1220, 110, Math.PI, TAU, blue);
  ctx.fillStyle = css(red);
  ctx.fillRect(700, 1260, 280, 34);
  print(ctx, w, h, 101);
  return full(w, h);
};

/** 2 — Aura: a warped field of warm and violet light, a crisp ring floating in it. */
const aura: Painter = (ctx, w, h) => {
  const rng = seeded('artwork-2');
  const lw = 160;
  const lh = 200;
  const field = new OffscreenCanvas(lw, lh);
  const f = field.getContext('2d');
  if (f) {
    const image = f.createImageData(lw, lh);
    const linearOf = (c: Color) => [c.r ** 2.2, c.g ** 2.2, c.b ** 2.2] as const;
    const base = linearOf(hex('#1f0b33'));
    const blobs = [
      { x: 0.28, y: 0.3, r: 0.36, c: linearOf(hex('#ff6b5a')) },
      { x: 0.78, y: 0.22, r: 0.3, c: linearOf(hex('#8b5cf6')) },
      { x: 0.62, y: 0.7, r: 0.4, c: linearOf(hex('#f43f9e')) },
      { x: 0.2, y: 0.82, r: 0.3, c: linearOf(hex('#ffb86b')) },
    ].map((b) => ({ ...b, x: b.x + rng.range(-0.05, 0.05), y: b.y + rng.range(-0.05, 0.05) }));
    const warp = noise2(rng, 16);
    for (let j = 0; j < lh; j++) {
      for (let i = 0; i < lw; i++) {
        const u = i / lw + 0.08 * warp((i / lw) * 1.8, (j / lh) * 1.8);
        const v = j / lh + 0.08 * warp((i / lw) * 1.8 + 5.3, (j / lh) * 1.8 + 2.1);
        let r = base[0];
        let g = base[1];
        let b = base[2];
        for (const blob of blobs) {
          const dx = (u - blob.x) / blob.r;
          const dy = (v - blob.y) / blob.r;
          const k = Math.exp(-(dx * dx + dy * dy) * 1.6) * 0.95;
          r += (blob.c[0] - r) * k;
          g += (blob.c[1] - g) * k;
          b += (blob.c[2] - b) * k;
        }
        const o = (j * lw + i) * 4;
        image.data[o] = 255 * r ** (1 / 2.2);
        image.data[o + 1] = 255 * g ** (1 / 2.2);
        image.data[o + 2] = 255 * b ** (1 / 2.2);
        image.data[o + 3] = 255;
      }
    }
    f.putImageData(image, 0, 0);
    // The field is smooth: bilinear upscaling is enough (and far cheaper than 'high').
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(field, 0, 0, lw, lh, 0, 0, w, h);
  }
  const cream = hex('#fff4ec');
  ctx.strokeStyle = css(cream, 0.9);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(700, 600, 280, 0, TAU);
  ctx.stroke();
  disc(ctx, 700 + Math.cos(-2.4) * 280, 600 + Math.sin(-2.4) * 280, 16, cream);
  disc(ctx, 380, 1020, 10, cream);
  print(ctx, w, h, 102, 0.2);
  return full(w, h);
};

/** 3 — Truchet: quarter arcs on a grid, joined at random into meandering bands. */
const truchet: Painter = (ctx, w, h) => {
  const rng = seeded('artwork-3');
  const green = hex('#1c4a3b');
  const cream = hex('#f3ead6');
  const mint = hex('#8fdcb8');
  const coral = hex('#f2683c');
  paper(ctx, w, h, green);
  const s = w / 6;
  const rows = Math.ceil(h / s);
  const tiles: boolean[] = [];
  for (let k = 0; k < 6 * rows; k++) tiles.push(rng.chance(0.5));
  // Accents first: a few tiles hold a solid coral quarter disc.
  for (let k = 0; k < tiles.length; k++) {
    if (!rng.chance(0.12)) continue;
    const x = (k % 6) * s;
    const y = Math.floor(k / 6) * s;
    const corner = rng.int(0, 3);
    const cx = x + (corner % 2) * s;
    const cy = y + Math.floor(corner / 2) * s;
    const start = [0, Math.PI / 2, -Math.PI / 2, Math.PI][corner]!;
    sector(ctx, cx, cy, s * 0.42, start, start + Math.PI / 2, coral);
  }
  const arcs = (width: number, color: Color) => {
    ctx.strokeStyle = css(color);
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let k = 0; k < tiles.length; k++) {
      const x = (k % 6) * s;
      const y = Math.floor(k / 6) * s;
      const r = s / 2;
      if (tiles[k]) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI / 2);
        ctx.moveTo(x + s - r, y + s);
        ctx.arc(x + s, y + s, r, Math.PI, Math.PI * 1.5);
      } else {
        ctx.moveTo(x + s, y + r);
        ctx.arc(x + s, y, r, Math.PI / 2, Math.PI);
        ctx.moveTo(x + r, y + s);
        ctx.arc(x, y + s, r, -Math.PI / 2, 0);
      }
    }
    ctx.stroke();
  };
  arcs(s * 0.3, cream);
  arcs(s * 0.05, mint);
  print(ctx, w, h, 103);
  return full(w, h);
};

/** Discs of every whole radius up to `max`, side by side: halftone dots copied 1:1 (fast). */
function dotAtlas(color: Color, max: number): OffscreenCanvas | null {
  let width = 0;
  for (let r = 1; r <= max; r++) width += 2 * r + 2;
  const canvas = new OffscreenCanvas(width, 2 * max + 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let x = 0;
  for (let r = 1; r <= max; r++) {
    disc(ctx, x + r + 1, r + 1, r, color);
    x += 2 * r + 2;
  }
  return canvas;
}

/** 4 — Halftone: a lit sphere in two misregistered inks on navy. */
const halftone: Painter = (ctx, w, h) => {
  const rng = seeded('artwork-4');
  paper(ctx, w, h, hex('#0e1a3c'));
  const cx = 600 + rng.range(-20, 20);
  const cy = 640;
  const R = 430;
  const light = [-0.55, -0.6, 0.58] as const;
  const step = 20;
  const value = (x: number, y: number) => {
    const dx = (x - cx) / R;
    const dy = (y - cy) / R;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1) {
      const nz = Math.sqrt(1 - d2);
      return 0.1 + 0.9 * Math.max(0, dx * light[0] + dy * light[1] + nz * light[2]);
    }
    // Outside: a faint field, falling off from the sphere, and a horizon band below it.
    const halo = Math.max(0, 0.22 - (Math.sqrt(d2) - 1) * 0.45);
    const floor = y > 1180 ? 0.18 * Math.min(1, (y - 1180) / 200) : 0;
    return Math.max(halo, floor);
  };
  const max = Math.round(step * 0.56);
  const offsets: number[] = [0];
  for (let r = 1; r <= max; r++) offsets.push(offsets[r - 1]! + 2 * r + 2);
  ctx.globalCompositeOperation = 'screen';
  for (const [color, ox, oy] of [
    [hex('#ff3d7f'), 5, 4],
    [hex('#ff8a2a'), 0, 0],
  ] as const) {
    const atlas = dotAtlas(color, max);
    if (!atlas) continue;
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const r = Math.round(step * 0.56 * Math.sqrt(value(x, y)));
        if (r < 1) continue;
        const size = 2 * r + 2;
        ctx.drawImage(
          atlas,
          offsets[r - 1]!,
          0,
          size,
          size,
          x + ox - r - 1,
          y + oy - r - 1,
          size,
          size,
        );
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = css(hex('#f6e7d0'), 0.9);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 36, -2.6, -0.9);
  ctx.stroke();
  print(ctx, w, h, 104);
  return full(w, h);
};

/** 5 — Arches: nested mid-century arches rising and hanging, a sun between them. */
const arches: Painter = (ctx, w, h) => {
  const rng = seeded('artwork-5');
  const colors = [
    hex('#c8553d'),
    hex('#e3a13b'),
    hex('#8ba888'),
    hex('#f0b7a4'),
    hex('#2b5d63'),
    hex('#efe2cb'),
  ];
  paper(ctx, w, h, hex('#efe2cb'));
  const group = (
    x: number,
    y: number,
    outer: number,
    bandWidth: number,
    hanging: boolean,
    shift: number,
  ) => {
    let r = outer;
    let k = shift;
    while (r > bandWidth * 0.8) {
      sector(
        ctx,
        x,
        y,
        r,
        hanging ? 0 : Math.PI,
        hanging ? Math.PI : TAU,
        colors[k % colors.length]!,
      );
      r -= bandWidth;
      k++;
    }
  };
  group(430 + rng.range(-20, 20), h, 600, 86, false, 0);
  group(980, 0, 420, 70, true, 2);
  disc(ctx, 900, 760, 118, colors[1]!);
  sector(ctx, 250, 470, 90, Math.PI, TAU, colors[4]!);
  ctx.fillStyle = css(colors[4]!);
  ctx.fillRect(160, 470, 180, 16);
  print(ctx, w, h, 105);
  return full(w, h);
};

/** 6 — Sunset: a striped sun over lines of water, framed in cream on black. */
const sunset: Painter = (ctx, w, h) => {
  const rng = seeded('artwork-6');
  const night = hex('#121015');
  paper(ctx, w, h, night);
  const cx = 600;
  const cy = 640;
  const R = 390;
  ctx.fillStyle = linear(ctx, 0, cy - R, 0, cy + R, [
    [0, hex('#ffd23f')],
    [0.45, hex('#ff8a1a')],
    [0.75, hex('#f0445f')],
    [1, hex('#b3207a')],
  ]);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  // Gaps widen toward the bottom of the sun.
  ctx.fillStyle = css(night);
  let y = cy - 30;
  let gap = 5;
  while (y < cy + R) {
    ctx.fillRect(cx - R - 2, y, 2 * R + 4, gap);
    y += gap + 30 - gap * 0.6;
    gap *= 1.32;
  }
  // Water: lines that catch the sun's colors, shortening toward the viewer.
  const sea = cy + R + 40;
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const ly = sea + i * 22;
    const half = (0.5 - 0.35 * t) * 2 * R * rng.range(0.9, 1.05);
    ctx.fillStyle = linear(ctx, cx - half, 0, cx + half, 0, [
      [0, hex('#ff8a1a'), 0],
      [0.5, t < 0.5 ? hex('#ffb13b') : hex('#f0445f')],
      [1, hex('#ff8a1a'), 0],
    ]);
    ctx.fillRect(cx - half, ly, 2 * half, 4 + t * 3);
  }
  ctx.strokeStyle = css(hex('#f3e9d8'), 0.85);
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 48, w - 96, h - 96);
  print(ctx, w, h, 106);
  return full(w, h);
};

/** Registration marks, as on a print sheet. */
function registration(ctx: Ctx, x: number, y: number, color: Color) {
  ctx.strokeStyle = css(color, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, TAU);
  ctx.moveTo(x - 24, y);
  ctx.lineTo(x + 24, y);
  ctx.moveTo(x, y - 24);
  ctx.lineTo(x, y + 24);
  ctx.stroke();
}

/** 7 — Riso: fluorescent pink, blue and yellow overprinted, colors mixing where they cross. */
const riso: Painter = (ctx, w, h) => {
  const rng = seeded('artwork-7');
  const ink = hex('#1a1a1a');
  paper(ctx, w, h, hex('#f3efe6'));
  ctx.strokeStyle = css(ink, 0.08);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 100; x < w; x += 100) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 100; y < h; y += 100) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'multiply';
  disc(ctx, 470, 560, 330, hex('#ff48b0'));
  ctx.save();
  ctx.translate(760 + rng.range(-15, 15), 900);
  ctx.rotate(0.21);
  ctx.fillStyle = css(hex('#0078bf'));
  ctx.fillRect(-260, -260, 520, 520);
  ctx.restore();
  sector(ctx, 380, 1250, 290, Math.PI, TAU, hex('#ffe800'));
  disc(ctx, 900, 300, 120, hex('#ffe800'));
  ctx.globalCompositeOperation = 'source-over';
  for (const [x, y] of [
    [60, 60],
    [w - 60, 60],
    [60, h - 60],
    [w - 60, h - 60],
  ] as const) {
    registration(ctx, x, y, ink);
  }
  print(ctx, w, h, 107, 0.26);
  return full(w, h);
};

/** 8 — Contours: topographic rings around a summit, glowing from pink to cyan. */
const contours: Painter = (ctx, w, h) => {
  const rng = seeded('artwork-8');
  paper(ctx, w, h, hex('#1b0f40'));
  const cx = 560;
  const cy = 700;
  const field = noise2(rng, 24);
  const inner = hex('#ff4fa3');
  const middle = hex('#ffb547');
  const outer = hex('#4fd1ff');
  ctx.lineJoin = 'round';
  const rings = 30;
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const base = 34 + i * 30;
    const amp = 12 + i * 3.2;
    ctx.beginPath();
    for (let k = 0; k <= 180; k++) {
      const a = (k / 180) * TAU;
      const px = Math.cos(a);
      const py = Math.sin(a);
      // Sampled on a circle, so every ring closes without a seam.
      const n =
        field(px * 1.6 + 8 + i * 0.04, py * 1.6 + 8 + i * 0.04) +
        0.3 * field(px * 4 + 20 + i * 0.1, py * 4 + 20);
      const r = base + amp * n;
      const x = cx + px * r;
      const y = cy + py * r * 1.08;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const color = t < 0.5 ? mixRgb(inner, middle, t * 2) : mixRgb(middle, outer, t * 2 - 1);
    // Every fifth ring is an index contour, drawn heavier — as on a survey map.
    ctx.lineWidth = i % 5 === 4 ? 6.5 : 3;
    ctx.strokeStyle = css(color, 0.95);
    ctx.stroke();
  }
  disc(ctx, cx + 4, cy + 2, 12, inner);
  print(ctx, w, h, 108);
  return full(w, h);
};

const mixRgb = (a: Color, b: Color, t: number): Color => ({
  r: lerp(a.r, b.r, t),
  g: lerp(a.g, b.g, t),
  b: lerp(a.b, b.b, t),
  a: 1,
});

/** Artwork painters in id order: artwork-1 … artwork-8. */
export const ARTWORKS: readonly Painter[] = [
  bauhaus,
  aura,
  truchet,
  halftone,
  arches,
  sunset,
  riso,
  contours,
];
