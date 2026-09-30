/**
 * Textured 3D planes on the 2D Draw API — no WebGL2 needed, so they draw the same in every
 * browser and worker. A plane is a rectangle (optionally rounded) in its own local coordinates,
 * placed in the world by a `Transform3D` and seen through a `Camera`.
 *
 * Perspective-correct texturing: the face is cut into a grid of triangles, each drawn with the
 * affine map that is exact at its three corners (a `g.group` transform) inside a clip of the
 * triangle — piecewise-affine texturing. The grid is chosen per frame from how much the plane's
 * depth varies along each edge, so the largest deviation from true perspective stays below
 * `tolerance` output pixels (a frontal card is one piece; a card turned 45° about 20 cells).
 * Interior triangle edges are pushed outward by ¾ px so neighbours overlap instead of leaving
 * anti-aliasing seams; the plane's own edge is exact and anti-aliased once (content is drawn a
 * little beyond it and clipped).
 *
 * Planes are back-face culled (a face without content isn't drawn when it faces away), depth
 * sorted far to near (painter's algorithm — fine for planes that don't intersect), and can be
 * dimmed toward a color and blurred per plane (`g.fx`, bounded to the plane) — depth of field.
 */

import type { FocalPoint, Graphic } from '../assets/types';
import type { Color } from '../core/color';
import { clamp, clamp01, type Rect, unionRect } from '../core/math';
import type { Draw, Fill, PathData } from '../draw/types';
import { type AffineGroup, affineToGroup, type Camera, type Projected } from './camera';
import { clipConvex, offsetTriangle, pointBounds, polygonPath, signedArea2 } from './polygon';
import type { Transform3D, Vec3 } from './transform';

/** What one side of a plane shows, drawn in the plane's local coordinates. */
export type PlaneFace = {
  /** Paint across the whole face, under everything else (a card's color). */
  fill?: Fill;
  /** An image or logo fitted into the face (like `g.graphic`). */
  graphic?: Graphic | null;
  /** `cover` (default) fills the face and crops around `focal`; `contain` fits inside it. */
  fit?: 'cover' | 'contain';
  focal?: FocalPoint;
  /** More content in local coordinates, drawn last (runs once per triangle: keep it light). */
  draw?: (g: Draw) => void;
  /**
   * Back faces: show the content as seen through the plane (mirrored, like a translucent print)
   * instead of reading correctly from behind.
   */
  through?: boolean;
  /** A wash over the content (e.g. the paper of a print seen from behind). */
  veil?: { color: Color; amount: number };
};

export type Plane = {
  /** The face in local coordinates (z = 0); usually centered on the origin. */
  rect: Rect;
  /** Local → world. */
  transform: Transform3D;
  /** Corner radius in local units. */
  radius?: number;
  /** The side facing +z in local coordinates. Culled when it faces away if omitted. */
  front?: PlaneFace | null;
  /** The other side (drawn mirrored, so it reads correctly from behind). Culled if omitted. */
  back?: PlaneFace | null;
  opacity?: number;
  /** Mixes the plane toward `dimColor` (0..1). */
  dim?: number;
  dimColor?: Color;
  /** Gaussian blur (σ in u) — depth of field. */
  blur?: number;
};

export type ProjectedPlane = {
  readonly plane: Plane;
  /** Index of the plane in the list it came from. */
  readonly index: number;
  readonly facing: 'front' | 'back';
  readonly face: PlaneFace;
  /** Distance of the plane's center in front of the eye (larger = farther). */
  readonly depth: number;
  /** Screen corners of the local rect: top-left, top-right, bottom-right, bottom-left. */
  readonly corners: readonly [Projected, Projected, Projected, Projected];
  /** The projected outline (rounded corners included) as flat screen points. */
  readonly outline: readonly number[];
  /** The outline as a closed path. */
  readonly path: PathData;
  /** Screen bounds of the outline. */
  readonly bounds: Rect;
};

export type DepthCue = {
  /** Depths (distance in front of the eye) where the cue starts and where it's full. */
  near: number;
  far: number;
  /** Full dim (0..1) and blur (σ in u) at `far`. */
  dim?: number;
  blur?: number;
  color?: Color;
};

export type PlaneRenderOptions = {
  /**
   * Largest deviation from true perspective, in output pixels (default 1: the texture stays
   * continuous, so a pixel of smooth warp is invisible). Blurred planes allow half their blur.
   */
  tolerance?: number;
  /** Dim and blur planes by depth, on top of their own `dim` and `blur`. */
  depthCue?: DepthCue;
  /** Skip planes whose projected area is smaller than this many square design units. */
  minArea?: number;
  /**
   * Planes that follow each other in drawing order with the same key (and opacity) share one
   * effects layer, blurred by the largest blur among them — e.g. the far side of a ring. Fewer
   * layers, same look for planes at similar depths.
   */
  group?: (plane: ProjectedPlane) => string | number | null | undefined;
};

const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 };
/** Most cells along one side of a plane, and in all. */
const MAX_SPLIT = 24;
const MAX_CELLS = 240;

type Corner = { x: number; y: number; z: number };

/**
 * Projects planes: culls those facing away without a face for that side (and those crossing the
 * camera), and sorts the rest far to near. `pixel` (design units per output pixel) sets how
 * finely rounded corners are traced.
 */
export function projectPlanes(
  camera: Camera,
  planes: readonly (Plane | null | undefined)[],
  pixel = 1,
): ProjectedPlane[] {
  const out: ProjectedPlane[] = [];
  planes.forEach((plane, index) => {
    if (!plane) return;
    const projected = projectPlane(camera, plane, index, pixel);
    if (projected) out.push(projected);
  });
  // Far to near; equal depths keep their order (deterministic).
  out.sort((a, b) => b.depth - a.depth || a.index - b.index);
  return out;
}

/** Projects one plane, or null when it's culled or crosses the camera. */
export function projectPlane(
  camera: Camera,
  plane: Plane,
  index: number,
  pixel = 1,
): ProjectedPlane | null {
  const { rect, transform } = plane;
  if (!(rect.w > 0 && rect.h > 0)) return null;
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.w;
  const y1 = rect.y + rect.h;
  const corners = [
    camera.project(transform.applyXYZ(x0, y0, 0)),
    camera.project(transform.applyXYZ(x1, y0, 0)),
    camera.project(transform.applyXYZ(x1, y1, 0)),
    camera.project(transform.applyXYZ(x0, y1, 0)),
  ] as [Projected, Projected, Projected, Projected];
  for (const corner of corners) if (!(corner.depth > camera.near)) return null;
  const quad = [
    corners[0].x,
    corners[0].y,
    corners[1].x,
    corners[1].y,
    corners[2].x,
    corners[2].y,
    corners[3].x,
    corners[3].y,
  ];
  const area = signedArea2(quad, 4);
  if (!(Math.abs(area) > 1e-6)) return null;
  // The local rect runs clockwise on screen (y down) when its front faces the viewer.
  const facing = area > 0 ? 'front' : 'back';
  const face = facing === 'front' ? plane.front : plane.back;
  if (!face) return null;
  const depth = camera.depthOf(transform.applyXYZ(x0 + rect.w / 2, y0 + rect.h / 2, 0));
  const radius = clamp(plane.radius ?? 0, 0, Math.min(rect.w, rect.h) / 2);
  const outline = radius > 0 ? roundedOutline(camera, plane, radius, corners, pixel) : quad;
  return {
    plane,
    index,
    facing,
    face,
    depth,
    corners,
    outline,
    path: polygonPath(outline),
    bounds: pointBounds(outline),
  };
}

/** The rounded rect traced in local coordinates (corners flattened finely enough), projected. */
function roundedOutline(
  camera: Camera,
  plane: Plane,
  radius: number,
  corners: readonly Projected[],
  pixel: number,
): number[] {
  const { rect, transform } = plane;
  // Segments per quarter so the chord error stays below ~0.2 px.
  const screenRadius = (radius * localScale(corners, rect, Math.max)) / Math.max(pixel, 1e-6);
  const steps = clamp(Math.ceil(1.25 * Math.sqrt(Math.max(0, screenRadius))), 2, 24);
  const points: number[] = [];
  const p: Vec3 = { x: 0, y: 0, z: 0 };
  const s: Projected = { x: 0, y: 0, depth: 0, scale: 0 };
  const centers = [
    [rect.x + rect.w - radius, rect.y + radius, -90],
    [rect.x + rect.w - radius, rect.y + rect.h - radius, 0],
    [rect.x + radius, rect.y + rect.h - radius, 90],
    [rect.x + radius, rect.y + radius, 180],
  ] as const;
  for (const [cx, cy, start] of centers) {
    for (let k = 0; k <= steps; k++) {
      const angle = ((start + (90 * k) / steps) * Math.PI) / 180;
      transform.applyXYZ(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), 0, p);
      camera.project(p, s);
      points.push(s.x, s.y);
    }
  }
  return points;
}

/**
 * Screen length of one local unit along the plane's edges: the largest (`Math.max`) or smallest
 * (`Math.min`) of its four edges.
 */
function localScale(
  corners: readonly Projected[],
  rect: Rect,
  pick: (...values: number[]) => number,
): number {
  const [p00, p10, p11, p01] = corners as [Projected, Projected, Projected, Projected];
  const along = (a: Projected, b: Projected, length: number) =>
    Math.hypot(a.x - b.x, a.y - b.y) / length;
  return pick(
    along(p00, p10, rect.w),
    along(p01, p11, rect.w),
    along(p00, p01, rect.h),
    along(p10, p11, rect.h),
  );
}

/**
 * Projects, culls, sorts and draws planes. Returns what was drawn (far to near), so templates
 * can place captions or register editor regions on the planes' screen bounds.
 */
export function drawPlanes(
  g: Draw,
  camera: Camera,
  planes: readonly (Plane | null | undefined)[],
  options: PlaneRenderOptions = {},
): ProjectedPlane[] {
  const minArea = options.minArea ?? 0;
  const drawn = projectPlanes(camera, planes, g.pixel).filter(
    (plane) => !(minArea > 0 && plane.bounds.w * plane.bounds.h < minArea),
  );
  const group = options.group;
  for (let i = 0; i < drawn.length; ) {
    const first = drawn[i] as ProjectedPlane;
    const key = group?.(first);
    let end = i + 1;
    if (key !== null && key !== undefined) {
      const opacity = first.plane.opacity ?? 1;
      while (end < drawn.length) {
        const next = drawn[end] as ProjectedPlane;
        if (group?.(next) !== key || (next.plane.opacity ?? 1) !== opacity) break;
        end++;
      }
    }
    if (end - i === 1) drawProjectedPlane(g, camera, first, options);
    else drawLayered(g, camera, drawn.slice(i, end), options);
    i = end;
  }
  return drawn;
}

/** Draws planes of equal opacity on one layer, blurred by the largest of their blurs. */
function drawLayered(
  g: Draw,
  camera: Camera,
  members: readonly ProjectedPlane[],
  options: PlaneRenderOptions,
): void {
  const opacity = clamp01((members[0] as ProjectedPlane).plane.opacity ?? 1);
  if (opacity <= 1 / 512) return;
  let blur = 0;
  let bounds = (members[0] as ProjectedPlane).bounds;
  const cues = members.map((plane) => depthCueAt(plane, options.depthCue));
  members.forEach((plane, k) => {
    blur = Math.max(blur, (cues[k] as { blur: number }).blur);
    bounds = unionRect(bounds, plane.bounds);
  });
  const tolerance = planeTolerance(g, options, blur);
  const body = (g: Draw) => {
    members.forEach((plane, k) => {
      const cue = cues[k] as { dim: number; color: Color };
      paintFace(g, camera, plane, tolerance);
      if (cue.dim > 1 / 512) g.path(plane.path, { fill: cue.color, opacity: cue.dim });
    });
  };
  if (blur > 0.02) g.fx({ blur, opacity, bounds }, body);
  else if (opacity < 0.998) g.layer({ opacity, bounds }, body);
  else body(g);
}

/** The dim and blur a plane gets at its depth (its own values plus the depth cue). */
export function depthCueAt(
  plane: ProjectedPlane,
  cue: DepthCue | undefined,
): { dim: number; blur: number; color: Color } {
  let dim = plane.plane.dim ?? 0;
  let blur = plane.plane.blur ?? 0;
  const color = plane.plane.dimColor ?? cue?.color ?? BLACK;
  if (cue && cue.far !== cue.near) {
    const k = clamp01((plane.depth - cue.near) / (cue.far - cue.near));
    dim = 1 - (1 - dim) * (1 - k * (cue.dim ?? 0));
    blur += k * (cue.blur ?? 0);
  }
  return { dim: clamp01(dim), blur: Math.max(0, blur), color };
}

/** Draws one projected plane (see `projectPlanes`). */
export function drawProjectedPlane(
  g: Draw,
  camera: Camera,
  plane: ProjectedPlane,
  options: PlaneRenderOptions = {},
): void {
  const opacity = clamp01(plane.plane.opacity ?? 1);
  if (opacity <= 1 / 512) return;
  const { dim, blur, color } = depthCueAt(plane, options.depthCue);
  const tolerance = planeTolerance(g, options, blur);
  const body = (g: Draw) => {
    paintFace(g, camera, plane, tolerance);
    if (dim > 1 / 512) g.path(plane.path, { fill: color, opacity: dim });
  };
  if (blur > 0.02) g.fx({ blur, opacity, bounds: plane.bounds }, body);
  else if (opacity < 0.998) g.layer({ opacity, bounds: plane.bounds }, body);
  else body(g);
}

const isGradient = (fill: Fill): boolean => 'kind' in fill;

/**
 * Allowed deviation from true perspective (design units): the option in output pixels, or half
 * the plane's blur where that's larger — a blurred plane hides smaller errors.
 */
function planeTolerance(g: Draw, options: PlaneRenderOptions, blur: number): number {
  return Math.max((options.tolerance ?? 1) * g.pixel, 0.5 * blur * g.frame.u);
}

/**
 * How to cut a plane into triangles so the piecewise-affine texture stays within `tolerance`
 * (design units) of true perspective: cells along u and v, and which diagonal splits each cell.
 *
 * Mapping a segment linearly instead of projectively is off by |P0 − P1| · |w0 − w1| /
 * (2 (w0 + w1)) at its middle (w = depth), and depth is affine across a plane — so every edge of
 * a cell (its two sides and its diagonal) has a known error. The diagonal matters: on a tall
 * card turned about its vertical axis it crosses the whole change in depth, so its error only
 * falls with the product of the cuts. The cheapest grid that keeps all three below the
 * tolerance wins; the diagonal is the one along which depth changes less.
 */
export function planeSubdivision(
  corners: readonly Projected[],
  tolerance: number,
): { u: number; v: number; anti: boolean } {
  const [p00, p10, p11, p01] = corners as [Projected, Projected, Projected, Projected];
  const length = (a: Projected, b: Projected) => Math.hypot(a.x - b.x, a.y - b.y);
  // Depth change across the whole plane along u and along v.
  const gu = (p10.depth - p00.depth + p11.depth - p01.depth) / 2;
  const gv = (p01.depth - p00.depth + p11.depth - p10.depth) / 2;
  const near = Math.max(1e-9, Math.min(p00.depth, p10.depth, p11.depth, p01.depth));
  const farthest = Math.max(p00.depth, p10.depth, p11.depth, p01.depth);
  // Cells nearest the eye are the largest on screen: size edges for them.
  const grow = farthest / near;
  const su = Math.max(length(p00, p10), length(p01, p11)) * grow;
  const sv = Math.max(length(p00, p01), length(p10, p11)) * grow;
  // The anti-diagonal (10 → 01) changes depth by gv − gu, the main one (00 → 11) by gu + gv.
  const anti = gu * gv > 0;
  const k = 1 / (4 * near);
  const target = Math.max(1e-6, tolerance);
  const error = (nu: number, nv: number) => {
    const eu = (su / nu) * (Math.abs(gu) / nu) * k;
    const ev = (sv / nv) * (Math.abs(gv) / nv) * k;
    const diagonal = Math.abs(gv / nv + (anti ? -gu : gu) / nu);
    const ed = (su / nu + sv / nv) * diagonal * k;
    return Math.max(eu, ev, ed);
  };
  let best = { u: MAX_SPLIT, v: MAX_SPLIT, cells: Number.POSITIVE_INFINITY, error: Infinity };
  for (let nu = 1; nu <= MAX_SPLIT; nu++) {
    for (let nv = 1; nv <= MAX_SPLIT && nu * nv <= MAX_CELLS; nv++) {
      const e = error(nu, nv);
      const cells = nu * nv;
      if (e <= target) {
        if (cells < best.cells || (cells === best.cells && e < best.error)) {
          best = { u: nu, v: nv, cells, error: e };
        }
        break;
      }
      // Nothing meets the tolerance within the budget: the least error wins.
      if (best.cells === Number.POSITIVE_INFINITY && e < best.error) {
        best = { u: nu, v: nv, cells: Number.POSITIVE_INFINITY, error: e };
      }
    }
  }
  return { u: best.u, v: best.v, anti };
}

/** Reused transform for the per-triangle groups (read synchronously by `g.group`). */
const GROUP: AffineGroup = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, skewX: 0 };
const TRIANGLE: number[] = [0, 0, 0, 0, 0, 0];

function paintFace(g: Draw, camera: Camera, plane: ProjectedPlane, tolerance: number): void {
  const { face, facing } = plane;
  const { rect, transform } = plane.plane;
  // A flat color needs no texturing: the projected outline is exact.
  if (!face.graphic && !face.draw) {
    if (!face.fill) return;
    if (!isGradient(face.fill)) {
      g.path(plane.path, { fill: face.fill });
      return;
    }
  }
  // Texture coordinates: a back is mirrored so it reads correctly from behind, unless it shows
  // the front seen through the plane.
  const back = facing === 'back' && !face.through;
  const [p00, p10, p11, p01] = plane.corners;
  // Content is drawn 1.5 output pixels beyond the face (in local units where the plane is most
  // compressed), so the clip alone makes the plane's anti-aliased edge.
  const minScale = localScale(plane.corners, rect, Math.min);
  const margin = Math.min(
    (1.5 * g.pixel) / Math.max(minScale, 1e-6),
    0.05 * Math.min(rect.w, rect.h),
  );
  const content = faceContent(face, rect, margin);
  const bleed = 0.75 * g.pixel;
  const { u: nu, v: nv, anti } = planeSubdivision(plane.corners, tolerance);

  const mirror = rect.x * 2 + rect.w;
  const tu = (u: number) => (back ? mirror - u : u);

  if (nu === 1 && nv === 1) {
    // Close enough to affine: one map for the whole face (least squares over the corners).
    const cx = (p00.x + p10.x + p11.x + p01.x) / 4;
    const cy = (p00.y + p10.y + p11.y + p01.y) / 4;
    const ux = (p10.x - p00.x + p11.x - p01.x) / 2 / rect.w;
    const uy = (p10.y - p00.y + p11.y - p01.y) / 2 / rect.w;
    const vx = (p01.x - p00.x + p11.x - p10.x) / 2 / rect.h;
    const vy = (p01.y - p00.y + p11.y - p10.y) / 2 / rect.h;
    // Texture u runs the other way on the back.
    const a = back ? -ux : ux;
    const b = back ? -uy : uy;
    const mx = tu(rect.x + rect.w / 2);
    const my = rect.y + rect.h / 2;
    const e = cx - a * mx - vx * my;
    const f = cy - b * mx - vy * my;
    if (!affineToGroup(a, b, vx, vy, e, f, GROUP)) return;
    g.clip({ path: plane.path }, (g) => g.group(GROUP, content));
    return;
  }

  // Grid points: world positions are affine in (u, v); project each.
  const w00 = transform.applyXYZ(rect.x, rect.y, 0);
  const w10 = transform.applyXYZ(rect.x + rect.w, rect.y, 0);
  const w01 = transform.applyXYZ(rect.x, rect.y + rect.h, 0);
  const cols = nu + 1;
  const rows = nv + 1;
  const sx = new Float64Array(cols * rows);
  const sy = new Float64Array(cols * rows);
  const point: Corner = { x: 0, y: 0, z: 0 };
  const screen: Projected = { x: 0, y: 0, depth: 0, scale: 0 };
  for (let j = 0; j < rows; j++) {
    const fv = j / nv;
    for (let i = 0; i < cols; i++) {
      const fu = i / nu;
      point.x = w00.x + (w10.x - w00.x) * fu + (w01.x - w00.x) * fv;
      point.y = w00.y + (w10.y - w00.y) * fu + (w01.y - w00.y) * fv;
      point.z = w00.z + (w10.z - w00.z) * fu + (w01.z - w00.z) * fv;
      camera.project(point, screen);
      sx[j * cols + i] = screen.x;
      sy[j * cols + i] = screen.y;
    }
  }

  const radius = clamp(plane.plane.radius ?? 0, 0, Math.min(rect.w, rect.h) / 2);
  const cellW = rect.w / nu;
  const cellH = rect.h / nv;
  const limit = 4 * bleed;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k00 = j * cols + i;
      const k10 = k00 + 1;
      const k01 = k00 + cols;
      const k11 = k01 + 1;
      const u0 = rect.x + i * cellW;
      const v0 = rect.y + j * cellH;
      // Cells reaching into a rounded corner are clipped to the outline as well.
      const cornered = radius > 0 && touchesCorner(rect, radius, u0, v0, cellW, cellH);
      const top = j === 0 && !cornered ? 0 : bleed;
      const right = i === nu - 1 && !cornered ? 0 : bleed;
      const bottom = j === nv - 1 && !cornered ? 0 : bleed;
      const left = i === 0 && !cornered ? 0 : bleed;
      const x00 = sx[k00] as number;
      const y00 = sy[k00] as number;
      const x10 = sx[k10] as number;
      const y10 = sy[k10] as number;
      const x11 = sx[k11] as number;
      const y11 = sy[k11] as number;
      const x01 = sx[k01] as number;
      const y01 = sy[k01] as number;
      const ua = tu(u0);
      const ub = tu(u0 + cellW);
      const v1 = v0 + cellH;
      // Two triangles per cell, split along the diagonal (always interior, so it bleeds).
      if (anti) {
        // (00, 10, 01) and (10, 11, 01).
        drawTriangle(
          g,
          content,
          plane.outline,
          cornered,
          x00,
          y00,
          x10,
          y10,
          x01,
          y01,
          top,
          bleed,
          left,
          limit,
          ua,
          v0,
          ub,
          v0,
          ua,
          v1,
        );
        drawTriangle(
          g,
          content,
          plane.outline,
          cornered,
          x10,
          y10,
          x11,
          y11,
          x01,
          y01,
          right,
          bottom,
          bleed,
          limit,
          ub,
          v0,
          ub,
          v1,
          ua,
          v1,
        );
      } else {
        // (00, 10, 11) and (00, 11, 01).
        drawTriangle(
          g,
          content,
          plane.outline,
          cornered,
          x00,
          y00,
          x10,
          y10,
          x11,
          y11,
          top,
          right,
          bleed,
          limit,
          ua,
          v0,
          ub,
          v0,
          ub,
          v1,
        );
        drawTriangle(
          g,
          content,
          plane.outline,
          cornered,
          x00,
          y00,
          x11,
          y11,
          x01,
          y01,
          bleed,
          bottom,
          left,
          limit,
          ua,
          v0,
          ub,
          v1,
          ua,
          v1,
        );
      }
    }
  }
}

/** Whether a cell reaches outside the straight parts of a rounded rect (into a corner). */
function touchesCorner(
  rect: Rect,
  radius: number,
  u0: number,
  v0: number,
  w: number,
  h: number,
): boolean {
  const nearLeft = u0 < rect.x + radius;
  const nearRight = u0 + w > rect.x + rect.w - radius;
  const nearTop = v0 < rect.y + radius;
  const nearBottom = v0 + h > rect.y + rect.h - radius;
  return (nearLeft || nearRight) && (nearTop || nearBottom);
}

/**
 * One triangle of a face: screen corners (ax, ay) (bx, by) (cx, cy) with texture coordinates
 * (ua, va) (ub, vb) (uc, vc); its edges a→b, b→c, c→a pushed outward by o0, o1, o2.
 */
function drawTriangle(
  g: Draw,
  content: (g: Draw) => void,
  outline: readonly number[],
  clipToOutline: boolean,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  o0: number,
  o1: number,
  o2: number,
  limit: number,
  ua: number,
  va: number,
  ub: number,
  vb: number,
  uc: number,
  vc: number,
): void {
  // The affine map exact at the three corners: texture (u, v) → screen.
  const du1 = ub - ua;
  const dv1 = vb - va;
  const du2 = uc - ua;
  const dv2 = vc - va;
  const det = du1 * dv2 - du2 * dv1;
  if (!(Math.abs(det) > 1e-12)) return;
  const a = ((bx - ax) * dv2 - (cx - ax) * dv1) / det;
  const b = ((by - ay) * dv2 - (cy - ay) * dv1) / det;
  const c = ((cx - ax) * du1 - (bx - ax) * du2) / det;
  const d = ((cy - ay) * du1 - (by - ay) * du2) / det;
  const e = ax - a * ua - c * va;
  const f = ay - b * ua - d * va;
  if (!affineToGroup(a, b, c, d, e, f, GROUP)) return;
  const grown = offsetTriangle(ax, ay, bx, by, cx, cy, o0, o1, o2, limit, TRIANGLE);
  if (!grown) return;
  const polygon = clipToOutline ? clipConvex(grown, outline) : grown;
  if (polygon.length < 6) return;
  g.clip({ path: polygonPath(polygon) }, (g) => g.group(GROUP, content));
}

/**
 * Draws a face's content in texture coordinates (the local rect as seen from its own side),
 * `margin` beyond the rect where it covers the face.
 */
function faceContent(face: PlaneFace, rect: Rect, margin: number): (g: Draw) => void {
  const grown: Rect = {
    x: rect.x - margin,
    y: rect.y - margin,
    w: rect.w + 2 * margin,
    h: rect.h + 2 * margin,
  };
  const { graphic, fill, draw } = face;
  const cover = (face.fit ?? 'cover') === 'cover';
  const focus = face.focal ?? CENTER;
  let raster: { image: Graphic & { kind: 'raster' }; dest: Rect } | null = null;
  if (graphic && graphic.kind === 'raster' && cover) {
    // Cover by the artwork's ink, like `g.graphic`, but place the whole image and let the
    // triangle clips crop it: no clip of its own per triangle.
    const box = graphic.ink.w > 0 && graphic.ink.h > 0 ? graphic.ink : fullBox(graphic);
    const k = Math.max(grown.w / box.w, grown.h / box.h);
    const x = grown.x + (grown.w - box.w * k) * focus.x - box.x * k;
    const y = grown.y + (grown.h - box.h * k) * focus.y - box.y * k;
    raster = {
      image: graphic,
      dest: { x, y, w: graphic.image.width * k, h: graphic.image.height * k },
    };
  }
  const veil = face.veil && face.veil.amount > 1 / 512 ? face.veil : null;
  return (g: Draw) => {
    if (fill) g.rect(grown, { fill });
    if (raster) g.image(raster.image.image, raster.dest, { fit: 'contain' });
    else if (graphic) {
      g.graphic(graphic, cover ? grown : rect, { fit: cover ? 'cover' : 'contain', focal: focus });
    }
    draw?.(g);
    if (veil) g.rect(grown, { fill: veil.color, opacity: Math.min(1, veil.amount) });
  };
}

const CENTER: FocalPoint = { x: 0.5, y: 0.5 };

const fullBox = (graphic: Graphic & { kind: 'raster' }): Rect => ({
  x: 0,
  y: 0,
  w: graphic.image.width,
  h: graphic.image.height,
});
