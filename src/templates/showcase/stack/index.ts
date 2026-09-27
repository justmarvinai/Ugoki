/**
 * Stack — photo stack (docs/templates/05-showcase.md §5.5).
 *
 * The expensive detail: every print's shadow — offset, blur, size and density — follows its
 * height above the surface, from the large soft shadow of a print still in the air to a tight
 * contact shadow once it lies flat; a landing nudges the prints it lands on, and they stay moved.
 * Shadows are drawn analytically (see shadow.ts), so a stack of eight costs no effect layers.
 *
 * Photos: eight image slots and a Photos count (2–8); captions are one per line.
 */

import {
  CLEAN_END,
  type Color,
  c,
  contrastRatio,
  type Draw,
  defineTemplate,
  degToRad,
  type FocalPoint,
  type FormatId,
  type Gradient,
  type Graphic,
  mixOklab,
  type PathCommand,
  type PathData,
  type Rect,
  rgb,
  type SpringName,
  spring,
  type TextBlock,
  withAlpha,
} from '@/engine';
import { createSoftShadow } from './shadow';
import { createSurface } from './surface';

const PHOTO_KEYS = [
  'photo1',
  'photo2',
  'photo3',
  'photo4',
  'photo5',
  'photo6',
  'photo7',
  'photo8',
] as const;

const SCENES = [
  'scene-dusk',
  'scene-meadow',
  'scene-alpine',
  'scene-dunes',
  'scene-coast',
  'scene-night',
  'scene-meadow',
  'scene-alpine',
];

const photo = (n: number) =>
  c.image({
    label: `Photo ${n}`,
    accept: 'scene',
    default: { kind: 'placeholder', id: SCENES[n - 1] ?? 'scene-coast' },
    ...(n > 5 ? { advanced: true } : {}),
  });

type Composition = {
  /** Width of a print's image in u (landscape). */
  print: number;
  /** Title size in u. */
  title: number;
  /** Where the title label sits (share of the layout area's height). */
  label: number;
  /** Vertical spread of the pile (taller frames spread further) and its center (share). */
  tall: number;
  pile: number;
  /** Widest the title label's text may get (share of the layout area's width). */
  measure: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { print: 40, title: 6.4, label: 0.8, tall: 1, pile: 0.43, measure: 0.62 },
  '1:1': { print: 35, title: 6.6, label: 0.92, tall: 1.05, pile: 0.4, measure: 0.66 },
  '4:5': { print: 37, title: 6.8, label: 0.92, tall: 1.12, pile: 0.4, measure: 0.7 },
  '9:16': { print: 47, title: 8.2, label: 0.92, tall: 1.3, pile: 0.4, measure: 0.8 },
};

/** Scatter: how far prints spread from the middle, and how much they turn. */
const SCATTER = {
  tidy: { spread: 0.34, turn: 3.5 },
  casual: { spread: 0.86, turn: 8 },
  messy: { spread: 1, turn: 13 },
} as const;

/**
 * How a print lands, per energy: a named spring on its own clock. The springs keep their damping
 * (Calm: `heavy`, no bounce; Balanced: `snappy`'s slight bounce; Punchy: `lively`), but a print
 * dropped from above takes a moment to fall — `snappy` would touch down in 0.13 s.
 */
const LANDING: Record<'calm' | 'balanced' | 'punchy', { spring: SpringName; clock: number }> = {
  calm: { spring: 'heavy', clock: 1 },
  balanced: { spring: 'snappy', clock: 0.42 },
  punchy: { spring: 'lively', clock: 0.55 },
};

const PAPER: Color = rgb(0.976, 0.97, 0.953);
const CARD: Color = rgb(0.988, 0.978, 0.952);
const TAPE: Color = rgb(0.95, 0.92, 0.8);
const INK: Color = rgb(0.13, 0.12, 0.11);
const BLACK: Color = rgb(0, 0, 0);
const WHITE: Color = rgb(1, 1, 1);

/** Seconds until a spring first reaches its target (a landing). */
function firstReach(name: SpringName, clock: number): number {
  for (let s = 0; s < 4; s += 0.002) if (spring(s * clock, 0, 1, name) >= 0.985) return s;
  return 1;
}

type Print = {
  readonly key: (typeof PHOTO_KEYS)[number];
  readonly graphic: Graphic | null;
  readonly focal: FocalPoint;
  /** Resting center and rotation (degrees). */
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  /** The paper (centered on 0, 0), the image on it, and the caption's baseline. */
  readonly paper: Rect;
  readonly image: Rect;
  readonly caption: TextBlock | null;
  readonly captionX: number;
  readonly captionY: number;
  readonly gloss: Gradient;
  /** Where it comes from (in the air) and where it leaves to. */
  readonly driftX: number;
  readonly spin: number;
  readonly side: number;
  /** When it lands (absolute seconds) and when it starts falling. */
  readonly start: number;
  readonly landed: number;
};

export default defineTemplate({
  id: 'stack',
  version: 1,
  meta: {
    name: 'Stack',
    tagline: 'Photo stack',
    category: 'showcase',
    tags: ['photos', 'travel', 'memories', 'collage', 'recap'],
    useCases: ['Travel recaps', 'Events', 'Memories', 'Year in review'],
  },
  formats: ['1:1', '4:5', '9:16', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 7, min: 5, max: 15 },
  alpha: 'none',
  poster: 3.8,
  palettes: [
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'film' },
    { kind: 'library', id: 'blush' },
    { kind: 'library', id: 'forest' },
    { kind: 'library', id: 'mint' },
  ],
  pairings: ['editorial', 'soft', 'classic', 'grotesk', 'studio'],
  controls: {
    photo1: photo(1),
    photo2: photo(2),
    photo3: photo(3),
    photo4: photo(4),
    photo5: photo(5),
    photo6: photo(6),
    photo7: photo(7),
    photo8: photo(8),
    photos: c.number({
      label: 'Photos',
      group: 'content',
      default: 5,
      min: 2,
      max: 8,
      step: 1,
    }),
    captions: c.text({
      label: 'Captions',
      default: 'Lisbon\nKyoto\nReykjavík\nOaxaca\nHydra',
      multiline: true,
      maxLines: 8,
      maxLength: 160,
      optional: true,
      hint: 'One per line, in photo order',
    }),
    title: c.text({ label: 'Title', default: 'Summer, archived.', maxLength: 36, primary: true }),
    border: c.choice({
      label: 'Border',
      default: 'polaroid',
      options: [
        { value: 'polaroid', label: 'Polaroid' },
        { value: 'thin', label: 'Thin' },
        { value: 'none', label: 'None' },
      ],
    }),
    surface: c.choice({
      label: 'Surface',
      default: 'paper',
      options: [
        { value: 'paper', label: 'Paper' },
        { value: 'linen', label: 'Linen' },
        { value: 'concrete', label: 'Concrete' },
        { value: 'solid', label: 'Solid' },
      ],
    }),
    scatter: c.choice({
      label: 'Scatter',
      group: 'motion',
      default: 'casual',
      options: [
        { value: 'tidy', label: 'Tidy' },
        { value: 'casual', label: 'Casual' },
        { value: 'messy', label: 'Messy' },
      ],
    }),
  },
  looks: [
    { id: 'sand', name: 'Sand', palette: { kind: 'library', id: 'sand' }, pairing: 'editorial' },
    {
      id: 'paper',
      name: 'Paper',
      palette: { kind: 'library', id: 'paper' },
      pairing: 'soft',
      values: { surface: 'linen' },
    },
    {
      id: 'film',
      name: 'Film',
      palette: { kind: 'library', id: 'film' },
      pairing: 'classic',
      values: { surface: 'concrete', border: 'thin' },
    },
  ],
  timing: ({ props }) => {
    const n = Math.round(props.photos);
    const gap = n > 1 ? Math.min(0.4, 1.8 / (n - 1)) : 0;
    return {
      in: 0.2 + (n - 1) * gap + 1.1,
      out: 0.95,
      tail: CLEAN_END,
      readable: props.title,
    };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u, width: W } = frame;
    const { bg, fg } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const scatter = SCATTER[props.scatter];
    const count = Math.round(props.photos);
    const rng = ctx.rng('stack');

    const surface = createSurface(props.surface, frame, bg, palette.dark, ctx.rng('surface'));
    const shadowColor = mixOklab(bg, BLACK, palette.dark ? 0.75 : 0.62);
    const soft = createSoftShadow(shadowColor);
    const ink = contrastRatio(fg, PAPER) >= 7 ? fg : INK;

    // --- prints ------------------------------------------------------------------------------
    const captionLines = props.captions.split('\n');
    const display = pairing.display;
    const captionFont = display.italic ?? pairing.text.font;
    const border = props.border;
    const gap = count > 1 ? Math.min(0.4, 1.8 / (count - 1)) : 0;
    const landing = LANDING[energy.id];
    const fall = firstReach(landing.spring, landing.clock);
    const margin = 2 * u;

    // Resting places: around an ellipse (the last print nearest the middle), seeded jitter.
    const baseW = comp.print * u;
    const ringX = Math.max(0, (area.w - baseW * 1.1) / 2) * scatter.spread;
    const ringY = Math.max(0, (area.h - baseW * 0.9) / 2) * scatter.spread * 0.8 * comp.tall;
    const centerX = area.x + area.w / 2;
    const centerY = area.y + area.h * comp.pile;
    const around = count > 2 ? count - 1 : count;
    // Straddle the top: with four around, they sit toward the corners.
    const start = -Math.PI / 2 + Math.PI / around + (rng.next() - 0.5) * 0.35;
    // Places around the ring, bottom row first: prints land bottom-up, so each caption (on a
    // print's lower border) comes to rest on top of the prints below it rather than under them.
    const slots = Array.from({ length: around }, (_, k) => {
      const angle = start + (k / around) * Math.PI * 2;
      const jitter = (rng.next() - 0.5) * 0.2;
      // A squarer ring (toward the corners) fills the frame better than a circle.
      const along = Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** 0.55;
      const across = Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** 0.55;
      return { x: along * ringX * (1 + jitter), y: across * ringY * (1 - jitter) };
    });
    // With three or more, one print lies in the middle, slightly high.
    if (count > 2) slots.push({ x: 0, y: -ringY * 0.12 });
    slots.sort((a, b) => b.y - a.y);

    const prints: Print[] = PHOTO_KEYS.slice(0, count).map((key, i) => {
      const graphic = ctx.graphic(key);
      const bounds = graphic?.ink;
      const aspect = bounds && bounds.w > 0 && bounds.h > 0 ? bounds.w / bounds.h : 1.5;
      const a = Math.min(1.6, Math.max(0.66, aspect));
      // Same area for every orientation.
      const imageW = baseW * Math.sqrt(a / 1.5);
      const imageH = imageW / a;
      const side = border === 'polaroid' ? 0.045 * imageW : border === 'thin' ? 0.024 * imageW : 0;
      const bottom = border === 'polaroid' ? 0.2 * imageW : border === 'thin' ? 0.09 * imageW : 0;
      const paper: Rect = {
        x: -(imageW + 2 * side) / 2,
        y: -(imageH + side + bottom) / 2,
        w: imageW + 2 * side,
        h: imageH + side + bottom,
      };
      const image: Rect = { x: paper.x + side, y: paper.y + side, w: imageW, h: imageH };
      const label = (captionLines[i] ?? '').trim();
      const caption: TextBlock | null =
        label && border !== 'none'
          ? text.layout(label, {
              style: {
                font: captionFont,
                size: (border === 'polaroid' ? 0.085 : 0.05) * imageW,
                weight: border === 'polaroid' ? display.weight : 500,
                width: display.width,
                tracking: 0,
                features: display.features,
              },
              maxWidth: imageW * 0.9,
              maxLines: 1,
              lineHeight: 1.1,
              align: 'center',
              fit: { minSize: 2.4 * u },
            })
          : null;
      const captionX = image.x + imageW * 0.05;
      const captionY = caption
        ? image.y + imageH + (bottom - caption.capHeight) / 2 - caption.capHeight * 0.05
        : 0;

      // Place: the last print sits near the middle, the others around it.
      const slot = slots[i] ?? { x: 0, y: 0 };
      let x = centerX + slot.x;
      let y = centerY + slot.y;
      const rotate = (rng.next() * 2 - 1) * scatter.turn;
      // Keep the whole print (captions included) inside the layout area.
      const r = degToRad(rotate);
      const hx = (paper.w * Math.abs(Math.cos(r)) + paper.h * Math.abs(Math.sin(r))) / 2;
      const hy = (paper.w * Math.abs(Math.sin(r)) + paper.h * Math.abs(Math.cos(r))) / 2;
      x = Math.min(Math.max(x, area.x + hx + margin), area.x + area.w - hx - margin);
      y = Math.min(Math.max(y, area.y + hy + margin), area.y + area.h - hy - margin);

      const begin = 0.2 + i * gap;
      return {
        key,
        graphic,
        focal: ctx.focal(key),
        x,
        y,
        rotate,
        paper,
        image,
        caption,
        captionX,
        captionY,
        gloss: {
          kind: 'linear',
          x0: image.x,
          y0: image.y,
          x1: image.x + imageW * 0.6,
          y1: image.y + imageH * 0.9,
          stops: [
            { offset: 0, color: withAlpha(WHITE, 0.16) },
            { offset: 0.45, color: withAlpha(WHITE, 0.03) },
            { offset: 1, color: withAlpha(WHITE, 0) },
          ],
        },
        driftX: (rng.next() - 0.5) * 8 * u,
        spin: (rng.next() < 0.5 ? -1 : 1) * (4 + rng.next() * 4),
        side: x < frame.cx ? -1 : 1,
        start: begin,
        landed: timeline.at('in', begin) + fall,
      };
    });

    // Landing nudges: each landing pushes the prints below it (that it overlaps) by 0.3u.
    const nudges: { from: number; to: number; dx: number; dy: number }[] = [];
    for (let i = 1; i < prints.length; i++) {
      const top = prints[i] as Print;
      for (let j = 0; j < i; j++) {
        const below = prints[j] as Print;
        const dx = below.x - top.x;
        const dy = below.y - top.y;
        const distance = Math.hypot(dx, dy);
        const reach =
          (Math.hypot(top.paper.w, top.paper.h) + Math.hypot(below.paper.w, below.paper.h)) / 2;
        if (distance >= reach * 0.9) continue;
        const k = (0.3 * u) / Math.max(distance, 1e-6);
        nudges.push({
          from: i,
          to: j,
          dx: distance > 1e-6 ? dx * k : 0.3 * u,
          dy: distance > 1e-6 ? dy * k : 0,
        });
      }
    }

    // --- title label ----------------------------------------------------------------------------
    const titleText = props.title.trim();
    const title: TextBlock | null = titleText
      ? text.layout(titleText, {
          style: {
            font: display.font,
            italicFont: display.italic,
            size: comp.title * u,
            weight: display.weight,
            width: display.width,
            tracking: display.tracking,
            features: display.features,
          },
          maxWidth: area.w * comp.measure,
          maxLines: 2,
          lineHeight: display.lineHeight * 1.05,
          align: 'center',
          fit: { minSize: 3 * u },
        })
      : null;
    const padX = title ? title.size * 0.85 : 0;
    const padTop = title ? title.size * 0.7 : 0;
    const padBottom = title ? title.size * 0.62 : 0;
    const card: Rect | null = title
      ? {
          x: -(title.ink.w + 2 * padX) / 2,
          y: -(title.height + padTop + padBottom) / 2,
          w: title.ink.w + 2 * padX,
          h: title.height + padTop + padBottom,
        }
      : null;
    const cardRotate = (rng.next() * 2 - 1) * Math.min(3, scatter.turn * 0.4);
    let cardX = centerX;
    let cardY = area.y + area.h * comp.label;
    if (card) {
      const r = degToRad(cardRotate);
      const hx = (card.w * Math.abs(Math.cos(r)) + card.h * Math.abs(Math.sin(r))) / 2 + margin;
      const hy = (card.w * Math.abs(Math.sin(r)) + card.h * Math.abs(Math.cos(r))) / 2 + margin;
      cardX = Math.min(Math.max(cardX, area.x + hx), area.x + area.w - hx);
      cardY = Math.min(Math.max(cardY, area.y + hy), area.y + area.h - hy);
    }
    const titleX = card && title ? card.x + padX - title.ink.x : 0;
    const titleY = card ? card.y + padTop : 0;
    // A strip of tape across the label's top edge, torn at both ends.
    let tape: PathData | null = null;
    if (card) {
      const length = Math.max(12 * u, card.w * 0.42);
      const thick = Math.max(3.4 * u, card.h * 0.2);
      const teeth = 5;
      const tooth = thick / teeth;
      const bite = 0.35 * u;
      const x0 = -length / 2;
      const x1 = length / 2;
      const y0 = card.y - thick * 0.55;
      const commands: PathCommand[] = [['M', x0, y0]];
      commands.push(['L', x1, y0]);
      for (let k = 1; k <= teeth; k++)
        commands.push(['L', x1 + (k % 2 ? bite : 0), y0 + k * tooth]);
      commands.push(['L', x0, y0 + thick]);
      for (let k = teeth - 1; k >= 0; k--)
        commands.push(['L', x0 - (k % 2 ? bite : 0), y0 + k * tooth]);
      commands.push(['Z']);
      tape = commands;
    }
    const tapeRotate = (rng.next() * 2 - 1) * 4;
    const titleBounds: Rect | null =
      card && title
        ? {
            x: cardX + titleX + title.ink.x,
            y: cardY + titleY + title.ink.y,
            w: title.ink.w,
            h: title.ink.h,
          }
        : null;
    const cardBounds: Rect | null = card
      ? { x: cardX + card.x, y: cardY + card.y, w: card.w, h: card.h }
      : null;
    const titleStart = 0.2 + (count - 1) * gap + 0.55;

    // --- motion ------------------------------------------------------------------------------
    const travel = ctx.travel(14 * u);
    const lightX = 0.5;
    const lightY = 1;
    const holdDrift = { x: 1.4 * u, y: -0.9 * u };
    const layers = count + 1;
    // Staggered exits always finish inside the out section, however many prints there are.
    const exitGap = Math.min(ctx.stagger(0.07), 0.45 / Math.max(1, layers - 1));

    /** Shadow + paper of something at `height` above the surface (0 = lying flat). */
    const drawShadow = (g: Draw, r: Rect, height: number, opacity: number) => {
      const h = Math.max(0, height);
      const contact = Math.max(0, 1 - h * 5) * opacity;
      if (contact > 0.01) {
        g.rect(
          { x: r.x - 0.12 * u, y: r.y - 0.06 * u, w: r.w + 0.24 * u, h: r.h + 0.3 * u },
          {
            fill: shadowColor,
            opacity: 0.16 * contact,
          },
        );
        g.rect(
          { x: r.x - 0.3 * u, y: r.y - 0.1 * u, w: r.w + 0.6 * u, h: r.h + 0.6 * u },
          {
            fill: shadowColor,
            opacity: 0.07 * contact,
          },
        );
      }
      const spread = 0.2 * u + h * 1.2 * u;
      soft.draw(
        g,
        { x: r.x - spread, y: r.y - spread, w: r.w + 2 * spread, h: r.h + 2 * spread },
        0.8 * u + 4.5 * u * h,
        opacity * 0.3 * (1 - 0.45 * Math.min(1, h)),
      );
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        surface.draw(g);

        const drift = tl.p(t, 'hold', {}, 'drift');
        const depthShift = (depth: number) => 0.35 + (0.65 * (depth + 1)) / layers;

        prints.forEach((print, i) => {
          const local = t - tl.at('in', print.start);
          if (local <= 0) return;
          const order = layers - 1 - i;
          const away = tl.p(t, 'out', { delay: order * exitGap, dur: 0.45 }, 'exit');
          if (away >= 1) return;
          const settle = spring(local * landing.clock, 0, 1, landing.spring);
          const air = Math.abs(1 - settle);
          const opacity = Math.min(1, local / 0.12);
          // Nudged by every print that has landed on it.
          let nx = 0;
          let ny = 0;
          for (const nudge of nudges) {
            if (nudge.to !== i) continue;
            const hit = prints[nudge.from] as Print;
            const p = Math.min(1, Math.max(0, (t - hit.landed) / 0.2));
            const eased = p * p * (3 - 2 * p);
            nx += nudge.dx * eased;
            ny += nudge.dy * eased;
          }
          const shiftK = depthShift(i) * drift;
          const lift = air + away * 0.3;
          const x =
            print.x +
            nx +
            holdDrift.x * shiftK +
            air * print.driftX +
            print.side * away * (W * 0.62 + print.paper.w);
          const y = print.y + ny + holdDrift.y * shiftK - air * travel;
          const rotate = print.rotate + air * print.spin + print.side * away * 9;
          const scale = 1 + 0.25 * air;

          // The shadow lies on the surface: offset from the print by its height.
          const offset = (0.25 * u + 2.8 * u * lift) * scale;
          g.group(
            {
              x: x + offset * lightX,
              y: y + offset * lightY,
              rotate,
              scale: scale * (1 + 0.04 * lift),
            },
            (g) => drawShadow(g, print.paper, lift, opacity),
          );
          g.group({ x, y, rotate, scale }, (g) => {
            if (border !== 'none') g.rect(print.paper, { fill: PAPER, opacity });
            if (print.graphic) {
              g.graphic(print.graphic, print.image, {
                fit: 'cover',
                focal: print.focal,
                opacity,
              });
            }
            g.rect(print.image, { fill: print.gloss, opacity });
            if (print.caption) {
              g.text(print.caption, {
                fill: ink,
                x: print.captionX,
                y: print.captionY,
                opacity: opacity * 0.92,
              });
              g.editable('captions', {
                x: print.captionX + print.caption.ink.x,
                y: print.captionY + print.caption.ink.y,
                w: print.caption.ink.w,
                h: print.caption.ink.h,
              });
            }
            g.editable(print.key, print.paper);
          });
        });

        // The title label drops on top, tape and all.
        if (card && title && cardBounds) {
          const shown = tl.p(t, 'in', { delay: titleStart, dur: 0.1 }, 'linear');
          const away = tl.p(t, 'out', { dur: 0.45 }, 'exit');
          if (shown > 0 && away < 1) {
            const drop = tl.p(
              t,
              'in',
              { delay: titleStart, dur: 0.5 },
              energy.id === 'calm' ? 'glide' : 'pop',
            );
            const air = Math.max(0, 1 - drop) + Math.max(0, drop - 1) * 2;
            const side = cardX < frame.cx ? -1 : 1;
            const shiftK = depthShift(count) * drift;
            const x = cardX + holdDrift.x * shiftK + side * away * (W * 0.62 + card.w);
            const y = cardY + holdDrift.y * shiftK - air * travel * 0.5;
            const rotate = cardRotate + air * 4 + side * away * 9;
            const scale = 1 + 0.15 * air;
            const lift = air * 0.6 + away * 0.3;
            const offset = (0.25 * u + 2.8 * u * lift) * scale;
            g.movable('title', cardBounds, (g) => {
              g.group({ x: x + offset * lightX, y: y + offset * lightY, rotate, scale }, (g) =>
                drawShadow(g, card, lift, shown),
              );
              g.group({ x, y, rotate, scale }, (g) => {
                g.rect(card, { fill: CARD, opacity: shown });
                g.text(title, { fill: ink, x: titleX, y: titleY, opacity: shown });
                if (tape) {
                  g.group({ rotate: tapeRotate, originX: 0, originY: card.y }, (g) =>
                    g.path(tape, { fill: withAlpha(TAPE, 0.62), opacity: shown }),
                  );
                }
              });
              if (titleBounds) g.editable('title', titleBounds);
            });
          }
        }
      },
    };
  },
});
