import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTextEngine, type TextEngineHandle } from './engine';
import { gunzipIfNeeded } from './font-source';
import { parseEmphasis, stripEmphasis } from './markup';
import { VERB_CLOSE, VERB_MOVE } from './types';

let text: TextEngineHandle;

const grotesk = { font: 'mona-sans', size: 100, weight: 700, width: 100, tracking: -0.03 } as const;

beforeAll(async () => {
  text = await createTextEngine({
    loadBytes: async (url) => {
      const file = await readFile(join(process.cwd(), 'public', url));
      return gunzipIfNeeded(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    },
  });
  await text.load(['mona-sans', 'inter', 'instrument-serif', 'instrument-serif-italic']);
});

describe('markup', () => {
  it('parses emphasis, escapes and unmatched stars', () => {
    expect(parseEmphasis('More *making*.')).toEqual([
      { text: 'More ', emphasis: false },
      { text: 'making', emphasis: true },
      { text: '.', emphasis: false },
    ]);
    expect(stripEmphasis('5 \\* 3 = *15*')).toBe('5 * 3 = 15');
    expect(parseEmphasis('a * b')).toEqual([{ text: 'a * b', emphasis: false }]);
    expect(stripEmphasis('*one\ntwo*')).toBe('*one\ntwo*');
  });
});

describe('fonts', () => {
  it('loads HarfBuzz faces with the renamed Mona Sans metrics', () => {
    const face = text.face(grotesk);
    expect(face.upem).toBe(1000);
    expect(face.capHeight).toBeGreaterThan(700);
    expect(face.capHeight).toBeLessThan(760);
    expect(text.hasFont('mona-sans')).toBe(true);
  });

  it('draws glyph outlines and caches instances per variation', () => {
    const face = text.face(grotesk);
    const block = text.line('O', grotesk);
    const glyph = block.lines[0]?.glyphs[0];
    expect(glyph).toBeDefined();
    const outline = face.outline(glyph!.id);
    expect(outline.verbs[0]).toBe(VERB_MOVE);
    expect(outline.verbs.filter((v) => v === VERB_CLOSE).length).toBe(2); // outer + counter
    expect(text.face(grotesk)).toBe(face);
    expect(text.face({ ...grotesk, weight: 700.4 })).toBe(face); // quantized
    expect(text.face({ ...grotesk, weight: 300 })).not.toBe(face);
  });

  it('makes heavier and wider instances measurably wider', () => {
    const width = (style: object) => text.line('Motion', { ...grotesk, ...style }).width;
    expect(width({ weight: 900 })).toBeGreaterThan(width({ weight: 300 }));
    expect(width({ width: 125 })).toBeGreaterThan(width({ width: 75 }) * 1.3);
  });

  it('picks the display optical size for large type', () => {
    const big = text.face({ ...grotesk, size: 200 });
    const small = text.face({ ...grotesk, size: 20 });
    expect(big.key).toContain('opsz=100');
    expect(small.key).toContain('opsz=12');
  });
});

describe('layout', () => {
  it('shapes with kerning: "AV" is narrower than A + V', () => {
    const pair = text.line('AV', { ...grotesk, tracking: 0 }).width;
    const a = text.line('A', { ...grotesk, tracking: 0 }).width;
    const v = text.line('V', { ...grotesk, tracking: 0 }).width;
    expect(pair).toBeLessThan(a + v - 1);
  });

  it('applies tracking between glyphs but not after the last one', () => {
    const plain = text.line('ABCD', { ...grotesk, tracking: 0 }).width;
    const tracked = text.line('ABCD', { ...grotesk, tracking: 0.1 }).width;
    expect(tracked - plain).toBeCloseTo(3 * 0.1 * 100, 0);
  });

  it('breaks lines on spaces and balances them', () => {
    const block = text.layout('Where it all began', {
      style: grotesk,
      maxWidth: 700,
      lineHeight: 0.92,
    });
    expect(block.lines.length).toBe(2);
    const [first, second] = block.lines;
    expect(Math.abs((first?.width ?? 0) - (second?.width ?? 0))).toBeLessThan(260);
    for (const line of block.lines) expect(line.width).toBeLessThanOrEqual(700.01);
    expect(block.lines.map((line) => line.text).join(' ')).toBe('Where it all began');
  });

  it('honours hard line breaks and reports optical metrics', () => {
    const block = text.layout('Where it\nall began', {
      style: grotesk,
      maxWidth: 2000,
      lineHeight: 0.92,
    });
    expect(block.lines.map((line) => line.text)).toEqual(['Where it', 'all began']);
    expect(block.lines[0]?.baseline).toBeCloseTo(block.capHeight);
    expect(block.lines[1]?.baseline).toBeCloseTo(block.capHeight + 92);
    expect(block.height).toBeCloseTo(block.capHeight + 92);
  });

  it('gives every line the same mask height, covering its ink', () => {
    const block = text.layout('Only caps\ngypsy quay', {
      style: grotesk,
      maxWidth: 2000,
      lineHeight: 0.92,
    });
    const [a, b] = block.lines;
    expect(a?.mask.h).toBeCloseTo(b?.mask.h ?? 0);
    for (const line of block.lines) {
      expect(line.mask.y).toBeLessThanOrEqual(line.ink.y);
      expect(line.mask.y + line.mask.h).toBeGreaterThanOrEqual(line.ink.y + line.ink.h);
    }
  });

  it('assigns words and reading-order indices to glyphs', () => {
    const block = text.layout('Hi there', { style: grotesk, maxWidth: 2000, lineHeight: 1 });
    const line = block.lines[0]!;
    expect(line.words.map((word) => word.text)).toEqual(['Hi', 'there']);
    expect(block.wordCount).toBe(2);
    expect(line.glyphs.map((glyph) => glyph.index)).toEqual([...line.glyphs.keys()]);
    const there = line.words[1]!;
    expect(
      line.glyphs
        .slice(there.start, there.end)
        .map((g) => g.text)
        .join(''),
    ).toBe('there');
    expect(line.glyphs.slice(there.start, there.end).every((g) => g.word === 1)).toBe(true);
  });

  it('auto-fits by shrinking to the largest size that fits', () => {
    const block = text.layout('Supercalifragilistic', {
      style: grotesk,
      maxWidth: 600,
      lineHeight: 1,
      maxLines: 1,
      fit: { minSize: 20 },
    });
    expect(block.overflow).toBe(false);
    expect(block.size).toBeLessThan(100);
    expect(block.lines[0]!.width).toBeLessThanOrEqual(600.01);
    expect(block.lines[0]!.width).toBeGreaterThan(600 * 0.97);
  });

  it('flags overflow when even the minimum size cannot fit', () => {
    const block = text.layout('a\nb\nc\nd', {
      style: grotesk,
      maxWidth: 500,
      lineHeight: 1,
      maxLines: 2,
      fit: { minSize: 40 },
    });
    expect(block.overflow).toBe(true);
  });

  it('aligns left edges optically and centers lines', () => {
    const left = text.layout('Hello', {
      style: grotesk,
      maxWidth: 1000,
      lineHeight: 1,
      align: 'left',
    });
    expect(Math.abs(left.lines[0]!.ink.x)).toBeLessThan(0.5);
    const center = text.layout('Hello', {
      style: grotesk,
      maxWidth: 1000,
      lineHeight: 1,
      align: 'center',
    });
    const line = center.lines[0]!;
    expect(line.x).toBeCloseTo((1000 - line.width) / 2);
  });

  it('supports diacritics, uppercase mapping and emphasis runs in another face', () => {
    const block = text.layout('Élodie *Marchand* straße', {
      style: { font: 'inter', size: 60, weight: 450, case: 'upper', lang: 'de' },
      maxWidth: 3000,
      lineHeight: 1.2,
      emphasis: true,
      emphasisStyle: {
        font: 'instrument-serif',
        italicFont: 'instrument-serif-italic',
        italic: true,
      },
    });
    const line = block.lines[0]!;
    expect(line.text).toBe('ÉLODIE MARCHAND STRASSE');
    expect(line.glyphs.some((glyph) => glyph.emphasis)).toBe(true);
    expect(line.glyphs.find((glyph) => glyph.emphasis)?.face.id).toBe('instrument-serif-italic');
    expect(line.glyphs.every((glyph) => glyph.id !== 0)).toBe(true);
  });

  it('marks glyphs the font lacks for the native fallback', () => {
    const block = text.line('Hi 🙂 東京', { ...grotesk, size: 50 });
    const fallbacks = block.lines[0]!.glyphs.filter((glyph) => glyph.fallback);
    expect(fallbacks.map((glyph) => glyph.text)).toEqual(['🙂', '東', '京']);
    expect(fallbacks.every((glyph) => glyph.advance > 0)).toBe(true);
  });

  it('disables ligatures when tracking is wide', () => {
    const glyphCount = (tracking: number) =>
      text.line('ffi', { font: 'inter', size: 50, weight: 400, tracking }).lines[0]!.glyphs.length;
    expect(glyphCount(0.2)).toBe(3);
  });
});
