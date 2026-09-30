/**
 * Notify's lock-screen wallpaper: soft color fields from the palette (Gradient), the user's
 * picture or a placeholder scene (Image), or the plain palette background (Solid). It is drawn
 * twice a frame — once as the background, once blurred behind the notification glass — so it
 * is a handful of gradient fills or one image, prepared in `build`.
 */

import {
  type Color,
  type Draw,
  type FocalPoint,
  type Gradient,
  type Graphic,
  iconColors,
  mixOklab,
  type Palette,
  parseHex,
  type Rect,
  type Rng,
  withAlpha,
} from '@/engine';

export type WallpaperKind = 'gradient' | 'image' | 'solid';

const radial = (cx: number, cy: number, r: number, color: Color, alpha: number): Gradient => ({
  kind: 'radial',
  cx,
  cy,
  r,
  stops: [
    { offset: 0, color: withAlpha(color, alpha) },
    { offset: 0.45, color: withAlpha(color, alpha * 0.55) },
    { offset: 1, color: withAlpha(color, 0) },
  ],
});

const vertical = (y0: number, y1: number, color: Color, a0: number, a1: number): Gradient => ({
  kind: 'linear',
  x0: 0,
  y0,
  x1: 0,
  y1,
  stops: [
    { offset: 0, color: withAlpha(color, a0) },
    { offset: 1, color: withAlpha(color, a1) },
  ],
});

export class Wallpaper {
  private readonly rect: Rect;
  private readonly base: Color;
  private readonly fields: Gradient[] = [];
  private readonly graphic: Graphic | null;
  private readonly focal: FocalPoint;
  private readonly group = { scale: 1, originX: 0, originY: 0 };

  constructor(options: {
    kind: WallpaperKind;
    palette: Palette;
    width: number;
    height: number;
    rng: Rng;
    graphic: Graphic | null;
    focal: FocalPoint;
    /** The UI is dark (a picture gets a dark veil; else a light one). */
    darkUi: boolean;
  }) {
    const { width: w, height: h, palette, rng } = options;
    this.rect = { x: 0, y: 0, w, h };
    this.group.originX = w / 2;
    this.group.originY = h / 2;
    const { bg } = palette.roles;
    this.base = bg;
    this.graphic = options.kind === 'image' ? options.graphic : null;
    this.focal = options.focal;
    const d = Math.max(w, h);
    const jitter = () => rng.range(-0.06, 0.06);
    if (this.graphic) {
      // A veil in the UI's tone: the clock and headline stay readable on any picture.
      const tone = options.darkUi ? parseHex('#05060A') : parseHex('#FFFFFF');
      this.fields.push(
        vertical(0, h, tone, 0.16, 0.16),
        vertical(0, h * 0.4, tone, 0.5, 0),
        vertical(h * 0.62, h, tone, 0, 0.6),
      );
      return;
    }
    if (options.kind === 'gradient') {
      const dark = palette.dark;
      const [a, b, c] = iconColors(palette, 3, { analogous: true }).map((color) =>
        mixOklab(color, bg, dark ? 0.14 : 0.1),
      ) as [Color, Color, Color];
      this.fields.push(
        radial(w * (0.84 + jitter()), h * (0.1 + jitter()), d * 0.78, a, dark ? 0.85 : 0.6),
        radial(w * (0.06 + jitter()), h * (0.56 + jitter()), d * 0.62, b, dark ? 0.62 : 0.5),
        radial(w * (0.7 + jitter()), h * (0.88 + jitter()), d * 0.52, c, dark ? 0.55 : 0.4),
      );
    }
    // Calm bands at the top and bottom, where the clock and headline sit.
    this.fields.push(vertical(0, h * 0.3, bg, 0.3, 0), vertical(h * 0.7, h, bg, 0, 0.45));
  }

  /** Draws the wallpaper over the whole frame, scaled by `scale` around the center. */
  draw(g: Draw, scale: number): void {
    this.group.scale = scale;
    g.group(this.group, (g) => {
      g.rect(this.rect, { fill: this.base });
      if (this.graphic) {
        g.graphic(this.graphic, this.rect, { fit: 'cover', focal: this.focal });
      }
      for (const field of this.fields) g.rect(this.rect, { fill: field });
    });
  }
}
