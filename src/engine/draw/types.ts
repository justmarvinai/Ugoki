/** Draw API types (docs/06-engine.md §6). Coordinates are design units (1080p px), y down. */

import type { Graphic } from '../assets/types';
import type { Color } from '../core/color';
import type { Rect } from '../core/math';
import type { FrameSpec } from '../template/formats';
import type { Glyph, TextBlock, TextLine } from '../text/types';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'lighter';

export type GradientStop = { offset: number; color: Color };

export type Gradient =
  | {
      kind: 'linear';
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      stops: readonly GradientStop[];
    }
  | {
      kind: 'radial';
      cx: number;
      cy: number;
      r: number;
      /** Inner circle (defaults to the center, radius 0). */
      fx?: number;
      fy?: number;
      fr?: number;
      stops: readonly GradientStop[];
    };

export type Fill = Color | Gradient;

export type Stroke = {
  color: Color;
  width: number;
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
  dash?: readonly number[];
  /** Draw only the [start, end] fraction of the path length (trim path, 0..1). */
  trim?: readonly [number, number];
};

export type Paint = { fill?: Fill; stroke?: Stroke; opacity?: number; fillRule?: CanvasFillRule };

export type Transform = {
  x?: number;
  y?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  /** Degrees. */
  rotate?: number;
  /** Degrees. */
  skewX?: number;
  /** Degrees. */
  skewY?: number;
  /** Pivot for scale/rotate/skew in local coordinates. */
  originX?: number;
  originY?: number;
};

export type GroupOptions = Transform & { opacity?: number; blend?: BlendMode };

/** Per-glyph animation state; returning null skips the glyph. */
export type GlyphTransform = {
  dx?: number;
  dy?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
  skewX?: number;
  opacity?: number;
  /** Pivot relative to the glyph origin (default: horizontal center of the advance, baseline). */
  originX?: number;
  originY?: number;
  color?: Fill;
};

export type TextDrawOptions = {
  fill?: Fill;
  outline?: Stroke;
  /** Offset of the block/line origin. */
  x?: number;
  y?: number;
  opacity?: number;
  /** Per-glyph animation. Glyphs are visited in reading order. */
  glyph?: (glyph: Glyph, line: TextLine) => GlyphTransform | null;
};

/** Path commands in design units (SVG-like). */
export type PathCommand =
  | readonly ['M', number, number]
  | readonly ['L', number, number]
  | readonly ['Q', number, number, number, number]
  | readonly ['C', number, number, number, number, number, number]
  | readonly ['Z'];

export type PathData = readonly PathCommand[];

export type ClipShape = Rect | { rect: Rect; radius: number } | { path: PathData };

/** A decoded image (ImageBitmap, OffscreenCanvas, VideoFrame…) with its pixel size. */
export type ImageAsset = {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
};

export type ImageOptions = {
  /** `cover` fills `dest` and crops (default); `contain` fits inside it. */
  fit?: 'cover' | 'contain';
  /** Point of the image kept in view when cropping (0..1, default center). */
  focal?: { x: number; y: number };
  radius?: number;
  opacity?: number;
};

/** How a logo or image from a control is drawn (`g.graphic`). */
export type GraphicOptions = {
  /** `contain` (default) fits the whole artwork inside `dest`; `cover` fills it and crops. */
  fit?: 'contain' | 'cover';
  /** Point kept in view when cropping, and alignment inside `dest` for `contain` (0..1). */
  focal?: { x: number; y: number };
  /** Fit by the artwork's ink (default — logos with margins still fill `dest`) or its box. */
  by?: 'ink' | 'box';
  /** Paints the whole artwork in one color (logo color modes: mono, accent). */
  tint?: Color | null;
  /** Color of `currentColor` parts of untinted vector artwork (default black). */
  current?: Color;
  opacity?: number;
};

/**
 * An isolated group: drawn on its own layer, then composited as one image. `bounds` (design
 * units, in the current coordinate space) says where the content lies: the layer — and any
 * effect on it — then only covers that part of the frame (plus the effects' reach), which makes
 * effects on small elements cheap. Content outside `bounds` is cut off.
 */
export type LayerOptions = { opacity?: number; blend?: BlendMode; bounds?: Rect };

/** Track matte: `content` shows where `matte` is opaque (alpha) or bright (luma). */
export type MaskOptions = { mode?: 'alpha' | 'luma'; invert?: boolean; bounds?: Rect };

/**
 * Color adjustment of a layer (grading), CSS-filter-like factors: 1 leaves a channel unchanged
 * (the default), values are clamped to 0 … 2. Applied in this order, to straight
 * (unpremultiplied) color — alpha is never touched, so transparent pixels stay transparent and
 * edges don't darken.
 */
export type ColorAdjust = {
  /** Multiplies the color: 0 = black, 1 = unchanged, 1.2 = 20% brighter (highlights clip). */
  brightness?: number;
  /** Slope around mid grey: 0 = flat grey, 1 = unchanged, 2 = twice the contrast. */
  contrast?: number;
  /** Around each pixel's luma: 0 = greyscale, 1 = unchanged, 2 = twice the saturation. */
  saturation?: number;
  /**
   * Colorizes: each pixel's luma mapped onto black → `color` → white (so lightness is kept),
   * mixed in by `amount` (0 … 1; 1 = monochrome in the tint's hue, 0.1–0.3 = a color cast).
   */
  tint?: { color: Color; amount: number };
};

/** Layer effects (docs/06-engine.md §9). Distances are in `u` (1% of the short side). */
export type FxOptions = LayerOptions & {
  /** Gaussian blur (σ, in u). */
  blur?: number;
  /** Adds a glow of the layer's bright parts: radius (σ, in u), intensity, threshold (0..1). */
  bloom?: { radius: number; intensity: number; threshold?: number };
  /** Soft drop shadow for legibility on footage: blur (σ, in u), offset (in u). */
  shadow?: { color: Color; blur: number; opacity?: number; x?: number; y?: number };
  /** Color adjustment, applied after the blur (bloom still glows from the unadjusted layer). */
  adjust?: ColorAdjust;
};

export type EditableKind = 'movable' | 'editable';

export type EditableRegion = {
  id: string;
  kind: EditableKind;
  /** Control key focused by clicking the region (editable) or the movable group id. */
  target: string;
  /** Axis-aligned bounds in frame (design) coordinates. */
  bounds: Rect;
};

export type LayoutOffset = { x: number; y: number; scale: number };

export interface Draw {
  readonly frame: FrameSpec;
  /** Size of one output pixel in design units (for hairlines and pixel snapping). */
  readonly pixel: number;
  /** Fills the whole frame (skipped when the background is transparent and `background` is true). */
  fill(fill: Fill, options?: { background?: boolean }): void;
  group(options: GroupOptions, draw: (g: Draw) => void): void;
  rect(r: Rect, paint: Paint): void;
  roundRect(r: Rect, radius: number, paint: Paint): void;
  circle(cx: number, cy: number, radius: number, paint: Paint): void;
  line(x1: number, y1: number, x2: number, y2: number, stroke: Stroke): void;
  path(path: PathData, paint: Paint): void;
  text(text: TextBlock | TextLine, options?: TextDrawOptions): void;
  image(asset: ImageAsset, dest: Rect, options?: ImageOptions): void;
  /** Draws a logo/image from a control (vector or raster), fitted into `dest`. */
  graphic(graphic: Graphic, dest: Rect, options?: GraphicOptions): void;
  clip(shape: ClipShape, draw: (g: Draw) => void): void;
  /** Draws `draw` on an isolated layer (group opacity and blend apply to the result). */
  layer(options: LayerOptions, draw: (g: Draw) => void): void;
  /** Shows `content` only where `matte` is painted (a track matte). */
  mask(matte: (g: Draw) => void, content: (g: Draw) => void, options?: MaskOptions): void;
  /** Draws `draw` on a layer and applies effects (blur, bloom, shadow) before compositing. */
  fx(options: FxOptions, draw: (g: Draw) => void): void;
  /** A user-draggable group: applies the stored layout offset and registers it for the editor. */
  movable(id: string, bounds: Rect, draw: (g: Draw) => void): void;
  /** Registers a clickable region that focuses `controlKey` in the inspector. */
  editable(controlKey: string, bounds: Rect): void;
}
