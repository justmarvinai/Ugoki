/**
 * Listicle — numbered tips (docs/templates/03-social.md §3.3).
 *
 * The expensive detail: one numeral and one progress bar stitch the whole list together. The
 * numeral never cuts — it turns like an odometer wheel from each number to the next (motion
 * blur does the rest), while the story-style segment of the current tip fills linearly under
 * it. Giant numerals are cropped by the frame edge optically: each digit keeps the same share of
 * its own ink in view (narrow 1s and wide 4s alike), and the numeral slides a touch while it
 * turns so every digit lands on its own crop.
 */

import {
  type Color,
  c,
  clamp01,
  contrastRatio,
  type Draw,
  defineTemplate,
  type EaseName,
  ease,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  mixOklab,
  type PathData,
  type Rect,
  type TextBlock,
  type TextLine,
  type TextStyle,
  unionRect,
  withAlpha,
} from '@/engine';
import { createNumeral, type NumeralPaint } from './numeral';
import { autoDuration, OUT, PACES, parseItems, planBeats, TAIL, TITLE_IN } from './plan';

type Composition = {
  /** Title card headline: size (u) and lines. */
  title: number;
  titleLines: number;
  /** Item title and detail sizes (u); item title lines. */
  item: number;
  itemLines: number;
  detail: number;
  /** Solid/outline numeral cap height (u). */
  numeral: number;
  /** `stack`: numeral above the text; `side`: numeral left of it. */
  layout: 'stack' | 'side';
  /** Share of the text column's width (side layouts and giant numerals). */
  column: number;
  /** Giant numeral cap height, as a share of the frame height. */
  giant: number;
  /** CTA text size and bookmark height (u). */
  cta: number;
  icon: number;
  /** Progress bar thickness (u). */
  bar: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '9:16': {
    title: 15,
    titleLines: 5,
    item: 12.5,
    itemLines: 4,
    detail: 5,
    numeral: 40,
    layout: 'stack',
    column: 1,
    giant: 0.58,
    cta: 10,
    icon: 22,
    bar: 0.8,
  },
  '4:5': {
    title: 12,
    titleLines: 4,
    item: 10.5,
    itemLines: 4,
    detail: 4.4,
    numeral: 30,
    layout: 'stack',
    column: 1,
    giant: 0.7,
    cta: 8,
    icon: 16,
    bar: 0.7,
  },
  '1:1': {
    title: 11.5,
    titleLines: 4,
    item: 10,
    itemLines: 4,
    detail: 4.2,
    numeral: 30,
    layout: 'stack',
    column: 1,
    giant: 0.8,
    cta: 7.6,
    icon: 15,
    bar: 0.7,
  },
  '16:9': {
    title: 12,
    titleLines: 3,
    item: 9.6,
    itemLines: 3,
    detail: 4,
    numeral: 58,
    layout: 'side',
    column: 0.5,
    giant: 0.94,
    cta: 7,
    icon: 15,
    bar: 0.6,
  },
};

/**
 * Transition timing (Balanced seconds): the leaving content clears its masks in LEAVE, the
 * arriving text starts rising at ARRIVE (by then the old lines are nearly gone), and holds start
 * their drift once everything has SETTLED.
 */
const LEAVE = 0.24;
const ARRIVE = 0.22;
const SETTLED = 0.8;

/** Share of a giant digit's ink width cropped by the frame's right edge (and height, bottom). */
const CROP_X = 0.2;
const CROP_Y = 0.07;

/** A bookmark (rounded top corners, notched foot) in `r`. */
function bookmark(r: Rect): PathData {
  const round = r.w * 0.14;
  const notch = r.h * 0.24;
  return [
    ['M', r.x, r.y + r.h],
    ['L', r.x, r.y + round],
    ['Q', r.x, r.y, r.x + round, r.y],
    ['L', r.x + r.w - round, r.y],
    ['Q', r.x + r.w, r.y, r.x + r.w, r.y + round],
    ['L', r.x + r.w, r.y + r.h],
    ['L', r.x + r.w / 2, r.y + r.h - notch],
    ['Z'],
  ];
}

const offset = (r: Rect, x: number, y: number): Rect => ({
  x: r.x + x,
  y: r.y + y,
  w: r.w,
  h: r.h,
});

export default defineTemplate({
  id: 'listicle',
  version: 1,
  meta: {
    name: 'Listicle',
    tagline: 'Numbered tips',
    category: 'social',
    tags: ['list', 'tips', 'top 3', 'how to', 'numbers'],
    useCases: ['Educational posts', 'Tips and tricks', 'Carousel to video', 'How-tos'],
  },
  formats: ['9:16', '1:1', '4:5', '16:9'],
  structure: 'sequence',
  duration: { default: 'auto', min: 6, max: 24 },
  alpha: 'none',
  poster: 4.6,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'sand' },
  ],
  pairings: ['grotesk', 'editorial', 'technical', 'soft', 'wide'],
  controls: {
    title: c.text({
      label: 'Title',
      default: '3 rules for motion that feels expensive',
      maxLength: 60,
      multiline: true,
      maxLines: 3,
      primary: true,
    }),
    items: c.text({
      label: 'Items',
      default: 'Ease out. Never linear.\nOverlap everything.\nHold long enough to read.',
      maxLength: 360,
      multiline: true,
      maxLines: 7,
      hint: 'One tip per line (2–7). Add a detail after a | bar.',
    }),
    cta: c.text({ label: 'CTA', default: 'Save this for later', maxLength: 32, optional: true }),
    numeral: c.choice({
      label: 'Numeral',
      default: 'solid',
      options: [
        { value: 'solid', label: 'Solid' },
        { value: 'outline', label: 'Outline' },
        { value: 'giant', label: 'Giant crop' },
      ],
    }),
    progress: c.toggle({ label: 'Progress bar', default: true }),
    pace: c.choice({
      label: 'Pace',
      group: 'motion',
      default: 'normal',
      options: [
        { value: 'chill', label: 'Chill' },
        { value: 'normal', label: 'Normal' },
        { value: 'hyper', label: 'Hyper' },
      ],
    }),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    {
      id: 'ink',
      name: 'Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'grotesk',
      values: { numeral: 'giant' },
    },
    {
      id: 'lilac',
      name: 'Lilac',
      palette: { kind: 'library', id: 'lilac' },
      pairing: 'grotesk',
      values: { numeral: 'outline' },
    },
  ],
  timing: ({ props, energy }) => ({
    in: TITLE_IN,
    out: OUT,
    tail: TAIL,
    auto: autoDuration(props.title, props.items, props.cta, PACES[props.pace], energy.time),
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const items = parseItems(props.items);
    const cta = props.cta.trim();
    const e = energy.time;
    const plan = planBeats(props.title.trim(), items, cta, PACES[props.pace], e, timeline.duration);
    const beats = plan.beats.beats;
    const k = e * plan.speed;
    const giant = props.numeral === 'giant';
    const display = pairing.display;

    // --- regions ----------------------------------------------------------------------------
    const bar: Rect = { x: area.x, y: area.y, w: area.w, h: comp.bar * u };
    const top = props.progress ? bar.y + bar.h + 5 * u : area.y;
    const content: Rect = { x: area.x, y: top, w: area.w, h: area.y + area.h - top };
    // Centered pieces sit on the frame's axis, even where the social zone isn't symmetric.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);

    const displayStyle = (size: number): TextStyle => ({
      font: display.font,
      italicFont: display.italic,
      size,
      weight: display.weight,
      width: display.width,
      tracking: display.tracking,
      features: display.features,
    });
    const setDisplay = (value: string, size: number, maxWidth: number, maxLines: number) =>
      text.layout(value || ' ', {
        style: displayStyle(size),
        maxWidth,
        maxLines,
        lineHeight: Math.max(display.lineHeight, 1),
        align: 'left',
        fit: { minSize: Math.max(2.4 * u, size * 0.5) },
      });
    const setDetail = (value: string, size: number, maxWidth: number) =>
      text.layout(value, {
        style: {
          font: pairing.text.font,
          size,
          weight: pairing.text.weight,
          width: pairing.text.width,
          tracking: pairing.text.tracking,
          features: pairing.text.features,
        },
        maxWidth,
        maxLines: 2,
        lineHeight: 1.3,
        align: 'left',
        fit: { minSize: 2.4 * u },
      });

    // --- numeral ----------------------------------------------------------------------------
    const capRatio = text.line('0', displayStyle(100)).capHeight / 100;
    const numeralCap = giant
      ? Math.min(comp.giant * frame.height, 1.05 * frame.width)
      : comp.numeral * u;
    const numeral = createNumeral(text, displayStyle(numeralCap / capRatio));
    const cap = numeral.odometer.capHeight;
    const widest = Math.max(...[1, 2, 3, 4, 5, 6, 7].map((d) => numeral.ink(d).w));

    // Giant numerals get a quiet tint of the accent (text reads on top of them). Mixed in
    // OKLab: a near-black's faint hue must not swing the mix through other hues.
    let tint = mixOklab(bg, accent, 0.2);
    for (let mix = 0.16; contrastRatio(fg, tint) < 7 && mix > 0.04; mix -= 0.04) {
      tint = mixOklab(bg, accent, mix);
    }
    const paint: NumeralPaint =
      props.numeral === 'outline'
        ? { outline: { color: accent, width: 0.022 * numeral.size, join: 'round' } }
        : { fill: giant ? tint : accent };

    // --- text column --------------------------------------------------------------------------
    const side = !giant && comp.layout === 'side';
    const textX = side ? content.x + widest + 7 * u : content.x;
    // Beside the numeral the text forms a block (a measure, not the rest of the width).
    const textW = side
      ? Math.min(content.x + content.w - textX, content.w * comp.column)
      : giant && comp.layout === 'side'
        ? content.w * comp.column
        : content.w;
    // The odometer's window reaches 0.12 em below the baseline: the text starts beyond it.
    const gapN = Math.max(6 * u, 0.12 * numeral.size + 3 * u);
    const detailGap = 2.8 * u;

    type ItemLayout = { title: TextBlock; detail: TextBlock | null; height: number };
    const setItem = (index: number, scale: number): ItemLayout => {
      const item = items[index] ?? { title: ' ', detail: '' };
      const title = setDisplay(item.title, comp.item * u * scale, textW, comp.itemLines);
      const detail = item.detail ? setDetail(item.detail, comp.detail * u * scale, textW) : null;
      const height = title.height + (detail ? detailGap + detail.capHeight + detail.height : 0);
      return { title, detail, height };
    };
    // Room for the text: below a stacked numeral, or the whole content area.
    const stacked = !giant && !side;
    const room = (textTop: number) => area.y + area.h - textTop - 0.3 * comp.item * u;
    const fitted = (index: number, available: number): ItemLayout => {
      let laid = setItem(index, 1);
      for (let i = 0; i < 3 && laid.height > available; i++) {
        laid = setItem(
          index,
          Math.max(0.4, (laid.height > 0 ? available / laid.height : 1) * 0.98),
        );
      }
      return laid;
    };
    const stackRoom = room(content.y + cap + gapN);
    let laidItems = items.map((_, i) => fitted(i, stacked ? stackRoom : content.h));
    const tallest = Math.max(0, ...laidItems.map((item) => item.height));

    // Vertical placement: the numeral stays put; the stack is centered for its tallest item.
    const stackTop = stacked
      ? content.y + Math.max(0, (content.h - (cap + gapN + tallest)) * 0.4)
      : content.y;
    if (stacked) laidItems = items.map((_, i) => fitted(i, room(stackTop + cap + gapN)));
    const numeralBaseline = giant
      ? frame.height + CROP_Y * cap
      : side
        ? content.y + (content.h + cap) / 2
        : stackTop + cap;
    const numeralX = (digit: number) => {
      const ink = numeral.ink(digit);
      return giant ? frame.width - ink.x - ink.w * (1 - CROP_X) : content.x - ink.x;
    };
    // The numeral turns inside its own region, never over the progress bar or the text.
    const numeralRegion: Rect | null = giant
      ? null
      : stacked
        ? {
            x: area.x - 4 * u,
            y: content.y - 2 * u,
            w: area.w + 8 * u,
            h: stackTop + cap + gapN - 2 * u - (content.y - 2 * u),
          }
        : { x: area.x - 4 * u, y: content.y - 2 * u, w: textX - area.x + u, h: content.h + 2 * u };
    // Where each item's text block starts (its first cap top).
    const itemTop = (laid: ItemLayout) =>
      stacked
        ? stackTop + cap + gapN
        : giant && comp.layout !== 'side'
          ? content.y + 3 * u
          : content.y + (content.h - laid.height) / 2;

    // --- title and CTA cards ------------------------------------------------------------------
    const titleW = comp.layout === 'side' ? content.w * 0.72 : content.w;
    const titleBlock = setDisplay(props.title.trim(), comp.title * u, titleW, comp.titleLines);
    const titleX = content.x;
    const titleY = content.y + (content.h - titleBlock.height) * 0.45;

    const ctaBlock = cta
      ? text.layout(cta, {
          style: displayStyle(comp.cta * u),
          maxWidth: half * 2,
          maxLines: 2,
          lineHeight: Math.max(display.lineHeight, 1),
          align: 'center',
          fit: { minSize: 2.4 * u },
        })
      : null;
    const iconH = comp.icon * u;
    const iconW = iconH * 0.74;
    const ctaGap = 5 * u;
    const ctaHeight = iconH + (ctaBlock ? ctaGap + ctaBlock.height : 0);
    const ctaTop = content.y + (content.h - ctaHeight) * 0.45;
    const icon: Rect = { x: frame.cx - iconW / 2, y: ctaTop, w: iconW, h: iconH };
    const iconPath = bookmark(icon);
    const ctaX = frame.cx - half;
    const ctaY = ctaTop + iconH + ctaGap;

    // --- schedule -----------------------------------------------------------------------------
    const beatStart = (index: number) => beats[index]?.start ?? Number.POSITIVE_INFINITY;
    const outStart = timeline.duration - TAIL - OUT * e;
    const itemBeat = (i: number) => 1 + i;
    const ctaBeat = cta ? 1 + items.length : -1;
    // When each piece leaves: at the next beat, or at the exit.
    const leaveAt = (index: number) => Math.min(beatStart(index + 1), outStart);
    const numeralOut = cta ? beatStart(ctaBeat) : outStart;

    // --- motion -------------------------------------------------------------------------------
    const enter: EaseName = energy.enter;
    const roll: EaseName = energy.id === 'calm' ? 'glide' : 'snap';
    const within = (t: number, start: number, delay: number, dur: number) =>
      clamp01((t - start - delay * k) / (dur * k));
    const lineGap = (0.08 * energy.stagger) / energy.time;
    const wordGap = (0.03 * energy.stagger) / energy.time;
    const drift = 0.6 * u * energy.travel;

    // Per-word rise shared by every block (reset per line; no allocation per frame).
    const wordCount = Math.max(
      titleBlock.wordCount,
      ctaBlock?.wordCount ?? 0,
      ...laidItems.map((item) => item.title.wordCount),
    );
    const wordRise = new Float64Array(Math.max(1, wordCount));
    const motion: GlyphTransform = { dy: 0 };
    const riseGlyph = (glyph: Glyph): GlyphTransform => {
      motion.dy = wordRise[glyph.word] ?? 0;
      return motion;
    };

    /** Lines rise word by word inside their masks, and leave upwards out of them. */
    const riseLines = (
      g: Draw,
      block: TextBlock,
      x: number,
      y: number,
      fill: Color,
      t: number,
      from: number,
      delay: number,
      leave: number,
    ) => {
      const rise = (block.lines[0]?.mask.h ?? block.size) * 1.05;
      block.lines.forEach((line: TextLine, i) => {
        // The leaving content goes as one block, so it has cleared before new lines arrive.
        const gone = ease.exit(within(t, leave, 0, LEAVE));
        if (gone >= 1) return;
        const firstWord = line.words[0]?.index ?? 0;
        let shown = false;
        for (const word of line.words) {
          const p = ease[enter](
            within(t, from, delay + i * lineGap + (word.index - firstWord) * wordGap, 0.6),
          );
          wordRise[word.index] = (1 - p) * rise;
          shown ||= p > 0;
        }
        if (!shown) return;
        g.clip(offset(line.mask, x, y), (g) =>
          g.text(line, { fill, x, y: y - gone * rise, glyph: riseGlyph }),
        );
      });
    };

    const titleBounds = offset(titleBlock.ink, titleX, titleY);
    const lockup: Rect = unionRect(content, titleBounds);

    return {
      render: ({ t, g }) => {
        g.fill(bg, { background: true });

        // Progress: segments grow in with the title, fill linearly through their item, fade out.
        if (props.progress && items.length > 0) {
          const gap = 1.2 * u;
          const n = items.length;
          const w = (bar.w - gap * (n - 1)) / n;
          const fade = 1 - ease.exit(within(t, outStart, 0, 0.35));
          if (fade > 0) {
            g.group({ opacity: fade }, (g) => {
              for (let i = 0; i < n; i++) {
                const grown = ease.glide(within(t, 0, 0.2 + i * 0.05, 0.5));
                if (grown <= 0) continue;
                const x = bar.x + i * (w + gap);
                const r = bar.h / 2;
                g.roundRect({ x, y: bar.y, w: w * grown, h: bar.h }, r, {
                  fill: withAlpha(fg, 0.16),
                });
                const start = beatStart(itemBeat(i));
                const end = Math.min(beatStart(itemBeat(i) + 1), outStart);
                const filled = end > start ? clamp01((t - start) / (end - start)) : 0;
                if (filled > 0) {
                  g.roundRect({ x, y: bar.y, w: w * grown * filled, h: bar.h }, r, { fill: fg });
                }
              }
            });
          }
        }

        g.movable('list', lockup, (g) => {
          // Title card.
          const titleLeave = leaveAt(0);
          if (t < titleLeave + 0.4 * k) {
            const settled = TITLE_IN * k;
            const hold = ease.drift(clamp01((t - settled) / Math.max(0.1, titleLeave - settled)));
            riseLines(g, titleBlock, titleX, titleY - drift * hold, fg, t, 0, 0.1, titleLeave);
            if (t < titleLeave) g.editable('title', titleBounds);
          }

          // Numeral: rolls in with the first item, turns n−1 → n, rolls out before the CTA.
          if (items.length > 0 && t >= beatStart(itemBeat(0))) {
            let index = 0;
            for (let i = 1; i < items.length; i++) if (t >= beatStart(itemBeat(i))) index = i;
            const leaving = t >= numeralOut;
            const turn = leaving
              ? ease[roll](within(t, numeralOut, 0, 0.4))
              : ease[roll](within(t, beatStart(itemBeat(index)), index === 0 ? 0.14 : 0.05, 0.42));
            const from = leaving ? index + 1 : index === 0 ? null : index;
            const to = leaving ? null : index + 1;
            if (!(leaving && turn >= 1)) {
              const x0 = numeralX(from ?? to ?? 1);
              const x1 = numeralX(to ?? from ?? 1);
              const x = x0 + (x1 - x0) * turn;
              const turning = (g: Draw) =>
                numeral.draw(g, from, to, turn, x, numeralBaseline, paint);
              if (numeralRegion) g.clip(numeralRegion, turning);
              else turning(g);
            }
          }

          // The current item (and the one leaving).
          for (let i = 0; i < items.length; i++) {
            const start = beatStart(itemBeat(i));
            const leave = leaveAt(itemBeat(i));
            if (t < start || t >= leave + 0.4 * k) continue;
            const laid = laidItems[i];
            if (!laid) continue;
            const y0 = itemTop(laid);
            const settled = start + SETTLED * k;
            const hold = ease.drift(clamp01((t - settled) / Math.max(0.1, leave - settled)));
            const y = y0 - drift * hold;
            riseLines(g, laid.title, textX, y, fg, t, start, ARRIVE, leave);
            if (laid.detail) {
              const dy = y + laid.title.height + detailGap + laid.detail.capHeight;
              const shown = ease.glide(within(t, start, ARRIVE + 0.12, 0.4));
              const gone = ease.exit(within(t, leave, 0, LEAVE * 0.8));
              const opacity = shown * (1 - gone);
              if (opacity > 0) {
                g.text(laid.detail, {
                  fill: muted,
                  x: textX,
                  y: dy + (1 - shown) * 1.2 * u - gone * 1.2 * u,
                  opacity,
                });
              }
            }
            if (t >= start && t < leave) {
              let bounds = offset(laid.title.ink, textX, y);
              if (laid.detail) {
                const dy = y + laid.title.height + detailGap + laid.detail.capHeight;
                bounds = unionRect(bounds, offset(laid.detail.ink, textX, dy));
              }
              g.editable('items', bounds);
            }
          }

          // CTA card: the bookmark draws on and pops, the words rise; the card drifts as it holds.
          if (cta && t >= beatStart(ctaBeat)) {
            const start = beatStart(ctaBeat);
            const settled = start + SETTLED * k;
            const ctaDrift =
              drift * ease.drift(clamp01((t - settled) / Math.max(0.1, outStart - settled)));
            const gone = ease.exit(within(t, outStart, 0, 0.3));
            const drawn = ease.drift(within(t, start, 0.1, 0.5));
            const popped = within(t, start, 0.1, 0.45);
            const scale =
              energy.id === 'calm'
                ? 0.85 + 0.15 * ease.glide(popped)
                : 0.6 + 0.4 * ease.pop(popped);
            const filled = ease.glide(within(t, start, 0.45, 0.25));
            if (gone < 1 && drawn > 0) {
              g.group(
                {
                  scale,
                  originX: icon.x + icon.w / 2,
                  originY: icon.y + icon.h / 2,
                  y: -gone * 3 * u - ctaDrift,
                  opacity: 1 - gone,
                },
                (g) => {
                  if (filled > 0) g.path(iconPath, { fill: accent, opacity: filled });
                  g.path(iconPath, {
                    stroke: {
                      color: fg,
                      width: 0.9 * u,
                      join: 'round',
                      cap: 'round',
                      trim: [0, drawn],
                    },
                  });
                },
              );
            }
            if (ctaBlock) {
              riseLines(g, ctaBlock, ctaX, ctaY - ctaDrift, fg, t, start, ARRIVE + 0.08, outStart);
              if (t < outStart) g.editable('cta', offset(ctaBlock.ink, ctaX, ctaY));
            }
          }
        });
      },
    };
  },
});
