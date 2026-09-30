/**
 * Notification cards and a lock-screen clock (docs/templates/10-ui-motion.md §10.2): a generic
 * notification — app icon, app name, time, title and message — laid out once at its local
 * origin (so a stack can move and scale it freely), and the large time and date of a lock
 * screen. Neither draws its own background: cards sit on frosted glass (`FrostedPanel`), the
 * clock on the wallpaper.
 */

import type { Graphic } from '../assets/types';
import { adjustLightness, type Color, parseHex } from '../core/color';
import type { Rect } from '../core/math';
import type { Draw, Gradient } from '../draw/types';
import type { TextBlock } from '../text/types';
import type { UiKit } from './context';
import { drawIcon, type IconName } from './shape';
import { onFill } from './theme';

export type AppIcon = {
  /** Tile color (the glyph or initials pick white or ink to contrast). */
  color: Color;
  glyph?: IconName;
  /** Letters on the tile when there is no glyph (1–2). */
  initials?: string;
  /** Artwork instead of a glyph (a logo on a light tile). */
  graphic?: Graphic | null;
};

export type NotificationOptions = {
  app: string;
  title: string;
  message: string;
  /** Default "now". */
  time?: string;
  icon: AppIcon;
  /** Card width in UI px (default 360). */
  width?: number;
  /** Message lines before an ellipsis (default 2). */
  lines?: number;
};

const WHITE = parseHex('#FFFFFF');

/** Size of the app icon in UI px. */
const ICON = 38;

/**
 * A notification card's content, laid out at (0, 0) in design units: `w` × `h`, corner
 * `radius`. Draw its glass first (the same size), then `draw` the content on top.
 */
export class Notification {
  readonly w: number;
  readonly h: number;
  readonly radius: number;
  /** The app icon's rect (local). */
  readonly iconRect: Rect;
  private readonly app: TextBlock;
  private readonly time: TextBlock;
  private readonly title: TextBlock;
  private readonly message: TextBlock;
  private readonly x: number;
  private readonly appY: number;
  private readonly titleY: number;
  private readonly messageY: number;
  private readonly right: number;
  private readonly icon: AppIcon;
  private readonly iconFill: Gradient;
  private readonly glyphColor: Color;
  private readonly initials: TextBlock | null;
  private readonly logoRect: Rect;

  constructor(
    private readonly ui: UiKit,
    options: NotificationOptions,
  ) {
    const px = (v: number) => ui.px(v);
    this.w = px(options.width ?? 360);
    const pad = px(15);
    this.x = pad + px(ICON) + px(12);
    this.right = this.w - pad;
    const textW = this.right - this.x;
    this.time = ui.text(options.time?.trim() || 'now', 'caption', { size: 12.5, weight: 480 });
    this.app = ui.text(options.app.trim() || ' ', 'caption', {
      size: 13,
      weight: 600,
      tracking: 0.005,
      maxWidth: Math.max(px(40), textW - this.time.width - px(10)),
    });
    this.title = ui.text(options.title.trim() || ' ', 'body', {
      size: 15.5,
      weight: 640,
      maxWidth: textW,
    });
    this.message = ui.text(options.message.trim() || ' ', 'body', {
      size: 15,
      weight: 430,
      maxWidth: textW,
      maxLines: options.lines ?? 2,
      lineHeight: 1.3,
      balance: false,
    });
    this.appY = px(15);
    this.titleY = this.appY + this.app.capHeight + px(9.5);
    this.messageY = this.titleY + this.title.capHeight + px(8.5);
    this.h = this.messageY + this.message.height + px(15);
    this.radius = px(22);
    const size = px(ICON);
    this.iconRect = { x: pad, y: (this.h - size) / 2, w: size, h: size };
    this.icon = options.icon;
    const r = this.iconRect;
    this.iconFill = {
      kind: 'linear',
      x0: r.x,
      y0: r.y,
      x1: r.x + r.w * 0.6,
      y1: r.y + r.h,
      stops: [
        { offset: 0, color: adjustLightness(options.icon.color, 0.07) },
        { offset: 1, color: adjustLightness(options.icon.color, -0.04) },
      ],
    };
    this.glyphColor = onFill(options.icon.color);
    this.initials =
      !options.icon.glyph && options.icon.initials
        ? ui.text(options.icon.initials, 'label', { size: 15, weight: 700, tracking: 0.01 })
        : null;
    const inset = size * 0.18;
    this.logoRect = { x: r.x + inset, y: r.y + inset, w: size - 2 * inset, h: size - 2 * inset };
  }

  /** Draws the icon and text (the glass goes underneath). */
  draw(g: Draw, opacity = 1): void {
    if (opacity <= 0) return;
    const { theme } = this.ui;
    this.drawIcon(g, opacity);
    g.text(this.app, { fill: theme.muted, x: this.x, y: this.appY, opacity });
    g.text(this.time, {
      fill: theme.muted,
      x: this.right - this.time.width,
      y: this.appY,
      opacity,
    });
    g.text(this.title, { fill: theme.text, x: this.x, y: this.titleY, opacity });
    g.text(this.message, {
      fill: theme.text,
      x: this.x,
      y: this.messageY,
      opacity: opacity * 0.92,
    });
  }

  private drawIcon(g: Draw, opacity: number): void {
    const r = this.iconRect;
    const radius = r.w * 0.26;
    const { graphic, glyph } = this.icon;
    if (graphic?.kind === 'raster') {
      // A picture keeps its colors, on a white tile.
      g.roundRect(r, radius, { fill: WHITE, opacity });
      g.graphic(graphic, this.logoRect, { fit: 'contain', opacity });
      return;
    }
    if (graphic) {
      // A vector logo in one color on the app's tile, like an app icon.
      g.roundRect(r, radius, { fill: this.iconFill, opacity });
      g.graphic(graphic, this.logoRect, { fit: 'contain', tint: this.glyphColor, opacity });
      return;
    }
    g.roundRect(r, radius, { fill: this.iconFill, opacity });
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (glyph) {
      drawIcon(g, glyph, cx, cy, r.w * 0.56, this.glyphColor, { weight: 2.2, opacity });
    } else if (this.initials) {
      const b = this.initials;
      g.text(b, {
        fill: this.glyphColor,
        x: cx - (b.ink.x + b.ink.w / 2),
        y: cy - b.capHeight / 2,
        opacity,
      });
    }
  }
}

export type LockClockOptions = {
  time: string;
  /** A line above the time (e.g. "Wednesday, 14 October"); empty for none. */
  date?: string;
  /** Time size in UI px (default 92). */
  size?: number;
  weight?: number;
  align?: 'center' | 'left';
};

/** The large time of a lock screen with the date above it (on the wallpaper, no card). */
export class LockClock {
  /** Bounds relative to the anchor (x: center or left edge; y: top of the date). */
  readonly bounds: Rect;
  readonly timeBlock: TextBlock;
  readonly dateBlock: TextBlock | null;
  private readonly timeY: number;
  private readonly align: 'center' | 'left';

  constructor(ui: UiKit, options: LockClockOptions) {
    const size = options.size ?? 92;
    this.align = options.align ?? 'center';
    const date = options.date?.trim() ?? '';
    this.dateBlock = date ? ui.text(date, 'title', { size: size * 0.2, weight: 580 }) : null;
    this.timeBlock = ui.text(options.time.trim() || ' ', 'display', {
      size,
      weight: options.weight ?? 560,
      tracking: -0.035,
      features: ['tnum'],
    });
    this.timeY = this.dateBlock ? this.dateBlock.capHeight + ui.px(size * 0.2) : 0;
    const w = Math.max(this.timeBlock.ink.w, this.dateBlock?.ink.w ?? 0);
    this.bounds = {
      x: this.align === 'center' ? -w / 2 : 0,
      y: 0,
      w,
      h: this.timeY + this.timeBlock.capHeight,
    };
  }

  /** Draws the date and time with the anchor at (x, y). */
  draw(
    g: Draw,
    x: number,
    y: number,
    options: { color: Color; opacity?: number; dateOpacity?: number },
  ): void {
    const opacity = options.opacity ?? 1;
    if (opacity <= 0) return;
    const place = (b: TextBlock) =>
      this.align === 'center' ? x - (b.ink.x + b.ink.w / 2) : x - b.ink.x;
    if (this.dateBlock) {
      g.text(this.dateBlock, {
        fill: options.color,
        x: place(this.dateBlock),
        y,
        opacity: opacity * (options.dateOpacity ?? 0.88),
      });
    }
    g.text(this.timeBlock, {
      fill: options.color,
      x: place(this.timeBlock),
      y: y + this.timeY,
      opacity,
    });
  }
}
