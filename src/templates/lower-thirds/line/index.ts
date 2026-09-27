/**
 * Line — minimal accent bar (docs/templates/02-lower-thirds.md §2.1).
 *
 * The expensive detail: the bar is a slot. Name and title slide out of it — clipped at the
 * bar's edge and to its opening while it grows, so they emerge from it rather than fading in —
 * and slide back into it on the exit. The bar runs from the name's cap height to the title's
 * baseline (the optical text block, not the em boxes).
 */

import {
  CLEAN_END,
  c,
  type Draw,
  defineTemplate,
  type FormatId,
  type Rect,
  type TextBlock,
  unionRect,
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

/** Name size in u at size M, per format (vertical feeds are watched on phones: larger). */
const NAME_SIZE: Record<FormatId, number> = { '16:9': 4.2, '9:16': 5.2, '1:1': 4.6, '4:5': 4.8 };

/** Share of the layout area's width the lockup may use. */
const MEASURE: Record<FormatId, number> = { '16:9': 0.56, '9:16': 1, '1:1': 0.86, '4:5': 0.9 };

const SIZES = { s: 0.82, m: 1, l: 1.22 } as const;

function placement(anchor: Anchor): {
  v: 'top' | 'middle' | 'bottom';
  h: 'left' | 'center' | 'right';
} {
  if (anchor === 'center') return { v: 'middle', h: 'center' };
  const [v, h] = anchor.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right'];
  return { v, h };
}

export default defineTemplate({
  id: 'line',
  version: 1,
  meta: {
    name: 'Line',
    tagline: 'Minimal accent bar',
    category: 'lower-thirds',
    tags: ['lower third', 'name', 'interview', 'minimal'],
    useCases: ['Interviews', 'Webinars', 'Corporate video', 'Talking heads'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 3, max: 20 },
  alpha: 'default',
  poster: 2.5,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'mono-dark' },
    { kind: 'library', id: 'mono-light' },
  ],
  pairings: ['grotesk', 'editorial', 'technical', 'classic'],
  controls: {
    name: c.text({ label: 'Name', default: 'Aiko Tanaka', maxLength: 40, primary: true }),
    title: c.text({
      label: 'Title',
      default: 'Creative Director, Halden',
      maxLength: 60,
      optional: true,
    }),
    shadow: c.toggle({ label: 'Shadow', default: false, hint: 'A soft shadow for busy footage' }),
    size: c.choice({
      label: 'Size',
      default: 'm',
      options: [
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
        { value: 'l', label: 'L' },
      ],
    }),
    anchor: c.choice({
      label: 'Anchor',
      group: 'layout',
      default: 'bottom-left',
      options: ANCHORS,
      display: 'select',
    }),
  },
  looks: [
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    {
      // White type on footage, the bar in the brand color.
      id: 'brand-bold',
      name: 'Brand Bold',
      palette: { kind: 'brand', color: '#5A2BE8', variant: 'dark' },
      pairing: 'grotesk',
    },
  ],
  timing: ({ props }) => ({
    in: 0.85,
    out: 0.5,
    tail: CLEAN_END,
    readable: `${props.name} ${props.title}`,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text } = ctx;
    const { u } = frame;
    const { bg, fg, accent } = palette.roles;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const { v, h } = placement(props.anchor);
    const mirrored = h === 'right';
    const k = SIZES[props.size];

    // --- type ---------------------------------------------------------------------------
    const nameSize = NAME_SIZE[frame.format] * u * k;
    const titleSize = Math.max(2.4 * u, nameSize * 0.64);
    const barW = 0.5 * u * k;
    const gap = 1.2 * u * k;
    const measure = area.w * MEASURE[frame.format] - barW - gap;
    const align = mirrored ? 'right' : 'left';

    const display = pairing.display;
    const layoutName = (maxLines: number, size: number) =>
      text.layout(props.name.trim() || ' ', {
        style: {
          font: display.font,
          italicFont: display.italic,
          size,
          weight: 650,
          width: display.width,
          tracking: display.tracking * 0.25,
          features: display.features,
        },
        maxWidth: measure,
        maxLines,
        lineHeight: 1.08,
        align,
        fit: { minSize: nameSize * 0.72 },
      });
    // One line, shrinking a little; only very long names wrap to a second line.
    let name = layoutName(1, nameSize);
    if (name.overflow) name = layoutName(2, nameSize * 0.85);

    const titleText = props.title.trim();
    const title: TextBlock | null = titleText
      ? text.layout(titleText, {
          style: {
            font: pairing.text.font,
            size: titleSize,
            weight: 400,
            width: pairing.text.width,
            tracking: pairing.text.tracking,
            features: pairing.text.features,
          },
          maxWidth: measure,
          maxLines: 2,
          lineHeight: 1.22,
          align,
          fit: { minSize: 2.4 * u },
        })
      : null;

    // --- lockup (local: y = 0 is the name's cap height) ---------------------------------
    // Name baseline → title cap height: about the title's own line gap.
    const titleY = title ? name.height + title.size * 0.78 : 0;
    const barH = title ? titleY + title.height : name.height;
    const textW = Math.max(name.width, title?.width ?? 0);
    const lockupW = barW + gap + textW;

    const lockupX =
      h === 'left'
        ? area.x
        : h === 'right'
          ? area.x + area.w - lockupW
          : area.x + (area.w - lockupW) / 2;
    // Descenders hang below the bar: keep room for them at the bottom of the safe area.
    const below = 0.28 * (title ?? name).size;
    const top =
      v === 'top'
        ? area.y + 2 * u
        : v === 'bottom'
          ? area.y + area.h - 2 * u - below - barH
          : area.y + (area.h - barH) / 2;

    const bar: Rect = {
      x: mirrored ? lockupX + lockupW - barW : lockupX,
      y: top,
      w: barW,
      h: barH,
    };
    // Text column: left edge (or right edge when mirrored) and the slot edge it emerges from.
    const edge = mirrored ? bar.x : bar.x + barW;
    const textX = mirrored ? edge - gap - measure : edge + gap;
    const nameY = top;
    const titleTop = top + titleY;

    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const nameBounds = shift(name.ink, textX, nameY);
    const titleBounds = title ? shift(title.ink, textX, titleTop) : null;
    const lockup = titleBounds
      ? unionRect(unionRect(bar, nameBounds), titleBounds)
      : unionRect(bar, nameBounds);

    // Everything the lockup ever shows (text is clipped to the slot, so it stays inside).
    const lockupArea: Rect = {
      x: lockup.x - u,
      y: lockup.y - u,
      w: lockup.w + 2 * u,
      h: lockup.h + 2 * u,
    };

    // The slot's opening: the bar's span plus room for ascenders and descenders.
    const slotTop = top - 0.35 * name.size;
    const slotBottom = top + barH + below * 1.4;
    const slotCenter = (slotTop + slotBottom) / 2;
    const reach = frame.width + frame.height;

    // Travel: far enough that the text starts fully inside the slot.
    const hidden = (block: TextBlock) => {
      const ink = mirrored ? measure - block.ink.x : block.ink.x + block.ink.w;
      return gap + ink + u;
    };
    const nameTravel = hidden(name);
    const titleTravel = title ? hidden(title) : 0;
    const dir = mirrored ? 1 : -1;
    const barCurve = energy.overshoot === 2 ? 'pop' : 'snap';

    const shadow = props.shadow
      ? { color: bg, blur: 1.1, opacity: palette.dark ? 0.75 : 0.85, y: 0.15 }
      : undefined;

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        const grown = tl.p(t, 'in', { dur: 0.35 }, barCurve);
        const collapsed = tl.p(t, 'out', { delay: 0.3, dur: 0.2 }, 'exit');
        const open = grown * (1 - collapsed);
        if (open <= 0) return;

        const nameOut = tl.p(t, 'out', { delay: 0.05, dur: 0.3 }, 'exit');
        const nameIn = tl.p(t, 'in', { delay: 0.15, dur: 0.6 }, energy.enter);
        const titleOut = tl.p(t, 'out', { dur: 0.3 }, 'exit');
        const titleIn = tl.p(t, 'in', { delay: 0.28, dur: 0.57 }, energy.enter);

        const lockupDraw = (g: Draw) => {
          const barHeight = barH * open;
          g.rect(
            { x: bar.x, y: bar.y + (barH - barHeight) / 2, w: barW, h: barHeight },
            { fill: accent },
          );
          // Text lives beyond the slot edge, inside the slot's current opening.
          const openH = (slotBottom - slotTop) * open;
          const slot: Rect = {
            x: mirrored ? edge - reach : edge,
            y: slotCenter - openH / 2,
            w: reach,
            h: openH,
          };
          g.clip(slot, (g) => {
            const nameX = textX + dir * nameTravel * (1 - nameIn + nameOut);
            if (nameIn > 0 && nameOut < 1) g.text(name, { fill: fg, x: nameX, y: nameY });
            if (title && titleIn > 0 && titleOut < 1) {
              const titleX = textX + dir * titleTravel * (1 - titleIn + titleOut);
              g.text(title, { fill: fg, x: titleX, y: titleTop, opacity: 0.8 });
            }
          });
        };

        g.movable('lockup', lockup, (g) => {
          if (shadow) g.fx({ shadow, bounds: lockupArea }, lockupDraw);
          else lockupDraw(g);
          g.editable('name', nameBounds);
          if (titleBounds) g.editable('title', titleBounds);
        });
      },
    };
  },
});
