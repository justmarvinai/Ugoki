/** Small, allocation-free math helpers used throughout the engine. */

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse of `lerp`: where `value` sits between `a` and `b` (unclamped). */
export function invLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : (value - a) / (b - a);
}

/** Maps `value` from [inMin, inMax] to [outMin, outMax] (unclamped). */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return lerp(outMin, outMax, invLerp(inMin, inMax, value));
}

/** Clamped progress of `t` through the window [start, start + duration]. */
export function progress(t: number, start: number, duration: number): number {
  if (duration <= 0) return t >= start ? 1 : 0;
  return clamp01((t - start) / duration);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

/** Positive modulo (JavaScript's % keeps the sign of the dividend). */
export function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function fract(value: number): number {
  return value - Math.floor(value);
}

export function approxEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Rounds to the nearest multiple of `step` (e.g. device pixels). */
export function snap(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

export type Vec2 = { x: number; y: number };

export type Rect = { x: number; y: number; w: number; h: number };

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

export function insetRect(r: Rect, dx: number, dy = dx): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w - dx * 2, h: r.h - dy * 2 };
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
