/**
 * The label layout of Callouts: which column each callout's label goes to, where it sits in its
 * column, and the leader line that joins it to its anchor.
 *
 * - Sides: *Auto* labels take the side nearer their anchor, then the columns are balanced (at
 *   most one label more on either side) by moving the automatic label whose anchor sits nearest
 *   the product's middle.
 * - Distribution: each column is solved exactly — label tops in reading order, never closer than
 *   `gap`, inside the column, as near as possible (least squares) to where each label wants to
 *   sit. With the tops shifted by the heights stacked above them the order constraints become
 *   "non-decreasing", an isotonic regression solved by pool-adjacent-violators; uniform bounds
 *   then clamp the solution without breaking it.
 * - Leaders: a 45° leg from the anchor, then a level run into the label — the angle never varies,
 *   whatever the distribution did (only when a label had to move further than the run allows
 *   does the leg steepen).
 */

import type { PathData } from '@/engine';

export type Side = 'left' | 'right';

export type SideRequest = {
  readonly choice: 'auto' | Side;
  /** Anchor across the product box (0 = its left edge, 1 = its right edge). */
  readonly across: number;
};

export function assignSides(requests: readonly SideRequest[]): Side[] {
  const sides = requests.map(
    (r): Side => (r.choice === 'auto' ? (r.across < 0.5 ? 'left' : 'right') : r.choice),
  );
  for (let guard = 0; guard < requests.length; guard++) {
    const left = sides.filter((side) => side === 'left').length;
    const right = sides.length - left;
    if (Math.abs(left - right) <= 1) break;
    const from: Side = left > right ? 'left' : 'right';
    let pick = -1;
    let nearest = Number.POSITIVE_INFINITY;
    requests.forEach((r, i) => {
      if (r.choice !== 'auto' || sides[i] !== from) return;
      // How far the anchor sits into its own half (the one nearest the middle moves).
      const depth = from === 'left' ? 0.5 - r.across : r.across - 0.5;
      if (depth < nearest) {
        nearest = depth;
        pick = i;
      }
    });
    if (pick < 0) break;
    sides[pick] = from === 'left' ? 'right' : 'left';
  }
  return sides;
}

export type StackItem = {
  /** Where the label's attach point wants to be (y). */
  readonly desired: number;
  readonly height: number;
  /** The attach point below the label's top. */
  readonly attach: number;
};

/**
 * Tops for labels stacked in one column (items sorted by `desired`): non-overlapping with `gap`
 * between them, inside [`top`, `bottom`], least-squares nearest to their desired places. A stack
 * taller than the column is centered on it (callers shrink the labels before that happens).
 */
export function distribute(
  items: readonly StackItem[],
  gap: number,
  top: number,
  bottom: number,
): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const item of items) {
    offsets.push(offset);
    offset += item.height + gap;
  }
  const total = Math.max(0, offset - gap);
  // Pool adjacent violators on the shifted targets.
  const sums: number[] = [];
  const counts: number[] = [];
  items.forEach((item, i) => {
    sums.push(item.desired - item.attach - (offsets[i] ?? 0));
    counts.push(1);
    while (sums.length > 1) {
      const last = sums.length - 1;
      const a = (sums[last - 1] ?? 0) / (counts[last - 1] ?? 1);
      const b = (sums[last] ?? 0) / (counts[last] ?? 1);
      if (a <= b) break;
      sums[last - 1] = (sums[last - 1] ?? 0) + (sums[last] ?? 0);
      counts[last - 1] = (counts[last - 1] ?? 0) + (counts[last] ?? 0);
      sums.pop();
      counts.pop();
    }
  });
  const lo = top;
  const hi = bottom - total;
  const tops: number[] = [];
  sums.forEach((sum, block) => {
    const count = counts[block] ?? 1;
    const mean = sum / count;
    const z = hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, mean));
    for (let k = 0; k < count; k++) tops.push(z + (offsets[tops.length] ?? 0));
  });
  return tops;
}

export type Leader = {
  readonly path: PathData;
  /** Where the leader leaves the anchor (for the casing's reach). */
  readonly start: { x: number; y: number };
  /** The elbow (equal to the end on a level leader). */
  readonly elbow: { x: number; y: number };
};

/**
 * A leader from anchor (`ax`, `ay`) to the label's attach point (`ex`, `ey`), starting `clear`
 * away from the anchor (outside the dot). `elbow`: a 45° leg then a level run of at least `run`;
 * otherwise one straight segment.
 */
export function leader(
  ax: number,
  ay: number,
  ex: number,
  ey: number,
  clear: number,
  run: number,
  elbow: boolean,
): Leader {
  const dir = ex >= ax ? 1 : -1;
  const dy = ey - ay;
  const room = Math.abs(ex - ax);
  let kx = ex;
  let ky = ey;
  if (elbow && Math.abs(dy) > 0.5) {
    // The leg rises (or falls) at 45° and levels off; a leg that needs more height than the
    // room allows steepens instead of cutting into the run.
    const most = room - run;
    const leg = most > 0 ? Math.min(Math.abs(dy), most) : room * 0.5;
    kx = ax + dir * leg;
    ky = ey;
  }
  const vx = kx - ax;
  const vy = ky - ay;
  const length = Math.hypot(vx, vy);
  const sx = length > 0 ? ax + (vx / length) * clear : ax + dir * clear;
  const sy = length > 0 ? ay + (vy / length) * clear : ay;
  const straight = kx === ex && ky === ey;
  const path: PathData = straight
    ? [
        ['M', sx, sy],
        ['L', ex, ey],
      ]
    : [
        ['M', sx, sy],
        ['L', kx, ky],
        ['L', ex, ey],
      ];
  return { path, start: { x: sx, y: sy }, elbow: { x: kx, y: ky } };
}
