/**
 * Resolve — pixel mosaic (docs/templates/09-logo-branding.md §9.5).
 *
 * The expensive detail: every block is the true area average of the finished logo over its
 * square (premultiplied sRGB, the way the canvas composites), computed once in `build` from the
 * logo drawn into a small OffscreenCanvas — so the mosaic is the logo seen through coarse
 * pixels, never nearest-neighbour noise. Every change lands on a 24 fps cadence (and the
 * template's shutter is closed, so motion blur never blends two steps), and the final step is
 * the crisp vector logo itself: pixel-perfect, no residue.
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
  type GroupOptions,
  type Rect,
  rgb,
  stepped,
  type TextBlock,
  withAlpha,
} from '@/engine';
import { type Batch, batch, type Level, logoDrawer, mosaicLevels } from './mosaic';

/** Logo size: height = K / √aspect (in u), so marks and wide lockups carry similar weight. */
const LOGO_K: Record<FormatId, number> = { '16:9': 26, '9:16': 30, '1:1': 28, '4:5': 29 };
/** Widest the logo may get, as a share of the layout area's width. */
const LOGO_MAX_W: Record<FormatId, number> = { '16:9': 0.5, '9:16': 0.8, '1:1': 0.7, '4:5': 0.72 };
const TAGLINE_SIZE: Record<FormatId, number> = { '16:9': 3.2, '9:16': 3.8, '1:1': 3.4, '4:5': 3.5 };

/** The mechanical cadence of every step. */
const FPS = 24;
/** Balanced seconds into `in`: the coarsest blocks flicker in, then the resolution steps. */
const FLICKER_START = 0.04;
const FLICKER_END = 0.6;
/** The steps share this window (0.12–0.2 s each), slowing a little as they refine. */
const STEPS_WINDOW = 0.8;
/** After the final step: the scanline, then the tagline types in. */
const SCAN_AFTER = 0.1;
const SCAN = 0.4;
const TYPE_AFTER = 0.15;
/** Seconds per character (0.04), typing at most this long. */
const CHAR = 0.04;
const TYPING_MAX = 0.75;
/** The out: backspace, de-resolve level by level, blocks flicker out. */
const OUT = 0.65;
const OUT_STEP = 0.055;

/** Mosaic block counts over the logo's area: coarsest and finest. */
const COARSE_BLOCKS = 20;
/** The gallery's hero frame: resolved and typed, before the hold's faint scans. */
const POSTER = 2.7;
const FINE_BLOCKS = 1600;

const ENERGY = {
  calm: { split: 0.55, tears: 0, flicker: 'soft', blink: 0.6 },
  balanced: { split: 0.9, tears: 1, flicker: 'blink', blink: 0.5 },
  punchy: { split: 1.3, tears: 2, flicker: 'strobe', blink: 0.36 },
} as const;
type Feel = (typeof ENERGY)[keyof typeof ENERGY];

/**
 * How a block flickers in, per 24 fps step from its first appearance: 0 = off, 1 = its true
 * average, 2 = flashing at full strength (a fresh pixel overexposes before it settles).
 */
const FLICKERS: Record<Feel['flicker'], readonly (readonly number[])[]> = {
  soft: [
    [0.3, 0.65, 1],
    [0.5, 1],
    [0.25, 0.5, 0.8, 1],
  ],
  blink: [
    [2, 0, 1],
    [2, 0.5, 0, 1],
    [0.55, 2, 0, 1.5, 1],
  ],
  strobe: [
    [2, 0, 2, 0, 1],
    [2, 0, 1, 0, 1.5, 1],
    [2, 0.2, 0, 2, 1],
  ],
};
/** Blocks flickering out (the out): from their last full step. */
const FLICKER_OUT: readonly (readonly number[])[] = [
  [0, 1, 0],
  [0.5, 0],
  [1, 0, 0.6, 0],
];

/** Steps (Balanced seconds into `in`): when each level after the coarsest shows, and the end. */
function schedule(steps: number): { levels: number[]; final: number } {
  const mean = Math.min(0.2, Math.max(0.12, STEPS_WINDOW / steps));
  const levels: number[] = [];
  let t = FLICKER_END;
  for (let k = 0; k < steps; k++) {
    levels.push(t);
    t += mean * (1.15 - (0.3 * k) / Math.max(1, steps - 1));
  }
  return { levels, final: t };
}

const typingGap = (chars: number) => (chars > 1 ? Math.min(CHAR, TYPING_MAX / (chars - 1)) : 0);

export default defineTemplate({
  id: 'resolve',
  version: 1,
  meta: {
    name: 'Resolve',
    tagline: 'Pixel mosaic',
    category: 'logo-branding',
    tags: ['logo', 'reveal', 'pixel', 'retro', 'tech'],
    useCases: ['Gaming intros', 'Tech launches', 'Retro brands', 'AI and data products'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 4, min: 3, max: 8 },
  alpha: 'optional',
  poster: POSTER,
  // Steps are mechanical: a closed shutter keeps every frame on exactly one step.
  shutter: 0,
  palettes: [
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'mono-light' },
    { kind: 'library', id: 'mono-dark' },
    { kind: 'library', id: 'amber' },
    { kind: 'library', id: 'acid' },
  ],
  pairings: ['mono', 'technical', 'grotesk', 'sport'],
  controls: {
    logo: c.image({ label: 'Logo', accept: 'logo', default: { kind: 'placeholder', id: 'nova' } }),
    tagline: c.text({
      label: 'Tagline',
      default: 'Now in beta',
      maxLength: 32,
      optional: true,
    }),
    pixel: c.choice({
      label: 'Pixel style',
      default: 'square',
      options: [
        { value: 'square', label: 'Square' },
        { value: 'dot', label: 'Dot' },
      ],
    }),
    glitch: c.toggle({ label: 'Glitch', default: true, hint: 'RGB split and tears' }),
    color: c.choice({
      label: 'Logo color',
      default: 'original',
      options: [
        { value: 'original', label: 'Original' },
        { value: 'mono', label: 'Mono' },
        { value: 'accent', label: 'Accent' },
      ],
    }),
    steps: c.number({ label: 'Steps', group: 'motion', default: 4, min: 3, max: 6, step: 1 }),
    out: c.toggle({ label: 'Out', group: 'motion', default: false, hint: 'Adds an exit' }),
  },
  looks: [
    {
      id: 'graphite',
      name: 'Graphite',
      palette: { kind: 'library', id: 'graphite' },
      pairing: 'mono',
    },
    {
      id: 'ink',
      name: 'Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'mono',
      values: { pixel: 'dot' },
    },
    {
      id: 'mono-light',
      name: 'Mono Light',
      palette: { kind: 'library', id: 'mono-light' },
      pairing: 'mono',
    },
  ],
  // Without Out, the last frame is the finished logo (an end card); with it, the exit ends a
  // touch early so the last frame is clean.
  timing: ({ props }) => {
    const { final } = schedule(props.steps);
    const chars = [...props.tagline.trim()].length;
    const entrance =
      chars > 0
        ? final + TYPE_AFTER + typingGap(chars) * (chars - 1) + 0.12
        : final + SCAN_AFTER + SCAN + 0.1;
    return { in: entrance, out: props.out ? OUT : 0, tail: props.out ? CLEAN_END : 0 };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, accent } = palette.roles;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const logo = ctx.graphic('logo');
    const feel: Feel = ENERGY[energy.id];
    /** Absolute time of a Balanced offset into `in`/`out`, on the 24 fps grid. */
    const grid = (time: number) => Math.ceil(time * FPS - 1e-6) / FPS;
    const at = (offset: number) => grid(timeline.at('in', offset));
    const atOut = (offset: number) => grid(timeline.at('out', offset));

    // --- tagline ------------------------------------------------------------------------
    const taglineText = props.tagline.trim();
    const taglineW = area.w * 0.9;
    const style = {
      font: pairing.text.font,
      size: TAGLINE_SIZE[frame.format] * u,
      weight: 500,
      width: pairing.text.width,
      tracking: 0.02,
      features: pairing.text.features,
    };
    const tagline: TextBlock | null = taglineText
      ? text.layout(taglineText, {
          style,
          maxWidth: taglineW,
          maxLines: 2,
          lineHeight: 1.3,
          align: 'center',
          fit: { minSize: 2.4 * u },
        })
      : null;

    // --- layout: the logo centered, the tagline hanging below ----------------------------
    const aspect = logo && logo.ink.w > 0 && logo.ink.h > 0 ? logo.ink.w / logo.ink.h : 1;
    let logoH = (LOGO_K[frame.format] * u) / Math.sqrt(aspect);
    let logoW = logoH * aspect;
    const maxW = area.w * LOGO_MAX_W[frame.format];
    if (logoW > maxW) {
      logoW = maxW;
      logoH = maxW / aspect;
    }
    const gap = 5.5 * u;
    const blockH = logoH + (tagline ? gap + tagline.height : 0);
    // Optically centered: a touch above the geometric center.
    const top = area.y + (area.h - blockH) * 0.48;
    const logoRect: Rect = { x: frame.cx - logoW / 2, y: top, w: logoW, h: logoH };
    const taglineX = frame.cx - taglineW / 2;
    const taglineY = top + logoH + gap;
    const taglineBounds: Rect | null = tagline
      ? {
          x: taglineX + tagline.ink.x,
          y: taglineY + tagline.ink.y,
          w: tagline.ink.w,
          h: tagline.ink.h,
        }
      : null;

    const tint = props.color === 'mono' ? fg : props.color === 'accent' ? accent : null;
    const drawLogo = logoDrawer(logo, logoRect, { tint, current: fg });

    // --- the mosaic: levels from ~20 blocks to ~1600 over the logo's area -----------------
    const steps = Math.round(props.steps);
    const plan = schedule(steps);
    const areaLogo = logoW * logoH;
    const coarse = Math.sqrt(areaLogo / COARSE_BLOCKS);
    const fine = Math.max(0.72 * u, Math.sqrt(areaLogo / FINE_BLOCKS), coarse / 12);
    const sizes = Array.from(
      { length: steps + 1 },
      (_, k) => coarse * (fine / coarse) ** (k / steps),
    );
    const levels: Level[] | null = logo
      ? mosaicLevels(logo, logoRect, sizes, { tint, current: fg })
      : null;
    const pixelStyle = props.pixel === 'dot' ? 'dot' : 'square';
    const plain = levels?.map((level) => batch(level, pixelStyle)) ?? [];

    // The coarsest level flickers in: every block from a seeded step, with a seeded pattern.
    const flickerFrom = at(FLICKER_START);
    const flickerSteps = Math.max(1, Math.round((at(FLICKER_END) - flickerFrom) * FPS));
    const coarsest = levels?.[0];
    const flickerIn: Batch[][] = [];
    if (coarsest) {
      const rng = ctx.rng('flicker');
      const count = coarsest.blocks.length;
      const patterns = FLICKERS[feel.flicker];
      const order = rng.shuffle(Array.from({ length: count }, (_, i) => i));
      const first = new Int32Array(count);
      const pattern = new Int32Array(count);
      const room = Math.max(1, flickerSteps - 5);
      order.forEach((block, rank) => {
        first[block] = Math.min(room, Math.floor(((rank + rng.range(0, 0.9)) * room) / count));
        pattern[block] = Math.floor(rng.next() * patterns.length);
      });
      for (let s = 0; s < flickerSteps; s++) {
        flickerIn.push(
          batch(coarsest, pixelStyle, {
            alpha: (i) => {
              const r = s - (first[i] ?? 0);
              if (r < 0) return 0;
              const p = patterns[pattern[i] ?? 0] ?? [1];
              return p[Math.min(r, p.length - 1)] ?? 1;
            },
          }),
        );
      }
    }

    // Glitch tears: on its first frame, a new level shows a row or two shifted by a block.
    const tearRng = ctx.rng('tears');
    const torn: (Batch[] | null)[] = (levels ?? []).map((level, k) => {
      if (k === 0 || !props.glitch || feel.tears === 0 || level.rows < 2) return null;
      const rows = new Map<number, number>();
      for (let j = 0; j < feel.tears; j++) {
        const row = Math.floor(tearRng.next() * level.rows);
        rows.set(row, tearRng.sign() * level.size * (tearRng.chance(0.3) ? 2 : 1));
      }
      return batch(level, pixelStyle, { shift: (i) => rows.get(level.blocks[i]?.row ?? -1) ?? 0 });
    });

    // Level timeline (absolute, on the grid).
    const levelAt = plan.levels.map((offset) => at(offset));
    const finalAt = at(plan.final);

    // --- the final step: a 3-frame RGB split, then the crisp logo --------------------------
    const split = feel.split * u;
    // One color throughout (tinted, or all `currentColor`): a true channel split is possible.
    let solid: Color | null = tint;
    if (!solid && logo?.kind === 'vector') {
      const colors = new Set<string>();
      let only: Color | null = null;
      for (const shape of logo.shapes) {
        for (const paint of [shape.fill, shape.stroke]) {
          if (!paint) continue;
          const color = paint === 'current' ? fg : paint;
          colors.add(`${color.r},${color.g},${color.b}`);
          only = color;
        }
      }
      if (colors.size === 1) solid = only;
    }
    const light = !palette.dark;
    const channels: [Color, Color, Color] | null = solid
      ? light
        ? [rgb(solid.r, 1, 1), rgb(1, solid.g, 1), rgb(1, 1, solid.b)]
        : [rgb(solid.r, 0, 0), rgb(0, solid.g, 0), rgb(0, 0, solid.b)]
      : null;
    const splitArea: Rect = {
      x: logoRect.x - 3 * split - u,
      y: logoRect.y - u,
      w: logoW + 6 * split + 2 * u,
      h: logoH + 2 * u,
    };
    const tinted = (color: Color) => logoDrawer(logo, logoRect, { tint: color, current: fg });
    const channelDraws = channels?.map(tinted) ?? [];
    const ghostDraws = [tinted(rgb(1, 0.1, 0.25)), tinted(rgb(0.1, 0.6, 1))];
    const drawSplit = (g: Draw, d: number) => {
      const [r, gr, b] = channelDraws;
      if (r && gr && b) {
        if (light) {
          // Dark ink on a light ground: each channel's ink multiplies away its own light.
          g.group({ x: -d, blend: 'multiply' }, r);
          g.group({ blend: 'multiply' }, gr);
          g.group({ x: d, blend: 'multiply' }, b);
        } else {
          // Light on dark: the channels add up to the logo where they overlap.
          g.layer({ bounds: splitArea }, (g) => {
            g.group({ x: -d, blend: 'lighter' }, r);
            g.group({ blend: 'lighter' }, gr);
            g.group({ x: d, blend: 'lighter' }, b);
          });
        }
        return;
      }
      // Many colors: colored ghosts either side of the logo.
      const blend = light ? 'multiply' : 'screen';
      g.group({ x: -d, blend, opacity: 0.8 }, ghostDraws[0] as (g: Draw) => void);
      g.group({ x: d, blend, opacity: 0.8 }, ghostDraws[1] as (g: Draw) => void);
      drawLogo(g);
    };
    const SPLIT = [1, 0.55, 0.25];

    // --- scanline: sweeps down the logo once after the final step --------------------------
    const scanFrom = timeline.at('in', plan.final + SCAN_AFTER);
    const scanDur = SCAN * energy.time;
    const scanTop = logoRect.y - 3 * u;
    const scanBottom = logoRect.y + logoH + 3 * u;
    const scanX = logoRect.x - 5 * u;
    const scanW = logoW + 10 * u;
    const trail = 6 * u;
    // Phosphor glows on dark grounds; on light ones the trail is only a breath of ink.
    const trailPeak = palette.dark ? 0.2 : 0.06;
    const lineFill: Gradient = {
      kind: 'linear',
      x0: scanX,
      y0: 0,
      x1: scanX + scanW,
      y1: 0,
      stops: [
        { offset: 0, color: withAlpha(accent, 0) },
        { offset: 0.2, color: withAlpha(accent, 0.9) },
        { offset: 0.8, color: withAlpha(accent, 0.9) },
        { offset: 1, color: withAlpha(accent, 0) },
      ],
    };
    // The hold refreshes: fainter passes every 2.4 s, after the gallery's poster frame and
    // done before the end card.
    const hold = timeline.sections.hold;
    const refresh: number[] = [];
    for (
      let when = Math.max(hold.start + 0.9, POSTER + 0.15);
      when + scanDur <= hold.end - 0.5;
      when += 2.4
    ) {
      refresh.push(when);
    }
    // Drawn at y = 0 and moved into place: the gradients are made once.
    const glow: Gradient = {
      kind: 'linear',
      x0: 0,
      y0: -trail,
      x1: 0,
      y1: 0,
      stops: [
        { offset: 0, color: withAlpha(accent, 0) },
        { offset: 1, color: withAlpha(accent, trailPeak) },
      ],
    };
    const trailRect: Rect = { x: logoRect.x - u, y: -trail, w: logoW + 2 * u, h: trail };
    const lineRect: Rect = { x: scanX, y: -0.12 * u, w: scanW, h: 0.24 * u };
    const scanline = (g: Draw) => {
      g.rect(trailRect, { fill: glow });
      g.rect(lineRect, { fill: lineFill });
    };
    const scanAt: GroupOptions = { y: 0, opacity: 1 };
    const drawScan = (g: Draw, p: number, strength: number) => {
      scanAt.y = scanTop + (scanBottom - scanTop) * p;
      scanAt.opacity = Math.min(1, p / 0.12, (1 - p) / 0.12) * strength;
      if (scanAt.opacity > 0) g.group(scanAt, scanline);
    };

    // --- tagline: typed on the grid, with a block cursor ----------------------------------
    const glyphs = tagline?.glyphCount ?? 0;
    const charGap = typingGap(glyphs);
    const typeFrom = plan.final + TYPE_AFTER;
    const typedAt = Array.from({ length: glyphs }, (_, i) => at(typeFrom + i * charGap));
    const typeEnd = typedAt[glyphs - 1] ?? at(typeFrom);
    const deleteGap = Math.min(0.02, 0.3 / Math.max(1, glyphs));
    const deletedAt = Array.from({ length: glyphs }, (_, i) => atOut((glyphs - 1 - i) * deleteGap));
    const cursorFrom = at(plan.final + 0.04);
    // Blinks once typing is done, through the hold, and is gone before the end card.
    const blink = feel.blink;
    const cursorOff = grid(
      Math.min(Math.max(typeEnd + 2 * blink, hold.end - 0.6), hold.end - 0.12),
    );
    const cursorBack = atOut(glyphs * deleteGap + 0.04);
    const outStart = timeline.sections.out.start;
    // The advance of one character: the cursor's width.
    const cell = tagline ? text.line('0', { ...style, size: tagline.size }).width : 0;
    const cap = tagline?.capHeight ?? 0;
    // Glyph positions for the cursor: after glyph i (or before the first).
    const after: { x: number; y: number }[] = [];
    let before = { x: 0, y: 0 };
    if (tagline) {
      const first = tagline.lines[0];
      before = {
        x: taglineX + (first?.x ?? 0) + (first?.glyphs[0]?.x ?? 0),
        y: taglineY + (first?.baseline ?? 0),
      };
      for (const line of tagline.lines) {
        for (const glyph of line.glyphs) {
          after[glyph.index] = {
            x: taglineX + line.x + glyph.x + glyph.advance,
            y: taglineY + line.baseline,
          };
        }
      }
    }
    let typed = 0;
    const shownGlyph: GlyphTransform = {};
    const typedGlyph = (glyph: Glyph): GlyphTransform | null =>
      glyph.index < typed ? shownGlyph : null;

    // --- the out: de-resolve level by level, then the blocks flicker out -------------------
    const deresFrom = 0.05;
    const deresAt = atOut(deresFrom);
    const outLevels = (levels ?? []).map((_, k) => atOut(deresFrom + (steps - k) * OUT_STEP));
    const flickerOutFrom = atOut(deresFrom + (steps + 1) * OUT_STEP);
    const flickerOutSteps = Math.max(1, Math.round((atOut(OUT - 0.02) - flickerOutFrom) * FPS));
    const flickerOut: Batch[][] = [];
    if (coarsest && props.out) {
      const rng = ctx.rng('flicker-out');
      const count = coarsest.blocks.length;
      const last = new Int32Array(count);
      const pattern = new Int32Array(count);
      const room = Math.max(1, flickerOutSteps - 4);
      rng.shuffle(Array.from({ length: count }, (_, i) => i)).forEach((block, rank) => {
        last[block] = Math.floor((rank * room) / Math.max(1, count));
        pattern[block] = Math.floor(rng.next() * FLICKER_OUT.length);
      });
      for (let s = 0; s < flickerOutSteps; s++) {
        flickerOut.push(
          batch(coarsest, pixelStyle, {
            alpha: (i) => {
              const r = s - (last[i] ?? 0);
              if (r < 0) return 1;
              const p = FLICKER_OUT[pattern[i] ?? 0] ?? [0];
              return p[Math.min(r, p.length - 1)] ?? 0;
            },
          }),
        );
      }
    }

    const drawBatches = (g: Draw, batches: readonly Batch[] | undefined) => {
      if (!batches) return;
      for (const b of batches) g.path(b.path, { fill: b.fill });
    };
    /** Fallback without a mosaic (no OffscreenCanvas): the logo in stepped opacity. */
    const fallback = (g: Draw, level: number) => {
      g.group({ opacity: (level + 1) / (steps + 2) }, drawLogo);
    };

    return {
      render: ({ t, g }) => {
        g.fill(bg, { background: true });
        if (!logo && !tagline) return;
        const now = stepped(t, FPS);

        g.movable('logo', logoRect, (g) => {
          if (logo) {
            if (props.out && now >= deresAt) {
              // The out: levels from fine to coarse, then the coarsest flickers out.
              if (now < flickerOutFrom) {
                let k = steps;
                while (k > 0 && now >= (outLevels[k - 1] ?? Number.POSITIVE_INFINITY)) k--;
                if (levels) drawBatches(g, plain[k]);
                else fallback(g, k);
              } else {
                const s = Math.round((now - flickerOutFrom) * FPS);
                if (levels) drawBatches(g, flickerOut[s]);
              }
            } else if (now >= finalAt) {
              const f = Math.round((now - finalAt) * FPS);
              const d = props.glitch ? (SPLIT[f] ?? 0) * split : 0;
              if (d > 0) drawSplit(g, d);
              else drawLogo(g);
            } else if (now >= (levelAt[0] ?? finalAt)) {
              let k = 0;
              while (k < levelAt.length && now >= (levelAt[k] ?? 0)) k++;
              const first = now < (levelAt[k - 1] ?? 0) + 1 / FPS - 1e-6;
              if (!levels) fallback(g, k);
              else drawBatches(g, first ? (torn[k] ?? plain[k]) : plain[k]);
            } else if (now >= flickerFrom) {
              const s = Math.min(flickerSteps - 1, Math.round((now - flickerFrom) * FPS));
              if (levels) drawBatches(g, flickerIn[s]);
              else fallback(g, 0);
            }

            // The scanline: once after the final step, and fainter late in a long hold.
            const p = (t - scanFrom) / scanDur;
            if (p > 0 && p < 1) drawScan(g, p, 1);
            for (const when of refresh) {
              const q = (t - when) / scanDur;
              if (q > 0 && q < 1) drawScan(g, q, 0.4);
            }
          }
          g.editable('logo', logoRect);
        });

        if (!tagline || !taglineBounds) return;
        // Typed characters: all typed ones, minus those the out has deleted.
        typed = 0;
        while (typed < glyphs && now >= (typedAt[typed] ?? 0)) typed++;
        let deleted = 0;
        if (props.out)
          while (deleted < glyphs && now >= (deletedAt[glyphs - 1 - deleted] ?? 0)) deleted++;
        typed = Math.max(0, typed - deleted);

        let cursor = false;
        if (now >= cursorFrom) {
          if (props.out && now >= outStart) cursor = now < cursorBack;
          else if (now <= typeEnd) cursor = true;
          else if (now < cursorOff) cursor = Math.floor((now - typeEnd) / blink + 1e-6) % 2 === 0;
        }
        if (typed === 0 && !cursor) return;
        g.movable('tagline', taglineBounds, (g) => {
          if (typed > 0) {
            g.text(tagline, { fill: fg, x: taglineX, y: taglineY, glyph: typedGlyph });
          }
          if (cursor) {
            const pos = typed > 0 ? (after[typed - 1] ?? before) : before;
            g.rect(
              { x: pos.x + cell * 0.12, y: pos.y - cap * 1.08, w: cell * 0.78, h: cap * 1.3 },
              { fill: accent },
            );
          }
          g.editable('tagline', taglineBounds);
        });
      },
    };
  },
});
