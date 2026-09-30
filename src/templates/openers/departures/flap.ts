/**
 * A split-flap module (engine candidate: "flap cell renderer"). Two half flaps meet at a hinge;
 * a flip lets the upper flap fall forward — it foreshortens and darkens as it turns away from
 * the light — uncovering the next character's top half, then the next flap's lower half comes
 * down over the old one's. The flap falls like a real one (a parabolic, accelerating fall) and
 * lands with a tiny bounce. The hinge is a 1-px gap line across the module, with the pivot
 * notches at its ends.
 */

import type { Color, Draw, PathData, Rect, TextBlock } from '@/engine';
import type { FlapState } from './board';

export type FlapGeometry = {
  w: number;
  h: number;
  /** y of the hinge (the module's middle). */
  hinge: number;
  top: PathData;
  bottom: PathData;
  /** The halves as clip rects. */
  upper: Rect;
  lower: Rect;
  /** Pivot notch size at the hinge's ends. */
  notchW: number;
  notchH: number;
};

export type FlapColors = {
  /** Upper and lower flap faces (the upper one catches a little more light). */
  top: Color;
  bottom: Color;
  ink: Color;
  /** The hinge gap and the pivot notches. */
  gap: Color;
  /** Darkening of flaps turned away from the light. */
  shade: Color;
};

/**
 * A character set on a module: the shaped glyph, where to draw it (module coordinates) and its
 * horizontal scale (1, or less for letters too wide for the module).
 */
export type FlapGlyph = { block: TextBlock; x: number; y: number; scaleX: number };

export type GlyphSet = ReadonlyMap<string, FlapGlyph>;

/** How dark a flap edge-on to the viewer gets (fully turned away). */
const SHADE = 0.62;
/** The shadow the unfolding flap throws on the half it covers. */
const SHADOW = 0.3;
/** Landing: the lower flap bounces back off its stop for this long (seconds). */
const BOUNCE_TIME = 0.09;

/** A rectangle with only its top (or bottom) corners rounded. */
function half(w: number, h: number, y: number, r: number, top: boolean): PathData {
  const k = 0.5523 * r;
  if (top) {
    return [
      ['M', 0, y + h],
      ['L', 0, y + r],
      ['C', 0, y + r - k, r - k, y, r, y],
      ['L', w - r, y],
      ['C', w - r + k, y, w, y + r - k, w, y + r],
      ['L', w, y + h],
      ['Z'],
    ];
  }
  return [
    ['M', 0, y],
    ['L', w, y],
    ['L', w, y + h - r],
    ['C', w, y + h - r + k, w - r + k, y + h, w - r, y + h],
    ['L', r, y + h],
    ['C', r - k, y + h, 0, y + h - r + k, 0, y + h - r],
    ['Z'],
  ];
}

export function flapGeometry(w: number, h: number): FlapGeometry {
  const hinge = h / 2;
  const r = Math.min(w, h) * 0.09;
  return {
    w,
    h,
    hinge,
    top: half(w, hinge, 0, r, true),
    bottom: half(w, h - hinge, hinge, r, false),
    upper: { x: -w, y: -h, w: 3 * w, h: hinge + h },
    lower: { x: -w, y: hinge, w: 3 * w, h: 2 * h },
    notchW: w * 0.05,
    notchH: h * 0.07,
  };
}

/** Draws one module at (x, y) — pixel-snapped by the caller — in its state at this moment. */
export function drawFlap(
  g: Draw,
  x: number,
  y: number,
  geo: FlapGeometry,
  glyphs: GlyphSet,
  colors: FlapColors,
  state: FlapState,
  pixel: number,
  /** How far the lower flap bounces back on landing (share of its height; 0 = none). */
  bounce: number,
): void {
  g.group({ x, y }, (g) => {
    const glyph = (g: Draw, char: string) => {
      const set = glyphs.get(char);
      if (!set) return;
      if (set.scaleX < 1) {
        g.group({ scaleX: set.scaleX, originX: geo.w / 2 }, (g) =>
          g.text(set.block, { x: set.x, y: set.y, fill: colors.ink }),
        );
      } else {
        g.text(set.block, { x: set.x, y: set.y, fill: colors.ink });
      }
    };
    const upper = (g: Draw, char: string) => {
      g.path(geo.top, { fill: colors.top });
      if (char !== ' ') g.clip(geo.upper, (g) => glyph(g, char));
    };
    const lower = (g: Draw, char: string) => {
      g.path(geo.bottom, { fill: colors.bottom });
      if (char !== ' ') g.clip(geo.lower, (g) => glyph(g, char));
    };

    if (state.phase > 0) {
      // Behind the moving flap: the next character's top, the current one's bottom.
      upper(g, state.to);
      lower(g, state.from);
      // A parabolic fall: the flap turns through 180° with constant angular acceleration.
      const angle = Math.PI * state.phase * state.phase;
      if (angle < Math.PI / 2) {
        const s = Math.cos(angle);
        g.group({ scaleY: s, originY: geo.hinge }, (g) => {
          upper(g, state.from);
          g.path(geo.top, { fill: colors.shade, opacity: SHADE * (1 - s) });
        });
      } else {
        const s = -Math.cos(angle);
        g.path(geo.bottom, { fill: colors.shade, opacity: SHADOW * s });
        g.group({ scaleY: s, originY: geo.hinge }, (g) => {
          lower(g, state.to);
          g.path(geo.bottom, { fill: colors.shade, opacity: SHADE * (1 - s) });
        });
      }
    } else if (bounce > 0 && state.landed < BOUNCE_TIME && state.to !== ' ') {
      // Landing: the lower flap springs back a touch off its stop, over the flap behind it.
      const s = 1 - bounce * Math.sin((Math.PI * state.landed) / BOUNCE_TIME);
      upper(g, state.to);
      g.path(geo.bottom, { fill: colors.bottom });
      g.path(geo.bottom, { fill: colors.shade, opacity: SHADOW });
      g.group({ scaleY: s, originY: geo.hinge }, (g) => lower(g, state.to));
    } else {
      g.path(geo.top, { fill: colors.top });
      g.path(geo.bottom, { fill: colors.bottom });
      if (state.to !== ' ') glyph(g, state.to);
    }

    // The hinge: a one-pixel gap across the module, and the pivot notches at its ends.
    const gy = Math.floor((y + geo.hinge) / pixel) * pixel - y;
    g.rect({ x: 0, y: gy, w: geo.w, h: pixel }, { fill: colors.gap });
    const ny = geo.hinge - geo.notchH / 2;
    g.rect({ x: 0, y: ny, w: geo.notchW, h: geo.notchH }, { fill: colors.gap });
    g.rect({ x: geo.w - geo.notchW, y: ny, w: geo.notchW, h: geo.notchH }, { fill: colors.gap });
  });
}
