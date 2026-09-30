/**
 * Contact shadow for a product standing on an invisible floor (after Deal's): two soft ellipses
 * drawn with radial gradients (no blur pass, so they cost two fills a frame) — a dense core right
 * under the contact point and an ambient penumbra around it. The gradients are built once for a
 * unit circle and stretched per frame by a group transform.
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
  /** Draws the shadow of an object `width` wide standing at (`cx`, `floorY`). */
  draw(g: Draw, cx: number, floorY: number, width: number, opacity: number): void;
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
    draw(g, cx, floorY, width, opacity) {
      if (opacity <= 0) return;
      const pw = width * 0.8;
      ellipse(g, cx, floorY, pw, pw * 0.11, penumbra, 0.3 * strength * opacity);
      const cw = width * 0.48;
      ellipse(g, cx, floorY, cw, cw * 0.07, core, 0.55 * strength * opacity);
    },
  };
}
