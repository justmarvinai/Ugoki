/**
 * Versus — this or that (docs/templates/03-social.md §3.4).
 *
 * The expensive detail: the result is physical, and exact. Each option's vote pill becomes its
 * result bar; the bars fill while the percentages count in tabular figures (every digit in a slot
 * as wide as the widest, the box reserved at the final width) and each number lands on its final
 * value on the frame its bar stops moving — never before. Then the winner's seam pushes 6% into
 * the loser's side on a spring (it overshoots and settles, carrying the VS badge, while the
 * layout on both sides gives way), the winner gets its check and the loser dims. At the end the
 * winner takes the frame: the seam wipes across to a solid field in its color — the color the
 * video started on, so first and last frames match.
 */

import {
  adjustLightness,
  bestContrast,
  CLEAN_END,
  type Color,
  c,
  clamp,
  clamp01,
  contrastRatio,
  createOdometer,
  type Draw,
  defineTemplate,
  type EaseName,
  ease,
  ensureContrast,
  type Figure,
  type FormatId,
  formatFigure,
  type Graphic,
  mixOklch,
  type PaletteRole,
  type PathCommand,
  type Rect,
  springProgress,
  type TextBlock,
  type TextLine,
  type Timeline,
  withAlpha,
} from '@/engine';
import { clearanceShift, createSeam, fieldPath, seamPoint } from './split';

type Layout = 'rows' | 'columns';

type Composition = {
  /** `rows`: A on top, B below; `columns`: A left, B right. */
  layout: Layout;
  /** Lean of the diagonal split (degrees). */
  tilt: number;
  /** What Auto picks for this format (spec: diagonal in 1:1 and 4:5). */
  auto: 'straight' | 'diagonal';
  /** Question size (u). */
  question: number;
  /** Largest option label size (u). */
  label: number;
  /** VS badge radius (u). */
  badge: number;
  /** Vote pill / result bar height (u). */
  row: number;
  /** Image height (u), when images are on. */
  image: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '9:16': {
    layout: 'rows',
    tilt: 8,
    auto: 'straight',
    question: 7,
    label: 20,
    badge: 10,
    row: 6,
    image: 22,
  },
  '4:5': {
    layout: 'rows',
    tilt: 7,
    auto: 'diagonal',
    question: 5.6,
    label: 15,
    badge: 7.2,
    row: 4.8,
    image: 14,
  },
  '1:1': {
    layout: 'rows',
    tilt: 8,
    auto: 'diagonal',
    question: 5.4,
    label: 15,
    badge: 7.4,
    row: 4.8,
    image: 14,
  },
  '16:9': {
    layout: 'columns',
    tilt: 10,
    auto: 'straight',
    question: 7,
    label: 18,
    badge: 9,
    row: 5.2,
    image: 24,
  },
};

const PAIRS = {
  'bg-accent': ['bg', 'accent'],
  'accent-accent2': ['accent', 'accent2'],
  'bg-fg': ['bg', 'fg'],
  'bg-accent2': ['bg', 'accent2'],
} as const satisfies Record<string, readonly [PaletteRole, PaletteRole]>;

/** The winner's seam push, as a share of the frame along the split (spec: 6%). */
const PUSH = 0.06;

// --- choreography (Balanced seconds from the start of `in`) -----------------------------------
const SLIDE = 0.5;
const BADGE_AT = 0.4;
const BADGE_DUR = 0.4;
const LABELS_AT = 0.62;
const QUESTION_AT = 0.6;
/** Hint pulses (seconds into the hold). */
const PULSES = [0.2, 0.75] as const;

const win = (t: number, start: number, dur: number, curve: EaseName) =>
  ease[curve](dur <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / dur));

/** A check mark on a 24-unit grid. */
const CHECK: PathCommand[] = [
  ['M', 6.2, 12.4],
  ['L', 10.2, 16.4],
  ['L', 17.8, 8],
];

type Side = {
  key: 'A' | 'B';
  /** −1 for A (its side of the seam), +1 for B. */
  sign: -1 | 1;
  field: Color;
  ink: Color;
  label: TextBlock | null;
  image: Graphic | null;
  /** Block center at rest (before the push), and its parts relative to the block's top. */
  cx: number;
  top: number;
  width: number;
  height: number;
  imageRect: Rect | null;
  labelY: number;
  rowY: number;
  figure: Figure;
  /** The final percentage. */
  value: number;
};

export default defineTemplate({
  id: 'versus',
  version: 1,
  meta: {
    name: 'Versus',
    tagline: 'This or that',
    category: 'social',
    tags: ['poll', 'versus', 'comparison', 'debate', 'results'],
    useCases: ['Polls', 'Debates', 'Product comparisons', 'Engagement posts'],
  },
  formats: ['9:16', '1:1', '4:5', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 4, max: 12 },
  alpha: 'none',
  poster: 4.5,
  palettes: [
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'bauhaus' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'hazard' },
  ],
  pairings: ['poster', 'sport', 'grotesk', 'wide', 'quirky'],
  controls: {
    question: c.text({
      label: 'Question',
      default: 'Morning person or night owl?',
      maxLength: 56,
      multiline: true,
      maxLines: 2,
      primary: true,
      optional: true,
    }),
    labelA: c.text({ label: 'Option A', default: 'SUNRISE', maxLength: 16 }),
    labelB: c.text({ label: 'Option B', default: 'MIDNIGHT', maxLength: 16 }),
    resultA: c.number({
      label: 'Result A',
      group: 'content',
      default: 41,
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      hint: 'Option B gets the rest',
    }),
    results: c.toggle({ label: 'Show results', group: 'content', default: true }),
    hint: c.text({
      label: 'Vote hint',
      default: 'Tap to vote',
      maxLength: 18,
      optional: true,
      hint: 'On each option’s vote pill, before the results',
    }),
    images: c.toggle({
      label: 'Images',
      group: 'content',
      default: false,
      hint: 'A cut-out image with each option',
    }),
    imageA: c.image({
      label: 'Image A',
      accept: 'object',
      default: { kind: 'placeholder', id: 'object-bottle' },
      optional: true,
    }),
    imageB: c.image({
      label: 'Image B',
      accept: 'object',
      default: { kind: 'placeholder', id: 'object-can' },
      optional: true,
    }),
    split: c.choice({
      label: 'Split',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'straight', label: 'Straight' },
        { value: 'diagonal', label: 'Diagonal' },
      ],
    }),
    colors: c.choice({
      label: 'A/B colors',
      default: 'bg-accent',
      display: 'select',
      options: [
        { value: 'bg-accent', label: 'Background · Accent' },
        { value: 'accent-accent2', label: 'Accent · Accent 2' },
        { value: 'bg-fg', label: 'Background · Text' },
        { value: 'bg-accent2', label: 'Background · Accent 2' },
      ],
    }),
  },
  looks: [
    {
      id: 'tangerine-indigo',
      name: 'Tangerine vs Indigo',
      palette: { kind: 'library', id: 'tangerine' },
      pairing: 'poster',
      values: { colors: 'bg-accent' },
    },
    {
      id: 'ink-paper',
      name: 'Ink vs Paper',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'poster',
      values: { colors: 'bg-fg' },
    },
    {
      id: 'candy-lemon',
      name: 'Candy vs Lemon',
      palette: { kind: 'library', id: 'candy' },
      pairing: 'poster',
      values: { colors: 'bg-accent2' },
    },
  ],
  timing: ({ props }) => ({
    lead: 0.05,
    in: 1.35,
    out: 0.55,
    tail: CLEAN_END,
    readable: `${props.question} ${props.labelA} ${props.labelB}`,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { roles } = palette;
    const comp = COMPOSITIONS[frame.format];
    const layout = comp.layout;
    const diagonal =
      props.split === 'diagonal' || (props.split === 'auto' && comp.auto === 'diagonal');
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    // Centered pieces sit on the frame's axis, even where the social zone isn't symmetric.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const column = { x: frame.cx - half, w: half * 2 };
    const whole: Rect = { x: -2, y: -2, w: frame.width + 4, h: frame.height + 4 };
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';

    // --- colors: two fields, their inks, the badge ------------------------------------------------
    const [roleA, roleB] = PAIRS[props.colors];
    const fieldA = roles[roleA];
    const fieldB = roles[roleB];
    const candidates = [
      roles.fg,
      roles.bg,
      roles.accent,
      roles.accent2,
      roles.accent3,
      roles.surface,
    ];
    const inkOn = (field: Color) => ensureContrast(bestContrast(field, candidates), field, 4.5);
    const inkA = inkOn(fieldA);
    const inkB = inkOn(fieldB);
    // The badge straddles the seam: the palette color that stands out most on both fields.
    let badgeFill = inkA;
    let badgeScore = -1;
    for (const color of candidates) {
      const score = Math.min(contrastRatio(color, fieldA), contrastRatio(color, fieldB));
      if (score > badgeScore) {
        badgeScore = score;
        badgeFill = color;
      }
    }
    const badgeInk = bestContrast(badgeFill, [fieldA, fieldB, inkA, inkB]);
    // A ring keeps it off a field it barely contrasts with.
    const badgeRing = badgeScore < 2 ? bestContrast(badgeFill, [inkA, inkB, fieldA, fieldB]) : null;

    // --- results ----------------------------------------------------------------------------------
    const showResults = props.results;
    const valueA = clamp(Math.round(props.resultA), 0, 100);
    const valueB = 100 - valueA;
    const winner: 'A' | 'B' | null =
      !showResults || valueA === valueB ? null : valueA > valueB ? 'A' : 'B';
    // The video starts and ends on the winner's color (A without a winner): its field is the
    // background, and the other field is what slides in, gets pushed and is wiped away.
    const base = winner === 'B' ? fieldB : fieldA;
    const moving: 'A' | 'B' = winner === 'B' ? 'A' : 'B';
    // The loser dims: its field darkens (lightness, not chroma — it stays its own color).
    const dimmed = (field: Color, amount: number) =>
      mixOklch(field, adjustLightness(field, -0.1), amount);

    // --- type -------------------------------------------------------------------------------------
    const display = pairing.display;
    const displayStyle = (size: number) => ({
      font: display.font,
      italicFont: display.italic,
      size,
      weight: display.weight,
      width: display.width,
      tracking: display.tracking,
      features: display.features,
    });
    const questionText = props.question.trim();
    const question: TextBlock | null = questionText
      ? text.layout(questionText, {
          style: displayStyle(comp.question * u),
          maxWidth: column.w,
          maxLines: 2,
          lineHeight: Math.max(display.lineHeight, 1),
          align: 'center',
          fit: { minSize: comp.question * u * 0.6 },
        })
      : null;
    // The question sits at the top of the layout area (its accents may rise above cap height).
    const questionTop = area.y + (question ? Math.max(0, -question.ink.y) : 0);
    const questionBottom = question ? questionTop + question.height + 0.22 * question.size : area.y;
    const questionX = column.x;

    const push = PUSH * (layout === 'rows' ? frame.height : frame.width);
    const badgeR = comp.badge * u;
    const rowH = comp.row * u;
    const hint = props.hint.trim();
    // Before results each option has a vote pill (taller, with the hint), which becomes its bar.
    const pillH = hint ? rowH * 1.45 : rowH;
    const imageH = props.images ? comp.image * u : 0;
    const graphics = {
      A: props.images ? ctx.graphic('imageA') : null,
      B: props.images ? ctx.graphic('imageB') : null,
    };
    const tilt = diagonal ? comp.tilt : 0;
    const slope = Math.tan((tilt * Math.PI) / 180);
    // Room between a block and the seam: the badge sits on it. The loser's side keeps half the
    // push in reserve (both sides give way by half the seam's travel).
    const clear = badgeR + 2.5 * u;
    const give = winner ? push * 0.5 : 0;
    const gapA = clear + (winner === 'B' ? give : 0);
    const gapB = clear + (winner === 'A' ? give : 0);

    // Each side's block: [image] label [row]. Rows share the column; columns get their half.
    const sideW =
      layout === 'rows'
        ? column.w * (diagonal ? 0.84 : 0.92)
        : Math.min(
            frame.cx - area.x - clear - 2 * give - (diagonal ? 16 * u * slope : 0),
            area.w * 0.36,
          );
    const hasRow = showResults || hint.length > 0;
    const imageGap = 2.6 * u;
    const setLabels = (size: number) => {
      const set = (value: string, at: number, fit: boolean) =>
        value
          ? text.layout(value, {
              style: displayStyle(at),
              maxWidth: sideW,
              maxLines: 1,
              lineHeight: 1,
              align: 'center',
              fit: fit ? { minSize: at * 0.3 } : undefined,
            })
          : null;
      const valueA = props.labelA.trim();
      const valueB = props.labelB.trim();
      const a = set(valueA, size, true);
      const b = set(valueB, size, true);
      // Both options at one size: the smaller of their fitted sizes.
      const fitted = Math.min(a?.size ?? size, b?.size ?? size);
      if (fitted >= size - 1e-6) return { a, b, size };
      return { a: set(valueA, fitted, false), b: set(valueB, fitted, false), size: fitted };
    };
    const measure = (labels: ReturnType<typeof setLabels>) => {
      const blocks = [labels.a, labels.b];
      const cap = blocks.find((b) => b)?.capHeight ?? labels.size * 0.72;
      // Below the baseline: descenders (labels may have them, as typed) or a little air.
      const depth = Math.max(
        0.06 * cap,
        ...blocks.map((b) => (b ? b.ink.y + b.ink.h - b.capHeight : 0)),
      );
      const rowGap = Math.max(3 * u, 0.2 * cap);
      const height =
        (imageH > 0 ? imageH + imageGap : 0) + cap + depth + (hasRow ? rowGap + pillH : 0);
      return { cap, depth, rowGap, height };
    };
    let labels = setLabels(comp.label * u);
    let block = measure(labels);
    const questionGap = 3.2 * u;
    const top = questionBottom + (question ? questionGap : 0);
    // Rows: everything stacks — question, A, seam, B — so the labels shrink until it all fits.
    const offsetX = layout === 'rows' && diagonal ? column.w * 0.05 : 0;
    const tiltRoom = layout === 'rows' ? (sideW / 2 - offsetX) * slope : 0;
    const rowsNeed = (height: number) =>
      top +
      (winner === 'B' ? give : 0) +
      height +
      gapA +
      tiltRoom * 2 +
      gapB +
      height +
      (winner === 'A' ? give : 0) -
      area.y;
    if (layout === 'rows') {
      for (let i = 0; i < 12 && rowsNeed(block.height) > area.h; i++) {
        const over = rowsNeed(block.height) - area.h;
        const next = labels.size * Math.max(0.6, 1 - over / (2 * block.cap) - 0.02);
        labels = setLabels(next);
        block = measure(labels);
      }
    }
    const labelA = labels.a;
    const labelB = labels.b;
    const labelCap = block.cap;
    const blockH = block.height;

    // Result row: [track][gap][number][gap][check]. The number reserves its final width.
    const probe = createOdometer(text, displayStyle(100));
    const numberSize = (rowH * 1.02) / (probe.capHeight / 100);
    const odometer = createOdometer(text, displayStyle(numberSize));
    odometer.width('0123456789%'); // lays every glyph out now, not while rendering
    const figureA = { prefix: '', value: valueA, decimals: 0, grouping: false, suffix: '%' };
    const figureB = { ...figureA, value: valueB };
    const numberW = Math.max(
      odometer.width(formatFigure(figureA)),
      odometer.width(formatFigure(figureB)),
    );
    const checkD = rowH * 1.08;
    const rowW = sideW;
    const gapN = 2.2 * u;
    const trackW = Math.max(rowH * 2, rowW - numberW - gapN - (winner ? checkD + gapN : 0));
    const hintBlock = hint
      ? text.layout(hint, {
          style: {
            font: pairing.text.font,
            size: pillH * 0.38,
            weight: 640,
            width: pairing.text.width,
            tracking: 0.02,
            features: pairing.text.features,
          },
          maxWidth: rowW - pillH,
          maxLines: 1,
          lineHeight: 1.2,
          align: 'center',
          fit: { minSize: 2.4 * u },
        })
      : null;

    // --- placing the seam and each side's block --------------------------------------------------------
    type Box = { x: number; y: number };
    let seamY = frame.cy;
    let boxA: Box;
    let boxB: Box;
    if (layout === 'rows') {
      const free = Math.max(0, area.h - rowsNeed(blockH));
      const aTop = top + (winner === 'B' ? give : 0) + free * 0.34;
      seamY = aTop + blockH + gapA + tiltRoom + free * 0.16;
      const bTop = seamY + tiltRoom + gapB + free * 0.16;
      boxA = { x: frame.cx - offsetX - rowW / 2, y: aTop };
      boxB = { x: frame.cx + offsetX - rowW / 2, y: bTop };
    } else {
      // Columns: blocks side by side, centered under the question; the badge on the labels' line.
      const cy = (top + area.y + area.h) / 2;
      const lift = diagonal ? Math.min(blockH * 0.5, (area.y + area.h - top) * 0.1) : 0;
      // The side that gets pushed keeps room on its outer edge for the push.
      const aX = (area.x + (winner === 'B' ? give : 0) + frame.cx - gapA) / 2;
      const bX = (frame.cx + gapB + area.x + area.w - (winner === 'A' ? give : 0)) / 2;
      boxA = { x: aX - rowW / 2, y: cy - blockH / 2 - lift };
      boxB = { x: bX - rowW / 2, y: cy - blockH / 2 + lift };
      seamY = cy - blockH / 2 + (imageH > 0 ? imageH + imageGap : 0) + labelCap / 2;
    }
    const seam = createSeam(frame, layout, tilt, frame.cx, seamY);
    const place = (key: 'A' | 'B', at: Box): Side => {
      const sign = key === 'A' ? -1 : 1;
      let box: Rect = { x: at.x, y: at.y, w: rowW, h: blockH };
      // A tilted seam comes closer at one corner: keep the block clear of it.
      const away = clearanceShift(seam, box, 0, sign, key === 'A' ? gapA : gapB);
      box = { ...box, x: box.x + sign * seam.nx * away, y: box.y + sign * seam.ny * away };
      // Inside the layout area — also once the push has moved it (half the seam's travel).
      const mx = Math.abs(seam.nx) * give;
      const my = Math.abs(seam.ny) * give;
      box.y = clamp(
        box.y,
        top + (winner === 'B' ? my : 0),
        area.y + area.h - box.h - (winner === 'A' ? my : 0),
      );
      box.x = clamp(
        box.x,
        area.x + (winner === 'B' ? mx : 0),
        area.x + area.w - box.w - (winner === 'A' ? mx : 0),
      );
      const imageRect: Rect | null =
        imageH > 0
          ? { x: box.x + box.w / 2 - imageH * 0.6, y: box.y, w: imageH * 1.2, h: imageH }
          : null;
      const labelY = box.y + (imageH > 0 ? imageH + imageGap : 0);
      return {
        key,
        sign,
        field: key === 'A' ? fieldA : fieldB,
        ink: key === 'A' ? inkA : inkB,
        label: key === 'A' ? labelA : labelB,
        image: graphics[key],
        cx: box.x + box.w / 2,
        top: box.y,
        width: box.w,
        height: box.h,
        imageRect,
        labelY,
        rowY: labelY + labelCap + block.depth + block.rowGap,
        figure: key === 'A' ? figureA : figureB,
        value: key === 'A' ? valueA : valueB,
      };
    };
    const sides = [place('A', boxA), place('B', boxB)] as const;

    // --- timing ---------------------------------------------------------------------------------------
    const hold = timeline.sections.hold;
    const holdLength = Math.max(0, hold.end - hold.start);
    const resultsAt = hold.start + clamp(0.34 * holdLength, 0.35, 3.5);
    const fillDur = Math.min(punchy ? 0.95 : calm ? 1.4 : 1.2, Math.max(0.4, 0.42 * holdLength));
    const fillCurve: EaseName = punchy ? 'snap' : 'glide';
    const settleAt = resultsAt + fillDur;
    const springName = energy.spring;
    const slideCurve: EaseName = calm ? 'glide' : 'snap';
    const slam = calm ? 1.5 : punchy ? 2.6 : 2.2;
    const shakeAmp = calm ? 0 : 0.9 * u * energy.travel;
    const shakeRng = ctx.rng('shake');
    const shake = [
      shakeRng.range(-1, 1),
      shakeRng.range(-1, 1),
      shakeRng.range(-1, 1),
      shakeRng.range(-1, 1),
    ];
    const landAt = timeline.at('in', SLIDE);
    const labelRise = (labelA ?? labelB)?.lines[0]?.mask.h ?? labelCap;
    const drift = ctx.travel(0.5 * u);

    // --- drawing helpers -----------------------------------------------------------------------------
    /** The winner's push at t: a spring toward the loser (signed offset along n). */
    const pushed = (t: number) => {
      if (!winner || t <= settleAt) return 0;
      return (winner === 'A' ? 1 : -1) * push * springProgress(t - settleAt, springName);
    };

    /** Draws `fn` split along the seam: in A's ink on A's side, in B's ink on B's side. */
    const splitInk = (g: Draw, s: number, fn: (g: Draw, ink: Color) => void) => {
      const pathA = fieldPath(seam, whole, s, -1);
      const pathB = fieldPath(seam, whole, s, 1);
      if (pathA) g.clip({ path: pathA }, (g) => fn(g, inkA));
      if (pathB) g.clip({ path: pathB }, (g) => fn(g, inkB));
    };

    const drawRow = (g: Draw, side: Side, t: number, tl: Timeline) => {
      const cy = side.rowY + pillH / 2;
      const x = side.cx - side.width / 2;
      const reveal = showResults ? win(t, resultsAt - 0.05, 0.3, 'snap') : 0;
      // The vote pill appears after the labels; with results it narrows into the track.
      const shown = hint ? tl.p(t, 'in', { delay: LABELS_AT + 0.3, dur: 0.4 }, 'swift') : reveal;
      if (shown <= 0) return;
      const w = rowW + (trackW - rowW) * reveal;
      const h = pillH + (rowH - pillH) * reveal;
      const y = cy - h / 2;
      let pulse = 0;
      if (hint && t > hold.start) {
        if (showResults) {
          for (const at of PULSES) {
            const p = (t - hold.start - at) / 0.45;
            if (p > 0 && p < 1) pulse = Math.max(pulse, Math.sin(p * Math.PI));
          }
        } else {
          // Without results the pills keep inviting votes through the hold.
          const p = (((t - hold.start - PULSES[0]) % 1.3) + 1.3) % 1.3;
          if (t - hold.start > PULSES[0] && p < 0.45) pulse = Math.sin((p / 0.45) * Math.PI);
        }
      }
      const outline = Math.max(0.3 * u, 1.2);
      const scale = 1 + 0.045 * pulse * (1 - reveal);
      g.group({ scale, originX: x + w / 2, originY: cy, opacity: shown }, (g) => {
        g.roundRect({ x, y, w, h }, h / 2, {
          fill: withAlpha(side.ink, 0.16 + 0.06 * (1 - reveal)),
        });
        if (reveal < 1) {
          g.roundRect(
            { x: x + outline / 2, y: y + outline / 2, w: w - outline, h: h - outline },
            (h - outline) / 2,
            { stroke: { color: side.ink, width: outline }, opacity: 1 - reveal },
          );
          if (hintBlock) {
            const line = hintBlock.lines[0] as TextLine;
            g.text(hintBlock, {
              fill: side.ink,
              x: side.cx - line.width / 2 - line.x,
              y: cy - hintBlock.capHeight / 2,
              opacity: 1 - reveal * 2,
            });
          }
          // A tap ripple rides each pulse.
          if (pulse > 0) {
            const grow = 1.6 * u * pulse;
            g.roundRect(
              { x: x - grow, y: y - grow, w: w + 2 * grow, h: h + 2 * grow },
              h / 2 + grow,
              { stroke: { color: side.ink, width: outline }, opacity: 0.55 * (1 - pulse) },
            );
          }
        }
        if (reveal <= 0) return;
        // Fill and count share one progress; the number shows its final value only once the
        // bar is within a hair of its end, so both land on the same frame.
        const p = win(t, resultsAt, fillDur, fillCurve);
        const full = (trackW * side.value) / 100;
        const fillW = full * p;
        if (fillW > 0.5) {
          g.roundRect({ x, y: cy - rowH / 2, w: Math.max(rowH, fillW), h: rowH }, rowH / 2, {
            fill: side.ink,
            opacity: fillW < rowH ? fillW / rowH : 1,
          });
        }
        const landed = (1 - p) * full < 0.35;
        const value = landed ? side.value : Math.min(side.value - 1, Math.floor(side.value * p));
        odometer.draw(g, formatFigure(side.figure, Math.max(0, value)), {
          x: x + trackW + gapN + numberW,
          y: cy + odometer.capHeight / 2,
          fill: side.ink,
          align: 'right',
          opacity: reveal,
        });
        // The winner's check pops in as the push begins.
        if (winner === side.key && t > settleAt) {
          const pop = win(t, settleAt + 0.04, 0.34, calm ? 'glide' : 'pop');
          const checkX = x + trackW + gapN + numberW + gapN + checkD / 2;
          g.group({ scale: pop, originX: checkX, originY: cy }, (g) => {
            g.circle(checkX, cy, checkD / 2, { fill: side.ink });
            const k = (checkD * 0.74) / 24;
            g.group({ x: checkX - 12 * k, y: cy - 12 * k, scale: k }, (g) =>
              g.path(CHECK, {
                stroke: {
                  color: side.field,
                  width: 3.2,
                  cap: 'round',
                  join: 'round',
                  trim: [0, win(t, settleAt + 0.12, 0.3, 'glide')],
                },
              }),
            );
          });
        }
      });
    };

    const drawSide = (g: Draw, side: Side, t: number, tl: Timeline, dim: number) => {
      const loser = winner !== null && winner !== side.key;
      const out = tl.p(t, 'out', { dur: 0.3 }, 'exit');
      const opacity = (1 - out) * (loser ? 1 - 0.25 * dim : 1);
      if (opacity <= 0) return;
      // Both sides give way with the push (half the seam's travel) and drift while they hold.
      const shift = pushed(t) * 0.5;
      const breath = drift * tl.p(t, 'hold', {}, 'drift');
      g.group({ x: seam.nx * shift, y: seam.ny * shift - breath, opacity }, (g) => {
        if (side.image && side.imageRect) {
          const p = tl.p(t, 'in', { delay: LABELS_AT - 0.08, dur: 0.6 }, energy.enter);
          if (p > 0) {
            g.group({ y: (1 - p) * 3 * u, opacity: p }, (g) =>
              g.graphic(side.image as Graphic, side.imageRect as Rect, { fit: 'contain' }),
            );
          }
          g.editable(side.key === 'A' ? 'imageA' : 'imageB', side.imageRect);
        }
        const label = side.label;
        const line = label?.lines[0];
        if (label && line) {
          const delay = LABELS_AT + (side.key === 'B' ? ctx.stagger(0.08) : 0);
          const p = tl.p(t, 'in', { delay, dur: 0.6 }, energy.enter);
          const x = side.cx - line.width / 2 - line.x;
          if (p > 0) {
            const mask: Rect = {
              x: side.cx - sideW / 2 - 2 * u,
              y: side.labelY + line.mask.y,
              w: sideW + 4 * u,
              h: line.mask.h,
            };
            g.clip(mask, (g) =>
              g.text(line, { fill: side.ink, x, y: side.labelY + (1 - p) * labelRise }),
            );
          }
          g.editable(side.key === 'A' ? 'labelA' : 'labelB', {
            x: x + line.ink.x,
            y: side.labelY + line.ink.y,
            w: line.ink.w,
            h: line.ink.h,
          });
        }
        if (hasRow) drawRow(g, side, t, tl);
      });
    };

    const drawQuestion = (g: Draw, t: number, tl: Timeline, ink: Color) => {
      if (!question) return;
      const gone = tl.p(t, 'out', { dur: 0.3 }, 'exit');
      question.lines.forEach((line, i) => {
        const delay = QUESTION_AT + i * ctx.stagger(0.07);
        const p = tl.p(t, 'in', { delay, dur: 0.55 }, energy.enter);
        if (p <= 0 || gone >= 1) return;
        const mask: Rect = {
          x: questionX + line.mask.x,
          y: questionTop + line.mask.y,
          w: line.mask.w,
          h: line.mask.h,
        };
        g.clip(mask, (g) =>
          g.text(line, {
            fill: ink,
            x: questionX,
            y: questionTop - (1 - p) * line.mask.h * 1.05,
            opacity: 1 - gone,
          }),
        );
      });
    };

    const vsSize = (badgeR * 0.7) / (text.line('V', displayStyle(100)).capHeight / 100);
    const vs = text.line('VS', displayStyle(vsSize));
    const questionBounds: Rect | null = question
      ? {
          x: questionX + question.ink.x,
          y: questionTop + question.ink.y,
          w: question.ink.w,
          h: question.ink.h,
        }
      : null;

    return {
      render: ({ t, g, tl }) => {
        g.fill(base, { background: true });

        // The seam: the moving field slides in from its edge, the winner pushes, the exit
        // wipes the moving field away.
        const slid = tl.p(t, 'in', { dur: SLIDE }, slideCurve);
        const edge = (moving === 'A' ? -1 : 1) * (seam.reach + 4);
        const wipe = tl.p(t, 'out', { dur: 0.5 }, 'snap');
        const rest = pushed(t);
        const s = rest + (edge - rest) * Math.max(1 - slid, wipe);
        // The fields collide: two 30 fps frames of shake.
        let sx = 0;
        let sy = 0;
        const since = t - landAt;
        if (shakeAmp > 0 && since >= 0 && since < 2 / 30) {
          const k = since < 1 / 30 ? 0 : 2;
          sx = (shake[k] ?? 0) * shakeAmp;
          sy = (shake[k + 1] ?? 0) * shakeAmp;
        }
        const dim = winner ? win(t, settleAt, 0.45, 'swift') : 0;
        const movingField = moving === 'A' ? fieldA : fieldB;
        const fill = dim > 0 ? dimmed(movingField, dim) : movingField;

        g.group({ x: sx, y: sy }, (g) => {
          const path = fieldPath(seam, whole, s, moving === 'A' ? -1 : 1);
          if (path) g.path(path, { fill });

          for (const side of sides) {
            drawSide(g, side, t, tl, winner !== null && winner !== side.key ? dim : 0);
          }

          // The question drops in; across a seam it takes each field's ink.
          if (question) {
            if (layout === 'rows') drawQuestion(g, t, tl, inkA);
            else splitInk(g, s, (g, ink) => drawQuestion(g, t, tl, ink));
            if (questionBounds) g.editable('question', questionBounds);
          }

          // VS badge: slams onto the seam (2.2× → 1) with a ring shockwave; rides the push.
          const center = seamPoint(seam, s);
          const slamP = tl.p(t, 'in', { delay: BADGE_AT, dur: BADGE_DUR }, calm ? 'glide' : 'pop');
          const leave = tl.p(t, 'out', { dur: 0.28 }, 'exit');
          const scale = (slam + (1 - slam) * slamP) * (1 - leave);
          const shown = tl.p(t, 'in', { delay: BADGE_AT, dur: 0.06 });
          if (shown <= 0 || scale <= 0) return;
          const ringP = tl.p(t, 'in', { delay: BADGE_AT + BADGE_DUR * 0.45, dur: 0.5 }, 'glide');
          if (!calm && ringP > 0 && ringP < 1) {
            g.circle(center.x, center.y, badgeR * (1 + 1.5 * ringP * energy.travel), {
              stroke: { color: badgeFill, width: 1.8 * u * (1 - ringP) + 0.1 },
              opacity: 1 - ringP * ringP,
            });
          }
          g.group({ scale, originX: center.x, originY: center.y, opacity: shown }, (g) => {
            g.circle(center.x, center.y, badgeR, { fill: badgeFill });
            if (badgeRing) {
              g.circle(center.x, center.y, badgeR - 0.25 * u, {
                stroke: { color: badgeRing, width: 0.5 * u },
              });
            }
            g.text(vs, {
              fill: badgeInk,
              x: center.x - vs.ink.x - vs.ink.w / 2,
              y: center.y - vs.capHeight / 2,
            });
          });
        });
      },
    };
  },
});
