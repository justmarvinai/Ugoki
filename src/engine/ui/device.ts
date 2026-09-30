/**
 * A generic phone (docs/templates/10-ui-motion.md, "Device frame"): no real model's outline, no
 * brand — a slim metal band, black glass around the display, a punch-hole camera and side
 * buttons, built around the display rect so a `Screen` drops straight into it.
 */

import { type Color, mixOklab, parseHex, withAlpha } from '../core/color';
import type { Rect } from '../core/math';
import type { Draw, Gradient, PathCommand } from '../draw/types';
import { BoxShadow, roundRectPath, roundRectPathReverse } from './shape';

export const PHONE_FINISHES = ['graphite', 'silver', 'sand'] as const;
export type PhoneFinish = (typeof PHONE_FINISHES)[number];

/** Band colors per finish: dark edge, light edge, and the tone between. */
const FINISH: Record<PhoneFinish, { dark: string; mid: string; light: string; button: string }> = {
  graphite: { dark: '#18191C', mid: '#2E3034', light: '#5A5D63', button: '#2A2C30' },
  silver: { dark: '#A9ACB2', mid: '#D5D7DB', light: '#F4F5F7', button: '#BFC2C7' },
  sand: { dark: '#9C8A74', mid: '#C9B79F', light: '#EDE2D2', button: '#B7A58D' },
};

const GLASS = parseHex('#050506');

export type PhoneOptions = {
  /** The display, in design units: the body is built around it. */
  screen: Rect;
  finish?: PhoneFinish;
  /** Corner radius of the display (default 14% of its width). */
  screenRadius?: number;
  /** Soft shadow under the phone (0 = none, default 1). */
  shadow?: number;
  /** Color the shadow falls on (denser on dark stages). */
  stageDark?: boolean;
  /** No device: just the display's rounded corners and its shadow (a frameless screen). */
  bare?: boolean;
};

/**
 * A phone around a display rect. Draw `back` (shadow, buttons, band and glass), then the screen
 * clipped to `screen`/`screenRadius`, then `front` (camera, a faint glass sheen). All in the
 * coordinates the display rect was given in, so one group transform moves the whole device.
 */
export class Phone {
  readonly screen: Rect;
  readonly screenRadius: number;
  /** Outer bounds of the body (without side buttons). */
  readonly body: Rect;
  readonly radius: number;
  /** Outer bounds including the side buttons and shadow reach (for layer bounds). */
  readonly bounds: Rect;
  private readonly band: PathCommand[];
  private readonly bandFill: Gradient;
  private readonly bandEdge: Color;
  private readonly glass: Rect;
  private readonly glassRadius: number;
  private readonly buttons: Rect[];
  private readonly buttonFill: Color;
  private readonly camera: { cx: number; cy: number; r: number };
  private readonly sheen: Gradient;
  private readonly shadow: BoxShadow | null;
  private readonly shadowOpacity: number;
  private readonly bare: boolean;

  constructor(options: PhoneOptions) {
    const s = options.screen;
    const k = s.w / 390;
    this.screen = s;
    const bare = options.bare ?? false;
    this.bare = bare;
    this.screenRadius = options.screenRadius ?? s.w * (bare ? 0.075 : 0.14);
    const bezel = bare ? 0 : 11 * k;
    const rim = bare ? 0 : 4.5 * k;
    this.glass = { x: s.x - bezel, y: s.y - bezel, w: s.w + 2 * bezel, h: s.h + 2 * bezel };
    this.glassRadius = this.screenRadius + bezel * 0.92;
    this.body = {
      x: this.glass.x - rim,
      y: this.glass.y - rim,
      w: this.glass.w + 2 * rim,
      h: this.glass.h + 2 * rim,
    };
    this.radius = this.glassRadius + rim;
    const f = FINISH[options.finish ?? 'graphite'];
    // The band: body minus glass, lit from the top left.
    this.band = [
      ...roundRectPath(this.body, this.radius),
      ...roundRectPathReverse(this.glass, this.glassRadius),
    ];
    const b = this.body;
    this.bandFill = {
      kind: 'linear',
      x0: b.x,
      y0: b.y,
      x1: b.x + b.w,
      y1: b.y + b.h,
      stops: [
        { offset: 0, color: parseHex(f.light) },
        { offset: 0.18, color: parseHex(f.mid) },
        { offset: 0.5, color: parseHex(f.dark) },
        { offset: 0.82, color: parseHex(f.mid) },
        { offset: 1, color: parseHex(f.light) },
      ],
    };
    this.bandEdge = withAlpha(parseHex(f.light), 0.55);
    this.buttonFill = parseHex(f.button);
    const bw = 3.2 * k;
    const left = b.x - bw + 0.6 * k;
    const right = b.x + b.w - 0.6 * k;
    this.buttons = [
      { x: left, y: b.y + 150 * k, w: bw, h: 30 * k },
      { x: left, y: b.y + 210 * k, w: bw, h: 58 * k },
      { x: left, y: b.y + 280 * k, w: bw, h: 58 * k },
      { x: right, y: b.y + 232 * k, w: bw, h: 92 * k },
    ];
    this.camera = { cx: s.x + s.w / 2, cy: s.y + 19 * k, r: 6.2 * k };
    this.sheen = {
      kind: 'linear',
      x0: s.x,
      y0: s.y,
      x1: s.x + s.w * 0.9,
      y1: s.y + s.h * 0.55,
      stops: [
        { offset: 0, color: withAlpha(parseHex('#FFFFFF'), 0.07) },
        { offset: 0.45, color: withAlpha(parseHex('#FFFFFF'), 0.015) },
        { offset: 1, color: withAlpha(parseHex('#FFFFFF'), 0) },
      ],
    };
    const shadow = options.shadow ?? 1;
    this.shadowOpacity = shadow;
    this.shadow =
      shadow > 0
        ? new BoxShadow(
            b.w,
            b.h,
            this.radius,
            [
              { y: 6, blur: 7, spread: -2, alpha: 0.2 },
              { y: 34, blur: 38, spread: -10, alpha: 0.26 },
            ],
            k,
            parseHex('#0A0B10'),
            options.stageDark ? 2 : 1,
          )
        : null;
    const reach = 90 * k;
    this.bounds = {
      x: b.x - reach,
      y: b.y - reach,
      w: b.w + 2 * reach,
      h: b.h + 2 * reach + 40 * k,
    };
  }

  /** Shadow, side buttons, band and the black glass around the display. */
  back(g: Draw, opacity = 1): void {
    if (opacity <= 0) return;
    this.shadow?.draw(g, this.body.x, this.body.y, opacity * this.shadowOpacity);
    if (this.bare) return;
    for (const button of this.buttons) {
      g.roundRect(button, button.w * 0.45, { fill: this.buttonFill, opacity });
    }
    g.roundRect(this.glass, this.glassRadius, { fill: GLASS, opacity });
    g.path(this.band, { fill: this.bandFill, opacity });
    const b = this.body;
    g.roundRect({ x: b.x + 0.75, y: b.y + 0.75, w: b.w - 1.5, h: b.h - 1.5 }, this.radius - 0.75, {
      stroke: { color: this.bandEdge, width: 1.1 },
      opacity: opacity * 0.6,
    });
  }

  /** The display's clip shape. */
  get display(): { rect: Rect; radius: number } {
    return { rect: this.screen, radius: this.screenRadius };
  }

  /** Camera cutout and a faint sheen on the glass, over the screen. */
  front(g: Draw, opacity = 1): void {
    if (opacity <= 0) return;
    if (this.bare) {
      g.clip(this.display, (g) =>
        g.rect(this.screen, { fill: this.sheen, opacity: opacity * 0.6 }),
      );
      return;
    }
    const { cx, cy, r } = this.camera;
    g.circle(cx, cy, r, { fill: GLASS, opacity });
    g.circle(cx, cy, r * 0.46, { fill: mixOklab(GLASS, parseHex('#1B2440'), 0.9), opacity });
    g.circle(cx - r * 0.18, cy - r * 0.2, r * 0.13, {
      fill: withAlpha(parseHex('#FFFFFF'), 0.5),
      opacity,
    });
    g.clip(this.display, (g) => g.rect(this.screen, { fill: this.sheen, opacity }));
  }
}

/** A generic phone around a display rect (see `Phone`). */
export function createPhone(options: PhoneOptions): Phone {
  return new Phone(options);
}
