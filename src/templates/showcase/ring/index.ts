/**
 * Ring — 3D carousel (docs/templates/05-showcase.md §5.3).
 *
 * The expensive detail: the cards are real 3D planes (the engine's `space` module), textured
 * perspective-correct and depth sorted every frame. Back faces are handled as faces of their own:
 * a card turned away shows its reverse — the print seen through thin stock, mirrored and veiled —
 * never its front. Depth of field by z: the front card is sharp, and the ring dims and softens
 * with distance (the far side shares one blur layer). Captions swap in lockstep with the turn:
 * the old one leaves as the card starts to move and the new one lands with its card.
 *
 * Loop on (default): one revolution per loop, so the last frame meets the first. Loop off: the
 * cards fly in from depth, and the ring spins away at the end.
 *
 * Images: ten image slots and a Cards count (3–10); captions are one per line, in card order.
 */

import {
  Camera,
  CLEAN_END,
  c,
  type DepthCue,
  type Draw,
  defineTemplate,
  drawPlanes,
  type EaseName,
  type FormatId,
  fract,
  mixOklab,
  type Plane,
  type Rect,
  resolveEase,
  springProgress,
  type TextBlock,
  type TextLine,
  Transform3D,
} from '@/engine';

const IMAGE_KEYS = [
  'image1',
  'image2',
  'image3',
  'image4',
  'image5',
  'image6',
  'image7',
  'image8',
  'image9',
  'image10',
] as const;

const image = (n: number) =>
  c.image({
    label: `Image ${n}`,
    accept: 'artwork',
    default: { kind: 'placeholder', id: `artwork-${((n - 1) % 8) + 1}` },
    ...(n > 8 ? { advanced: true } : {}),
  });

type Composition = {
  /** Height of a portrait card in u (other shapes keep its area). */
  card: number;
  /** Widest a card may be (share of the layout area's width). */
  maxWidth: number;
  /** Where the front card's center sits (share of the layout area's height). */
  center: number;
  /** How far the camera looks down on the ring (degrees). */
  elevation: number;
  /** Ring circumference per card, in card widths. */
  spacing: number;
  /** Caption and title sizes in u. */
  caption: number;
  title: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': {
    card: 45,
    maxWidth: 0.42,
    center: 0.6,
    elevation: 15,
    spacing: 1.5,
    caption: 3.2,
    title: 4.4,
  },
  '1:1': {
    card: 43,
    maxWidth: 0.62,
    center: 0.6,
    elevation: 14,
    spacing: 1.4,
    caption: 3.4,
    title: 4.6,
  },
  '4:5': {
    card: 48,
    maxWidth: 0.66,
    center: 0.6,
    elevation: 13,
    spacing: 1.35,
    caption: 3.6,
    title: 4.8,
  },
  '9:16': {
    card: 60,
    maxWidth: 0.78,
    center: 0.58,
    elevation: 12,
    spacing: 1.3,
    caption: 4,
    title: 5.2,
  },
};

/** Card proportions (width / height). */
const SHAPES = { portrait: 0.8, square: 1, landscape: 1.5 } as const;

type EnergyKey = 'calm' | 'balanced' | 'punchy';

/**
 * Per energy: the turn (Balanced seconds at Speed 1) and its curve — Calm eases softly, Punchy
 * lands on a spring with a little overshoot — and how captions change (Calm crossfades with a
 * short rise, the others slide through their mask).
 */
const CHARACTER: Record<
  EnergyKey,
  { turn: number; ease: EaseName | 'spring'; slide: number; float: number }
> = {
  calm: { turn: 0.95, ease: 'drift', slide: 0.35, float: 0.3 },
  balanced: { turn: 0.7, ease: 'snap', slide: 1.05, float: 0.35 },
  punchy: { turn: 0.5, ease: 'spring', slide: 1.05, float: 0.45 },
};

const CAPTIONS = [
  '01 — Form',
  '02 — Light',
  '03 — Rhythm',
  '04 — Color',
  '05 — Space',
  '06 — Motion',
  '07 — Balance',
  '08 — Texture',
];

type Card = {
  readonly key: (typeof IMAGE_KEYS)[number];
  readonly plane: Plane & { transform: Transform3D };
  /** Angle on the ring (degrees) at rotation 0. */
  readonly angle: number;
  readonly caption: TextLine | null;
};

export default defineTemplate({
  id: 'ring',
  version: 1,
  meta: {
    name: 'Ring',
    tagline: '3D carousel',
    category: 'showcase',
    tags: ['carousel', '3d', 'collection', 'lookbook', 'gallery', 'loop'],
    useCases: ['Collections', 'Lookbooks', 'Team photos', 'Product ranges', 'Event recaps'],
  },
  formats: ['16:9', '1:1', '4:5', '9:16'],
  structure: 'loop',
  duration: { default: 8, min: 5, max: 20 },
  alpha: 'optional',
  poster: 5,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'sand' },
  ],
  pairings: ['grotesk', 'editorial', 'studio', 'wide', 'technical'],
  controls: {
    image1: image(1),
    image2: image(2),
    image3: image(3),
    image4: image(4),
    image5: image(5),
    image6: image(6),
    image7: image(7),
    image8: image(8),
    image9: image(9),
    image10: image(10),
    cards: c.number({ label: 'Cards', group: 'content', default: 8, min: 3, max: 10, step: 1 }),
    captions: c.text({
      label: 'Captions',
      default: CAPTIONS.join('\n'),
      multiline: true,
      maxLines: 10,
      maxLength: 240,
      optional: true,
      hint: 'One per line, in card order',
    }),
    title: c.text({
      label: 'Title',
      default: 'Studies in form',
      maxLength: 40,
      optional: true,
      primary: true,
    }),
    shape: c.choice({
      label: 'Card shape',
      default: 'portrait',
      options: [
        { value: 'portrait', label: 'Portrait' },
        { value: 'square', label: 'Square' },
        { value: 'landscape', label: 'Landscape' },
      ],
    }),
    depthBlur: c.toggle({ label: 'Depth blur', default: true }),
    radius: c.number({
      label: 'Ring radius',
      group: 'style',
      default: 1,
      min: 0.8,
      max: 1.5,
      step: 0.05,
      unit: '×',
    }),
    mode: c.choice({
      label: 'Mode',
      group: 'motion',
      default: 'step',
      options: [
        { value: 'step', label: 'Step' },
        { value: 'continuous', label: 'Continuous' },
      ],
    }),
    speed: c.number({ label: 'Speed', default: 1, min: 0.5, max: 2, step: 0.25, unit: '×' }),
    loop: c.toggle({
      label: 'Loop',
      group: 'motion',
      default: true,
      hint: 'Off: the cards fly in, and the ring spins away at the end',
    }),
  },
  looks: [
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    {
      id: 'paper',
      name: 'Paper',
      palette: { kind: 'library', id: 'paper' },
      pairing: 'editorial',
    },
    { id: 'lilac', name: 'Lilac', palette: { kind: 'library', id: 'lilac' }, pairing: 'studio' },
  ],
  timing: ({ props }) =>
    props.loop ? { in: 0, out: 0 } : { in: 1.3, out: 0.8, tail: CLEAN_END, readable: props.title },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, surface } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const count = Math.round(props.cards);
    const loop = props.loop;
    const duration = timeline.duration;
    const character = CHARACTER[energy.id];
    const transparent = ctx.transparent;

    // --- the ring ------------------------------------------------------------------------------
    const aspect = SHAPES[props.shape];
    // Every shape has the portrait card's area, within the format's width.
    const cardArea = (comp.card * u) ** 2 * SHAPES.portrait;
    const cardW = Math.min(Math.sqrt(cardArea * aspect), area.w * comp.maxWidth);
    const cardH = cardW / aspect;
    const rect: Rect = { x: -cardW / 2, y: -cardH / 2, w: cardW, h: cardH };
    const step = 360 / count;
    // Circumference from the cards and their gaps; never so small that the ring looks flat.
    const radius =
      Math.max((count * cardW * comp.spacing) / (2 * Math.PI), cardW * 1.1) * props.radius;

    // A level camera with its eye above the ring — verticals stay vertical and the ring opens
    // into an ellipse, like a shift lens.
    const centerX = frame.cx;
    const centerY = area.y + area.h * comp.center;
    const perspective = radius * 2.4 + cardH;
    const eyeAt = (degrees: number) => Math.tan((degrees * Math.PI) / 180) * (perspective + radius);

    // Card backs: the print seen through thin stock.
    const stock = mixOklab(surface, fg, palette.dark ? 0.1 : 0.04);
    const captionLines = props.captions.split('\n');
    const display = pairing.display;
    const captionWidth = Math.min(area.w, Math.max(cardW * 1.6, 40 * u));
    const cards: Card[] = IMAGE_KEYS.slice(0, count).map((key, i) => {
      const graphic = ctx.graphic(key);
      const focal = ctx.focal(key);
      const label = (captionLines[i] ?? '').trim();
      const caption = label
        ? (text.layout(label, {
            style: {
              font: display.font,
              italicFont: display.italic,
              size: comp.caption * u,
              weight: display.weight,
              width: display.width,
              tracking: Math.max(-0.01, display.tracking * 0.5),
              features: display.features,
            },
            maxWidth: captionWidth,
            maxLines: 1,
            lineHeight: 1.1,
            align: 'center',
            fit: { minSize: 2.4 * u },
          }).lines[0] ?? null)
        : null;
      return {
        key,
        angle: i * step,
        caption,
        plane: {
          rect,
          radius: 0.5 * u,
          transform: new Transform3D(),
          front: { graphic, focal, fill: surface },
          back: {
            graphic,
            focal,
            fill: surface,
            through: true,
            veil: { color: stock, amount: 0.3 },
          },
        },
      };
    });

    // Depth of field: sharp at the front card's depth, soft and dim at the far side. Without a
    // background (alpha), distance fades cards instead of dimming them toward the page.
    const near = perspective;
    const far = perspective + 2 * radius;
    const dimFar = palette.dark ? 0.5 : 0.45;
    const cue: DepthCue = {
      near,
      far,
      dim: transparent ? 0 : dimFar,
      blur: props.depthBlur ? 1.6 * energy.blur : 0,
      color: bg,
    };
    const depthOf = (p: { depth: number }) =>
      Math.min(1, Math.max(0, (p.depth - near) / (far - near)));

    // --- motion -------------------------------------------------------------------------------
    const holdStart = timeline.sections.hold.start;
    const continuous = props.mode === 'continuous';
    // Loop: a step per card, one revolution per loop. Off: steps at the spec's pace.
    const period = loop ? duration / count : 1.6 / props.speed;
    const turnDur = Math.min(character.turn / props.speed, period * 0.72);
    const h = turnDur / period;
    const curve = character.ease === 'spring' ? null : resolveEase(character.ease);
    // Continuous: whole revolutions per loop (a card a second at Speed 1 with eight cards).
    const revolutions = Math.max(1, Math.round((props.speed * duration) / 8));
    const rate = loop ? (revolutions * count) / duration : (count * props.speed) / 8;
    // Hold micro-motion: a slow float whose period divides the loop.
    const floatPeriod = loop ? duration / Math.max(1, Math.round(duration / 3.2)) : 3.2;

    /** Steps travelled at `t` (card k faces front after k steps) and how far into a turn. */
    const motion = { steps: 0, turn: 0 };
    const schedule = (t: number) => {
      if (continuous) {
        motion.steps = loop
          ? fract(t / duration) * revolutions * count
          : Math.max(0, t - holdStart) * rate;
        motion.turn = -1;
        return motion;
      }
      // Looping, pauses are centered on whole steps (frame 0 rests on card 1); otherwise the
      // ring rests a full pause after landing before its first turn.
      const x = loop ? t / period : Math.max(0, t - holdStart) / period - 1 + h;
      const k = Math.floor(x);
      const f = x - k;
      const start = loop ? 0.5 - h / 2 : 0;
      const q = (f - start) / h;
      let eased = 0;
      if (q > 0) {
        eased = curve
          ? curve(Math.min(1, q))
          : springProgress((f - start) * period * 1.15, 'lively');
      }
      motion.steps = loop ? (k + eased) % count : Math.max(0, k + eased);
      motion.turn = q <= 0 ? 0 : Math.min(1, q);
      return motion;
    };

    // Fly-in (Loop off): the front card first, from far behind, on the energy's spring.
    const flyGap = ctx.stagger(0.06);
    const flyDepth = radius * 2.6;

    // --- type -----------------------------------------------------------------------------------
    const titleText = props.title.trim();
    const titleWidth = area.w * 0.86;
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
          maxWidth: titleWidth,
          maxLines: 1,
          lineHeight: display.lineHeight,
          align: 'center',
          fit: { minSize: 2.8 * u },
        })
      : null;
    const titleX = centerX - titleWidth / 2;
    const titleY = area.y + (title ? title.size * 0.1 : 0);
    const titleBounds = title
      ? { x: titleX + title.ink.x, y: titleY + title.ink.y, w: title.ink.w, h: title.ink.h }
      : null;
    const captionX = centerX - captionWidth / 2;
    const captionTop = centerY + cardH / 2 + 3 * u;

    /** A caption through its mask: `shown` 0..1, entering from below (+1) or leaving up (−1). */
    const drawCaption = (
      g: Draw,
      line: TextLine | null | undefined,
      shown: number,
      dir: number,
    ) => {
      if (!line || shown <= 0) return;
      const mask = {
        x: captionX + line.mask.x,
        y: captionTop + line.mask.y,
        w: line.mask.w,
        h: line.mask.h,
      };
      const travel = (1 - shown) * mask.h * character.slide * dir;
      const opacity = energy.id === 'calm' ? shown : 1;
      g.clip(mask, (g) => g.text(line, { fill: fg, x: captionX, y: captionTop + travel, opacity }));
    };
    const leave = resolveEase('exit');
    const arrive = resolveEase(energy.id === 'calm' ? 'drift' : 'glide');

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        const { steps, turn } = schedule(t);
        // Leaving (Loop off): the ring speeds up and fades.
        const away = loop ? 0 : tl.p(t, 'out', {}, 'exit');
        const spin = steps + away * count * 0.55;
        const fade = 1 - away;
        const phase = (2 * Math.PI * t) / floatPeriod;
        const bob = Math.sin(phase) * character.float * u;
        const camera = new Camera({
          perspective,
          x: centerX,
          y: centerY - eyeAt(comp.elevation + 0.6 * Math.sin(phase + 1.1)),
        });

        for (let i = 0; i < cards.length; i++) {
          const card = cards[i] as Card;
          const plane = card.plane;
          let depthIn = 0;
          let turnIn = 0;
          let opacity = fade;
          if (!loop) {
            const local = t - tl.at('in', 0.05 + i * flyGap);
            const p = local > 0 ? springProgress(local * 0.55, energy.spring) : 0;
            depthIn = (1 - p) * flyDepth;
            turnIn = (1 - p) * 38;
            opacity *= Math.min(1, Math.max(0, local) / 0.3);
          }
          plane.opacity = opacity;
          plane.transform
            .reset()
            .translate(centerX, centerY + bob, -radius - depthIn)
            .rotateY(card.angle - spin * step + turnIn)
            .translate(0, 0, radius);
        }
        if (transparent) {
          // No page to dim toward: fade with distance (per card, so no shared layer).
          for (const card of cards) {
            const depth = camera.depthOf(card.plane.transform.applyXYZ(0, 0, 0));
            card.plane.opacity = (card.plane.opacity ?? 1) * (1 - dimFar * depthOf({ depth }));
          }
        }
        const drawn = drawPlanes(
          g,
          camera,
          cards.map((card) => card.plane),
          {
            depthCue: cue,
            // The far side of the ring shares one depth-of-field layer.
            group: transparent ? undefined : (plane) => (plane.facing === 'back' ? 'far' : null),
          },
        );
        for (const plane of drawn) {
          const card = cards[plane.index];
          if (card && plane.facing === 'front') g.editable(card.key, plane.bounds);
        }

        // Captions: the front card's, swapped in lockstep with the ring.
        const captionsIn = loop ? 1 : tl.p(t, 'in', { delay: 0.75, dur: 0.6 }, energy.enter);
        const captionsOut = loop ? 0 : tl.p(t, 'out', { dur: 0.35 }, 'exit');
        const shown = captionsIn * (1 - captionsOut);
        if (shown > 0) {
          const base = Math.floor(steps);
          const from = cards[base % count];
          const to = cards[(base + 1) % count];
          if (continuous) {
            // The frontmost card changes at the half step.
            const within = steps - base;
            if (within < 0.5)
              drawCaption(g, from?.caption, shown * Math.min(1, (0.5 - within) / 0.2), -1);
            else drawCaption(g, to?.caption, shown * Math.min(1, (within - 0.5) / 0.2), 1);
          } else if (turn > 0 && turn < 1) {
            // Out as the turn starts; in so that it lands with the card.
            drawCaption(g, from?.caption, shown * (1 - leave(Math.min(1, turn / 0.4))), -1);
            drawCaption(g, to?.caption, shown * arrive(Math.max(0, (turn - 0.4) / 0.6)), 1);
          } else {
            drawCaption(g, cards[Math.round(steps) % count]?.caption, shown, 1);
          }
          const front = cards[Math.round(steps) % count]?.caption;
          if (front) {
            g.editable('captions', {
              x: captionX + front.ink.x,
              y: captionTop + front.ink.y,
              w: front.ink.w,
              h: front.ink.h,
            });
          }
        }

        // Title: static while looping; revealed through its mask otherwise.
        if (title && titleBounds) {
          const revealed = loop ? 1 : tl.p(t, 'in', { delay: 0.45, dur: 0.7 }, energy.enter);
          const gone = loop ? 0 : tl.p(t, 'out', { dur: 0.35 }, 'exit');
          if (revealed > 0 && gone < 1) {
            g.movable('title', titleBounds, (g) => {
              for (const line of title.lines) {
                const mask = {
                  x: titleX + line.mask.x,
                  y: titleY + line.mask.y,
                  w: line.mask.w,
                  h: line.mask.h,
                };
                const y = titleY + (1 - revealed - gone) * mask.h * 1.05;
                g.clip(mask, (g) => g.text(line, { fill: fg, x: titleX, y }));
              }
              g.editable('title', titleBounds);
            });
          }
        }
      },
    };
  },
});
