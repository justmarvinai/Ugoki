/** Path helpers: Path2D construction, flattening and length (for trim paths). */

import {
  type FontFace,
  type GlyphOutline,
  VERB_CLOSE,
  VERB_CUBIC,
  VERB_LINE,
  VERB_MOVE,
  VERB_QUAD,
} from '../text/types';
import type { PathData } from './types';

/** Adds SVG-like path commands to a Path2D or a canvas context. */
export function tracePath(target: Path2D | CanvasPath, path: PathData): void {
  for (const command of path) {
    switch (command[0]) {
      case 'M':
        target.moveTo(command[1], command[2]);
        break;
      case 'L':
        target.lineTo(command[1], command[2]);
        break;
      case 'Q':
        target.quadraticCurveTo(command[1], command[2], command[3], command[4]);
        break;
      case 'C':
        target.bezierCurveTo(
          command[1],
          command[2],
          command[3],
          command[4],
          command[5],
          command[6],
        );
        break;
      case 'Z':
        target.closePath();
        break;
    }
  }
}

/** Builds a Path2D from a HarfBuzz glyph outline (font units, y up). */
export function outlineToPath2D(outline: GlyphOutline): Path2D {
  const path = new Path2D();
  const c = outline.commands;
  let k = 0;
  for (let i = 0; i < outline.verbs.length; i++) {
    switch (outline.verbs[i]) {
      case VERB_MOVE:
        path.moveTo(c[k] as number, c[k + 1] as number);
        k += 2;
        break;
      case VERB_LINE:
        path.lineTo(c[k] as number, c[k + 1] as number);
        k += 2;
        break;
      case VERB_QUAD:
        path.quadraticCurveTo(
          c[k] as number,
          c[k + 1] as number,
          c[k + 2] as number,
          c[k + 3] as number,
        );
        k += 4;
        break;
      case VERB_CUBIC:
        path.bezierCurveTo(
          c[k] as number,
          c[k + 1] as number,
          c[k + 2] as number,
          c[k + 3] as number,
          c[k + 4] as number,
          c[k + 5] as number,
        );
        k += 6;
        break;
      case VERB_CLOSE:
        path.closePath();
        break;
    }
  }
  return path;
}

const glyphPaths = new WeakMap<FontFace, Map<number, Path2D>>();

/** Cached Path2D for a glyph of a face instance. */
export function glyphPath(face: FontFace, glyph: number): Path2D {
  let byGlyph = glyphPaths.get(face);
  if (!byGlyph) {
    byGlyph = new Map();
    glyphPaths.set(face, byGlyph);
  }
  let path = byGlyph.get(glyph);
  if (!path) {
    path = outlineToPath2D(face.outline(glyph));
    byGlyph.set(glyph, path);
  }
  return path;
}

const CURVE_STEPS = 16;

/** Total length of a path (curves flattened), for trim paths. */
export function pathLength(path: PathData): number {
  let length = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const segment = (nx: number, ny: number) => {
    length += Math.hypot(nx - x, ny - y);
    x = nx;
    y = ny;
  };
  for (const command of path) {
    switch (command[0]) {
      case 'M':
        x = startX = command[1];
        y = startY = command[2];
        break;
      case 'L':
        segment(command[1], command[2]);
        break;
      case 'Q': {
        const [, cx, cy, ex, ey] = command;
        const x0 = x;
        const y0 = y;
        for (let i = 1; i <= CURVE_STEPS; i++) {
          const t = i / CURVE_STEPS;
          const mt = 1 - t;
          segment(
            mt * mt * x0 + 2 * mt * t * cx + t * t * ex,
            mt * mt * y0 + 2 * mt * t * cy + t * t * ey,
          );
        }
        break;
      }
      case 'C': {
        const [, c1x, c1y, c2x, c2y, ex, ey] = command;
        const x0 = x;
        const y0 = y;
        for (let i = 1; i <= CURVE_STEPS; i++) {
          const t = i / CURVE_STEPS;
          const mt = 1 - t;
          const a = mt * mt * mt;
          const b = 3 * mt * mt * t;
          const cc = 3 * mt * t * t;
          const d = t * t * t;
          segment(a * x0 + b * c1x + cc * c2x + d * ex, a * y0 + b * c1y + cc * c2y + d * ey);
        }
        break;
      }
      case 'Z':
        segment(startX, startY);
        break;
    }
  }
  return length;
}
