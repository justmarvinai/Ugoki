/**
 * Pattern's geometric primitives: each drawn in a tile of side 1 centered on the origin, in a
 * base orientation that rotates in 90° steps. `area` is the share of the tile a shape covers
 * (for balancing colors by area, not by count); `turns` how many of its four orientations
 * differ.
 */

import type { PathCommand, PathData } from '@/engine';

export type ShapeKind =
  | 'quarter'
  | 'half'
  | 'triangle'
  | 'circle'
  | 'block'
  | 'ring'
  | 'arch'
  | 'dots'
  | 'stripes'
  | 'diagonal';

export type ShapeSet = 'bauhaus' | 'circles' | 'lines' | 'mixed';

export const SHAPE_SETS: Record<ShapeSet, readonly ShapeKind[]> = {
  bauhaus: ['quarter', 'half', 'triangle', 'circle', 'block'],
  circles: ['circle', 'half', 'quarter', 'ring', 'arch', 'dots'],
  lines: ['stripes', 'diagonal', 'block', 'triangle'],
  mixed: ['quarter', 'half', 'triangle', 'circle', 'block', 'ring', 'arch', 'stripes', 'diagonal'],
};

/** Bézier handle length for a quarter circle of radius 1. */
const K = 0.5523;

function circlePath(cx: number, cy: number, r: number, reverse = false): PathCommand[] {
  const k = K * r;
  if (!reverse) {
    return [
      ['M', cx + r, cy],
      ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
      ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
      ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
      ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
      ['Z'],
    ];
  }
  return [
    ['M', cx + r, cy],
    ['C', cx + r, cy - k, cx + k, cy - r, cx, cy - r],
    ['C', cx - k, cy - r, cx - r, cy - k, cx - r, cy],
    ['C', cx - r, cy + k, cx - k, cy + r, cx, cy + r],
    ['C', cx + k, cy + r, cx + r, cy + k, cx + r, cy],
    ['Z'],
  ];
}

const h = 0.5;

/** Unit shapes (tile side 1, centered on the origin), scaled to `s`. */
function unitPath(kind: ShapeKind): PathCommand[] {
  switch (kind) {
    case 'quarter':
      // A quarter disc of radius 1 around the top-left corner.
      return [['M', -h, -h], ['L', h, -h], ['C', h, -h + K, -h + K, h, -h, h], ['Z']];
    case 'half':
      // A half disc hanging from the top edge.
      return [
        ['M', -h, -h],
        ['L', h, -h],
        ['C', h, -h + K * h, K * h, 0, 0, 0],
        ['C', -K * h, 0, -h, -h + K * h, -h, -h],
        ['Z'],
      ];
    case 'triangle':
      return [['M', -h, -h], ['L', h, -h], ['L', -h, h], ['Z']];
    case 'circle':
      return circlePath(0, 0, 0.36);
    case 'block':
      return [['M', -h, -h], ['L', 0, -h], ['L', 0, h], ['L', -h, h], ['Z']];
    case 'ring':
      return [...circlePath(0, 0, 0.38), ...circlePath(0, 0, 0.22, true)];
    case 'arch': {
      // A quarter annulus around the top-left corner (radii 0.5 and 1).
      const r = 0.5;
      return [
        ['M', h, -h],
        ['C', h, -h + K, -h + K, h, -h, h],
        ['L', -h, -h + r],
        ['C', -h + K * r, -h + r, -h + r, -h + K * r, -h + r, -h],
        ['Z'],
      ];
    }
    case 'dots': {
      const d = 0.21;
      return [
        ...circlePath(-d, -d, 0.13),
        ...circlePath(d, -d, 0.13),
        ...circlePath(-d, d, 0.13),
        ...circlePath(d, d, 0.13),
      ];
    }
    case 'stripes': {
      const bar = 1 / 7;
      const out: PathCommand[] = [];
      for (const y of [-3 * bar, -bar / 2, 2 * bar]) {
        out.push(['M', -h, y], ['L', h, y], ['L', h, y + bar], ['L', -h, y + bar], ['Z']);
      }
      return out;
    }
    case 'diagonal':
      // A band from corner to corner.
      return [
        ['M', -h, 0.2],
        ['L', 0.2, -h],
        ['L', h, -h],
        ['L', h, -0.2],
        ['L', -0.2, h],
        ['L', -h, h],
        ['Z'],
      ];
  }
}

export const SHAPE_AREA: Record<ShapeKind, number> = {
  quarter: Math.PI / 4,
  half: Math.PI / 8,
  triangle: 0.5,
  circle: Math.PI * 0.36 * 0.36,
  block: 0.5,
  ring: Math.PI * (0.38 * 0.38 - 0.22 * 0.22),
  arch: (Math.PI / 4) * (1 - 0.25),
  dots: 4 * Math.PI * 0.13 * 0.13,
  stripes: 3 / 7,
  diagonal: 1 - 0.7 * 0.7,
};

/** Distinct orientations (the rest repeat under 90° turns). */
export const SHAPE_TURNS: Record<ShapeKind, number> = {
  quarter: 4,
  half: 4,
  triangle: 4,
  circle: 1,
  block: 4,
  ring: 1,
  arch: 4,
  dots: 1,
  stripes: 2,
  diagonal: 2,
};

/** Paths for every kind at tile size `s` (design units), centered on the origin. */
export function shapePaths(s: number): Record<ShapeKind, PathData> {
  const scale = (path: PathCommand[]): PathData =>
    path.map((command): PathCommand => {
      if (command[0] === 'Z') return ['Z'];
      if (command[0] === 'C') {
        const [, a, b, c, d, e, f] = command;
        return ['C', a * s, b * s, c * s, d * s, e * s, f * s];
      }
      if (command[0] === 'Q') {
        const [, a, b, c, d] = command;
        return ['Q', a * s, b * s, c * s, d * s];
      }
      return [command[0], command[1] * s, command[2] * s];
    });
  const kinds = Object.keys(SHAPE_AREA) as ShapeKind[];
  return Object.fromEntries(kinds.map((kind) => [kind, scale(unitPath(kind))])) as Record<
    ShapeKind,
    PathData
  >;
}
