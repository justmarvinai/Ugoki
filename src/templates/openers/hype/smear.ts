/**
 * Directional smear for whip pans: copies of what `draw` paints, spread along the motion and
 * averaged — each copy on its own layer at opacity 1/(k + 1), the running mean of opaque
 * frames — so a whip reads as a heavy directional blur even in a one-sample preview (the
 * export's temporal motion blur then fills the gaps between the copies).
 *
 * Engine candidate: a directional blur effect (`g.fx({ dirBlur: { angle, length } })`).
 */

import type { Draw, Rect } from '@/engine';

/** Most copies per frame (each is a layer the size of `bounds`). */
export const MAX_COPIES = 6;

/**
 * Draws `draw` smeared over `length` design units along the unit vector (dx, dy), centered on
 * its own position (a centered shutter). `draw` must paint `bounds` opaquely.
 */
export function smear(
  g: Draw,
  length: number,
  dx: number,
  dy: number,
  spacing: number,
  bounds: Rect,
  draw: (g: Draw) => void,
): void {
  const copies = Math.min(MAX_COPIES, Math.max(1, Math.ceil(length / Math.max(1, spacing)) + 1));
  if (copies <= 1) {
    draw(g);
    return;
  }
  for (let k = 0; k < copies; k++) {
    // Evenly spread across the length; the running mean makes the order irrelevant.
    const offset = (k / (copies - 1) - 0.5) * length;
    const x = dx * offset;
    const y = dy * offset;
    if (k === 0) g.group({ x, y }, draw);
    else g.layer({ opacity: 1 / (k + 1), bounds }, (g) => g.group({ x, y }, draw));
  }
}
