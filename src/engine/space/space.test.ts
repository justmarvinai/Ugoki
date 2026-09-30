import { describe, expect, it } from 'vitest';
import { affineToGroup, Camera } from './camera';
import { type Plane, planeSubdivision, projectPlane, projectPlanes } from './planes';
import { clipConvex, offsetTriangle, signedArea2 } from './polygon';
import { Transform3D } from './transform';

const close = (a: number, b: number, digits = 9) => expect(a).toBeCloseTo(b, digits);

/** The Draw API's group matrix (canvas-draw.ts `Matrix.compose`, origin 0, skewY 0). */
function compose(g: {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
  skewX: number;
}) {
  const r = (g.rotate * Math.PI) / 180;
  const kx = Math.tan((g.skewX * Math.PI) / 180);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    a: g.scaleX * cos,
    b: g.scaleX * sin,
    c: g.scaleY * (cos * kx - sin),
    d: g.scaleY * (sin * kx + cos),
    e: g.x,
    f: g.y,
  };
}

describe('Transform3D (CSS conventions)', () => {
  it('rotates like CSS: rotateX tips the top away, rotateY the right edge, rotateZ clockwise', () => {
    const top = new Transform3D().rotateX(90).applyXYZ(0, -1, 0);
    close(top.z, -1);
    const right = new Transform3D().rotateY(90).applyXYZ(1, 0, 0);
    close(right.z, -1);
    const turned = new Transform3D().rotateZ(90).applyXYZ(1, 0, 0);
    close(turned.x, 0);
    close(turned.y, 1);
  });

  it('chains in CSS order: the last call applies first', () => {
    // translate(10, 0, 0) rotateZ(90): the point turns first, then moves.
    const p = new Transform3D().translate(10, 0, 0).rotateZ(90).applyXYZ(1, 0, 0);
    close(p.x, 10);
    close(p.y, 1);
    const q = new Transform3D()
      .multiply(new Transform3D().translate(10, 0, 0))
      .multiply(new Transform3D().rotateZ(90))
      .applyXYZ(1, 0, 0);
    close(q.x, p.x);
    close(q.y, p.y);
  });
});

describe('Camera', () => {
  const camera = new Camera({ perspective: 1000, x: 960, y: 540 });

  it('leaves the z = 0 plane where it is and scales depth about the vanishing point', () => {
    const p = camera.projectXYZ(100, 200, 0);
    close(p.x, 100);
    close(p.y, 200);
    close(p.depth, 1000);
    close(p.scale, 1);
    // Halfway to the eye, things are twice as large around the vanishing point.
    const q = camera.projectXYZ(1060, 540, 500);
    close(q.scale, 2);
    close(q.x, 960 + 200);
    close(camera.projectXYZ(1060, 540, -1000).x, 960 + 50);
  });

  it('applies the view transform before projecting', () => {
    const view = new Transform3D().translate(0, 0, -1000);
    const moved = new Camera({ perspective: 1000, x: 960, y: 540, view });
    close(moved.depthOf({ x: 0, y: 0, z: 0 }), 2000);
    close(moved.projectXYZ(1060, 540, 0).x, 960 + 50);
  });

  it('matches the projection’s derivative with its local affine map', () => {
    const origin = { x: 700, y: 900, z: -300 };
    const u = { x: 0.8, y: 0, z: -0.6 };
    const v = { x: 0.6, y: 0, z: 0.8 };
    const m = camera.affineAt(origin, u, v);
    const h = 1e-3;
    const at = (s: number, t: number) =>
      camera.projectXYZ(
        origin.x + s * u.x + t * v.x,
        origin.y + s * u.y + t * v.y,
        origin.z + s * u.z + t * v.z,
      );
    const p0 = at(0, 0);
    const ps = at(h, 0);
    const pt = at(0, h);
    close(m.a, (ps.x - p0.x) / h, 3);
    close(m.b, (ps.y - p0.y) / h, 3);
    close(m.c, (pt.x - p0.x) / h, 3);
    close(m.d, (pt.y - p0.y) / h, 3);
    close(m.e, p0.x);
    close(m.f, p0.y);
  });
});

describe('affineToGroup', () => {
  it('decomposes any non-degenerate affine map into a group transform', () => {
    const maps = [
      [1, 0, 0, 1, 5, 6],
      [0.3, 0.9, -1.2, 0.4, -40, 12],
      [-0.7, 0.2, 0.5, 0.9, 3, 4],
      [2, 0.1, 1.7, -0.3, 0, 0],
    ] as const;
    for (const [a, b, c, d, e, f] of maps) {
      const g = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, skewX: 0 };
      expect(affineToGroup(a, b, c, d, e, f, g)).toBe(true);
      const m = compose(g);
      close(m.a, a);
      close(m.b, b);
      close(m.c, c);
      close(m.d, d);
      close(m.e, e);
      close(m.f, f);
    }
    const g = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, skewX: 0 };
    expect(affineToGroup(1, 2, 2, 4, 0, 0, g)).toBe(false);
  });
});

describe('planes', () => {
  const camera = new Camera({ perspective: 1400, x: 960, y: 540 });
  const card = (transform: Transform3D, back = false): Plane => ({
    rect: { x: -200, y: -250, w: 400, h: 500 },
    transform,
    front: { fill: { r: 1, g: 0, b: 0, a: 1 } },
    ...(back ? { back: { fill: { r: 0, g: 0, b: 1, a: 1 } } } : {}),
  });

  it('knows which side faces the camera and culls faces it has no content for', () => {
    const facing = projectPlane(camera, card(new Transform3D().translate(960, 540, 0)), 0);
    expect(facing?.facing).toBe('front');
    const turned = new Transform3D().translate(960, 540, 0).rotateY(180);
    expect(projectPlane(camera, card(turned), 0)).toBeNull();
    expect(projectPlane(camera, card(turned, true), 0)?.facing).toBe('back');
    // Behind the eye: not drawn.
    expect(projectPlane(camera, card(new Transform3D().translate(960, 540, 1500)), 0)).toBeNull();
  });

  it('sorts far to near (painter’s algorithm)', () => {
    const planes = [0, -900, 300, -300].map((z) => card(new Transform3D().translate(960, 540, z)));
    const order = projectPlanes(camera, planes).map((p) => p.index);
    expect(order).toEqual([1, 3, 0, 2]);
  });

  it('keeps a frontal plane in one piece and cuts a turned one mostly along its depth', () => {
    const frontal = projectPlane(camera, card(new Transform3D().translate(960, 540, 0)), 0);
    expect(frontal && planeSubdivision(frontal.corners, 0.35)).toMatchObject({ u: 1, v: 1 });
    const turned = projectPlane(
      camera,
      card(new Transform3D().translate(960, 540, -200).rotateY(60)),
      0,
    );
    const split = turned ? planeSubdivision(turned.corners, 0.35) : { u: 0, v: 0 };
    // Depth changes along u only: more cuts along u than along v.
    expect(split.u).toBeGreaterThan(2);
    expect(split.u).toBeGreaterThan(split.v);
  });

  it('keeps piecewise-affine texturing within the tolerance of true perspective', () => {
    const tolerance = 0.5;
    for (const [rx, ry, z] of [
      [0, 55, -200],
      [25, -35, 100],
      [-15, 70, -600],
      [40, 20, 250],
    ] as const) {
      const transform = new Transform3D().translate(960, 540, z).rotateX(rx).rotateY(ry);
      const plane = card(transform);
      const projected = projectPlane(camera, plane, 0);
      if (!projected) throw new Error('plane should be visible');
      const { u: nu, v: nv, anti } = planeSubdivision(projected.corners, tolerance);
      const { rect } = plane;
      const exact = (s: number, t: number) =>
        camera.project(transform.applyXYZ(rect.x + s * rect.w, rect.y + t * rect.h, 0));
      let worst = 0;
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const p00 = exact(i / nu, j / nv);
          const p10 = exact((i + 1) / nu, j / nv);
          const p11 = exact((i + 1) / nu, (j + 1) / nv);
          const p01 = exact(i / nu, (j + 1) / nv);
          // Both triangles of the cell, split along the diagonal the renderer uses.
          const triangles = anti
            ? ([
                [p00, p10, p01, [0, 0], [1, 0], [0, 1]],
                [p10, p11, p01, [1, 0], [1, 1], [0, 1]],
              ] as const)
            : ([
                [p00, p10, p11, [0, 0], [1, 0], [1, 1]],
                [p00, p11, p01, [0, 0], [1, 1], [0, 1]],
              ] as const);
          for (let a = 0; a <= 8; a++) {
            for (let b = 0; b <= 8 - a; b++) {
              const w0 = a / 8;
              const w1 = b / 8;
              const w2 = 1 - w0 - w1;
              for (const [q0, q1, q2, s0, s1, s2] of triangles) {
                const s = (i + w0 * s0[0] + w1 * s1[0] + w2 * s2[0]) / nu;
                const t = (j + w0 * s0[1] + w1 * s1[1] + w2 * s2[1]) / nv;
                const truth = exact(s, t);
                const x = w0 * q0.x + w1 * q1.x + w2 * q2.x;
                const y = w0 * q0.y + w1 * q1.y + w2 * q2.y;
                worst = Math.max(worst, Math.hypot(x - truth.x, y - truth.y));
              }
            }
          }
        }
      }
      expect(worst).toBeLessThanOrEqual(tolerance);
    }
  });
});

describe('polygon helpers', () => {
  it('pushes chosen triangle edges outward by their offsets', () => {
    const out: number[] = [];
    // Clockwise on screen (y down): (0,0) → (10,0) → (0,10).
    offsetTriangle(0, 0, 10, 0, 0, 10, 1, 0, 0, 10, out);
    // Only the top edge moved: up by one.
    close(out[1] as number, -1);
    close(out[3] as number, -1);
    close(out[4] as number, 0);
    close(out[5] as number, 10);
    const grown = offsetTriangle(0, 0, 10, 0, 0, 10, 1, 1, 1, 10, out) ?? [];
    expect(Math.abs(signedArea2(grown))).toBeGreaterThan(100);
  });

  it('clips a polygon to a convex polygon of either winding', () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10];
    const reversed = [0, 0, 0, 10, 10, 10, 10, 0];
    const subject = [5, 5, 15, 5, 15, 15, 5, 15];
    for (const clip of [square, reversed]) {
      const clipped = clipConvex(subject, clip);
      close(Math.abs(signedArea2(clipped)) / 2, 25);
    }
    expect(clipConvex([20, 20, 30, 20, 30, 30], square)).toEqual([]);
  });
});
