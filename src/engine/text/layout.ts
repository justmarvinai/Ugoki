/**
 * Text layout (docs/06-engine.md §7, docs/04-motion-language.md §8):
 * HarfBuzz shaping → break tokens → greedy + balanced line breaking (with widow control) →
 * optional auto-fit → aligned lines with optical margins, ink bounds and consistent
 * line-reveal masks. Coordinates are design units; y grows downward.
 *
 * Vertical metrics are optical: a block's top is the cap height of its first line and its
 * `height` ends at the last baseline, so blocks align to other elements the way designers do.
 */

import type { Rect } from '../core/math';
import { autoOpsz, type FaceInstance, type FontRegistry } from './fonts';
import { parseEmphasis, type Span } from './markup';
import type { Glyph, TextBlock, TextBlockOptions, TextLine, TextStyle, TextWord } from './types';

export type FallbackMeasure = (text: string, font: string, size: number) => number;

/** System fonts for glyphs our fonts lack (emoji, CJK typed into a Latin font). */
export const FALLBACK_FONT =
  'system-ui, -apple-system, "Segoe UI", "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

const approximateMeasure: FallbackMeasure = (text, _font, size) => [...text].length * size * 0.6;

/** Tracking beyond this (in em) disables ligatures, as letter-spacing does in CSS. */
const LIGATURE_TRACKING_LIMIT = 0.02;
/** Break opportunities after these characters (in addition to spaces). */
const BREAK_AFTER = new Set(['-', '‐', '–', '—', '/']);
const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '　';

type PGlyph = {
  id: number;
  face: FaceInstance;
  /** Advance without tracking (design units). */
  advance: number;
  /** Tracking added after this glyph (only on the last glyph of a cluster). */
  tracking: number;
  xOffset: number;
  yOffset: number;
  size: number;
  /** UTF-16 index of the cluster in the paragraph. */
  cluster: number;
  text: string;
  emphasis: boolean;
  fallback: boolean;
  space: boolean;
};

type Token = {
  /** Text range in the paragraph. */
  start: number;
  end: number;
  /** Glyph range including trailing spaces, and the end of the visible content. */
  g0: number;
  g1: number;
  c1: number;
  /** Width including trailing spaces and tracking. */
  width: number;
  /** Width of the visible content (no trailing spaces, no trailing tracking). */
  contentWidth: number;
};

type LineRange = { from: number; to: number };

function applyCase(text: string, style: TextStyle): string {
  const lang = style.lang ?? 'en';
  if (style.case === 'upper') return text.toLocaleUpperCase(lang);
  if (style.case === 'lower') return text.toLocaleLowerCase(lang);
  return text;
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

const clampAbs = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export class TextLayouter {
  constructor(
    private readonly registry: FontRegistry,
    private readonly measureFallback: FallbackMeasure = approximateMeasure,
  ) {}

  /** Face for a style at a size (optical size resolved from the size when 'auto'). */
  face(style: TextStyle, size = style.size): FaceInstance {
    const font = style.italic && style.italicFont ? style.italicFont : style.font;
    const axes = this.registry.axes(font);
    const variations: Record<string, number> = {};
    if (style.weight !== undefined) variations.wght = style.weight;
    if (style.width !== undefined) variations.wdth = style.width;
    const opsz = style.opsz ?? 'auto';
    const opszValue = opsz === 'auto' ? autoOpsz(size, axes.opsz) : opsz;
    if (opszValue !== undefined) variations.opsz = opszValue;
    return this.registry.instance(font, variations);
  }

  layout(input: string, options: TextBlockOptions): TextBlock {
    const text = applyCase(input.normalize('NFC'), options.style);
    const maxLines = options.maxLines ?? Number.POSITIVE_INFINITY;
    const fits = (block: TextBlock) =>
      block.lines.length <= maxLines &&
      block.lines.every((line) => line.width <= options.maxWidth + 0.01);

    const size = options.style.size;
    const block = this.layoutAtSize(text, options, size);
    if (fits(block)) return block;
    if (!options.fit || options.fit.minSize >= size) return { ...block, overflow: true };

    const smallest = this.layoutAtSize(text, options, options.fit.minSize);
    if (!fits(smallest)) return { ...smallest, overflow: true };

    // Largest size that fits (binary search to a quarter unit).
    let lo = options.fit.minSize;
    let hi = size;
    let best = smallest;
    for (let i = 0; i < 12 && hi - lo > 0.25; i++) {
      const mid = (lo + hi) / 2;
      const candidate = this.layoutAtSize(text, options, mid);
      if (fits(candidate)) {
        lo = mid;
        best = candidate;
      } else {
        hi = mid;
      }
    }
    return best;
  }

  private layoutAtSize(text: string, options: TextBlockOptions, size: number): TextBlock {
    const style: TextStyle = { ...options.style, size };
    const emphasisStyle: TextStyle = { ...style, ...options.emphasisStyle };
    emphasisStyle.size = options.emphasisStyle?.size ?? size;

    const baseFace = this.face(style, size);
    const capHeight = (baseFace.capHeight / baseFace.upem) * size;
    const lineAdvance = size * options.lineHeight;
    const align = options.align ?? 'left';

    type Draft = {
      glyphs: PGlyph[];
      tokens: Token[];
      text: string;
      width: number;
      paragraph: string;
    };
    const drafts: Draft[] = [];
    for (const paragraph of text.split('\n')) {
      const spans: Span[] = options.emphasis
        ? parseEmphasis(paragraph)
        : [{ text: paragraph, emphasis: false }];
      const plain = spans.map((span) => span.text).join('');
      const glyphs = this.shapeParagraph(spans, style, emphasisStyle);
      const tokens = tokenize(plain, glyphs);
      for (const range of breakLines(tokens, options.maxWidth, options.balance ?? true)) {
        const lineTokens = tokens.slice(range.from, range.to);
        const first = lineTokens[0];
        const last = lineTokens[lineTokens.length - 1];
        drafts.push({
          glyphs: first && last ? glyphs.slice(first.g0, last.c1) : [],
          tokens: lineTokens,
          text: first && last ? plain.slice(first.start, last.end).trimEnd() : '',
          width: lineTokens.reduce(
            (sum, token, i) =>
              sum + (i === lineTokens.length - 1 ? token.contentWidth : token.width),
            0,
          ),
          paragraph: plain,
        });
      }
    }

    const widest = drafts.reduce((max, draft) => Math.max(max, draft.width), 0);
    const alignWidth = Number.isFinite(options.maxWidth) ? options.maxWidth : widest;

    let maxAscent = capHeight;
    let maxDescent = 0;
    let glyphIndex = 0;
    let wordIndex = 0;
    const partial: Omit<TextLine, 'mask'>[] = [];

    drafts.forEach((draft, lineIndex) => {
      const baseline = capHeight + lineIndex * lineAdvance;
      const glyphs: Glyph[] = [];
      let pen = 0;
      for (const g of draft.glyphs) {
        const ink = this.inkOf(g);
        if (ink) {
          maxAscent = Math.max(maxAscent, -ink.y);
          maxDescent = Math.max(maxDescent, ink.y + ink.h);
        }
        glyphs.push({
          id: g.fallback ? 0 : g.id,
          face: g.face,
          x: pen + g.xOffset,
          y: -g.yOffset,
          advance: g.advance + g.tracking,
          size: g.size,
          text: g.text,
          index: glyphIndex++,
          word: -1,
          line: lineIndex,
          emphasis: g.emphasis,
          ink,
          fallback: g.fallback ? { font: FALLBACK_FONT } : null,
        });
        pen += g.advance + g.tracking;
      }

      const lineStart = draft.tokens[0]?.g0 ?? 0;
      const words: TextWord[] = draft.tokens.map((token) => {
        const start = token.g0 - lineStart;
        const end = token.c1 - lineStart;
        const index = wordIndex++;
        for (let k = start; k < end; k++) {
          const glyph = glyphs[k];
          if (glyph) glyphs[k] = { ...glyph, word: index };
        }
        return {
          index,
          text: draft.paragraph.slice(token.start, token.end).trimEnd(),
          start,
          end,
          x: glyphs[start]?.x ?? 0,
          width: token.contentWidth,
        };
      });

      // Optical margins: align ink (not side bearings) with the edge for left/right text.
      let opticalShift = 0;
      const firstInked = glyphs.find((glyph) => glyph.ink !== null);
      const lastInked = [...glyphs].reverse().find((glyph) => glyph.ink !== null);
      if (align === 'left' && firstInked?.ink) {
        opticalShift = -clampAbs(firstInked.x + firstInked.ink.x, 0.1 * size);
      } else if (align === 'right' && lastInked?.ink) {
        opticalShift = -clampAbs(
          lastInked.x + lastInked.ink.x + lastInked.ink.w - draft.width,
          0.1 * size,
        );
      }
      const x =
        (align === 'center'
          ? (alignWidth - draft.width) / 2
          : align === 'right'
            ? alignWidth - draft.width
            : 0) + opticalShift;

      const inkRects = glyphs.flatMap((glyph) =>
        glyph.ink
          ? [
              {
                x: x + glyph.x + glyph.ink.x,
                y: baseline + glyph.y + glyph.ink.y,
                w: glyph.ink.w,
                h: glyph.ink.h,
              },
            ]
          : [],
      );
      const ink =
        inkRects.length > 0
          ? inkRects.reduce(unionRect)
          : { x, y: baseline - capHeight, w: 0, h: capHeight };
      partial.push({
        index: lineIndex,
        text: draft.text,
        glyphs,
        words,
        x,
        baseline,
        width: draft.width,
        ink,
      });
    });

    // One mask height for every line (lines rise in unison); horizontally generous so skewed
    // or overshooting glyphs never clip.
    const pad = 0.08 * size;
    const lines: TextLine[] = partial.map((line) => ({
      ...line,
      mask: {
        x: Math.min(0, line.x) - size * 0.5,
        y: line.baseline - maxAscent - pad,
        w: Math.max(alignWidth, line.x + line.width) - Math.min(0, line.x) + size,
        h: maxAscent + maxDescent + pad * 2,
      },
    }));

    const last = lines[lines.length - 1];
    return {
      lines,
      glyphCount: glyphIndex,
      wordCount: wordIndex,
      size,
      lineHeight: options.lineHeight,
      width: widest,
      height: last ? last.baseline : 0,
      ink:
        lines.length > 0
          ? lines.map((line) => line.ink).reduce(unionRect)
          : { x: 0, y: 0, w: 0, h: 0 },
      overflow: false,
      style,
      capHeight,
    };
  }

  private inkOf(g: PGlyph): Rect | null {
    if (g.fallback) return { x: 0, y: -0.8 * g.size, w: g.advance, h: g.size };
    const box = g.face.ink(g.id);
    if (!box) return null;
    const s = g.size / g.face.upem;
    return { x: box.x * s + g.xOffset, y: box.y * s - g.yOffset, w: box.w * s, h: box.h * s };
  }

  private shapeParagraph(spans: Span[], style: TextStyle, emphasisStyle: TextStyle): PGlyph[] {
    const glyphs: PGlyph[] = [];
    let offset = 0;
    for (const span of spans) {
      const runStyle = span.emphasis ? emphasisStyle : style;
      const face = this.face(runStyle, runStyle.size);
      const trackingEm = runStyle.tracking ?? 0;
      const features = [...(runStyle.features ?? [])];
      if (Math.abs(trackingEm) > LIGATURE_TRACKING_LIMIT) features.push('-liga', '-clig', '-dlig');
      const tracking = trackingEm * runStyle.size;
      const scale = runStyle.size / face.upem;
      const shaped = face.shape(span.text, features, runStyle.lang ?? 'en');

      for (let i = 0; i < shaped.length; i++) {
        const g = shaped[i] as (typeof shaped)[number];
        const previous = shaped[i - 1];
        const firstOfCluster = !previous || previous.cluster !== g.cluster;
        let clusterEnd = span.text.length;
        for (let k = i + 1; k < shaped.length; k++) {
          const next = (shaped[k] as (typeof shaped)[number]).cluster;
          if (next !== g.cluster) {
            clusterEnd = next;
            break;
          }
        }
        const next = shaped[i + 1];
        const lastOfCluster = !next || next.cluster !== g.cluster;
        const text = firstOfCluster ? span.text.slice(g.cluster, clusterEnd) : '';
        const missing = g.id === 0 && text.trim().length > 0;
        if (g.id === 0 && !firstOfCluster) continue; // merged into the cluster's fallback glyph

        glyphs.push({
          id: g.id,
          face,
          advance: missing
            ? this.measureFallback(text, FALLBACK_FONT, runStyle.size)
            : g.xAdvance * scale,
          tracking: lastOfCluster || missing ? tracking : 0,
          xOffset: g.xOffset * scale,
          yOffset: g.yOffset * scale,
          size: runStyle.size,
          cluster: offset + g.cluster,
          text,
          emphasis: span.emphasis,
          fallback: missing,
          space: text.length > 0 && [...text].every(isSpace),
        });
      }
      offset += span.text.length;
    }
    return glyphs;
  }
}

/** Splits a paragraph into break tokens (content + trailing spaces) with their glyph ranges. */
function tokenize(text: string, glyphs: readonly PGlyph[]): Token[] {
  const bounds: { start: number; end: number }[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (isSpace(ch)) {
      while (i < text.length && isSpace(text[i] as string)) i++;
      bounds.push({ start, end: i });
      start = i;
      continue;
    }
    i++;
    if (BREAK_AFTER.has(ch) && i < text.length && !isSpace(text[i] as string)) {
      bounds.push({ start, end: i });
      start = i;
    }
  }
  if (start < text.length || bounds.length === 0) bounds.push({ start, end: text.length });

  const tokens: Token[] = [];
  let g = 0;
  for (const bound of bounds) {
    const g0 = g;
    let width = 0;
    while (g < glyphs.length && (glyphs[g] as PGlyph).cluster < bound.end) {
      const glyph = glyphs[g] as PGlyph;
      width += glyph.advance + glyph.tracking;
      g++;
    }
    let c1 = g;
    while (c1 > g0 && (glyphs[c1 - 1] as PGlyph).space) c1--;
    let contentWidth = 0;
    for (let k = g0; k < c1; k++) {
      const glyph = glyphs[k] as PGlyph;
      contentWidth += glyph.advance + (k === c1 - 1 ? 0 : glyph.tracking);
    }
    tokens.push({ start: bound.start, end: bound.end, g0, g1: g, c1, width, contentWidth });
  }
  return tokens;
}

function greedy(tokens: readonly Token[], width: number): LineRange[] {
  const ranges: LineRange[] = [];
  let from = 0;
  let lineWidth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token;
    if (i > from && lineWidth + token.contentWidth > width + 0.01) {
      ranges.push({ from, to: i });
      from = i;
      lineWidth = 0;
    }
    lineWidth += token.width;
  }
  ranges.push({ from, to: tokens.length });
  return ranges;
}

/** Greedy breaking, then balanced (text-wrap: balance) with single-word widow control. */
function breakLines(tokens: readonly Token[], maxWidth: number, balance: boolean): LineRange[] {
  if (tokens.length === 0) return [{ from: 0, to: 0 }];
  if (!Number.isFinite(maxWidth)) return [{ from: 0, to: tokens.length }];
  const initial = greedy(tokens, maxWidth);
  if (!balance || initial.length < 2) return initial;

  // Narrowest width that keeps the same number of lines.
  const count = initial.length;
  let lo = tokens.reduce((max, token) => Math.max(max, token.contentWidth), 0);
  let hi = maxWidth;
  for (let i = 0; i < 16 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (greedy(tokens, mid).length <= count) hi = mid;
    else lo = mid;
  }
  const ranges = greedy(tokens, hi);

  const lastRange = ranges[ranges.length - 1];
  const previous = ranges[ranges.length - 2];
  if (
    lastRange &&
    previous &&
    lastRange.to - lastRange.from === 1 &&
    previous.to - previous.from >= 3
  ) {
    const moved = tokens.slice(previous.to - 1, lastRange.to);
    const width = moved.reduce(
      (sum, token, i) => sum + (i === moved.length - 1 ? token.contentWidth : token.width),
      0,
    );
    if (width <= maxWidth) {
      previous.to -= 1;
      lastRange.from -= 1;
    }
  }
  return ranges;
}
