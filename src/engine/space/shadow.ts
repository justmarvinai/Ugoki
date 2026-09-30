/**
 * Soft contact shadows on a floor: a blurred rectangle drawn in the floor's own coordinates (a
 * horizontal falloff through a vertical one — a small track matte, no blur pass) and mapped onto
 * the screen by the camera's local affine map, so the penumbra is foreshortened with the floor as
 * a real one is. The penumbra widens and the shadow pales as the object lifts.
 */

import { type Color, withAlpha } from '../core/color';
import { clamp, smoothstep } from '../core/math';
import type { Draw, Gradient, GradientStop } from '../draw/types';
import { type AffineGroup, affineToGroup, type Camera } from './camera';

export type ContactShadow = {
  /** Center of the footprint on the floor (world x and z). */
  x: number;
  z: number;
  /** Height of the floor (world y; y points down). */
  floor: number;
  /** The footprint's size on the floor (world units) and its turn about the vertical axis. */
  width: number;
  depth: number;
  /** Degrees, like `rotateY`. */
  yaw?: number;
  /** How far the object's lowest point floats above the floor (world units, ≥ 0). */
  height: number;
  color: Color;
  /** Darkness at contact (0..1). */
  opacity: number;
  /** Half-width of the penumbra at contact (world units). */
  blur: number;
  /** Penumbra growth per unit of height (default 0.45). */
  spread?: number;
  /** Height at which the shadow is half as dark (default: the footprint's larger side). */
  fade?: number;
};

const GROUP: AffineGroup = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, skewX: 0 };
/** Gradient samples on each side of a falloff. */
const SAMPLES = 9;

/**
 * Draws a soft shadow under something floating `height` above a floor. The penumbra is
 * `blur + spread·height` wide, and the darkness drops to half at `fade`.
 */
export function drawContactShadow(g: Draw, camera: Camera, shadow: ContactShadow): void {
  const height = Math.max(0, shadow.height);
  const blur = Math.max(1e-3, shadow.blur + (shadow.spread ?? 0.45) * height);
  const halfW = Math.max(0, shadow.width / 2);
  const halfD = Math.max(0, shadow.depth / 2);
  const fade = Math.max(1e-3, shadow.fade ?? Math.max(shadow.width, shadow.depth));
  const opacity = clamp(shadow.opacity, 0, 1) / (1 + height / fade);
  if (opacity < 1 / 512 || (halfW === 0 && halfD === 0)) return;
  const yaw = ((shadow.yaw ?? 0) * Math.PI) / 180;
  // Floor axes: width along the turned x axis, depth along the turned z axis (rotateY order).
  const u = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  const v = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  const origin = { x: shadow.x, y: shadow.floor, z: shadow.z };
  if (!(camera.depthOf(origin) > camera.near)) return;
  const m = camera.affineAt(origin, u, v);
  if (!affineToGroup(m.a, m.b, m.c, m.d, m.e, m.f, GROUP)) return;
  g.group(GROUP, (g) => softRect(g, halfW, halfD, blur, shadow.color, opacity));
}

/**
 * A rectangle (half-sizes hw × hd, centered on 0) blurred by `blur`: a blurred box is separable,
 * so it's the product of two 1D falloffs — a horizontal gradient shown through a vertical one (a
 * track matte). One piece, no seams, and a thin footprint pales on its own (its falloffs never
 * reach full strength).
 */
function softRect(
  g: Draw,
  hw: number,
  hd: number,
  blur: number,
  color: Color,
  opacity: number,
): void {
  const outerX = hw + blur;
  const outerY = hd + blur;
  const box = { x: -outerX, y: -outerY, w: 2 * outerX, h: 2 * outerY };
  const across = falloffGradient(-outerX, 0, outerX, 0, hw, blur, color);
  const down = falloffGradient(0, -outerY, 0, outerY, hd, blur, BLACK);
  g.mask(
    (g) => g.rect(box, { fill: down }),
    (g) => g.rect(box, { fill: across, opacity }),
    { bounds: box },
  );
}

const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 };

/**
 * A linear gradient from (x0, y0) to (x1, y1) whose alpha is a box `half` wide on each side of
 * the middle, blurred by `blur`: G(s + half) − G(s − half), G a smooth step over ±blur.
 */
function falloffGradient(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  half: number,
  blur: number,
  color: Color,
): Gradient {
  const reach = half + blur;
  const stops: GradientStop[] = [];
  const samples = 2 * SAMPLES;
  for (let k = 0; k <= samples; k++) {
    const s = -reach + (2 * reach * k) / samples;
    const alpha = smoothstep(-blur, blur, s + half) - smoothstep(-blur, blur, s - half);
    stops.push({ offset: k / samples, color: withAlpha(color, Math.max(0, alpha)) });
  }
  return { kind: 'linear', x0, y0, x1, y1, stops };
}
