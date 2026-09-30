/**
 * Pattern's tiling (engine candidate: "seeded constraint-based tiling"). Every tile gets a
 * ground color, a shape, its orientation and the shape's color by rules, so every seed reads
 * as designed: no two edge neighbors share a ground color or the same shape in the same
 * orientation, no tile repeats a diagonal neighbor outright, and colors are balanced by the
 * area they cover across the whole grid (shapes by count). The seed only breaks ties.
 *
 * Tiles get two faces: the pattern (A) and the one they flip to in the hold (B), each valid
 * against every neighbor's A and B — so the pattern stays designed in every state of a wave.
 */

import type { Rng } from '@/engine';
import { SHAPE_AREA, SHAPE_TURNS, type ShapeKind } from './shapes';

export type Face = { ground: number; ink: number; shape: ShapeKind; turn: number };

export type Tiling = { cols: number; rows: number; a: Face[]; b: Face[] };

type Variant = { shape: ShapeKind; turn: number };

const same = (p: Face | undefined, q: Face) =>
  p !== undefined &&
  p.shape === q.shape &&
  p.turn % SHAPE_TURNS[p.shape] === q.turn % SHAPE_TURNS[q.shape];
const identical = (p: Face | undefined, q: Face) =>
  p !== undefined && same(p, q) && p.ground === q.ground && p.ink === q.ink;

/**
 * Solves both faces of a `cols` × `rows` grid with `colors` colors (index 0 is the page's
 * ground) and the given shapes. Tiles in `framing` (the ring around the logo's window) keep
 * the page color out, so the window's edge stays crisp.
 */
export function solveTiling(
  cols: number,
  rows: number,
  colors: number,
  shapes: readonly ShapeKind[],
  rng: Rng,
  framing: ReadonlySet<number>,
): Tiling {
  const variants: Variant[] = [];
  for (const shape of shapes) {
    for (let turn = 0; turn < 4; turn++) variants.push({ shape, turn });
  }
  const n = cols * rows;
  // Running totals for balance: area per color, count per shape.
  const area = new Float64Array(colors);
  const shapeCount = new Map<ShapeKind, number>(shapes.map((shape) => [shape, 0]));
  const turnCount = new Float64Array(4);

  const solve = (faces: Face[], check: (index: number, face: Face) => boolean) => {
    for (let index = 0; index < n; index++) {
      let best: Face | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let ground = 0; ground < colors; ground++) {
        for (let ink = 0; ink < colors; ink++) {
          if (ink === ground) continue;
          for (const variant of variants) {
            const face: Face = { ground, ink, shape: variant.shape, turn: variant.turn };
            if (!check(index, face)) continue;
            const covered = SHAPE_AREA[variant.shape];
            // Prefer colors (by area) and shapes (by count) used least so far; jitter breaks ties.
            const score =
              (area[ground] ?? 0) * (1 - covered) * 0.9 +
              (area[ink] ?? 0) * covered * 1.1 +
              ((area[ground] ?? 0) + (area[ink] ?? 0)) * 0.35 +
              (shapeCount.get(variant.shape) ?? 0) * 0.55 +
              (turnCount[variant.turn] ?? 0) * 0.12 +
              rng.next() * 1.6;
            if (score < bestScore) {
              bestScore = score;
              best = face;
            }
          }
        }
      }
      // Constraints are always satisfiable with ≥ 2 colors and ≥ 2 variants; fall back anyway.
      const face = best ?? {
        ground: index % colors,
        ink: (index + 1) % colors,
        shape: shapes[index % shapes.length] ?? 'circle',
        turn: index % 4,
      };
      faces[index] = face;
      const covered = SHAPE_AREA[face.shape];
      area[face.ground] = (area[face.ground] ?? 0) + (1 - covered);
      area[face.ink] = (area[face.ink] ?? 0) + covered;
      shapeCount.set(face.shape, (shapeCount.get(face.shape) ?? 0) + 1);
      turnCount[face.turn] = (turnCount[face.turn] ?? 0) + 1;
    }
  };

  const neighbors = (index: number) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      left: col > 0 ? index - 1 : -1,
      right: col < cols - 1 ? index + 1 : -1,
      up: row > 0 ? index - cols : -1,
      down: row < rows - 1 ? index + cols : -1,
      upLeft: col > 0 && row > 0 ? index - cols - 1 : -1,
      upRight: col < cols - 1 && row > 0 ? index - cols + 1 : -1,
      downLeft: col > 0 && row < rows - 1 ? index + cols - 1 : -1,
      downRight: col < cols - 1 && row < rows - 1 ? index + cols + 1 : -1,
    };
  };

  // The ring around the window keeps the page color out of its grounds — and out of its
  // shapes too when there are colors enough, so no shape bulges into the window.
  const framed = (index: number, face: Face) =>
    framing.has(index) && (face.ground === 0 || (colors >= 3 && face.ink === 0));

  const a: Face[] = new Array(n);
  solve(a, (index, face) => {
    if (framed(index, face)) return false;
    const { left, up, upLeft, upRight } = neighbors(index);
    for (const k of [left, up]) {
      const other = a[k];
      if (k >= 0 && other && (other.ground === face.ground || same(other, face))) return false;
    }
    for (const k of [upLeft, upRight]) if (k >= 0 && identical(a[k], face)) return false;
    return true;
  });

  const b: Face[] = new Array(n);
  solve(b, (index, face) => {
    if (framed(index, face)) return false;
    // A flip must show a change: another shape or orientation (the ground may stay).
    const own = a[index];
    if (own && same(own, face)) return false;
    const around = neighbors(index);
    for (const k of [around.left, around.right, around.up, around.down]) {
      if (k < 0) continue;
      for (const other of [a[k], b[k]]) {
        if (other && (other.ground === face.ground || same(other, face))) return false;
      }
    }
    for (const k of [around.upLeft, around.upRight, around.downLeft, around.downRight]) {
      if (k >= 0 && (identical(a[k], face) || identical(b[k], face))) return false;
    }
    return true;
  });

  return { cols, rows, a, b };
}
