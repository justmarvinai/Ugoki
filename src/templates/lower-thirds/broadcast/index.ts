/**
 * Broadcast — news block (docs/templates/02-lower-thirds.md §2.2).
 *
 * The expensive detail: the blocks are built from the type. Each block's width is its measured
 * text (ink, not advance) plus one shared padding, both blocks share one grid (an edge and a
 * text column), and every line of text sits optically centered on its cap height — never on the
 * em box. Blocks wipe from their edge, text slides in inside their mask, and one light sweep
 * crosses the name block, masked to it.
 */

import {
  bestContrast,
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  ensureContrast,
  type FormatId,
  type Gradient,
  type Rect,
  rgb,
  type TextBlock,
  unionRect,
  withAlpha,
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

/** The grid unit per format (in u): vertical feeds are watched on phones, so a touch larger. */
const GRID: Record<FormatId, number> = { '16:9': 1, '9:16': 1.18, '1:1': 1.08, '4:5': 1.12 };
/** Share of the layout width the lockup may use. */
const MEASURE: Record<FormatId, number> = { '16:9': 0.62, '9:16': 1, '1:1': 0.92, '4:5': 0.94 };
/** Block width with Width: Fixed (in grid units). */
const FIXED: Record<FormatId, number> = { '16:9': 62, '9:16': 58, '1:1': 58, '4:5': 58 };
const SIZES = { s: 0.82, m: 1, l: 1.2 } as const;
/** Block heights in cap heights: the cap plus air above and below. */
const NAME_BLOCK = 2.05;
const TITLE_BLOCK = 2.45;
const TAG_BLOCK = 2.6;

const WHITE: Color = rgb(1, 1, 1);

function placement(anchor: Anchor): {
  v: 'top' | 'middle' | 'bottom';
  h: 'left' | 'center' | 'right';
} {
  if (anchor === 'center') return { v: 'middle', h: 'center' };
  const [v, h] = anchor.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right'];
  return { v, h };
}

/** "JORDAN ELLIS" → "Jordan Ellis" (hyphenated and apostrophized names too). */
function titleCase(text: string): string {
  return text
    .toLocaleLowerCase('en')
    .replace(
      /(^|[\s\-‐'’])(\p{L})/gu,
      (_, before: string, letter: string) => `${before}${letter.toLocaleUpperCase('en')}`,
    );
}

const inkRight = (block: TextBlock) => block.ink.x + block.ink.w;

export default defineTemplate({
  id: 'broadcast',
  version: 1,
  meta: {
    name: 'Broadcast',
    tagline: 'News block',
    category: 'lower-thirds',
    tags: ['lower third', 'name', 'news', 'live', 'sports'],
    useCases: ['News-style content', 'Event coverage', 'Live streams', 'Sports'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 3, max: 20 },
  alpha: 'default',
  poster: 2.9,
  palettes: [
    { kind: 'library', id: 'newsroom' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'mono-dark' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'swiss' },
  ],
  pairings: ['sport', 'poster', 'grotesk', 'technical'],
  controls: {
    name: c.text({ label: 'Name', default: 'JORDAN ELLIS', maxLength: 32, primary: true }),
    title: c.text({
      label: 'Title',
      default: 'Reporting live from Berlin',
      maxLength: 60,
      optional: true,
    }),
    tag: c.text({ label: 'Tag', default: 'LIVE', maxLength: 12, optional: true }),
    logo: c.image({
      label: 'Logo',
      accept: 'logo',
      default: { kind: 'placeholder', id: 'nova' },
      optional: true,
    }),
    case: c.choice({
      label: 'Case',
      default: 'upper',
      options: [
        { value: 'upper', label: 'Upper' },
        { value: 'title', label: 'Title' },
      ],
    }),
    size: c.choice({
      label: 'Size',
      default: 'm',
      options: [
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
        { value: 'l', label: 'L' },
      ],
    }),
    sweep: c.toggle({ label: 'Light sweep', default: true }),
    anchor: c.choice({
      label: 'Anchor',
      group: 'layout',
      default: 'bottom-left',
      options: ANCHORS,
      display: 'select',
    }),
    width: c.choice({
      label: 'Width',
      group: 'layout',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'fixed', label: 'Fixed' },
      ],
      hint: 'Fixed keeps every name in a show the same width',
    }),
  },
  looks: [
    {
      id: 'newsroom',
      name: 'Newsroom',
      palette: { kind: 'library', id: 'newsroom' },
      pairing: 'sport',
    },
    { id: 'cobalt', name: 'Cobalt', palette: { kind: 'library', id: 'cobalt' }, pairing: 'sport' },
    {
      id: 'mono-dark',
      name: 'Mono Dark',
      palette: { kind: 'library', id: 'mono-dark' },
      pairing: 'grotesk',
    },
  ],
  timing: ({ props }) => ({
    in: 0.9,
    out: 0.45,
    tail: CLEAN_END,
    readable: `${props.name} ${props.title}`,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, accent, surface } = palette.roles;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const { v, h } = placement(props.anchor);
    const mirrored = h === 'right';
    const k = u * GRID[frame.format] * SIZES[props.size];
    const logo = ctx.graphic('logo');

    // --- colors: roles, with contrast checked wherever text sits on a block ----------------
    const nameBlock = accent;
    const nameInk = ensureContrast(bestContrast(nameBlock, [fg, bg]), nameBlock, 4.5);
    const titleBlock = surface;
    const titleInk = ensureContrast(fg, titleBlock, 7);
    const tile = fg;
    const tileInk = ensureContrast(bg, tile, 4.5);
    const tagBlock = bg;
    const tagInk = ensureContrast(fg, tagBlock, 7);
    const dot = ensureContrast(accent, tagBlock, 3);

    // --- type --------------------------------------------------------------------------------
    const display = pairing.display;
    const padX = 2.4 * k;
    const nameSize = 5.4 * k;
    const titleSize = 2.9 * k;
    const upper = props.case === 'upper';
    const nameText = (upper ? props.name : titleCase(props.name)).trim() || ' ';
    const layoutName = (maxWidth: number, maxLines = 1, fit = 0.72) =>
      text.layout(nameText, {
        style: {
          font: display.font,
          italicFont: display.italic,
          size: nameSize,
          weight: display.weight,
          width: display.width,
          tracking: display.tracking + (upper ? 0.025 : 0),
          features: display.features,
          case: upper ? 'upper' : 'none',
        },
        maxWidth,
        maxLines,
        lineHeight: 0.98,
        align: 'left',
        fit: { minSize: nameSize * fit },
      });
    const titleText = props.title.trim();
    const titleStyle = {
      font: pairing.text.font,
      size: titleSize,
      weight: 500,
      width: pairing.text.width,
      tracking: pairing.text.tracking + 0.005,
      features: pairing.text.features,
    };
    // One line, shrinking a little; only then two.
    const layoutTitle = (maxWidth: number): TextBlock | null => {
      if (!titleText) return null;
      const options = { style: titleStyle, maxWidth, lineHeight: 1.25, align: 'left' as const };
      const one = text.layout(titleText, {
        ...options,
        maxLines: 1,
        fit: { minSize: titleSize * 0.84 },
      });
      if (!one.overflow) return one;
      return text.layout(titleText, {
        ...options,
        maxLines: 2,
        fit: { minSize: Math.max(2.4 * u, titleSize * 0.8) },
      });
    };

    // Heights come from cap heights at full size, so every name in a show gets the same
    // blocks, however much a long one has to shrink.
    const nameCap = layoutName(Number.POSITIVE_INFINITY).capHeight;
    const titleCap = titleText ? text.line('H', titleStyle).capHeight : 0;

    // Logo tile: spans both blocks; wide artwork gets a wider tile (marks get a square).
    const aspect = logo && logo.ink.w > 0 && logo.ink.h > 0 ? logo.ink.w / logo.ink.h : 1;
    const tileEstimate = nameCap * NAME_BLOCK + titleCap * TITLE_BLOCK;
    const share = aspect <= 1.2 ? 0.6 : aspect >= 2.6 ? 0.3 : 0.6 - (0.3 * (aspect - 1.2)) / 1.4;
    const logoH = tileEstimate * share;
    const logoW = logoH * aspect;
    const tileW = logo ? Math.max(tileEstimate, logoW + tileEstimate * 0.44) : 0;
    const tileGap = logo ? 0.5 * k : 0;

    const room = area.w * MEASURE[frame.format] - tileW - tileGap;
    const blockMax = props.width === 'fixed' ? Math.min(room, FIXED[frame.format] * k) : room;
    // One line, shrinking a little; very long names take two lines.
    const nameOne = layoutName(blockMax - 2 * padX);
    const name = nameOne.overflow ? layoutName(blockMax - 2 * padX, 2, 0.6) : nameOne;
    const title = layoutTitle(blockMax - 2 * padX);
    const fixed = props.width === 'fixed';
    const nameW = fixed ? blockMax : Math.min(blockMax, 2 * padX + inkRight(name));
    const titleW = title ? (fixed ? blockMax : Math.min(blockMax, 2 * padX + inkRight(title))) : 0;
    const nameH = nameCap * NAME_BLOCK + (name.lines.length - 1) * name.size * name.lineHeight;
    const titleH = title
      ? titleCap * TITLE_BLOCK + (title.lines.length - 1) * title.size * title.lineHeight
      : 0;
    const stackH = nameH + titleH;

    // Tag: a small chip above the name block with a pulsing dot.
    const tagText = props.tag.trim();
    const tag: TextBlock | null = tagText
      ? text.layout(tagText, {
          style: {
            font: display.font,
            size: 2.1 * k,
            weight: display.weight,
            width: display.width,
            tracking: 0.08,
            features: display.features,
            case: 'upper',
          },
          maxWidth: Math.max(nameW, 20 * k),
          maxLines: 1,
          lineHeight: 1,
          align: 'left',
          fit: { minSize: 2.4 * u },
        })
      : null;
    const tagH = tag ? tag.capHeight * TAG_BLOCK : 0;
    const dotR = tag ? tag.capHeight * 0.36 : 0;
    const tagPad = tag ? tag.capHeight * 0.95 : 0;
    const tagW = tag ? tagPad + 2 * dotR + tagPad * 0.8 + inkRight(tag) + tagPad : 0;
    const tagGap = tag ? 0.7 * k : 0;

    // --- lockup geometry: x inward from the anchor edge, y down from the top ---------------
    const blocksX = tileW + tileGap;
    const lockupW = blocksX + Math.max(nameW, titleW, tagW);
    const lockupH = tagH + tagGap + stackH;
    const left =
      h === 'left'
        ? area.x
        : h === 'right'
          ? area.x + area.w - lockupW
          : area.x + (area.w - lockupW) / 2;
    const top =
      v === 'top'
        ? area.y + u
        : v === 'bottom'
          ? area.y + area.h - u - lockupH
          : area.y + (area.h - lockupH) / 2;
    /** A rect laid out from the anchor edge (mirrored for right anchors). */
    const place = (x: number, y: number, w: number, hh: number): Rect => ({
      x: mirrored ? left + lockupW - x - w : left + x,
      y: top + y,
      w,
      h: hh,
    });
    const stackY = tagH + tagGap;
    const nameRect = place(blocksX, stackY, nameW, nameH);
    const titleRect = place(blocksX, stackY + nameH, titleW, titleH);
    const tileRect = place(0, stackY, tileW, stackH);
    const tagRect = place(blocksX, 0, tagW, tagH);

    // Text: one column per block edge, optically centered on cap height.
    const column = (rect: Rect, block: TextBlock) =>
      mirrored ? rect.x + rect.w - padX - inkRight(block) : rect.x + padX - block.ink.x;
    const nameX = column(nameRect, name);
    const nameY = nameRect.y + (nameH - name.height) / 2;
    const titleX = title ? column(titleRect, title) : 0;
    const titleY = title ? titleRect.y + (titleH - title.height) / 2 : 0;
    const dotX = mirrored ? tagRect.x + tagW - tagPad - dotR : tagRect.x + tagPad + dotR;
    const tagX = tag
      ? mirrored
        ? tagRect.x + tagPad - tag.ink.x
        : tagRect.x + tagPad + 2 * dotR + tagPad * 0.8 - tag.ink.x
      : 0;
    const tagY = tag ? tagRect.y + (tagH - tag.capHeight) / 2 : 0;

    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const nameBounds = shift(name.ink, nameX, nameY);
    const titleBounds = title ? shift(title.ink, titleX, titleY) : null;
    const tagBounds = tag ? shift(tag.ink, tagX, tagY) : null;
    let lockup = title ? unionRect(nameRect, titleRect) : nameRect;
    if (logo) lockup = unionRect(lockup, tileRect);
    if (tag) lockup = unionRect(lockup, tagRect);

    // The logo, centered in its tile.
    const fitW = Math.min(logoW, tileRect.w * 0.8);
    const fitH = Math.min(logoH, tileRect.h * 0.7);
    const logoRect: Rect = {
      x: tileRect.x + (tileRect.w - fitW) / 2,
      y: tileRect.y + (tileRect.h - fitH) / 2,
      w: fitW,
      h: fitH,
    };

    // --- motion ------------------------------------------------------------------------------
    const dir = mirrored ? -1 : 1;
    const followGap = ctx.stagger(0.08);
    const wipe = energy.move;
    const popCurve = energy.overshoot === 0 ? 'glide' : 'pop';
    // Punchy lands the tag with a pop; otherwise it glides into place.
    const tagCurve = energy.overshoot === 2 ? 'pop' : 'glide';
    const hold = timeline.sections.hold;
    const sweepDur = 0.6;
    const sweepAt = Math.min(0.8, hold.end - hold.start - sweepDur - 0.25);
    const sweepOn = props.sweep && sweepAt >= 0.2;
    const bandW = 2.6 * k;
    const slant = Math.tan((20 * Math.PI) / 180) * nameH;
    const band: Gradient = {
      kind: 'linear',
      x0: 0,
      y0: 0,
      x1: bandW,
      y1: 0,
      stops: [
        { offset: 0, color: withAlpha(WHITE, 0) },
        { offset: 0.5, color: withAlpha(WHITE, 0.2) },
        { offset: 1, color: withAlpha(WHITE, 0) },
      ],
    };

    /**
     * A block wiping in from its anchor edge and off towards the other side, carrying its
     * content (drawn clipped to the block, shifted by how far the block has gone).
     */
    const wipeBlock = (
      g: Draw,
      rect: Rect,
      color: Color,
      shown: number,
      gone: number,
      content: (g: Draw, offset: number) => void,
    ) => {
      const w = rect.w * (shown - gone);
      if (w <= 0) return;
      const visible: Rect = {
        x: mirrored ? rect.x + rect.w * (1 - shown) : rect.x + rect.w * gone,
        y: rect.y,
        w,
        h: rect.h,
      };
      g.rect(visible, { fill: color });
      g.clip(visible, (g) => content(g, dir * rect.w * gone));
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        // Exit: the tag lifts away, the blocks wipe off carrying their text, the tile shrinks.
        const tagGone = tl.p(t, 'out', { dur: 0.22 }, 'exit');
        const titleGone = tl.p(t, 'out', { dur: 0.34 }, 'exit');
        const nameGone = tl.p(t, 'out', { delay: 0.06, dur: 0.34 }, 'exit');
        const tileGone = tl.p(t, 'out', { delay: 0.12, dur: 0.3 }, 'exit');

        g.movable('lockup', lockup, (g) => {
          // Logo tile: scales in from 0.6.
          if (logo) {
            const grown = tl.p(t, 'in', { dur: 0.3 }, popCurve);
            const opacity = tl.p(t, 'in', { dur: 0.12 }) * (1 - tileGone);
            if (opacity > 0) {
              g.group(
                {
                  scale: (0.6 + 0.4 * grown) * (1 - 0.4 * tileGone),
                  originX: tileRect.x + tileRect.w / 2,
                  originY: tileRect.y + tileRect.h / 2,
                  opacity,
                },
                (g) => {
                  g.rect(tileRect, { fill: tile });
                  g.graphic(logo, logoRect, { current: tileInk });
                },
              );
            }
          }

          // Name block: wipes in from its edge; the name slides in inside it.
          const nameShown = tl.p(t, 'in', { delay: 0.05, dur: 0.35 }, wipe);
          const nameIn = tl.p(t, 'in', { delay: 0.18, dur: 0.37 }, energy.enter);
          wipeBlock(g, nameRect, nameBlock, nameShown, nameGone, (g, offset) => {
            const from = -dir * (inkRight(name) + padX);
            g.text(name, { fill: nameInk, x: nameX + from * (1 - nameIn) + offset, y: nameY });
            // One light sweep: a narrow 20° band of 20% white, masked to the block.
            if (sweepOn) {
              const p = tl.p(t, 'hold', { delay: sweepAt, dur: sweepDur }, 'drift');
              if (p > 0 && p < 1) {
                const travel = nameRect.w + bandW + 2 * slant;
                const x = mirrored
                  ? nameRect.x + nameRect.w + slant - travel * p
                  : nameRect.x - bandW - slant + travel * p;
                g.group({ x, y: nameRect.y, skewX: -20, originY: nameH / 2 }, (g) =>
                  g.rect({ x: 0, y: 0, w: bandW, h: nameH }, { fill: band }),
                );
              }
            }
          });

          // Title block: wipes in after; the title follows 0.08 s later.
          if (title) {
            const titleShown = tl.p(t, 'in', { delay: 0.25, dur: 0.35 }, wipe);
            const titleIn = tl.p(t, 'in', { delay: 0.25 + followGap, dur: 0.37 }, energy.enter);
            wipeBlock(g, titleRect, titleBlock, titleShown, titleGone, (g, offset) => {
              const from = -dir * (inkRight(title) + padX);
              g.text(title, {
                fill: titleInk,
                x: titleX + from * (1 - titleIn) + offset,
                y: titleY,
              });
            });
          }

          // Tag: drops into place from above; its dot pulses at 1 Hz through the hold.
          if (tag) {
            const dropped = tl.p(t, 'in', { delay: 0.6, dur: 0.3 }, tagCurve);
            if (dropped > 0 && tagGone < 1) {
              const y = -tagH * (1 - dropped) - tagH * tagGone;
              const beat = tl.local(t, 'hold');
              const pulse = beat > 0 ? 0.6 + 0.4 * Math.cos(beat * Math.PI * 2) : 1;
              g.clip(tagRect, (g) =>
                g.group({ y }, (g) => {
                  g.rect(tagRect, { fill: tagBlock });
                  g.circle(dotX, tagRect.y + tagH / 2, dotR, { fill: dot, opacity: pulse });
                  g.text(tag, { fill: tagInk, x: tagX, y: tagY });
                }),
              );
            }
          }

          g.editable('name', nameBounds);
          if (titleBounds) g.editable('title', titleBounds);
          if (tagBounds) g.editable('tag', tagBounds);
          if (logo) g.editable('logo', tileRect);
        });
      },
    };
  },
});
