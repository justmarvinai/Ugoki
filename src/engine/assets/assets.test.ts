import { describe, expect, it } from 'vitest';
import type { PathData } from '../draw/types';
import { parsePathData, parseTransform, pathBounds, transformPath } from './path-data';
import { importSvg, parseColor, sanitizeSvg } from './svg';
import type { VectorGraphic } from './types';
import { parseXml, XmlError } from './xml';

const round = (path: PathData) =>
  path.map((cmd) => cmd.map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));

const ok = (source: string): VectorGraphic => {
  const result = importSvg(source);
  if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`);
  return result.graphic;
};

describe('xml', () => {
  it('parses elements, attributes, entities, CDATA and namespaces', () => {
    const root = parseXml(
      `<?xml version="1.0"?><!-- c --><!DOCTYPE svg [<!ENTITY x "boom">]>
       <svg:svg xmlns:svg="http://www.w3.org/2000/svg" width='10' data-a=b>
         <svg:style><![CDATA[.a{fill:red}]]></svg:style>
         <g id="g1" title="a &amp; b &#x41;&#66; &x;"/>
       </svg:svg>`,
    );
    expect(root.name).toBe('svg');
    expect(root.attributes.get('width')).toBe('10');
    expect(root.attributes.get('data-a')).toBe('b');
    expect(root.children[0]?.text).toBe('.a{fill:red}');
    // Custom entities are never expanded.
    expect(root.children[1]?.attributes.get('title')).toBe('a & b AB &x;');
  });

  it('maps xlink:href to href', () => {
    const root = parseXml('<svg><use xlink:href="#a"/></svg>');
    expect(root.children[0]?.attributes.get('href')).toBe('#a');
  });

  it('rejects malformed and oversized input', () => {
    expect(() => parseXml('<svg><g></svg>')).toThrow(XmlError);
    expect(() => parseXml('<svg>')).toThrow(XmlError);
    expect(() => parseXml('<a/><b/>')).toThrow(XmlError);
    expect(() =>
      parseXml('<svg><g/><g/><g/></svg>', { maxLength: 1000, maxElements: 3, maxDepth: 8 }),
    ).toThrow(/Too many/);
    expect(() =>
      parseXml('<a><a><a><a/></a></a></a>', { maxLength: 1000, maxElements: 100, maxDepth: 2 }),
    ).toThrow(/nested/);
  });
});

describe('path data', () => {
  it('parses absolute and relative commands with compact numbers', () => {
    expect(round(parsePathData('M10-20L.5.5h10v-5l1 1z m1 1'))).toEqual([
      ['M', 10, -20],
      ['L', 0.5, 0.5],
      ['L', 10.5, 0.5],
      ['L', 10.5, -4.5],
      ['L', 11.5, -3.5],
      ['Z'],
      ['M', 11, -19],
    ]);
  });

  it('treats extra pairs after M as line-tos', () => {
    expect(parsePathData('M0 0 10 0 10 10')).toEqual([
      ['M', 0, 0],
      ['L', 10, 0],
      ['L', 10, 10],
    ]);
    expect(parsePathData('m1 1 1 0')).toEqual([
      ['M', 1, 1],
      ['L', 2, 1],
    ]);
  });

  it('reflects control points for S and T', () => {
    const path = parsePathData('M0 0C0 10 10 10 10 0S20-10 20 0Q25 5 30 0T40 0');
    expect(path[2]).toEqual(['C', 10, -10, 20, -10, 20, 0]);
    expect(path[4]).toEqual(['Q', 35, -5, 40, 0]);
  });

  it('converts arcs to cubics that end exactly on the endpoint', () => {
    const path = parsePathData('M0 0a10 10 0 1 1 20 0A10 10 0 0 0 0 0');
    const last = path[path.length - 1];
    expect(last?.[0]).toBe('C');
    expect(last?.slice(-2)).toEqual([0, 0]);
    const bounds = pathBounds(parsePathData('M0 0a10 10 0 1 1 20 0a10 10 0 1 1 -20 0'));
    expect(bounds?.w).toBeCloseTo(20, 1);
    expect(bounds?.h).toBeCloseTo(20, 1);
  });

  it('accepts compact arc flags', () => {
    const a = parsePathData('M0 0a5 5 0 1 0 10 0');
    const b = parsePathData('M0 0a5 5 0 1010 0');
    expect(round(b)).toEqual(round(a));
  });

  it('keeps the valid prefix of malformed data', () => {
    expect(parsePathData('M0 0L10 10L20')).toEqual([
      ['M', 0, 0],
      ['L', 10, 10],
    ]);
    expect(parsePathData('10 10')).toEqual([]);
  });

  it('parses transforms and applies them to paths', () => {
    const m = parseTransform('translate(10 20) scale(2) rotate(90)');
    expect(m).not.toBeNull();
    const moved = transformPath([['M', 1, 0]], m ?? [1, 0, 0, 1, 0, 0]);
    expect(round(moved)).toEqual([['M', 10, 22]]);
    expect(parseTransform('perspective(2)')).toBeNull();
    expect(parseTransform('matrix(1 0 0)')).toBeNull();
    expect(parseTransform('rotate(180 5 5)')?.map((v) => Math.round(v))).toEqual([
      -1, 0, -0, -1, 10, 10,
    ]);
  });
});

describe('colors', () => {
  it('parses the forms SVG files use', () => {
    expect(parseColor('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseColor('rgb(0, 255, 0)')).toEqual({ r: 0, g: 1, b: 0, a: 1 });
    expect(parseColor('rgba(0 0 255 / 50%)')).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
    expect(parseColor('hsl(0, 100%, 50%)')).toMatchObject({ r: 1, g: 0, b: 0 });
    expect(parseColor('WhiteSmoke')).toMatchObject({ r: 245 / 255 });
    expect(parseColor('none')).toBeNull();
    expect(parseColor('currentColor')).toBe('current');
    expect(parseColor('url(#grad)')).toBe('url');
    expect(parseColor('nonsense')).toBeUndefined();
  });
});

describe('svg import', () => {
  it('imports shapes with fills, strokes, transforms and opacity', () => {
    const graphic = ok(`
      <svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
        <g opacity=".5" transform="translate(10 0)">
          <rect x="0" y="0" width="20" height="10" fill="#123456"/>
          <circle cx="50" cy="25" r="10" fill="none" stroke="red" stroke-width="2" opacity="50%"/>
        </g>
        <line x1="0" y1="0" x2="10" y2="0" stroke="black" transform="scale(3)"/>
      </svg>`);
    expect(graphic.box).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(graphic.shapes).toHaveLength(3);
    const [rect, circle, line] = graphic.shapes;
    expect(rect?.fill).toMatchObject({ r: 0x12 / 255 });
    expect(rect?.opacity).toBe(0.5);
    expect(rect?.path[0]).toEqual(['M', 10, 0]);
    expect(circle?.fill).toBeNull();
    expect(circle?.strokeWidth).toBe(2);
    expect(circle?.opacity).toBe(0.25);
    expect(line?.fill).toBeNull();
    expect(line?.strokeWidth).toBe(3);
    // Ink covers everything painted (stroke half-width included).
    expect(graphic.ink.x).toBeCloseTo(-1.5, 5);
    expect(graphic.ink.x + graphic.ink.w).toBeCloseTo(71, 1);
  });

  it('applies <style> classes, inline styles and specificity like Illustrator exports', () => {
    const graphic = ok(`
      <svg viewBox="0 0 10 10">
        <defs><style>.cls-1{fill:#231f20;} path.cls-2 { fill: #ff0000 } #hero{fill:blue}
          @media print { .cls-1 { fill: green } } g .cls-1 { fill: pink }</style></defs>
        <path class="cls-1" d="M0 0h1v1z"/>
        <path class="cls-1 cls-2" fill="#00ff00" d="M0 0h1v1z"/>
        <path id="hero" class="cls-2" d="M0 0h1v1z"/>
        <path class="cls-2" style="fill: white" d="M0 0h1v1z"/>
      </svg>`);
    const fills = graphic.shapes.map((s) => s.fill);
    expect(fills[0]).toMatchObject({ r: 0x23 / 255 });
    expect(fills[1]).toEqual({ r: 1, g: 0, b: 0, a: 1 }); // CSS beats the presentation attribute
    expect(fills[2]).toEqual({ r: 0, g: 0, b: 1, a: 1 }); // #id beats .class
    expect(fills[3]).toEqual({ r: 1, g: 1, b: 1, a: 1 }); // inline style wins
  });

  it('keeps currentColor for the drawer unless the file sets `color`', () => {
    const graphic = ok(`
      <svg viewBox="0 0 10 10">
        <path fill="currentColor" d="M0 0h1v1z"/>
        <g color="#00f"><path fill="currentColor" d="M0 0h1v1z"/></g>
      </svg>`);
    expect(graphic.shapes[0]?.fill).toBe('current');
    expect(graphic.shapes[1]?.fill).toEqual({ r: 0, g: 0, b: 1, a: 1 });
  });

  it('instantiates <use> and symbols, skips defs and hidden content', () => {
    const graphic = ok(`
      <svg viewBox="0 0 10 10">
        <defs><path id="dot" d="M0 0h1v1z"/></defs>
        <symbol id="sym"><path d="M0 0h2v2z"/></symbol>
        <use href="#dot" x="5"/>
        <use xlink:href="#sym" y="3"/>
        <path d="M0 0h9v9z" display="none"/>
        <path d="M0 0h9v9z" visibility="hidden"/>
      </svg>`);
    expect(graphic.shapes).toHaveLength(2);
    expect(graphic.shapes[0]?.path[0]).toEqual(['M', 5, 0]);
    expect(graphic.shapes[1]?.path[0]).toEqual(['M', 0, 3]);
  });

  it('ignores an artboard clip-path but not a real clip', () => {
    const artboard = importSvg(`
      <svg viewBox="0 0 100 100">
        <g clip-path="url(#clip0)"><rect x="10" y="10" width="20" height="20"/></g>
        <defs><clipPath id="clip0"><rect width="100" height="100" fill="white"/></clipPath></defs>
      </svg>`);
    expect(artboard.ok).toBe(true);
    const real = importSvg(`
      <svg viewBox="0 0 100 100">
        <g clip-path="url(#c)"><rect x="10" y="10" width="80" height="80"/></g>
        <defs><clipPath id="c"><circle cx="50" cy="50" r="20"/></clipPath></defs>
      </svg>`);
    expect(real).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('reports what it cannot express so the editor can rasterize instead', () => {
    const cases = [
      '<svg><defs><linearGradient id="g"/></defs><rect width="5" height="5" fill="url(#g)"/></svg>',
      '<svg><text>Hi</text></svg>',
      '<svg><rect width="5" height="5" filter="url(#f)"/></svg>',
      '<svg><image href="x.png" width="5" height="5"/></svg>',
    ];
    for (const source of cases) {
      expect(importSvg(source)).toMatchObject({ ok: false, reason: 'unsupported' });
    }
    // Unused gradients in defs are fine.
    expect(
      importSvg('<svg><defs><linearGradient id="g"/></defs><rect width="5" height="5"/></svg>').ok,
    ).toBe(true);
    expect(importSvg('not xml')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(importSvg('<html/>')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(importSvg('<svg viewBox="0 0 5 5"/>')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('never runs or fetches anything: scripts and handlers are simply not shapes', () => {
    const graphic = ok(`
      <svg viewBox="0 0 10 10" onload="alert(1)">
        <script>alert(1)</script>
        <rect width="5" height="5" onclick="alert(1)"/>
      </svg>`);
    expect(graphic.shapes).toHaveLength(1);
  });
});

describe('sanitizeSvg', () => {
  it('keeps safe drawing markup and drops active or external content', () => {
    const safe = sanitizeSvg(
      `<svg viewBox="0 0 10 10" width="1" onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject><div>x</div></foreignObject>
        <defs><linearGradient id="g" gradientTransform="rotate(45)"><stop offset="0" stop-color="red"/></linearGradient></defs>
        <rect width="5" height="5" fill="url(#g)" onclick="evil()"/>
        <image href="https://example.com/a.png" width="5" height="5"/>
        <use href="https://example.com/b.svg#x"/>
        <style>@import url(https://example.com/x.css); .a { fill: url(https://e.com/p) }</style>
      </svg>`,
      { width: 400, height: 400 },
    );
    expect(safe).not.toBeNull();
    const text = safe ?? '';
    expect(text).not.toMatch(/script|foreignObject|onload|onclick|example\.com|@import/i);
    expect(text).toContain('linearGradient');
    expect(text).toContain('gradientTransform="rotate(45)"');
    expect(text).toContain('viewBox="0 0 10 10"');
    expect(text).toContain('width="400" height="400"');
    expect(text).toContain('fill="url(#g)"');
    expect(sanitizeSvg('<html/>')).toBeNull();
  });
});
