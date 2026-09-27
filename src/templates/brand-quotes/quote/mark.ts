/**
 * The oversized opening quotation mark (“). Pairings with a serif display face use that face's
 * own glyph; the others get this drawn serif mark — two "6" commas, each a ball with a tail that
 * sweeps up and tapers to a point — so the mark stays a serif in every pairing (only the
 * pairing's fonts are loaded, so another family's glyph is never available).
 */

import type { PathCommand, PathData, Rect } from '@/engine';

type Point = readonly [number, number];

/** Cubic segments of a circular arc from angle `a0` to `a1` (radians, y down), ≤ 90° each. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): PathCommand[] {
  const out: PathCommand[] = [];
  const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)));
  const d = (a1 - a0) / steps;
  const k = (4 / 3) * Math.tan(d / 4) * r;
  for (let i = 0; i < steps; i++) {
    const s = a0 + d * i;
    const e = s + d;
    const [x0, y0] = [cx + r * Math.cos(s), cy + r * Math.sin(s)];
    const [x3, y3] = [cx + r * Math.cos(e), cy + r * Math.sin(e)];
    out.push([
      'C',
      x0 - k * Math.sin(s),
      y0 + k * Math.cos(s),
      x3 + k * Math.sin(e),
      y3 - k * Math.cos(e),
      x3,
      y3,
    ]);
  }
  return out;
}

/** One "6" comma in a unit box one unit tall (y down), its left edge at `x`. */
function comma(x: number): PathCommand[] {
  const cx = x + 0.29;
  const cy = 0.715;
  const r = 0.285;
  const tip: Point = [x + 0.6, 0.0];
  const left: Point = [cx - r, cy];
  const upper = -Math.PI / 3; // where the tail's inner edge leaves the ball (upper right)
  const joint: Point = [cx + r * Math.cos(upper), cy + r * Math.sin(upper)];
  return [
    ['M', ...tip],
    // Outer edge: from the tip, sweeping left and down into the ball's left side.
    ['C', x + 0.27, 0.06, x + 0.005, 0.3, ...left],
    // The ball, round the bottom (angles decrease: left → bottom → right → upper right).
    ...arc(cx, cy, r, Math.PI, upper),
    // Inner edge: back up to the tip, thinning the tail as it rises.
    ['C', joint[0] - 0.12, joint[1] - 0.1, x + 0.36, 0.08, ...tip],
    ['Z'],
  ];
}

/** Width of the drawn mark per unit of height. */
const WIDTH = 1.33;

/** The drawn “ scaled to `height`, its ink box at the origin. */
export function drawnMark(height: number): { path: PathData; ink: Rect } {
  const unit = [...comma(0), ...comma(0.73)];
  const path = unit.map((command): PathCommand => {
    switch (command[0]) {
      case 'M':
      case 'L':
        return [command[0], command[1] * height, command[2] * height];
      case 'C':
        return [
          'C',
          command[1] * height,
          command[2] * height,
          command[3] * height,
          command[4] * height,
          command[5] * height,
          command[6] * height,
        ];
      case 'Q':
        return [
          'Q',
          command[1] * height,
          command[2] * height,
          command[3] * height,
          command[4] * height,
        ];
      default:
        return command;
    }
  });
  return { path, ink: { x: 0, y: 0, w: WIDTH * height, h: height } };
}
