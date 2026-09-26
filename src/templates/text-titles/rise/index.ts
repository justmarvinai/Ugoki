/**
 * Rise — masked line reveal (docs/templates/01-text-titles.md §1.1).
 *
 * The expensive detail: every headline line rises inside its own mask (sized from the block's
 * ink extremes + 8%, so descenders never clip at rest), starts skewed and straightens while its
 * words trail by 25 ms — it reads as hand-timed. The hold breathes: the lockup drifts up and
 * the headline's tracking opens by 1%.
 */

import {
  c,
  defineTemplate,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type Rect,
  type TextBlock,
  type TextLine,
  unionRect,
} from '@/engine';

type Composition = {
  /** Headline size in u. */
  size: number;
  /** Share of the layout area's width the headline may use (left alignment). */
  measure: number;
  maxLines: number;
  /** `center`: optically centered; `lower`: sits on the bottom of the safe area. */
  place: 'center' | 'lower';
  /** Eyebrow size in u. */
  eyebrow: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { size: 16, measure: 0.72, maxLines: 3, place: 'center', eyebrow: 3.4 },
  '9:16': { size: 19.2, measure: 1, maxLines: 4, place: 'center', eyebrow: 4 },
  '1:1': { size: 13, measure: 0.92, maxLines: 3, place: 'lower', eyebrow: 3.4 },
  '4:5': { size: 13.5, measure: 0.92, maxLines: 3, place: 'lower', eyebrow: 3.4 },
};

/** Lines rise from 105% of the mask height below their resting place. */
const RISE = 1.05;

export default defineTemplate({
  id: 'rise',
  version: 1,
  meta: {
    name: 'Rise',
    tagline: 'Masked line reveal',
    category: 'text-titles',
    tags: ['title', 'chapter', 'editorial', 'headline'],
    useCases: ['Chapter titles', 'Keynote headlines', 'Documentary title cards', 'YouTube'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 5, min: 3, max: 12 },
  alpha: 'optional',
  poster: 2.2,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'swiss' },
    { kind: 'library', id: 'cobalt' },
  ],
  pairings: ['grotesk', 'editorial', 'classic', 'sport'],
  controls: {
    headline: c.text({
      label: 'Headline',
      default: 'Where it\nall began',
      maxLength: 60,
      multiline: true,
      maxLines: 3,
      primary: true,
    }),
    eyebrow: c.text({ label: 'Eyebrow', default: 'Chapter 01', maxLength: 24, optional: true }),
    align: c.choice({
      label: 'Alignment',
      default: 'left',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
      ],
    }),
    rule: c.toggle({ label: 'Accent rule', default: true }),
    exit: c.choice({
      label: 'Exit',
      group: 'motion',
      default: 'up',
      options: [
        { value: 'up', label: 'Up' },
        { value: 'down', label: 'Down' },
        { value: 'fade', label: 'Fade' },
      ],
    }),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    {
      id: 'brand-bold',
      name: 'Brand Bold',
      palette: { kind: 'brand', color: '#5A2BE8', variant: 'bold' },
      pairing: 'grotesk',
    },
  ],
  timing: ({ props }) => ({
    lead: 0.15,
    in: 1,
    out: 0.6,
    tail: 0.45,
    readable: props.headline,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const center = props.align === 'center';
    const area = frame.vertical ? frame.safe.social : frame.safe.title;

    // Center alignment is symmetric around the frame's center, even where the social zone isn't.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const measure = center ? half * 2 : area.w * comp.measure;
    const left = center ? frame.cx - half : area.x;

    // --- type ---------------------------------------------------------------------------
    const display = pairing.display;
    const size = comp.size * u;
    const headline = text.layout(props.headline.trim() || ' ', {
      style: {
        font: display.font,
        italicFont: display.italic,
        size,
        weight: display.weight,
        width: display.width,
        tracking: display.tracking,
        features: display.features,
      },
      maxWidth: measure,
      maxLines: comp.maxLines,
      lineHeight: display.lineHeight,
      align: center ? 'center' : 'left',
      fit: { minSize: size * 0.4 },
    });

    const eyebrowText = props.eyebrow.trim();
    const eyebrow: TextBlock | null = eyebrowText
      ? text.layout(eyebrowText, {
          style: {
            font: pairing.text.font,
            size: comp.eyebrow * u,
            weight: 500,
            width: pairing.text.width,
            tracking: 0.02,
          },
          maxWidth: measure,
          maxLines: 1,
          lineHeight: 1.2,
          align: center ? 'center' : 'left',
          fit: { minSize: 2.4 * u },
        })
      : null;

    // --- lockup: eyebrow · rule · headline ------------------------------------------------
    const ruleW = 6 * u;
    const ruleH = 0.35 * u;
    let height = 0;
    const eyebrowY = height;
    if (eyebrow) height += eyebrow.height + (props.rule ? 2.4 * u : 3.2 * u);
    const ruleY = height;
    if (props.rule) height += ruleH + 3.6 * u;
    const headlineY = height;
    height += headline.height;

    // Optically centered, or seated on the bottom of the safe area with room for descenders.
    const top =
      comp.place === 'center' || center
        ? area.y + (area.h - height) * 0.47
        : area.y + area.h - 0.22 * headline.size - height;

    const hx = left;
    const hy = top + headlineY;
    const ex = left;
    const ey = top + eyebrowY;
    const rule: Rect = {
      x: center ? frame.cx - ruleW / 2 : left,
      y: top + ruleY,
      w: ruleW,
      h: ruleH,
    };

    const offset = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const headlineBounds = offset(headline.ink, hx, hy);
    const eyebrowBounds = eyebrow ? offset(eyebrow.ink, ex, ey) : null;
    let lockup = headlineBounds;
    if (eyebrowBounds) lockup = unionRect(lockup, eyebrowBounds);
    if (props.rule) lockup = unionRect(lockup, rule);

    // --- motion parameters (Balanced seconds; energy scales them) ------------------------
    const rise = (headline.lines[0]?.mask.h ?? size) * RISE;
    const skewMax = ctx.travel(6);
    const drift = ctx.travel(0.6 * u);
    const lineGap = ctx.stagger(0.08);
    const wordGap = ctx.stagger(0.025);
    const exitGap = ctx.stagger(0.05);
    const lineCount = headline.lines.length;

    // Per-line lookups so the per-glyph callback does no searching or allocation.
    const firstWord = headline.lines.map((line) => line.words[0]?.index ?? 0);
    const firstGlyph = headline.lines.map((line) => line.glyphs[0]?.index ?? 0);
    const glyphPivot = headline.lines.map((line) => (center ? (line.glyphs.length - 1) / 2 : 0));
    const wordRise = new Float64Array(Math.max(1, headline.wordCount));
    const motion: GlyphTransform = { dx: 0, dy: 0 };
    let tracking = 0;

    const animateGlyph = (glyph: Glyph, line: TextLine): GlyphTransform => {
      const k = glyph.index - (firstGlyph[line.index] ?? 0) - (glyphPivot[line.index] ?? 0);
      motion.dx = tracking * k;
      motion.dy = wordRise[glyph.word] ?? 0;
      return motion;
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        // Hold breath: drift up and open tracking; both settle in with `drift` (sine in-out).
        const breath = tl.p(t, 'hold', {}, 'drift');
        tracking = 0.01 * headline.size * breath;

        g.movable('lockup', lockup, (g) => {
          g.group({ y: -drift * breath }, (g) => {
            // Accent rule: draws left→right, retracts right→left.
            if (props.rule) {
              const drawn = tl.p(t, 'in', { dur: 0.4 }, 'snap');
              const retracted = tl.p(t, 'out', { delay: 0.05, dur: 0.4 }, 'exit');
              const w = rule.w * drawn * (1 - retracted);
              if (w > 0) g.rect({ x: rule.x, y: rule.y, w, h: rule.h }, { fill: accent });
            }

            // Eyebrow: fades in rising 1u, fades out.
            if (eyebrow) {
              const shown = tl.p(t, 'in', { dur: 0.4 }, 'glide');
              const hidden = tl.p(t, 'out', { dur: 0.35 }, 'swift');
              const opacity = shown * (1 - hidden);
              if (opacity > 0) {
                g.text(eyebrow, { fill: muted, x: ex, y: ey + (1 - shown) * u, opacity });
              }
            }

            // Headline: per-line masks, skew-straighten, word trail.
            headline.lines.forEach((line, i) => {
              const lineDelay = 0.1 + i * lineGap;
              for (const word of line.words) {
                const w = word.index - (firstWord[i] ?? 0);
                const p = tl.p(t, 'in', { delay: lineDelay + w * wordGap, dur: 0.7 }, energy.enter);
                wordRise[word.index] = (1 - p) * rise;
              }
              const straightened = tl.p(t, 'in', { delay: lineDelay, dur: 0.8 }, energy.enter);
              const order = props.exit === 'down' ? lineCount - 1 - i : i;
              const out = tl.p(t, 'out', { delay: order * exitGap, dur: 0.45 }, 'exit');
              const exitY =
                props.exit === 'up' ? -out * rise : props.exit === 'down' ? out * rise : -out * u;
              const opacity = props.exit === 'fade' ? 1 - out : 1;
              if (opacity <= 0) return;

              const mask = offset(line.mask, hx, hy);
              g.clip(mask, (g) =>
                g.group(
                  {
                    // Pivot on the line's left edge: the skew only ever lowers glyphs, so
                    // nothing peeks out of the mask before the rise (frame 0 stays clean).
                    skewY: skewMax * (1 - straightened),
                    originX: hx + Math.min(line.x, line.ink.x),
                    originY: hy + line.baseline,
                  },
                  (g) =>
                    g.text(line, {
                      fill: fg,
                      x: hx,
                      y: hy + exitY,
                      opacity,
                      glyph: animateGlyph,
                    }),
                ),
              );
            });
          });
          g.editable('headline', headlineBounds);
          if (eyebrowBounds) g.editable('eyebrow', eyebrowBounds);
        });
      },
    };
  },
});
