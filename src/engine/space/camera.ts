/**
 * A perspective camera in CSS terms: the eye sits `perspective` design units in front of the
 * z = 0 plane, looking at the vanishing point (x, y). Points on z = 0 project onto themselves, so
 * an unrotated plane at z = 0 draws exactly where its design-space rect says; points toward the
 * viewer (z > 0) grow, points away shrink. An optional `view` transform moves the whole world
 * first (a camera tilt or orbit).
 */

import type { Transform3D, Vec3 } from './transform';

/** A projected point: screen position (design units), depth in front of the eye, size factor. */
export type Projected = { x: number; y: number; depth: number; scale: number };

/** A 2D affine map in canvas order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine2D = { a: number; b: number; c: number; d: number; e: number; f: number };

export type CameraOptions = {
  /** Distance from the eye to the z = 0 plane, in design units (like CSS `perspective`). */
  perspective: number;
  /** The vanishing point in design units (usually the frame's center). */
  x: number;
  y: number;
  /** World → camera transform applied before projecting (tilting or orbiting the camera). */
  view?: Transform3D;
  /** Points closer to the eye than this (design units) are behind the camera. Default 1% of it. */
  near?: number;
};

export class Camera {
  readonly perspective: number;
  readonly x: number;
  readonly y: number;
  readonly view: Transform3D | null;
  readonly near: number;
  private readonly q: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly dir: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(options: CameraOptions) {
    this.perspective = Math.max(1e-3, options.perspective);
    this.x = options.x;
    this.y = options.y;
    this.view = options.view ?? null;
    this.near = options.near ?? this.perspective * 0.01;
  }

  /** The point in camera space (after the view transform). */
  toView(p: Vec3, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    if (this.view) return this.view.apply(p, out);
    out.x = p.x;
    out.y = p.y;
    out.z = p.z;
    return out;
  }

  /** How far in front of the eye a world point lies (≤ `near`: behind the camera). */
  depthOf(p: Vec3): number {
    const q = this.toView(p, this.q);
    return this.perspective - q.z;
  }

  /** Projects a world point onto the screen. */
  project(p: Vec3, out?: Projected): Projected {
    return this.projectXYZ(p.x, p.y, p.z, out);
  }

  projectXYZ(x: number, y: number, z: number, out: Projected = EMPTY()): Projected {
    const q = this.q;
    q.x = x;
    q.y = y;
    q.z = z;
    if (this.view) this.view.apply(q, q);
    return this.projectView(q, out);
  }

  /** Projects a point already in camera space. */
  projectView(q: Vec3, out: Projected = EMPTY()): Projected {
    const depth = this.perspective - q.z;
    // Behind the eye the formula flips the image: report it, callers skip such points.
    const scale = depth > 1e-9 ? this.perspective / depth : Number.POSITIVE_INFINITY;
    out.x = this.x + (q.x - this.x) * scale;
    out.y = this.y + (q.y - this.y) * scale;
    out.depth = depth;
    out.scale = scale;
    return out;
  }

  /**
   * The affine map that best matches the projection near `origin` of the plane spanned by the
   * world directions `u` and `v` (the projection's derivative there): local (s, t) → screen for
   * the point origin + s·u + t·v. Exact at `origin`; good for small things such as shadows.
   */
  affineAt(origin: Vec3, u: Vec3, v: Vec3, out: Affine2D = IDENTITY_2D()): Affine2D {
    const q = this.toView(origin, { x: 0, y: 0, z: 0 });
    const center = this.projectView(q);
    const s = center.scale;
    const kx = (q.x - this.x) / center.depth;
    const ky = (q.y - this.y) / center.depth;
    const du = this.view ? this.view.applyDirection(u, this.dir) : u;
    out.a = s * (du.x + kx * du.z);
    out.b = s * (du.y + ky * du.z);
    const dv = this.view ? this.view.applyDirection(v, this.dir) : v;
    out.c = s * (dv.x + kx * dv.z);
    out.d = s * (dv.y + ky * dv.z);
    out.e = center.x;
    out.f = center.y;
    return out;
  }
}

const EMPTY = (): Projected => ({ x: 0, y: 0, depth: 0, scale: 0 });
const IDENTITY_2D = (): Affine2D => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

/** Draw-API transform fields of an affine map (`g.group` options). */
export type AffineGroup = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
  skewX: number;
};

const RAD = 180 / Math.PI;

/**
 * Decomposes an affine map into the Draw API's group transform (rotate · skewX · scale, then
 * translate): M = T · R(θ) · K(skewX) · S(sx, sy), from a QR factorization of the linear part.
 * Returns false (and leaves `out` alone) when the map is degenerate (e.g. a plane seen edge-on).
 */
export function affineToGroup(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  out: AffineGroup,
): boolean {
  const sx = Math.hypot(a, b);
  const det = a * d - b * c;
  if (!(sx > 1e-12) || !(Math.abs(det) > 1e-12) || !Number.isFinite(det + e + f)) return false;
  const sy = det / sx;
  out.x = e;
  out.y = f;
  out.scaleX = sx;
  out.scaleY = sy;
  out.rotate = Math.atan2(b, a) * RAD;
  out.skewX = Math.atan((a * c + b * d) / det) * RAD;
  return true;
}
