/**
 * SVG path data and transforms → engine paths (docs/06-engine.md §8). Parses the full path
 * grammar (relative commands, shorthand curves, arcs) into absolute `M L Q C Z` commands, so the
 * renderer only ever sees the engine's path format.
 */

import type { Rect } from '../core/math';
import type { PathCommand, PathData } from '../draw/types';

/** Affine matrix `[a, b, c, d, e, f]`: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = readonly [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** m × n (n applies first). */
export function multiply(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const isIdentity = (m: Affine) =>
  m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

/** Scale factor of a transform for stroke widths (geometric mean of the axes). */
export const affineScale = (m: Affine) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

// --- numbers ---------------------------------------------------------------------------------

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

/** Reads SVG numbers from a string (commas and whitespace separate; signs split numbers too). */
class NumberScanner {
  i = 0;
  constructor(private readonly s: string) {}

  skipSeparators(): void {
    const { s } = this;
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === ' ' || c === ',' || c === '\n' || c === '\t' || c === '\r') this.i++;
      else break;
    }
  }

  /** Next number, or NaN if the next token isn't one. */
  number(): number {
    this.skipSeparators();
    const match = NUMBER.exec(this.s.slice(this.i, this.i + 64));
    if (!match) return Number.NaN;
    this.i += match[0].length;
    return Number(match[0]);
  }

  /** An arc flag: a single `0` or `1` (may be written without separators, e.g. `a1 1 0 01 1 1`). */
  flag(): number {
    this.skipSeparators();
    const c = this.s[this.i];
    if (c === '0' || c === '1') {
      this.i++;
      return c === '1' ? 1 : 0;
    }
    return Number.NaN;
  }

  atNumber(): boolean {
    this.skipSeparators();
    const c = this.s[this.i];
    return c !== undefined && /[0-9.+-]/.test(c);
  }

  get done(): boolean {
    this.skipSeparators();
    return this.i >= this.s.length;
  }

  peek(): string | undefined {
    this.skipSeparators();
    return this.s[this.i];
  }
}

/** Parses a list of numbers (`points`, `viewBox`, transform arguments). */
export function parseNumbers(text: string): number[] {
  const scanner = new NumberScanner(text);
  const out: number[] = [];
  while (!scanner.done) {
    const n = scanner.number();
    if (Number.isNaN(n)) break;
    out.push(n);
  }
  return out;
}

// --- transforms ------------------------------------------------------------------------------

const DEG = Math.PI / 180;

/** Parses an SVG `transform` attribute; unknown functions make the whole attribute invalid. */
export function parseTransform(text: string): Affine | null {
  let m: Affine = IDENTITY;
  const re = /\s*([a-zA-Z]+)\s*\(([^)]*)\)\s*,?/y;
  let index = 0;
  const trimmed = text.trim();
  while (index < trimmed.length) {
    re.lastIndex = index;
    const match = re.exec(trimmed);
    if (!match) return null;
    index = re.lastIndex;
    const name = (match[1] as string).toLowerCase();
    const args = parseNumbers(match[2] as string);
    let t: Affine;
    switch (name) {
      case 'matrix':
        if (args.length !== 6) return null;
        t = args as unknown as Affine;
        break;
      case 'translate':
        t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale': {
        const sx = args[0] ?? 1;
        t = [sx, 0, 0, args[1] ?? sx, 0, 0];
        break;
      }
      case 'rotate': {
        const a = (args[0] ?? 0) * DEG;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const cx = args[1] ?? 0;
        const cy = args[2] ?? 0;
        t = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
        break;
      }
      case 'skewx':
        t = [1, 0, Math.tan((args[0] ?? 0) * DEG), 1, 0, 0];
        break;
      case 'skewy':
        t = [1, Math.tan((args[0] ?? 0) * DEG), 0, 1, 0, 0];
        break;
      default:
        return null;
    }
    if (!t.every(Number.isFinite)) return null;
    m = multiply(m, t);
  }
  return m;
}

// --- path data -------------------------------------------------------------------------------

/**
 * Converts an elliptical arc (SVG endpoint parameterization) to cubic Béziers
 * (SVG 1.1 appendix F.6.5; ≤ 90° per segment, k = 4/3·tan(θ/4)).
 */
function arcToCubics(
  x0: number,
  y0: number,
  rxIn: number,
  ryIn: number,
  rotation: number,
  largeArc: number,
  sweep: number,
  x: number,
  y: number,
  out: PathCommand[],
): void {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x0 === x && y0 === y)) {
    if (x0 !== x || y0 !== y) out.push(['L', x, y]);
    return;
  }
  const phi = rotation * DEG;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  // Scale up radii that are too small to reach the end point.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const num = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x0 + x) / 2;
  const cy = sin * cxp + cos * cyp + (y0 + y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  let t = theta1;
  for (let i = 0; i < segments; i++) {
    const c1 = Math.cos(t);
    const s1 = Math.sin(t);
    const t2 = t + step;
    const c2 = Math.cos(t2);
    const s2 = Math.sin(t2);
    // Points on the unit circle → ellipse → rotated → translated.
    const px = (ux: number, uy: number) => cx + cos * rx * ux - sin * ry * uy;
    const py = (ux: number, uy: number) => cy + sin * rx * ux + cos * ry * uy;
    const e1x = c1 - k * s1;
    const e1y = s1 + k * c1;
    const e2x = c2 + k * s2;
    const e2y = s2 - k * c2;
    const last = i === segments - 1;
    out.push([
      'C',
      px(e1x, e1y),
      py(e1x, e1y),
      px(e2x, e2y),
      py(e2x, e2y),
      last ? x : px(c2, s2),
      last ? y : py(c2, s2),
    ]);
    t = t2;
  }
}

const COMMANDS = new Set('MmLlHhVvCcSsQqTtAaZz');

/**
 * Parses SVG path data into absolute engine commands. Stops at the first malformed segment and
 * keeps what was parsed before it (as browsers do).
 */
export function parsePathData(d: string): PathData {
  const out: PathCommand[] = [];
  const s = new NumberScanner(d);
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // Last control points for S/T reflection.
  let lastCubicX = 0;
  let lastCubicY = 0;
  let lastQuadX = 0;
  let lastQuadY = 0;
  let previous = '';
  let command = '';

  while (!s.done) {
    const c = s.peek() as string;
    if (COMMANDS.has(c)) {
      command = c;
      s.i++;
    } else if (!command || command === 'Z' || command === 'z') {
      break; // numbers without a command
    }
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    let ok = true;

    switch (upper) {
      case 'M': {
        const nx = s.number() + ox;
        const ny = s.number() + oy;
        if (Number.isNaN(nx + ny)) {
          ok = false;
          break;
        }
        out.push(['M', nx, ny]);
        x = startX = nx;
        y = startY = ny;
        // Further pairs after M are implicit line-tos.
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L': {
        const nx = s.number() + ox;
        const ny = s.number() + oy;
        if (Number.isNaN(nx + ny)) {
          ok = false;
          break;
        }
        out.push(['L', nx, ny]);
        x = nx;
        y = ny;
        break;
      }
      case 'H': {
        const nx = s.number() + ox;
        if (Number.isNaN(nx)) {
          ok = false;
          break;
        }
        out.push(['L', nx, y]);
        x = nx;
        break;
      }
      case 'V': {
        const ny = s.number() + oy;
        if (Number.isNaN(ny)) {
          ok = false;
          break;
        }
        out.push(['L', x, ny]);
        y = ny;
        break;
      }
      case 'C': {
        const v = [s.number(), s.number(), s.number(), s.number(), s.number(), s.number()];
        if (v.some(Number.isNaN)) {
          ok = false;
          break;
        }
        const [x1, y1, x2, y2, ex, ey] = v as [number, number, number, number, number, number];
        out.push(['C', x1 + ox, y1 + oy, x2 + ox, y2 + oy, ex + ox, ey + oy]);
        lastCubicX = x2 + ox;
        lastCubicY = y2 + oy;
        x = ex + ox;
        y = ey + oy;
        break;
      }
      case 'S': {
        const v = [s.number(), s.number(), s.number(), s.number()];
        if (v.some(Number.isNaN)) {
          ok = false;
          break;
        }
        const [x2, y2, ex, ey] = v as [number, number, number, number];
        const reflect = previous === 'C' || previous === 'S';
        const x1 = reflect ? 2 * x - lastCubicX : x;
        const y1 = reflect ? 2 * y - lastCubicY : y;
        out.push(['C', x1, y1, x2 + ox, y2 + oy, ex + ox, ey + oy]);
        lastCubicX = x2 + ox;
        lastCubicY = y2 + oy;
        x = ex + ox;
        y = ey + oy;
        break;
      }
      case 'Q': {
        const v = [s.number(), s.number(), s.number(), s.number()];
        if (v.some(Number.isNaN)) {
          ok = false;
          break;
        }
        const [x1, y1, ex, ey] = v as [number, number, number, number];
        out.push(['Q', x1 + ox, y1 + oy, ex + ox, ey + oy]);
        lastQuadX = x1 + ox;
        lastQuadY = y1 + oy;
        x = ex + ox;
        y = ey + oy;
        break;
      }
      case 'T': {
        const ex = s.number() + ox;
        const ey = s.number() + oy;
        if (Number.isNaN(ex + ey)) {
          ok = false;
          break;
        }
        const reflect = previous === 'Q' || previous === 'T';
        const x1 = reflect ? 2 * x - lastQuadX : x;
        const y1 = reflect ? 2 * y - lastQuadY : y;
        out.push(['Q', x1, y1, ex, ey]);
        lastQuadX = x1;
        lastQuadY = y1;
        x = ex;
        y = ey;
        break;
      }
      case 'A': {
        const rx = s.number();
        const ry = s.number();
        const rotation = s.number();
        const large = s.flag();
        const sweep = s.flag();
        const ex = s.number() + ox;
        const ey = s.number() + oy;
        if ([rx, ry, rotation, large, sweep, ex, ey].some(Number.isNaN)) {
          ok = false;
          break;
        }
        arcToCubics(x, y, rx, ry, rotation, large, sweep, ex, ey, out);
        x = ex;
        y = ey;
        break;
      }
      case 'Z':
        out.push(['Z']);
        x = startX;
        y = startY;
        break;
    }
    if (!ok) break;
    previous = upper;
    // A Z followed by numbers is malformed; other commands repeat while numbers follow.
    if (upper === 'Z' && s.atNumber()) break;
  }
  return out;
}

/** Applies an affine transform to every point of a path. */
export function transformPath(path: PathData, m: Affine): PathData {
  if (isIdentity(m)) return path;
  const [a, b, c, d, e, f] = m;
  const tx = (x: number, y: number) => a * x + c * y + e;
  const ty = (x: number, y: number) => b * x + d * y + f;
  return path.map((cmd): PathCommand => {
    if (cmd[0] === 'M' || cmd[0] === 'L') return [cmd[0], tx(cmd[1], cmd[2]), ty(cmd[1], cmd[2])];
    if (cmd[0] === 'Q') {
      return ['Q', tx(cmd[1], cmd[2]), ty(cmd[1], cmd[2]), tx(cmd[3], cmd[4]), ty(cmd[3], cmd[4])];
    }
    if (cmd[0] === 'C') {
      return [
        'C',
        tx(cmd[1], cmd[2]),
        ty(cmd[1], cmd[2]),
        tx(cmd[3], cmd[4]),
        ty(cmd[3], cmd[4]),
        tx(cmd[5], cmd[6]),
        ty(cmd[5], cmd[6]),
      ];
    }
    return cmd;
  });
}

/** Tight bounds of a path (curve extrema included, via flattening). */
export function pathBounds(path: PathData): Rect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const add = (px: number, py: number) => {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const STEPS = 24;
  for (const cmd of path) {
    switch (cmd[0]) {
      case 'M':
        x = startX = cmd[1];
        y = startY = cmd[2];
        add(x, y);
        break;
      case 'L':
        x = cmd[1];
        y = cmd[2];
        add(x, y);
        break;
      case 'Q':
        for (let i = 1; i <= STEPS; i++) {
          const t = i / STEPS;
          const mt = 1 - t;
          add(
            mt * mt * x + 2 * mt * t * cmd[1] + t * t * cmd[3],
            mt * mt * y + 2 * mt * t * cmd[2] + t * t * cmd[4],
          );
        }
        x = cmd[3];
        y = cmd[4];
        break;
      case 'C':
        for (let i = 1; i <= STEPS; i++) {
          const t = i / STEPS;
          const mt = 1 - t;
          const p0 = mt * mt * mt;
          const p1 = 3 * mt * mt * t;
          const p2 = 3 * mt * t * t;
          const p3 = t * t * t;
          add(
            p0 * x + p1 * cmd[1] + p2 * cmd[3] + p3 * cmd[5],
            p0 * y + p1 * cmd[2] + p2 * cmd[4] + p3 * cmd[6],
          );
        }
        x = cmd[5];
        y = cmd[6];
        break;
      case 'Z':
        x = startX;
        y = startY;
        break;
    }
  }
  if (!Number.isFinite(minX + minY + maxX + maxY)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
