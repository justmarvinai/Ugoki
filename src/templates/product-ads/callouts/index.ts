/**
 * Callouts — feature callouts (docs/templates/04-product-ads.md §4.2).
 *
 * The expensive detail: engineering-drawing discipline. Labels auto-distribute in two balanced
 * columns (an exact least-squares solve per column: reading order kept, no overlaps, each as
 * near its anchor as the others allow — layout.ts), and every leader keeps the same geometry — a
 * 45° leg out of the anchor, then a level run into the label — however far the solver moved it.
 * Each callout builds in one gesture: the dot pops with a ring pulse, the leader draws out of it
 * and the title slides out of the leader's end, as if the line had carried it there.
 *
 * Anchor points are number controls (x/y as a share of the product's ink box, so they stay on
 * the same feature at any format or size); clicking a dot on the stage focuses its controls.
 */

import {
  adjustLightness,
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  type FormatId,
  type Gradient,
  mixOklab,
  type PathData,
  type Rect,
  rgb,
  spring,
  type TextBlock,
  type TextStyle,
  unionRect,
  withAlpha,
} from '@/engine';
import { assignSides, distribute, leader, type Side } from './layout';
import { createContactShadow } from './shadow';

type Composition = {
  /** Product name (display face), label title and detail sizes (text face), in u. */
  title: number;
  label: number;
  detail: number;
  /** Largest product: share of the free height and of the layout area's width. */
  productH: number;
  productW: number;
  /** Space between the product and a label column, and the widest column, in u. */
  gutter: number;
  measure: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': {
    title: 6,
    label: 3,
    detail: 2.5,
    productH: 0.86,
    productW: 0.3,
    gutter: 11,
    measure: 34,
  },
  '1:1': {
    title: 5.8,
    label: 3.1,
    detail: 2.6,
    productH: 0.82,
    productW: 0.28,
    gutter: 6,
    measure: 30,
  },
  '4:5': {
    title: 5.8,
    label: 3.1,
    detail: 2.6,
    productH: 0.82,
    productW: 0.28,
    gutter: 5.5,
    measure: 30,
  },
  '9:16': {
    title: 6.6,
    label: 3.4,
    detail: 2.8,
    productH: 0.74,
    productW: 0.31,
    gutter: 4.2,
    measure: 30,
  },
};

/** Leader line width (u) and the casing that keeps it readable where it crosses the product. */
const LINE = 0.12;
const CASING = 0.32;
/** Balanced seconds: first callout, gap between callouts, one callout's build. */
const FIRST = 0.9;
const GAP = 0.35;
const BUILD = 0.92;
const BLACK: Color = rgb(0, 0, 0);

const SIDES = [
  { value: 'auto', label: 'Auto' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
] as const;

const calloutTitle = (n: number, value: string) =>
  c.text({ label: `Callout ${n}`, default: value, maxLength: 28, optional: true });
const calloutDetail = (n: number, value: string) =>
  c.text({ label: `Callout ${n} · detail`, default: value, maxLength: 48, optional: true });
const pointX = (n: number, value: number) =>
  c.number({
    label: `Callout ${n} · point X`,
    group: 'layout',
    default: value,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    hint: 'Where the dot sits across the product, from its left edge',
  });
const pointY = (n: number, value: number) =>
  c.number({
    label: `Callout ${n} · point Y`,
    group: 'layout',
    default: value,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    hint: 'Where the dot sits down the product, from its top',
  });
const side = (n: number) =>
  c.choice({ label: `Callout ${n} · side`, group: 'layout', default: 'auto', options: SIDES });

type CalloutProps = {
  callout1: string;
  detail1: string;
  callout2: string;
  detail2: string;
  callout3: string;
  detail3: string;
  callout4: string;
  detail4: string;
};

/** The callouts in use (a title or a detail), in slot order. */
function active(props: CalloutProps): number[] {
  const slots = [
    [props.callout1, props.detail1],
    [props.callout2, props.detail2],
    [props.callout3, props.detail3],
    [props.callout4, props.detail4],
  ];
  return slots.flatMap(([a = '', b = ''], i) => (a.trim() || b.trim() ? [i] : []));
}

/** One label, laid out, placed and wired to its anchor. */
type Callout = {
  /** Slot (0..3: control keys) and entrance order. */
  slot: number;
  order: number;
  side: Side;
  ax: number;
  ay: number;
  title: TextBlock | null;
  detail: TextBlock | null;
  /** Block origins (frame coordinates). */
  tx: number;
  ty: number;
  dx: number;
  dy: number;
  titleBounds: Rect | null;
  detailBounds: Rect | null;
  /** The title's reveal window: it slides out of the leader's end into it. */
  window: Rect;
  slide: number;
  path: PathData;
  /** The leader crosses the product (its casing is drawn there). */
  crosses: boolean;
  bounds: Rect;
};

export default defineTemplate({
  id: 'callouts',
  version: 1,
  meta: {
    name: 'Callouts',
    tagline: 'Feature callouts',
    category: 'product-ads',
    tags: ['product', 'features', 'specs', 'callouts', 'launch'],
    useCases: [
      'Product features',
      'Spec highlights',
      'Launch explainers',
      'Hardware and packaging',
    ],
  },
  formats: ['16:9', '1:1', '4:5', '9:16'],
  structure: 'in-hold-out',
  duration: { default: 7, min: 5, max: 15 },
  alpha: 'optional',
  poster: 3.2,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'swiss' },
    { kind: 'library', id: 'mono-light' },
  ],
  pairings: ['grotesk', 'technical', 'editorial', 'classic', 'wide'],
  controls: {
    product: c.image({
      label: 'Product image',
      accept: 'object',
      default: { kind: 'placeholder', id: 'object-speaker' },
    }),
    title: c.text({
      label: 'Title',
      default: 'Nova One',
      maxLength: 28,
      optional: true,
      primary: true,
    }),
    callout1: calloutTitle(1, '40-hour battery'),
    detail1: calloutDetail(1, 'All week, on one charge.'),
    callout2: calloutTitle(2, 'Spatial audio'),
    detail2: calloutDetail(2, 'Sound that fills the room.'),
    callout3: calloutTitle(3, 'Recycled aluminium'),
    detail3: calloutDetail(3, 'Built to last longer.'),
    callout4: calloutTitle(4, ''),
    detail4: calloutDetail(4, ''),
    lines: c.choice({
      label: 'Line style',
      default: 'elbow',
      options: [
        { value: 'straight', label: 'Straight' },
        { value: 'elbow', label: 'Elbow' },
      ],
    }),
    dots: c.choice({
      label: 'Dot style',
      default: 'solid',
      options: [
        { value: 'solid', label: 'Solid' },
        { value: 'ring', label: 'Ring' },
      ],
    }),
    x1: pointX(1, 20),
    y1: pointY(1, 84),
    side1: side(1),
    x2: pointX(2, 80),
    y2: pointY(2, 44),
    side2: side(2),
    x3: pointX(3, 16),
    y3: pointY(3, 9),
    side3: side(3),
    x4: pointX(4, 72),
    y4: pointY(4, 72),
    side4: side(4),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    {
      id: 'ink',
      name: 'Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'technical',
      values: { dots: 'ring' },
    },
    { id: 'sand', name: 'Sand', palette: { kind: 'library', id: 'sand' }, pairing: 'editorial' },
  ],
  timing: ({ props, energy }) => {
    const n = active(props).length;
    const gap = (GAP * energy.stagger) / energy.time;
    const titles = [props.title, props.callout1, props.callout2, props.callout3, props.callout4];
    return {
      in: Math.max(1.2, n > 0 ? FIRST + (n - 1) * gap + BUILD : 0),
      out: 0.7,
      tail: CLEAN_END,
      readable: titles.join(' '),
    };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const areaRight = area.x + area.w;
    const areaBottom = area.y + area.h;
    // The composition's axis: the middle of the layout area (in vertical formats the part the
    // platform UI leaves free), so both label columns get the same room.
    const cx = area.x + area.w / 2;
    const product = ctx.graphic('product');
    const display = pairing.display;
    const body = pairing.text;

    // --- title ------------------------------------------------------------------------------
    const titleText = props.title.trim();
    const titleW = Math.min(area.w, 150 * u);
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
          maxWidth: titleW,
          maxLines: 2,
          lineHeight: display.lineHeight,
          align: 'center',
          fit: { minSize: 3.4 * u },
        })
      : null;
    const titleH = title ? title.height + 0.3 * title.size + 5 * u : 0;

    // --- product: as large as the room allows, standing under the title ----------------------
    const shadowRoom = 2 * u;
    const zoneH = Math.max(10 * u, area.h - shadowRoom - titleH);
    const ink = product?.ink ?? { x: 0, y: 0, w: 1, h: 2 };
    const aspect = ink.w > 0 && ink.h > 0 ? ink.w / ink.h : 0.5;
    let productH = zoneH * comp.productH;
    let productW = productH * aspect;
    if (productW > area.w * comp.productW) {
      productW = area.w * comp.productW;
      productH = productW / aspect;
    }
    // Title and product form one group, optically centered in the height they leave free.
    const top = area.y + (zoneH - productH) * 0.45;
    const titleX = cx - titleW / 2;
    const titleY = top;
    const titleBounds: Rect | null = title
      ? {
          x: titleX + title.ink.x,
          y: titleY + title.ink.y,
          w: title.ink.w,
          h: title.ink.h,
        }
      : null;
    const contentTop = top + titleH;
    const productRect: Rect = { x: cx - productW / 2, y: contentTop, w: productW, h: productH };
    const floorY = productRect.y + productH;
    const photo =
      product?.kind === 'raster' &&
      ink.w * ink.h >= 0.985 * product.image.width * product.image.height;

    // --- label columns ----------------------------------------------------------------------
    const gutter = comp.gutter * u;
    const rightX = productRect.x + productW + gutter;
    const leftEdge = productRect.x - gutter;
    const colW = Math.max(
      12 * u,
      Math.min(comp.measure * u, areaRight - rightX, leftEdge - area.x),
    );
    // Labels may rise beside the title when it is narrower than the product and its gutters.
    const clearOfTitle = !title || title.width / 2 + 2 * u <= productW / 2 + gutter;
    const spanTop = clearOfTitle ? area.y : contentTop;
    const spanBottom = areaBottom;
    const elbow = props.lines === 'elbow';

    const slots = [
      { title: props.callout1, detail: props.detail1, x: props.x1, y: props.y1, side: props.side1 },
      { title: props.callout2, detail: props.detail2, x: props.x2, y: props.y2, side: props.side2 },
      { title: props.callout3, detail: props.detail3, x: props.x3, y: props.y3, side: props.side3 },
      { title: props.callout4, detail: props.detail4, x: props.x4, y: props.y4, side: props.side4 },
    ];
    const used = active(props);
    const sides = assignSides(
      used.map((slot) => ({
        choice: slots[slot]?.side ?? 'auto',
        across: (slots[slot]?.x ?? 50) / 100,
      })),
    );

    const labelStyle = (size: number): TextStyle => ({
      font: body.font,
      size,
      weight: 600,
      width: body.width,
      tracking: 0,
      features: body.features,
    });
    const detailStyle = (size: number): TextStyle => ({
      font: body.font,
      size,
      weight: 450,
      width: body.width,
      tracking: 0,
      features: body.features,
    });

    type Draft = {
      slot: number;
      order: number;
      side: Side;
      ax: number;
      ay: number;
      title: TextBlock | null;
      detail: TextBlock | null;
      gapTD: number;
      height: number;
      attach: number;
      desired: number;
    };
    const drafts = (scale: number): Draft[] =>
      used.map((slot, order) => {
        const s = slots[slot];
        const sideOf = sides[order] ?? 'right';
        const align = sideOf === 'left' ? 'right' : 'left';
        const titleText = s?.title.trim() ?? '';
        const detailText = s?.detail.trim() ?? '';
        const t = titleText
          ? text.layout(titleText, {
              style: labelStyle(comp.label * u * scale),
              maxWidth: colW,
              maxLines: 2,
              lineHeight: 1.12,
              align,
              fit: { minSize: 2.4 * u },
            })
          : null;
        const d = detailText
          ? text.layout(detailText, {
              style: detailStyle(comp.detail * u * scale),
              maxWidth: colW,
              maxLines: 3,
              lineHeight: 1.3,
              align,
              fit: { minSize: 2.4 * u },
            })
          : null;
        const gapTD = t && d ? d.size * 0.72 : 0;
        const last = d ?? t;
        const height =
          (t ? t.height : 0) + gapTD + (d ? d.height : 0) + (last ? 0.3 * last.size : 0);
        const attach = t ? t.capHeight / 2 : d ? d.capHeight / 2 : 0;
        const ax = productRect.x + productW * ((s?.x ?? 50) / 100);
        const ay = productRect.y + productH * ((s?.y ?? 50) / 100);
        // Leaders fan away from the product's middle: labels above upper anchors, below lower.
        const rel = (s?.y ?? 50) / 100;
        const fan = elbow ? 5 * u * Math.max(-1, Math.min(1, (rel - 0.5) / 0.3)) : 0;
        return {
          slot,
          order,
          side: sideOf,
          ax,
          ay,
          title: t,
          detail: d,
          gapTD,
          height,
          attach,
          desired: ay + fan,
        };
      });

    // Lay the labels out; if a column's stack is taller than the column, shrink and retry.
    const labelGap = comp.label * u * 1.3;
    const span = spanBottom - spanTop;
    let scale = 1;
    let placed = drafts(scale);
    for (let pass = 0; pass < 4; pass++) {
      let worst = 0;
      for (const s of ['left', 'right'] as const) {
        const column = placed.filter((d) => d.side === s);
        const total =
          column.reduce((sum, d) => sum + d.height, 0) + Math.max(0, column.length - 1) * labelGap;
        worst = Math.max(worst, total / span);
      }
      if (worst <= 1) break;
      scale *= 0.97 / worst;
      placed = drafts(scale);
    }

    const tops = new Map<number, number>();
    for (const s of ['left', 'right'] as const) {
      const column = placed.filter((d) => d.side === s).sort((a, b) => a.desired - b.desired);
      const result = distribute(column, labelGap, spanTop, spanBottom);
      column.forEach((d, i) => {
        let top = result[i] ?? d.desired;
        // A leader that almost levels off levels off (no hairline kinks), if that stays clear.
        const dy = top + d.attach - d.ay;
        if (Math.abs(dy) < 1.2 * u) {
          const moved = top - dy;
          const above = column[i - 1];
          const below = column[i + 1];
          const aboveEnd = above ? (tops.get(above.slot) ?? -1e9) + above.height + labelGap : -1e9;
          const belowTop = below ? (result[i + 1] ?? 1e9) - labelGap : 1e9;
          if (
            moved >= Math.max(spanTop, aboveEnd) &&
            moved + d.height <= Math.min(spanBottom, belowTop)
          ) {
            top = moved;
          }
        }
        tops.set(d.slot, top);
      });
    }

    const lineGap = 1.4 * u;
    const dotR = 0.72 * u;
    const clear = dotR + 0.55 * u;
    const callouts: Callout[] = placed.map((d) => {
      const top = tops.get(d.slot) ?? d.desired;
      const right = d.side === 'right';
      const colX = right ? rightX : leftEdge - colW;
      const tx = colX;
      const ty = top;
      const dx = colX;
      const dy = top + (d.title ? d.title.height + d.gapTD : 0);
      const titleBounds = d.title
        ? {
            x: tx + d.title.ink.x,
            y: ty + d.title.ink.y,
            w: d.title.ink.w,
            h: d.title.ink.h,
          }
        : null;
      const detailBounds = d.detail
        ? {
            x: dx + d.detail.ink.x,
            y: dy + d.detail.ink.y,
            w: d.detail.ink.w,
            h: d.detail.ink.h,
          }
        : null;
      const edgeX = right ? rightX : leftEdge;
      const ex = right ? edgeX - lineGap : edgeX + lineGap;
      const ey = top + d.attach;
      const lead = leader(d.ax, d.ay, ex, ey, clear, 3 * u, elbow);
      const size = d.title?.size ?? comp.label * u;
      const window: Rect = right
        ? {
            x: edgeX - 0.12 * size,
            y: ty - 1.2 * size,
            w: colW + 2 * size,
            h: d.height + 2.4 * size,
          }
        : {
            x: edgeX - colW - 2 * size,
            y: ty - 1.2 * size,
            w: colW + 2.12 * size,
            h: d.height + 2.4 * size,
          };
      const slide = (d.title ? d.title.width : 0) + 0.6 * size;
      let bounds: Rect = { x: d.ax - dotR, y: d.ay - dotR, w: 2 * dotR, h: 2 * dotR };
      if (titleBounds) bounds = unionRect(bounds, titleBounds);
      if (detailBounds) bounds = unionRect(bounds, detailBounds);
      const inside = (x: number, y: number) =>
        x >= productRect.x && x <= productRect.x + productW && y >= productRect.y && y <= floorY;
      return {
        slot: d.slot,
        order: d.order,
        side: d.side,
        ax: d.ax,
        ay: d.ay,
        title: d.title,
        detail: d.detail,
        tx,
        ty,
        dx,
        dy,
        titleBounds,
        detailBounds,
        window,
        slide,
        path: lead.path,
        crosses: inside(lead.start.x, lead.start.y),
        bounds,
      };
    });

    let lockup: Rect = productRect;
    for (const co of callouts) lockup = unionRect(lockup, co.bounds);

    // --- colors & light ---------------------------------------------------------------------
    const shadow = createContactShadow(
      mixOklab(bg, BLACK, palette.dark ? 0.7 : 0.5),
      palette.dark ? 1.2 : 1,
    );
    const glow = adjustLightness(bg, palette.dark ? 0.07 : 0.035);
    const spotR = Math.max(productH, productW * 1.6) * 0.85;
    const spot: Gradient = {
      kind: 'radial',
      cx: cx,
      cy: productRect.y + productH * 0.5,
      r: spotR,
      stops: [
        { offset: 0, color: glow },
        { offset: 0.5, color: withAlpha(glow, 0.5) },
        { offset: 1, color: withAlpha(glow, 0) },
      ],
    };

    // --- motion (Balanced seconds; energy scales the in/out windows) ------------------------
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    const gap = ctx.stagger(GAP);
    const exitGap = ctx.stagger(0.05);
    const scaleFrom = 1 - 0.04 * energy.travel;
    const lineCurve = punchy ? 'snap' : 'glide';
    const pulsePeriod = calm ? 3 : punchy ? 1.2 : 2;
    const pulseStagger = calm ? 0.6 : punchy ? 0.15 : 0.45;
    const pulsePeak = calm ? 0.55 : 0.85;
    const pulseReach = (calm ? 2.2 : punchy ? 3 : 2.6) * u;
    const hold = timeline.sections.hold;
    const count = callouts.length;
    const ring = props.dots === 'ring';
    const ringR = dotR * 1.25;

    const drawProduct = (g: Draw, opacity: number) => {
      if (!product) return;
      if (photo) {
        g.clip({ rect: productRect, radius: 2 * u }, (g) =>
          g.graphic(product, productRect, { opacity }),
        );
      } else {
        g.graphic(product, productRect, { opacity });
      }
    };

    /** A ring expanding from the dot and fading (`q`: 0..1 through the pulse). */
    const pulse = (g: Draw, x: number, y: number, q: number, peak: number, width: number) => {
      if (q <= 0 || q >= 1 || peak <= 0) return;
      const r = dotR + pulseReach * (1 - (1 - q) ** 3);
      const alpha = peak * (1 - q) ** 1.6;
      // A cased ring, like the leaders: it reads on the product and off it.
      g.circle(x, y, r, { stroke: { color: bg, width: width + 0.36 * u }, opacity: alpha * 0.55 });
      g.circle(x, y, r, { stroke: { color: accent, width }, opacity: alpha });
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        const lineW = Math.max(LINE * u, g.pixel);
        const casingW = lineW + 2 * CASING * u;

        // --- product: fades in and settles, a soft shadow at its feet ------------------------
        const settle = tl.p(t, 'in', { dur: 0.9 }, 'glide');
        const shown = tl.p(t, 'in', { dur: 0.6 }, 'drift');
        const gone = tl.p(t, 'out', { delay: 0.36, dur: 0.34 }, 'exit');
        const productAlpha = shown * (1 - gone);
        const scale = (scaleFrom + (1 - scaleFrom) * settle) * (1 - 0.02 * gone);

        g.movable('callouts', lockup, (g) => {
          if (productAlpha > 0) {
            if (!ctx.transparent)
              g.circle(spot.cx, spot.cy, spotR, { fill: spot, opacity: productAlpha });
            g.group({ scale, originX: cx, originY: floorY }, (g) => {
              shadow.draw(g, cx, floorY + 0.2 * u, productW * (photo ? 0.95 : 1), productAlpha);
              drawProduct(g, productAlpha);
            });
          }
          g.editable('product', productRect);

          // --- callouts ----------------------------------------------------------------------
          for (const co of callouts) {
            const start = FIRST + co.order * gap;
            const back = (count - 1 - co.order) * exitGap;
            const dotIn = calm
              ? tl.p(t, 'in', { delay: start, dur: 0.45 }, 'glide')
              : punchy
                ? Math.max(0, spring(t - tl.at('in', start), 0, 1, 'lively'))
                : tl.p(t, 'in', { delay: start, dur: 0.38 }, 'pop');
            const drawn = tl.p(t, 'in', { delay: start + 0.12, dur: 0.45 }, lineCurve);
            const titleIn = tl.p(t, 'in', { delay: start + 0.42, dur: 0.45 }, energy.enter);
            const detailIn = tl.p(t, 'in', { delay: start + 0.52, dur: 0.4 }, 'glide');
            const labelOut = tl.p(t, 'out', { delay: back, dur: 0.28 }, 'exit');
            const retracted = tl.p(t, 'out', { delay: 0.1 + back, dur: 0.3 }, 'exit');
            const dotOut = tl.p(t, 'out', { delay: 0.28 + back, dur: 0.2 }, 'exit');

            // Leader: draws out of the dot, retracts into it.
            const reach = drawn * (1 - retracted);
            if (reach > 0) {
              if (co.crosses) {
                g.clip(productRect, (g) =>
                  g.path(co.path, {
                    stroke: { color: bg, width: casingW, cap: 'round', trim: [0, reach] },
                    opacity: 0.85,
                  }),
                );
              }
              g.path(co.path, {
                stroke: { color: fg, width: lineW, cap: 'butt', join: 'miter', trim: [0, reach] },
              });
            }

            // Dot: pops with a ring pulse; in the hold the rings pulse in turn.
            const dot = dotIn * (1 - dotOut);
            if (dot > 0) {
              const r = ring ? ringR : dotR;
              g.circle(co.ax, co.ay, (r + CASING * u * 1.2) * dot, { fill: bg, opacity: 0.9 });
              if (ring) {
                g.circle(co.ax, co.ay, ringR * dot, {
                  stroke: { color: accent, width: 0.26 * u * Math.min(1, dot) },
                });
                g.circle(co.ax, co.ay, 0.26 * u * dot, { fill: accent });
              } else {
                g.circle(co.ax, co.ay, dotR * dot, { fill: accent });
              }
              const first = t - tl.at('in', start + 0.04);
              pulse(g, co.ax, co.ay, first / 0.7, pulsePeak, 0.24 * u);
              // Hold pulses fade out with the labels rather than stopping mid-ring.
              const since = t - hold.start - 0.35 - co.order * pulseStagger;
              if (since > 0) {
                const q = (since % pulsePeriod) / 0.9;
                pulse(g, co.ax, co.ay, q, pulsePeak * 0.8 * (1 - labelOut), 0.2 * u);
              }
              g.editable(`x${co.slot + 1}`, {
                x: co.ax - 2.5 * u,
                y: co.ay - 2.5 * u,
                w: 5 * u,
                h: 5 * u,
              });
            }

            // Title: slides out of the leader's end; slides back in on the exit.
            if (co.title && titleIn > 0 && labelOut < 1) {
              const dir = co.side === 'right' ? -1 : 1;
              const off = dir * co.slide * (1 - titleIn + labelOut);
              const title = co.title;
              g.clip(co.window, (g) => g.text(title, { fill: fg, x: co.tx + off, y: co.ty }));
            }
            if (co.titleBounds && titleIn > 0) g.editable(`callout${co.slot + 1}`, co.titleBounds);

            // Detail: fades up just after.
            if (co.detail) {
              const alpha = detailIn * (1 - labelOut);
              if (alpha > 0) {
                g.text(co.detail, {
                  fill: muted,
                  x: co.dx,
                  y: co.dy + (1 - detailIn) * 0.8 * u,
                  opacity: alpha,
                });
              }
              if (co.detailBounds && detailIn > 0)
                g.editable(`detail${co.slot + 1}`, co.detailBounds);
            }
          }
        });

        // --- title: rises out of its line masks ---------------------------------------------
        if (title && titleBounds) {
          const out = tl.p(t, 'out', { dur: 0.3 }, 'exit');
          if (out < 1) {
            g.movable('title', titleBounds, (g) => {
              title.lines.forEach((line, i) => {
                const p = tl.p(
                  t,
                  'in',
                  { delay: 0.3 + i * ctx.stagger(0.08), dur: 0.7 },
                  energy.enter,
                );
                if (p <= 0) return;
                const mask = {
                  x: titleX + line.mask.x,
                  y: titleY + line.mask.y,
                  w: line.mask.w,
                  h: line.mask.h,
                };
                g.clip(mask, (g) =>
                  g.text(line, {
                    fill: fg,
                    x: titleX,
                    y: titleY + (1 - p) * mask.h * 1.05,
                    opacity: 1 - out,
                  }),
                );
              });
              g.editable('title', titleBounds);
            });
          }
        }
      },
    };
  },
});
