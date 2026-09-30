/**
 * Frosted glass without Canvas `filter` (Safari has none): Ugoki renders the background itself,
 * so a panel's "backdrop blur" is the template's own background drawn a second time inside the
 * panel's shape under `g.fx({ blur, adjust })` — the compositor blurs it — with a tint, a rim of
 * light along the top edge and a hairline on top.
 */

import { type Color, parseHex, relativeLuminance, withAlpha } from '../core/color';
import type { Rect } from '../core/math';
import type { ClipShape, Draw, Gradient, PathCommand } from '../draw/types';
import { roundRectPath, roundRectPathReverse } from './shape';

/** Paints the background behind a panel, in the coordinates the panel is placed in. */
export type Backdrop = (g: Draw) => void;

export type FrostOptions = {
  /** The tint over the blurred backdrop: a color with alpha (the material). */
  tint: Color;
  /** Backdrop blur (σ, in u; default 3.2). */
  blur?: number;
  /** Backdrop vibrancy (default 1.4) and brightness (default 1). */
  saturation?: number;
  brightness?: number;
  /** Hairline border (default: light on dark tints, dark on light ones; null for none). */
  border?: Color | null;
  /** Light caught along the top edge, 0..1 (default 0.6). */
  rim?: number;
  /** Tint opacity when there is no backdrop to frost (transparent export; default 0.92). */
  solid?: number;
};

const WHITE = parseHex('#FFFFFF');
const BLACK = parseHex('#000000');

/** The effect options of a frosted backdrop. */
function backdropFx(options: FrostOptions, bounds: Rect, opacity: number) {
  return {
    blur: options.blur ?? 3.2,
    bounds,
    opacity,
    adjust: {
      saturation: options.saturation ?? 1.4,
      brightness: options.brightness ?? 1,
    },
  };
}

/**
 * A frosted panel of a fixed size, placed per frame: its top-left at (x, y) in the backdrop's
 * coordinates, scaled around its center. The blur covers the panel's bounds only (plus the
 * blur's reach), so it stays cheap.
 */
export class FrostedPanel {
  readonly w: number;
  readonly h: number;
  readonly radius: number;
  private readonly options: FrostOptions;
  private readonly local: Rect;
  private readonly shape: { rect: Rect; radius: number };
  private readonly rim: PathCommand[];
  private readonly rimFill: Gradient;
  private readonly border: Color | null;
  private readonly borderRect: Rect;
  private readonly solidTint: Color;
  private readonly place = { x: 0, y: 0, scale: 1, originX: 0, originY: 0 };
  private readonly unscale = { scale: 1, originX: 0, originY: 0 };
  private readonly unmove = { x: 0, y: 0 };

  constructor(w: number, h: number, radius: number, options: FrostOptions) {
    this.w = w;
    this.h = h;
    this.radius = Math.min(radius, w / 2, h / 2);
    this.options = options;
    this.local = { x: 0, y: 0, w, h };
    this.shape = { rect: this.local, radius: this.radius };
    const dark = relativeLuminance(options.tint) < 0.18;
    // The rim: a band just inside the outline, lit from above and fading down the sides.
    const width = Math.max(1, Math.min(w, h) * 0.012);
    const inner: Rect = { x: width, y: width, w: w - 2 * width, h: h - 2 * width };
    this.rim = [
      ...roundRectPath(this.local, this.radius),
      ...roundRectPathReverse(inner, Math.max(0, this.radius - width)),
    ];
    const rim = options.rim ?? 0.6;
    this.rimFill = {
      kind: 'linear',
      x0: 0,
      y0: 0,
      x1: 0,
      y1: Math.min(h, this.radius * 2.4),
      stops: [
        { offset: 0, color: withAlpha(WHITE, (dark ? 0.3 : 0.75) * rim) },
        { offset: 1, color: withAlpha(WHITE, 0) },
      ],
    };
    this.border =
      options.border === undefined
        ? dark
          ? withAlpha(WHITE, 0.12)
          : withAlpha(BLACK, 0.07)
        : options.border;
    this.borderRect = { x: 0.5, y: 0.5, w: w - 1, h: h - 1 };
    this.solidTint = withAlpha(options.tint, Math.max(options.tint.a, options.solid ?? 0.92));
    this.place.originX = w / 2;
    this.place.originY = h / 2;
    this.unscale.originX = w / 2;
    this.unscale.originY = h / 2;
  }

  /**
   * Draws the panel. `backdrop` paints what lies behind it, in the coordinates (x, y) are in;
   * `false` when the blurred backdrop was already drawn (`frostBackdrop`, one blur for several
   * panels); null when nothing is behind it (a transparent export), which leaves a denser tint.
   * `content` draws inside the panel in its local coordinates (0, 0 at its top-left), scaled
   * along.
   */
  draw(
    g: Draw,
    x: number,
    y: number,
    backdrop: Backdrop | null | false,
    options: { scale?: number; opacity?: number; content?: (g: Draw) => void } = {},
  ): void {
    const opacity = options.opacity ?? 1;
    if (opacity <= 0) return;
    const scale = options.scale ?? 1;
    this.place.x = x;
    this.place.y = y;
    this.place.scale = scale;
    this.unscale.scale = scale > 1e-6 ? 1 / scale : 1;
    this.unmove.x = -x;
    this.unmove.y = -y;
    g.group(this.place, (g) => {
      if (backdrop) {
        g.clip(this.shape, (g) =>
          g.fx(backdropFx(this.options, this.local, opacity), (g) =>
            g.group(this.unscale, (g) => g.group(this.unmove, backdrop)),
          ),
        );
      }
      g.roundRect(this.local, this.radius, {
        fill: backdrop === null ? this.solidTint : this.options.tint,
        opacity,
      });
      g.path(this.rim, { fill: this.rimFill, opacity });
      if (this.border) {
        g.roundRect(this.borderRect, this.radius - 0.5, {
          stroke: { color: this.border, width: 1 },
          opacity,
        });
      }
      options.content?.(g);
    });
  }
}

/**
 * The frosted backdrop of several panels at once — one blur for all of them: `backdrop` drawn
 * blurred inside `shape` (e.g. a path of every panel's outline) within `bounds`. Draw the
 * panels' tints and content after it.
 */
export function frostBackdrop(
  g: Draw,
  shape: ClipShape,
  bounds: Rect,
  backdrop: Backdrop,
  options: Omit<FrostOptions, 'tint'> & { opacity?: number },
): void {
  const opacity = options.opacity ?? 1;
  if (opacity <= 0) return;
  g.clip(shape, (g) => g.fx(backdropFx({ ...options, tint: BLACK }, bounds, opacity), backdrop));
}

/**
 * Frosted glass for a panel whose rect changes every frame (a palette growing as results
 * arrive): the same material as `FrostedPanel`, built per call. `rect` is in the backdrop's
 * coordinates; `backdrop` as in `FrostedPanel.draw`.
 */
export function drawGlass(
  g: Draw,
  rect: Rect,
  radius: number,
  backdrop: Backdrop | null | false,
  options: FrostOptions & { opacity?: number },
): void {
  const opacity = options.opacity ?? 1;
  if (opacity <= 0 || rect.w <= 0 || rect.h <= 0) return;
  const r = Math.min(radius, rect.w / 2, rect.h / 2);
  const shape = { rect, radius: r };
  if (backdrop) g.clip(shape, (g) => g.fx(backdropFx(options, rect, opacity), backdrop));
  const dark = relativeLuminance(options.tint) < 0.18;
  const tint =
    backdrop === null
      ? withAlpha(options.tint, Math.max(options.tint.a, options.solid ?? 0.92))
      : options.tint;
  g.roundRect(rect, r, { fill: tint, opacity });
  // New path and gradient objects: the drawer caches both by identity.
  const width = Math.max(1, Math.min(rect.w, rect.h) * 0.012);
  const inner: Rect = {
    x: rect.x + width,
    y: rect.y + width,
    w: rect.w - 2 * width,
    h: rect.h - 2 * width,
  };
  const rim = options.rim ?? 0.6;
  g.path([...roundRectPath(rect, r), ...roundRectPathReverse(inner, Math.max(0, r - width))], {
    fill: {
      kind: 'linear',
      x0: 0,
      y0: rect.y,
      x1: 0,
      y1: rect.y + Math.min(rect.h, r * 2.4),
      stops: [
        { offset: 0, color: withAlpha(WHITE, (dark ? 0.3 : 0.75) * rim) },
        { offset: 1, color: withAlpha(WHITE, 0) },
      ],
    },
    opacity,
  });
  const border =
    options.border === undefined
      ? dark
        ? withAlpha(WHITE, 0.12)
        : withAlpha(BLACK, 0.07)
      : options.border;
  if (border) {
    g.roundRect({ x: rect.x + 0.5, y: rect.y + 0.5, w: rect.w - 1, h: rect.h - 1 }, r - 0.5, {
      stroke: { color: border, width: 1 },
      opacity,
    });
  }
}
