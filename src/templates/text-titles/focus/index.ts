/**
 * Focus — blur-to-sharp headline (docs/templates/01-text-titles.md §1.4).
 *
 * The expensive detail: every word resolves like a lens pulling focus — its blur, its scale and
 * its tracking converge on the same curve, so they land at the same moment. The blur is in `u`
 * (resolution-independent) and runs through the compositor, one small bounded layer per word.
 * Behind the lockup, a very soft bloom derived from the palette acts as light, not decoration.
 */

import {
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type Gradient,
  mixOklch,
  type Rect,
  type TextBlock,
  unionRect,
  withAlpha,
} from '@/engine';

type Composition = {
  /** Headline size in u. */
  size: number;
  /** Share of the layout width the headline may use. */
  measure: number;
  /** Subline size in u. */
  subline: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { size: 11, measure: 0.7, subline: 3.3 },
  '9:16': { size: 10.5, measure: 1, subline: 4.2 },
  '1:1': { size: 9.6, measure: 0.9, subline: 3.5 },
  '4:5': { size: 10, measure: 0.9, subline: 3.7 },
};

/** Balanced seconds each word takes to resolve. */
const WORD_DUR = 0.9;
/** Word stagger (Balanced seconds); long headlines compress it so the reveal never crawls. */
const WORD_GAP = 0.12;
const MAX_SPAN = 0.6;
/** At most this many words resolve on their own layers; longer headlines resolve in phrases. */
const MAX_UNITS = 8;
/** Blur at the start of the resolve: 28 px at 1080p (σ, in u). */
const BLUR_IN = 28 / 10.8;
/** Blur at the end of the exit: 16 px at 1080p. */
const BLUR_OUT = 16 / 10.8;
/** Tracking travels from +14% to the resting −2%: 16% of the size on top of the rest. */
const TRACK_FROM = 0.16;

const BLOOM = { off: 0, soft: 1, strong: 1.75 } as const;

/** A word (or, in long headlines, a phrase) that resolves as one. */
type Unit = {
  line: number;
  /** First and last glyph (block indices). */
  first: number;
  last: number;
  /** Ink at rest (block coordinates). */
  ink: Rect;
  /** Balanced seconds into `in`. */
  delay: number;
};

/** Words of a laid-out block grouped into at most `MAX_UNITS` units (never across lines). */
function units(block: TextBlock): { units: Unit[]; of: Int16Array } {
  const out: Unit[] = [];
  const of = new Int16Array(Math.max(1, block.glyphCount));
  const perUnit = Math.max(1, Math.ceil(block.wordCount / MAX_UNITS));
  for (const line of block.lines) {
    const words = line.words.filter((word) => word.end > word.start);
    for (let w = 0; w < words.length; w += perUnit) {
      const from = words[w];
      const to = words[Math.min(words.length, w + perUnit) - 1];
      if (!from || !to) continue;
      let ink: Rect | null = null;
      for (let k = from.start; k < to.end; k++) {
        const glyph = line.glyphs[k];
        if (!glyph?.ink) continue;
        const r = {
          x: line.x + glyph.x + glyph.ink.x,
          y: line.baseline + glyph.y + glyph.ink.y,
          w: glyph.ink.w,
          h: glyph.ink.h,
        };
        ink = ink ? unionRect(ink, r) : r;
      }
      const first = line.glyphs[from.start]?.index ?? 0;
      const last = line.glyphs[to.end - 1]?.index ?? first;
      out.push({
        line: line.index,
        first,
        last,
        ink: ink ?? { x: line.x, y: line.baseline - block.capHeight, w: 0, h: block.capHeight },
        delay: 0,
      });
    }
  }
  // Every glyph (spaces too) belongs to the unit that precedes it on its line.
  for (const line of block.lines) {
    let current = out.findIndex((unit) => unit.line === line.index);
    for (const glyph of line.glyphs) {
      const next = out.findIndex(
        (unit) => unit.line === line.index && glyph.index >= unit.first && glyph.index <= unit.last,
      );
      if (next >= 0) current = next;
      of[glyph.index] = Math.max(0, current);
    }
  }
  return { units: out, of };
}

export default defineTemplate({
  id: 'focus',
  version: 1,
  meta: {
    name: 'Focus',
    tagline: 'Blur-to-sharp headline',
    category: 'text-titles',
    tags: ['title', 'headline', 'announcement', 'blur', 'premium'],
    useCases: ['Announcements', 'Product teasers', 'Keynote statements', 'Premium intros'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 5, min: 3, max: 12 },
  alpha: 'optional',
  poster: 2.6,
  palettes: [
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'film' },
    { kind: 'library', id: 'forest' },
  ],
  pairings: ['grotesk', 'editorial', 'classic', 'technical', 'soft'],
  controls: {
    headline: c.text({
      label: 'Headline',
      default: 'Say hello to\nsomething new.',
      maxLength: 50,
      multiline: true,
      maxLines: 3,
      primary: true,
    }),
    subline: c.text({
      label: 'Subline',
      default: 'Coming this fall',
      maxLength: 60,
      optional: true,
    }),
    glow: c.choice({
      label: 'Glow',
      default: 'soft',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'soft', label: 'Soft' },
        { value: 'strong', label: 'Strong' },
      ],
      hint: 'Off in transparent exports',
    }),
  },
  looks: [
    {
      id: 'midnight',
      name: 'Midnight',
      palette: { kind: 'library', id: 'midnight' },
      pairing: 'grotesk',
    },
    {
      id: 'paper',
      name: 'Paper',
      palette: { kind: 'library', id: 'paper' },
      pairing: 'editorial',
      values: { glow: 'off' },
    },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
  ],
  timing: ({ props }) => ({
    in: props.subline.trim() ? 1.8 : 1.45,
    out: 0.6,
    tail: CLEAN_END,
    readable: props.headline,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    // Centered on the frame, even where the social zone isn't symmetric.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const width = frame.vertical ? half * 2 : Math.min(half * 2, area.w * comp.measure);
    const left = frame.cx - width / 2;

    // --- type -------------------------------------------------------------------------------
    const display = pairing.display;
    const size = comp.size * u;
    const source = props.headline.trim() || ' ';
    const hardLines = source.split('\n').length;
    const layoutHeadline = (maxLines: number, minSize: number) =>
      text.layout(source, {
        style: {
          font: display.font,
          italicFont: display.italic,
          size,
          weight: 600,
          width: display.width,
          tracking: display.tracking + 0.01,
          features: display.features,
        },
        maxWidth: width,
        maxLines,
        lineHeight: Math.max(1, display.lineHeight + 0.06),
        align: 'center',
        fit: { minSize },
      });
    // Keep the user's lines, shrinking a little; only then let them wrap.
    let headline = layoutHeadline(hardLines, size * 0.72);
    if (headline.overflow) headline = layoutHeadline(3, size * 0.4);

    const sublineText = props.subline.trim();
    const subline: TextBlock | null = sublineText
      ? text.layout(sublineText, {
          style: {
            font: pairing.text.font,
            size: comp.subline * u,
            weight: 450,
            width: pairing.text.width,
            tracking: 0.01,
            features: pairing.text.features,
          },
          maxWidth: width,
          maxLines: 2,
          lineHeight: 1.3,
          align: 'center',
          fit: { minSize: 2.6 * u },
        })
      : null;

    // --- lockup: headline, subline; optically centered --------------------------------------
    const gap = headline.size * 0.52;
    const height = headline.height + (subline ? gap + subline.height : 0);
    const top = area.y + (area.h - height) * 0.47;
    const hx = left;
    const hy = top;
    const sx = left;
    const sy = top + headline.height + gap;
    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const headlineBounds = shift(headline.ink, hx, hy);
    const sublineBounds = subline ? shift(subline.ink, sx, sy) : null;
    const lockup = sublineBounds ? unionRect(headlineBounds, sublineBounds) : headlineBounds;
    const lcx = lockup.x + lockup.w / 2;
    const lcy = lockup.y + lockup.h / 2;
    // Room for the widest tracking and the exit blur around the lockup.
    const lockupArea: Rect = {
      x: lockup.x - 0.1 * size,
      y: lockup.y - 0.1 * size,
      w: lockup.w + 0.2 * size,
      h: lockup.h + 0.2 * size,
    };

    // --- motion parameters (Balanced seconds; energy scales them) ---------------------------
    const punchy = energy.id === 'punchy';
    // Punchy snaps into focus like an autofocus locking; otherwise a long, silky settle.
    const resolve = punchy ? 'snap' : 'glide';
    const blurFrom = BLUR_IN * energy.blur;
    const scaleFrom = 1 + 0.1 * energy.travel;
    const trackFrom = TRACK_FROM * (0.5 + 0.5 * energy.travel);
    const pushTo = 1 + 0.03 * energy.travel;
    const { units: parts, of: unitOf } = units(headline);
    const wordGap = ctx.stagger(Math.min(WORD_GAP, MAX_SPAN / Math.max(1, parts.length - 1)));
    parts.forEach((unit, k) => {
      unit.delay = k * wordGap;
    });
    const unitP = new Float64Array(Math.max(1, parts.length));
    const glyphDx = new Float64Array(Math.max(1, headline.glyphCount));
    const edge = 0.05 * headline.size;
    /** How far a resolving unit's scale reaches beyond each of its sides. */
    const growth = (k: number) => {
      const unit = parts[k];
      if (!unit) return 0;
      const open = 1 - (unitP[k] ?? 1);
      const spread = trackFrom * open * headline.size * (unit.last - unit.first);
      return ((scaleFrom - 1) * open * (unit.ink.w + spread)) / 2;
    };

    const motion: GlyphTransform = { dx: 0 };
    let drawing = -1;
    /** Glyphs of the unit being drawn (−1: every settled unit), at their tracked position. */
    const unitGlyph = (glyph: Glyph): GlyphTransform | null => {
      const unit = unitOf[glyph.index] ?? 0;
      if (drawing >= 0 ? unit !== drawing : (unitP[unit] ?? 1) < 1) return null;
      motion.dx = glyphDx[glyph.index] ?? 0;
      return motion;
    };

    // --- light bloom: a soft Gaussian of palette light behind the lockup --------------------
    const glow = ctx.transparent ? 0 : BLOOM[props.glow];
    const light: Color = palette.dark ? mixOklch(accent, fg, 0.35) : accent;
    const peak = (palette.dark ? 0.2 : 0.09) * glow;
    const R = 100;
    const bloom: Gradient = {
      kind: 'radial',
      cx: 0,
      cy: 0,
      r: R,
      stops: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].map((offset) => ({
        offset,
        color: withAlpha(light, peak * Math.exp(-2.7 * offset * offset) * (1 - offset ** 6)),
      })),
    };
    // Drawn only as far as the light is visible (a Gaussian, cut where it fades out).
    const bloomW = 0.8 * Math.min(frame.width * 0.5, lockup.w * 0.75 + 16 * u);
    const bloomH = 0.8 * Math.min(frame.height * 0.42, lockup.h * 0.9 + 14 * u);
    const bcx = lcx;
    const bcy = hy + headline.ink.y + headline.ink.h * 0.5;

    const drawStatic = (g: Draw) => {
      g.text(headline, { fill: fg, x: hx, y: hy });
      if (subline) g.text(subline, { fill: muted, x: sx, y: sy });
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        // Exit: one layer — everything blurs out, shrinks to 98% and fades; the bloom lasts.
        const out = tl.p(t, 'out', { dur: 0.55 }, 'swift');
        const gone = tl.p(t, 'out', { delay: 0.05, dur: 0.55 }, 'exit');
        const bloomGone = tl.p(t, 'out', { delay: 0.2, dur: 0.4 }, 'drift');
        const push = 1 + (pushTo - 1) * tl.p(t, 'hold', {}, 'drift');
        const scale = push * (1 - 0.02 * out);

        g.movable('lockup', lockup, (g) => {
          g.group({ scale, originX: lcx, originY: lcy }, (g) => {
            // Bloom: fades in expanding 0.8 → 1, breathes ±6% through the hold.
            if (glow > 0) {
              const shown = tl.p(t, 'in', { delay: 0.3, dur: 1.3 }, 'drift');
              const grown = tl.p(t, 'in', { delay: 0.3, dur: 1.3 }, 'glide');
              // ±6% around 94% (paint opacity can't exceed 1), continuous where the hold starts.
              const hold = tl.local(t, 'hold');
              const breath = hold > 0 ? 0.06 * Math.sin((hold / 3.2) * Math.PI * 2) : 0;
              const opacity = shown * (1 - bloomGone) * (0.94 + breath);
              if (opacity > 0) {
                const k = 0.8 + 0.2 * grown;
                g.group(
                  {
                    x: bcx,
                    y: bcy,
                    scaleX: (bloomW / R) * k,
                    scaleY: (bloomH / R) * k,
                  },
                  (g) => g.circle(0, 0, R, { fill: bloom, opacity }),
                );
              }
            }

            if (gone > 0) {
              if (gone < 1) {
                g.fx({ blur: BLUR_OUT * out, opacity: 1 - gone, bounds: lockupArea }, drawStatic);
              }
              return;
            }

            // Entrance: each word resolves — blur, scale and tracking on one curve.
            let settled = true;
            for (let k = 0; k < parts.length; k++) {
              const p = tl.p(t, 'in', { delay: parts[k]?.delay ?? 0, dur: WORD_DUR }, resolve);
              unitP[k] = p;
              if (p < 1) settled = false;
            }

            if (settled) {
              g.text(headline, { fill: fg, x: hx, y: hy });
            } else {
              // Glyph offsets: open tracking, plus room for each word's scale, so words grow
              // apart instead of into each other.
              for (const line of headline.lines) {
                let pen = 0;
                let last = 0;
                let previous = -1;
                for (const glyph of line.glyphs) {
                  const k = unitOf[glyph.index] ?? 0;
                  const open = 1 - (unitP[k] ?? 1);
                  if (k !== previous) {
                    if (previous >= 0) pen += growth(previous) + growth(k);
                    previous = k;
                  }
                  glyphDx[glyph.index] = pen;
                  last = trackFrom * open * headline.size;
                  pen += last;
                }
                // Centered lines open symmetrically.
                const center = (pen - last) / 2;
                for (const glyph of line.glyphs) {
                  glyphDx[glyph.index] = (glyphDx[glyph.index] ?? 0) - center;
                }
              }
              drawing = -1;
              g.text(headline, { fill: fg, x: hx, y: hy, glyph: unitGlyph });
              parts.forEach((unit, k) => {
                const p = unitP[k] ?? 1;
                if (p >= 1) return;
                const opacity = tl.p(t, 'in', { delay: unit.delay, dur: WORD_DUR * 0.5 }, 'glide');
                if (opacity <= 0) return;
                const line = headline.lines[unit.line];
                if (!line) return;
                const dx0 = glyphDx[unit.first] ?? 0;
                const dx1 = glyphDx[unit.last] ?? 0;
                const bounds: Rect = {
                  x: hx + unit.ink.x + dx0 - edge,
                  y: hy + unit.ink.y - edge,
                  w: unit.ink.w + dx1 - dx0 + 2 * edge,
                  h: unit.ink.h + 2 * edge,
                };
                const blur = blurFrom * (1 - p);
                drawing = k;
                g.group(
                  {
                    scale: 1 + (scaleFrom - 1) * (1 - p),
                    originX: bounds.x + bounds.w / 2,
                    originY: bounds.y + bounds.h / 2,
                  },
                  (g) => {
                    const draw = (g: Draw) =>
                      g.text(line, { fill: fg, x: hx, y: hy, glyph: unitGlyph });
                    if (blur > 0.01) g.fx({ blur, opacity, bounds }, draw);
                    else g.text(line, { fill: fg, x: hx, y: hy, opacity, glyph: unitGlyph });
                  },
                );
              });
              drawing = -1;
            }

            // Subline: rises 1u and fades in once the headline has mostly resolved.
            if (subline) {
              const risen = tl.p(t, 'in', { delay: 1, dur: 0.8 }, 'glide');
              const opacity = tl.p(t, 'in', { delay: 1, dur: 0.6 }, 'drift');
              if (opacity > 0) {
                g.text(subline, {
                  fill: muted,
                  x: sx,
                  y: sy + (1 - risen) * ctx.travel(u),
                  opacity,
                });
              }
            }
          });
          g.editable('headline', headlineBounds);
          if (sublineBounds) g.editable('subline', sublineBounds);
        });
      },
    };
  },
});
