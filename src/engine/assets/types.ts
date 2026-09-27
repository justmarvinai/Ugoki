/**
 * Graphics a template can draw from its image/logo controls (docs/06-engine.md §8): vector
 * artwork parsed from SVG (crisp at 4K, maskable by shape) or a decoded raster image.
 */

import type { Color } from '../core/color';
import type { Rect } from '../core/math';
import type { ImageAsset, PathData } from '../draw/types';

/** A color, the drawer's current color (`currentColor`), or nothing. */
export type ShapePaint = Color | 'current' | null;

export type VectorShape = {
  /** In the artwork's own coordinates (its viewBox space), transforms already applied. */
  readonly path: PathData;
  readonly fill: ShapePaint;
  readonly fillRule: 'nonzero' | 'evenodd';
  readonly fillOpacity: number;
  readonly stroke: ShapePaint;
  readonly strokeWidth: number;
  readonly strokeOpacity: number;
  readonly lineCap: CanvasLineCap;
  readonly lineJoin: CanvasLineJoin;
  /** Element and group opacity. */
  readonly opacity: number;
};

export type VectorGraphic = {
  readonly kind: 'vector';
  /** The artwork's frame: its viewBox, or its ink when it has none. */
  readonly box: Rect;
  /** Tight bounds of everything painted — logos are fitted by their ink, not their margins. */
  readonly ink: Rect;
  readonly shapes: readonly VectorShape[];
};

export type RasterGraphic = {
  readonly kind: 'raster';
  readonly image: ImageAsset;
  /** Bounds of the non-transparent pixels, in image pixels (found on import). */
  readonly ink: Rect;
};

export type Graphic = VectorGraphic | RasterGraphic;

/**
 * What an image/logo control stores: a built-in placeholder, or a file the user added — kept
 * only on their device and referenced by the SHA-256 of its bytes.
 */
export type AssetRef = (
  | { readonly kind: 'placeholder'; readonly id: string }
  | { readonly kind: 'user'; readonly hash: string; readonly name?: string }
) & {
  /** Point of the image kept in view when it is cropped (0..1 each; default: the center). */
  readonly focal?: FocalPoint;
};

export type FocalPoint = { readonly x: number; readonly y: number };

export const CENTER: FocalPoint = { x: 0.5, y: 0.5 };

/** The frame a graphic is fitted by. */
export const graphicInk = (graphic: Graphic): Rect => graphic.ink;

/** Width / height of a graphic's ink (1 for empty artwork). */
export function graphicAspect(graphic: Graphic): number {
  const { w, h } = graphic.ink;
  return w > 0 && h > 0 ? w / h : 1;
}
