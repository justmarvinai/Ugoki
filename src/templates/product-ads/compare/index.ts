/**
 * Compare — before / after (docs/templates/04-product-ads.md §4.4).
 *
 * The expensive detail: the divider moves like a hand on a slider — it sweeps past the middle
 * to 85%, overshoots, and settles back to the middle on a spring (energy picks the spring), then
 * breathes around it. And the comparison is truthful: both pictures are placed so their focal
 * points land on the same spot (the same shot taken twice lines up feature for feature, even
 * when the files are cropped differently). Left on the default pair, one scene is shown flat
 * (as shot) against its grade.
 */

import {
  CLEAN_END,
  type Color,
  c,
  contrastRatio,
  type Draw,
  defineTemplate,
  type FormatId,
  type Gradient,
  type Graphic,
  type PathData,
  type Rect,
  rgb,
  spring,
  type TextBlock,
  withAlpha,
} from '@/engine';
import { alignPair, type Placement } from './align';
import { type Baked, bakeGrade, type Grade } from './grade';

type Composition = {
  /** Headline (display face) and label (text face) sizes, in u. */
  headline: number;
  label: number;
  /** Grip diameter, in u. */
  grip: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '1:1': { headline: 6.4, label: 2.5, grip: 7.2 },
  '4:5': { headline: 6.4, label: 2.6, grip: 7.2 },
  '9:16': { headline: 7, label: 3, grip: 8.4 },
  '16:9': { headline: 6.4, label: 2.4, grip: 6.8 },
};

/**
 * The default pair: the scene flat, as a camera records it (lifted, low-contrast, muted, a grey
 * cast), against the scene as graded — the placeholder's own finished look.
 */
const FLAT: Grade = {
  brightness: 1.07,
  contrast: 0.7,
  saturation: 0.45,
  tint: { color: rgb(0.54, 0.57, 0.58), amount: 0.1 },
};

const WHITE: Color = rgb(1, 1, 1);
const BLACK: Color = rgb(0, 0, 0);

/** Same picture in both slots (the same placeholder or the same file). */
function samePicture(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const x = a as { kind?: string; id?: string; hash?: string };
  const y = b as { kind?: string; id?: string; hash?: string };
  if (x.kind === 'placeholder' && y.kind === 'placeholder') return x.id === y.id;
  if (x.kind === 'user' && y.kind === 'user') return x.hash === y.hash;
  return false;
}

export default defineTemplate({
  id: 'compare',
  version: 1,
  meta: {
    name: 'Compare',
    tagline: 'Before / after',
    category: 'product-ads',
    tags: ['before after', 'comparison', 'redesign', 'photo edit', 'slider'],
    useCases: ['Redesigns', 'Photo edits', 'Renovations', 'Skincare', 'App updates', 'Glow-ups'],
  },
  formats: ['1:1', '4:5', '9:16', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 4, max: 12 },
  alpha: 'none',
  poster: 3.4,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'mono-light' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'blush' },
  ],
  pairings: ['grotesk', 'editorial', 'wide', 'soft', 'technical'],
  controls: {
    before: c.image({
      label: 'Before image',
      accept: 'scene',
      default: { kind: 'placeholder', id: 'scene-alpine' },
    }),
    after: c.image({
      label: 'After image',
      accept: 'scene',
      default: { kind: 'placeholder', id: 'scene-alpine' },
    }),
    beforeLabel: c.text({
      label: 'Before label',
      default: 'Before',
      maxLength: 14,
      optional: true,
    }),
    afterLabel: c.text({ label: 'After label', default: 'After', maxLength: 14, optional: true }),
    headline: c.text({
      label: 'Headline',
      default: 'One click. Totally different.',
      maxLength: 48,
      multiline: true,
      maxLines: 2,
      optional: true,
      primary: true,
    }),
    divider: c.choice({
      label: 'Divider',
      default: 'grip',
      options: [
        { value: 'line', label: 'Line' },
        { value: 'grip', label: 'Grip' },
      ],
    }),
    orientation: c.choice({
      label: 'Orientation',
      default: 'horizontal',
      options: [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' },
      ],
      hint: 'Horizontal: side by side · Vertical: one above the other',
    }),
    radius: c.number({
      label: 'Corner radius',
      group: 'style',
      default: 2,
      min: 0,
      max: 6,
      step: 0.5,
      unit: 'u',
    }),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    {
      id: 'mono-light',
      name: 'Mono Light',
      palette: { kind: 'library', id: 'mono-light' },
      pairing: 'editorial',
      values: { divider: 'line', radius: 0 },
    },
  ],
  timing: ({ props }) => ({ in: 2.9, out: 0.6, tail: CLEAN_END, readable: props.headline }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const vertical = props.orientation === 'vertical';
    const display = pairing.display;
    const body = pairing.text;

    // --- layout: headline above the pictures, one card below ---------------------------------
    // Vertical formats keep the card symmetric around the frame's center, inside the social zone.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const cardX = frame.vertical ? frame.cx - half : area.x;
    const cardW = frame.vertical ? half * 2 : area.w;
    const headlineText = props.headline.trim();
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
          maxWidth: cardW,
          maxLines: 2,
          lineHeight: display.lineHeight,
          align: 'left',
          fit: { minSize: 3.4 * u },
        })
      : null;
    const hx = cardX;
    const hy = area.y;
    const headlineBounds: Rect | null = headline
      ? {
          x: hx + headline.ink.x,
          y: hy + headline.ink.y,
          w: headline.ink.w,
          h: headline.ink.h,
        }
      : null;
    const cardTop = headline ? hy + headline.height + 0.3 * headline.size + 4.4 * u : area.y;
    const card: Rect = { x: cardX, y: cardTop, w: cardW, h: area.y + area.h - cardTop };
    const radius = Math.min(props.radius * u, card.w / 2, card.h / 2);
    const cardShape = { rect: card, radius };

    // --- pictures -----------------------------------------------------------------------------
    const beforeArt = ctx.graphic('before');
    const afterArt = ctx.graphic('after');
    // The default pair (one picture in both slots) shows it as shot against its grade; its two
    // copies share one focal point, so they stay in register.
    const flat = samePicture(props.before, props.after);
    const focalA = ctx.focal('before');
    const focalB = ctx.focal('after');
    const shared = { x: (focalA.x + focalB.x) / 2, y: (focalA.y + focalB.y) / 2 };
    const beforeFocal = flat ? shared : focalA;
    const afterFocal = flat ? shared : focalB;
    let beforePlace: Placement | null = null;
    let afterPlace: Placement | null = null;
    if (beforeArt && afterArt) {
      [beforePlace, afterPlace] = alignPair(
        card,
        { graphic: beforeArt, focal: beforeFocal },
        { graphic: afterArt, focal: afterFocal },
      );
    } else {
      const single = beforeArt ?? afterArt;
      if (single) {
        const one = alignPair(
          card,
          { graphic: single, focal: beforeArt ? beforeFocal : afterFocal },
          { graphic: single, focal: beforeArt ? beforeFocal : afterFocal },
        )[0];
        if (beforeArt) beforePlace = one;
        else afterPlace = one;
      }
    }
    const flatImage: Baked | null = flat ? bakeGrade(beforeArt, FLAT) : null;
    const anchorX = card.x + card.w * ((beforeFocal.x + afterFocal.x) / 2);
    const anchorY = card.y + card.h * ((beforeFocal.y + afterFocal.y) / 2);

    const picture = (
      g: Draw,
      art: Graphic | null,
      place: Placement | null,
      baked: Baked | null,
      fallback: Grade | null,
    ) => {
      if (!art || !place) return;
      if (baked) {
        g.image(baked, place);
      } else if (fallback) {
        g.fx({ adjust: fallback, bounds: card }, (g) => g.graphic(art, place, { by: 'box' }));
      } else if (art.kind === 'raster') {
        g.image(art.image, place);
      } else {
        g.graphic(art, place, { by: 'box' });
      }
    };
    const drawBefore = (g: Draw) =>
      picture(g, beforeArt, beforePlace, flatImage, flat ? FLAT : null);
    const drawAfter = (g: Draw) => picture(g, afterArt, afterPlace, null, null);

    // --- labels: pills in the pictures' corners -----------------------------------------------
    const labelStyle = {
      font: body.font,
      size: comp.label * u,
      weight: 600,
      width: body.width,
      tracking: 0.02,
      features: body.features,
    };
    const label = (value: string): TextBlock | null =>
      value.trim()
        ? text.layout(value.trim(), {
            style: labelStyle,
            maxWidth: card.w * 0.4,
            maxLines: 1,
            lineHeight: 1.2,
            fit: { minSize: 2.4 * u },
          })
        : null;
    const afterText = label(props.afterLabel);
    const beforeText = label(props.beforeLabel);
    const inset = 2.6 * u;
    const pill = (block: TextBlock | null, corner: 'tl' | 'tr' | 'bl'): Rect | null => {
      if (!block) return null;
      const h = block.size * 2.3;
      const w = block.width + block.size * 2.1;
      const x = corner === 'tr' ? card.x + card.w - inset - w : card.x + inset;
      const y = corner === 'bl' ? card.y + card.h - inset - h : card.y + inset;
      return { x, y, w, h };
    };
    const afterPill = pill(afterText, 'tl');
    const beforePill = pill(beforeText, vertical ? 'bl' : 'tr');
    // Pills in the palette's own colors, a touch translucent over the picture.
    const pillFill = withAlpha(bg, 0.9);
    const pillInk = contrastRatio(fg, bg) >= 4.5 ? fg : palette.dark ? WHITE : BLACK;

    // --- divider --------------------------------------------------------------------------------
    // A light line and grip, whatever the palette: it sits on pictures, not on the background.
    // (Contrast against black orders colors by luminance.)
    const brighter = contrastRatio(fg, BLACK) > contrastRatio(bg, BLACK);
    const lightest = brighter ? fg : bg;
    const lineColor = contrastRatio(lightest, BLACK) > 13 ? lightest : WHITE;
    const darkest = brighter ? bg : fg;
    const chevronColor = contrastRatio(darkest, lineColor) >= 4.5 ? darkest : BLACK;
    const gripR = (comp.grip * u) / 2;
    const lineW = 0.34 * u;
    const shadeStops = [0, 0.25, 0.5, 0.75, 1].map((offset) => ({
      offset,
      color: withAlpha(
        BLACK,
        offset > 0 && offset < 1 ? 0.2 * Math.exp(-(((offset - 0.5) / 0.22) ** 2)) : 0,
      ),
    }));
    const shadeAcrossX: Gradient = {
      kind: 'linear',
      x0: 0,
      y0: 0,
      x1: 1,
      y1: 0,
      stops: shadeStops,
    };
    const shadeAcrossY: Gradient = {
      kind: 'linear',
      x0: 0,
      y0: 0,
      x1: 0,
      y1: 1,
      stops: shadeStops,
    };
    const gripShadow: Gradient = {
      kind: 'radial',
      cx: 0,
      cy: 0,
      r: 1,
      stops: [0.62, 0.72, 0.82, 0.91, 1].map((offset, i) => ({
        offset,
        color: withAlpha(BLACK, [0.28, 0.17, 0.08, 0.025, 0][i] ?? 0),
      })),
    };
    // Chevrons pointing along the divider's travel (◀ ▶, or ▲ ▼ when stacked).
    const chev = gripR * 0.24;
    const off = gripR * 0.3;
    const chevrons: PathData = vertical
      ? [
          ['M', -chev, -off + chev * 0.5],
          ['L', 0, -off - chev * 0.5],
          ['L', chev, -off + chev * 0.5],
          ['M', -chev, off - chev * 0.5],
          ['L', 0, off + chev * 0.5],
          ['L', chev, off - chev * 0.5],
        ]
      : [
          ['M', -off + chev * 0.5, -chev],
          ['L', -off - chev * 0.5, 0],
          ['L', -off + chev * 0.5, chev],
          ['M', off - chev * 0.5, -chev],
          ['L', off + chev * 0.5, 0],
          ['L', off - chev * 0.5, chev],
        ];
    const grip = props.divider === 'grip';

    // --- motion (Balanced seconds; energy scales the in/out windows) ------------------------
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    const reach = calm ? 0.75 : punchy ? 0.9 : 0.85;
    const sweepCurve = calm ? 'drift' : 'snap';
    const settle = calm ? 'heavy' : punchy ? 'lively' : 'snappy';
    const drift = calm ? 0.03 : 0.04;
    const period = calm ? 5 : punchy ? 2.6 : 4;
    const hold = timeline.sections.hold;
    const along = vertical ? card.h : card.w;
    const origin = vertical ? card.y : card.x;
    // When the sweep uncovers the After label's middle, it pops.
    const afterMid = afterPill
      ? vertical
        ? afterPill.y + afterPill.h / 2
        : afterPill.x + afterPill.w / 2
      : origin;
    const share = Math.min(1, Math.max(0, (afterMid - origin) / (along * reach)));
    // Invert the sweep's curve by bisection (time → share is monotonic).
    let lo = 0;
    let hi = 1.4;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const probe = timeline.p(
        timeline.at('in', 0.8 + mid),
        'in',
        { delay: 0.8, dur: 1.4 },
        sweepCurve,
      );
      if (probe < share) lo = mid;
      else hi = mid;
    }
    const popAt = 0.8 + hi;

    /** Divider position (0..1 across the card) at `t`. */
    const position = (t: number, tl: typeof timeline): number => {
      const sweep = tl.p(t, 'in', { delay: 0.8, dur: 1.4 }, sweepCurve);
      let pos = reach * sweep;
      const back = t - tl.at('in', 2.2);
      if (back > 0) pos = spring(back, reach, 0.5, settle);
      const since = t - hold.start;
      if (since > 0) {
        const ramp = tl.p(t, 'hold', { dur: 1.2 }, 'drift');
        pos += drift * ramp * Math.sin((2 * Math.PI * since) / period);
      }
      const home = tl.p(t, 'out', { dur: 0.36 }, 'snap');
      return pos + (1 - pos) * home;
    };

    const drawPill = (g: Draw, block: TextBlock, r: Rect) => {
      g.roundRect(r, r.h / 2, { fill: pillFill });
      g.text(block, {
        fill: pillInk,
        x: r.x + (r.w - block.width) / 2,
        y: r.y + (r.h - block.capHeight) / 2,
      });
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        const shown = tl.p(t, 'in', { dur: 0.6 }, 'drift');
        const settled = tl.p(t, 'in', { dur: 0.9 }, 'glide');
        const gone = tl.p(t, 'out', { delay: 0.3, dur: 0.3 }, 'drift');
        const alpha = shown * (1 - gone);
        if (alpha <= 0) return;
        const scale = 1 + 0.04 * (1 - settled);
        const pos = position(t, tl);
        const cut = origin + along * pos;
        const afterRect: Rect = vertical
          ? { x: card.x, y: card.y, w: card.w, h: cut - card.y }
          : { x: card.x, y: card.y, w: cut - card.x, h: card.h };
        const beforeRect: Rect = vertical
          ? { x: card.x, y: cut, w: card.w, h: card.y + card.h - cut }
          : { x: cut, y: card.y, w: card.x + card.w - cut, h: card.h };

        g.movable('compare', card, (g) => {
          g.group({ opacity: alpha }, (g) => {
            // Pictures: Before everywhere, After on its side of the divider.
            g.clip(cardShape, (g) => {
              g.group({ scale, originX: anchorX, originY: anchorY }, (g) => {
                drawBefore(g);
                if (pos > 0.0005) g.clip(afterRect, drawAfter);
              });
            });

            // Labels, each clipped to its own side.
            if (beforeText && beforePill) {
              const p = tl.p(t, 'in', { delay: 0.25, dur: 0.45 }, 'glide');
              if (p > 0 && beforeRect.w > 0 && beforeRect.h > 0) {
                g.clip(beforeRect, (g) =>
                  g.group({ y: (1 - p) * u, opacity: p }, (g) =>
                    drawPill(g, beforeText, beforePill),
                  ),
                );
              }
            }
            if (afterText && afterPill) {
              const p = calm
                ? tl.p(t, 'in', { delay: popAt, dur: 0.4 }, 'glide')
                : tl.p(t, 'in', { delay: popAt, dur: 0.36 }, 'pop');
              if (p > 0 && afterRect.w > 0 && afterRect.h > 0) {
                const cx = afterPill.x + afterPill.w / 2;
                const cy = afterPill.y + afterPill.h / 2;
                g.clip(afterRect, (g) =>
                  g.group(
                    {
                      scale: 0.7 + 0.3 * p,
                      originX: cx,
                      originY: cy,
                      opacity: Math.min(1, p * 1.6),
                    },
                    (g) => drawPill(g, afterText, afterPill),
                  ),
                );
              }
            }

            // Divider: fades in at the edge, sweeps, settles, breathes; sweeps home on the exit.
            const on = tl.p(t, 'in', { delay: 0.8, dur: 0.2 }, 'drift');
            if (on > 0) {
              g.group({ opacity: on }, (g) => {
                g.clip(cardShape, (g) => {
                  // A soft shadow on both sides of the line (a unit gradient, stretched).
                  const spread = lineW * 4;
                  if (vertical) {
                    g.group({ y: cut - spread / 2, scaleY: spread }, (g) =>
                      g.rect({ x: card.x, y: 0, w: card.w, h: 1 }, { fill: shadeAcrossY }),
                    );
                  } else {
                    g.group({ x: cut - spread / 2, scaleX: spread }, (g) =>
                      g.rect({ x: 0, y: card.y, w: 1, h: card.h }, { fill: shadeAcrossX }),
                    );
                  }
                  const line = vertical
                    ? { x: card.x, y: cut - lineW / 2, w: card.w, h: lineW }
                    : { x: cut - lineW / 2, y: card.y, w: lineW, h: card.h };
                  g.rect(line, { fill: lineColor });
                });
                if (grip) {
                  const gx = vertical ? card.x + card.w / 2 : cut;
                  const gy = vertical ? cut : card.y + card.h / 2;
                  const popIn = calm
                    ? tl.p(t, 'in', { delay: 0.8, dur: 0.5 }, 'glide')
                    : tl.p(t, 'in', { delay: 0.8, dur: 0.45 }, 'pop');
                  g.group({ x: gx, y: gy, scale: 0.6 + 0.4 * popIn }, (g) => {
                    g.group({ y: 0.35 * u, scaleX: gripR * 1.5, scaleY: gripR * 1.5 }, (g) =>
                      g.circle(0, 0, 1, { fill: gripShadow }),
                    );
                    g.circle(0, 0, gripR, { fill: lineColor });
                    g.path(chevrons, {
                      stroke: {
                        color: chevronColor,
                        width: Math.max(0.3 * u, gripR * 0.085),
                        cap: 'round',
                        join: 'round',
                      },
                    });
                  });
                }
              });
            }

            if (afterRect.w > 0 && afterRect.h > 0) g.editable('after', afterRect);
            if (beforeRect.w > 0 && beforeRect.h > 0) g.editable('before', beforeRect);
            if (afterPill) g.editable('afterLabel', afterPill);
            if (beforePill) g.editable('beforeLabel', beforePill);
          });
        });

        // Headline: rises line by line out of its masks.
        if (headline && headlineBounds) {
          g.movable('headline', headlineBounds, (g) => {
            headline.lines.forEach((line, i) => {
              const p = tl.p(
                t,
                'in',
                { delay: 0.2 + i * ctx.stagger(0.08), dur: 0.75 },
                energy.enter,
              );
              if (p <= 0) return;
              const mask = {
                x: hx + line.mask.x,
                y: hy + line.mask.y,
                w: line.mask.w,
                h: line.mask.h,
              };
              g.clip(mask, (g) =>
                g.text(line, {
                  fill: fg,
                  x: hx,
                  y: hy + (1 - p) * mask.h * 1.05,
                  opacity: 1 - gone,
                }),
              );
            });
            g.editable('headline', headlineBounds);
          });
        }
      },
    };
  },
});
