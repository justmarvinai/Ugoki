/**
 * Capsule — creator pill (docs/templates/02-lower-thirds.md §2.3).
 *
 * The expensive detail: the pill grows on a spring, and everything inside it is masked by the
 * pill's own shape, so the overshoot never exposes overflow; the name and handle emerge from
 * behind the avatar. The follow button is tactile: it presses (with a one-frame darken), its
 * label crossfades, and a check mark draws on along its path.
 */

import {
  adjustLightness,
  bestContrast,
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  ensureContrast,
  type FormatId,
  initials,
  type PathData,
  type Rect,
  rgb,
  springProgress,
  type TextBlock,
} from '@/engine';

const ANCHORS = [
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'middle-left', label: 'Middle left' },
  { value: 'center', label: 'Center' },
  { value: 'middle-right', label: 'Middle right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
] as const;

type Anchor = (typeof ANCHORS)[number]['value'];

/** Pill height in u at size M, per format (vertical feeds are watched on phones: larger). */
const PILL: Record<FormatId, number> = { '16:9': 8.8, '9:16': 11, '1:1': 9.6, '4:5': 10 };
const SIZES = { s: 0.82, m: 1, l: 1.2 } as const;

const WHITE: Color = rgb(1, 1, 1);
const SHADOW: Color = rgb(0.02, 0.02, 0.04);

function placement(anchor: Anchor): {
  v: 'top' | 'middle' | 'bottom';
  h: 'left' | 'center' | 'right';
} {
  if (anchor === 'center') return { v: 'middle', h: 'center' };
  const [v, h] = anchor.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right'];
  return { v, h };
}

const inkRight = (block: TextBlock) => block.ink.x + block.ink.w;

export default defineTemplate({
  id: 'capsule',
  version: 1,
  meta: {
    name: 'Capsule',
    tagline: 'Creator pill',
    category: 'lower-thirds',
    tags: ['lower third', 'name', 'creator', 'social', 'follow'],
    useCases: ['YouTubers', 'Podcasters', 'Streamers', 'Guest intros'],
  },
  formats: ['9:16', '16:9', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 3, max: 20 },
  alpha: 'default',
  poster: 3,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'mono-light' },
  ],
  pairings: ['grotesk', 'wide', 'soft', 'quirky', 'technical'],
  controls: {
    name: c.text({ label: 'Name', default: 'Maya Chen', maxLength: 32, primary: true }),
    handle: c.text({ label: 'Handle', default: '@mayamakes', maxLength: 32, optional: true }),
    avatar: c.image({
      label: 'Avatar',
      accept: 'portrait',
      default: { kind: 'placeholder', id: 'portrait-1' },
      optional: true,
      hint: 'Empty it for initials',
    }),
    cta: c.toggle({ label: 'Follow button', default: true }),
    ctaLabel: c.text({ label: 'Button', default: 'Follow', maxLength: 14 }),
    ctaDone: c.text({ label: 'After the tap', default: 'Following', maxLength: 16 }),
    size: c.choice({
      label: 'Size',
      default: 'm',
      options: [
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
        { value: 'l', label: 'L' },
      ],
    }),
    shadow: c.toggle({ label: 'Shadow', default: true, hint: 'A soft shadow for busy footage' }),
    float: c.toggle({ label: 'Float', group: 'motion', default: true }),
    anchor: c.choice({
      label: 'Anchor',
      group: 'layout',
      default: 'bottom-left',
      options: ANCHORS,
      display: 'select',
    }),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    { id: 'candy', name: 'Candy', palette: { kind: 'library', id: 'candy' }, pairing: 'wide' },
  ],
  timing: ({ props }) => ({
    in: 0.9,
    out: 0.5,
    tail: CLEAN_END,
    readable: `${props.name} ${props.handle}`,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent, surface } = palette.roles;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const { v, h } = placement(props.anchor);
    const H = PILL[frame.format] * u * SIZES[props.size];
    const avatar = ctx.graphic('avatar');

    // --- colors ------------------------------------------------------------------------------
    // Over footage the pill is the palette's own paper (white on Paper); on a baked background
    // it's the surface, so it stays visible against the frame.
    const pill = ctx.transparent ? bg : surface;
    const nameInk = ensureContrast(fg, pill, 7);
    const handleInk = ensureContrast(muted, pill, 4.5);
    const chip = ensureContrast(accent, pill, 3);
    const chipInk = ensureContrast(bestContrast(chip, [WHITE, fg, bg]), chip, 4.5);
    const pressed = adjustLightness(chip, -0.12);

    // --- type --------------------------------------------------------------------------------
    const display = pairing.display;
    const inset = H * 0.1;
    const D = H - 2 * inset;
    const gapText = H * 0.17;
    const nameSize = H * 0.29;
    const handleSize = H * 0.215;
    const ctaOn = props.cta && props.ctaLabel.trim() !== '';
    const chipH = H * 0.5;
    const chipPad = chipH * 0.62;
    const labelSize = H * 0.19;
    const labelStyle = {
      font: pairing.text.font,
      size: labelSize,
      weight: 600,
      width: pairing.text.width,
      tracking: 0.01,
      features: pairing.text.features,
    };
    const label = ctaOn ? text.line(props.ctaLabel.trim(), labelStyle) : null;
    const done = ctaOn
      ? text.line(props.ctaDone.trim() || props.ctaLabel.trim(), labelStyle)
      : null;
    const checkW = labelSize * 0.72;
    const checkGap = labelSize * 0.42;
    const chipW =
      label && done
        ? Math.max(inkRight(label), checkW + checkGap + inkRight(done)) + 2 * chipPad
        : 0;
    const chipGap = ctaOn ? H * 0.34 : 0;
    // The pill's end: the button sits concentric with the end cap; without it, half a cap.
    const endPad = ctaOn ? (H - chipH) / 2 : H * 0.42;

    // Text column: as wide as the layout area allows.
    const textMax = area.w - (inset + D + gapText) - chipGap - chipW - endPad;
    const name = text.layout(props.name.trim() || ' ', {
      style: {
        font: display.font,
        italicFont: display.italic,
        size: nameSize,
        weight: Math.min(display.weight, 700),
        width: display.width,
        tracking: display.tracking * 0.4,
        features: display.features,
      },
      maxWidth: textMax,
      maxLines: 1,
      lineHeight: 1.1,
      align: 'left',
      fit: { minSize: nameSize * 0.66 },
    });
    const handleText = props.handle.trim();
    const handle: TextBlock | null = handleText
      ? text.layout(handleText, {
          style: {
            font: pairing.text.font,
            size: handleSize,
            weight: 450,
            width: pairing.text.width,
            tracking: 0.005,
            features: pairing.text.features,
          },
          maxWidth: textMax,
          maxLines: 1,
          lineHeight: 1.2,
          align: 'left',
          fit: { minSize: Math.min(handleSize, Math.max(2.4 * u, handleSize * 0.7)) },
        })
      : null;

    // --- geometry ----------------------------------------------------------------------------
    const textW = Math.max(inkRight(name), handle ? inkRight(handle) : 0);
    const W = inset + D + gapText + textW + chipGap + chipW + endPad;
    const left =
      h === 'left' ? area.x : h === 'right' ? area.x + area.w - W : area.x + (area.w - W) / 2;
    const top =
      v === 'top'
        ? area.y + 1.5 * u
        : v === 'bottom'
          ? area.y + area.h - 1.5 * u - H
          : area.y + (area.h - H) / 2;
    const pillRect: Rect = { x: left, y: top, w: W, h: H };
    const cx = left + inset + D / 2;
    const cy = top + H / 2;
    const avatarRect: Rect = { x: cx - D / 2, y: cy - D / 2, w: D, h: D };
    const textX = left + inset + D + gapText;
    // Name and handle stacked, optically centered: name cap top → handle baseline.
    const lineGap = handle ? handleSize * 0.62 : 0;
    const stackH = name.height + (handle ? lineGap + handle.height : 0);
    const nameY = cy - stackH / 2;
    const handleY = nameY + name.height + lineGap;
    const chipRect: Rect = {
      x: left + W - endPad - chipW,
      y: cy - chipH / 2,
      w: chipW,
      h: chipH,
    };

    // Initials on an accent circle when the avatar slot is empty.
    const monogram = initials(props.name);
    const avatarInk = ensureContrast(bestContrast(accent, [WHITE, fg, bg]), accent, 4.5);
    const initialsBlock: TextBlock | null =
      !avatar && monogram
        ? text.line(monogram, {
            font: display.font,
            size: D * 0.38,
            weight: Math.min(display.weight, 700),
            width: display.width,
            tracking: 0.02,
            features: display.features,
          })
        : null;

    // Check mark (trim path), centered on its own box left of the "done" label.
    const labelX = (block: TextBlock, withCheck: boolean) => {
      const w = inkRight(block) + (withCheck ? checkW + checkGap : 0);
      return chipRect.x + (chipW - w) / 2 + (withCheck ? checkW + checkGap : 0) - block.ink.x;
    };
    const labelY = (block: TextBlock) => cy - block.capHeight / 2;
    const checkX = done ? labelX(done, true) + done.ink.x - checkGap - checkW : 0;
    const checkH = labelSize * 0.56;
    const checkY = cy - checkH / 2;
    const check: PathData = [
      ['M', checkX, checkY + checkH * 0.52],
      ['L', checkX + checkW * 0.36, checkY + checkH],
      ['L', checkX + checkW, checkY],
    ];

    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const nameBounds = shift(name.ink, textX, nameY);
    const handleBounds = handle ? shift(handle.ink, textX, handleY) : null;
    const labelBounds = label ? shift(label.ink, labelX(label, false), labelY(label)) : null;
    const doneBounds = done ? shift(done.ink, labelX(done, true), labelY(done)) : null;
    const lockup = pillRect;
    // Room for the shadow and the spring's overshoot.
    const shadowArea: Rect = {
      x: pillRect.x - 0.5 * H,
      y: pillRect.y - 0.3 * H,
      w: pillRect.w * 1.12 + H,
      h: pillRect.h + 0.8 * H,
    };

    // --- motion ------------------------------------------------------------------------------
    const pop = energy.overshoot === 0 ? 'glide' : 'pop';
    const growAt = timeline.at('in', 0.2);
    const hold = timeline.sections.hold;
    const holdLength = hold.end - hold.start;
    // The button arrives and gets tapped in the hold, compressed when the hold is short.
    const tapAt = Math.min(1.4, holdLength - 0.8);
    const chipAt = Math.min(0.5, tapAt - 0.55);
    const tapping = ctaOn && chipAt >= 0.05;
    const chipIn = tapping ? chipAt : 0.05;
    const travel = ctx.travel(3 * u);
    const follow = ctx.stagger(0.08);
    const floatAmp = props.float ? 0.3 * u : 0;
    const shadow = props.shadow
      ? { color: SHADOW, blur: H / u / 7, opacity: palette.dark ? 0.5 : 0.22, y: H / u / 18 }
      : undefined;

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        // Exit: text fades, the pill collapses into the avatar, the avatar scales out.
        const textGone = tl.p(t, 'out', { dur: 0.15 }, 'swift');
        const collapsed = tl.p(t, 'out', { delay: 0.1, dur: 0.25 }, 'exit');
        const avatarGone = tl.p(t, 'out', { delay: 0.3, dur: 0.2 }, 'exit');

        const popped = tl.p(t, 'in', { dur: 0.35 }, pop);
        if (popped <= 0 || avatarGone >= 1) return;

        // Pill width: a spring from the avatar's circle to the full width.
        const grown = t > growAt ? springProgress((t - growAt) / energy.time, energy.spring) : 0;
        const width = H + (W - H) * grown * (1 - collapsed);
        const body: Rect = { x: left, y: top, w: width, h: H };
        const float = floatAmp * (Math.cos((tl.local(t, 'hold') / 3) * Math.PI * 2) - 1);
        const y = t > hold.start ? float : 0;
        // Follow button: scales in during the hold, then gets tapped (its label crossfades).
        const shown =
          label && done ? tl.p(t, 'hold', { delay: chipIn, dur: 0.5 }, pop) * (1 - textGone) : 0;
        const swap =
          tapping && tl.local(t, 'hold') >= tapAt
            ? tl.p(t, 'hold', { delay: tapAt + 0.04, dur: 0.2 }, 'swift')
            : 0;

        const draw = (g: Draw) => {
          if (width > H * 1.001 || grown > 0) {
            g.roundRect(body, H / 2, { fill: pill });
            // Everything inside is masked by the pill's own shape.
            g.clip({ rect: body, radius: H / 2 }, (g) => {
              const opacity = 1 - textGone;
              if (opacity > 0) {
                g.clip({ x: cx, y: top, w: W, h: H }, (g) => {
                  const nameIn = tl.p(t, 'in', { delay: 0.45, dur: 0.45 }, 'glide');
                  const handleIn = tl.p(t, 'in', { delay: 0.45 + follow, dur: 0.45 }, 'glide');
                  if (nameIn > 0) {
                    g.text(name, {
                      fill: nameInk,
                      x: textX - travel * (1 - nameIn),
                      y: nameY,
                      opacity,
                    });
                  }
                  if (handle && handleIn > 0) {
                    g.text(handle, {
                      fill: handleInk,
                      x: textX - travel * (1 - handleIn),
                      y: handleY,
                      opacity,
                    });
                  }
                });
              }
              // Follow button: scales in, then a tap.
              if (label && done && shown > 0) {
                const local = tl.local(t, 'hold') - tapAt;
                const tapped = tapping && local >= 0;
                // The press: down to 94% in 60 ms, back up on a spring; one dark frame.
                const press = !tapped
                  ? 1
                  : local < 0.06
                    ? 1 - 0.06 * (local / 0.06)
                    : 0.94 + 0.06 * springProgress(local - 0.06, 'snappy');
                const dark = tapped && local < 0.05;
                const drawn = tapped
                  ? tl.p(t, 'hold', { delay: tapAt + 0.1, dur: 0.28 }, 'glide')
                  : 0;
                g.group(
                  {
                    scale: shown * press,
                    originX: chipRect.x + chipW / 2,
                    originY: cy,
                  },
                  (g) => {
                    g.roundRect(chipRect, chipH / 2, { fill: dark ? pressed : chip });
                    if (swap < 1) {
                      g.text(label, {
                        fill: chipInk,
                        x: labelX(label, false),
                        y: labelY(label),
                        opacity: 1 - swap,
                      });
                    }
                    if (swap > 0) {
                      g.text(done, {
                        fill: chipInk,
                        x: labelX(done, true),
                        y: labelY(done),
                        opacity: swap,
                      });
                    }
                    if (drawn > 0) {
                      g.path(check, {
                        stroke: {
                          color: chipInk,
                          width: labelSize * 0.14,
                          cap: 'round',
                          join: 'round',
                          trim: [0, drawn],
                        },
                      });
                    }
                  },
                );
              }
            });
          }

          // Avatar: pops in rotating from −12°, scales out last.
          const scale = popped * (1 - avatarGone);
          if (scale > 0) {
            g.group(
              { scale, rotate: -12 * (1 - Math.min(1, popped)), originX: cx, originY: cy },
              (g) => {
                if (avatar) {
                  g.clip({ rect: avatarRect, radius: D / 2 }, (g) =>
                    g.graphic(avatar, avatarRect, { fit: 'cover', focal: ctx.focal('avatar') }),
                  );
                } else {
                  g.circle(cx, cy, D / 2, { fill: accent });
                  if (initialsBlock) {
                    const line = initialsBlock.lines[0];
                    const ink = initialsBlock.ink;
                    if (line) {
                      g.text(initialsBlock, {
                        fill: avatarInk,
                        x: cx - ink.x - ink.w / 2,
                        y: cy - initialsBlock.capHeight / 2,
                      });
                    }
                  }
                }
              },
            );
          }
        };

        g.movable('pill', lockup, (g) => {
          g.group({ y }, (g) => {
            if (shadow) g.fx({ shadow, bounds: shadowArea }, draw);
            else draw(g);
          });
          g.editable('name', nameBounds);
          if (handleBounds) g.editable('handle', handleBounds);
          if (shown > 0 && labelBounds && doneBounds) {
            g.editable(swap < 0.5 ? 'ctaLabel' : 'ctaDone', swap < 0.5 ? labelBounds : doneBounds);
          }
          g.editable('avatar', avatarRect);
        });
      },
    };
  },
});
