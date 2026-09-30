/**
 * Command — command bar & AI answer (docs/templates/10-ui-motion.md §10.5).
 *
 * The expensive detail: a human typing rhythm and a selection highlight that moves on a spring
 * with a subtle stretch. The query lands key by key on a seeded cadence (bursts, a hesitation,
 * a beat before each new word); results arrive staggered as the panel grows; two ↓ presses glide
 * the highlight down — its leading edge on a stiffer spring than its trailing edge, so it
 * stretches toward where it's going and settles — and ↵ opens the row into an answer card whose
 * text streams in token by token behind a soft caret. The palette is frosted glass over its own
 * drifting color fields (the fields drawn again, blurred, inside it).
 */

import {
  CLEAN_END,
  type Color,
  c,
  caretOpacity,
  clamp,
  clamp01,
  createUiKit,
  type Draw,
  defineTemplate,
  drawGlass,
  drawIcon,
  type EaseName,
  ease,
  type FormatId,
  type Gradient,
  iconColors,
  mixOklab,
  parseHex,
  type Rect,
  readingTime,
  type SpringRange,
  type StreamingText,
  StretchTrack,
  springProgress,
  type TextBlock,
  typedCount,
  typedText,
  typingSchedule,
  UI_FONT,
  type UiKit,
  withAlpha,
} from '@/engine';
import { MAX_RESULTS, parseResults, resultIcon } from './content';

type Composition = {
  /** Headline beside the palette (else above it). */
  side: boolean;
  /** Palette width in UI px — its density — and its share of its column. */
  width: number;
  share: number;
  headline: number;
  lines: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { side: true, width: 600, share: 1, headline: 7.4, lines: 3 },
  '1:1': { side: false, width: 560, share: 0.94, headline: 6.2, lines: 2 },
  '4:5': { side: false, width: 520, share: 1, headline: 6.2, lines: 2 },
  '9:16': { side: false, width: 440, share: 1, headline: 7.6, lines: 3 },
};

// Palette metrics in UI px.
const INPUT = 62;
const ROW = 48;
const PAD = 8;
const FOOTER = 42;
const RADIUS = 18;
const HEADER = 52;

const win = (t: number, start: number, dur: number, curve: EaseName) =>
  ease[curve](dur <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / dur));

/** A keycap: a label in a small rounded key; `paint(g, x, cy, flash)` places it by its right edge. */
function keycap(ui: UiKit, label: string) {
  const { theme } = ui;
  const block = ui.text(label, 'caption', { size: 12.5, weight: 620 });
  const h = ui.px(22);
  const w = Math.max(h, block.ink.w + ui.px(14));
  const rect: Rect = { x: 0, y: 0, w, h };
  const fill = theme.dark ? withAlpha(theme.text, 0.08) : withAlpha(theme.text, 0.06);
  const border = theme.dark ? withAlpha(theme.text, 0.14) : withAlpha(theme.text, 0.12);
  return {
    w,
    paint(g: Draw, right: number, cy: number, flash = 0, opacity = 1) {
      rect.x = right - w;
      rect.y = cy - h / 2 + flash * ui.px(1);
      const r = ui.px(6);
      g.roundRect(rect, r, {
        fill: flash > 0 ? mixOklab(fill, theme.accent, 0.85 * flash) : fill,
        opacity,
      });
      g.roundRect(rect, r, {
        stroke: { color: border, width: ui.px(1) },
        opacity: opacity * (1 - flash),
      });
      g.text(block, {
        fill: flash > 0.5 ? theme.onAccent : theme.muted,
        x: rect.x + w / 2 - (block.ink.x + block.ink.w / 2),
        y: rect.y + h / 2 - block.capHeight / 2,
        opacity,
      });
    },
  };
}

export default defineTemplate({
  id: 'command',
  version: 1,
  meta: {
    name: 'Command',
    tagline: 'Command bar & AI answer',
    category: 'ui-motion',
    tags: ['ui', 'ai', 'search', 'command palette', 'productivity'],
    useCases: ['AI features', 'Search', 'Productivity tools', 'Developer tools'],
  },
  formats: ['16:9', '1:1', '4:5', '9:16'],
  structure: 'in-hold-out',
  duration: { default: 7, min: 5, max: 12 },
  alpha: 'optional',
  poster: 5.4,
  palettes: [
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'cobalt' },
  ],
  pairings: ['grotesk', 'technical', 'mono', 'editorial', 'wide'],
  // The palette's interface is set in the UI Kit's Inter, whatever the pairing.
  fonts: [UI_FONT],
  controls: {
    headline: c.text({
      label: 'Headline',
      default: 'Ask, and it’s done.',
      maxLength: 40,
      multiline: true,
      maxLines: 2,
      optional: true,
      primary: true,
    }),
    placeholder: c.text({ label: 'Placeholder', default: 'Search or ask…', maxLength: 28 }),
    query: c.text({ label: 'Query', default: 'Turn this into a launch video', maxLength: 48 }),
    results: c.text({
      label: 'Results',
      default: 'Pick a template\nApply brand colors\nExport as 4K MP4',
      maxLength: 150,
      multiline: true,
      maxLines: MAX_RESULTS,
      hint: 'One per line (up to 6). The third is chosen — or the last, with fewer.',
    }),
    answer: c.text({
      label: 'Answer',
      default: 'Done. Your video is ready.',
      maxLength: 140,
      multiline: false,
      optional: true,
      hint: 'Streams in once a result is chosen',
    }),
    shortcut: c.text({ label: 'Shortcut hint', default: '⌘K', maxLength: 8, optional: true }),
    theme: c.choice({
      label: 'Theme',
      default: 'dark',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    }),
  },
  looks: [
    {
      id: 'dark-lilac',
      name: 'Dark · Lilac',
      palette: { kind: 'library', id: 'lilac' },
      pairing: 'grotesk',
      values: { theme: 'dark' },
    },
    {
      id: 'light-ink',
      name: 'Light · Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'grotesk',
      values: { theme: 'light' },
    },
    {
      id: 'dark-graphite',
      name: 'Dark · Graphite',
      palette: { kind: 'library', id: 'graphite' },
      pairing: 'technical',
      values: { theme: 'dark' },
    },
  ],
  timing: ({ props }) => ({
    lead: 0.1,
    in: 0.6,
    out: 0.5,
    tail: CLEAN_END,
    readable: `${props.query} ${props.answer}`,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const dark = props.theme === 'dark';
    const results = parseResults(props.results);
    const answerText = props.answer.trim();
    const query = props.query.trim() || ' ';

    // --- columns ------------------------------------------------------------------------------
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const column = comp.side
      ? { x: area.x + area.w * 0.4, w: area.w * 0.6 }
      : { x: frame.cx - half, w: half * 2 };
    const W = column.w * comp.share;
    const unit = W / comp.width;
    const ui = createUiKit({
      text,
      palette,
      mode: props.theme,
      unit,
      fallbackFont: pairing.text.font,
    });
    const { theme } = ui;
    const px = (v: number) => ui.px(v);
    const PW = comp.width;

    // --- palette parts (local coordinates: the palette's top-left is 0, 0) ---------------------
    const inputPad = px(20);
    const iconSize = px(21);
    const textX = inputPad + iconSize + px(14);
    const shortcut = props.shortcut.trim() ? keycap(ui, props.shortcut.trim()) : null;
    const textMax = px(PW) - textX - px(20) - (shortcut ? shortcut.w + px(12) : 0);
    const queryBlock = ui.text(query, 'body', {
      size: 18,
      weight: 460,
      maxWidth: textMax,
      minSize: 14,
    });
    const placeholder = ui.text(props.placeholder.trim() || ' ', 'body', {
      size: (queryBlock.size / unit) as number,
      weight: 440,
      maxWidth: textMax,
    });
    const inputCy = px(INPUT / 2);
    const inputTextY = inputCy - queryBlock.capHeight / 2;
    // Typing: graphemes of what fits, with the end of each glyph for the caret.
    const shown = queryBlock.lines[0]?.text ?? query;
    const typed = typedText(shown);
    const glyphs = queryBlock.lines[0]?.glyphs ?? [];
    const lineX = queryBlock.lines[0]?.x ?? 0;
    const charEnds: number[] = [0];
    for (const glyph of glyphs) {
      const count = Math.max(
        1,
        [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(glyph.text)].length,
      );
      for (let k = 0; k < count; k++) charEnds.push(lineX + glyph.x + glyph.advance);
    }
    const caretRect: Rect = {
      x: 0,
      y: inputTextY - queryBlock.capHeight * 0.22,
      w: px(2),
      h: queryBlock.capHeight * 1.45,
    };

    const listTop = px(INPUT + 1 + PAD);
    const rowW = px(PW - 2 * PAD);
    const rows = results.map((label, i) => {
      const y = listTop + px(ROW) * i;
      const icon = resultIcon(label, i);
      const block = ui.text(label, 'body', {
        size: 15.5,
        weight: 520,
        maxWidth: rowW - px(12 + 30 + 12 + 50),
      });
      return { y, icon, block, label };
    });
    const listH = px(INPUT + 1 + PAD * 2 + ROW * Math.max(1, results.length) + 1 + FOOTER);
    const chosen = Math.min(2, Math.max(0, results.length - 1));
    const cardW = rowW;
    const stream: StreamingText | null =
      answerText && results.length > 0
        ? ui.streamingText(answerText, 'body', {
            size: 16.5,
            weight: 440,
            maxWidth: cardW - px(32),
            maxLines: 4,
            lineHeight: 1.4,
            rng: ctx.rng('answer'),
            stream: {
              perWord: 0.06 * (energy.id === 'calm' ? 1.2 : energy.id === 'punchy' ? 0.85 : 1),
            },
          })
        : null;
    const cardH = stream
      ? px(HEADER + 4) + stream.block.height + stream.block.size * 0.3 + px(20)
      : px(ROW);
    const answerH = stream ? listTop + cardH + px(PAD + 1 + FOOTER) : listH;
    const enterKey = keycap(ui, '↵');
    const downKey = keycap(ui, '↓');
    const upKey = keycap(ui, '↑');
    const escKey = keycap(ui, 'esc');

    // --- composition ---------------------------------------------------------------------------
    const display = pairing.display;
    const headlineText = props.headline.trim();
    const headlineW = comp.side ? area.w * 0.34 : half * 2;
    const headline: TextBlock | null = headlineText
      ? text.layout(headlineText, {
          style: {
            font: display.font,
            italicFont: display.italic,
            size: comp.headline * u,
            weight: display.weight,
            width: display.width,
            tracking: display.tracking,
            features: display.features,
          },
          maxWidth: headlineW,
          maxLines: comp.lines,
          lineHeight: Math.max(display.lineHeight, 0.98),
          align: comp.side ? 'left' : 'center',
          fit: { minSize: comp.headline * u * 0.55 },
        })
      : null;
    const gap = comp.side ? 0 : 6 * u;
    const headlineH = headline ? headline.height + 0.25 * headline.size : 0;
    let paletteX: number;
    let paletteY: number;
    let headlineX: number;
    let headlineY: number;
    // Centered on the palette's average height: it grows with the results, then settles into
    // the (usually shorter) answer card.
    const typicalH = (listH + answerH) / 2;
    if (comp.side) {
      paletteX = column.x + (column.w - W) / 2;
      paletteY = area.y + (area.h - typicalH) * 0.46;
      headlineX = area.x;
      headlineY = headline
        ? clamp(
            paletteY + answerH / 2 - headline.height / 2,
            area.y,
            area.y + area.h - headline.height,
          )
        : 0;
    } else {
      const total = headlineH + (headline ? gap : 0) + typicalH;
      const top = area.y + Math.max(0, (area.h - total) * 0.46);
      headlineX = frame.cx - half;
      headlineY = top;
      paletteX = frame.cx - W / 2;
      paletteY = top + (headline ? headlineH + gap : 0);
    }

    // --- choreography ------------------------------------------------------------------------
    const hold = timeline.sections.hold;
    const cps = energy.id === 'calm' ? 14 : energy.id === 'punchy' ? 20 : 17;
    const keyTimes = typingSchedule(typed.keys, ctx.rng('typing'), { cps });
    const typing = Math.min(keyTimes[keyTimes.length - 1] ?? 0, 0.6 + 0.045 * typed.keys.length);
    const typingScale =
      (keyTimes[keyTimes.length - 1] ?? 0) > 0 ? typing / (keyTimes[keyTimes.length - 1] ?? 1) : 1;
    const streamLength = stream?.duration ?? 0;
    const read = stream ? clamp(readingTime(answerText) * 0.6, 1.1, 2.4) : 1;
    const beat = {
      typeStart: 0.2,
      results: 0.15,
      move: 0.75,
      second: 0.3,
      enter: 0.5,
      stream: 0.32,
    };
    const moves = chosen;
    const natural =
      beat.typeStart +
      typing +
      beat.results +
      (moves > 0 ? beat.move + (moves - 1) * beat.second : 0.6) +
      beat.enter +
      beat.stream +
      streamLength +
      read;
    const available = hold.end - hold.start;
    const f = clamp(available / natural, 0.55, 1.1);
    const at = (s: number) => hold.start + s * f;
    let cursor = beat.typeStart;
    const typeStart = at(cursor);
    cursor += typing + beat.results;
    const resultsAt = at(cursor);
    const moveTimes: number[] = [];
    if (moves > 0) {
      cursor += beat.move;
      moveTimes.push(at(cursor));
      for (let m = 1; m < moves; m++) {
        cursor += beat.second;
        moveTimes.push(at(cursor));
      }
    } else cursor += 0.6;
    cursor += beat.enter;
    const enterAt = at(cursor);
    cursor += beat.stream;
    const streamAt = at(cursor);
    const typeScale = typingScale * f;

    // Selection: row 0 when results arrive, then down one row per ↓.
    const rowRange = (i: number): SpringRange => ({
      start: (rows[i]?.y ?? listTop) + px(2),
      end: (rows[i]?.y ?? listTop) + px(ROW - 2),
    });
    const stretch =
      energy.id === 'calm'
        ? {
            lead: { stiffness: 260, damping: 32, mass: 1 },
            trail: { stiffness: 170, damping: 26, mass: 1 },
          }
        : energy.id === 'punchy'
          ? {
              lead: { stiffness: 700, damping: 38, mass: 1 },
              trail: { stiffness: 320, damping: 28, mass: 1 },
            }
          : {
              lead: { stiffness: 520, damping: 36, mass: 1 },
              trail: { stiffness: 260, damping: 28, mass: 1 },
            };
    const track = new StretchTrack(rowRange(0), stretch);
    moveTimes.forEach((time, m) => {
      track.move(rowRange(m + 1), time);
    });

    // --- background: soft color fields drifting slowly ----------------------------------------
    const fieldColors = iconColors(palette, 3, { analogous: true }).map((color) =>
      mixOklab(color, bg, palette.dark ? 0.18 : 0.12),
    );
    const d = Math.max(frame.width, frame.height);
    const fieldRng = ctx.rng('fields');
    const fields = fieldColors.map((color, i) => ({
      x: frame.width * [0.18, 0.86, 0.6][i]! + fieldRng.range(-0.05, 0.05) * frame.width,
      y: frame.height * [0.2, 0.3, 0.92][i]! + fieldRng.range(-0.05, 0.05) * frame.height,
      r: d * [0.55, 0.5, 0.6][i]!,
      phase: fieldRng.range(0, Math.PI * 2),
      gradient: {
        kind: 'radial',
        cx: 0,
        cy: 0,
        r: d * [0.55, 0.5, 0.6][i]!,
        stops: [
          { offset: 0, color: withAlpha(color, palette.dark ? 0.7 : 0.55) },
          { offset: 0.5, color: withAlpha(color, palette.dark ? 0.3 : 0.22) },
          { offset: 1, color: withAlpha(color, 0) },
        ],
      } as Gradient,
    }));
    const fullRect: Rect = { x: 0, y: 0, w: frame.width, h: frame.height };
    const fieldGroup = { x: 0, y: 0 };
    let now = 0;
    const background = (g: Draw) => {
      g.rect(fullRect, { fill: bg });
      for (const field of fields) {
        fieldGroup.x = field.x + Math.sin(now * 0.45 + field.phase) * 3 * u;
        fieldGroup.y = field.y + Math.cos(now * 0.38 + field.phase) * 2.5 * u;
        g.group(fieldGroup, (g) =>
          g.circle(0, 0, field.gradient.kind === 'radial' ? field.gradient.r : 0, {
            fill: field.gradient,
          }),
        );
      }
    };

    // --- materials ---------------------------------------------------------------------------------
    const glass = {
      tint: dark ? withAlpha(theme.surface, 0.58) : withAlpha(theme.raised, 0.64),
      blur: 3.4,
      saturation: 1.5,
      brightness: dark ? 0.8 : 1.05,
      rim: dark ? 0.6 : 0.9,
    };
    const shadow: Gradient = {
      kind: 'radial',
      cx: 0,
      cy: 0,
      r: 1,
      stops: [
        { offset: 0, color: withAlpha(parseShadow(dark), dark ? 0.34 : 0.18) },
        { offset: 1, color: withAlpha(parseShadow(dark), 0) },
      ],
    };
    const highlightFill = dark ? withAlpha(theme.accent, 0.2) : withAlpha(theme.accent, 0.12);
    const cardFill = dark ? withAlpha(theme.accent, 0.14) : withAlpha(theme.accent, 0.08);
    const glassRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
    const clipShape = { rect: { x: 0, y: 0, w: W, h: 0 }, radius: px(RADIUS) };
    const place = { x: paletteX, y: paletteY, scale: 1, originX: W / 2, originY: 0 };
    const range: SpringRange = { start: 0, end: 0 };
    const highlight: Rect = { x: px(PAD), y: 0, w: rowW, h: 0 };
    const headlineLines = headline?.lines ?? [];
    const headlineRise = (headlineLines[0]?.mask.h ?? u) * 1.05;
    const headlineBounds = headline
      ? {
          x: headlineX + headline.ink.x,
          y: headlineY + headline.ink.y,
          w: headline.ink.w,
          h: headline.ink.h,
        }
      : null;
    const lineGap = ctx.stagger(0.08);
    const exitGap = ctx.stagger(0.05);
    const caretState = { x: 0, baseline: 0, line: 0 };
    const springName = energy.spring;

    /** The palette's content at time t (local coordinates, clipped to its current height). */
    const drawContent = (g: Draw, t: number, h: number) => {
      // Input: icon, placeholder or typed query, caret, shortcut.
      drawIcon(g, 'search', inputPad + iconSize / 2, inputCy, iconSize, theme.subtle, {
        weight: 2.1,
      });
      const local = (t - typeStart) / typeScale;
      const count = t < typeStart ? 0 : typedCount(keyTimes, local);
      const focus = win(t, hold.start, 0.2, 'swift');
      if (count === 0) {
        g.text(placeholder, { fill: theme.subtle, x: textX, y: inputTextY });
      } else {
        const visible = charEnds[Math.min(count, charEnds.length - 1)] ?? 0;
        g.clip({ x: textX - px(2), y: 0, w: visible + px(3), h: px(INPUT) }, (g) =>
          g.text(queryBlock, { fill: theme.text, x: textX, y: inputTextY }),
        );
      }
      const lastKey = count > 0 ? typeStart + (keyTimes[count - 1] ?? 0) * typeScale : hold.start;
      const caret =
        caretOpacity(t, lastKey, { idle: 0.45 }) * focus * (1 - win(t, enterAt, 0.2, 'swift'));
      if (caret > 0) {
        caretRect.x =
          textX + (charEnds[Math.min(count, charEnds.length - 1)] ?? 0) + (count > 0 ? px(1.5) : 0);
        g.rect(caretRect, { fill: theme.accentInk, opacity: caret });
      }
      shortcut?.paint(g, px(PW - 20), inputCy);
      if (h <= px(INPUT + 1)) return;

      // Divider and footer.
      g.line(0, px(INPUT) + 0.5, px(PW), px(INPUT) + 0.5, { color: theme.border, width: px(1) });
      const footerTop = h - px(FOOTER);
      g.line(0, footerTop, px(PW), footerTop, { color: theme.border, width: px(1) });
      const fy = footerTop + px(FOOTER / 2);
      const flashDown = moveTimes.reduce(
        (m, time) =>
          Math.max(m, win(t, time - 0.02, 0.06, 'swift') * (1 - win(t, time + 0.12, 0.2, 'swift'))),
        0,
      );
      const flashEnter =
        win(t, enterAt - 0.02, 0.06, 'swift') * (1 - win(t, enterAt + 0.12, 0.22, 'swift'));
      let right = px(PW - 16);
      escKey.paint(g, right, fy);
      right -= escKey.w + px(14);
      enterKey.paint(g, right, fy, flashEnter);
      right -= enterKey.w + px(14);
      downKey.paint(g, right, fy, flashDown);
      right -= downKey.w + px(5);
      upKey.paint(g, right, fy);

      // Results: staggered in; the highlight glides; ↵ opens the chosen one.
      const morph = t < enterAt ? 0 : stream ? springProgress(t - enterAt - 0.04, springName) : 0;
      const others = 1 - win(t, enterAt, 0.16, 'swift');
      track.at(t, range);
      const appear = win(t, resultsAt, 0.2, 'swift');
      const card = { y: listTop, h: cardH };
      if (appear > 0) {
        highlight.y = range.start + (card.y - range.start) * morph;
        highlight.h = range.end - range.start + (card.h - (range.end - range.start)) * morph;
        const press = win(t, enterAt, 0.05, 'swift') * (1 - win(t, enterAt + 0.08, 0.2, 'swift'));
        g.roundRect(highlight, px(10 + 4 * morph), {
          fill: morph > 0 ? mixOklab(highlightFill, cardFill, morph) : highlightFill,
          opacity: appear * (1 + 0.4 * press),
        });
      }
      const center = (range.start + range.end) / 2;
      rows.forEach((row, i) => {
        const p = win(t, resultsAt + i * 0.05 * energy.stagger, 0.24, energy.enter);
        if (p <= 0) return;
        const isChosen = i === chosen;
        const opacity = p * (isChosen ? 1 : others);
        if (opacity <= 0) return;
        const selected = clamp01(1 - Math.abs(center - (row.y + px(ROW / 2))) / px(ROW));
        const y = row.y + (1 - p) * px(8) + (isChosen ? (listTop - row.y) * morph : 0);
        const cy = y + px(ROW / 2) + (isChosen ? px((HEADER - ROW) / 2) * morph : 0);
        const tile = px(30);
        const tileX = px(PAD + 12);
        const tone = isChosen ? Math.max(selected, morph) : selected;
        g.roundRect({ x: tileX, y: cy - tile / 2, w: tile, h: tile }, px(8), {
          fill: tone > 0 ? mixOklab(theme.accentSoft, theme.accent, tone) : theme.accentSoft,
          opacity,
        });
        drawIcon(
          g,
          row.icon,
          tileX + tile / 2,
          cy,
          tile * 0.56,
          tone > 0.5 ? theme.onAccent : theme.accentInk,
          {
            weight: 2.1,
            opacity,
          },
        );
        g.text(row.block, {
          fill: theme.text,
          x: tileX + tile + px(12),
          y: cy - row.block.capHeight / 2,
          opacity,
        });
        if (selected > 0.5 && morph < 0.5) {
          enterKey.paint(
            g,
            px(PW - PAD - 12),
            cy,
            isChosen ? flashEnter : 0,
            opacity * (selected - 0.5) * 2 * (1 - morph * 2),
          );
        }
      });

      // The answer streams in under the chosen row, now the card's header.
      if (stream && t >= enterAt) {
        const local = t - streamAt;
        const textX2 = px(PAD + 16);
        const textY = listTop + px(HEADER + 4);
        const fade = win(t, enterAt + 0.1, 0.25, 'swift');
        stream.draw(g, local, { x: textX2, y: textY, fill: theme.text, opacity: fade });
        stream.drawCaret(g, local, {
          x: textX2,
          y: textY,
          color: theme.accentInk,
          opacity: fade,
          state: caretState,
        });
      }
    };

    return {
      render: ({ t, g, tl }) => {
        now = t;
        if (!ctx.transparent) background(g);

        // Headline: masked lines rise; they leave upwards.
        if (headline && headlineBounds) {
          g.movable('headline', headlineBounds, (g) => {
            headlineLines.forEach((line, i) => {
              const p = tl.p(t, 'in', { delay: 0.12 + i * lineGap, dur: 0.75 }, energy.enter);
              const out = tl.p(t, 'out', { delay: i * exitGap, dur: 0.4 }, 'exit');
              if (p <= 0 || out >= 1) return;
              g.clip(
                {
                  x: headlineX + line.mask.x,
                  y: headlineY + line.mask.y,
                  w: line.mask.w,
                  h: line.mask.h,
                },
                (g) =>
                  g.text(line, {
                    fill: fg,
                    x: headlineX,
                    y: headlineY + (1 - p) * headlineRise - out * headlineRise,
                  }),
              );
            });
            g.editable('headline', headlineBounds);
          });
        }

        // Palette: in from 96% through a blur; height follows the content on a spring.
        const shown = tl.p(t, 'in', { dur: 0.6 }, energy.enter);
        const appear = tl.p(t, 'in', { dur: 0.3 }, 'swift');
        const blurIn = (1 - tl.p(t, 'in', { dur: 0.6 }, 'glide')) * 0.75 * energy.blur;
        const gone = tl.p(t, 'out', { dur: 0.45 }, 'exit');
        const fade = tl.p(t, 'out', { delay: 0.05, dur: 0.4 }, 'swift');
        const opacity = appear * (1 - fade);
        if (opacity <= 0) return;
        const scale = 0.96 + 0.04 * shown - 0.03 * gone;
        const grow = t < resultsAt ? 0 : springProgress(t - resultsAt, springName);
        const morph = t < enterAt || !stream ? 0 : springProgress(t - enterAt - 0.04, springName);
        const collapsed = px(INPUT);
        const h = collapsed + (listH - collapsed) * grow + (answerH - listH) * morph;
        place.scale = scale;
        glassRect.w = W * scale;
        glassRect.h = h * scale;
        glassRect.x = paletteX + (W - glassRect.w) / 2;
        glassRect.y = paletteY;
        clipShape.rect.h = h;
        const paint = (g: Draw) => {
          // A soft ambient shadow under the glass.
          g.group(
            {
              x: glassRect.x + glassRect.w / 2,
              y: glassRect.y + glassRect.h * 0.62 + 4 * u,
              scaleX: glassRect.w * 0.56,
              scaleY: glassRect.h * 0.5 + 3 * u,
            },
            (g) => g.circle(0, 0, 1, { fill: shadow }),
          );
          drawGlass(g, glassRect, px(RADIUS) * scale, ctx.transparent ? null : background, glass);
          g.group(place, (g) => g.clip(clipShape, (g) => drawContent(g, t, h)));
        };
        const bounds = {
          x: glassRect.x - 12 * u,
          y: glassRect.y - 8 * u,
          w: glassRect.w + 24 * u,
          h: glassRect.h + 20 * u,
        };
        if (blurIn > 0.02) g.fx({ blur: blurIn, opacity, bounds }, paint);
        else if (opacity < 1) g.layer({ opacity, bounds }, paint);
        else paint(g);

        // Editor regions.
        const region = (r: Rect) => ({ x: paletteX + r.x, y: paletteY + r.y, w: r.w, h: r.h });
        const typedYet = t >= typeStart;
        g.editable(
          typedYet ? 'query' : 'placeholder',
          region({ x: textX, y: 0, w: textMax, h: px(INPUT) }),
        );
        if (shortcut)
          g.editable(
            'shortcut',
            region({ x: px(PW - 20) - shortcut.w, y: inputCy - px(11), w: shortcut.w, h: px(22) }),
          );
        if (t >= resultsAt && t < enterAt + 0.2 && rows.length > 0) {
          g.editable(
            'results',
            region({ x: px(PAD), y: listTop, w: rowW, h: px(ROW) * rows.length }),
          );
        }
        if (stream && t >= streamAt) {
          g.editable(
            'answer',
            region({
              x: px(PAD + 16),
              y: listTop + px(HEADER + 4),
              w: stream.block.ink.w,
              h: stream.block.height,
            }),
          );
        }
      },
    };
  },
});

function parseShadow(dark: boolean): Color {
  return dark ? parseHex('#000000') : parseHex('#0E1422');
}
