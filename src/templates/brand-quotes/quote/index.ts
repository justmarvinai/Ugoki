/**
 * Quote — big quote (docs/templates/06-brand-quotes.md §6.1).
 *
 * The expensive detail: hanging punctuation — the oversized opening mark hangs outside the text
 * block (in the gutter left of the column, or above a centered quote), so the text's edge stays
 * optically straight — and a highlight that follows the real line breaks: every line of the key
 * phrase gets its own block, swept left→right one line after the other, like a marker pen.
 */

import {
  bestContrast,
  CLEAN_END,
  type Color,
  c,
  clamp01,
  type Draw,
  defineTemplate,
  type EnergyProfile,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type PathCommand,
  type PathData,
  type Rect,
  readingTime,
  type TextBlock,
  type TextLine,
  unionRect,
} from '@/engine';
import { drawnMark } from './mark';

type Composition = {
  /** Largest and smallest quote size (u). */
  size: number;
  min: number;
  /** Height of the quotation mark's ink (u). */
  mark: number;
  /**
   * Where a left-aligned quote's mark hangs: in the gutter beside the column, or above it
   * (narrow formats keep the whole width for the text). Centered quotes always carry it above.
   */
  hang: 'side' | 'above';
  /** Widest the quote column may get, as a share of the layout area's width. */
  measure: number;
  /** Name size (u) and portrait diameter (u). */
  name: number;
  portrait: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '1:1': { size: 10.5, min: 4.4, mark: 14, hang: 'side', measure: 1, name: 3.4, portrait: 9 },
  '4:5': { size: 10, min: 4.4, mark: 13, hang: 'side', measure: 1, name: 3.5, portrait: 9 },
  '9:16': { size: 11, min: 4.6, mark: 13, hang: 'above', measure: 1, name: 3.8, portrait: 10 },
  '16:9': { size: 12, min: 4.4, mark: 15, hang: 'side', measure: 0.66, name: 3.4, portrait: 9 },
};

/** Pairings whose display face is a serif: the mark is that face's own glyph. */
const SERIF_DISPLAY = new Set(['editorial', 'classic', 'soft']);

// --- choreography (Balanced seconds from the start of `in`) ----------------------------------
const LEAD = 0.1;
const WORDS_AT = 0.35;
const WORD_GAP = 0.05;
/** Long quotes compress the word stagger so the cascade never crawls (motion language §6.9). */
const WORD_SPAN = 1.5;
const WORD_DUR = 0.6;
/** The highlight starts this long after the phrase's last word starts to appear. */
const HIGHLIGHT_AFTER = 0.3;
const SWEEP = 0.35;
/** Each line of the highlight starts this long after the previous one (a pen changing lines). */
const SWEEP_LINE = 0.26;
const ATTRIBUTION_AFTER = 0.4;
const ATTRIBUTION_DUR = 0.8;
const OUT = 0.6;

/** The quote without its emphasis markup (`\\*` stays a literal star). */
const plain = (quote: string) =>
  quote
    .replace(/\\\*/g, '\uE000')
    .replace(/\*/g, '')
    .replace(/\uE000/g, '*');
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const wordGap = (count: number) => (count > 1 ? Math.min(WORD_GAP, WORD_SPAN / (count - 1)) : 0);
/** The stagger of an `in` window in Balanced seconds (as `ctx.stagger` computes it). */
const inGap = (gap: number, energy: EnergyProfile) => (gap * energy.stagger) / energy.time;

type Mark = { ink: Rect; draw: (g: Draw, x: number, y: number, fill: Color) => void };
type Segment = {
  rect: Rect;
  start: number;
  /** The swept part of `rect` on the current frame (reused, never reallocated). */
  live: { x: number; y: number; w: number; h: number };
};

export default defineTemplate({
  id: 'quote',
  version: 1,
  meta: {
    name: 'Quote',
    tagline: 'Big quote',
    category: 'brand-quotes',
    tags: ['quote', 'testimonial', 'editorial', 'speaker'],
    useCases: ['Quotes', 'Speaker highlights', 'Podcast clips', 'Thought leadership'],
  },
  formats: ['1:1', '4:5', '9:16', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 'auto', min: 5, max: 12 },
  alpha: 'optional',
  poster: 3.4,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'blush' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'lilac' },
  ],
  pairings: ['editorial', 'classic', 'soft', 'grotesk', 'studio'],
  controls: {
    quote: c.text({
      label: 'Quote',
      default: '*Good motion is invisible.* You only notice it when it’s missing.',
      maxLength: 220,
      primary: true,
      emphasis: true,
      hint: 'Wrap the key phrase in *asterisks* to highlight it',
    }),
    name: c.text({ label: 'Name', default: 'Noa Lindqvist', maxLength: 40 }),
    role: c.text({ label: 'Role', default: 'Motion Director', maxLength: 60, optional: true }),
    portrait: c.image({
      label: 'Portrait',
      accept: 'portrait',
      default: { kind: 'placeholder', id: 'portrait-2' },
      optional: true,
    }),
    highlight: c.choice({
      label: 'Highlight',
      default: 'marker',
      options: [
        { value: 'marker', label: 'Marker' },
        { value: 'italic', label: 'Italic' },
        { value: 'color', label: 'Color' },
      ],
    }),
    align: c.choice({
      label: 'Alignment',
      default: 'left',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
      ],
    }),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'editorial' },
    {
      id: 'ink',
      name: 'Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'editorial',
      values: { highlight: 'italic' },
    },
    {
      id: 'blush',
      name: 'Blush',
      palette: { kind: 'library', id: 'blush' },
      pairing: 'soft',
      values: { highlight: 'color', align: 'center' },
    },
  ],
  timing: ({ props, energy }) => {
    const quote = plain(props.quote);
    const words = wordCount(quote);
    const lastWord = WORDS_AT + Math.max(0, words - 1) * inGap(wordGap(words), energy);
    const attributed = props.name.trim() !== '' || props.role.trim() !== '';
    const inLength = lastWord + (attributed ? ATTRIBUTION_AFTER + ATTRIBUTION_DUR : WORD_DUR);
    const hold = readingTime(`${quote} ${props.name}`);
    return {
      lead: LEAD,
      in: inLength,
      out: OUT,
      tail: CLEAN_END,
      readable: quote,
      auto: LEAD + (inLength + OUT) * energy.time + hold + CLEAN_END,
    };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const center = props.align === 'center';
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const display = pairing.display;
    const body = pairing.text;
    const italic = props.highlight === 'italic';
    const marker = props.highlight === 'marker';
    /** Italic without an italic face: an oblique slant on the emphasized glyphs. */
    const oblique = italic && !display.italic;

    // Short quotes may grow past the usual size (a one-word quote shouldn't sit small); the
    // mark grows along, half as much.
    const quoteText = props.quote.trim() || ' ';
    const boost = 1 + 0.8 * clamp01((48 - plain(quoteText).length) / 40);

    // --- the mark ---------------------------------------------------------------------------
    const markH = comp.mark * u * (1 + (boost - 1) * 0.5);
    const mark: Mark = (() => {
      if (SERIF_DISPLAY.has(pairing.id)) {
        const style = { font: display.font, size: 100, weight: display.weight };
        const probe = text.line('“', style);
        const scale = probe.ink.h > 0 ? markH / probe.ink.h : 1;
        const glyph = text.line('“', { ...style, size: 100 * scale });
        const ink = glyph.ink;
        return {
          ink: { x: 0, y: 0, w: ink.w, h: ink.h },
          draw: (g, x, y, fill) => g.text(glyph, { fill, x: x - ink.x, y: y - ink.y }),
        };
      }
      const drawn = drawnMark(markH);
      return {
        ink: drawn.ink,
        draw: (g, x, y, fill) => g.group({ x, y }, (g) => g.path(drawn.path, { fill })),
      };
    })();
    // Hanging punctuation: beside the column, the mark lives in a gutter of its own; above it,
    // its round ball overhangs the text edge a little, as round letters do.
    const side = !center && comp.hang === 'side';
    const gutter = side ? mark.ink.w + Math.max(2.4 * u, markH * 0.3) : 0;
    const overhang = side || center ? 0 : 0.06 * mark.ink.w;

    // --- attribution ------------------------------------------------------------------------
    const nameText = props.name.trim();
    const roleText = props.role.trim();
    const portrait = ctx.graphic('portrait');
    const attributed = nameText !== '' || roleText !== '';
    const diameter = portrait ? comp.portrait * u : 0;
    const portraitGap = portrait ? 2.4 * u : 0;

    // The column: left of it hangs the mark (left), or it is symmetric around the center.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const column = center
      ? Math.min(half * 2, area.w * comp.measure)
      : Math.min(area.w * comp.measure, area.w - gutter - overhang);
    const attributionW = column - diameter - portraitGap;

    const nameSize = comp.name * u;
    const nameStyle = {
      font: body.font,
      size: nameSize,
      weight: 600,
      width: body.width,
      tracking: body.tracking,
      features: body.features,
    };
    const name: TextBlock | null = nameText
      ? text.layout(nameText, {
          style: nameStyle,
          maxWidth: attributionW,
          maxLines: 1,
          lineHeight: 1.2,
          align: 'left',
          fit: { minSize: 2.4 * u },
        })
      : null;
    const role: TextBlock | null = roleText
      ? text.layout(roleText, {
          style: {
            ...nameStyle,
            size: Math.max(2.4 * u, nameSize * 0.84),
            weight: body.weight,
          },
          maxWidth: attributionW,
          maxLines: 2,
          lineHeight: 1.25,
          align: 'left',
          fit: { minSize: 2.4 * u },
        })
      : null;
    const nameToRole = name && role ? name.height + role.size * 0.95 : name ? name.height : 0;
    const textH = nameToRole + (role ? role.height : 0);
    const lastText = role ?? name;
    const rowH = Math.max(diameter, lastText ? textH + 0.3 * lastText.size : 0);
    const ruleW = 5 * u;
    const ruleH = 0.3 * u;
    const ruleGap = 5.4 * u;
    const rowGap = 3.4 * u;
    const attributionH = attributed || portrait ? ruleGap + ruleH + rowGap + rowH : 0;

    // --- the quote, fitted to the width and to the height left over -------------------------
    const lineHeight = Math.max(1.1, display.lineHeight + 0.14);
    const markAbove = side ? 0 : markH + 3.6 * u;
    const room = area.h - attributionH - markAbove;
    const layoutQuote = (size: number): TextBlock => {
      const lines = Math.max(1, Math.floor((room - 0.72 * size) / (size * lineHeight)) + 1);
      return text.layout(quoteText, {
        style: {
          font: display.font,
          italicFont: display.italic,
          size,
          weight: Math.min(display.weight, 600),
          width: display.width,
          tracking: display.tracking * 0.6,
          features: display.features,
        },
        // An oblique slant leans glyph tops right, past their measured ink.
        maxWidth: column - (oblique ? 0.16 * size : 0),
        maxLines: Math.min(lines, 12),
        lineHeight,
        align: center ? 'center' : 'left',
        emphasis: true,
        emphasisStyle: italic ? { italic: true } : undefined,
      });
    };
    // Ink above the cap height (accents) and below the last baseline (descenders).
    const above = (block: TextBlock) => Math.max(0, -block.ink.y);
    const below = (block: TextBlock) =>
      Math.max(0.26 * block.size, block.ink.y + block.ink.h - block.height);
    const fits = (block: TextBlock) =>
      !block.overflow &&
      above(block) + block.height + (attributionH > 0 ? 0 : below(block)) <= room;
    const largest = comp.size * u * boost;
    let quote = layoutQuote(comp.min * u);
    if (fits(layoutQuote(largest))) {
      quote = layoutQuote(largest);
    } else {
      let lo = comp.min * u;
      let hi = largest;
      for (let i = 0; i < 10 && hi - lo > 0.1 * u; i++) {
        const mid = (lo + hi) / 2;
        const candidate = layoutQuote(mid);
        if (fits(candidate)) {
          lo = mid;
          quote = candidate;
        } else {
          hi = mid;
        }
      }
    }
    const size = quote.size;

    // --- the lockup ---------------------------------------------------------------------------
    // Local layout: x = 0 is the column's left edge, y = 0 the first line's cap height.
    const rowW = diameter + portraitGap + Math.max(name?.width ?? 0, role?.width ?? 0);
    const contentW = Math.max(quote.width, attributed || portrait ? rowW : 0);
    const ascent = above(quote);
    const ruleY = quote.height + ruleGap;
    const rowY = ruleY + ruleH + rowGap;
    const textH0 = quote.height + (attributionH > 0 ? attributionH : below(quote));
    // Beside the column, a tall mark (a one-word quote) may reach below the text.
    const blockH = ascent + (side ? Math.max(textH0, markH) : textH0);
    const totalH = markAbove + blockH;
    const top = area.y + (area.h - totalH) * 0.47 + markAbove + ascent;

    // Left: the column (with its hanging mark) is centered in the area as one block.
    const blockW = center ? column : gutter + overhang + contentW;
    const left = center
      ? frame.cx - column / 2
      : area.x + (area.w - blockW) / 2 + gutter + overhang;
    const quoteX = left;
    const quoteY = top;

    const markX = center ? frame.cx - mark.ink.w / 2 : left - gutter - overhang;
    // Beside the column the mark's top aligns with the first line's cap height.
    const markY = side ? top : top - ascent - markAbove;

    const rowX = center ? frame.cx - rowW / 2 : left;
    const nameX = rowX + diameter + portraitGap;
    const nameY = top + rowY + (rowH - textH) / 2;
    const roleY = nameY + nameToRole;
    const rule: Rect = {
      x: center ? frame.cx - ruleW / 2 : left,
      y: top + ruleY,
      w: ruleW,
      h: ruleH,
    };
    const portraitRect: Rect = {
      x: rowX,
      y: top + rowY + (rowH - diameter) / 2,
      w: diameter,
      h: diameter,
    };

    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const quoteBounds = shift(quote.ink, quoteX, quoteY);
    const markBounds: Rect = { x: markX, y: markY, w: mark.ink.w, h: mark.ink.h };
    const nameBounds = name ? shift(name.ink, nameX, nameY) : null;
    const roleBounds = role ? shift(role.ink, nameX, roleY) : null;
    let lockup = unionRect(quoteBounds, markBounds);
    if (nameBounds) lockup = unionRect(lockup, nameBounds);
    if (roleBounds) lockup = unionRect(lockup, roleBounds);
    if (portrait) lockup = unionRect(lockup, portraitRect);
    if (attributed || portrait) lockup = unionRect(lockup, rule);
    // Everything the lockup draws, with room for the drop, the drift and the exit blur.
    const layerBounds: Rect = {
      x: lockup.x - 4 * u,
      y: lockup.y - 8 * u,
      w: lockup.w + 8 * u,
      h: lockup.h + 12 * u,
    };

    // --- highlight: one segment per line of each emphasized phrase ------------------------------
    const words = quote.wordCount;
    const gap = ctx.stagger(wordGap(words));
    const wordAt = (index: number) => WORDS_AT + index * gap;
    const padX = 0.1 * size;
    const capH = quote.capHeight;
    const markerTop = capH + 0.15 * size;
    const markerBottom = 0.2 * size;
    const inkTop = capH + 0.45 * size;
    const inkBottom = 0.34 * size;
    const segments: Segment[][] = quote.lines.map(() => []);
    let spanRuns: { line: number; rect: Rect }[] = [];
    let spanLastWord = -1;
    let lineEndsEmphasized = false;
    const closeSpan = () => {
      if (spanRuns.length === 0) return;
      const start = wordAt(spanLastWord) + HIGHLIGHT_AFTER;
      spanRuns.forEach((run, k) => {
        segments[run.line]?.push({
          rect: run.rect,
          start: start + k * ctx.stagger(SWEEP_LINE),
          live: { ...run.rect, w: 0 },
        });
      });
      spanRuns = [];
      spanLastWord = -1;
    };
    for (const line of quote.lines) {
      let runStart: Glyph | null = null;
      let runEnd: Glyph | null = null;
      const flush = () => {
        if (!runStart || !runEnd) return;
        const x0 = line.x + runStart.x - padX;
        const x1 = line.x + runEnd.x + runEnd.advance + padX;
        const tall = marker
          ? { top: markerTop, bottom: markerBottom }
          : { top: inkTop, bottom: inkBottom };
        spanRuns.push({
          line: line.index,
          rect: { x: x0, y: line.baseline - tall.top, w: x1 - x0, h: tall.top + tall.bottom },
        });
        spanLastWord = Math.max(spanLastWord, runEnd.word);
        runStart = null;
        runEnd = null;
      };
      const first = line.glyphs[0];
      // A phrase continues across a line break only if it ran to the end of the last line.
      if (!(first?.emphasis && lineEndsEmphasized)) closeSpan();
      for (const glyph of line.glyphs) {
        if (glyph.emphasis) {
          if (!runStart) runStart = glyph;
          runEnd = glyph;
        } else if (glyph.ink) {
          flush();
          closeSpan();
        }
      }
      lineEndsEmphasized = Boolean(line.glyphs.at(-1)?.emphasis);
      flush();
    }
    closeSpan();
    const sweepEnd = segments
      .flat()
      .reduce((end, segment) => Math.max(end, segment.start + SWEEP), 0);
    const highlighted = segments.some((line) => line.length > 0);

    // Colors: text on the marker takes whichever of bg/fg contrasts more with the accent.
    const onMarker = bestContrast(accent, [bg, fg]);
    const phraseColor = marker ? onMarker : accent;

    // --- attribution timing ---------------------------------------------------------------------
    const lastWord = wordAt(Math.max(0, words - 1));
    const attributionAt = Math.max(lastWord + ATTRIBUTION_AFTER, highlighted ? sweepEnd - 0.12 : 0);

    // --- motion -----------------------------------------------------------------------------------
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    const drop = ctx.travel(3.2 * u);
    const tilt = calm ? -4 : punchy ? -12 : -8;
    const markCurve = calm ? 'glide' : 'pop';
    const rise = ctx.travel(0.8 * u);
    const slide = ctx.travel(1.6 * u);
    const sweepCurve = calm ? 'drift' : 'snap';
    const drift = ctx.travel(0.7 * u);
    const markCx = markBounds.x + markBounds.w / 2;
    const markCy = markBounds.y + markBounds.h / 2;

    const shown = new Float64Array(Math.max(1, words));
    const motion: GlyphTransform = { dy: 0, opacity: 1 };
    const obliqueMotion: GlyphTransform = { dy: 0, opacity: 1, skewX: -11 };
    let phrase: Color | null = null;
    const animate = (glyph: Glyph): GlyphTransform => {
      const p = shown[glyph.word] ?? 1;
      const m = oblique && glyph.emphasis ? obliqueMotion : motion;
      m.dy = (1 - p) * rise;
      m.opacity = p;
      m.color = phrase && glyph.emphasis ? phrase : undefined;
      return m;
    };

    /** Clip covering everything but the given rects (nonzero: outer clockwise, holes reversed). */
    const outside = (rects: readonly Rect[], x: number, y: number): PathData => {
      const big = {
        x: layerBounds.x - x,
        y: layerBounds.y - y,
        w: layerBounds.w,
        h: layerBounds.h,
      };
      const path: PathCommand[] = [
        ['M', big.x, big.y],
        ['L', big.x + big.w, big.y],
        ['L', big.x + big.w, big.y + big.h],
        ['L', big.x, big.y + big.h],
        ['Z'],
      ];
      for (const r of rects) {
        path.push(
          ['M', r.x, r.y],
          ['L', r.x, r.y + r.h],
          ['L', r.x + r.w, r.y + r.h],
          ['L', r.x + r.w, r.y],
          ['Z'],
        );
      }
      return path;
    };
    const focal = ctx.focal('portrait');
    // Per line on the current frame: the swept segments, and whether every segment is done.
    const swept: Rect[][] = quote.lines.map(() => []);
    const done: boolean[] = quote.lines.map(() => false);

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        const gone = tl.p(t, 'out', { dur: OUT }, 'exit');
        const fade = tl.p(t, 'out', { dur: OUT }, 'swift');
        const breath = tl.p(t, 'hold', {}, 'drift');

        for (let w = 0; w < words; w++) {
          shown[w] = tl.p(t, 'in', { delay: wordAt(w), dur: WORD_DUR }, energy.enter);
        }

        const content = (g: Draw) => {
          // The mark: drops in, straightening; drifts a little further than the text in the hold.
          const dropped = tl.p(t, 'in', { dur: 0.5 }, markCurve);
          const markOpacity = tl.p(t, 'in', { dur: 0.16 }, 'swift');
          if (markOpacity > 0) {
            g.group(
              {
                y: -drop * (1 - dropped) - drift * 0.8 * breath,
                rotate: tilt * (1 - dropped),
                originX: markCx,
                originY: markCy,
                opacity: markOpacity,
              },
              (g) => mark.draw(g, markBounds.x, markBounds.y, accent),
            );
          }

          // The highlight's progress, line by line. Markers go down first, under every line
          // (a marker never covers the descenders of the line above).
          quote.lines.forEach((_, i) => {
            const lineSwept = swept[i] as Rect[];
            lineSwept.length = 0;
            let complete = true;
            for (const segment of segments[i] ?? []) {
              const p = tl.p(t, 'in', { delay: segment.start, dur: SWEEP }, sweepCurve);
              if (p < 1) complete = false;
              if (p <= 0) continue;
              segment.live.w = segment.rect.w * p;
              lineSwept.push(segment.live);
              if (marker) {
                const r = segment.live;
                g.rect({ x: quoteX + r.x, y: quoteY + r.y, w: r.w, h: r.h }, { fill: accent });
              }
            }
            done[i] = complete;
          });

          // The quote: the phrase takes its color where the highlight has swept.
          quote.lines.forEach((line: TextLine, i) => {
            const lineSwept = swept[i] as Rect[];
            if (lineSwept.length === 0 || done[i]) {
              // Nothing swept yet, or every segment complete: one pass, phrase glyphs recolored.
              phrase = lineSwept.length > 0 ? phraseColor : null;
              g.text(line, { fill: fg, x: quoteX, y: quoteY, glyph: animate });
              phrase = null;
              return;
            }
            // Mid-sweep: the text outside the swept rects in fg, inside in the phrase color.
            g.group({ x: quoteX, y: quoteY }, (g) => {
              g.clip({ path: outside(lineSwept, quoteX, quoteY) }, (g) =>
                g.text(line, { fill: fg, glyph: animate }),
              );
              phrase = phraseColor;
              for (const r of lineSwept) {
                g.clip(r, (g) => g.text(line, { fill: phraseColor, glyph: animate }));
              }
              phrase = null;
            });
          });

          // Attribution: the rule draws, the portrait and name slide in, the role fades in.
          if (attributed || portrait) {
            const drawn = tl.p(t, 'in', { delay: attributionAt, dur: 0.4 }, 'snap');
            if (drawn > 0) {
              const w = rule.w * drawn;
              const x = center ? rule.x + (rule.w - w) / 2 : rule.x;
              g.rect({ x, y: rule.y, w, h: rule.h }, { fill: accent });
            }
          }
          if (portrait) {
            const p = tl.p(t, 'in', { delay: attributionAt + 0.05, dur: 0.6 }, energy.enter);
            if (p > 0) {
              const k = 0.86 + 0.14 * p;
              const cx = portraitRect.x + diameter / 2;
              const cy = portraitRect.y + diameter / 2;
              g.group({ scale: k, originX: cx, originY: cy, opacity: p }, (g) =>
                g.clip({ rect: portraitRect, radius: diameter / 2 }, (g) =>
                  g.graphic(portrait, portraitRect, { fit: 'cover', focal }),
                ),
              );
            }
          }
          if (name) {
            const p = tl.p(t, 'in', { delay: attributionAt + 0.1, dur: 0.6 }, energy.enter);
            if (p > 0) {
              g.text(name, { fill: fg, x: nameX - slide * (1 - p), y: nameY, opacity: p });
            }
          }
          if (role) {
            const p = tl.p(t, 'in', { delay: attributionAt + 0.28, dur: 0.5 }, 'drift');
            if (p > 0) g.text(role, { fill: muted, x: nameX, y: roleY, opacity: p });
          }
        };

        g.movable('lockup', lockup, (g) => {
          g.group({ y: -drift * breath }, (g) => {
            if (gone > 0) {
              g.fx(
                { blur: 1.1 * energy.blur * gone, opacity: 1 - fade, bounds: layerBounds },
                content,
              );
            } else {
              content(g);
            }
          });
          g.editable('quote', quoteBounds);
          if (nameBounds) g.editable('name', nameBounds);
          if (roleBounds) g.editable('role', roleBounds);
          if (portrait) g.editable('portrait', portraitRect);
        });
      },
    };
  },
});
