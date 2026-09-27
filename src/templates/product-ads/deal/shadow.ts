/**
 * Contact shadow for a product standing on an invisible floor: two soft ellipses drawn with
 * radial gradients (no blur pass, so they cost two fills a frame). A dense core sits right under
 * the contact point and an ambient penumbra spreads around it; as the object lifts, the core
 * widens and fades faster than the penumbra — the shadow tightens as the object lands.
 *
 * The gradients are built once for a unit circle and stretched per frame by a group transform.
 */

import { type Color, type Draw, type Gradient, withAlpha } from '@/engine';

/** Gaussian-like falloff sampled at a few stops (the drawer interpolates between them in OKLab). */
function falloff(color: Color, steepness: number): Gradient {
  const stops = [0, 0.18, 0.36, 0.54, 0.72, 0.86, 1].map((offset) => ({
    offset,
    color: withAlpha(color, offset >= 1 ? 0 : Math.exp(-steepness * offset * offset)),
  }));
  return { kind: 'radial', cx: 0, cy: 0, r: 1, stops };
}

export type ContactShadow = {
  /**
   * Draws the shadow of an object `width` wide whose contact point is at (`cx`, `floorY`).
   * `lift` is the height above the floor as a share of the object's width (0 = standing on it).
   */
  draw(g: Draw, cx: number, floorY: number, width: number, lift: number, opacity: number): void;
};

export function createContactShadow(color: Color, strength = 1): ContactShadow {
  const core = falloff(color, 3.2);
  const penumbra = falloff(color, 2.4);
  const ellipse = (
    g: Draw,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    fill: Gradient,
    alpha: number,
  ) => {
    if (alpha <= 0.002 || rx <= 0 || ry <= 0) return;
    g.group({ x: cx, y: cy, scaleX: rx, scaleY: ry }, (g) =>
      g.circle(0, 0, 1, { fill, opacity: Math.min(1, alpha) }),
    );
  };
  return {
    draw(g, cx, floorY, width, lift, opacity) {
      if (opacity <= 0) return;
      const h = Math.max(0, lift);
      // Penumbra: wide and faint, grows slowly with height.
      const pw = width * (0.78 + 0.55 * h);
      ellipse(g, cx, floorY, pw, pw * 0.12, penumbra, 0.34 * strength * opacity * (1 - 0.45 * h));
      // Core: tight and dark under the contact point, gone once the object is a width up.
      const cw = width * (0.46 + 0.9 * h);
      const core01 = Math.max(0, 1 - 1.6 * h);
      ellipse(g, cx, floorY, cw, cw * 0.075, core, 0.62 * strength * opacity * core01 * core01);
    },
  };
}
