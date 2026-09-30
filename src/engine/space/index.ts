/**
 * Space — 3D planes for showcase templates (docs/06-engine.md "Space"): a CSS-style perspective
 * camera, textured planes drawn perspective-correct on the 2D Draw API (subdivided affine
 * triangles — no WebGL2 needed), back-face culling, depth sorting, per-plane dim and blur by
 * depth, and soft contact shadows that widen and pale with height.
 */

export {
  type Affine2D,
  type AffineGroup,
  affineToGroup,
  Camera,
  type CameraOptions,
  type Projected,
} from './camera';
export {
  type DepthCue,
  depthCueAt,
  drawPlanes,
  drawProjectedPlane,
  type Plane,
  type PlaneFace,
  type PlaneRenderOptions,
  type ProjectedPlane,
  planeSubdivision,
  projectPlane,
  projectPlanes,
} from './planes';
export { clipConvex, convexHull, pointBounds, polygonPath, signedArea2 } from './polygon';
export { type RasterizeOptions, rasterize } from './raster';
export { type ContactShadow, drawContactShadow } from './shadow';
export { Transform3D, transform3d, type Vec3, vec3 } from './transform';
