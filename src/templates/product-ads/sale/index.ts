/**
 * Sale — promo tape (docs/templates/04-product-ads.md §4.5).
 *
 * The expensive detail: the tape text is laid out as an exact repeat unit (text, vector dots and
 * gaps shaped once; copies drawn at whole multiples of the unit), so the marquee can never pop —
 * and its speed is trimmed by a few percent so the hold is itself a seamless loop. Where the
 * tapes cross, the upper tape casts a soft shadow onto the lower one.
 */

import {
  bestContrast,
  CLEAN_END,
  type Color,
  c,
  contrastRatio,
  type Draw,
  defineTemplate,
  degToRad,
  ease,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type Gradient,
  mixOklab,
  mixOklch,
  type Rect,
  rgb,
  spring,
  type TextBlock,
  unionRect,
  withAlpha,
} from '@/engine';
import { dashedBorder, drawDashedBorder } from './dashes';
import { createMarquee } from './marquee';

type Composition = {
  /** Tape angles in degrees (Low · High) and thickness in u. */
  low: number;
  high: number;
  tape: number;
  /** Crossing point of the tapes (share of the frame's height). */
  cross: number;
  /** Type sizes in u (the discount is the largest that fits). */
  discount: number;
  subline: number;
  code: number;
  terms: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': {
    low: 5,
    high: 8.5,
    tape: 8,
    cross: 0.2,
    discount: 34,
    subline: 3.4,
    code: 3.4,
    terms: 2.4,
  },
  '1:1': {
    low: 8,
    high: 13,
    tape: 9,
    cross: 0.2,
    discount: 34,
    subline: 3.8,
    code: 3.8,
    terms: 2.5,
  },
  '4:5': {
    low: 8,
    high: 13,
    tape: 9,
    cross: 0.2,
    discount: 32,
    subline: 3.8,
    code: 3.8,
    terms: 2.5,
  },
  '9:16': {
    low: 9,
    high: 15,
    tape: 10,
    cross: 0.2,
    discount: 38,
    subline: 4.4,
    code: 4.4,
    terms: 2.9,
  },
};

const WHITE: Color = rgb(1, 1, 1);
const BLACK: Color = rgb(0, 0, 0);

/** Camera shake on impact: three frames at 30 fps (offsets in u). */
const SHAKE: readonly (readonly [number, number])[] = [
  [1.1, -0.8],
  [-0.9, 0.6],
  [0.45, -0.3],
  [-0.2, 0.15],
];

/** 0 → 1 → 0 bump every `period` seconds, `length` long (hold pulses). */
function bump(time: number, period: number, length: number): number {
  if (time < 0) return 0;
  const phase = time % period;
  return phase < length ? Math.sin((Math.PI * phase) / length) ** 2 : 0;
}

/** Where a pop-eased move first reaches its target (the impact of a slam). */
const POP_IMPACT = (() => {
  for (let x = 0; x <= 1; x += 0.001) if (ease.pop(x) >= 1) return x;
  return 1;
})();

/** Seconds until the lively spring first reaches its target (Punchy's slam). */
const LIVELY_IMPACT = (() => {
  for (let s = 0; s < 1; s += 0.001) if (spring(s, 0, 1, 'lively') >= 1) return s;
  return 0.2;
})();

const SHOWN: GlyphTransform = {};

export default defineTemplate({
  id: 'sale',
  version: 1,
  meta: {
    name: 'Sale',
    tagline: 'Promo tape',
    category: 'product-ads',
    tags: ['sale', 'discount', 'promo', 'marquee', 'code'],
    useCases: ['Seasonal sales', 'Black Friday', 'Promo codes', 'Store openings'],
  },
  formats: ['1:1', '4:5', '9:16', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 5, min: 4, max: 12 },
  alpha: 'none',
  poster: 3.2,
  palettes: [
    { kind: 'library', id: 'hazard' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'cobalt' },
  ],
  pairings: ['poster', 'sport', 'grotesk', 'wide', 'quirky'],
  controls: {
    discount: c.text({
      label: 'Discount',
      default: '−50%',
      maxLength: 12,
      multiline: true,
      maxLines: 2,
      primary: true,
    }),
    subline: c.text({
      label: 'Subline',
      default: 'Everything. This weekend only.',
      maxLength: 48,
      optional: true,
    }),
    tape: c.text({ label: 'Tape text', default: 'SUMMER SALE ●', maxLength: 28 }),
    code: c.text({ label: 'Code', default: 'MOVE50', maxLength: 14, optional: true }),
    terms: c.text({ label: 'Terms', default: 'Ends Sunday 23:59.', maxLength: 60, optional: true }),
    angle: c.choice({
      label: 'Tape angle',
      default: 'low',
      options: [
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' },
      ],
    }),
    speed: c.number({
      label: 'Marquee speed',
      default: 1,
      min: 0.5,
      max: 2,
      step: 0.25,
      unit: '×',
    }),
  },
  looks: [
    { id: 'hazard', name: 'Hazard', palette: { kind: 'library', id: 'hazard' }, pairing: 'poster' },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'sport' },
    { id: 'candy', name: 'Candy', palette: { kind: 'library', id: 'candy' }, pairing: 'wide' },
  ],
  timing: ({ props }) => ({ in: 2.3, out: 0.4, tail: CLEAN_END, readable: props.subline }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u, width: W, height: H } = frame;
    const { bg, fg, muted, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const areaBottom = area.y + area.h;
    const display = pairing.display;
    const body = pairing.text;

    // --- tapes -----------------------------------------------------------------------------
    const angle = props.angle === 'high' ? comp.high : comp.low;
    const a = degToRad(angle);
    const T = comp.tape * u;
    const cx = frame.cx;
    const cy = H * comp.cross;
    const length = Math.hypot(W, H) * 1.2;
    // Extent of the frame along each tape's axis (from the crossing), for drawing only what shows.
    const corners: [number, number][] = [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ];
    const along = (sign: number) =>
      corners.map(([x, y]) => (x - cx) * Math.cos(a) + (y - cy) * -sign * Math.sin(a));
    const spanA = along(1);
    const spanB = along(-1);
    const rangeA: [number, number] = [Math.min(...spanA), Math.max(...spanA)];
    const rangeB: [number, number] = [Math.min(...spanB), Math.max(...spanB)];
    const reachA = Math.max(...spanA.map(Math.abs));
    const reachB = Math.max(...spanB.map(Math.abs));
    // Far enough that each tape starts (and ends) fully outside the frame.
    const slideA = length / 2 + reachA + 4 * u;
    const slideB = length / 2 + reachB + 4 * u;

    const tapeInk =
      contrastRatio(bg, accent) >= 4.5 ? bg : bestContrast(accent, [fg, WHITE, BLACK]);
    const tapeTop = accent;
    // The lower tape sits a step back (and in the upper one's shadow): a touch toward the page.
    const tapeLow = mixOklab(accent, bg, 0.2);
    const probe = text.line('H', { font: display.font, size: 100, weight: display.weight });
    const capRatio = probe.capHeight / 100;
    const marquee = createMarquee(text, props.tape, {
      font: display.font,
      size: (T * 0.4) / capRatio,
      weight: display.weight,
      width: display.width,
      tracking: 0.04,
      case: 'upper',
      features: display.features,
    });
    const rule = Math.max(0.18 * u, T * 0.025);
    const ruleInset = T * 0.13;
    const tapeRect: Rect = { x: -length / 2, y: -T / 2, w: length, h: T };

    // The upper tape's shadow on the lower one: a soft band under its footprint, pushed down.
    const blur = 1.3 * u;
    const drop = 0.7 * u;
    const shadowColor = mixOklab(tapeLow, BLACK, 0.7);
    const shadow: Gradient = {
      kind: 'linear',
      x0: 0,
      y0: -T / 2 - blur + drop,
      x1: 0,
      y1: T / 2 + blur + drop,
      stops: [
        { offset: 0, color: withAlpha(shadowColor, 0) },
        { offset: (2 * blur) / (T + 2 * blur), color: withAlpha(shadowColor, 0.62) },
        { offset: 1 - (2 * blur) / (T + 2 * blur), color: withAlpha(shadowColor, 0.62) },
        { offset: 1, color: withAlpha(shadowColor, 0) },
      ],
    };

    // Marquee speed: trimmed so the hold scrolls a whole number of units (the hold loops).
    const hold = timeline.sections.hold;
    const holdLength = hold.end - hold.start;
    const nominal = 15 * u * props.speed;
    const units = Math.max(1, Math.round((nominal * holdLength) / marquee.unit));
    const looped = (units * marquee.unit) / Math.max(holdLength, 1e-6);
    const speed = Math.abs(looped / nominal - 1) <= 0.3 ? looped : nominal;

    // --- content ------------------------------------------------------------------------------
    const half = Math.min(cx - area.x, area.x + area.w - cx);
    const columnX = cx - half;
    const columnW = half * 2;
    const bandBottom = cy + Math.tan(a) * (W / 2) + T / (2 * Math.cos(a));
    const top = Math.max(area.y, bandBottom + 3.5 * u);
    const available = areaBottom - top;

    const sublineText = props.subline.trim();
    const subline: TextBlock | null = sublineText
      ? text.layout(sublineText, {
          style: {
            font: body.font,
            size: comp.subline * u,
            weight: 600,
            width: body.width,
            tracking: 0,
            features: body.features,
          },
          maxWidth: columnW * 0.86,
          maxLines: 2,
          lineHeight: 1.2,
          align: 'center',
          fit: { minSize: 2.6 * u },
        })
      : null;

    const codeText = props.code.trim();
    const codeSize = comp.code * u;
    const code: TextBlock | null = codeText
      ? text.layout(codeText, {
          style: {
            font: body.font,
            size: codeSize,
            weight: 700,
            width: body.width,
            tracking: 0.16,
            case: 'upper',
            features: body.features,
          },
          maxWidth: columnW * 0.7,
          maxLines: 1,
          lineHeight: 1.2,
          align: 'center',
          fit: { minSize: 2.6 * u },
        })
      : null;
    const padX = codeSize * 1.25;
    const padY = codeSize * 0.8;
    const boxW = code ? code.ink.w + 2 * padX : 0;
    const boxH = code ? code.capHeight + 2 * padY : 0;

    const termsText = props.terms.trim();
    const terms: TextBlock | null = termsText
      ? text.layout(termsText, {
          style: {
            font: body.font,
            size: comp.terms * u,
            weight: 450,
            width: body.width,
            tracking: 0.01,
            features: body.features,
          },
          maxWidth: columnW * 0.86,
          maxLines: 2,
          lineHeight: 1.3,
          align: 'center',
          fit: { minSize: 2.4 * u },
        })
      : null;

    const gapSub = 3 * u;
    const gapCode = 3.6 * u;
    const gapTerms = 2.6 * u;
    let rest = 0;
    if (subline) rest += gapSub + subline.height + subline.size * 0.3;
    if (code) rest += gapCode + boxH;
    if (terms) rest += gapTerms + terms.height + terms.size * 0.3;

    // The discount: the largest size that fits the column and the height that's left.
    const discountText = props.discount.trim() || ' ';
    const layoutDiscount = (size: number) =>
      text.layout(discountText, {
        style: {
          font: display.font,
          italicFont: display.italic,
          size,
          weight: display.weight,
          width: display.width,
          tracking: display.tracking - 0.01,
          features: display.features,
        },
        maxWidth: columnW * 0.92,
        maxLines: 2,
        lineHeight: display.lineHeight,
        align: 'center',
        fit: { minSize: 8 * u },
      });
    let discount = layoutDiscount(comp.discount * u);
    const room = available - rest - discount.size * 0.08;
    if (discount.height > room && room > 0) {
      discount = layoutDiscount(Math.max(8 * u, (discount.size * room) / discount.height));
    }

    const stackH = discount.height + rest;
    const stackTop = top + Math.max(0, (available - stackH) * 0.46);
    const discountY = stackTop;
    let y = discountY + discount.height;
    const sublineY = subline ? y + gapSub + subline.size * 0.3 : y;
    if (subline) y = sublineY + subline.height;
    const box: Rect | null = code ? { x: cx - boxW / 2, y: y + gapCode, w: boxW, h: boxH } : null;
    if (box) y = box.y + box.h;
    const termsY = terms ? y + gapTerms + terms.size * 0.3 : y;

    const shift = (r: Rect, x: number, yy: number): Rect => ({
      x: r.x + x,
      y: r.y + yy,
      w: r.w,
      h: r.h,
    });
    const discountX = columnX + columnW * 0.04;
    const discountBounds = shift(discount.ink, discountX, discountY);
    const sublineBounds = subline ? shift(subline.ink, columnX + columnW * 0.07, sublineY) : null;
    const termsBounds = terms ? shift(terms.ink, columnX + columnW * 0.07, termsY) : null;
    let offer = discountBounds;
    for (const r of [sublineBounds, box, termsBounds]) if (r) offer = unionRect(offer, r);
    const dcx = discountBounds.x + discountBounds.w / 2;
    const dcy = discountBounds.y + discountBounds.h / 2;

    const border = box ? dashedBorder(box, 1.1 * u, 1.5 * u, 1 * u) : null;
    const flashInk =
      contrastRatio(bg, accent) >= 4.5 ? bg : bestContrast(accent, [fg, WHITE, BLACK]);

    // The tapes' visible band, for the editor (clipped to the safe area).
    const safe = frame.safe.title;
    const bandTop = cy - Math.tan(a) * (W / 2) - T / (2 * Math.cos(a));
    const tapeBounds: Rect = {
      x: safe.x,
      y: Math.max(safe.y, bandTop),
      w: safe.w,
      h: Math.min(safe.y + safe.h, bandBottom) - Math.max(safe.y, bandTop),
    };

    // --- motion (Balanced seconds; energy scales the in/out windows) ------------------------
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    const tapeCurve = calm ? 'glide' : 'snap';
    const slamFrom = calm ? 1.15 : punchy ? 1.6 : 1.5;
    const slamCurve = calm ? 'glide' : 'pop';
    // The slam's impact (absolute seconds): where the discount first reaches its size.
    const impact = punchy
      ? timeline.at('in', 0.4) + LIVELY_IMPACT
      : timeline.at('in', 0.4 + POP_IMPACT * 0.5);
    const shake = calm ? 0 : ctx.travel(u);
    const pulse = calm ? 0.012 : punchy ? 0.05 : 0.03;
    const pulsePeriod = holdLength / Math.max(1, Math.round(holdLength / (calm ? 4 : 1)));
    const pulseLength = calm ? pulsePeriod * 0.999 : punchy ? 0.26 : 0.36;
    const codeChars = code ? code.glyphCount : 0;
    let typed = 0;
    const typeGlyph = (glyph: Glyph): GlyphTransform | null => (glyph.index < typed ? SHOWN : null);

    const drawTape = (
      g: Draw,
      rotate: number,
      slide: number,
      scroll: number,
      fill: Color,
      span: readonly [number, number],
      under: ((g: Draw) => void) | null,
    ) => {
      g.group({ x: cx, y: cy, rotate }, (g) => {
        const rect: Rect = { x: tapeRect.x + slide, y: tapeRect.y, w: tapeRect.w, h: tapeRect.h };
        g.rect(rect, { fill });
        const from = Math.max(span[0], rect.x);
        const to = Math.min(span[1], rect.x + rect.w);
        if (to <= from) return;
        g.clip(rect, (g) => {
          // Printed edge rules and the scrolling text.
          g.rect(
            { x: from, y: -T / 2 + ruleInset, w: to - from, h: rule },
            {
              fill: tapeInk,
              opacity: 0.55,
            },
          );
          g.rect(
            { x: from, y: T / 2 - ruleInset - rule, w: to - from, h: rule },
            {
              fill: tapeInk,
              opacity: 0.55,
            },
          );
          marquee.draw(g, {
            offset: slide + scroll,
            from,
            to,
            baseline: marquee.capHeight / 2,
            fill: tapeInk,
          });
          if (under) under(g);
        });
      });
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        // Camera shake on the slam's impact (3 frames at 30 fps, whatever the export rate).
        let sx = 0;
        let sy = 0;
        const since = t - impact;
        if (shake > 0 && since >= 0) {
          const step = Math.floor(since * 30 + 1e-9);
          const offset = SHAKE[step];
          if (offset && step < (punchy ? 4 : 3)) {
            sx = offset[0] * shake;
            sy = offset[1] * shake;
          }
        }

        g.group({ x: sx, y: sy }, (g) => {
          // --- tapes: slide in along their axes, scroll, fly out ------------------------------
          const inB = tl.p(t, 'in', { dur: 0.45 }, tapeCurve);
          const inA = tl.p(t, 'in', { delay: 0.06, dur: 0.45 }, tapeCurve);
          const outA = tl.p(t, 'out', { dur: 0.37 }, 'exit');
          const outB = tl.p(t, 'out', { delay: 0.03, dur: 0.37 }, 'exit');
          const scroll = speed * t;
          const offA = slideA * (1 - inA) - slideA * outA;
          const offB = -slideB * (1 - inB) + slideB * outB;
          const showB = inB > 0 && outB < 1;
          const showA = inA > 0 && outA < 1;
          if (showB) {
            // The upper tape's shadow falls on the lower one, in the lower tape's clip.
            const under = showA
              ? (g: Draw) =>
                  g.group({ rotate: -2 * angle }, (g) =>
                    g.rect(
                      {
                        x: tapeRect.x + offA,
                        y: tapeRect.y - blur + drop,
                        w: length,
                        h: T + 2 * blur,
                      },
                      {
                        fill: shadow,
                      },
                    ),
                  )
              : null;
            drawTape(g, angle, offB, scroll, tapeLow, rangeB, under);
          }
          if (showA) drawTape(g, -angle, offA, -scroll, tapeTop, rangeA, null);
          g.editable('tape', tapeBounds);

          // --- the offer ------------------------------------------------------------------------
          const cut = calm
            ? tl.p(t, 'out', { dur: 0.2 }, 'drift')
            : t >= tl.sections.out.start
              ? 1
              : 0;
          if (cut >= 1) return;
          const alive = 1 - cut;
          g.movable('offer', offer, (g) => {
            // Discount: slams in, lands with a shake, pulses on the beat in the hold.
            const appear = tl.p(t, 'in', { delay: 0.4, dur: 0.06 }, 'linear');
            if (appear > 0) {
              const slam = punchy
                ? spring(t - tl.at('in', 0.4), 0, 1, 'lively')
                : tl.p(t, 'in', { delay: 0.4, dur: 0.5 }, slamCurve);
              const scale = slamFrom + (1 - slamFrom) * slam;
              const beat = bump(t - hold.start, pulsePeriod, pulseLength);
              g.group(
                {
                  scale: scale * (1 + pulse * beat),
                  rotate: -4 + 2 * slam,
                  originX: dcx,
                  originY: dcy,
                  opacity: appear * alive,
                },
                (g) => g.text(discount, { fill: fg, x: discountX, y: discountY }),
              );
              g.editable('discount', discountBounds);
            }

            // Subline: rises out of its line masks.
            if (subline && sublineBounds) {
              const x = columnX + columnW * 0.07;
              subline.lines.forEach((line, i) => {
                const p = tl.p(
                  t,
                  'in',
                  { delay: 0.9 + i * ctx.stagger(0.08), dur: 0.5 },
                  energy.enter,
                );
                if (p <= 0) return;
                const mask = shift(line.mask, x, sublineY);
                g.clip(mask, (g) =>
                  g.text(line, {
                    fill: fg,
                    x,
                    y: sublineY + (1 - p) * mask.h * 1.05,
                    opacity: alive,
                  }),
                );
              });
              g.editable('subline', sublineBounds);
            }

            // Code: the dashed border draws on, the code types in, the box flashes once.
            if (box && border && code) {
              const drawn = tl.p(t, 'in', { delay: 1.5, dur: 0.42 }, calm ? 'glide' : 'snap');
              const typing = tl.p(t, 'in', { delay: 1.78, dur: 0.32 }, 'linear');
              typed = Math.floor(typing * codeChars + 1e-9);
              const flash = calm
                ? 0
                : Math.sin(Math.PI * tl.p(t, 'in', { delay: 2.1, dur: 0.3 }, 'linear')) ** 2;
              if (flash > 0.001) {
                g.roundRect(box, 1.1 * u, { fill: accent, opacity: flash * alive });
              }
              drawDashedBorder(
                g,
                border,
                drawn,
                { color: fg, width: Math.max(0.22 * u, codeSize * 0.07) },
                alive,
              );
              if (typed > 0) {
                const ink = flash > 0.001 ? mixOklch(fg, flashInk, flash) : fg;
                g.text(code, {
                  fill: ink,
                  x: box.x + padX - code.ink.x,
                  y: box.y + padY,
                  opacity: alive,
                  glyph: typed < codeChars ? typeGlyph : undefined,
                });
              }
              // The caret while typing.
              if (typing > 0 && typing < 1) {
                const glyph = code.lines[0]?.glyphs[Math.min(typed, codeChars - 1)];
                const caretX =
                  box.x +
                  padX -
                  code.ink.x +
                  (code.lines[0]?.x ?? 0) +
                  (glyph ? glyph.x + (typed >= codeChars ? glyph.advance : 0) : 0);
                g.rect(
                  {
                    x: caretX,
                    y: box.y + padY - code.capHeight * 0.1,
                    w: Math.max(0.2 * u, codeSize * 0.08),
                    h: code.capHeight * 1.2,
                  },
                  { fill: fg, opacity: alive },
                );
              }
              g.editable('code', box);
            }

            // Terms: small print, fades in last.
            if (terms && termsBounds) {
              const shown = tl.p(t, 'in', { delay: 1.95, dur: 0.35 }, 'drift');
              if (shown > 0) {
                g.text(terms, {
                  fill: muted,
                  x: columnX + columnW * 0.07,
                  y: termsY + (1 - shown) * 0.6 * u,
                  opacity: shown * alive,
                });
                g.editable('terms', termsBounds);
              }
            }
          });
        });
      },
    };
  },
});
