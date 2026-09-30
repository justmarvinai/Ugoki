/**
 * Stretch — variable-width poster type (docs/templates/01-text-titles.md §1.2).
 *
 * The expensive detail: every line is justified edge to edge by solving the font's width axis
 * together with the line's size — a hand-set wood-type poster, whatever the letters. Lines share
 * one size where their widths can absorb their different lengths, and only change size where the
 * axis runs out. Through the hold a traveling wave breathes through the letters' widths while
 * each line is re-solved every frame (its widths redistributed, quantized to cached outlines and
 * the rounding spread over the gaps), so the line's ink edges never move.
 */

import {
  CLEAN_END,
  c,
  clamp,
  clamp01,
  defineTemplate,
  ease,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type Rect,
  springProgress,
  type TextLine,
  type TextStyle,
  unionRect,
} from '@/engine';
import { planLines } from './lines';
import {
  type Axis,
  extent,
  type LineTable,
  NOMINAL,
  redistribute,
  sampleLine,
  solveUniform,
} from './widths';

type Composition = {
  maxLines: number;
  /** Lines longer than this (characters) take a line of their own where there is room. */
  splitAbove: number;
  /** Preferred cap height as a share of the layout height. */
  cap: number;
  /** Share of the layout height the block may fill. */
  fill: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { maxLines: 2, splitAbove: Number.POSITIVE_INFINITY, cap: 0.36, fill: 0.92 },
  '9:16': { maxLines: 4, splitAbove: 9, cap: 0.34, fill: 0.86 },
  '1:1': { maxLines: 3, splitAbove: 11, cap: 0.3, fill: 0.88 },
  '4:5': { maxLines: 3, splitAbove: 10, cap: 0.3, fill: 0.88 },
};

/** Variable families with a width axis (the template's own font choice). */
const FAMILIES = {
  mona: { font: 'mona-sans', axis: { min: 75, max: 125 }, opsz: 100, hold: 900 },
  archivo: { font: 'archivo', axis: { min: 62, max: 125 }, opsz: undefined, hold: 900 },
  // Anybody's condensed Black closes its counters: it holds a step lighter.
  anybody: { font: 'anybody', axis: { min: 50, max: 150 }, opsz: undefined, hold: 800 },
} as const satisfies Record<
  string,
  { font: string; axis: Axis; opsz: number | undefined; hold: number }
>;
/** Share of the axis kept free at each end for the resting widths (room for the wave). */
const HEADROOM = 0.12;
/** Wave amplitude as a share of the axis range (±12 `wdth` on Mona Sans for Subtle). */
const WAVE = { off: 0, subtle: 0.24, wild: 0.4 } as const;
/** Letters start this much closer (share of their advance): clustered at the center. */
const CLUSTER = 0.3;
/**
 * Quantization of animated axes, so frames share cached outlines (the font registry keeps a few
 * hundred variation instances per worker): fine while a line breathes, coarse while letters
 * spring or squeeze — fast motion, and every letter of a line then walks the same instances.
 */
const WDTH_STEP = 0.5;
const WDTH_STEP_MOVING = 2;
const WGHT_STEP = 25;

const NO_LIGATURES = ['-liga', '-clig', '-dlig'] as const;

type FaceOf = Glyph['face'];

type Line = {
  table: LineTable;
  /** Font size (design units). */
  size: number;
  /** Resting `wdth` (solved so the line spans `span`). */
  base: number;
  /** Width the line's ink spans at rest: design units, and em. */
  span: number;
  target: number;
  left: number;
  baseline: number;
  cap: number;
  mask: Rect;
  ink: Rect;
  /** Glyphs drawn this frame (instances at their animated axes). */
  glyphs: Glyph[];
  draw: TextLine;
  memo: WeakMap<FaceOf, Glyph[]>;
  /** Per glyph, absolute seconds: when it appears and when its spring starts. */
  appear: Float64Array;
  spring: Float64Array;
  /** Wave phase (cycles) and exit delay (Balanced seconds into `out`). */
  phase: Float64Array;
  /** Advance at the entrance's hairline axes (em). */
  start: Float64Array;
  exitDelay: Float64Array;
  /** Per frame: continuous and solved widths, weights, extra spacing, placement, look. */
  w: Float64Array;
  solved: Float64Array;
  wt: Float64Array;
  extra: Float64Array;
  squeeze: Float64Array;
  x: Float64Array;
  dy: Float64Array;
  scaleY: Float64Array;
  opacity: Float64Array;
};

export default defineTemplate({
  id: 'stretch',
  version: 1,
  meta: {
    name: 'Stretch',
    tagline: 'Variable-width poster type',
    category: 'text-titles',
    tags: ['title', 'poster', 'variable font', 'kinetic', 'bold'],
    useCases: ['Music drops', 'Event posters', 'Social hooks', 'Campaign slogans'],
  },
  formats: ['9:16', '1:1', '4:5', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 4, min: 3, max: 10 },
  alpha: 'optional',
  poster: 2.15,
  palettes: [
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'swiss' },
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'hazard' },
  ],
  // The type is the template's own Font control (variable-width families only).
  pairings: ['grotesk'],
  fonts: ['archivo', 'anybody'],
  controls: {
    words: c.text({
      label: 'Words',
      default: 'SAY IT\nLOUD',
      maxLength: 30,
      multiline: true,
      maxLines: 3,
      primary: true,
      hint: 'One to three short lines — up to 10 letters a line reads best',
    }),
    font: c.choice({
      label: 'Font',
      default: 'mona',
      display: 'select',
      options: [
        { value: 'mona', label: 'Mona Sans' },
        { value: 'archivo', label: 'Archivo' },
        { value: 'anybody', label: 'Anybody (extreme widths)' },
      ],
    }),
    weight: c.choice({
      label: 'Weight range',
      default: 'light',
      options: [
        { value: 'light', label: 'Light → Black' },
        { value: 'regular', label: 'Regular → Black' },
      ],
    }),
    case: c.choice({
      label: 'Case',
      default: 'upper',
      options: [
        { value: 'upper', label: 'Upper' },
        { value: 'typed', label: 'As typed' },
      ],
    }),
    wave: c.choice({
      label: 'Wave',
      group: 'motion',
      default: 'subtle',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'subtle', label: 'Subtle' },
        { value: 'wild', label: 'Wild' },
      ],
    }),
  },
  looks: [
    {
      id: 'tangerine',
      name: 'Tangerine',
      palette: { kind: 'library', id: 'tangerine' },
      pairing: 'grotesk',
    },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    {
      id: 'swiss',
      name: 'Swiss',
      palette: { kind: 'library', id: 'swiss' },
      pairing: 'grotesk',
      values: { font: 'archivo', weight: 'regular' },
    },
  ],
  timing: ({ props }) => ({
    lead: 0.05,
    in: 1.05,
    out: 0.6,
    tail: CLEAN_END,
    readable: props.words,
  }),
  build: (ctx) => {
    const { frame, props, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const family = FAMILIES[props.font];
    const axis: Axis = family.axis;
    const range = axis.max - axis.min;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    // Lines are justified around the frame's center line, even where the social zone isn't.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const measure = half * 2;
    const fromWeight = props.weight === 'light' ? 200 : 400;
    const holdWeight = family.hold;
    const style: Omit<TextStyle, 'size' | 'width' | 'weight'> = {
      font: family.font,
      opsz: family.opsz,
      tracking: 0,
      features: NO_LIGATURES,
      case: props.case === 'upper' ? 'upper' : 'none',
    };

    // --- width model per line -------------------------------------------------------------
    const wdthGrid = [axis.min, 100, axis.max];
    const holdGrid = [axis.min, (axis.min + 100) / 2, 100, (100 + axis.max) / 2, axis.max];
    const wghtGrid: number[] = [];
    for (let w = fromWeight; w <= holdWeight; w += 100) wghtGrid.push(w);
    const sources = planLines(props.words, comp.maxLines, comp.splitAbove);
    const tables = sources
      .map((source) =>
        sampleLine(text, source, style, { wdthGrid, wghtGrid, holdGrid, holdWeight: holdWeight }),
      )
      .filter((table): table is LineTable => table !== null && table.first >= 0);
    const capEm =
      text.line('H', { ...style, size: NOMINAL, width: 100, weight: holdWeight, case: 'none' })
        .capHeight / NOMINAL;
    const scratch = new Float64Array(Math.max(1, ...tables.map((table) => table.n)));
    const uniform = (table: LineTable, w: number) => {
      scratch.fill(w, 0, table.n);
      return extent(table, scratch, holdWeight);
    };

    // --- the justified block: one size where the axis can absorb the lines' lengths ----------
    const lo = axis.min + HEADROOM * range;
    const gapFor = (a: number, b: number) => Math.max(1.4 * u, 0.1 * Math.min(a, b));
    const heightOf = (sizes: readonly number[]) =>
      sizes.reduce((h, s, j) => {
        const table = tables[j] as LineTable;
        const gap = j > 0 ? gapFor((sizes[j - 1] ?? s) * capEm, s * capEm) : 0;
        return h + gap + s * (table.top + table.bottom);
      }, 0);
    const room = comp.fill * area.h;
    const preferred = (comp.cap * area.h) / capEm;
    /** Sizes for the widest resting width `hi`: one size where the lines' widths allow it. */
    const solveSizes = (hi: number) => {
      const bounds = tables.map((table) => ({
        min: measure / Math.max(1e-6, uniform(table, hi)),
        max: measure / Math.max(1e-6, uniform(table, lo)),
      }));
      const sizesAt = (sigma: number) => bounds.map((bound) => clamp(sigma, bound.min, bound.max));
      let sigma = preferred;
      if (heightOf(sizesAt(sigma)) > room) {
        let a = Math.min(sigma, ...bounds.map((bound) => bound.min));
        let b = sigma;
        for (let k = 0; k < 40 && b - a > 0.05; k++) {
          const mid = (a + b) / 2;
          if (heightOf(sizesAt(mid)) > room) b = mid;
          else a = mid;
        }
        sigma = a;
      }
      return sizesAt(sigma);
    };
    // Resting widths keep room for the wave; lines too tall even so may use the whole axis.
    let hi = axis.max - HEADROOM * range;
    let sizes = solveSizes(hi);
    if (heightOf(sizes) > room) {
      hi = axis.max;
      sizes = solveSizes(hi);
    }
    // Even at their widest the lines are too tall: the block shrinks (and no longer fills).
    const tallest = heightOf(sizes);
    const shrink = tallest > room ? room / tallest : 1;
    if (shrink < 1) sizes = sizes.map((s) => s * shrink);

    // --- lines, stacked and optically centered ----------------------------------------------
    let cursor = area.y + (area.h - heightOf(sizes)) * 0.48;
    const lines: Line[] = tables.map((table, j) => {
      const size = sizes[j] as number;
      const span = shrink < 1 ? size * uniform(table, hi) : measure;
      const target = span / size;
      const base = solveUniform(table, target, holdWeight, axis, scratch);
      const cap = size * capEm;
      if (j > 0) cursor += gapFor((sizes[j - 1] as number) * capEm, cap);
      const top = size * table.top;
      const bottom = size * table.bottom;
      const baseline = cursor + top;
      cursor = baseline + bottom;
      const left = frame.cx - span / 2;
      const pad = 0.08 * size;
      const n = table.n;
      const glyphs = table.glyphs.slice();
      const ink: Rect = { x: left, y: baseline - top, w: span, h: top + bottom };
      return {
        table,
        size,
        base,
        span,
        target,
        left,
        baseline,
        cap,
        mask: { x: left - span, y: baseline - top - pad, w: span * 3, h: top + bottom + 2 * pad },
        ink,
        glyphs,
        draw: {
          index: j,
          text: sources[j] ?? '',
          glyphs,
          words: [],
          x: 0,
          baseline: 0,
          width: span,
          ink: { x: left, y: -top, w: span, h: top + bottom },
          mask: { x: left, y: -top - pad, w: span, h: top + bottom + 2 * pad },
        },
        memo: new WeakMap(),
        appear: new Float64Array(n),
        spring: new Float64Array(n),
        phase: new Float64Array(n),
        start: new Float64Array(n),
        exitDelay: new Float64Array(n),
        w: new Float64Array(n),
        solved: new Float64Array(n),
        wt: new Float64Array(n),
        extra: new Float64Array(n),
        squeeze: new Float64Array(n),
        x: new Float64Array(n),
        dy: new Float64Array(n),
        scaleY: new Float64Array(n).fill(1),
        opacity: new Float64Array(n),
      };
    });
    const blockInk = lines.reduce<Rect | null>(
      (all, line) => (all ? unionRect(all, line.ink) : line.ink),
      null,
    );

    // --- choreography (Balanced seconds; energy scales them) --------------------------------
    const lineCount = lines.length;
    const halfMost = Math.max(1, ...lines.map((line) => (line.table.n - 1) / 2));
    const lineGapOut = Math.min(0.05, 0.1 / Math.max(1, lineCount - 1));
    const letterGapOut = Math.min(0.012, 0.04 / halfMost);
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    const amplitude = WAVE[props.wave] * range * (calm ? 0.8 : punchy ? 1.1 : 1);
    const period = (calm ? 2.2 : punchy ? 1.2 : 1.6) * (props.wave === 'wild' ? 0.85 : 1);
    const wavelength = props.wave === 'wild' ? 0.7 : 1;
    const popCurve = energy.overshoot === 0 ? 'glide' : 'pop';
    const timeScale = energy.time;
    lines.forEach((line, j) => {
      const { table, size } = line;
      const center = (table.n - 1) / 2;
      let pen = 0;
      for (let i = 0; i < table.n; i++) {
        const k = Math.abs(i - center);
        line.appear[i] = timeline.at('in', j * ctx.stagger(0.05) + k * ctx.stagger(0.012));
        line.spring[i] = timeline.at('in', 0.2 + j * ctx.stagger(0.1) + k * ctx.stagger(0.035));
        line.exitDelay[i] = j * lineGapOut + k * letterGapOut;
        line.start[i] = table.advance(i, axis.min, fromWeight);
        const advance = table.advance(i, line.base, holdWeight);
        // The wave travels across the frame: each glyph's phase is its place on the line.
        line.phase[i] = ((pen + advance / 2) * size) / (measure * wavelength) + j * 0.12;
        pen += advance;
      }
    });
    const holdStart = timeline.sections.hold.start;

    // --- drawing ------------------------------------------------------------------------------
    const faceStyle: TextStyle = { font: family.font, opsz: family.opsz, size: NOMINAL };
    /** Glyph `i` of a line as an instance at the given axes (memoized per face). */
    const instance = (line: Line, i: number, wdth: number, wght: number): Glyph => {
      faceStyle.size = line.size;
      faceStyle.width = wdth;
      faceStyle.weight = wght;
      const face = text.face(faceStyle);
      let glyphs = line.memo.get(face);
      if (!glyphs) {
        glyphs = [];
        line.memo.set(face, glyphs);
      }
      let glyph = glyphs[i];
      if (!glyph) {
        const base = line.table.glyphs[i] as Glyph;
        const k = line.size / NOMINAL;
        glyph = { ...base, face, x: 0, y: base.y * k, size: line.size, advance: base.advance * k };
        glyphs[i] = glyph;
      }
      return glyph;
    };

    /**
     * Places a line's glyphs (their origins in `x`). Locked, the ink spans exactly the line's
     * width from its left edge — the quantization's rounding spread over the gaps; otherwise the
     * line is centered on the frame at its natural width.
     */
    const place = (line: Line, locked: boolean) => {
      const { table, size, solved, wt, extra } = line;
      const { first, last } = table;
      const natural = extent(table, solved, wt, extra);
      const spread = locked && last > first ? (line.target - natural) / (last - first) : 0;
      const left = locked && last > first ? line.left / size : frame.cx / size - natural / 2;
      let x = left - table.inkLeft(first, solved[first] ?? 100, wt[first] ?? holdWeight);
      for (let i = first; i <= last; i++) {
        line.x[i] = x * size;
        x += table.advance(i, solved[i] ?? 100, wt[i] ?? holdWeight) + (extra[i] ?? 0) + spread;
      }
    };

    let current: Line | null = null;
    const motion: GlyphTransform = { dx: 0, dy: 0, scaleY: 1, originY: 0, opacity: 1 };
    const animate = (glyph: Glyph): GlyphTransform | null => {
      const line = current;
      const i = glyph.index;
      if (!line || i < line.table.first || i > line.table.last) return null;
      const opacity = line.opacity[i] ?? 0;
      if (opacity <= 0) return null;
      motion.dx = line.x[i] ?? 0;
      motion.dy = line.dy[i] ?? 0;
      motion.scaleY = line.scaleY[i] ?? 1;
      motion.originY = -line.cap / 2;
      motion.opacity = opacity;
      return motion;
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        const held = t - holdStart;
        // The wave eases in over the hold's first 0.9 s and runs on through the exit.
        const amp = held > 0 ? amplitude * ease.drift(clamp01(held / 0.9)) : 0;
        const cycle = held > 0 ? held / period : 0;

        for (const line of lines) {
          const { table, w, wt, extra, squeeze } = line;
          const { n, first, last } = table;
          let visible = false;
          let compressing = false;
          for (let i = 0; i < n; i++) {
            // Entrance: hairlines pop up, then spring to their width and weight.
            const since = t - (line.spring[i] ?? 0);
            const sp = since > 0 ? springProgress(since / timeScale, energy.spring) : 0;
            w[i] = axis.min + (line.base - axis.min) * sp;
            wt[i] = Math.min(holdWeight, fromWeight + (holdWeight - fromWeight) * sp);
            extra[i] = i < last ? -CLUSTER * (line.start[i] ?? 0) * (1 - Math.min(1, sp)) : 0;
            // Hold: a traveling wave through the widths (redistributed below).
            if (amp > 0) {
              const s = Math.sin(2 * Math.PI * (cycle - (line.phase[i] ?? 0)));
              w[i] = (w[i] ?? 0) + amp * (punchy ? Math.sign(s) * Math.abs(s) ** 0.55 : s);
            }
            const shown = (t - (line.appear[i] ?? 0)) / timeScale;
            line.opacity[i] = clamp01(shown / 0.08);
            line.scaleY[i] = 0.6 + 0.4 * ease[popCurve](clamp01(shown / 0.3));
            // Exit: compress to the narrowest width, drop weight, slide up out of the mask.
            const delay = line.exitDelay[i] ?? 0;
            squeeze[i] = tl.p(t, 'out', { delay, dur: 0.3 }, 'snap');
            const slide = tl.p(t, 'out', { delay: delay + 0.08, dur: 0.4 }, 'exit');
            line.dy[i] = -slide * line.mask.h;
            if ((squeeze[i] ?? 0) > 0) compressing = true;
            if ((line.opacity[i] ?? 0) > 0 && slide < 1) visible = true;
          }
          if (!visible) continue;

          // Hold: redistribute the widths so the line keeps its exact span.
          if (held > 0) redistribute(table, w, wt, extra, line.target, axis, line.solved);
          else line.solved.set(w);
          const { solved } = line;
          for (let i = 0; i < n; i++) {
            const k = squeeze[i] ?? 0;
            const width = (solved[i] ?? 100) + (axis.min - (solved[i] ?? 100)) * k;
            const weight = (wt[i] ?? holdWeight) + (fromWeight - (wt[i] ?? holdWeight)) * k;
            const step = k > 0 || weight < holdWeight - 1 ? WDTH_STEP_MOVING : WDTH_STEP;
            solved[i] = clamp(Math.round(width / step) * step, axis.min, axis.max);
            wt[i] = Math.min(holdWeight, Math.round(weight / WGHT_STEP) * WGHT_STEP);
          }
          place(line, held > 0 && !compressing);
          for (let i = first; i <= last; i++) {
            line.glyphs[i] = instance(line, i, solved[i] ?? 100, wt[i] ?? holdWeight);
          }

          current = line;
          const draw = () =>
            g.text(line.draw, { fill: fg, x: 0, y: line.baseline, glyph: animate });
          if (compressing) g.clip(line.mask, draw);
          else draw();
        }
        current = null;
        if (blockInk) g.editable('words', blockInk);
      },
    };
  },
});
