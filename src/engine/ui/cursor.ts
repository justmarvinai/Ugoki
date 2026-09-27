/**
 * The UI Kit cursor: generic arrow and pointing-hand cursors as vector paths (crisp outline,
 * soft shadow), and a motion path that moves like a hand — minimum-jerk speed along gently
 * curved paths, an optional overshoot that is corrected by a short second movement, and a
 * human pause before each click (docs/templates/10-ui-motion.md, "Shared behaviour").
 */

import { type Color, rgb } from '../core/color';
import { clamp01, type Vec2 } from '../core/math';
import type { Draw, PathCommand, PathData } from '../draw/types';
import { minimumJerk } from './curves';
import { roundRectPath } from './shape';

export type CursorKind = 'arrow' | 'hand';

// --- shapes (cursor units ≈ screen px of a 1× cursor; the hotspot is at 0, 0) ---------------

const ARROW: PathData = [
  ['M', 0, 0],
  ['L', 0, 17.2],
  ['L', 4.3, 13.2],
  ['L', 7.15, 19.7],
  ['L', 9.95, 18.5],
  ['L', 7.2, 12.1],
  ['L', 12.7, 12.1],
  ['Z'],
];

const KAPPA = 0.5522847498;

/** A capsule from A to B with radius r (two half circles joined by straight sides). */
function capsule(ax: number, ay: number, bx: number, by: number, r: number): PathCommand[] {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const dx = (bx - ax) / len;
  const dy = (by - ay) / len;
  const nx = -dy;
  const ny = dx;
  const k = r * KAPPA;
  return [
    ['M', ax + nx * r, ay + ny * r],
    ['L', bx + nx * r, by + ny * r],
    [
      'C',
      bx + nx * r + dx * k,
      by + ny * r + dy * k,
      bx + dx * r + nx * k,
      by + dy * r + ny * k,
      bx + dx * r,
      by + dy * r,
    ],
    [
      'C',
      bx + dx * r - nx * k,
      by + dy * r - ny * k,
      bx - nx * r + dx * k,
      by - ny * r + dy * k,
      bx - nx * r,
      by - ny * r,
    ],
    ['L', ax - nx * r, ay - ny * r],
    [
      'C',
      ax - nx * r - dx * k,
      ay - ny * r - dy * k,
      ax - dx * r - nx * k,
      ay - dy * r - ny * k,
      ax - dx * r,
      ay - dy * r,
    ],
    [
      'C',
      ax - dx * r + nx * k,
      ay - dy * r + ny * k,
      ax + nx * r - dx * k,
      ay + ny * r - dy * k,
      ax + nx * r,
      ay + ny * r,
    ],
    ['Z'],
  ];
}

/** A pointing hand as a union of rounded parts (stroked, then filled, for one clean outline). */
const HAND: PathData = [
  ...capsule(0, 1.7, 0, 10.5, 1.75), // index finger
  ...capsule(3.45, 6.9, 3.45, 11, 1.7), // middle
  ...capsule(6.75, 7.9, 6.75, 11.6, 1.6), // ring
  ...capsule(9.75, 9.3, 9.75, 12.4, 1.4), // little finger
  ...capsule(-2.15, 13.7, -4.9, 10.2, 1.55), // thumb
  ...roundRectPath({ x: -2.2, y: 9.4, w: 13.35, h: 8.6 }, 3.6), // palm
  ...roundRectPath({ x: -0.4, y: 15.4, w: 10.2, h: 4.9 }, 1.2), // heel of the hand
];

/** Short creases between the folded fingers (drawn in the outline color). */
const HAND_CREASES: PathData = [
  ['M', 1.75, 8.3],
  ['L', 1.75, 10.6],
  ['M', 5.1, 9.2],
  ['L', 5.1, 11.2],
  ['M', 8.35, 10.3],
  ['L', 8.35, 11.9],
];

const BLACK = rgb(0.04, 0.04, 0.05);
const WHITE = rgb(1, 1, 1);
const SHADOW = rgb(0, 0, 0, 0.26);
const HALO = rgb(0, 0, 0, 0.07);

export type CursorDrawOptions = {
  /** Design units per cursor unit (a 1× cursor is ~20 units tall). */
  scale: number;
  /** Press amount 0..1: the cursor dips to 88% around its hotspot. */
  press?: number;
  opacity?: number;
};

/** Draws a cursor with its hotspot at (x, y). */
export function drawCursor(
  g: Draw,
  kind: CursorKind,
  x: number,
  y: number,
  options: CursorDrawOptions,
): void {
  const opacity = options.opacity ?? 1;
  if (opacity <= 0) return;
  const press = clamp01(options.press ?? 0);
  const scale = options.scale * (1 - 0.12 * press);
  const path = kind === 'hand' ? HAND : ARROW;
  const fill: Color = kind === 'hand' ? WHITE : BLACK;
  const outline: Color = kind === 'hand' ? BLACK : WHITE;
  g.group({ x, y, scale, opacity }, (g) => {
    // Soft shadow: a halo and a dense core, offset down (light from above).
    g.group({ x: 0.35, y: 1.35 }, (g) => {
      g.path(path, { stroke: { color: HALO, width: 4.2, join: 'round', cap: 'round' } });
      g.path(path, { fill: SHADOW, stroke: { color: SHADOW, width: 1.4, join: 'round' } });
    });
    g.path(path, { stroke: { color: outline, width: 2.4, join: 'round', cap: 'round' } });
    g.path(path, { fill });
    if (kind === 'hand') {
      g.path(HAND_CREASES, { stroke: { color: outline, width: 1.05, cap: 'round' } });
    }
  });
}

// --- motion -------------------------------------------------------------------------------

export type CursorMove = {
  /** Duration of the movement (seconds). */
  dur: number;
  /** Sideways bow as a share of the distance (positive bends to the right of travel). */
  bow?: number;
  /** Overshoot past the target along the arrival direction (design units). */
  overshoot?: number;
  /** Duration of the corrective sub-movement after an overshoot (default 0.16 s). */
  correct?: number;
};

type Segment = {
  t0: number;
  dur: number;
  ax: number;
  ay: number;
  cx: number;
  cy: number;
  bx: number;
  by: number;
  /** Cumulative arc length at LUT_STEPS + 1 even parameter steps. */
  lut: Float64Array;
};

const LUT_STEPS = 32;

export type CursorState = {
  x: number;
  y: number;
  /** Press amount 0..1 (see `CursorPath.click`). */
  press: number;
};

/** Press envelope: a fast press, a short hold, an eased release (seconds). */
const PRESS_IN = 0.025;
const PRESS_HOLD = 0.055;
const PRESS_OUT = 0.09;

/**
 * A cursor's choreography, built once in `build`: moves along quadratic curves with
 * minimum-jerk timing (by arc length, so speed follows the profile exactly), optional
 * overshoot-and-correct, pauses and clicks. `at(t)` is random access and allocation-free.
 */
export class CursorPath {
  private readonly segments: Segment[] = [];
  /** Click times (seconds). */
  readonly clicks: number[] = [];
  private t: number;
  private x: number;
  private y: number;

  constructor(start: Vec2, startTime = 0) {
    this.x = start.x;
    this.y = start.y;
    this.t = startTime;
  }

  /** The time at which the choreography built so far ends. */
  get time(): number {
    return this.t;
  }

  /** Where the cursor rests after the choreography built so far. */
  get position(): Vec2 {
    return { x: this.x, y: this.y };
  }

  /** Moves to `to`, starting now. */
  move(to: Vec2, options: CursorMove): this {
    const dx = to.x - this.x;
    const dy = to.y - this.y;
    const distance = Math.hypot(dx, dy);
    const bow = options.bow ?? 0;
    // Control point: the chord's midpoint pushed sideways (right-hand normal of travel).
    const cx = this.x + dx / 2 - dy * bow;
    const cy = this.y + dy / 2 + dx * bow;
    const overshoot = options.overshoot ?? 0;
    let bx = to.x;
    let by = to.y;
    if (overshoot > 0 && distance > 0) {
      // Past the target along the arrival direction (the curve's end tangent).
      const tx = to.x - cx;
      const ty = to.y - cy;
      const tl = Math.hypot(tx, ty) || 1;
      bx += (tx / tl) * overshoot;
      by += (ty / tl) * overshoot;
    }
    this.push(cx, cy, bx, by, options.dur);
    if (overshoot > 0 && distance > 0) {
      const correct = options.correct ?? 0.16;
      this.push((bx + to.x) / 2, (by + to.y) / 2, to.x, to.y, correct);
    }
    return this;
  }

  /** Waits `seconds` (a human pause before a click, a rest). */
  wait(seconds: number): this {
    this.t += Math.max(0, seconds);
    return this;
  }

  /** Waits until the absolute time `time` (no-op if it has passed). */
  until(time: number): this {
    this.t = Math.max(this.t, time);
    return this;
  }

  /** Clicks now: press, hold, release (the release overlaps what comes next). */
  click(): this {
    this.clicks.push(this.t);
    this.t += PRESS_IN + PRESS_HOLD;
    return this;
  }

  /** Position and press amount at `t`. The returned object is `out` (or a shared one). */
  at(t: number, out: CursorState = this.state): CursorState {
    let x = this.x;
    let y = this.y;
    const first = this.segments[0];
    if (first && t <= first.t0) {
      x = first.ax;
      y = first.ay;
    } else {
      for (let i = this.segments.length - 1; i >= 0; i--) {
        const s = this.segments[i] as Segment;
        if (t < s.t0) continue;
        if (t >= s.t0 + s.dur) {
          x = s.bx;
          y = s.by;
        } else {
          const u = this.parameter(s, minimumJerk((t - s.t0) / s.dur));
          const mu = 1 - u;
          x = mu * mu * s.ax + 2 * mu * u * s.cx + u * u * s.bx;
          y = mu * mu * s.ay + 2 * mu * u * s.cy + u * u * s.by;
        }
        break;
      }
    }
    out.x = x;
    out.y = y;
    out.press = this.pressAt(t);
    return out;
  }

  /** Press amount 0..1 at `t`. */
  pressAt(t: number): number {
    let press = 0;
    for (const c of this.clicks) {
      const local = t - c;
      if (local < 0 || local > PRESS_IN + PRESS_HOLD + PRESS_OUT) continue;
      const p =
        local < PRESS_IN
          ? local / PRESS_IN
          : local < PRESS_IN + PRESS_HOLD
            ? 1
            : 1 - (local - PRESS_IN - PRESS_HOLD) / PRESS_OUT;
      press = Math.max(press, clamp01(p));
    }
    return press;
  }

  private readonly state: CursorState = { x: 0, y: 0, press: 0 };

  private push(cx: number, cy: number, bx: number, by: number, dur: number): void {
    const ax = this.x;
    const ay = this.y;
    const lut = new Float64Array(LUT_STEPS + 1);
    let px = ax;
    let py = ay;
    for (let i = 1; i <= LUT_STEPS; i++) {
      const u = i / LUT_STEPS;
      const mu = 1 - u;
      const qx = mu * mu * ax + 2 * mu * u * cx + u * u * bx;
      const qy = mu * mu * ay + 2 * mu * u * cy + u * u * by;
      lut[i] = (lut[i - 1] as number) + Math.hypot(qx - px, qy - py);
      px = qx;
      py = qy;
    }
    this.segments.push({ t0: this.t, dur: Math.max(1e-3, dur), ax, ay, cx, cy, bx, by, lut });
    this.t += Math.max(1e-3, dur);
    this.x = bx;
    this.y = by;
  }

  /** Curve parameter at a share `s` of the segment's arc length. */
  private parameter(segment: Segment, s: number): number {
    const { lut } = segment;
    const total = lut[LUT_STEPS] as number;
    if (total <= 0) return s;
    const target = clamp01(s) * total;
    let i = 1;
    while (i < LUT_STEPS && (lut[i] as number) < target) i++;
    const l0 = lut[i - 1] as number;
    const l1 = lut[i] as number;
    const f = l1 > l0 ? (target - l0) / (l1 - l0) : 0;
    return (i - 1 + f) / LUT_STEPS;
  }
}
