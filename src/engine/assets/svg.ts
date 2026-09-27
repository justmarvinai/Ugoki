/**
 * SVG import (docs/06-engine.md §8): SVG files become vector artwork — flat-filled paths in the
 * engine's own format — so logos stay crisp at 4K and effects can mask light to their shape.
 *
 * Supported: paths, basic shapes, groups, `use`, transforms, presentation attributes, inline
 * styles, simple `<style>` rules (Illustrator/Figma exports), opacity, fill rules, strokes and an
 * artboard clip-path. Anything else that is actually painted (gradients, filters, masks, text,
 * embedded images…) makes the import report `unsupported`; the editor then rasterizes the
 * sanitized file instead (`sanitizeSvg`) and vector-only effects use their raster variants.
 *
 * Nothing here touches the DOM, runs code from the file or fetches anything.
 */

import { type Color, parseHex } from '../core/color';
import { clamp01, type Rect, unionRect } from '../core/math';
import type { PathCommand, PathData } from '../draw/types';
import {
  type Affine,
  affineScale,
  IDENTITY,
  multiply,
  parseNumbers,
  parsePathData,
  parseTransform,
  pathBounds,
  transformPath,
} from './path-data';
import type { ShapePaint, VectorGraphic, VectorShape } from './types';
import { parseXml, type XmlElement, XmlError } from './xml';

export type SvgImport =
  | { ok: true; graphic: VectorGraphic; warnings: string[] }
  | { ok: false; reason: 'invalid' | 'unsupported' | 'empty'; detail: string };

// --- colors ----------------------------------------------------------------------------------

const NAMED = new Map<string, string>();
{
  const table =
    'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc ' +
    'bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a ' +
    'burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 ' +
    'cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b ' +
    'darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 ' +
    'darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc ' +
    'darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f ' +
    'darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff ' +
    'dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 ' +
    'forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 ' +
    'goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 ' +
    'hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa ' +
    'lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 ' +
    'lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 ' +
    'lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa ' +
    'lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 ' +
    'limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa ' +
    'mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 ' +
    'mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 ' +
    'midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead ' +
    'navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 ' +
    'orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 ' +
    'papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 ' +
    'purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 ' +
    'saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee ' +
    'sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 ' +
    'snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 ' +
    'tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 ' +
    'yellow ffff00 yellowgreen 9acd32';
  const parts = table.split(' ');
  for (let i = 0; i + 1 < parts.length; i += 2)
    NAMED.set(parts[i] as string, parts[i + 1] as string);
}

/** Paint parse result: a paint, `inherit`, or `url` (a paint server we can't express). */
type PaintValue = ShapePaint | 'inherit' | 'url';

function channel(text: string, max: number): number {
  const t = text.trim();
  const v = t.endsWith('%') ? (Number.parseFloat(t) / 100) * max : Number.parseFloat(t);
  return Number.isFinite(v) ? Math.min(max, Math.max(0, v)) / max : Number.NaN;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Parses a CSS/SVG color value. */
export function parseColor(value: string): PaintValue | undefined {
  const v = value.trim().toLowerCase();
  if (v === '') return undefined;
  if (v === 'none' || v === 'transparent') return null;
  if (v === 'currentcolor') return 'current';
  if (v === 'inherit') return 'inherit';
  if (v.startsWith('url(')) return 'url';
  if (v[0] === '#') {
    try {
      return parseHex(v);
    } catch {
      return undefined;
    }
  }
  const named = NAMED.get(v);
  if (named) return parseHex(named);
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(v);
  if (!fn) return undefined;
  const args = (fn[2] as string)
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (args.length < 3) return undefined;
  const alpha = args[3] !== undefined ? channel(args[3], args[3].endsWith('%') ? 100 : 1) : 1;
  let r: number;
  let g: number;
  let b: number;
  if ((fn[1] as string).startsWith('rgb')) {
    r = channel(args[0] as string, 255);
    g = channel(args[1] as string, 255);
    b = channel(args[2] as string, 255);
  } else {
    const h = Number.parseFloat(args[0] as string);
    const s = channel(args[1] as string, 100);
    const l = channel(args[2] as string, 100);
    if (!Number.isFinite(h)) return undefined;
    [r, g, b] = hslToRgb(((h % 360) + 360) % 360, s, l);
  }
  if ([r, g, b, alpha].some(Number.isNaN)) return undefined;
  return { r, g, b, a: alpha };
}

// --- styles ----------------------------------------------------------------------------------

type Declarations = Map<string, string>;

type Rule = { selectors: SimpleSelector[]; declarations: Declarations; order: number };

type SimpleSelector = {
  tag: string | null;
  id: string | null;
  classes: string[];
  specificity: number;
};

/** Parses `a: b; c: d` declarations (lowercased property names). */
function parseDeclarations(text: string): Declarations {
  const out: Declarations = new Map();
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important/i, '')
      .trim();
    if (name && value) out.set(name, value);
  }
  return out;
}

function parseSelector(text: string): SimpleSelector | null {
  const s = text.trim();
  // Only compound selectors without combinators: tag, #id, .class and combinations.
  if (!s || /[\s>+~[:*]/.test(s)) return null;
  const match = /^([a-z][a-z0-9-]*)?((?:[#.][\w-]+)*)$/i.exec(s);
  if (!match) return null;
  const tag = match[1]?.toLowerCase() ?? null;
  let id: string | null = null;
  const classes: string[] = [];
  for (const part of (match[2] ?? '').match(/[#.][\w-]+/g) ?? []) {
    if (part[0] === '#') id = part.slice(1);
    else classes.push(part.slice(1));
  }
  return {
    tag,
    id,
    classes,
    specificity: (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0),
  };
}

/** Parses the simple CSS found in exported SVGs; at-rules and complex selectors are skipped. */
function parseStylesheet(css: string, order: { n: number }): Rule[] {
  const rules: Rule[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    // Find the matching close brace (at-rules like @media nest blocks).
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    const body = text.slice(open + 1, j - 1);
    i = j;
    if (prelude.startsWith('@')) continue;
    const selectors = prelude
      .split(',')
      .map(parseSelector)
      .filter((s): s is SimpleSelector => s !== null);
    if (selectors.length > 0) {
      rules.push({ selectors, declarations: parseDeclarations(body), order: order.n++ });
    }
  }
  return rules;
}

function matches(selector: SimpleSelector, element: XmlElement): boolean {
  if (selector.tag && selector.tag !== element.name) return false;
  if (selector.id && element.attributes.get('id') !== selector.id) return false;
  if (selector.classes.length > 0) {
    const classes = (element.attributes.get('class') ?? '').split(/\s+/);
    if (!selector.classes.every((c) => classes.includes(c))) return false;
  }
  return true;
}

// --- rendering state -------------------------------------------------------------------------

type Inherited = {
  fill: ShapePaint | 'url';
  fillOpacity: number;
  fillRule: 'nonzero' | 'evenodd';
  stroke: ShapePaint | 'url';
  strokeOpacity: number;
  strokeWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  visible: boolean;
  /** The CSS `color` property (resolves `currentColor`); null keeps it as the drawer's color. */
  color: Color | null;
};

const INITIAL: Inherited = {
  fill: { r: 0, g: 0, b: 0, a: 1 },
  fillOpacity: 1,
  fillRule: 'nonzero',
  stroke: null,
  strokeOpacity: 1,
  strokeWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  visible: true,
  color: null,
};

const NON_RENDERING = new Set([
  'defs',
  'symbol',
  'clippath',
  'mask',
  'pattern',
  'marker',
  'lineargradient',
  'radialgradient',
  'filter',
  'title',
  'desc',
  'metadata',
  'style',
  'script',
  'font',
  'font-face',
]);

/** Painted content we can't express as flat vector shapes. */
const UNSUPPORTED_ELEMENTS = new Set(['text', 'image', 'foreignobject', 'video', 'switch']);

/** An opacity-like value (`0.5` or `50%`), clamped to 0..1; `fallback` if absent or invalid. */
function fraction(value: string | undefined, fallback: number): number {
  if (value === undefined || value === 'inherit') return fallback;
  const v = value.trim();
  const n = v.endsWith('%') ? Number.parseFloat(v) / 100 : Number.parseFloat(v);
  return Number.isFinite(n) ? clamp01(n) : fallback;
}

const LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px)?$/i;

function length(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const match = LENGTH.exec(value.trim());
  return match ? Number(match[1]) : fallback;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathData {
  const k = 0.5522847498;
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry],
    ['C', cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy],
    ['C', cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry],
    ['C', cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy],
    ['Z'],
  ];
}

function rectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  rxIn: number,
  ryIn: number,
): PathData {
  let rx = Math.min(Math.abs(rxIn), w / 2);
  let ry = Math.min(Math.abs(ryIn), h / 2);
  if (rx === 0 || ry === 0) {
    rx = 0;
    ry = 0;
  }
  if (rx === 0) {
    return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  }
  const k = 0.5522847498;
  const kx = rx * k;
  const ky = ry * k;
  return [
    ['M', x + rx, y],
    ['L', x + w - rx, y],
    ['C', x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry],
    ['L', x + w, y + h - ry],
    ['C', x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h],
    ['L', x + rx, y + h],
    ['C', x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry],
    ['L', x, y + ry],
    ['C', x, y + ry - ky, x + rx - kx, y, x + rx, y],
    ['Z'],
  ];
}

function pointsPath(points: string, close: boolean): PathData {
  const n = parseNumbers(points);
  const out: PathCommand[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) {
    out.push([i === 0 ? 'M' : 'L', n[i] as number, n[i + 1] as number]);
  }
  if (close && out.length > 0) out.push(['Z']);
  return out;
}

class Importer {
  readonly shapes: VectorShape[] = [];
  readonly warnings = new Set<string>();
  unsupported: string | null = null;
  private readonly ids = new Map<string, XmlElement>();
  private readonly rules: Rule[] = [];
  private useDepth = 0;

  constructor(private readonly root: XmlElement) {
    const order = { n: 0 };
    const visit = (element: XmlElement) => {
      const id = element.attributes.get('id');
      if (id && !this.ids.has(id)) this.ids.set(id, element);
      if (element.name === 'style') this.rules.push(...parseStylesheet(element.text, order));
      for (const child of element.children) visit(child);
    };
    visit(root);
  }

  /** Cascaded declarations: presentation attributes < stylesheet (by specificity) < `style`. */
  private declarations(element: XmlElement): Declarations {
    const out: Declarations = new Map();
    for (const [name, value] of element.attributes) out.set(name, value);
    const matched: { specificity: number; order: number; declarations: Declarations }[] = [];
    for (const rule of this.rules) {
      let best = -1;
      for (const selector of rule.selectors) {
        if (matches(selector, element)) best = Math.max(best, selector.specificity);
      }
      if (best >= 0)
        matched.push({ specificity: best, order: rule.order, declarations: rule.declarations });
    }
    matched.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    for (const m of matched) for (const [k, v] of m.declarations) out.set(k, v);
    const inline = element.attributes.get('style');
    if (inline) for (const [k, v] of parseDeclarations(inline)) out.set(k, v);
    return out;
  }

  private inherit(parent: Inherited, d: Declarations): Inherited {
    const next: Inherited = { ...parent };
    const color = d.get('color');
    if (color !== undefined) {
      const c = parseColor(color);
      if (c && typeof c === 'object') next.color = c;
    }
    const paint = (value: string | undefined, current: ShapePaint | 'url') => {
      if (value === undefined) return current;
      const p = parseColor(value);
      if (p === undefined || p === 'inherit') return current;
      if (p === 'current') return next.color ?? 'current';
      return p;
    };
    next.fill = paint(d.get('fill'), parent.fill);
    next.stroke = paint(d.get('stroke'), parent.stroke);
    next.fillOpacity = fraction(d.get('fill-opacity'), parent.fillOpacity);
    next.strokeOpacity = fraction(d.get('stroke-opacity'), parent.strokeOpacity);
    const width = d.get('stroke-width');
    if (width !== undefined && width !== 'inherit')
      next.strokeWidth = Math.max(0, length(width, parent.strokeWidth));
    const rule = d.get('fill-rule');
    if (rule === 'evenodd' || rule === 'nonzero') next.fillRule = rule;
    const cap = d.get('stroke-linecap');
    if (cap === 'butt' || cap === 'round' || cap === 'square') next.lineCap = cap;
    const join = d.get('stroke-linejoin');
    if (join === 'miter' || join === 'round' || join === 'bevel') next.lineJoin = join;
    const visibility = d.get('visibility');
    if (visibility === 'hidden' || visibility === 'collapse') next.visible = false;
    else if (visibility === 'visible') next.visible = true;
    return next;
  }

  /** True if `clip-path` only trims empty margins (an artboard clip), so it can be ignored. */
  private artboardClip(value: string, content: Rect | null, ctm: Affine): boolean {
    const id = /url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(value)?.[1];
    const clip = id ? this.ids.get(id) : undefined;
    if (clip?.name !== 'clippath') return false;
    const shapes = clip.children.filter((c) => !NON_RENDERING.has(c.name));
    if (shapes.length !== 1) return false;
    const shape = shapes[0] as XmlElement;
    const geometry = this.geometry(shape);
    if (!geometry) return false;
    const local = parseTransform(shape.attributes.get('transform') ?? '') ?? IDENTITY;
    const bounds = pathBounds(transformPath(geometry, multiply(ctm, local)));
    if (!bounds || !content) return Boolean(bounds);
    const eps = Math.max(bounds.w, bounds.h) * 1e-3;
    return (
      content.x >= bounds.x - eps &&
      content.y >= bounds.y - eps &&
      content.x + content.w <= bounds.x + bounds.w + eps &&
      content.y + content.h <= bounds.y + bounds.h + eps
    );
  }

  private geometry(element: XmlElement): PathData | null {
    const a = element.attributes;
    switch (element.name) {
      case 'path':
        return parsePathData(a.get('d') ?? '');
      case 'rect': {
        const w = length(a.get('width'));
        const h = length(a.get('height'));
        if (!(w > 0 && h > 0)) return null;
        const rxAttr = a.get('rx');
        const ryAttr = a.get('ry');
        const rx = length(rxAttr ?? ryAttr);
        const ry = length(ryAttr ?? rxAttr);
        return rectPath(length(a.get('x')), length(a.get('y')), w, h, rx, ry);
      }
      case 'circle': {
        const r = length(a.get('r'));
        return r > 0 ? ellipsePath(length(a.get('cx')), length(a.get('cy')), r, r) : null;
      }
      case 'ellipse': {
        const rx = length(a.get('rx'));
        const ry = length(a.get('ry'));
        return rx > 0 && ry > 0
          ? ellipsePath(length(a.get('cx')), length(a.get('cy')), rx, ry)
          : null;
      }
      case 'line':
        return [
          ['M', length(a.get('x1')), length(a.get('y1'))],
          ['L', length(a.get('x2')), length(a.get('y2'))],
        ];
      case 'polyline':
        return pointsPath(a.get('points') ?? '', false);
      case 'polygon':
        return pointsPath(a.get('points') ?? '', true);
      default:
        return null;
    }
  }

  /** Walks an element; `opacity` multiplies down the tree (per-shape group opacity). */
  walk(element: XmlElement, parent: Inherited, ctm: Affine, opacity: number): void {
    if (this.unsupported) return;
    const name = element.name;
    if (NON_RENDERING.has(name)) return;
    const d = this.declarations(element);
    if (d.get('display') === 'none') return;

    const transform = d.get('transform');
    let m = ctm;
    if (transform) {
      const t = parseTransform(transform);
      if (!t) {
        this.unsupported = `Unsupported transform "${transform.slice(0, 40)}"`;
        return;
      }
      m = multiply(ctm, t);
    }
    const style = this.inherit(parent, d);
    const alpha = opacity * fraction(d.get('opacity'), 1);

    for (const attribute of ['filter', 'mask']) {
      const value = d.get(attribute);
      if (value && value !== 'none') {
        this.unsupported = `Uses ${attribute}`;
        return;
      }
    }
    const clip = d.get('clip-path');
    const clipped = clip && clip !== 'none' ? clip : null;

    if (UNSUPPORTED_ELEMENTS.has(name)) {
      this.unsupported = `Contains <${name}>`;
      return;
    }

    const start = this.shapes.length;
    if (name === 'svg' || name === 'g' || name === 'a') {
      let inner = m;
      if (name === 'svg' && element !== this.root) {
        inner = multiply(m, [1, 0, 0, 1, length(d.get('x')), length(d.get('y'))]);
      }
      for (const child of element.children) this.walk(child, style, inner, alpha);
    } else if (name === 'use') {
      const href = d.get('href') ?? '';
      const target = href.startsWith('#') ? this.ids.get(href.slice(1)) : undefined;
      if (!target) {
        if (href) this.warnings.add('Skipped a reference to another file');
        return;
      }
      if (this.useDepth >= 8) {
        this.unsupported = 'References are nested too deeply';
        return;
      }
      const translated = multiply(m, [1, 0, 0, 1, length(d.get('x')), length(d.get('y'))]);
      this.useDepth++;
      if (target.name === 'symbol') {
        for (const child of target.children) this.walk(child, style, translated, alpha);
      } else {
        this.walk(target, style, translated, alpha);
      }
      this.useDepth--;
    } else {
      const geometry = this.geometry(element);
      if (!geometry || geometry.length === 0 || !style.visible) return;
      const { fill: fillPaint, stroke: strokePaint } = style;
      if (fillPaint === 'url' || strokePaint === 'url') {
        this.unsupported = 'Uses gradients or patterns';
        return;
      }
      // Lines are never filled; open polylines are (SVG fills them as if closed).
      const fill = name === 'line' || style.fillOpacity <= 0 ? null : fillPaint;
      const strokeWidth = style.strokeWidth * affineScale(m);
      const stroke =
        strokePaint !== null && strokeWidth > 0 && style.strokeOpacity > 0 ? strokePaint : null;
      if (fill === null && stroke === null) return;
      if (d.has('stroke-dasharray') && stroke) this.warnings.add('Dashed strokes are drawn solid');
      this.shapes.push({
        path: transformPath(geometry, m),
        fill,
        fillRule: style.fillRule,
        fillOpacity: style.fillOpacity,
        stroke,
        strokeWidth,
        strokeOpacity: style.strokeOpacity,
        lineCap: style.lineCap,
        lineJoin: style.lineJoin,
        opacity: alpha,
      });
    }

    if (clipped && !this.unsupported) {
      const added = this.shapes.slice(start);
      const content = inkOf(added);
      if (!this.artboardClip(clipped, content, m)) {
        this.unsupported = 'Uses a clip path';
      }
    }
  }
}

function inkOf(shapes: readonly VectorShape[]): Rect | null {
  let ink: Rect | null = null;
  for (const shape of shapes) {
    const bounds = pathBounds(shape.path);
    if (!bounds) continue;
    const pad = shape.stroke ? shape.strokeWidth / 2 : 0;
    const padded = {
      x: bounds.x - pad,
      y: bounds.y - pad,
      w: bounds.w + pad * 2,
      h: bounds.h + pad * 2,
    };
    ink = ink ? unionRect(ink, padded) : padded;
  }
  return ink;
}

/** Imports an SVG document as vector artwork. */
export function importSvg(source: string): SvgImport {
  let root: XmlElement;
  try {
    root = parseXml(source);
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid',
      detail: error instanceof XmlError ? error.message : 'Unreadable file',
    };
  }
  if (root.name !== 'svg') return { ok: false, reason: 'invalid', detail: 'Not an SVG file' };

  const importer = new Importer(root);
  importer.walk(root, INITIAL, IDENTITY, 1);
  if (importer.unsupported) {
    return { ok: false, reason: 'unsupported', detail: importer.unsupported };
  }
  const ink = inkOf(importer.shapes);
  if (!ink || !(ink.w > 0 || ink.h > 0)) {
    return { ok: false, reason: 'empty', detail: 'The file has nothing to draw' };
  }
  const viewBox = parseNumbers(root.attributes.get('viewbox') ?? '');
  const width = length(root.attributes.get('width'));
  const height = length(root.attributes.get('height'));
  const box: Rect =
    viewBox.length === 4 && (viewBox[2] as number) > 0 && (viewBox[3] as number) > 0
      ? {
          x: viewBox[0] as number,
          y: viewBox[1] as number,
          w: viewBox[2] as number,
          h: viewBox[3] as number,
        }
      : width > 0 && height > 0
        ? { x: 0, y: 0, w: width, h: height }
        : ink;
  return {
    ok: true,
    graphic: { kind: 'vector', box, ink, shapes: importer.shapes },
    warnings: [...importer.warnings],
  };
}

// --- sanitizing (for rasterization) ------------------------------------------------------------

/** SVG names are case-sensitive; the parser lowercases them, so restore the camelCase ones. */
const CAMEL: Readonly<Record<string, string>> = Object.fromEntries(
  [
    'linearGradient',
    'radialGradient',
    'clipPath',
    'textPath',
    'feGaussianBlur',
    'feOffset',
    'feBlend',
    'feColorMatrix',
    'feComposite',
    'feFlood',
    'feMerge',
    'feMergeNode',
    'feMorphology',
    'feDropShadow',
    'feTurbulence',
    'feDisplacementMap',
    'feComponentTransfer',
    'feFuncR',
    'feFuncG',
    'feFuncB',
    'feFuncA',
    'feTile',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feSpecularLighting',
    'feDistantLight',
    'fePointLight',
    'feSpotLight',
    'viewBox',
    'gradientUnits',
    'gradientTransform',
    'patternUnits',
    'patternTransform',
    'patternContentUnits',
    'clipPathUnits',
    'maskUnits',
    'maskContentUnits',
    'preserveAspectRatio',
    'stdDeviation',
    'spreadMethod',
    'filterUnits',
    'primitiveUnits',
    'pathLength',
    'textLength',
    'lengthAdjust',
    'startOffset',
    'baseFrequency',
    'numOctaves',
    'stitchTiles',
    'tableValues',
    'kernelMatrix',
    'kernelUnitLength',
    'edgeMode',
    'surfaceScale',
    'specularExponent',
    'specularConstant',
    'diffuseConstant',
    'xChannelSelector',
    'yChannelSelector',
    'limitingConeAngle',
    'pointsAtX',
    'pointsAtY',
    'pointsAtZ',
    'refX',
    'refY',
  ].map((name) => [name.toLowerCase(), name]),
);

const SAFE_ELEMENTS = new Set([
  ...['svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line'],
  ...[
    'polyline',
    'polygon',
    'stop',
    'mask',
    'pattern',
    'text',
    'tspan',
    'style',
    'filter',
    'image',
  ],
  ...Object.keys(CAMEL).filter((name) => /^(fe|linear|radial|clip|textpath)/.test(name)),
]);

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i;

function safeAttribute(element: string, name: string, value: string): boolean {
  if (name.startsWith('on')) return false;
  if (/javascript:|vbscript:|data:text/i.test(value)) return false;
  if (name === 'href') {
    if (element === 'image') return SAFE_DATA_IMAGE.test(value);
    return value.startsWith('#');
  }
  // url(...) may only point inside the document.
  const urls = value.match(/url\(([^)]*)\)/gi) ?? [];
  return urls.every((u) => /url\(\s*['"]?#/i.test(u));
}

/**
 * Re-serializes an SVG with only known-safe elements and attributes (no scripts, event
 * handlers, foreign content or external references), sized to `width` × `height` for
 * rasterization. Returns null if the file can't be parsed.
 */
export function sanitizeSvg(
  source: string,
  size?: { width: number; height: number },
): string | null {
  let root: XmlElement;
  try {
    root = parseXml(source);
  } catch {
    return null;
  }
  if (root.name !== 'svg') return null;
  const write = (element: XmlElement, isRoot: boolean): string => {
    if (!SAFE_ELEMENTS.has(element.name)) return '';
    const tag = CAMEL[element.name] ?? element.name;
    let out = `<${tag}`;
    if (isRoot) out += ' xmlns="http://www.w3.org/2000/svg"';
    for (const [rawName, value] of element.attributes) {
      if (rawName.startsWith('xmlns')) continue;
      if (isRoot && size && (rawName === 'width' || rawName === 'height')) continue;
      if (!safeAttribute(element.name, rawName, value)) continue;
      const name = CAMEL[rawName] ?? rawName;
      out += ` ${name}="${escapeAttribute(value)}"`;
    }
    if (isRoot && size) out += ` width="${size.width}" height="${size.height}"`;
    out += '>';
    if (element.name === 'style') {
      // Drop anything that could load resources from stylesheets.
      out += escapeText(
        element.text.replace(/@import[^;]*;?/gi, '').replace(/url\((?!\s*['"]?#)[^)]*\)/gi, 'none'),
      );
    } else if (element.name === 'text' || element.name === 'tspan') {
      out += escapeText(element.text);
    }
    for (const child of element.children) out += write(child, false);
    return `${out}</${tag}>`;
  };
  return write(root, true);
}
