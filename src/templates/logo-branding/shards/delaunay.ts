/**
 * Delaunay triangulation (Bowyer–Watson) for the few dozen points a shard pattern needs:
 * dependency-free and deterministic (no randomness; ties resolve in insertion order).
 * Callers keep points in general position (no duplicates, hull points not collinear).
 *
 * Engine candidate: a `delaunay(points)` helper next to `pathLength`.
 */

export type Point = { readonly x: number; readonly y: number };

/** Indices of a triangle's corners into the input points, counter-clockwise in y-down space. */
export type Triangle = readonly [number, number, number];

type Circle = { a: number; b: number; c: number; x: number; y: number; r2: number };

export function delaunay(points: readonly Point[]): Triangle[] {
  const n = points.length;
  if (n < 3) return [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  // A super-triangle far outside the points, so it never bends the hull's triangles.
  const size = Math.max(maxX - minX, maxY - minY, 1) * 64;
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  const xs = new Float64Array(n + 3);
  const ys = new Float64Array(n + 3);
  points.forEach((p, i) => {
    xs[i] = p.x;
    ys[i] = p.y;
  });
  xs[n] = mx - size;
  ys[n] = my + size;
  xs[n + 1] = mx + size;
  ys[n + 1] = my + size;
  xs[n + 2] = mx;
  ys[n + 2] = my - size;

  const circle = (a: number, b: number, c: number): Circle => {
    const ax = xs[a] as number;
    const ay = ys[a] as number;
    const bx = (xs[b] as number) - ax;
    const by = (ys[b] as number) - ay;
    const cx = (xs[c] as number) - ax;
    const cy = (ys[c] as number) - ay;
    const d = 2 * (bx * cy - by * cx);
    if (Math.abs(d) < 1e-12) return { a, b, c, x: ax, y: ay, r2: Number.POSITIVE_INFINITY };
    const b2 = bx * bx + by * by;
    const c2 = cx * cx + cy * cy;
    const ux = (cy * b2 - by * c2) / d;
    const uy = (bx * c2 - cx * b2) / d;
    return { a, b, c, x: ax + ux, y: ay + uy, r2: ux * ux + uy * uy };
  };

  let triangles: Circle[] = [circle(n, n + 1, n + 2)];
  const edges = new Map<number, [number, number]>();
  const key = (u: number, v: number) => (u < v ? u * (n + 3) + v : v * (n + 3) + u);

  for (let i = 0; i < n; i++) {
    const px = xs[i] as number;
    const py = ys[i] as number;
    const keep: Circle[] = [];
    edges.clear();
    for (const t of triangles) {
      const dx = px - t.x;
      const dy = py - t.y;
      if (dx * dx + dy * dy < t.r2 * (1 + 1e-12)) {
        // A bad triangle: its edges bound the hole, unless another bad triangle shares them.
        for (const [u, v] of [
          [t.a, t.b],
          [t.b, t.c],
          [t.c, t.a],
        ] as const) {
          const k = key(u, v);
          if (edges.has(k)) edges.delete(k);
          else edges.set(k, [u, v]);
        }
      } else {
        keep.push(t);
      }
    }
    for (const [u, v] of edges.values()) keep.push(circle(u, v, i));
    triangles = keep;
  }

  const out: Triangle[] = [];
  for (const t of triangles) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    const area =
      ((xs[t.b] as number) - (xs[t.a] as number)) * ((ys[t.c] as number) - (ys[t.a] as number)) -
      ((ys[t.b] as number) - (ys[t.a] as number)) * ((xs[t.c] as number) - (xs[t.a] as number));
    if (Math.abs(area) < 1e-9) continue;
    out.push(area > 0 ? [t.a, t.b, t.c] : [t.a, t.c, t.b]);
  }
  return out;
}
