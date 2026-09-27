/**
 * Numbers — by the numbers (docs/templates/06-brand-quotes.md §6.4).
 *
 * The expensive detail: every number box reserves its final width. Digits are tabular (one
 * width for every digit, from the odometer's glyph set), the box is sized to the final figure,
 * and a count never draws wider than its final value — so while `12M+` counts up from `0M+`,
 * nothing else in the layout moves: not the labels, not the dividers, not the other stats.
 */

import {
  CLEAN_END,
  c,
  createOdometer,
  type Draw,
  defineTemplate,
  type Figure,
  type FormatId,
  formatFigure,
  type Odometer,
  type Rect,
  type TextBlock,
  type TextLine,
  type Timeline,
  unionRect,
  withAlpha,
} from '@/engine';
import { arrange, miniVisual, splitStat, visualKind, visualWidth } from './stats';

type Composition = {
  /** Headline size (u). */
  headline: number;
  /** Largest and smallest number size (u). */
  number: number;
  min: number;
  /** Label size (u). */
  label: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { headline: 8, number: 15, min: 5, label: 3.4 },
  '1:1': { headline: 7.4, number: 14, min: 5, label: 3.5 },
  '4:5': { headline: 7.4, number: 14, min: 5, label: 3.6 },
  '9:16': { headline: 8.2, number: 13, min: 5, label: 3.9 },
};

const STAT_KEYS = ['stat1', 'stat2', 'stat3', 'stat4'] as const;

// --- choreography (Balanced seconds from the start of `in`) -----------------------------------
const RULE_AT = 0.4;
const COUNT_AT = 0.6;
const COUNT_GAP = 0.2;
const COUNT_DUR = 1;
const VISUAL_DUR = 1.8;
const OUT = 0.5;
/** Gaps (u): number baseline → label cap height; visual → number cap height. */
const LABEL_GAP = 2.7;
const VISUAL_GAP = 3;
/** A mini visual's height as a share of the numbers' cap height. */
const VISUAL_SCALE = 0.74;

type Cell = {
  key: (typeof STAT_KEYS)[number];
  index: number;
  figure: Figure | null;
  /** The value drawn as plain text when it isn't a number. */
  word: TextBlock | null;
  label: TextBlock | null;
  /** Draws the mini visual at a progress, if the stat has one. */
  visual: ((g: Draw, p: number) => void) | null;
  /** Number box: left edge, baseline, reserved width. */
  x: number;
  baseline: number;
  width: number;
  labelY: number;
  bounds: Rect;
};

export default defineTemplate({
  id: 'numbers',
  version: 1,
  meta: {
    name: 'Numbers',
    tagline: 'By the numbers',
    category: 'brand-quotes',
    tags: ['stats', 'numbers', 'results', 'data', 'counter'],
    useCases: ['Year in review', 'Investor updates', 'Impact reports', 'Milestones'],
  },
  formats: ['16:9', '1:1', '4:5', '9:16'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 4, max: 12 },
  alpha: 'optional',
  poster: 3.2,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'swiss' },
  ],
  pairings: ['grotesk', 'technical', 'sport', 'wide', 'editorial'],
  controls: {
    headline: c.text({
      label: 'Headline',
      default: '2026 in numbers',
      maxLength: 40,
      primary: true,
      optional: true,
    }),
    stat1: c.text({
      label: 'Stat 1',
      default: '12M+ views',
      maxLength: 32,
      hint: 'The number as you’d write it, then its label — e.g. “€48.2k raised”',
    }),
    stat2: c.text({ label: 'Stat 2', default: '98% happy clients', maxLength: 32 }),
    stat3: c.text({ label: 'Stat 3', default: '140 countries', maxLength: 32, optional: true }),
    stat4: c.text({
      label: 'Stat 4',
      default: '3.2× faster launches',
      maxLength: 32,
      optional: true,
    }),
    layout: c.choice({
      label: 'Layout',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'row', label: 'Row' },
        { value: 'grid', label: 'Grid' },
      ],
    }),
    visuals: c.toggle({
      label: 'Mini visuals',
      default: true,
      hint: 'A ring for percentages, bars for everything else',
    }),
  },
  looks: [
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    {
      id: 'cobalt',
      name: 'Cobalt',
      palette: { kind: 'library', id: 'cobalt' },
      pairing: 'technical',
    },
  ],
  timing: ({ props }) => {
    const stats = STAT_KEYS.map((key) => props[key].trim()).filter(Boolean);
    const lastCount = COUNT_AT + Math.max(0, stats.length - 1) * COUNT_GAP + COUNT_DUR;
    return {
      in: Math.max(1.2, lastCount),
      out: OUT,
      tail: CLEAN_END,
      // The headline and the figures are what must be read; labels are read alongside.
      readable: [props.headline, ...stats.map((stat) => splitStat(stat).value)].join(' '),
    };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const display = pairing.display;
    const body = pairing.text;

    const stats = STAT_KEYS.map((key) => ({ key, text: props[key].trim() }))
      .filter((stat) => stat.text !== '')
      .map((stat, index) => ({ ...stat, index, ...splitStat(stat.text) }));
    const { cols, rows } = arrange(props.layout, frame.format, stats.length);
    const beside = cols === 1; // wide cells carry their visual beside the number

    // --- headline -------------------------------------------------------------------------------
    const headlineText = props.headline.trim();
    const headline: TextBlock | null = headlineText
      ? text.layout(headlineText, {
          style: {
            font: display.font,
            size: comp.headline * u,
            weight: display.weight,
            width: display.width,
            tracking: display.tracking,
            features: display.features,
          },
          maxWidth: area.w,
          maxLines: 2,
          lineHeight: Math.max(1.02, display.lineHeight + 0.08),
          fit: { minSize: 3.6 * u },
        })
      : null;

    // --- the grid --------------------------------------------------------------------------------
    const padX = 3.4 * u;
    const cellW = area.w / Math.max(1, cols);
    const innerW = (col: number) => cellW - (col > 0 ? padX : 0) - (col < cols - 1 ? padX : 0);
    const narrowest = Math.min(...Array.from({ length: cols }, (_, col) => innerW(col)));

    const labelStyle = {
      font: body.font,
      size: comp.label * u,
      weight: body.weight,
      width: body.width,
      tracking: body.tracking,
      features: body.features,
    };
    const labels = stats.map((stat, i) =>
      stat.label
        ? text.layout(stat.label, {
            style: labelStyle,
            maxWidth: innerW(i % cols),
            maxLines: 2,
            lineHeight: 1.25,
            fit: { minSize: 2.4 * u },
          })
        : null,
    );

    // Numbers: one size for all, the largest that fits every cell's width and the frame's height.
    const numberStyle = (size: number) => ({
      font: display.font,
      size,
      weight: Math.max(display.weight, 700),
      width: display.width,
      tracking: 0,
      features: display.features,
    });
    const probe = createOdometer(text, numberStyle(100));
    const capRatio = probe.capHeight / 100;
    const visualRatio = VISUAL_SCALE * capRatio; // a visual's height per unit of number size
    const widthAt = (value: string, figure: Figure | null) =>
      figure ? probe.width(value) / 100 : text.line(value, numberStyle(100)).width / 100;
    const needed = stats.map((stat) => {
      const w = widthAt(stat.value, stat.figure);
      const kind = props.visuals && stat.figure ? visualKind(stat.figure) : null;
      return beside && kind ? w + 0.14 + visualWidth(kind, visualRatio) : w;
    });
    const widest = Math.max(0.01, ...needed);
    // Vertical spacing (headline → rule → grid, and between rows) at a spacing factor `k`. The
    // headline's height counts accents above its cap height.
    const ascent = headline ? Math.max(0, -headline.ink.y) : 0;
    const spacing = (k: number) => ({
      headlineH: headline ? ascent + headline.height + 0.3 * headline.size + 4.6 * u * k : 0,
      ruleGap: headline ? 4.8 * u * k : 0,
      padY: 4.4 * u * k,
    });
    const rowHeights = (size: number) =>
      Array.from({ length: rows }, (_, r) => {
        let tallest = 0;
        for (let col = 0; col < cols; col++) {
          const i = r * cols + col;
          const stat = stats[i];
          if (!stat) continue;
          const label = labels[i];
          const visual =
            props.visuals && stat.figure && !beside ? visualRatio * size + VISUAL_GAP * u : 0;
          const labelH = label ? LABEL_GAP * u + label.height + 0.3 * label.size : 0.25 * size;
          tallest = Math.max(tallest, visual + capRatio * size + labelH);
        }
        return tallest;
      });
    const heightAt = (size: number, k: number) => {
      const { headlineH, ruleGap, padY } = spacing(k);
      return (
        headlineH +
        ruleGap +
        rowHeights(size).reduce((sum, h) => sum + h, 0) +
        (rows - 1) * 2 * padY
      );
    };
    const widthLimit = Math.min(comp.number * u, narrowest / widest);
    const fitHeight = (k: number, floor: number) => {
      let fitted = widthLimit;
      for (let i = 0; i < 16 && heightAt(fitted, k) > area.h && fitted > floor; i++) {
        fitted = Math.max(floor, fitted * Math.min(0.97, area.h / heightAt(fitted, k)));
      }
      return fitted;
    };
    // Tight spaces (many stats stacked in a short frame) close up the spacing before the numbers
    // shrink much; only when even that isn't enough do they go below their usual minimum.
    let k = 1;
    let size = fitHeight(k, comp.min * u);
    while (size < widthLimit * 0.8 && k > 0.45) {
      k -= 0.1;
      size = fitHeight(k, comp.min * u);
    }
    if (heightAt(size, k) > area.h) size = fitHeight(k, 3 * u);
    const { headlineH, ruleGap, padY } = spacing(k);
    let odometer: Odometer = createOdometer(text, numberStyle(size));
    // Optical sizes change widths a little: one correction pass keeps every box inside its cell.
    const over = Math.max(
      ...stats.map((stat, i) => {
        const w = stat.figure
          ? odometer.width(stat.value)
          : text.line(stat.value, numberStyle(size)).width;
        const kind = props.visuals && stat.figure ? visualKind(stat.figure) : null;
        const extra = beside && kind ? 0.14 * size + visualWidth(kind, visualRatio * size) : 0;
        return (w + extra) / innerW(i % cols);
      }),
      0,
    );
    if (over > 1) {
      size /= over;
      odometer = createOdometer(text, numberStyle(size));
    }
    odometer.width('0123456789,.'); // lay every glyph out now, not while rendering
    const capH = odometer.capHeight;
    const visualH = visualRatio * size;

    const line = withAlpha(fg, palette.dark ? 0.26 : 0.2);
    const colors = { accent, track: withAlpha(fg, palette.dark ? 0.2 : 0.14), before: muted };

    // --- placing everything (top: headline cap height) ------------------------------------------
    const heights = rowHeights(size);
    const totalH = heightAt(size, k);
    const top = area.y + (area.h - totalH) * 0.47 + ascent;
    const left = area.x;
    const ruleY = top - ascent + (headline ? headlineH : 0);
    const gridTop = ruleY + ruleGap;
    const rowTops: number[] = [];
    let y = gridTop;
    for (let r = 0; r < rows; r++) {
      rowTops.push(y);
      y += (heights[r] ?? 0) + 2 * padY;
    }
    const gridBottom = y - 2 * padY;

    const cells: Cell[] = stats.map((stat, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = left + col * cellW + (col > 0 ? padX : 0);
      const rowTop = rowTops[row] ?? gridTop;
      const kind = props.visuals && stat.figure ? visualKind(stat.figure) : null;
      const visualTop = kind && !beside ? visualH + VISUAL_GAP * u : 0;
      const baseline = rowTop + visualTop + capH;
      const word = stat.figure ? null : text.line(stat.value, numberStyle(size));
      // The box reserves the final figure's width: a count never draws wider than its end value.
      const width = stat.figure ? odometer.width(formatFigure(stat.figure)) : (word?.width ?? 0);
      const label = labels[i] ?? null;
      const labelY = baseline + LABEL_GAP * u;
      const vw = kind ? visualWidth(kind, visualH) : 0;
      const visualBox: Rect | null = kind
        ? beside
          ? { x: x + innerW(col) - vw, y: baseline - capH / 2 - visualH / 2, w: vw, h: visualH }
          : { x, y: rowTop, w: vw, h: visualH }
        : null;
      let bounds: Rect = { x, y: baseline - capH, w: width, h: capH };
      if (label) {
        bounds = unionRect(bounds, {
          x: x + label.ink.x,
          y: labelY + label.ink.y,
          w: label.ink.w,
          h: label.ink.h,
        });
      }
      if (visualBox) bounds = unionRect(bounds, visualBox);
      return {
        key: stat.key,
        index: i,
        figure: stat.figure,
        word,
        label,
        visual:
          kind && visualBox && stat.figure
            ? miniVisual(kind, stat.figure, visualBox, colors)
            : null,
        x,
        baseline,
        width,
        labelY,
        bounds,
      };
    });

    // Dividers: the rule under the headline, lines between columns (per row) and between rows.
    const hair = Math.max(0.16 * u, 1.5);
    type Divider = { x: number; y: number; w: number; h: number; order: number };
    const dividers: Divider[] = [];
    if (headline) dividers.push({ x: left, y: ruleY, w: area.w, h: hair, order: 0 });
    let order = 1;
    for (let r = 0; r < rows; r++) {
      const rowTop = rowTops[r] ?? gridTop;
      if (r > 0) {
        dividers.push({ x: left, y: rowTop - padY, w: area.w, h: hair, order: order++ });
      }
      for (let col = 1; col < cols; col++) {
        if (!cells[r * cols + col]) continue;
        dividers.push({
          x: left + col * cellW - hair / 2,
          y: rowTop - (r > 0 || headline ? padY * 0.5 : 0),
          w: hair,
          h: (heights[r] ?? 0) + (r > 0 || headline ? padY * 0.5 : 0) + padY * 0.5,
          order: order++,
        });
      }
    }

    const headlineBounds: Rect | null = headline
      ? {
          x: left + headline.ink.x,
          y: top + headline.ink.y,
          w: headline.ink.w,
          h: headline.ink.h,
        }
      : null;
    let lockup: Rect = { x: left, y: ruleY, w: area.w, h: Math.max(hair, gridBottom - ruleY) };
    if (headlineBounds) lockup = unionRect(lockup, headlineBounds);
    for (const cell of cells) lockup = unionRect(lockup, cell.bounds);

    // --- motion ----------------------------------------------------------------------------------
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    const drawCurve = calm ? 'drift' : 'snap';
    const countGap = ctx.stagger(COUNT_GAP);
    const lineGap = ctx.stagger(0.08);
    const dividerGap = ctx.stagger(0.06);
    const rise = ctx.travel(1 * u);
    const slide = ctx.travel(1.6 * u);
    const drift = ctx.travel(0.6 * u);
    const headlineRise = (headline?.lines[0]?.mask.h ?? 0) * 1.05;

    const drawCell = (g: Draw, cell: Cell, t: number, tl: Timeline) => {
      const at = COUNT_AT + cell.index * countGap;
      const counted = tl.p(t, 'in', { delay: at, dur: COUNT_DUR }, 'glide');
      const shown = tl.p(t, 'in', { delay: at, dur: 0.16 }, 'swift');
      if (shown > 0) {
        // Punchy: the number lands with a small kick.
        const kick = punchy
          ? Math.sin(Math.PI * tl.p(t, 'in', { delay: at + COUNT_DUR * 0.8, dur: 0.24 }))
          : 0;
        g.group(
          { scale: 1 + 0.035 * kick, originX: cell.x, originY: cell.baseline, opacity: shown },
          (g) => {
            if (cell.figure) {
              const step = 10 ** cell.figure.decimals;
              const value = Math.floor(cell.figure.value * counted * step + 1e-6) / step;
              odometer.draw(g, formatFigure(cell.figure, value), {
                x: cell.x,
                y: cell.baseline,
                fill: fg,
              });
            } else if (cell.word) {
              g.text(cell.word, { fill: fg, x: cell.x, y: cell.baseline - cell.word.capHeight });
            }
          },
        );
      }
      if (cell.label) {
        const p = tl.p(t, 'in', { delay: at + 0.12, dur: 0.55 }, 'glide');
        if (p > 0) {
          g.text(cell.label, {
            fill: muted,
            x: cell.x,
            y: cell.labelY + (1 - p) * rise,
            opacity: p,
          });
        }
      }
      if (cell.visual) {
        cell.visual(
          g,
          tl.p(t, 'in', { delay: at + 0.1, dur: VISUAL_DUR }, calm ? 'drift' : 'glide'),
        );
      }
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        const breath = tl.p(t, 'hold', {}, 'drift');
        // Everything has left by 2.8 × 0.045 + 0.34 = 0.47 s, inside the 0.5 s `out`.
        const out = (k: number) => tl.p(t, 'out', { delay: k * 0.045, dur: 0.34 }, 'exit');

        g.movable('numbers', lockup, (g) => {
          g.group({ y: -drift * breath }, (g) => {
            // Headline: lines rise through their masks.
            const gone = out(0);
            if (headline && gone < 1) {
              g.group({ y: -slide * gone, opacity: 1 - gone }, (g) => {
                headline.lines.forEach((line: TextLine, i) => {
                  const p = tl.p(t, 'in', { delay: i * lineGap, dur: 0.7 }, energy.enter);
                  if (p <= 0) return;
                  g.clip(
                    { x: left + line.mask.x, y: top + line.mask.y, w: line.mask.w, h: line.mask.h },
                    (g) => g.text(line, { fill: fg, x: left, y: top + (1 - p) * headlineRise }),
                  );
                });
              });
            }

            // Dividers draw (snap, staggered) and fade with the grid on the way out.
            const fade = 1 - out(1);
            if (fade > 0) {
              for (const d of dividers) {
                const p = tl.p(
                  t,
                  'in',
                  { delay: RULE_AT + d.order * dividerGap, dur: 0.5 },
                  drawCurve,
                );
                if (p <= 0) continue;
                const vertical = d.h > d.w;
                g.rect(
                  vertical
                    ? { x: d.x, y: d.y, w: d.w, h: d.h * p }
                    : { x: d.x, y: d.y, w: d.w * p, h: d.h },
                  { fill: line, opacity: fade },
                );
              }
            }

            for (const cell of cells) {
              const leaving = out(1 + cell.index * 0.6);
              if (leaving >= 1) continue;
              g.group({ y: -slide * leaving, opacity: 1 - leaving }, (g) =>
                drawCell(g, cell, t, tl),
              );
            }
          });
          if (headlineBounds) g.editable('headline', headlineBounds);
          for (const cell of cells) g.editable(cell.key, cell.bounds);
        });
      },
    };
  },
});
