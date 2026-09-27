/**
 * Episode — series opener (docs/templates/07-openers.md §7.5).
 *
 * The expensive detail: one diagonal for everything. The three blocks share one slanted edge
 * and one sweep direction (in, and again out), the band and the cover panel drift along it in
 * the hold, and every line of type rises along the same angle — the whole opener reads as one
 * system. The outline episode number rolls up from zero like an odometer and settles with a
 * spring's overshoot (the motion blur of the rolling digits comes from temporal sampling).
 */

import {
  adjustLightness,
  type BlendMode,
  type Color,
  c,
  contrastRatio,
  type Draw,
  defineTemplate,
  type FormatId,
  type Rect,
  rgb,
  type SpringName,
  springProgress,
  staticWheels,
  type TextBlock,
  type TextLine,
  unionRect,
  type Wheel,
} from '@/engine';
import { createSweep } from './blocks';
import { bakeGrade } from './grade';
import { outlineOdometer, rollingWheels } from './odometer';

type Composition = {
  /** Slant of the shared diagonal, degrees. */
  slant: number;
  /** Share of the frame (along the sweep, at its center) the cover panel takes. */
  panel: number;
  /** Width of the band between the background and the panel, in u. */
  band: number;
  /** Type sizes in u. */
  name: number;
  number: number;
  label: number;
  title: number;
  guest: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': {
    slant: 16,
    panel: 0.37,
    band: 3,
    name: 14,
    number: 16,
    label: 3.6,
    title: 4.6,
    guest: 3.1,
  },
  '1:1': {
    slant: 11,
    panel: 0.33,
    band: 2.8,
    name: 12,
    number: 13,
    label: 3.2,
    title: 4.6,
    guest: 3.2,
  },
  '4:5': {
    slant: 11,
    panel: 0.35,
    band: 2.8,
    name: 12.5,
    number: 13.5,
    label: 3.3,
    title: 4.8,
    guest: 3.3,
  },
  '9:16': {
    slant: 11,
    panel: 0.37,
    band: 3,
    name: 14,
    number: 15,
    label: 3.8,
    title: 5.4,
    guest: 3.8,
  },
};

/** Energy: Calm glides and settles without overshoot; Punchy slams and overshoots. */
const FEEL = {
  calm: { punch: 1.02, spring: 'gentle', roll: 0.55, blocks: 'drift' },
  balanced: { punch: 1.06, spring: 'snappy', roll: 0.6, blocks: 'snap' },
  punchy: { punch: 1.1, spring: 'lively', roll: 0.7, blocks: 'snap' },
} as const satisfies Record<
  string,
  { punch: number; spring: SpringName; roll: number; blocks: 'drift' | 'snap' }
>;

const IN = 2.2;
const BLACK = rgb(0, 0, 0);
const OUT = 0.5;

export default defineTemplate({
  id: 'episode',
  version: 1,
  meta: {
    name: 'Episode',
    tagline: 'Series opener',
    category: 'openers',
    tags: ['opener', 'podcast', 'series', 'episode', 'intro'],
    useCases: ['Podcasts', 'YouTube series', 'Webinars', 'Courses'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 5, min: 4, max: 10 },
  alpha: 'none',
  poster: 3,
  palettes: [
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'forest' },
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'lilac' },
  ],
  pairings: ['grotesk', 'sport', 'editorial', 'poster', 'wide', 'technical'],
  controls: {
    show: c.text({ label: 'Show name', default: 'THE MOTION ROOM', maxLength: 32, primary: true }),
    number: c.text({ label: 'Episode number', default: '07', maxLength: 5, optional: true }),
    label: c.text({ label: 'Number label', default: 'EP', maxLength: 10, optional: true }),
    title: c.text({
      label: 'Episode title',
      default: 'Why timing is everything',
      maxLength: 56,
    }),
    guest: c.text({ label: 'Guest', default: 'with Aiko Tanaka', maxLength: 40, optional: true }),
    cover: c.image({
      label: 'Cover image',
      accept: 'artwork',
      optional: true,
      default: { kind: 'placeholder', id: 'artwork-2' },
    }),
    numberStyle: c.choice({
      label: 'Number style',
      default: 'outline',
      options: [
        { value: 'outline', label: 'Outline' },
        { value: 'solid', label: 'Solid' },
      ],
    }),
    colors: c.choice({
      label: 'Colors',
      default: 'accent',
      options: [
        { value: 'accent', label: 'Accent' },
        { value: 'contrast', label: 'Contrast' },
        { value: 'tonal', label: 'Tonal' },
      ],
      hint: 'The three blocks: the panel, the band and the background',
    }),
  },
  looks: [
    {
      id: 'tangerine',
      name: 'Tangerine',
      palette: { kind: 'library', id: 'tangerine' },
      pairing: 'grotesk',
    },
    { id: 'cobalt', name: 'Cobalt', palette: { kind: 'library', id: 'cobalt' }, pairing: 'sport' },
    {
      id: 'forest',
      name: 'Forest',
      palette: { kind: 'library', id: 'forest' },
      pairing: 'editorial',
    },
  ],
  timing: ({ props }) => ({
    in: IN,
    out: OUT,
    tail: 1 / 15,
    readable: props.title,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent, accent2 } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const feel = FEEL[energy.id];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const sweep = createSweep(frame, comp.slant);
    const cover = ctx.graphic('cover');

    // --- the three blocks: panel (A), band (B), background (C) --------------------------
    const tone = (color: Color, amount: number) =>
      adjustLightness(color, palette.dark ? amount : -amount);
    // Brand Bold's accent is its foreground: its panel is a deeper tone of the brand instead.
    const brandBold = palette.id === 'brand-bold';
    const [panelColor, bandColor] =
      props.colors === 'contrast'
        ? [fg, accent]
        : props.colors === 'tonal' || brandBold
          ? [tone(bg, 0.14), brandBold ? fg : accent]
          : [accent, accent2];
    const colorsIn: Color[] = [panelColor, bandColor, bg];

    // Where the band and the panel start, along the sweep (their edges pass the frame's center
    // line at `panel` from the far side).
    const { width: W, height: H } = frame;
    const sC = sweep.side
      ? (1 - comp.panel) * W + sweep.b * (H / 2)
      : (1 - comp.panel) * H + sweep.a * (W / 2);
    const bandS = comp.band * u * sweep.scale;
    const sB = sC + bandS;
    const panelRect = sweep.beyond(sB);
    const focal = ctx.focal('cover');
    const coverGrade = { saturation: 0, contrast: 1.15 };
    // Baked once (vector covers are graded per frame instead).
    const greyCover = bakeGrade(cover, coverGrade);
    // The cover's greys print into the panel: overlaid on mid tones, screened onto very dark
    // panels and multiplied into very light ones (where overlay would lose the picture).
    const panelLuma = contrastRatio(panelColor, BLACK) * 0.05 - 0.05;
    const coverBlend: BlendMode =
      panelLuma < 0.06 ? 'screen' : panelLuma > 0.85 ? 'multiply' : 'overlay';

    // --- type ---------------------------------------------------------------------------
    const display = pairing.display;
    const bold = display.weight >= 600 ? 800 : display.weight;
    const wide = display.width !== undefined ? display.width + 8 : undefined;
    const margin = 3 * u;

    // The text column: in landscape it ends before the slanted edge at the bottom of the safe
    // area (the edge leans away above); otherwise it spans the safe area below the edge.
    const columnW = sweep.side
      ? Math.min(area.w, sC - sweep.b * (area.y + area.h) - margin - area.x)
      : area.w;

    const layout = (k: number) => {
      const name = text.layout(props.show.trim() || ' ', {
        style: {
          font: display.font,
          italicFont: display.italic,
          size: comp.name * u * k,
          weight: bold,
          width: wide,
          tracking: display.tracking + 0.015,
          features: display.features,
        },
        maxWidth: columnW,
        maxLines: 3,
        lineHeight: Math.min(display.lineHeight, 0.95),
        align: 'left',
        fit: { minSize: comp.name * u * k * 0.5 },
      });
      const odometer = outlineOdometer(text, {
        font: display.font,
        size: comp.number * u * k,
        weight: bold,
        width: display.width,
        tracking: 0,
        features: display.features,
      });
      const labelText = props.label.trim();
      const label: TextBlock | null = labelText
        ? text.layout(labelText, {
            style: {
              font: pairing.text.font,
              size: comp.label * u * k,
              weight: 700,
              width: pairing.text.width,
              tracking: 0.14,
              case: 'upper',
            },
            maxWidth: columnW * 0.4,
            maxLines: 1,
            lineHeight: 1,
            fit: { minSize: 2.4 * u },
          })
        : null;
      const title = text.layout(props.title.trim() || ' ', {
        style: {
          font: display.font,
          italicFont: display.italic,
          size: comp.title * u * k,
          weight: display.weight >= 600 ? 650 : display.weight,
          width: display.width,
          tracking: display.tracking * 0.4,
          features: display.features,
        },
        maxWidth: columnW,
        maxLines: 2,
        lineHeight: 1.08,
        align: 'left',
        fit: { minSize: Math.max(2.8 * u, comp.title * u * k * 0.7) },
      });
      const guestText = props.guest.trim();
      const guest: TextBlock | null = guestText
        ? text.layout(guestText, {
            style: {
              font: pairing.text.font,
              size: comp.guest * u * k,
              weight: 450,
              width: pairing.text.width,
              tracking: pairing.text.tracking,
              features: pairing.text.features,
            },
            maxWidth: columnW,
            maxLines: 1,
            lineHeight: 1.2,
            fit: { minSize: 2.4 * u },
          })
        : null;
      // Stack (y = 0 is the show name's cap height): name · number row · title · guest.
      // Without a number (or its label) the row is left out.
      const numbered = props.number.trim() !== '' || label !== null;
      const numberY = name.height + (numbered ? 4.2 * u * k + odometer.capHeight : 0);
      const titleY = numberY + (numbered ? 4.4 * u * k : 5 * u * k);
      const guestY = titleY + title.height + (guest ? 0.9 * guest.size + 1.8 * u * k : 0);
      const height = guest ? guestY + guest.height : titleY + title.height;
      return { name, odometer, label, title, guest, numberY, titleY, guestY, height };
    };

    // Landscape: optically centered. Otherwise seated on the bottom of the safe area, shrunk
    // when the stack would reach up into the panel.
    let stack = layout(1);
    let top: number;
    if (sweep.side) {
      top = area.y + (area.h - stack.height) * 0.46;
    } else {
      // Below the edge where it's lowest (at the column's left).
      const edgeY = (x: number) => (sweep.c + sweep.a * x - sC) / -sweep.b;
      const ceiling = edgeY(area.x) + margin + (stack.name.lines[0]?.mask.h ?? 0) * 0.1;
      const floor = area.y + area.h - 0.25 * (stack.guest ?? stack.title).size;
      const room = floor - ceiling;
      if (stack.height > room) stack = layout(Math.max(0.6, room / stack.height));
      top = floor - stack.height;
    }
    const { name, odometer, label, title, guest } = stack;
    const x0 = area.x;
    const nameY = top;
    const baseline = top + stack.numberY;
    const titleY = top + stack.titleY;
    const guestY = top + stack.guestY;

    const target = props.number.trim();
    const numbered = target !== '' || label !== null;
    const settled = staticWheels(target);
    const labelGap = 1.6 * u;
    const labelW = label ? label.width + labelGap : 0;
    const numberX = x0 + labelW;
    const numberW = odometer.width(settled);
    const numberTop = baseline - odometer.capHeight;
    const numberRect: Rect = { x: x0, y: numberTop, w: labelW + numberW, h: odometer.capHeight };

    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const nameBounds = shift(name.ink, x0, nameY);
    const titleBounds = shift(title.ink, x0, titleY);
    const guestBounds = guest ? shift(guest.ink, x0, guestY) : null;
    let lockup = unionRect(numbered ? unionRect(nameBounds, numberRect) : nameBounds, titleBounds);
    if (guestBounds) lockup = unionRect(lockup, guestBounds);
    const nameCenter = {
      x: x0 + name.ink.x + name.ink.w / 2,
      y: nameY + name.ink.y + name.ink.h / 2,
    };

    const stroke = {
      color: accent,
      width: Math.max(0.3 * u, odometer.capHeight * 0.05),
      join: 'round' as const,
    };
    const numberPaint = props.numberStyle === 'solid' ? { fill: accent } : { outline: stroke };

    // --- motion --------------------------------------------------------------------------
    const [ax, ay] = sweep.along;
    const lineGap = ctx.stagger(0.06);
    const blockGap = ctx.stagger(0.08);
    const outGap = ctx.stagger(0.06);
    const drift = 1.4 * u * energy.travel;

    /** Front of block `i` entering: from before the frame to its stop. */
    const stops = [sweep.max, sB, sC];
    const clampedT = (x: number) => Math.min(1, Math.max(0, x));

    /** One line rising along the diagonal inside its mask. */
    const riseLine = (
      g: Draw,
      block: TextBlock,
      line: TextLine,
      x: number,
      y: number,
      p: number,
      fill: Color,
    ) => {
      const rise = (block.lines[0]?.mask.h ?? block.size) * 1.08;
      const d = (1 - p) * rise;
      const mask = shift(line.mask, x, y);
      g.clip(mask, (g) => g.text(line, { fill, x: x - ax * d, y: y - ay * d }));
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg);
        const outT = tl.local(t, 'out');

        // --- blocks in: panel, band, background — the last one is the background ---------
        const breath = tl.p(t, 'hold', {}, 'drift');
        const sway = drift * sweep.scale * breath;
        for (let i = 0; i < 3; i++) {
          const q = tl.p(t, 'in', { delay: i * blockGap, dur: 0.44 }, feel.blocks);
          if (q <= 0) continue;
          const stop = i === 0 ? stops[0]! : stops[i]! + sway;
          const front = sweep.min + (stop - sweep.min) * q;
          const shape = sweep.cover(front);
          if (!shape) continue;
          const fill = colorsIn[i]!;
          g.path(shape, { fill });
          if (i === 0 && cover) {
            // The cover lives in the panel, printed into the panel's color (its greys overlaid
            // on the block keep any artwork in the palette), revealed as the block sweeps in.
            g.clip({ path: shape }, (g) =>
              g.group({ x: ax * drift * breath, y: ay * drift * breath }, (g) => {
                if (greyCover) {
                  g.group({ blend: coverBlend, opacity: 0.92 }, (g) =>
                    g.image(greyCover, panelRect, { fit: 'cover', focal }),
                  );
                } else {
                  const fx = { adjust: coverGrade, blend: coverBlend, opacity: 0.92 };
                  g.fx({ ...fx, bounds: panelRect }, (g) =>
                    g.graphic(cover, panelRect, { fit: 'cover', focal }),
                  );
                }
              }),
            );
          }
        }
        if (cover) g.editable('cover', panelRect);

        // --- type ------------------------------------------------------------------------
        g.movable('lockup', lockup, (g) => {
          // Show name: lines rise along the diagonal while the name settles from 1.06×.
          const punch = tl.p(t, 'in', { delay: 0.4, dur: 0.8 }, 'glide');
          const scale = feel.punch - (feel.punch - 1) * punch;
          g.group({ scale, originX: nameCenter.x, originY: nameCenter.y }, (g) => {
            name.lines.forEach((line, i) => {
              const p = tl.p(t, 'in', { delay: 0.4 + i * lineGap, dur: 0.6 }, energy.enter);
              if (p > 0) riseLine(g, name, line, x0, nameY, p, fg);
            });
          });
          g.editable('show', nameBounds);

          // Number row: the label slides up the diagonal, the digits roll up from zero.
          const shown = numbered ? tl.p(t, 'in', { delay: 0.9, dur: 0.4 }, 'glide') : 0;
          if (shown > 0) {
            if (label) {
              const d = (1 - shown) * 2 * u;
              g.text(label, {
                fill: accent,
                x: x0 - ax * d,
                y: numberTop - ay * d,
                opacity: shown,
              });
            }
            const rollStart = tl.at('in', 0.95);
            // Each digit rolls up from zero on a named spring (slowed to read as counting) and
            // settles with its overshoot; digits start one after another.
            const wheels: Wheel[] = rollingWheels(target, (slot) => {
              const local = (t - rollStart - slot * 0.06 * energy.stagger) * feel.roll;
              return local <= 0 ? 0 : springProgress(local, feel.spring);
            });
            const opacity = Math.min(1, shown * 1.6);
            odometer.draw(g, wheels, numberX, baseline, { ...numberPaint, opacity });
          }
          if (numbered) g.editable('number', numberRect);

          // Title lines rise along the diagonal; the guest line follows.
          title.lines.forEach((line, i) => {
            const p = tl.p(t, 'in', { delay: 1.6 + i * lineGap, dur: 0.6 }, energy.enter);
            if (p > 0) riseLine(g, title, line, x0, titleY, p, fg);
          });
          g.editable('title', titleBounds);
          if (guest && guestBounds) {
            const p = tl.p(t, 'in', { delay: 1.8, dur: 0.5 }, 'glide');
            if (p > 0) {
              const d = (1 - p) * 1.6 * u;
              g.text(guest, { fill: muted, x: x0 - ax * d, y: guestY - ay * d, opacity: p });
            }
            g.editable('guest', guestBounds);
          }
        });

        // --- blocks out: the same sweep again, covering; the last one is the background --
        if (outT > 0) {
          for (let i = 0; i < 3; i++) {
            const q = tl.p(t, 'out', { delay: i * outGap, dur: 0.32 }, 'snap');
            if (q <= 0) continue;
            const shape = sweep.cover(sweep.min + (sweep.max - sweep.min) * clampedT(q));
            if (shape) g.path(shape, { fill: colorsIn[i]! });
          }
        }
      },
    };
  },
});
