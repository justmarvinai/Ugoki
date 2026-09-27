/**
 * Portraits (800 × 800): abstract, friendly portrait illustrations for avatars — flat,
 * modern, never realistic. Head and shoulders on a colored background with a soft disc behind
 * the head, a few flat tones of skin, hair and clothing, and minimal features (eyes, brows, a
 * smile, blush). Diverse skin tones and hairstyles. Avatars crop to the inscribed circle: the
 * face sits at its center and nothing essential reaches outside it.
 */

import type { Color } from '../../core/color';
import { type Ctx, css, full, hex, mix, type Painter, TAU } from './kit';

const C = 400;
/** The head: center and radii. */
const HX = C;
const HY = 352;
const RX = 128;
const RY = 156;

type Person = {
  background: Color;
  halo: Color;
  skin: Color;
  shade: Color;
  hair: Color;
  shine: Color;
  top: Color;
  topShade: Color;
  /** Hair drawn behind the head (volume, length). */
  hairBack?: (ctx: Ctx) => void;
  /** Hair drawn over the head (hairline, bangs). */
  hairFront?: (ctx: Ctx) => void;
  /** Anything over the face (beard, glasses, freckles). */
  extras?: (ctx: Ctx) => void;
  neckline: 'round' | 'v' | 'collar';
  eyes: 'dots' | 'smiling';
};

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: Color, alpha = 1) {
  ctx.fillStyle = css(color, alpha);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

/** Paints one person; the parts every portrait shares. */
function person(ctx: Ctx, w: number, h: number, p: Person) {
  ctx.fillStyle = css(p.background);
  ctx.fillRect(0, 0, w, h);
  ellipse(ctx, C, 380, 300, 300, p.halo);
  p.hairBack?.(ctx);
  // Shoulders and top.
  const body = new Path2D();
  body.moveTo(70, 820);
  body.bezierCurveTo(80, 690, 150, 624, 290, 598);
  body.lineTo(510, 598);
  body.bezierCurveTo(650, 624, 720, 690, 730, 820);
  body.closePath();
  ctx.fillStyle = css(p.top);
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ellipse(ctx, 700, 760, 170, 200, p.topShade);
  ctx.restore();
  // Neck, with the chin's shadow.
  ctx.fillStyle = css(p.skin);
  ctx.beginPath();
  ctx.roundRect(C - 50, 440, 100, 180, 40);
  ctx.fill();
  if (p.neckline === 'v') {
    ctx.beginPath();
    ctx.moveTo(C - 70, 596);
    ctx.lineTo(C, 684);
    ctx.lineTo(C + 70, 596);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(C, 597, 78, 40, 0, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = css(p.shade);
  ctx.beginPath();
  ctx.ellipse(C, 492, 60, 44, 0, 0, Math.PI);
  ctx.fill();
  if (p.neckline === 'collar') {
    ctx.fillStyle = css(mix(p.top, hex('#ffffff'), 0.85));
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(C, 634);
      ctx.lineTo(C + side * 96, 590);
      ctx.lineTo(C + side * 70, 660);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Ears, head, and the shade on the side away from the light.
  for (const side of [-1, 1]) ellipse(ctx, HX + side * (RX - 4), HY + 14, 24, 34, p.skin);
  ellipse(ctx, HX + RX - 6, HY + 16, 10, 16, p.shade);
  const head = new Path2D();
  head.ellipse(HX, HY, RX, RY, 0, 0, TAU);
  ctx.fillStyle = css(p.skin);
  ctx.fill(head);
  ctx.save();
  ctx.clip(head);
  const crescent = new Path2D();
  crescent.ellipse(HX, HY, RX, RY, 0, 0, TAU);
  crescent.ellipse(HX - 22, HY - 8, RX, RY, 0, 0, TAU);
  ctx.fillStyle = css(p.shade, 0.7);
  ctx.fill(crescent, 'evenodd');
  ctx.restore();
  // Features: brows, eyes, nose, smile, blush.
  const ink = mix(p.hair, hex('#1b1210'), 0.5);
  ctx.strokeStyle = css(ink);
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(HX + side * 30, HY - 44);
    ctx.quadraticCurveTo(HX + side * 52, HY - 56, HX + side * 76, HY - 46);
    ctx.stroke();
  }
  if (p.eyes === 'dots') {
    for (const side of [-1, 1]) ellipse(ctx, HX + side * 52, HY + 4, 11, 13, ink);
  } else {
    ctx.lineWidth = 8;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(HX + side * 36, HY + 8);
      ctx.quadraticCurveTo(HX + side * 52, HY - 10, HX + side * 68, HY + 8);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = css(p.shade);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(HX + 2, HY + 18);
  ctx.quadraticCurveTo(HX + 16, HY + 44, HX - 4, HY + 52);
  ctx.stroke();
  ctx.fillStyle = css(hex('#7a2e2a'));
  ctx.beginPath();
  ctx.moveTo(HX - 36, HY + 80);
  ctx.quadraticCurveTo(HX, HY + 124, HX + 36, HY + 80);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, HX, HY + 84, 30, 6, hex('#ffffff'), 0.9);
  for (const side of [-1, 1]) {
    ellipse(ctx, HX + side * 80, HY + 50, 24, 16, hex('#ff7f7f'), 0.28);
  }
  p.hairFront?.(ctx);
  p.extras?.(ctx);
}

/** Portrait 1 — deep brown skin, a big rounded afro, mustard background, teal top. */
const portrait1: Painter = (ctx, w, h) => {
  const hair = hex('#231811');
  const shine = hex('#3d2a1d');
  person(ctx, w, h, {
    background: hex('#f2c14e'),
    halo: hex('#f6d27a'),
    skin: hex('#7b4a2c'),
    shade: hex('#633a21'),
    hair,
    shine,
    top: hex('#1f7a74'),
    topShade: hex('#19645f'),
    neckline: 'round',
    eyes: 'smiling',
    hairBack: (c) => {
      // Many overlapping puffs make the silhouette soft and round.
      c.fillStyle = css(hair);
      c.beginPath();
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU;
        const x = HX + Math.cos(a) * 200;
        const y = 300 + Math.sin(a) * 180;
        c.moveTo(x + 62, y);
        c.arc(x, y, 62, 0, TAU);
      }
      c.moveTo(HX + 220, 300);
      c.ellipse(HX, 300, 220, 200, 0, 0, TAU);
      c.fill();
      c.strokeStyle = css(shine);
      c.lineWidth = 10;
      c.lineCap = 'round';
      for (const [x, y, r, a0, a1] of [
        [300, 190, 60, 3.6, 4.6],
        [470, 170, 56, 4.4, 5.4],
        [240, 330, 50, 2.6, 3.5],
        [560, 300, 48, 5.6, 6.5],
      ] as const) {
        c.beginPath();
        c.arc(x, y, r, a0, a1);
        c.stroke();
      }
    },
    hairFront: (c) => {
      c.fillStyle = css(hair);
      c.beginPath();
      c.ellipse(HX, 250, 150, 86, 0, Math.PI, TAU);
      c.quadraticCurveTo(HX + 110, 272, HX, 262);
      c.quadraticCurveTo(HX - 110, 272, HX - 150, 250);
      c.fill();
    },
    extras: (c) => {
      ellipse(c, HX - RX - 2, HY + 52, 9, 9, hex('#f5c542'));
    },
  });
  return full(w, h);
};

/** Portrait 2 — light skin, a glossy black bob with bangs, pink background, navy top. */
const portrait2: Painter = (ctx, w, h) => {
  const hair = hex('#1d1b26');
  const shine = hex('#3c3a4d');
  person(ctx, w, h, {
    background: hex('#f5a9bc'),
    halo: hex('#f8c2cf'),
    skin: hex('#f0cba8'),
    shade: hex('#dfae88'),
    hair,
    shine,
    top: hex('#26336a'),
    topShade: hex('#1d2856'),
    neckline: 'collar',
    eyes: 'dots',
    hairBack: (c) => {
      c.fillStyle = css(hair);
      c.beginPath();
      c.moveTo(HX - 178, 520);
      c.bezierCurveTo(HX - 200, 300, HX - 170, 170, HX, 168);
      c.bezierCurveTo(HX + 170, 170, HX + 200, 300, HX + 178, 520);
      c.quadraticCurveTo(HX, 548, HX - 178, 520);
      c.fill();
    },
    hairFront: (c) => {
      c.fillStyle = css(hair);
      c.beginPath();
      c.moveTo(HX - 150, 420);
      c.bezierCurveTo(HX - 162, 250, HX - 110, 186, HX, 186);
      c.bezierCurveTo(HX + 110, 186, HX + 162, 250, HX + 150, 420);
      c.lineTo(HX + 126, 420);
      c.bezierCurveTo(HX + 128, 340, HX + 118, 300, HX + 96, 296);
      // The fringe: a straight cut with a slight curve.
      c.quadraticCurveTo(HX, 312, HX - 96, 296);
      c.bezierCurveTo(HX - 118, 300, HX - 128, 340, HX - 126, 420);
      c.closePath();
      c.fill();
      c.strokeStyle = css(shine);
      c.lineWidth = 12;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(HX, 330, 130, 3.75, 4.35);
      c.stroke();
    },
  });
  return full(w, h);
};

/** Portrait 3 — medium brown skin, short textured hair and a trimmed beard, blue background. */
const portrait3: Painter = (ctx, w, h) => {
  const hair = hex('#2e1d14');
  const shine = hex('#4a3122');
  person(ctx, w, h, {
    background: hex('#7fb8e6'),
    halo: hex('#a1cdef'),
    skin: hex('#b97b52'),
    shade: hex('#a0663f'),
    hair,
    shine,
    top: hex('#e8703c'),
    topShade: hex('#cf5d2c'),
    neckline: 'v',
    eyes: 'dots',
    hairFront: (c) => {
      c.fillStyle = css(hair);
      c.beginPath();
      c.moveTo(HX - 134, 320);
      c.bezierCurveTo(HX - 150, 220, HX - 80, 172, HX + 10, 176);
      c.bezierCurveTo(HX + 110, 178, HX + 150, 230, HX + 134, 320);
      c.quadraticCurveTo(HX + 116, 268, HX + 60, 256);
      c.quadraticCurveTo(HX - 20, 246, HX - 90, 262);
      c.quadraticCurveTo(HX - 124, 280, HX - 134, 320);
      c.fill();
      c.strokeStyle = css(shine);
      c.lineWidth = 8;
      c.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x = HX - 90 + i * 30;
        c.beginPath();
        c.moveTo(x, 214 + Math.abs(i - 3) * 6);
        c.lineTo(x + 14, 200 + Math.abs(i - 3) * 6);
        c.stroke();
      }
    },
    extras: (c) => {
      // Beard along the jaw, leaving the smile clear; a moustache above it.
      c.fillStyle = css(hair);
      c.beginPath();
      c.moveTo(HX - RX + 4, HY + 10);
      c.bezierCurveTo(HX - RX + 10, HY + 150, HX - 60, HY + 176, HX, HY + 178);
      c.bezierCurveTo(HX + 60, HY + 176, HX + RX - 10, HY + 150, HX + RX - 4, HY + 10);
      c.bezierCurveTo(HX + RX - 30, HY + 80, HX + 70, HY + 72, HX + 44, HY + 76);
      c.quadraticCurveTo(HX, HY + 140, HX - 44, HY + 76);
      c.bezierCurveTo(HX - 70, HY + 72, HX - RX + 30, HY + 80, HX - RX + 4, HY + 10);
      c.fill();
      c.beginPath();
      c.moveTo(HX - 48, HY + 78);
      c.quadraticCurveTo(HX, HY + 56, HX + 48, HY + 78);
      c.quadraticCurveTo(HX, HY + 70, HX - 48, HY + 78);
      c.fill();
    },
  });
  return full(w, h);
};

/** Portrait 4 — fair freckled skin, auburn hair in a top bun, round glasses, green background. */
const portrait4: Painter = (ctx, w, h) => {
  const hair = hex('#b4532c');
  const shine = hex('#d0703f');
  person(ctx, w, h, {
    background: hex('#8fd19e'),
    halo: hex('#addfb9'),
    skin: hex('#f6d5bd'),
    shade: hex('#e8b999'),
    hair,
    shine,
    top: hex('#f6efe3'),
    topShade: hex('#e2d8c7'),
    neckline: 'round',
    eyes: 'smiling',
    hairBack: (c) => {
      ellipse(c, HX + 6, 150, 82, 72, hair);
      c.strokeStyle = css(shine);
      c.lineWidth = 9;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(HX + 6, 150, 50, 3.4, 4.9);
      c.stroke();
    },
    hairFront: (c) => {
      c.fillStyle = css(hair);
      c.beginPath();
      c.moveTo(HX - 136, 330);
      c.bezierCurveTo(HX - 150, 220, HX - 80, 186, HX, 186);
      c.bezierCurveTo(HX + 80, 186, HX + 150, 220, HX + 136, 330);
      c.quadraticCurveTo(HX + 120, 262, HX + 30, 250);
      c.quadraticCurveTo(HX - 90, 240, HX - 136, 330);
      c.fill();
      c.strokeStyle = css(shine);
      c.lineWidth = 8;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(HX - 70, 214);
      c.quadraticCurveTo(HX - 20, 200, HX + 30, 206);
      c.stroke();
    },
    extras: (c) => {
      for (const [x, y] of [
        [-88, 40],
        [-72, 52],
        [-96, 58],
        [-62, 36],
        [72, 44],
        [88, 56],
        [64, 58],
        [96, 40],
      ] as const) {
        ellipse(c, HX + x, HY + y, 4, 4, hex('#c9825b'), 0.8);
      }
      c.strokeStyle = css(hex('#2a2330'));
      c.lineWidth = 8;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.arc(HX + side * 54, HY + 2, 40, 0, TAU);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(HX - 16, HY - 4);
      c.quadraticCurveTo(HX, HY - 14, HX + 16, HY - 4);
      c.moveTo(HX - 94, HY - 4);
      c.lineTo(HX - RX + 4, HY - 12);
      c.moveTo(HX + 94, HY - 4);
      c.lineTo(HX + RX - 4, HY - 12);
      c.stroke();
    },
  });
  return full(w, h);
};

/** Portrait painters in id order: portrait-1 … portrait-4. */
export const PORTRAITS: readonly Painter[] = [portrait1, portrait2, portrait3, portrait4];
