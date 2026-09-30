/**
 * Echo — stacked outline repeats (docs/templates/01-text-titles.md §1.3).
 *
 * The expensive detail: the echoes are the phrase's true glyph outlines, stroked with miter joins
 * at a width tied to the frame (in u), not to the type size — so a long phrase set small and a
 * short one set huge carry the same line, in every format. The stack breathes as one object: the
 * gaps between copies ride one traveling wave that starts from rest where the copies have landed
 * and runs on into the collapse, so nothing ever jumps.
 */

import {
  CLEAN_END,
  type Color,
  c,
  clamp01,
  type Draw,
  defineTemplate,
  ease,
  type FormatId,
  type Rect,
  rgb,
} from '@/engine';

type Composition = {
  /** Share of the layout width the solid copy may span (vertical stack · horizontal band). */
  share: number;
  band: number;
  /** Largest type size in u (short phrases stop growing here). */
  size: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '9:16': { share: 1, band: 0.62, size: 24 },
  '4:5': { share: 0.94, band: 0.56, size: 21 },
  '1:1': { share: 0.84, band: 0.52, size: 19 },
  '16:9': { share: 0.62, band: 0.4, size: 21 },
};

/** Outline widths in u — tied to the frame, not the type. */
const STROKES = { thin: 0.18, regular: 0.32, bold: 0.5 } as const;
/**
 * Copies stack at 1.12× the cap height (≈ 0.85× the line height of a face whose caps are 0.7 em),
 * measured from the caps so tall-capped faces (Anton) don't overlap at rest.
 */
const PITCH = 1.12;
/**
 * The accordion wave: each gap's amplitude as a share of the cap height at 100% — at the default
 * 70% the tightest gap just closes; beyond, neighbours merge into one outline for a moment.
 */
const WAVE = 0.2;
/** Blur of the solid copy as it punches in: 6 px at 1080p (σ, in u). */
const PUNCH_BLUR = 6 / 10.8;

export default defineTemplate({
  id: 'echo',
  version: 1,
  meta: {
    name: 'Echo',
    tagline: 'Stacked outline repeats',
    category: 'text-titles',
    tags: ['title', 'kinetic', 'poster', 'outline', 'music'],
    useCases: ['Kinetic posters', 'Music and culture', 'Reels hooks', 'Event teasers'],
  },
  formats: ['9:16', '4:5', '1:1', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 5, min: 3, max: 10 },
  alpha: 'optional',
  poster: 2.6,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'hazard' },
    { kind: 'library', id: 'paper' },
  ],
  pairings: ['poster', 'sport', 'grotesk', 'technical', 'wide'],
  controls: {
    phrase: c.text({ label: 'Phrase', default: 'ON REPEAT', maxLength: 18, primary: true }),
    copies: c.number({
      label: 'Copies',
      group: 'style',
      default: 8,
      min: 4,
      max: 14,
      step: 1,
    }),
    stroke: c.choice({
      label: 'Stroke weight',
      default: 'regular',
      options: [
        { value: 'thin', label: 'Thin' },
        { value: 'regular', label: 'Regular' },
        { value: 'bold', label: 'Bold' },
      ],
    }),
    direction: c.choice({
      label: 'Direction',
      default: 'vertical',
      options: [
        { value: 'vertical', label: 'Vertical' },
        { value: 'horizontal', label: 'Horizontal' },
      ],
    }),
    fade: c.toggle({ label: 'Distance fade', default: true }),
    wave: c.number({
      label: 'Wave amount',
      default: 70,
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
    }),
  },
  looks: [
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'poster' },
    {
      id: 'cobalt',
      name: 'Cobalt',
      palette: { kind: 'library', id: 'cobalt' },
      pairing: 'poster',
      values: { stroke: 'thin', copies: 12 },
    },
    {
      id: 'candy',
      name: 'Candy',
      palette: { kind: 'library', id: 'candy' },
      pairing: 'sport',
      values: { stroke: 'bold', copies: 6 },
    },
  ],
  timing: ({ props }) => ({
    in: 1.1,
    out: 0.6,
    tail: CLEAN_END,
    readable: props.phrase,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const vertical = props.direction === 'vertical';
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    // The solid copy sits dead center: on the frame's center line, in the layout area's middle.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const measure = half * 2 * (vertical ? comp.share : comp.band);
    const cx = frame.cx;
    const cy = area.y + area.h / 2;

    // --- type: one line of bold condensed caps ----------------------------------------------
    const display = pairing.display;
    const size = comp.size * u;
    const block = text.layout(props.phrase.trim() || ' ', {
      style: {
        font: display.font,
        italicFont: display.italic,
        size,
        weight: 800,
        // Variable-width faces run condensed.
        width: display.width !== undefined ? 84 : undefined,
        tracking: display.tracking + 0.01,
        features: display.features,
        case: 'upper',
      },
      maxWidth: measure,
      maxLines: 1,
      lineHeight: display.lineHeight,
      align: 'left',
      fit: { minSize: size * 0.3 },
    });
    const ink = block.ink;
    const ox = cx - (ink.x + ink.w / 2);
    const oy = cy - (ink.y + ink.h / 2);
    const mainInk: Rect = { x: ox + ink.x, y: oy + ink.y, w: ink.w, h: ink.h };
    const stroke = STROKES[props.stroke] * u;
    const cap = block.capHeight;

    // --- the stack: slots outward from the solid copy -----------------------------------------
    const copies = Math.round(props.copies);
    const before = Math.ceil(copies / 2);
    const after = copies - before;
    // Along the stack axis: the solid copy's extent and the pitch between copies.
    const extent = vertical ? ink.h : ink.w;
    // Outlines sit outside the letters: each copy is a stroke wider on both sides.
    const pitch = vertical
      ? PITCH * Math.max(cap, ink.h * 0.94) + 2 * stroke
      : ink.w + 0.32 * block.size + 2 * stroke;
    // The first echo clears the solid copy (its outline never crosses the solid letters).
    const clearance = vertical ? Math.max(pitch, extent + stroke * 2 + 0.06 * block.size) : pitch;
    const amplitude = WAVE * cap * (props.wave / 100) * (energy.id === 'calm' ? 0.75 : 1);
    const period = energy.id === 'calm' ? 2.4 : energy.id === 'punchy' ? 1.1 : 1.6;
    const sway = ctx.travel(u) * (props.wave / 100);

    type Copy = { side: -1 | 1; rank: number; opacity: number; delay: number; from: number };
    const stack: Copy[] = [];
    const fadeStep = 0.78 / Math.max(before, after, 1);
    for (let k = before; k >= 1; k--) {
      stack.push({
        side: -1,
        rank: k,
        opacity: props.fade ? 1 - fadeStep * (k - 1) : 1,
        delay: 0,
        from: 0,
      });
    }
    for (let k = 1; k <= after; k++) {
      stack.push({
        side: 1,
        rank: k,
        opacity: props.fade ? 1 - fadeStep * (k - 1) : 1,
        delay: 0,
        from: 0,
      });
    }
    // Cascade from the top (left) edge: the first slot lands first; each starts off-frame.
    const cascadeGap = ctx.stagger(Math.min(0.045, 0.42 / Math.max(1, copies - 1)));
    const center = vertical ? oy + ink.y : ox + ink.x;
    stack.forEach((copy, order) => {
      copy.delay = order * cascadeGap;
      // Every copy starts just past the top (left) edge, outline included.
      copy.from = -(center + extent + stroke * 2) - u;
    });

    // --- motion parameters ------------------------------------------------------------------
    const punchy = energy.id === 'punchy';
    const calm = energy.id === 'calm';
    const land = calm ? 'glide' : 'snap';
    const overshoot = ctx.travel(1.2 * u) * (calm ? 0 : 1);
    const punchFrom = punchy ? 1.12 : calm ? 1.05 : 1.08;
    const holdStart = timeline.sections.hold.start;
    const mainColor = accent;
    const echoColor = fg;
    // Twice the width: the half inside the letters is erased (outlines of the union).
    const outline = { color: echoColor, width: stroke * 2, join: 'miter' as const };
    const matte = rgb(1, 1, 1);
    type Placed = { x: number; y: number; opacity: number };
    const placed: Placed[] = stack.map(() => ({ x: 0, y: 0, opacity: 0 }));
    const blurBounds: Rect = {
      x: mainInk.x - 0.1 * block.size,
      y: mainInk.y - 0.1 * block.size,
      w: mainInk.w + 0.2 * block.size,
      h: mainInk.h + 0.2 * block.size,
    };
    const reach = frame.width + frame.height;

    const drawMain = (g: Draw) => g.text(block, { fill: mainColor, x: ox, y: oy });

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        const held = t - holdStart;
        // The accordion eases in from rest, so the wave is continuous with the landing.
        const swell = held > 0 ? ease.drift(clamp01(held / 0.8)) : 0;
        const cycle = held > 0 ? held / period : 0;
        const collapsed = tl.p(t, 'out', { dur: 0.36 }, 'exit');

        // Echoes: land from the edge, breathe, collapse into the solid copy.
        let count = 0;
        let lo = Number.POSITIVE_INFINITY;
        let hi = Number.NEGATIVE_INFINITY;
        for (const copy of stack) {
          const p = tl.p(t, 'in', { delay: copy.delay, dur: 0.55 }, 'linear');
          const opacity = copy.opacity * (1 - collapsed * collapsed);
          if (p <= 0 || opacity <= 0.002) continue;
          // Gaps between neighbours ride one traveling wave: offsets accumulate outward.
          let offset = 0;
          for (let j = 0; j < copy.rank; j++) {
            const base = j === 0 ? clearance : pitch;
            let s = Math.sin(2 * Math.PI * (cycle - j * 0.13));
            if (punchy) s = Math.sign(s) * Math.abs(s) ** 0.6;
            offset += base + amplitude * swell * s * (j === 0 ? 0.5 : 1);
          }
          offset *= copy.side * (1 - collapsed);
          const s = clamp01((p - 0.6) / 0.4);
          const bump = overshoot * Math.sin(Math.PI * s) * (1 - s);
          const along = copy.from + (offset - copy.from) * ease[land](p) + bump;
          const across =
            (copy.rank % 2 === 0 ? 1 : -1) *
            sway *
            swell *
            Math.sin(2 * Math.PI * (cycle - copy.rank * 0.13));
          const x = ox + (vertical ? across : along);
          const y = oy + (vertical ? along : across);
          // Off-frame copies cost nothing.
          const edge = vertical ? y + ink.y : x + ink.x;
          if (edge > (vertical ? frame.height : frame.width) || edge + extent < 0) continue;
          const slot = placed[count++] as Placed;
          slot.x = x;
          slot.y = y;
          slot.opacity = opacity;
          lo = Math.min(lo, edge);
          hi = Math.max(hi, edge + extent);
        }
        if (count > 0) {
          // Outlines of the glyphs' union: a double-width stroke with everything inside the
          // letters erased — no overlapping contours show, and touching copies merge.
          const margin = stroke * 4;
          const bounds: Rect = vertical
            ? {
                x: mainInk.x - sway - margin,
                y: lo - margin,
                w: mainInk.w + 2 * (sway + margin),
                h: hi - lo + 2 * margin,
              }
            : {
                x: lo - margin,
                y: mainInk.y - sway - margin,
                w: hi - lo + 2 * margin,
                h: mainInk.h + 2 * (sway + margin),
              };
          const strokes = (g: Draw) => {
            for (let k = 0; k < count; k++) {
              const slot = placed[k] as Placed;
              g.text(block, { outline, x: slot.x, y: slot.y, opacity: slot.opacity });
            }
          };
          const letters = (g: Draw, fill: Color) => {
            for (let k = 0; k < count; k++) {
              const slot = placed[k] as Placed;
              g.text(block, { fill, x: slot.x, y: slot.y });
            }
          };
          if (ctx.transparent) {
            g.mask((g) => letters(g, matte), strokes, { invert: true, bounds });
          } else {
            // Over the flat background the same erase is a second pass in its color: no layers.
            strokes(g);
            letters(g, bg);
          }
        }

        // The solid copy punches in (scale and blur settle together), then wipes out.
        const punch = tl.p(t, 'in', { delay: 0.7, dur: 0.4 }, energy.enter);
        const shown = tl.p(t, 'in', { delay: 0.7, dur: 0.1 });
        const wiped = tl.p(t, 'out', { delay: 0.3, dur: 0.28 }, 'exit');
        if (shown > 0 && wiped < 1) {
          const scale = punchFrom + (1 - punchFrom) * punch;
          const blur = PUNCH_BLUR * energy.blur * (1 - punch);
          const wipeX = mainInk.x - stroke + (mainInk.w + 2 * stroke) * wiped;
          const draw = (g: Draw) =>
            g.group({ scale, originX: cx, originY: cy, opacity: shown }, (g) => {
              if (blur > 0.01) g.fx({ blur, bounds: blurBounds }, drawMain);
              else drawMain(g);
            });
          if (wiped > 0) g.clip({ x: wipeX, y: -reach, w: reach * 2, h: reach * 3 }, draw);
          else draw(g);
        }
        g.editable('phrase', mainInk);
      },
    };
  },
});
