/**
 * Chat bubble geometry: rounded rects whose corners on the sender's side join the neighbouring
 * bubbles of a group, and whose last bubble carries the tail. The tail morphs into a joined
 * corner (and back) point by point, so when a new message joins a group the tail visibly passes
 * down to it. Plus the few vector glyphs the messenger needs (back chevron, send arrow, reaction
 * badges), drawn on a 24-unit grid.
 *
 * Engine candidate: a per-corner rounded rect (`roundRectPath` with four radii) and a
 * message-bubble shape in the UI Kit.
 */

import type { PathCommand } from '@/engine';

/** Cubic-bézier circle constant: control distance for a quarter arc of radius 1. */
const KAPPA = 0.5522847498;

export type Side = 'left' | 'right';

export type BubbleShape = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The sender's side: received bubbles sit left (tail bottom-left), sent ones right. */
  side: Side;
  /** Radius of the far corners and of unjoined corners. */
  radius: number;
  /** Radius where the bubble joins the one above (0 = not joined → `radius`). */
  top: number;
  /** Radius of the bottom corner on the sender's side while it has no tail. */
  bottom: number;
  /** 0 = joined corner (`bottom`), 1 = the tail. */
  tail: number;
  /** Tail size: how far it reaches out past the bubble and up its side. */
  tailW: number;
  tailH: number;
};

/**
 * The bubble's outline (clockwise for a left bubble; mirrored for a right one). Rebuilt per
 * frame only while a bubble changes shape — a dozen commands.
 */
export function bubblePath(s: BubbleShape): PathCommand[] {
  const { x, y, w, h, tail } = s;
  const limit = Math.max(0, Math.min(w, h) / 2);
  const R = Math.min(s.radius, limit);
  const tl = Math.min(s.top > 0 ? s.top : s.radius, limit);
  const r = Math.min(s.bottom, limit);
  const tw = s.tailW;
  const th = Math.min(s.tailH, h - tl);
  // The bottom corner on the sender's side, in a local frame: origin at the corner, +x into the
  // bubble, −y up. Joined: the quarter arc (r, 0) → (0, −r), split in two at t = ½ (de
  // Casteljau). Tail: along the bottom edge out to the tip (−tw, 0), then a concave sweep up
  // into the side at (0, −th). Both are two cubics, so one morphs into the other point by point.
  const P0x = r;
  const P1x = r - r * KAPPA;
  const P2y = -r + r * KAPPA;
  const q1x = (P0x + P1x) / 2;
  const p12x = P1x / 2;
  const p12y = P2y / 2;
  const r2y = (P2y - r) / 2;
  const q2x = (q1x + p12x) / 2;
  const q2y = p12y / 2;
  const r1x = p12x / 2;
  const r1y = (p12y + r2y) / 2;
  const mx = (q2x + r1x) / 2;
  const my = (q2y + r1y) / 2;
  // x, y pairs of the corner's seven points: start, two controls, middle, two controls, end.
  const joined = [P0x, 0, q1x, 0, q2x, q2y, mx, my, r1x, r1y, 0, r2y, 0, -r];
  const tailed = [
    tw * 1.4,
    0,
    tw * 0.55,
    0,
    -tw * 0.2,
    0,
    -tw,
    0,
    -tw * 0.42,
    -th * 0.12,
    0,
    -th * 0.5,
    0,
    -th,
  ];
  const left = s.side === 'left';
  // Bubble-space x (0 = the sender's side) to frame space, mirrored for right bubbles.
  const X = (bx: number) => (left ? x + bx : x + w - bx);
  const corner = (i: number): [number, number] => {
    const ax = joined[2 * i] ?? 0;
    const ay = joined[2 * i + 1] ?? 0;
    const bx = tailed[2 * i] ?? 0;
    const by = tailed[2 * i + 1] ?? 0;
    return [X(ax + (bx - ax) * tail), y + h + ay + (by - ay) * tail];
  };
  const kR = R * KAPPA;
  const kT = tl * KAPPA;
  return [
    ['M', X(tl), y],
    ['L', X(w - R), y],
    ['C', X(w - R + kR), y, X(w), y + R - kR, X(w), y + R],
    ['L', X(w), y + h - R],
    ['C', X(w), y + h - R + kR, X(w - R + kR), y + h, X(w - R), y + h],
    ['L', ...corner(0)],
    ['C', ...corner(1), ...corner(2), ...corner(3)],
    ['C', ...corner(4), ...corner(5), ...corner(6)],
    ['L', X(0), y + tl],
    ['C', X(0), y + tl - kT, X(tl - kT), y, X(tl), y],
    ['Z'],
  ];
}

/** How far a bubble's outline reaches past its rect on the sender's side (the tail). */
export const tailReach = (s: Pick<BubbleShape, 'tailW' | 'tail'>) => s.tailW * s.tail;

// --- glyphs (24-unit grid) ----------------------------------------------------------------

export type Glyph = {
  readonly fill?: readonly PathCommand[];
  readonly stroke?: readonly PathCommand[];
};

export const CHEVRON_LEFT: Glyph = {
  stroke: [
    ['M', 15, 5],
    ['L', 8, 12],
    ['L', 15, 19],
  ],
};

export const SEND_ARROW: Glyph = {
  stroke: [
    ['M', 12, 18.5],
    ['L', 12, 6],
    ['M', 6.5, 11.5],
    ['L', 12, 6],
    ['L', 17.5, 11.5],
  ],
};

export const HEART: Glyph = {
  fill: [
    ['M', 12, 20.6],
    ['C', 11.6, 20.6, 3.2, 15.5, 3.2, 9.3],
    ['C', 3.2, 6.4, 5.4, 4.3, 8, 4.3],
    ['C', 9.7, 4.3, 11.2, 5.2, 12, 6.6],
    ['C', 12.8, 5.2, 14.3, 4.3, 16, 4.3],
    ['C', 18.6, 4.3, 20.8, 6.4, 20.8, 9.3],
    ['C', 20.8, 15.5, 12.4, 20.6, 12, 20.6],
    ['Z'],
  ],
};

export const THUMBS: Glyph = {
  fill: [
    // Cuff.
    ['M', 3, 10.6],
    ['C', 3, 10.1, 3.4, 9.7, 3.9, 9.7],
    ['L', 6.3, 9.7],
    ['C', 6.8, 9.7, 7.2, 10.1, 7.2, 10.6],
    ['L', 7.2, 19.8],
    ['C', 7.2, 20.3, 6.8, 20.7, 6.3, 20.7],
    ['L', 3.9, 20.7],
    ['C', 3.4, 20.7, 3, 20.3, 3, 19.8],
    ['Z'],
    // Hand, thumb up.
    ['M', 8.8, 10.2],
    ['L', 12.1, 4.1],
    ['C', 12.6, 3.2, 13.7, 2.9, 14.6, 3.4],
    ['C', 15.5, 3.9, 15.8, 5, 15.4, 5.9],
    ['L', 14.4, 8.8],
    ['L', 18.9, 8.8],
    ['C', 20.3, 8.8, 21.3, 10.1, 21, 11.5],
    ['L', 19.6, 18.6],
    ['C', 19.3, 19.8, 18.3, 20.7, 17, 20.7],
    ['L', 8.8, 20.7],
    ['Z'],
  ],
};

/** A laughing face: the disc is filled; eyes and mouth are cut out (even-odd). */
export const LAUGH: Glyph = {
  fill: [
    // Face.
    ['M', 12, 2.8],
    ['C', 17.1, 2.8, 21.2, 6.9, 21.2, 12],
    ['C', 21.2, 17.1, 17.1, 21.2, 12, 21.2],
    ['C', 6.9, 21.2, 2.8, 17.1, 2.8, 12],
    ['C', 2.8, 6.9, 6.9, 2.8, 12, 2.8],
    ['Z'],
    // Mouth: a wide open grin.
    ['M', 6.9, 12.6],
    ['L', 17.1, 12.6],
    ['C', 17.1, 15.6, 14.9, 18, 12, 18],
    ['C', 9.1, 18, 6.9, 15.6, 6.9, 12.6],
    ['Z'],
    // Eyes squeezed shut: two small arches.
    ['M', 6.9, 10.4],
    ['C', 7.3, 8, 10.1, 8, 10.5, 10.4],
    ['L', 9.3, 10.4],
    ['C', 8.9, 9.3, 8.5, 9.3, 8.1, 10.4],
    ['Z'],
    ['M', 13.5, 10.4],
    ['C', 13.9, 8, 16.7, 8, 17.1, 10.4],
    ['L', 15.9, 10.4],
    ['C', 15.5, 9.3, 15.1, 9.3, 14.7, 10.4],
    ['Z'],
  ],
};
