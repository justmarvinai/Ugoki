/**
 * 3D transforms for the space module, in CSS conventions: design units, x right, y down, z toward
 * the viewer; `rotateX` tips the top away, `rotateY` turns the right edge away, `rotateZ` turns
 * clockwise on screen — so `rotateX(8).rotateY(-14)` means what it means in a CSS transform.
 */

/** A point or direction in 3D (design units; x right, y down, z toward the viewer). */
export type Vec3 = { x: number; y: number; z: number };

const DEG = Math.PI / 180;

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/**
 * An affine 3D transform (a 3 × 4 matrix, row-major: x' = m0·x + m1·y + m2·z + m3, …).
 * Methods append in CSS order and return `this`: `new Transform3D().translate(x, y, z)
 * .rotateX(a).rotateY(b)` turns a point by `b` about y first, then by `a` about x, then moves it.
 */
export class Transform3D {
  readonly m = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);

  /** Back to the identity. */
  reset(): this {
    this.m.set(IDENTITY);
    return this;
  }

  copy(other: Transform3D): this {
    this.m.set(other.m);
    return this;
  }

  clone(): Transform3D {
    return new Transform3D().copy(this);
  }

  /** this = this × other: `other` applies to points first. */
  multiply(other: Transform3D): this {
    return this.append(
      other.m[0] ?? 1,
      other.m[1] ?? 0,
      other.m[2] ?? 0,
      other.m[3] ?? 0,
      other.m[4] ?? 0,
      other.m[5] ?? 1,
      other.m[6] ?? 0,
      other.m[7] ?? 0,
      other.m[8] ?? 0,
      other.m[9] ?? 0,
      other.m[10] ?? 1,
      other.m[11] ?? 0,
    );
  }

  translate(x: number, y: number, z = 0): this {
    return this.append(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z);
  }

  /** Tips the top away from the viewer for positive degrees. */
  rotateX(degrees: number): this {
    if (degrees === 0) return this;
    const c = Math.cos(degrees * DEG);
    const s = Math.sin(degrees * DEG);
    return this.append(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0);
  }

  /** Turns the right edge away from the viewer for positive degrees. */
  rotateY(degrees: number): this {
    if (degrees === 0) return this;
    const c = Math.cos(degrees * DEG);
    const s = Math.sin(degrees * DEG);
    return this.append(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0);
  }

  /** Turns clockwise on screen for positive degrees. */
  rotateZ(degrees: number): this {
    if (degrees === 0) return this;
    const c = Math.cos(degrees * DEG);
    const s = Math.sin(degrees * DEG);
    return this.append(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0);
  }

  scale(sx: number, sy = sx, sz = sx): this {
    return this.append(sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0);
  }

  /** Transforms a point (`out` may be `p`). */
  apply(p: Vec3, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    return this.applyXYZ(p.x, p.y, p.z, out);
  }

  applyXYZ(x: number, y: number, z: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    const m = this.m;
    const nx =
      (m[0] as number) * x + (m[1] as number) * y + (m[2] as number) * z + (m[3] as number);
    const ny =
      (m[4] as number) * x + (m[5] as number) * y + (m[6] as number) * z + (m[7] as number);
    const nz =
      (m[8] as number) * x + (m[9] as number) * y + (m[10] as number) * z + (m[11] as number);
    out.x = nx;
    out.y = ny;
    out.z = nz;
    return out;
  }

  /** Transforms a direction (no translation). */
  applyDirection(d: Vec3, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    const m = this.m;
    const { x, y, z } = d;
    out.x = (m[0] as number) * x + (m[1] as number) * y + (m[2] as number) * z;
    out.y = (m[4] as number) * x + (m[5] as number) * y + (m[6] as number) * z;
    out.z = (m[8] as number) * x + (m[9] as number) * y + (m[10] as number) * z;
    return out;
  }

  /** this = this × [b], with [b] given row by row. */
  private append(
    b0: number,
    b1: number,
    b2: number,
    b3: number,
    b4: number,
    b5: number,
    b6: number,
    b7: number,
    b8: number,
    b9: number,
    b10: number,
    b11: number,
  ): this {
    const m = this.m;
    for (let row = 0; row < 3; row++) {
      const k = row * 4;
      const a0 = m[k] as number;
      const a1 = m[k + 1] as number;
      const a2 = m[k + 2] as number;
      const a3 = m[k + 3] as number;
      m[k] = a0 * b0 + a1 * b4 + a2 * b8;
      m[k + 1] = a0 * b1 + a1 * b5 + a2 * b9;
      m[k + 2] = a0 * b2 + a1 * b6 + a2 * b10;
      m[k + 3] = a0 * b3 + a1 * b7 + a2 * b11 + a3;
    }
    return this;
  }
}

const IDENTITY = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);

/** A fresh identity transform (the start of a CSS-order chain). */
export const transform3d = (): Transform3D => new Transform3D();
