/**
 * Canvas 2D implementation of the Draw API (docs/06-engine.md §6) — the direct path for frames
 * that need no compositor work.
 *
 * Templates draw in design units. The drawer keeps its own transform/opacity/blend stacks and
 * sets the full transform before each primitive, so per-glyph motion costs one `setTransform`
 * and one cached-path fill per glyph (no save/restore). Group opacity multiplies into each
 * primitive rather than compositing an isolated layer, and blend modes apply per primitive;
 * isolated layers, FX, mattes and motion blur arrive with the WebGL2 compositor (Phase 2).
 */

import { type Color, mixOklab, toCss } from '../core/color';
import { clamp01, type Rect } from '../core/math';
import type { FrameSpec } from '../template/formats';
import type { Glyph, TextBlock, TextLine } from '../text/types';
import { glyphPath, pathLength, tracePath } from './path';
import type {
  BlendMode,
  ClipShape,
  Draw,
  EditableKind,
  EditableRegion,
  Fill,
  GlyphTransform,
  Gradient,
  GroupOptions,
  ImageAsset,
  ImageOptions,
  LayoutOffset,
  Paint,
  PathData,
  Stroke,
  TextDrawOptions,
} from './types';

export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type DrawTarget = {
  ctx: Canvas2D;
  frame: FrameSpec;
  /** Output pixels per design unit. */
  scale: number;
  /** Skip `fill(…, { background: true })` (alpha export, transparent preview). */
  transparent: boolean;
  /** Offsets of movable groups (x/y in `u`, scale around the group's center). */
  layout?: Readonly<Record<string, LayoutOffset>>;
  /** Record movable/editable regions for the editor overlay. */
  collectRegions?: boolean;
};

const DEG = Math.PI / 180;
const MAX_DEPTH = 64;
/** Below this opacity nothing is drawn. */
const INVISIBLE = 1 / 1024;
const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 };
const NO_DASH: number[] = [];
const NO_OPTIONS: TextDrawOptions = {};
/** Extra stops inserted between two gradient stops (interpolated in OKLab). */
const GRADIENT_STEPS = 8;

const COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  difference: 'difference',
  lighter: 'lighter',
};

const isGradient = (fill: Fill): fill is Gradient => 'kind' in fill;

/** Mutable affine matrix in canvas order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
class Matrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  reset(): this {
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;
    return this;
  }

  /**
   * Sets this to T(x + ox, y + oy) · R(rotate) · K(skewX, skewY) · S(sx, sy) · T(−ox, −oy):
   * scale, skew and rotate around the pivot (ox, oy), then translate — the After Effects order.
   */
  compose(
    x: number,
    y: number,
    sx: number,
    sy: number,
    rotate: number,
    skewX: number,
    skewY: number,
    ox: number,
    oy: number,
  ): this {
    let cos = 1;
    let sin = 0;
    if (rotate !== 0) {
      cos = Math.cos(rotate * DEG);
      sin = Math.sin(rotate * DEG);
    }
    const kx = skewX !== 0 ? Math.tan(skewX * DEG) : 0;
    const ky = skewY !== 0 ? Math.tan(skewY * DEG) : 0;
    this.a = sx * (cos - sin * ky);
    this.b = sx * (sin + cos * ky);
    this.c = sy * (cos * kx - sin);
    this.d = sy * (sin * kx + cos);
    this.e = x + ox - (this.a * ox + this.c * oy);
    this.f = y + oy - (this.b * ox + this.d * oy);
    return this;
  }

  /** this = m × n (n applies first). Safe when `this` is `m` or `n`. */
  multiply(m: Matrix, n: Matrix): this {
    const a = m.a * n.a + m.c * n.b;
    const b = m.b * n.a + m.d * n.b;
    const c = m.a * n.c + m.c * n.d;
    const d = m.b * n.c + m.d * n.d;
    const e = m.a * n.e + m.c * n.f + m.e;
    const f = m.b * n.e + m.d * n.f + m.f;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  /** Axis-aligned bounds of `r` transformed by this matrix. */
  bounds(r: Rect): Rect {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 4; i++) {
      const x = i & 1 ? r.x + r.w : r.x;
      const y = i & 2 ? r.y + r.h : r.y;
      const tx = this.a * x + this.c * y + this.e;
      const ty = this.b * x + this.d * y + this.f;
      if (tx < minX) minX = tx;
      if (tx > maxX) maxX = tx;
      if (ty < minY) minY = ty;
      if (ty > maxY) maxY = ty;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
}

// --- caches (context-independent) ---------------------------------------------------------

const linePaths = new WeakMap<TextLine, Path2D>();
const pathObjects = new WeakMap<PathData, Path2D>();
const pathLengths = new WeakMap<PathData, number>();
const gradientStops = new WeakMap<Gradient, { offsets: number[]; colors: string[] }>();

/** Reused transform argument for `Path2D.addPath` (a DOMMatrix2DInit dictionary). */
const addPathMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function setAddPathMatrix(a: number, b: number, c: number, d: number, e: number, f: number) {
  addPathMatrix.a = a;
  addPathMatrix.b = b;
  addPathMatrix.c = c;
  addPathMatrix.d = d;
  addPathMatrix.e = e;
  addPathMatrix.f = f;
  return addPathMatrix;
}

/** All outline glyphs of a line as one path in block coordinates (static text fast path). */
function linePath(line: TextLine): Path2D {
  let path = linePaths.get(line);
  if (!path) {
    path = new Path2D();
    for (const glyph of line.glyphs) {
      if (!glyph.ink || glyph.fallback) continue;
      const k = glyph.size / glyph.face.upem;
      path.addPath(
        glyphPath(glyph.face, glyph.id),
        setAddPathMatrix(k, 0, 0, -k, line.x + glyph.x, line.baseline + glyph.y),
      );
    }
    linePaths.set(line, path);
  }
  return path;
}

function pathObject(path: PathData): Path2D {
  let object = pathObjects.get(path);
  if (!object) {
    object = new Path2D();
    tracePath(object, path);
    pathObjects.set(path, object);
  }
  return object;
}

function cachedPathLength(path: PathData): number {
  let length = pathLengths.get(path);
  if (length === undefined) {
    length = pathLength(path);
    pathLengths.set(path, length);
  }
  return length;
}

/** Gradient stops expanded with OKLab-interpolated intermediates (canvas mixes in sRGB). */
export function expandGradientStops(gradient: Gradient): { offsets: number[]; colors: string[] } {
  let expanded = gradientStops.get(gradient);
  if (expanded) return expanded;
  const stops = [...gradient.stops]
    .map((stop) => ({ offset: clamp01(stop.offset), color: stop.color }))
    .sort((a, b) => a.offset - b.offset);
  expanded = { offsets: [], colors: [] };
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]!;
    const next = stops[i + 1];
    expanded.offsets.push(stop.offset);
    expanded.colors.push(toCss(stop.color));
    if (!next || next.offset <= stop.offset) continue;
    for (let step = 1; step < GRADIENT_STEPS; step++) {
      const t = step / GRADIENT_STEPS;
      expanded.offsets.push(stop.offset + (next.offset - stop.offset) * t);
      expanded.colors.push(toCss(mixOklab(stop.color, next.color, t)));
    }
  }
  gradientStops.set(gradient, expanded);
  return expanded;
}

function solidOf(fill: Fill): Color {
  return isGradient(fill) ? (fill.stops[0]?.color ?? BLACK) : fill;
}

const clampRadius = (r: Rect, radius: number) =>
  Math.max(0, Math.min(radius, Math.abs(r.w) / 2, Math.abs(r.h) / 2));

// --- the drawer ---------------------------------------------------------------------------

export class CanvasDraw implements Draw {
  private ctx: Canvas2D | null = null;
  private target: DrawTarget | null = null;
  private s = 1;

  // Current state and the saved levels (6 matrix entries + opacity per level).
  private readonly m = new Matrix();
  private opacity = 1;
  private composite: GlobalCompositeOperation = 'source-over';
  private readonly stack = new Float64Array(MAX_DEPTH * 7);
  private readonly composites: GlobalCompositeOperation[] = [];
  private depth = 0;
  /** Outstanding ctx.save() calls (clips), unwound if a render throws. */
  private saves = 0;
  /** Last `ctx.font` we set (setting it re-parses the font string). */
  private font = '';

  private readonly local = new Matrix();
  private readonly glyphMatrix = new Matrix();
  private readonly dash = [0, 0];
  private readonly regions = new Map<string, EditableRegion>();

  get frame(): FrameSpec {
    return this.use().frame;
  }

  get pixel(): number {
    return 1 / this.s;
  }

  /** Starts a frame: resets all state and clears the canvas. */
  begin(target: DrawTarget): void {
    if (this.ctx) {
      for (; this.saves > 0; this.saves--) this.ctx.restore();
    }
    const { ctx } = target;
    this.ctx = ctx;
    this.target = target;
    this.s = target.scale;
    this.m.reset();
    this.opacity = 1;
    this.composite = 'source-over';
    this.depth = 0;
    this.font = '';
    this.regions.clear();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  /** Ends the frame; returns the editor regions (empty unless `collectRegions`). */
  end(): EditableRegion[] {
    this.ctx = null;
    return [...this.regions.values()];
  }

  // --- Draw API ---------------------------------------------------------------------------

  fill(fill: Fill, options?: { background?: boolean }): void {
    const target = this.use();
    if (options?.background && target.transparent) return;
    if (this.opacity < INVISIBLE) return;
    const ctx = target.ctx;
    ctx.setTransform(this.s, 0, 0, this.s, 0, 0);
    ctx.globalAlpha = this.opacity;
    ctx.globalCompositeOperation = this.composite;
    ctx.fillStyle = this.style(fill, 0, 0);
    ctx.fillRect(0, 0, target.frame.width, target.frame.height);
  }

  group(options: GroupOptions, draw: (g: Draw) => void): void {
    const opacity = this.opacity * (options.opacity ?? 1);
    if (opacity < INVISIBLE && !this.target?.collectRegions) return;
    this.push();
    const scale = options.scale ?? 1;
    this.concat(
      this.local.compose(
        options.x ?? 0,
        options.y ?? 0,
        scale * (options.scaleX ?? 1),
        scale * (options.scaleY ?? 1),
        options.rotate ?? 0,
        options.skewX ?? 0,
        options.skewY ?? 0,
        options.originX ?? 0,
        options.originY ?? 0,
      ),
    );
    this.opacity = opacity;
    if (options.blend) this.composite = COMPOSITE[options.blend];
    draw(this);
    this.pop();
  }

  rect(r: Rect, paint: Paint): void {
    if (!this.prepare(paint)) return;
    const ctx = this.use().ctx;
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    this.paint(paint, 2 * (Math.abs(r.w) + Math.abs(r.h)));
  }

  roundRect(r: Rect, radius: number, paint: Paint): void {
    if (!this.prepare(paint)) return;
    const ctx = this.use().ctx;
    const rr = clampRadius(r, radius);
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, rr);
    this.paint(paint, 2 * (Math.abs(r.w) + Math.abs(r.h)) - 8 * rr + 2 * Math.PI * rr);
  }

  circle(cx: number, cy: number, radius: number, paint: Paint): void {
    if (!(radius > 0) || !this.prepare(paint)) return;
    const ctx = this.use().ctx;
    ctx.beginPath();
    // Start at 12 o'clock so trim paths draw on from the top.
    ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI * 1.5);
    this.paint(paint, 2 * Math.PI * radius);
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: Stroke): void {
    if (!this.prepareAlpha(1)) return;
    const ctx = this.use().ctx;
    if (!this.applyStroke(stroke, Math.hypot(x2 - x1, y2 - y1))) return;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  path(path: PathData, paint: Paint): void {
    if (!this.prepare(paint)) return;
    const ctx = this.use().ctx;
    const object = pathObject(path);
    if (paint.fill) {
      ctx.fillStyle = this.style(paint.fill, 0, 0);
      ctx.fill(object);
    }
    if (
      paint.stroke &&
      this.applyStroke(paint.stroke, paint.stroke.trim ? cachedPathLength(path) : 0)
    ) {
      ctx.stroke(object);
    }
  }

  text(text: TextBlock | TextLine, options: TextDrawOptions = NO_OPTIONS): void {
    const opacity = this.opacity * (options.opacity ?? 1);
    if (opacity < INVISIBLE) return;
    const ctx = this.use().ctx;
    ctx.globalCompositeOperation = this.composite;
    // Outline-only text has no fill unless one is given; plain text defaults to black.
    const fill = options.fill ?? (options.outline ? null : BLACK);
    const lines = 'lines' in text ? text.lines : [text];
    if (options.glyph) this.textPerGlyph(lines, fill, options, opacity, options.glyph);
    else this.textStatic(lines, fill, options, opacity);
  }

  image(asset: ImageAsset, dest: Rect, options: ImageOptions = {}): void {
    if (!(asset.width > 0 && asset.height > 0 && dest.w > 0 && dest.h > 0)) return;
    if (!this.prepareAlpha(options.opacity ?? 1)) return;
    const ctx = this.use().ctx;
    const focalX = clamp01(options.focal?.x ?? 0.5);
    const focalY = clamp01(options.focal?.y ?? 0.5);
    const scale =
      options.fit === 'contain'
        ? Math.min(dest.w / asset.width, dest.h / asset.height)
        : Math.max(dest.w / asset.width, dest.h / asset.height);
    // Source rect (cover crops around the focal point) and destination rect (contain letterboxes).
    const sw = Math.min(asset.width, dest.w / scale);
    const sh = Math.min(asset.height, dest.h / scale);
    const sx = (asset.width - sw) * focalX;
    const sy = (asset.height - sh) * focalY;
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = dest.x + (dest.w - dw) * focalX;
    const dy = dest.y + (dest.h - dh) * focalY;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const radius = options.radius ?? 0;
    if (radius > 0) {
      ctx.save();
      ctx.beginPath();
      const box = { x: dx, y: dy, w: dw, h: dh };
      ctx.roundRect(dx, dy, dw, dh, clampRadius(box, radius));
      ctx.clip();
      ctx.drawImage(asset.source, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.restore();
      this.font = '';
    } else {
      ctx.drawImage(asset.source, sx, sy, sw, sh, dx, dy, dw, dh);
    }
  }

  clip(shape: ClipShape, draw: (g: Draw) => void): void {
    if (!this.applyTransform()) return;
    const ctx = this.use().ctx;
    ctx.save();
    this.saves++;
    if ('path' in shape) {
      ctx.clip(pathObject(shape.path));
    } else {
      ctx.beginPath();
      if ('rect' in shape) {
        const r = shape.rect;
        ctx.roundRect(r.x, r.y, r.w, r.h, clampRadius(r, shape.radius));
      } else {
        ctx.rect(shape.x, shape.y, shape.w, shape.h);
      }
      ctx.clip();
    }
    draw(this);
    ctx.restore();
    this.saves--;
    this.font = '';
  }

  movable(id: string, bounds: Rect, draw: (g: Draw) => void): void {
    const target = this.use();
    const offset = target.layout?.[id];
    this.push();
    if (offset && (offset.x !== 0 || offset.y !== 0 || offset.scale !== 1)) {
      const { u } = target.frame;
      this.concat(
        this.local.compose(
          offset.x * u,
          offset.y * u,
          offset.scale,
          offset.scale,
          0,
          0,
          0,
          bounds.x + bounds.w / 2,
          bounds.y + bounds.h / 2,
        ),
      );
    }
    this.register('movable', id, bounds);
    draw(this);
    this.pop();
  }

  editable(controlKey: string, bounds: Rect): void {
    this.register('editable', controlKey, bounds);
  }

  // --- text -------------------------------------------------------------------------------

  private textStatic(
    lines: readonly TextLine[],
    fill: Fill | null,
    options: TextDrawOptions,
    opacity: number,
  ): void {
    const ctx = this.use().ctx;
    const ox = options.x ?? 0;
    const oy = options.y ?? 0;
    const { outline } = options;
    const m = this.glyphMatrix.multiply(this.m, this.local.compose(ox, oy, 1, 1, 0, 0, 0, 0, 0));
    if (!this.setTransform(m)) return;
    ctx.globalAlpha = opacity;
    if (fill) ctx.fillStyle = this.style(fill, ox, oy);
    const stroking = outline ? this.applyStroke(outline, 0) : false;
    for (const line of lines) {
      const path = linePath(line);
      if (fill) ctx.fill(path);
      if (stroking) ctx.stroke(path);
    }
    // Glyphs our fonts lack are drawn with the system fallback font.
    const color = solidOf(fill ?? outline?.color ?? BLACK);
    for (const line of lines) {
      for (const glyph of line.glyphs) {
        if (!glyph.fallback) continue;
        this.local.compose(
          ox + line.x + glyph.x,
          oy + line.baseline + glyph.y,
          1,
          1,
          0,
          0,
          0,
          0,
          0,
        );
        this.fallbackGlyph(glyph, color, opacity);
      }
    }
  }

  private textPerGlyph(
    lines: readonly TextLine[],
    fill: Fill | null,
    options: TextDrawOptions,
    opacity: number,
    animate: (glyph: Glyph, line: TextLine) => GlyphTransform | null,
  ): void {
    const ctx = this.use().ctx;
    const ox = options.x ?? 0;
    const oy = options.y ?? 0;
    const { outline } = options;
    let lastFill: string | CanvasGradient | null = null;
    for (const line of lines) {
      for (const glyph of line.glyphs) {
        if (!glyph.ink && !glyph.fallback) continue; // spaces
        const t = animate(glyph, line);
        if (t === null) continue;
        const alpha = opacity * (t.opacity ?? 1);
        if (alpha < INVISIBLE) continue;
        const scale = t.scale ?? 1;
        this.local.compose(
          ox + line.x + glyph.x + (t.dx ?? 0),
          oy + line.baseline + glyph.y + (t.dy ?? 0),
          scale * (t.scaleX ?? 1),
          scale * (t.scaleY ?? 1),
          t.rotate ?? 0,
          t.skewX ?? 0,
          0,
          t.originX ?? glyph.advance / 2,
          t.originY ?? 0,
        );
        const glyphFill = t.color ?? fill;
        if (glyph.fallback) {
          this.fallbackGlyph(glyph, solidOf(glyphFill ?? outline?.color ?? BLACK), alpha);
          lastFill = null;
          continue;
        }
        const k = glyph.size / glyph.face.upem;
        const outlinePath = glyphPath(glyph.face, glyph.id);
        const l = this.local;
        if (outline || (glyphFill && isGradient(glyphFill))) {
          // Gradients and strokes live in group space: bake the glyph transform into the path.
          const path = new Path2D();
          path.addPath(
            outlinePath,
            setAddPathMatrix(l.a * k, l.b * k, -l.c * k, -l.d * k, l.e, l.f),
          );
          if (!this.setTransform(this.m)) return;
          ctx.globalAlpha = alpha;
          if (glyphFill) {
            ctx.fillStyle = this.style(glyphFill, 0, 0);
            ctx.fill(path);
          }
          if (outline && this.applyStroke(outline, 0)) ctx.stroke(path);
          lastFill = null;
          continue;
        }
        if (!glyphFill) continue;
        // Fast path: glyph transform × font scale (y up → y down), one cached-path fill.
        const g = this.glyphMatrix.multiply(this.m, l);
        g.a *= k;
        g.b *= k;
        g.c *= -k;
        g.d *= -k;
        if (!this.setTransform(g)) continue;
        ctx.globalAlpha = alpha;
        const style = this.style(glyphFill, 0, 0);
        if (style !== lastFill) {
          ctx.fillStyle = style;
          lastFill = style;
        }
        ctx.fill(outlinePath);
      }
    }
  }

  /** Draws a fallback glyph with `fillText`; `this.local` holds its transform. */
  private fallbackGlyph(glyph: Glyph, color: Color, alpha: number): void {
    const ctx = this.use().ctx;
    if (!glyph.fallback || !this.setTransform(this.glyphMatrix.multiply(this.m, this.local)))
      return;
    const font = `${glyph.size}px ${glyph.fallback.font}`;
    if (font !== this.font) {
      ctx.font = font;
      this.font = font;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = toCss(color);
    ctx.fillText(glyph.text, 0, 0);
  }

  // --- state ------------------------------------------------------------------------------

  private use(): DrawTarget {
    if (!this.target || !this.ctx) throw new Error('Draw used outside begin()/end()');
    return this.target;
  }

  private push(): void {
    if (this.depth >= MAX_DEPTH) throw new Error('Draw: groups are nested too deeply');
    const k = this.depth * 7;
    const { stack, m } = this;
    stack[k] = m.a;
    stack[k + 1] = m.b;
    stack[k + 2] = m.c;
    stack[k + 3] = m.d;
    stack[k + 4] = m.e;
    stack[k + 5] = m.f;
    stack[k + 6] = this.opacity;
    this.composites[this.depth] = this.composite;
    this.depth++;
  }

  private pop(): void {
    this.depth--;
    const k = this.depth * 7;
    const { stack, m } = this;
    m.a = stack[k]!;
    m.b = stack[k + 1]!;
    m.c = stack[k + 2]!;
    m.d = stack[k + 3]!;
    m.e = stack[k + 4]!;
    m.f = stack[k + 5]!;
    this.opacity = stack[k + 6]!;
    this.composite = this.composites[this.depth]!;
  }

  private concat(local: Matrix): void {
    this.m.multiply(this.m, local);
  }

  /** Sets the canvas transform to output scale × `m`; false (draw nothing) if not finite. */
  private setTransform(m: Matrix): boolean {
    const s = this.s;
    const { a, b, c, d, e, f } = m;
    if (!Number.isFinite(a + b + c + d + e + f)) return false;
    this.use().ctx.setTransform(a * s, b * s, c * s, d * s, e * s, f * s);
    return true;
  }

  private applyTransform(): boolean {
    return this.setTransform(this.m);
  }

  private prepare(paint: Paint): boolean {
    if (!paint.fill && !paint.stroke) return false;
    return this.prepareAlpha(paint.opacity ?? 1);
  }

  private prepareAlpha(opacity: number): boolean {
    const alpha = this.opacity * opacity;
    if (alpha < INVISIBLE || !this.applyTransform()) return false;
    const ctx = this.use().ctx;
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = this.composite;
    return true;
  }

  /** Fills and/or strokes the current path. */
  private paint(paint: Paint, length: number): void {
    const ctx = this.use().ctx;
    if (paint.fill) {
      ctx.fillStyle = this.style(paint.fill, 0, 0);
      ctx.fill();
    }
    if (paint.stroke && this.applyStroke(paint.stroke, length)) ctx.stroke();
  }

  /** Configures stroke state; false when nothing would be visible. */
  private applyStroke(stroke: Stroke, length: number): boolean {
    if (!(stroke.width > 0)) return false;
    const ctx = this.use().ctx;
    ctx.strokeStyle = toCss(stroke.color);
    ctx.lineWidth = stroke.width;
    ctx.lineCap = stroke.cap ?? 'butt';
    ctx.lineJoin = stroke.join ?? 'miter';
    const { trim } = stroke;
    if (trim) {
      const start = clamp01(Math.min(trim[0], trim[1]));
      const end = clamp01(Math.max(trim[0], trim[1]));
      const visible = (end - start) * length;
      if (!(visible > 0)) return false;
      if (end - start >= 1) {
        ctx.setLineDash(NO_DASH);
      } else {
        // One dash of the visible length, then a gap longer than the whole path.
        this.dash[0] = visible;
        this.dash[1] = length + 1;
        ctx.setLineDash(this.dash);
        ctx.lineDashOffset = -start * length;
        return true;
      }
    } else {
      ctx.setLineDash(stroke.dash ?? NO_DASH);
    }
    ctx.lineDashOffset = 0;
    return true;
  }

  /** Canvas paint for a fill; gradients are shifted by (−dx, −dy) to stay in group space. */
  private style(fill: Fill, dx: number, dy: number): string | CanvasGradient {
    if (!isGradient(fill)) return toCss(fill);
    const ctx = this.use().ctx;
    const gradient =
      fill.kind === 'linear'
        ? ctx.createLinearGradient(fill.x0 - dx, fill.y0 - dy, fill.x1 - dx, fill.y1 - dy)
        : ctx.createRadialGradient(
            (fill.fx ?? fill.cx) - dx,
            (fill.fy ?? fill.cy) - dy,
            Math.max(0, fill.fr ?? 0),
            fill.cx - dx,
            fill.cy - dy,
            Math.max(0, fill.r),
          );
    const { offsets, colors } = expandGradientStops(fill);
    for (let i = 0; i < offsets.length; i++) {
      gradient.addColorStop(offsets[i]!, colors[i]!);
    }
    return gradient;
  }

  private register(kind: EditableKind, target: string, bounds: Rect): void {
    if (!this.target?.collectRegions) return;
    const id = `${kind}:${target}`;
    const box = this.m.bounds(bounds);
    const existing = this.regions.get(id);
    if (existing) {
      const x = Math.min(existing.bounds.x, box.x);
      const y = Math.min(existing.bounds.y, box.y);
      existing.bounds = {
        x,
        y,
        w: Math.max(existing.bounds.x + existing.bounds.w, box.x + box.w) - x,
        h: Math.max(existing.bounds.y + existing.bounds.h, box.y + box.h) - y,
      };
    } else {
      this.regions.set(id, { id, kind, target, bounds: box });
    }
  }
}
