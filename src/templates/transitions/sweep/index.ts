/**
 * Sweep — type transition (docs/templates/08-transitions.md §8.5).
 *
 * The expensive detail: the word's size and the fill trailing it are solved together. The word
 * is set so its capitals span the frame across its path (bleeding a hair past both edges —
 * accented capitals fit instead), and the fill's leading edge rides a fixed distance behind the
 * word's front: exactly far enough that when the word hangs centred at the cut, the fill already
 * reaches past the frame's far edge — so every counter (O, A, E…) and every gap between letters
 * in view shows fill, never the shot behind it. At speed the fill is dragged further back and
 * the word leans into its travel; both settle as it lands, and the whole cut plateau is covered.
 */

import {
  bestContrast,
  CLEAN_END,
  type Color,
  c,
  contrastRatio,
  defineTemplate,
  type EaseName,
  ease,
  type FormatId,
  type Palette,
  type Rect,
  rgb,
  type TextBlock,
  type TextStyle,
} from '@/engine';

/** Half of the full-coverage plateau around the cut, in seconds (motion language §10). */
const PLATEAU = 0.03;

type Travel = 'left' | 'right' | 'up' | 'down';

/** Unit travel vector and the word's rotation (it always reads in its direction of travel). */
const TRAVEL: Record<Travel, { dx: number; dy: number; rotate: number }> = {
  left: { dx: -1, dy: 0, rotate: 0 },
  right: { dx: 1, dy: 0, rotate: 0 },
  // Rising, the word reads top to bottom (its first letter leads); falling, bottom to top.
  up: { dx: 0, dy: -1, rotate: 90 },
  down: { dx: 0, dy: 1, rotate: -90 },
};

/** Auto: along the frame's long side — vertical formats sweep upwards. */
const AUTO: Record<FormatId, Travel> = {
  '16:9': 'left',
  '9:16': 'up',
  '1:1': 'left',
  '4:5': 'left',
};

/** Capitals span this share of the frame across the path (a hair of bleed on both sides). */
const CAP = 1.04;
/** Accented capitals fit inside instead. */
const INK_FIT = 0.97;
/** The word is at most this many frame lengths long (long words get smaller). */
const MAX_LENGTH = 1.6;

type Feel = {
  /** Curves in to the cut and out of it. */
  enter: EaseName;
  leave: EaseName;
  /** A breath before the word moves (s): a curve that starts fast keeps frame 0 clean. */
  wait: number;
  /** How far the fill is dragged back at speed (seconds of travel). */
  drag: number;
  /** Forward lean of the letters at full speed (degrees). */
  lean: number;
};

/**
 * Calm glides through (sine in-out) and barely leans; Balanced sweeps in and out decisively
 * (snap); Punchy bursts in, hangs on the word and whips out (glide / exit), leaning hard and
 * dragging the fill.
 */
const FEEL: Record<'calm' | 'balanced' | 'punchy', Feel> = {
  calm: { enter: 'drift', leave: 'drift', wait: 0, drag: 0.018, lean: 4 },
  balanced: { enter: 'snap', leave: 'snap', wait: 0, drag: 0.03, lean: 8 },
  punchy: { enter: 'glide', leave: 'exit', wait: 0.03, drag: 0.04, lean: 13 },
};

const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.043, 0.043, 0.047);

const distinct = (a: Color, b: Color) =>
  contrastRatio(a, b) >= 1.5 || Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.3;

/**
 * Word and fill. Palette: the word in the foreground on the palette's signature color (its
 * background, or the brand color); Inverse swaps them; Accent fills with the accent (its second
 * accent where the first is the foreground) and sets the word in whichever role reads best.
 */
function sweepColors(palette: Palette, mode: 'palette' | 'inverse' | 'accent') {
  const { roles } = palette;
  const brand = palette.id.startsWith('brand-');
  const hero = brand && palette.id !== 'brand-bold' ? roles.accent : roles.bg;
  const onHero = bestContrast(hero, [roles.fg, roles.bg, WHITE, BLACK]);
  if (mode === 'inverse') return { fill: onHero, word: hero };
  if (mode === 'accent') {
    const fill =
      [roles.accent, roles.accent2, roles.accent3].find(
        (color) => distinct(color, roles.fg) && distinct(color, hero),
      ) ?? roles.accent;
    return { fill, word: bestContrast(fill, [roles.fg, roles.bg, WHITE, BLACK]) };
  }
  return { fill: hero, word: onHero };
}

export default defineTemplate({
  id: 'sweep',
  version: 1,
  meta: {
    name: 'Sweep',
    tagline: 'Type transition',
    category: 'transitions',
    tags: ['transition', 'type', 'kinetic', 'wipe', 'overlay'],
    useCases: ['Brand edits', 'Sports', 'Fashion', 'Campaign films'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'transition',
  duration: { default: 1.2, min: 0.8, max: 2.4 },
  alpha: 'default',
  poster: 0.3,
  palettes: [
    { kind: 'library', id: 'hazard' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'newsroom' },
    { kind: 'library', id: 'paper' },
  ],
  pairings: ['poster', 'sport', 'grotesk', 'editorial', 'technical'],
  controls: {
    word: c.text({ label: 'Word', default: 'NEXT', maxLength: 12, primary: true }),
    colors: c.choice({
      label: 'Colors',
      default: 'palette',
      options: [
        { value: 'palette', label: 'Palette' },
        { value: 'inverse', label: 'Inverse' },
        { value: 'accent', label: 'Accent' },
      ],
      hint: 'The word and the fill behind it',
    }),
    direction: c.choice({
      label: 'Direction',
      group: 'motion',
      default: 'auto',
      display: 'select',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'left', label: '← Left' },
        { value: 'right', label: '→ Right' },
        { value: 'up', label: '↑ Up' },
        { value: 'down', label: '↓ Down' },
      ],
      hint: 'Auto sweeps along the frame’s long side',
    }),
    speed: c.number({
      label: 'Speed',
      default: 1,
      min: 1,
      max: 2,
      step: 0.25,
      unit: '×',
      hint: 'Compresses the transition around the cut point',
    }),
  },
  looks: [
    { id: 'hazard', name: 'Hazard', palette: { kind: 'library', id: 'hazard' }, pairing: 'poster' },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'sport' },
    {
      id: 'cobalt',
      name: 'Cobalt',
      palette: { kind: 'library', id: 'cobalt' },
      pairing: 'grotesk',
    },
  ],
  timing: () => ({ in: 0, out: 0, cut: 0.5, tail: CLEAN_END }),
  build: (ctx) => {
    const { frame, props, palette, pairing, energy, text, timeline } = ctx;
    const { width, height, u } = frame;
    const cut = timeline.cut ?? timeline.duration / 2;
    const feel = FEEL[energy.id];
    const { fill, word: ink } = sweepColors(palette, props.colors);
    const direction: Travel = props.direction === 'auto' ? AUTO[frame.format] : props.direction;
    const { dx, dy, rotate } = TRAVEL[direction];
    const horizontal = dx !== 0;
    /** Frame length along the path, and across it. */
    const along = horizontal ? width : height;
    const cross = horizontal ? height : width;

    // --- the word: capitals across the whole frame -----------------------------------------
    const display = pairing.display;
    const style = (size: number): TextStyle => ({
      font: display.font,
      italicFont: display.italic,
      size,
      weight: Math.max(display.weight, 400),
      // Variable-width families set condensed; static ones (Anton…) ignore it.
      width: display.width !== undefined ? 75 : undefined,
      tracking: display.tracking + 0.01,
      features: display.features,
      case: 'upper',
    });
    const content = props.word.trim();
    let block: TextBlock | null = null;
    if (content) {
      const probe = text.line(content, style(100));
      const cap = probe.capHeight;
      const top = -probe.ink.y;
      const bottom = probe.ink.y + probe.ink.h - cap;
      // Marks above or below the capitals (É, Ç, Ą…) must stay in view: fit the ink instead.
      const marked = top > 0.08 * cap || bottom > 0.08 * cap;
      const bySide = marked ? (INK_FIT * cross * cap) / probe.ink.h : CAP * cross;
      const byLength = (MAX_LENGTH * along * cap) / Math.max(1, probe.ink.w);
      block = text.line(content, style((100 * Math.min(bySide, byLength)) / cap));
    }
    // The word's ink, centred on the local origin: along its length, and across on its capitals
    // (or on its whole ink when marks have to fit).
    const wordLength = block ? block.ink.w : 0;
    const originX = block ? -(block.ink.x + block.ink.w / 2) : 0;
    const marks = block ? block.ink.y < -0.08 * block.capHeight : false;
    const originY = block ? (marks ? -(block.ink.y + block.ink.h / 2) : -block.capHeight / 2) : 0;

    // --- solving the fill ---------------------------------------------------------------
    // s runs along the path from the entry edge (0) to the far edge (`along`); the word's
    // front is `lead`, its centre `lead - wordLength / 2`. At the cut the word hangs centred
    // and the fill's leading edge must reach past the far edge, so it trails the front by
    // `lag` (negative for short words: the fill then leads them in).
    const margin = 1.5 * u;
    const lag = (wordLength - along) / 2 - margin;
    const panel = along + 2 * margin;
    const leadAtCut = along / 2 + wordLength / 2;
    // The lean shears the letters' corners ahead of (and behind) the word's upright extent.
    const reach = block ? Math.tan((feel.lean * Math.PI) / 180) * block.ink.h : 0;
    // Everything starts beyond the entry edge and ends beyond the far edge.
    const leadFrom = Math.min(-margin - reach, -margin + lag);
    const leadTo = Math.max(along + margin + wordLength + reach, along + margin + lag + panel);

    // --- timing: everything compresses around the cut with Speed ---------------------------
    const speed = props.speed;
    const inSpan = cut / speed;
    const outSpan = (timeline.sections.out.end - cut) / speed;
    const inStart = cut - inSpan + feel.wait;
    const inDur = inSpan - PLATEAU - feel.wait;
    const outStart = cut + PLATEAU;
    const outDur = outSpan - PLATEAU;
    const enter = ease[feel.enter];
    const leave = ease[feel.leave];
    const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
    const leadAt = (t: number) =>
      t < cut
        ? leadFrom + (leadAtCut - leadFrom) * enter(clamp01((t - inStart) / inDur))
        : leadAtCut + (leadTo - leadAtCut) * leave(clamp01((t - outStart) / outDur));
    /** The drag lets go as the word leaves, so the fill clears the frame with it. */
    const dragAt = (t: number) =>
      t < cut ? feel.drag : feel.drag * (1 - clamp01((t - outStart) / outDur)) ** 2;
    const velocityAt = (t: number) => (leadAt(t + 0.002) - leadAt(t - 0.002)) / 0.004;
    let peak = 1;
    for (let i = 0; i <= 64; i++) {
      const t = inStart + ((cut + outSpan - inStart) * i) / 64;
      peak = Math.max(peak, velocityAt(t));
    }

    // Frame position of a point `s` along the path, on the centre line across it.
    const entryX = dx < 0 ? width : dx > 0 ? 0 : width / 2;
    const entryY = dy < 0 ? height : dy > 0 ? 0 : height / 2;
    const bleed = 2 * u;
    const safe = frame.safe.title;

    return {
      // An overlay: no background of its own, ever (opaque exports bake Scene A/B underneath).
      render: ({ t, g }) => {
        const lead = leadAt(t);
        const v = velocityAt(t);
        // The fill rides `lag` behind the front, dragged further back at speed.
        const front = lead - lag - dragAt(t) * v;
        const back = front - panel;
        const s0 = Math.max(back, -bleed);
        const s1 = Math.min(front, along + bleed);
        if (s1 > s0) {
          // The panel between s0 and s1 along the path, bleeding past the frame across it.
          const ax = entryX + dx * s0;
          const bx = entryX + dx * s1;
          const ay = entryY + dy * s0;
          const by = entryY + dy * s1;
          const r: Rect = horizontal
            ? { x: Math.min(ax, bx), y: -bleed, w: Math.abs(bx - ax), h: height + 2 * bleed }
            : { x: -bleed, y: Math.min(ay, by), w: width + 2 * bleed, h: Math.abs(by - ay) };
          g.rect(r, { fill });
        }

        if (!block) return;
        const centre = lead - wordLength / 2;
        // Only draw the word while any of it is in the frame.
        if (lead + reach < -margin || lead - wordLength - reach > along + margin) return;
        const x = entryX + dx * centre;
        const y = entryY + dy * centre;
        // Lean into the travel at speed (the top of the letters ahead), upright when it lands.
        const lean = feel.lean * Math.min(1, Math.abs(v) / peak);
        const skewX = direction === 'right' ? -lean : lean;
        g.group({ x, y, rotate, skewX }, (g) => {
          g.text(block, { fill: ink, x: originX, y: originY });
        });

        // The word's clickable region: what of it is in the title-safe area.
        const halfAlong = wordLength / 2;
        const halfCross = block.ink.h / 2;
        const wx0 = horizontal ? x - halfAlong : x - halfCross;
        const wx1 = horizontal ? x + halfAlong : x + halfCross;
        const wy0 = horizontal ? y - halfCross : y - halfAlong;
        const wy1 = horizontal ? y + halfCross : y + halfAlong;
        const rx0 = Math.max(wx0, safe.x);
        const rx1 = Math.min(wx1, safe.x + safe.w);
        const ry0 = Math.max(wy0, safe.y);
        const ry1 = Math.min(wy1, safe.y + safe.h);
        if (rx1 > rx0 && ry1 > ry0) {
          g.editable('word', { x: rx0, y: ry0, w: rx1 - rx0, h: ry1 - ry0 });
        }
      },
    };
  },
});
