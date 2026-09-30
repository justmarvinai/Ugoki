/**
 * Draw — stroke to fill (docs/templates/09-logo-branding.md §9.2).
 *
 * The expensive detail: the pen's speed is normalized by path length — every contour takes time
 * in proportion to its length, so long outlines don't rush and short ones don't crawl — it
 * draws with round caps, and each island of the logo (an outline with the holes inside it)
 * starts to take its ink *before* its last stroke is finished, while the line thins away into
 * the fill: a technical pen becoming ink. Raster logos have no paths to draw: a sweep led by a
 * thin glowing line reveals them in the pen's color, and then they ink the same way.
 */

import {
  CLEAN_END,
  type Color,
  c,
  contrastRatio,
  type Draw,
  defineTemplate,
  type EaseName,
  ease,
  type FormatId,
  type Gradient,
  type PathCommand,
  type PathData,
  pathLength,
  type Rect,
  type TextBlock,
  withAlpha,
} from '@/engine';
import { flatten, islands, splitContours } from './contours';

/** Logo size: height = K / √aspect (in u), so marks and wide lockups carry similar weight. */
const LOGO_K: Record<FormatId, number> = { '16:9': 33, '9:16': 34, '1:1': 32, '4:5': 33 };
/** Widest the logo may get, as a share of the layout area's width. */
const LOGO_MAX_W: Record<FormatId, number> = {
  '16:9': 0.56,
  '9:16': 0.84,
  '1:1': 0.74,
  '4:5': 0.78,
};
const TAGLINE_SIZE: Record<FormatId, number> = { '16:9': 2.9, '9:16': 3.5, '1:1': 3.1, '4:5': 3.2 };

/** Two colors tell apart: enough contrast, or clearly different hues (yellow on white). */
const distinct = (a: Color, b: Color) =>
  contrastRatio(a, b) >= 1.6 || Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.35;

/** Pen widths in u. */
const WEIGHT = { fine: 0.2, regular: 0.36, bold: 0.62 } as const;

type Feel = {
  /** When the last stroke is finished (s). */
  draw: number;
  /** Each stroke's curve: the pen eases on and off every contour. */
  pen: EaseName;
  /** Sequential order: how much of a stroke is left when the next one starts. */
  overlap: number;
  /** An island starts taking its ink this long before its last stroke is done… */
  lead: number;
  /** …but not before this (s), so the line drawing reads first. */
  floor: number;
  /** How long inking takes (s), and its curve. */
  ink: number;
  inkCurve: EaseName;
  /** Tagline: start and rise (s). */
  tagline: number;
  rise: number;
  /** Out: length (s). */
  out: number;
};

/** Calm draws slowly and inks softly; Punchy whips the strokes on and inks fast. */
const FEEL: Record<'calm' | 'balanced' | 'punchy', Feel> = {
  calm: {
    draw: 2.2,
    pen: 'drift',
    overlap: 0.45,
    lead: 0.36,
    floor: 1.45,
    ink: 1.0,
    inkCurve: 'drift',
    tagline: 2.35,
    rise: 0.8,
    out: 0.9,
  },
  balanced: {
    draw: 1.8,
    pen: 'swift',
    overlap: 0.4,
    lead: 0.3,
    floor: 1.2,
    ink: 0.8,
    inkCurve: 'drift',
    tagline: 2.0,
    rise: 0.6,
    out: 0.7,
  },
  punchy: {
    draw: 1.35,
    pen: 'snap',
    overlap: 0.3,
    lead: 0.24,
    floor: 0.9,
    ink: 0.55,
    inkCurve: 'swift',
    tagline: 1.45,
    rise: 0.5,
    out: 0.55,
  },
};

const feelOf = (energy: string): Feel => FEEL[energy as keyof typeof FEEL] ?? FEEL.balanced;

/** The entrance: until the last island is inked and the tagline has risen. */
function entrance(feel: Feel, tagline: boolean): number {
  const inked = Math.max(feel.floor, feel.draw - feel.lead) + feel.ink;
  return Math.max(inked, tagline ? feel.tagline + feel.rise : 0);
}

/** Shortest stroke (s): tiny contours still read as drawn, not popped in. */
const MIN_STROKE = 0.12;

/**
 * When each contour's stroke starts and how long it takes, finishing everything by `window`.
 * Durations are proportional to length (one pen speed for all), never below MIN_STROKE.
 * Sequential strokes follow each other in document order, each starting while the one before
 * still has `overlap` of its way to go; Together they all start at once (a hair apart).
 */
function schedule(
  lengths: readonly number[],
  together: boolean,
  window: number,
  overlap: number,
): { start: number[]; dur: number[] } {
  const n = lengths.length;
  const start = new Array<number>(n).fill(0);
  const dur = new Array<number>(n).fill(MIN_STROKE);
  if (n === 0) return { start, dur };
  if (together) {
    const spread = Math.min(0.02 * (n - 1), 0.2 * window);
    for (let i = 0; i < n; i++) start[i] = n > 1 ? (spread * i) / (n - 1) : 0;
    let speed = 0;
    for (let i = 0; i < n; i++) {
      speed = Math.max(speed, (lengths[i] ?? 0) / Math.max(0.01, window - (start[i] ?? 0)));
    }
    for (let i = 0; i < n; i++) {
      const room = window - (start[i] ?? 0);
      dur[i] = Math.min(room, Math.max(MIN_STROKE, (lengths[i] ?? 0) / Math.max(speed, 1e-9)));
    }
    return { start, dur };
  }
  const lay = (speed: number) => {
    let t = 0;
    for (let i = 0; i < n; i++) {
      start[i] = t;
      dur[i] = Math.max(MIN_STROKE, (lengths[i] ?? 0) / speed);
      t += (1 - overlap) * (dur[i] ?? 0);
    }
    return (start[n - 1] ?? 0) + (dur[n - 1] ?? 0);
  };
  if (lay(Number.POSITIVE_INFINITY) >= window) {
    // Too many contours for the window even at the shortest strokes: overlap them more.
    const last = start[n - 1] ?? 0;
    const k = last > 0 ? (window - MIN_STROKE) / last : 1;
    for (let i = 0; i < n; i++) start[i] = (start[i] ?? 0) * k;
    return { start, dur };
  }
  // One pen speed so the last stroke finishes exactly at the end of the window.
  let lo = 1e-6;
  let hi = 1e9;
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);
    if (lay(mid) > window) lo = mid;
    else hi = mid;
  }
  lay(hi);
  return { start, dur };
}

type Stroke = {
  path: PathData;
  /** Its island (ink group) — or -1 for the artwork's own strokes (line-art logos). */
  island: number;
  /** Pen color for this contour, and the width it keeps when it's the artwork's own stroke. */
  color: Color;
  width: number;
  cap: CanvasLineCap;
  join: CanvasLineJoin;
  opacity: number;
  start: number;
  dur: number;
};

type Island = {
  path: PathData;
  fill: Color;
  rule: CanvasFillRule;
  opacity: number;
  /** When its last stroke is finished (s). */
  drawn: number;
  inkAt: number;
};

export default defineTemplate({
  id: 'draw',
  version: 1,
  meta: {
    name: 'Draw',
    tagline: 'Stroke to fill',
    category: 'logo-branding',
    tags: ['logo', 'reveal', 'line', 'stroke', 'ink'],
    useCases: ['Design studios', 'Architects', 'Craft brands', 'Signatures'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 4, min: 3, max: 8 },
  alpha: 'optional',
  poster: 3,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'swiss' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'forest' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'mono-light' },
  ],
  pairings: ['grotesk', 'editorial', 'classic', 'technical', 'soft'],
  controls: {
    logo: c.image({
      label: 'Logo',
      accept: 'logo',
      default: { kind: 'placeholder', id: 'halden' },
      hint: 'SVG logos are drawn line by line; images are revealed by a sweep of light',
    }),
    tagline: c.text({
      label: 'Tagline',
      default: 'Studio for moving images',
      maxLength: 48,
      optional: true,
    }),
    stroke: c.choice({
      label: 'Stroke color',
      default: 'accent',
      options: [
        { value: 'accent', label: 'Accent' },
        { value: 'logo', label: 'Logo' },
        { value: 'muted', label: 'Muted' },
      ],
    }),
    weight: c.choice({
      label: 'Stroke width',
      default: 'regular',
      options: [
        { value: 'fine', label: 'Fine' },
        { value: 'regular', label: 'Regular' },
        { value: 'bold', label: 'Bold' },
      ],
    }),
    color: c.choice({
      label: 'Logo color',
      default: 'original',
      options: [
        { value: 'original', label: 'Original' },
        { value: 'mono', label: 'Mono' },
        { value: 'accent', label: 'Accent' },
      ],
    }),
    order: c.choice({
      label: 'Order',
      group: 'motion',
      default: 'sequential',
      options: [
        { value: 'sequential', label: 'Sequential' },
        { value: 'together', label: 'Together' },
      ],
    }),
    out: c.toggle({ label: 'Out', group: 'motion', default: false, hint: 'Adds an exit' }),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'editorial' },
    {
      id: 'sand',
      name: 'Sand',
      palette: { kind: 'library', id: 'sand' },
      pairing: 'classic',
      values: { stroke: 'logo', order: 'together' },
    },
  ],
  // The entrance is the drawing, the inking and the tagline, in real seconds per energy (the
  // engine multiplies sections by energy.time). Without Out the last frame is the finished
  // logo (an end card); with it, the exit ends a touch early.
  timing: ({ props, energy }) => {
    const feel = feelOf(energy.id);
    return {
      in: entrance(feel, props.tagline.trim() !== '') / energy.time,
      out: props.out ? feel.out / energy.time : 0,
      tail: props.out ? CLEAN_END : 0,
    };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { fg, muted, accent, accent2 } = palette.roles;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const logo = ctx.graphic('logo');
    const feel = feelOf(energy.id);

    // --- tagline ------------------------------------------------------------------------
    const taglineText = props.tagline.trim();
    const taglineW = area.w * 0.9;
    const tagline: TextBlock | null = taglineText
      ? text.layout(taglineText, {
          style: {
            font: pairing.text.font,
            size: TAGLINE_SIZE[frame.format] * u,
            weight: 500,
            width: pairing.text.width,
            tracking: 0.02,
            features: pairing.text.features,
          },
          maxWidth: taglineW,
          maxLines: 2,
          lineHeight: 1.3,
          align: 'center',
          fit: { minSize: 2.4 * u },
        })
      : null;

    // --- layout: the logo centred, the tagline hanging below ------------------------------
    const aspect = logo && logo.ink.w > 0 && logo.ink.h > 0 ? logo.ink.w / logo.ink.h : 1;
    let logoH = (LOGO_K[frame.format] * u) / Math.sqrt(aspect);
    let logoW = logoH * aspect;
    const maxW = area.w * LOGO_MAX_W[frame.format];
    if (logoW > maxW) {
      logoW = maxW;
      logoH = maxW / aspect;
    }
    const gap = 5.5 * u;
    const blockH = (logo ? logoH : 0) + (tagline ? (logo ? gap : 0) + tagline.height : 0);
    // Optically centred: a touch above the geometric centre.
    const top = area.y + (area.h - blockH) * 0.47;
    const logoRect: Rect = { x: frame.cx - logoW / 2, y: top, w: logoW, h: logoH };
    const taglineX = frame.cx - taglineW / 2;
    const taglineY = top + (logo ? logoH + gap : 0);
    const taglineBounds: Rect | null = tagline
      ? {
          x: taglineX + tagline.ink.x,
          y: taglineY + tagline.ink.y,
          w: tagline.ink.w,
          h: tagline.ink.h,
        }
      : null;

    // --- colors ---------------------------------------------------------------------------
    const tint = props.color === 'mono' ? fg : props.color === 'accent' ? accent : null;
    // The accent pen, unless it's the logo's own color (then the second accent, or muted).
    const accentPen =
      [accent, accent2, muted].find((color) => distinct(color, tint ?? fg)) ?? accent;
    const penFor = (own: Color) =>
      props.stroke === 'logo' ? own : props.stroke === 'muted' ? muted : accentPen;

    // --- vector artwork: contours, islands, pen schedule ----------------------------------
    const strokes: Stroke[] = [];
    const inks: Island[] = [];
    let k = 1;
    let ox = 0;
    let oy = 0;
    const vector = logo?.kind === 'vector' ? logo : null;
    if (vector && vector.ink.w > 0 && vector.ink.h > 0) {
      // The artwork's own coordinates → the logo box (fitted by its ink, as g.graphic does).
      k = Math.min(logoW / vector.ink.w, logoH / vector.ink.h);
      ox = logoRect.x + (logoW - vector.ink.w * k) / 2 - vector.ink.x * k;
      oy = logoRect.y + (logoH - vector.ink.h * k) / 2 - vector.ink.y * k;
      // At least a design unit wide (a hairline at 1080p), in the artwork's own units.
      const penWidth = Math.max(WEIGHT[props.weight] * u, 1) / k;
      const lengths: number[] = [];
      for (const shape of vector.shapes) {
        const fill = shape.fill ? (tint ?? (shape.fill === 'current' ? fg : shape.fill)) : null;
        const own = shape.stroke
          ? (tint ?? (shape.stroke === 'current' ? fg : shape.stroke))
          : null;
        const contours = splitContours(shape.path);
        if (contours.length === 0) continue;
        const polylines = contours.map((contour) => flatten(contour));
        const roots = fill ? islands(polylines) : contours.map((_, i) => i);
        const firstIsland = inks.length;
        const islandOf = new Map<number, number>();
        if (fill) {
          for (const root of roots) {
            if (islandOf.has(root)) continue;
            islandOf.set(root, inks.length);
            const members = contours.filter((_, i) => roots[i] === root);
            inks.push({
              path: members.flat() as PathCommand[],
              fill,
              rule: shape.fillRule,
              opacity: shape.opacity * shape.fillOpacity,
              drawn: 0,
              inkAt: 0,
            });
          }
        }
        contours.forEach((contour, i) => {
          const length = pathLength(contour);
          if (!(length > 0)) return;
          if (fill) {
            strokes.push({
              path: contour,
              island: islandOf.get(roots[i] ?? i) ?? firstIsland,
              color: penFor(fill),
              width: penWidth,
              cap: 'round',
              join: 'round',
              opacity: 1,
              start: 0,
              dur: 0,
            });
            lengths.push(length);
          }
          if (own && shape.strokeWidth > 0) {
            // The artwork's own line: drawn on at its own width, and it stays.
            strokes.push({
              path: contour,
              island: -1,
              color: own,
              width: shape.strokeWidth,
              cap: shape.lineCap,
              join: shape.lineJoin,
              opacity: shape.opacity * shape.strokeOpacity,
              start: 0,
              dur: 0,
            });
            lengths.push(length);
          }
        });
      }
      const plan = schedule(lengths, props.order === 'together', feel.draw, feel.overlap);
      strokes.forEach((stroke, i) => {
        stroke.start = plan.start[i] ?? 0;
        stroke.dur = plan.dur[i] ?? MIN_STROKE;
        const island = inks[stroke.island];
        if (island) island.drawn = Math.max(island.drawn, stroke.start + stroke.dur);
      });
      for (const island of inks) island.inkAt = Math.max(feel.floor, island.drawn - feel.lead);
    }
    const drawsVector = strokes.length > 0;

    // --- motion ---------------------------------------------------------------------------
    const penCurve = ease[feel.pen];
    const inkCurve = ease[feel.inkCurve];
    const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
    const outStart = timeline.sections.out.start;
    const outLength = props.out ? feel.out : 0;
    const hold = timeline.sections.hold;
    /** Exit progress of a window within the out section (0 before it). */
    const exiting = (t: number, from: number, to: number) =>
      props.out
        ? ease.exit(clamp01((t - outStart - from * outLength) / ((to - from) * outLength)))
        : 0;

    // Raster fallback: a reveal line leaning 12° ("/") sweeps across the logo box.
    const lean = Math.tan((12 * Math.PI) / 180);
    const revealTop = logoRect.y - 4 * u;
    const revealBottom = logoRect.y + logoH + 4 * u;
    const revealMid = (revealTop + revealBottom) / 2;
    const slant = lean * (revealBottom - revealTop);
    const sweepFrom = logoRect.x - 3 * u - slant / 2;
    const sweepTo = logoRect.x + logoW + 3 * u + slant / 2;
    const sweepStart = 0.1;
    const lineWidth = Math.max(WEIGHT[props.weight] * u, 0.12 * u);
    const glowColor = penFor(tint ?? fg);
    /** What the line has uncovered: everything left of it, `x` being where it crosses the middle. */
    const revealed = (x: number): PathData => [
      ['M', logoRect.x - 8 * u, revealTop],
      ['L', x + slant / 2, revealTop],
      ['L', x - slant / 2, revealBottom],
      ['L', logoRect.x - 8 * u, revealBottom],
      ['Z'],
    ];

    const drawRaster = (g: Draw, t: number) => {
      if (!logo) return;
      const p = penCurve(clamp01((t - sweepStart) / (feel.draw - sweepStart)));
      const inked = inkCurve(clamp01((t - Math.max(feel.floor, feel.draw - feel.lead)) / feel.ink));
      const gone = exiting(t, 0, 1);
      if (p <= 0) return;
      const x = sweepFrom + (sweepTo - sweepFrom) * p;
      g.clip({ path: revealed(x) }, (g) => {
        // First in the pen's color, then in its own.
        if (inked < 1) g.graphic(logo, logoRect, { tint: glowColor, opacity: 1 - gone });
        if (inked > 0) {
          g.graphic(logo, logoRect, { tint, current: fg, opacity: inked * (1 - gone) });
        }
      });
      // The glowing line leading the reveal: a crisp core in a soft halo.
      const glow = Math.min(1, p / 0.08, (1 - p) / 0.12);
      if (glow > 0) {
        const y0 = revealTop + u;
        const y1 = revealBottom - u;
        const halo: Gradient = {
          kind: 'linear',
          x0: x - 3 * u,
          y0: 0,
          x1: x + 3 * u,
          y1: 0,
          stops: [
            { offset: 0, color: withAlpha(glowColor, 0) },
            { offset: 0.5, color: withAlpha(glowColor, 0.38 * glow) },
            { offset: 1, color: withAlpha(glowColor, 0) },
          ],
        };
        g.group({ skewX: -12, originX: x, originY: revealMid }, (g) => {
          g.rect({ x: x - 3 * u, y: y0, w: 6 * u, h: y1 - y0 }, { fill: halo });
          g.line(x, y0, x, y1, { color: glowColor, width: lineWidth, cap: 'round' });
        });
      }
    };

    // Long holds get one quiet pass of the pen: a short trace runs once around every outline,
    // gone well before the end card.
    const passLength = 1.4;
    const passStart = hold.end - passLength - 0.4;
    const pass = hold.end - hold.start >= 2.6;

    const drawVector = (g: Draw, t: number) => {
      const gone = exiting(t, 0, 0.45);
      const back = exiting(t, 0, 0.3);
      const erase = exiting(t, 0.2, 1);
      const q = pass ? (t - passStart) / passLength : -1;
      g.group({ x: ox, y: oy, scale: k }, (g) => {
        for (const island of inks) {
          const f = inkCurve(clamp01((t - island.inkAt) / feel.ink)) * (1 - gone);
          if (f > 0) {
            g.path(island.path, {
              fill: island.fill,
              fillRule: island.rule,
              opacity: f * island.opacity,
            });
          }
        }
        for (const stroke of strokes) {
          const p = penCurve(clamp01((t - stroke.start) / stroke.dur));
          if (p <= 0 || erase >= 1) continue;
          const island = inks[stroke.island];
          // The pen line thins away as its island takes the ink — and comes back to leave.
          const thin = island ? inkCurve(clamp01((t - island.inkAt) / feel.ink)) : 0;
          const width = island ? stroke.width * Math.max(1 - thin, back) : stroke.width;
          if (width <= 0) continue;
          g.path(stroke.path, {
            stroke: {
              color: stroke.color,
              width,
              cap: stroke.cap,
              join: stroke.join,
              trim: [erase, p],
            },
            opacity: stroke.opacity,
          });
        }
        if (q > 0 && q < 1) {
          const head = 1.16 * ease.drift(q);
          const alpha = 0.85 * Math.sin(Math.PI * q);
          for (const stroke of strokes) {
            if (stroke.island < 0) continue;
            g.path(stroke.path, {
              stroke: {
                color: stroke.color,
                width: stroke.width * 0.75,
                cap: 'round',
                join: 'round',
                trim: [Math.max(0, head - 0.16), Math.min(1, head)],
              },
              opacity: alpha,
            });
          }
        }
      });
    };

    // Tagline: each line rises into place inside its own mask.
    const lineGap = 0.08 * energy.stagger;
    const riseBy = tagline ? (tagline.lines[0]?.mask.h ?? tagline.size) * 1.05 : 0;

    // The hold breathes: the lockup grows by 1.2%, settling in and out with `drift`.
    const breathe = (t: number) =>
      1 + 0.012 * ease.drift(clamp01((t - hold.start) / Math.max(0.5, hold.end - hold.start)));

    return {
      render: ({ t, g }) => {
        g.fill(palette.roles.bg, { background: true });
        const scale = breathe(t);

        if (logo) {
          g.movable('logo', logoRect, (g) => {
            g.group({ scale, originX: frame.cx, originY: logoRect.y + logoH / 2 }, (g) => {
              if (drawsVector) drawVector(g, t);
              else drawRaster(g, t);
            });
            g.editable('logo', logoRect);
          });
        }

        if (tagline && taglineBounds) {
          const sink = exiting(t, 0, 0.5);
          g.movable('tagline', taglineBounds, (g) => {
            g.group({ scale, originX: frame.cx, originY: taglineY }, (g) => {
              tagline.lines.forEach((line, i) => {
                const p = ease.glide(clamp01((t - feel.tagline - i * lineGap) / feel.rise));
                if (p <= 0 || sink >= 1) return;
                const dy = (1 - p) * riseBy + sink * riseBy;
                const mask: Rect = {
                  x: taglineX + line.mask.x,
                  y: taglineY + line.mask.y,
                  w: line.mask.w,
                  h: line.mask.h,
                };
                g.clip(mask, (g) => g.text(line, { fill: fg, x: taglineX, y: taglineY + dy }));
              });
            });
            g.editable('tagline', taglineBounds);
          });
        }
      },
    };
  },
});
