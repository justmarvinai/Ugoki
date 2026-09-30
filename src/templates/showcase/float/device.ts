/**
 * Generic 3D devices for Float, drawn with the engine's space module: each body is a slab (a
 * rounded rectangle with thickness) whose metal band is shaded per facet by a key light, with a
 * glass front and a textured display plane. Never a real product's outline: uniform bezels, a
 * centered punch-hole camera, no notches or logos.
 */

import {
  type Camera,
  type Color,
  convexHull,
  type Draw,
  mixOklab,
  type PathData,
  type Projected,
  parseHex,
  polygonPath,
  type Rect,
  type Transform3D,
  type Vec3,
  withAlpha,
} from '@/engine';

export type DeviceKind = 'phone' | 'tablet' | 'laptop' | 'browser';
export type FinishKind = 'graphite' | 'silver' | 'white';

/** A slab: a rounded rect `w × h` (radius `r`) centered on the origin, `depth` thick along z. */
export type SlabShape = { w: number; h: number; r: number; depth: number };

export type DeviceModel = {
  kind: DeviceKind;
  /** The body (for a laptop: the lid). */
  body: SlabShape;
  /** The display on the body's front, in body coordinates, with its corner radius. */
  screen: Rect;
  screenRadius: number;
  /** Laptop: the keyboard deck, hinged at the lid's bottom edge. */
  deck: SlabShape | null;
  /** How far the lid leans back from upright (degrees). */
  lidLean: number;
  /** Size of the display content in UI px (points), for laying out screens. */
  ui: { w: number; h: number };
  /** Browser windows carry a title bar above the page (UI px). */
  toolbar: number;
};

/** Models in their own units (UI px for the display); templates scale them to the layout. */
export function deviceModel(kind: DeviceKind): DeviceModel {
  switch (kind) {
    case 'phone': {
      // A 19.5 : 9 display with an even 15.5 px bezel and band.
      const ui = { w: 390, h: 844 };
      const bezel = 15.5;
      const body = { w: ui.w + 2 * bezel, h: ui.h + 2 * bezel, r: 70, depth: 36 };
      return {
        kind,
        body,
        screen: { x: -ui.w / 2, y: -ui.h / 2, w: ui.w, h: ui.h },
        screenRadius: 55,
        deck: null,
        lidLean: 0,
        ui,
        toolbar: 0,
      };
    }
    case 'tablet': {
      const ui = { w: 1024, h: 740 };
      const bezel = 30;
      const body = { w: ui.w + 2 * bezel, h: ui.h + 2 * bezel, r: 46, depth: 22 };
      return {
        kind,
        body,
        screen: { x: -ui.w / 2, y: -ui.h / 2, w: ui.w, h: ui.h },
        screenRadius: 20,
        deck: null,
        lidLean: 0,
        ui,
        toolbar: 0,
      };
    }
    case 'laptop': {
      const ui = { w: 1280, h: 800 };
      const bezel = 22;
      const body = { w: ui.w + 2 * bezel, h: ui.h + 2 * bezel + 14, r: 22, depth: 12 };
      return {
        kind,
        body,
        // The chin is a little deeper than the other bezels.
        screen: { x: -ui.w / 2, y: -body.h / 2 + bezel, w: ui.w, h: ui.h },
        screenRadius: 8,
        deck: { w: body.w + 30, h: body.h * 0.72, r: 26, depth: 20 },
        lidLean: 24,
        ui,
        toolbar: 0,
      };
    }
    case 'browser': {
      const ui = { w: 1280, h: 800 };
      const toolbar = 52;
      const body = { w: ui.w, h: ui.h + toolbar, r: 16, depth: 8 };
      return {
        kind,
        body,
        // The whole window face is the "display": title bar and page are one texture.
        screen: { x: -body.w / 2, y: -body.h / 2, w: body.w, h: body.h },
        screenRadius: 16,
        deck: null,
        lidLean: 0,
        ui: { w: ui.w, h: ui.h + toolbar },
        toolbar,
      };
    }
  }
}

export type Finish = {
  /** Metal band: shaded from dark to light by how each facet faces the light. */
  dark: Color;
  mid: Color;
  light: Color;
  /** Glass around the display, and the back cover. */
  face: Color;
  back: Color;
  /** A laptop's keyboard well and trackpad. */
  keys: Color;
  pad: Color;
};

const hex = parseHex;

export const FINISHES: Record<FinishKind, Finish> = {
  graphite: {
    dark: hex('#141518'),
    mid: hex('#34363B'),
    light: hex('#8A8E96'),
    face: hex('#08080A'),
    back: hex('#2A2C30'),
    keys: hex('#131416'),
    pad: hex('#2B2D31'),
  },
  silver: {
    dark: hex('#8B8F96'),
    mid: hex('#C4C7CC'),
    light: hex('#F6F7F8'),
    face: hex('#0A0A0C'),
    back: hex('#D9DBDE'),
    keys: hex('#2A2B2E'),
    pad: hex('#CDD0D4'),
  },
  white: {
    dark: hex('#B5B1A9'),
    mid: hex('#E4E1DB'),
    light: hex('#FFFFFF'),
    face: hex('#F4F2EE'),
    back: hex('#ECEAE5'),
    keys: hex('#D9D6CF'),
    pad: hex('#E8E5DF'),
  },
};

/** Outline of a rounded rect (centered) as points with outward normals, corners in `steps`. */
export type Outline = {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  /** Outward normal of the edge from point i to point i + 1. */
  readonly nx: Float64Array;
  readonly ny: Float64Array;
};

export function slabOutline(shape: SlabShape, steps = 8): Outline {
  const { w, h } = shape;
  const r = Math.min(shape.r, w / 2, h / 2);
  const xs: number[] = [];
  const ys: number[] = [];
  const centers = [
    [w / 2 - r, -h / 2 + r, -90],
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, 90],
    [-w / 2 + r, -h / 2 + r, 180],
  ] as const;
  for (const [cx, cy, start] of centers) {
    for (let k = 0; k <= steps; k++) {
      const a = ((start + (90 * k) / steps) * Math.PI) / 180;
      xs.push(cx + r * Math.cos(a));
      ys.push(cy + r * Math.sin(a));
    }
  }
  const n = xs.length;
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = (xs[j] as number) - (xs[i] as number);
    const dy = (ys[j] as number) - (ys[i] as number);
    const length = Math.hypot(dx, dy) || 1;
    // Clockwise outline (y down): the outward normal is (dy, −dx).
    nx[i] = dy / length;
    ny[i] = -dx / length;
  }
  return { xs: Float64Array.from(xs), ys: Float64Array.from(ys), nx, ny };
}

export type Light = {
  /** Direction toward the light (world, normalized). */
  dir: Vec3;
  ambient: number;
};

const scratch: Vec3 = { x: 0, y: 0, z: 0 };
const normal: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Draws a slab: a base silhouette (convex hull of both outlines) in the band's mid tone, the
 * band's visible facets shaded by the light, and the front (or back) face. Returns the front
 * face's projected outline (null when the back faces the camera).
 */
export function drawSlab(
  g: Draw,
  camera: Camera,
  transform: Transform3D,
  shape: SlabShape,
  outline: Outline,
  finish: Finish,
  light: Light,
  opacity: number,
  faceFill: Color = finish.face,
): PathData | null {
  const n = outline.xs.length;
  const z = shape.depth / 2;
  const front = new Float64Array(2 * n);
  const back = new Float64Array(2 * n);
  const p: Projected = { x: 0, y: 0, depth: 0, scale: 0 };
  for (let i = 0; i < n; i++) {
    const x = outline.xs[i] as number;
    const y = outline.ys[i] as number;
    camera.project(transform.applyXYZ(x, y, z, scratch), p);
    front[2 * i] = p.x;
    front[2 * i + 1] = p.y;
    camera.project(transform.applyXYZ(x, y, -z, scratch), p);
    back[2 * i] = p.x;
    back[2 * i + 1] = p.y;
  }
  const all = new Float64Array(4 * n);
  all.set(front, 0);
  all.set(back, 2 * n);
  const paint = { fill: finish.mid, opacity };
  g.path(polygonPath(convexHull(all)), paint);

  // The eye, for facing tests (the camera has no view transform here).
  const eye = { x: camera.x, y: camera.y, z: camera.perspective };
  const { dir, ambient } = light;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    transform.applyDirection(
      { x: outline.nx[i] as number, y: outline.ny[i] as number, z: 0 },
      normal,
    );
    const mx = ((outline.xs[i] as number) + (outline.xs[j] as number)) / 2;
    const my = ((outline.ys[i] as number) + (outline.ys[j] as number)) / 2;
    transform.applyXYZ(mx, my, 0, scratch);
    const vx = eye.x - scratch.x;
    const vy = eye.y - scratch.y;
    const vz = eye.z - scratch.z;
    if (normal.x * vx + normal.y * vy + normal.z * vz <= 0) continue;
    // Lambert plus a tight highlight where the band turns toward the light.
    const lambert = Math.max(0, normal.x * dir.x + normal.y * dir.y + normal.z * dir.z);
    const vl = Math.hypot(vx, vy, vz) || 1;
    const hx = dir.x + vx / vl;
    const hy = dir.y + vy / vl;
    const hz = dir.z + vz / vl;
    const hl = Math.hypot(hx, hy, hz) || 1;
    const spec = Math.max(0, (normal.x * hx + normal.y * hy + normal.z * hz) / hl) ** 24;
    const shade = Math.min(1, ambient + (1 - ambient) * lambert);
    const base = mixOklab(finish.dark, finish.mid, Math.min(1, shade * 1.25));
    const lit = mixOklab(base, finish.light, Math.min(1, spec * 0.9 + Math.max(0, shade - 0.8)));
    g.path(
      polygonPath([
        front[2 * i] as number,
        front[2 * i + 1] as number,
        front[2 * j] as number,
        front[2 * j + 1] as number,
        back[2 * j] as number,
        back[2 * j + 1] as number,
        back[2 * i] as number,
        back[2 * i + 1] as number,
      ]),
      { fill: lit, opacity },
    );
  }

  // The face toward the camera: the front (glass) or the back cover.
  transform.applyDirection({ x: 0, y: 0, z: 1 }, normal);
  transform.applyXYZ(0, 0, z, scratch);
  const facing =
    normal.x * (eye.x - scratch.x) +
      normal.y * (eye.y - scratch.y) +
      normal.z * (eye.z - scratch.z) >
    0;
  const facePath = polygonPath(facing ? front : back);
  g.path(facePath, { fill: facing ? faceFill : finish.back, opacity });
  if (!facing) return null;
  // The band's front edge catches the light: a hairline around the face.
  g.path(facePath, {
    stroke: { color: withAlpha(finish.light, 0.55), width: Math.max(g.pixel, shape.w * 0.0022) },
    opacity: opacity * 0.7,
  });
  return facePath;
}

/** A model scaled to design units (`k` design units per model unit). */
export function scaleModel(model: DeviceModel, k: number): DeviceModel {
  const slab = (s: SlabShape): SlabShape => ({
    w: s.w * k,
    h: s.h * k,
    r: s.r * k,
    depth: s.depth * k,
  });
  const r = model.screen;
  return {
    ...model,
    body: slab(model.body),
    screen: { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k },
    screenRadius: model.screenRadius * k,
    deck: model.deck ? slab(model.deck) : null,
  };
}
