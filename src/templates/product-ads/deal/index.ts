/**
 * Deal — price drop (docs/templates/04-product-ads.md §4.1).
 *
 * The expensive detail: the new price rolls from the old value to the new one on odometer
 * wheels with tabular figures (the currency symbol and separators stay still, and a digit the
 * new price doesn't need rolls to zero and closes up); the strike through the old price is a
 * slightly bowed mark at −4° that draws on like a pen stroke; and the product's contact shadow
 * is a soft ellipse pair that tightens as the product lands — and breathes with it in the hold.
 */

import {
  adjustLightness,
  bestContrast,
  CLEAN_END,
  type Color,
  c,
  contrastRatio,
  createOdometer,
  type Draw,
  defineTemplate,
  type FormatId,
  type Gradient,
  mixOklab,
  type Odometer,
  type PathData,
  type Rect,
  rgb,
  spring,
  type TextBlock,
  type TextStyle,
  unionRect,
  withAlpha,
} from '@/engine';
import {
  CURRENCIES,
  type CurrencyId,
  createRollFrame,
  drawRoll,
  money,
  parsePrice,
  priceRoll,
  savingPercent,
} from './price';
import { createContactShadow } from './shadow';

type Composition = {
  /** Product height as a share of the frame height, side by side / stacked. */
  product: number;
  stacked: number;
  /** Share of the layout area's width taken by the product column (side by side). */
  column: number;
  /** Where the product stands in its column, from its outer edge (0.5 = centered). */
  lean: number;
  /** Type sizes in u: product name, old price, new price (largest), CTA label. */
  name: number;
  old: number;
  price: number;
  cta: number;
  /** Sticker diameter in u. */
  sticker: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': {
    product: 0.62,
    stacked: 0.5,
    column: 0.42,
    lean: 0.62,
    name: 2.5,
    old: 5,
    price: 21,
    cta: 2.8,
    sticker: 19,
  },
  '1:1': {
    product: 0.6,
    stacked: 0.5,
    column: 0.46,
    lean: 0.54,
    name: 2.6,
    old: 5,
    price: 16,
    cta: 2.9,
    sticker: 20,
  },
  '4:5': {
    product: 0.56,
    stacked: 0.42,
    column: 0.46,
    lean: 0.54,
    name: 2.6,
    old: 5,
    price: 15,
    cta: 2.9,
    sticker: 19,
  },
  '9:16': {
    product: 0.36,
    stacked: 0.36,
    column: 1,
    lean: 0.5,
    name: 3.3,
    old: 6.2,
    price: 19,
    cta: 3.6,
    sticker: 23,
  },
};

const CURRENCY_OPTIONS = (Object.keys(CURRENCIES) as CurrencyId[]).map((value) => ({
  value,
  label: CURRENCIES[value].label,
}));

/** The strike leans like a quick pen mark. */
const STRIKE_ANGLE = (-4 * Math.PI) / 180;
const BLACK: Color = rgb(0, 0, 0);
const WHITE: Color = rgb(1, 1, 1);

type Align = 'left' | 'center' | 'right';

const shift = (r: Rect, x: number, y: number): Rect => ({ x: r.x + x, y: r.y + y, w: r.w, h: r.h });

/** x of a `width`-wide element aligned at `anchor` (left edge, center or right edge). */
const alignX = (align: Align, anchor: number, width: number) =>
  align === 'left' ? anchor : align === 'right' ? anchor - width : anchor - width / 2;

/** 0 → 1 → 0 bump every `period` seconds, `length` long (hold micro-motion). */
function bump(time: number, period: number, length: number): number {
  if (time < 0) return 0;
  const phase = time % period;
  return phase < length ? Math.sin((Math.PI * phase) / length) ** 2 : 0;
}

export default defineTemplate({
  id: 'deal',
  version: 1,
  meta: {
    name: 'Deal',
    tagline: 'Price drop',
    category: 'product-ads',
    tags: ['price', 'discount', 'product', 'sale', 'ecommerce'],
    useCases: ['Discounts', 'E-commerce promos', 'Flash offers', 'Marketplace ads'],
  },
  formats: ['1:1', '4:5', '9:16', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 4, max: 12 },
  alpha: 'none',
  poster: 3.6,
  palettes: [
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'hazard' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'mint' },
  ],
  pairings: ['grotesk', 'poster', 'wide', 'technical', 'classic'],
  controls: {
    product: c.image({
      label: 'Product image',
      accept: 'object',
      default: { kind: 'placeholder', id: 'object-bottle' },
    }),
    name: c.text({
      label: 'Product name',
      default: 'AERO BOTTLE 750 ML',
      maxLength: 32,
      primary: true,
    }),
    oldPrice: c.text({
      label: 'Old price',
      default: '39.00',
      maxLength: 12,
      optional: true,
      placeholder: '39.00',
    }),
    newPrice: c.text({ label: 'New price', default: '27.00', maxLength: 12, placeholder: '27.00' }),
    currency: c.choice({
      label: 'Currency',
      group: 'content',
      default: 'eur',
      options: CURRENCY_OPTIONS,
      display: 'select',
    }),
    badge: c.choice({
      label: 'Badge',
      group: 'content',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto %' },
        { value: 'custom', label: 'Custom' },
        { value: 'off', label: 'Off' },
      ],
    }),
    badgeText: c.text({
      label: 'Badge text',
      default: 'Best price',
      maxLength: 16,
      hint: 'Shown when Badge is Custom',
    }),
    cta: c.text({ label: 'Call to action', default: 'Shop now', maxLength: 20, optional: true }),
    layout: c.choice({
      label: 'Layout',
      default: 'left',
      options: [
        { value: 'left', label: 'Product left' },
        { value: 'right', label: 'Product right' },
        { value: 'top', label: 'Product top' },
      ],
    }),
    shadow: c.toggle({ label: 'Shadow', default: true }),
  },
  looks: [
    {
      id: 'cobalt',
      name: 'Cobalt',
      palette: { kind: 'library', id: 'cobalt' },
      pairing: 'grotesk',
    },
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    { id: 'hazard', name: 'Hazard', palette: { kind: 'library', id: 'hazard' }, pairing: 'poster' },
  ],
  timing: ({ props }) => ({ in: 2.9, out: 0.5, tail: CLEAN_END, readable: props.name }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const areaRight = area.x + area.w;
    const areaBottom = area.y + area.h;
    const product = ctx.graphic('product');

    // --- arrangement ------------------------------------------------------------------------
    // Side by side in wide and squarish frames; 9:16 always stacks, leaning to the chosen side.
    const stacked = props.layout === 'top' || frame.format === '9:16';
    const align: Align = !stacked
      ? 'left'
      : props.layout === 'left'
        ? 'left'
        : props.layout === 'right'
          ? 'right'
          : 'center';
    const priceRow = stacked && frame.format !== '9:16';
    const productLeft = props.layout !== 'right';
    const gutter = 4 * u;

    let colX: number;
    let colW: number;
    if (!stacked) {
      const productW = area.w * comp.column;
      colW = area.w - productW - gutter;
      colX = productLeft ? area.x + productW + gutter : area.x;
    } else if (align === 'center') {
      // Symmetric around the frame's center, even where the social zone isn't.
      const half = Math.min(frame.cx - area.x, areaRight - frame.cx);
      colX = frame.cx - half;
      colW = half * 2;
    } else {
      colX = area.x;
      colW = area.w;
    }
    const anchor = align === 'left' ? colX : align === 'right' ? colX + colW : colX + colW / 2;

    // --- type -------------------------------------------------------------------------------
    const display = pairing.display;
    const body = pairing.text;
    const nameText = props.name.trim();
    const name: TextBlock | null = nameText
      ? text.layout(nameText, {
          style: {
            font: body.font,
            size: comp.name * u,
            weight: 600,
            width: body.width,
            tracking: 0.14,
            case: 'upper',
            features: body.features,
          },
          maxWidth: colW,
          maxLines: 2,
          lineHeight: 1.25,
          align,
          fit: { minSize: 2.4 * u },
        })
      : null;

    const oldTyped = parsePrice(props.oldPrice);
    const newTyped = parsePrice(props.newPrice);
    const currency = props.currency;
    const cents = Boolean(oldTyped?.cents || newTyped?.cents);
    const oldLabel = oldTyped ? money(oldTyped.value, currency, cents) : props.oldPrice.trim();
    const newLabel = newTyped ? money(newTyped.value, currency, cents) : props.newPrice.trim();
    const rolls = oldTyped !== null && newTyped !== null && oldLabel !== newLabel;

    const oldStyle: TextStyle = {
      font: body.font,
      size: comp.old * u,
      weight: 500,
      width: body.width,
      tracking: 0,
      features: body.features,
    };
    const old: TextBlock | null = oldLabel
      ? text.layout(oldLabel, {
          style: oldStyle,
          maxWidth: priceRow ? colW * 0.34 : colW,
          maxLines: 1,
          lineHeight: 1.1,
          fit: { minSize: 2.8 * u },
        })
      : null;
    const oldW = old ? old.ink.x + old.ink.w : 0;
    const rowGap = old && priceRow ? 0.35 * comp.price * u : 0;

    // The new price: odometer wheels when it's a number, set type when it's words.
    const priceStyle = (size: number): TextStyle => ({
      font: display.font,
      italicFont: display.italic,
      size,
      weight: display.weight,
      width: display.width,
      tracking: 0,
      features: display.features,
    });
    const priceRoom = priceRow ? colW - oldW - rowGap : colW;
    let odometer: Odometer | null = null;
    let priceWords: TextBlock | null = null;
    if (newTyped) {
      const max = comp.price * u;
      const probe = createOdometer(text, priceStyle(max));
      const widest = Math.max(probe.width(newLabel), rolls ? probe.width(oldLabel) : 0);
      const size = widest > priceRoom ? Math.max(5 * u, (max * priceRoom) / widest) : max;
      odometer = size === max ? probe : createOdometer(text, priceStyle(size));
    } else if (newLabel) {
      priceWords = text.layout(newLabel, {
        style: priceStyle(comp.price * u * 0.8),
        maxWidth: priceRoom,
        maxLines: 2,
        lineHeight: display.lineHeight,
        align: priceRow ? 'left' : align,
        fit: { minSize: 4 * u },
      });
    }
    const roll = odometer && rolls ? priceRoll(odometer, oldLabel, newLabel) : null;
    const rollFrame = roll ? createRollFrame(roll) : null;
    const priceSize = odometer?.style.size ?? priceWords?.size ?? comp.price * u;
    const priceCap = odometer?.capHeight ?? priceWords?.capHeight ?? priceSize * 0.7;
    const priceHeight = priceWords ? priceWords.height : priceCap;
    const priceEndW = odometer ? odometer.width(newLabel) : (priceWords?.width ?? 0);

    // CTA pill: label in the text face at wght 600, an arrow drawn as a path (every font).
    const ctaText = props.cta.trim();
    const ctaSize = comp.cta * u;
    const arrowW = ctaSize * 0.95;
    const arrowGap = ctaSize * 0.6;
    const padX = ctaSize * 1.25;
    const ctaLabel: TextBlock | null = ctaText
      ? text.layout(ctaText, {
          style: {
            font: body.font,
            size: ctaSize,
            weight: 600,
            width: body.width,
            tracking: 0.01,
            features: body.features,
          },
          maxWidth: colW - 2 * padX - arrowW - arrowGap,
          maxLines: 1,
          lineHeight: 1.2,
          fit: { minSize: 2.4 * u },
        })
      : null;
    const pillH = ctaLabel ? ctaLabel.size * 2.55 : 0;
    const pillW = ctaLabel ? 2 * padX + ctaLabel.width + arrowGap + arrowW : 0;

    // --- the offer block (local: y = 0 is the name's cap height) ------------------------------
    let y = 0;
    const nameY = y;
    if (name) y += name.height;
    let oldBaseline = 0;
    let priceTop = 0;
    if (priceRow) {
      if (name) y += Math.max(3 * u, 0.28 * priceSize);
      priceTop = y;
      y += priceHeight;
      oldBaseline = priceTop + priceCap;
    } else {
      if (old) {
        if (name) y += 0.8 * oldStyle.size + u;
        oldBaseline = y + old.capHeight;
        y = oldBaseline + Math.max(2 * u, 0.3 * priceSize);
      } else if (name) {
        y += Math.max(2.6 * u, 0.28 * priceSize);
      }
      priceTop = y;
      y += priceHeight;
    }
    const priceBaseline = priceTop + priceCap;
    const ctaTop = ctaLabel ? y + Math.max(3.6 * u, 0.3 * priceSize) : y;
    const blockH = ctaLabel ? ctaTop + pillH : y;

    // Horizontal positions (frame coordinates).
    const rowW = oldW + rowGap + priceEndW;
    const oldX = priceRow ? alignX(align, anchor, rowW) : alignX(align, anchor, oldW);
    const priceAnchor = priceRow ? oldX + oldW + rowGap : anchor;
    const priceAlign: Align = priceRow ? 'left' : align;
    const pillX = alignX(align, anchor, pillW);

    // Vertical placement of the block and the product.
    const shadowRoom = 2.5 * u;
    let top: number;
    let productBox: Rect;
    /** Where the product's center wants to be (it stays inside its box). */
    let leanX: number;
    if (!stacked) {
      top = area.y + (area.h - blockH) * 0.5;
      const column: Rect = {
        x: productLeft ? area.x : areaRight - area.w * comp.column,
        y: area.y,
        w: area.w * comp.column,
        h: area.h,
      };
      productBox = {
        x: column.x,
        y: area.y + comp.sticker * u * 0.18,
        w: column.w * 0.94,
        h: Math.min(comp.product * frame.height, area.h - shadowRoom - comp.sticker * u * 0.18),
      };
      productBox.x = column.x + (column.w - productBox.w) / 2;
      leanX = column.x + column.w * (productLeft ? comp.lean : 1 - comp.lean);
    } else {
      top = areaBottom - blockH - (ctaLabel ? 0 : 1.5 * u);
      const gap = 6 * u;
      const roof = area.y + comp.sticker * u * 0.2;
      const floor = top - gap - shadowRoom;
      const h = Math.max(10 * u, Math.min(comp.stacked * frame.height, floor - roof));
      const w = colW * (align === 'center' ? 0.62 : 0.56);
      const cx =
        align === 'center' ? frame.cx : align === 'left' ? colX + colW * 0.36 : colX + colW * 0.64;
      productBox = { x: cx - w / 2, y: floor - h, w, h };
      leanX = cx;
    }

    // The product: fitted by its ink into the box, standing on the box's floor.
    const ink = product?.ink ?? { x: 0, y: 0, w: 1, h: 2 };
    const aspect = ink.w > 0 && ink.h > 0 ? ink.w / ink.h : 0.5;
    let productH = productBox.h;
    let productW = productH * aspect;
    if (productW > productBox.w) {
      productW = productBox.w;
      productH = productW / aspect;
    }
    const floorY = stacked ? productBox.y + productBox.h : area.y + (area.h + productH) / 2;
    const productRect: Rect = {
      x: Math.min(
        Math.max(leanX - productW / 2, productBox.x),
        productBox.x + productBox.w - productW,
      ),
      y: floorY - productH,
      w: productW,
      h: productH,
    };
    const pcx = productRect.x + productW / 2;
    // Opaque photos (JPG) get a rounded frame; cut-outs stand free.
    const photo =
      product?.kind === 'raster' &&
      ink.w * ink.h >= 0.985 * product.image.width * product.image.height;
    const photoRadius = 2.2 * u;

    // Offer block in frame coordinates.
    const offerY = top;
    const nameBounds = name ? shift(name.ink, colX, offerY + nameY) : null;
    const oldTop = offerY + oldBaseline - (old?.capHeight ?? 0);
    const oldBounds = old ? shift(old.ink, oldX, oldTop) : null;
    const priceLeft = alignX(priceAlign, priceAnchor, priceEndW);
    const priceBounds: Rect | null =
      odometer || priceWords
        ? {
            x: priceWords ? alignX(priceAlign, priceAnchor, colW) + priceWords.ink.x : priceLeft,
            y: offerY + priceTop + (priceWords ? priceWords.ink.y : 0),
            w: priceWords ? priceWords.ink.w : priceEndW,
            h: priceWords ? priceWords.ink.h : priceCap,
          }
        : null;
    const pill: Rect | null = ctaLabel
      ? { x: pillX, y: offerY + ctaTop, w: pillW, h: pillH }
      : null;
    let offer: Rect | null = null;
    for (const r of [nameBounds, oldBounds, priceBounds, pill]) {
      if (r) offer = offer ? unionRect(offer, r) : r;
    }

    // --- the sticker ------------------------------------------------------------------------
    const percent = oldTyped && newTyped ? savingPercent(oldTyped.value, newTyped.value) : null;
    // U+2212 (a true minus) where the display face has it.
    const minus = text.line('−', priceStyle(10 * u)).lines[0]?.glyphs[0]?.fallback ? '-' : '−';
    const badgeLabel =
      props.badge === 'off'
        ? ''
        : props.badge === 'custom'
          ? props.badgeText.trim()
          : percent !== null
            ? `${minus}${percent}%`
            : '';
    const radius = (comp.sticker * u) / 2;
    const sticker: TextBlock | null = badgeLabel
      ? text.layout(badgeLabel, {
          style: {
            font: display.font,
            italicFont: display.italic,
            size: radius * (props.badge === 'custom' ? 0.42 : 0.62),
            weight: display.weight,
            width: display.width,
            tracking: props.badge === 'custom' ? 0 : -0.02,
            case: props.badge === 'custom' ? 'upper' : 'none',
            features: display.features,
          },
          maxWidth: radius * 1.42,
          maxLines: 2,
          lineHeight: 0.98,
          align: 'center',
          fit: { minSize: radius * 0.2 },
        })
      : null;
    // On the product's upper corner facing the offer (or its free side when stacked).
    const outward = stacked ? align !== 'right' : productLeft;
    // It covers the product's edge by at most a third of the product, so thin ones stay visible.
    const cover = Math.min(radius * 0.9, productW * 0.34);
    let sx = outward ? productRect.x + productW + radius - cover : productRect.x - radius + cover;
    let sy = productRect.y + radius * 0.75;
    if (!stacked && offer) {
      const clear = 2 * u;
      if (outward) sx = Math.min(sx, offer.x - clear - radius);
      else sx = Math.max(sx, offer.x + offer.w + clear + radius);
    }
    sx = Math.min(Math.max(sx, area.x + radius), areaRight - radius);
    sy = Math.min(Math.max(sy, area.y + radius), areaBottom - radius);
    const stickerRect: Rect = { x: sx - radius, y: sy - radius, w: 2 * radius, h: 2 * radius };
    // The palette's own background on the sticker when it reads (cobalt on yellow), else the best.
    const stickerInk =
      contrastRatio(bg, accent) >= 4.5 ? bg : bestContrast(accent, [fg, WHITE, BLACK]);
    const productGroup = sticker ? unionRect(productRect, stickerRect) : productRect;

    // --- colors & light -----------------------------------------------------------------------
    const shadowColor = mixOklab(bg, BLACK, palette.dark ? 0.7 : 0.55);
    const contact = createContactShadow(shadowColor, palette.dark ? 1.25 : 1);
    const light = adjustLightness(bg, palette.dark ? 0.09 : 0.045);
    const spotR = Math.max(productH, productW * 1.5) * 0.95;
    const spot: Gradient = {
      kind: 'radial',
      cx: pcx,
      cy: productRect.y + productH * 0.55,
      r: spotR,
      stops: [
        { offset: 0, color: light },
        { offset: 0.45, color: withAlpha(light, 0.55) },
        { offset: 1, color: withAlpha(light, 0) },
      ],
    };
    const stickerShadow: Gradient = {
      kind: 'radial',
      cx: 0,
      cy: 0,
      r: radius * 1.18,
      stops: [
        { offset: 0.7, color: withAlpha(shadowColor, 0.32) },
        { offset: 0.86, color: withAlpha(shadowColor, 0.12) },
        { offset: 1, color: withAlpha(shadowColor, 0) },
      ],
    };

    // The strike: a slightly bowed stroke at −4° through the old price's figures.
    let strike: PathData | null = null;
    let strikeWidth = 0;
    if (old) {
      const inkMid = old.ink.x + old.ink.w / 2;
      const cy = oldBaseline - old.capHeight * 0.46;
      const half = old.ink.w / 2 + old.size * 0.14;
      const dx = Math.cos(STRIKE_ANGLE) * half;
      const dy = Math.sin(STRIKE_ANGLE) * half;
      const x0 = oldX + inkMid;
      const y0 = offerY + cy;
      strike = [
        ['M', x0 - dx, y0 - dy],
        ['Q', x0, y0 + old.size * 0.035, x0 + dx, y0 + dy],
      ];
      strikeWidth = Math.max(0.3 * u, old.size * 0.085);
    }

    // The CTA arrow (shaft + chevron), relative to its left end on the label's middle.
    const head = arrowW * 0.36;
    const arrow: PathData = [
      ['M', 0, 0],
      ['L', arrowW, 0],
      ['M', arrowW - head, -head],
      ['L', arrowW, 0],
      ['L', arrowW - head, head],
    ];

    // --- motion (Balanced seconds; energy scales the in/out windows) ------------------------
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    const riseFrom = ctx.travel(24 * u);
    const hop = calm ? 0 : punchy ? 2.6 * u : 1.6 * u;
    const squash = calm ? 0.012 : punchy ? 0.05 : 0.03;
    const spinFrom = calm ? -80 : -200;
    const turns = calm ? 0 : 1;
    const rollGap = ctx.stagger(calm ? 0.08 : 0.06);
    const rollDur = calm ? 0.62 : 0.5;
    const punch = calm ? 0.05 : punchy ? 0.16 : 0.12;
    const wobble = calm ? 1.2 : 2;
    const hold = timeline.sections.hold;
    const lastDigit = roll ? Math.max(0, roll.digits - 1) : 0;
    const landed = 1.55 + lastDigit * rollGap + rollDur;
    const stickerStart = Math.max(2.1, landed - 0.05);

    const drawProduct = (g: Draw, opacity: number) => {
      if (!product) return;
      if (photo) {
        g.clip({ rect: productRect, radius: photoRadius }, (g) =>
          g.graphic(product, productRect, { opacity }),
        );
      } else {
        g.graphic(product, productRect, { opacity });
      }
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        // --- product: rises, hops, lands with a squash; floats in the hold; sinks away -------
        const shown = tl.p(t, 'in', { dur: 0.3 }, 'drift');
        const gone = tl.p(t, 'out', { delay: 0.14, dur: 0.36 }, 'exit');
        const productAlpha = shown * (1 - gone);
        let lift = 0;
        let squashed = 0;
        if (calm) {
          lift = -riseFrom * (1 - tl.p(t, 'in', { dur: 0.75 }, 'glide'));
          squashed = squash * bump(tl.local(t, 'in') / energy.time - 0.62, 10, 0.3);
        } else {
          const up = tl.p(t, 'in', { dur: 0.46 }, 'glide');
          const down = tl.p(t, 'in', { delay: 0.46, dur: 0.14 }, 'exit');
          lift = -riseFrom * (1 - up) + hop * up * (1 - down);
          const hit = tl.p(t, 'in', { delay: 0.58, dur: 0.05 }, 'swift');
          const rebound = tl.p(t, 'in', { delay: 0.63, dur: 0.24 }, 'glide');
          squashed = squash * hit * (1 - rebound);
        }
        const floatTime = t - hold.start;
        const floatIn = tl.p(t, 'hold', { dur: 0.9 }, 'drift');
        const float = 0.4 * u * floatIn * (1 - Math.cos((2 * Math.PI * floatTime) / 3.2)) * 0.5;
        lift += float * 2 - gone * ctx.travel(10 * u);
        // Height above the floor, as a share of the product's width (below the floor = rising in).
        const air = Math.abs(lift) / Math.max(productW, 8 * u);

        const lit =
          tl.p(t, 'in', { dur: 0.9 }, 'drift') *
          (1 - tl.p(t, 'out', { delay: 0.1, dur: 0.4 }, 'drift'));

        g.movable('product', productGroup, (g) => {
          if (lit > 0) g.circle(spot.cx, spot.cy, spotR, { fill: spot, opacity: lit });
          if (props.shadow && productAlpha > 0) {
            contact.draw(
              g,
              pcx,
              floorY + 0.2 * u,
              productW * (photo ? 0.95 : 1),
              air,
              productAlpha * (1 - Math.min(1, air * 1.2)) ** 0.5,
            );
          }
          if (productAlpha > 0) {
            const sy = 1 - squashed;
            g.group({ y: -lift, scaleX: 1 / sy, scaleY: sy, originX: pcx, originY: floorY }, (g) =>
              drawProduct(g, productAlpha),
            );
          }
          g.editable('product', productRect);

          // --- sticker: spins in, wobbles, spins away ------------------------------------------
          if (sticker) {
            const local = t - tl.at('in', stickerStart);
            const inP = punchy
              ? spring(local, 0, 1, 'lively')
              : tl.p(t, 'in', { delay: stickerStart, dur: 0.42 }, calm ? 'glide' : 'pop');
            const outP = tl.p(t, 'out', { delay: 0.04, dur: 0.26 }, 'exit');
            const scale = Math.max(0, inP) * (1 - outP);
            if (scale > 0.001) {
              const turn = tl.p(t, 'in', { delay: stickerStart, dur: 0.55 }, 'glide');
              const sway = wobble * Math.sin((2 * Math.PI * floatTime) / 2.6) * floatIn;
              const pulse = punchy ? 0.04 * bump(floatTime, 1, 0.35) : 0;
              g.group(
                {
                  x: sx,
                  // Stuck on the product: it rides the product's float.
                  y: sy - float * 2,
                  rotate: spinFrom + (-12 - spinFrom) * turn + sway + outP * 40,
                  scale: scale * (1 + pulse),
                },
                (g) => {
                  g.circle(0.35 * u, 0.9 * u, radius * 1.18, { fill: stickerShadow });
                  g.circle(0, 0, radius, { fill: accent });
                  g.circle(0, 0, radius * 0.87, {
                    stroke: { color: withAlpha(stickerInk, 0.5), width: 0.2 * u },
                  });
                  g.text(sticker, {
                    fill: stickerInk,
                    x: -radius * 0.71,
                    y: -sticker.height / 2,
                  });
                },
              );
              g.editable(props.badge === 'custom' ? 'badgeText' : 'badge', stickerRect);
            }
          }
        });

        // --- the offer ------------------------------------------------------------------------
        if (!offer) return;
        const drop = (p: number) => p * 1.5 * u;
        g.movable('offer', offer, (g) => {
          // Name: rises out of its line mask.
          if (name && nameBounds) {
            const out = tl.p(t, 'out', { delay: 0.12, dur: 0.28 }, 'exit');
            if (out < 1) {
              const nx = colX;
              name.lines.forEach((line, i) => {
                const p = tl.p(
                  t,
                  'in',
                  { delay: 0.4 + i * ctx.stagger(0.06), dur: 0.5 },
                  energy.enter,
                );
                if (p <= 0) return;
                const mask = shift(line.mask, nx, offerY + nameY);
                g.clip(mask, (g) =>
                  g.text(line, {
                    fill: fg,
                    x: nx,
                    y: offerY + nameY + (1 - p) * mask.h * 1.05 + out * mask.h * 1.05,
                  }),
                );
              });
              g.editable('name', nameBounds);
            }
          }

          // Old price: fades in, is struck through at −4°, dims and drops 1u.
          if (old && oldBounds) {
            const shownOld = tl.p(t, 'in', { delay: 1, dur: 0.3 }, 'glide');
            const struck = tl.p(t, 'in', { delay: 1.3, dur: 0.3 }, 'snap');
            const outOld = tl.p(t, 'out', { delay: 0.1, dur: 0.28 }, 'exit');
            const alpha = shownOld * (1 - 0.5 * struck) * (1 - outOld);
            if (alpha > 0) {
              const oy = (1 - shownOld) * u + struck * u + drop(outOld);
              g.group({ y: oy }, (g) => {
                g.text(old, { fill: fg, x: oldX, y: oldTop, opacity: alpha });
                if (strike && struck > 0) {
                  g.path(strike, {
                    stroke: {
                      color: accent,
                      width: strikeWidth,
                      cap: 'round',
                      trim: [0, struck],
                    },
                    opacity: 1 - outOld,
                  });
                }
              });
              g.editable('oldPrice', oldBounds);
            }
          }

          // New price: rises into view showing the old price, rolls to the new one, punches.
          if (priceBounds) {
            const reveal = tl.p(t, 'in', { delay: 1.45, dur: 0.35 }, energy.enter);
            const outPrice = tl.p(t, 'out', { delay: 0.08, dur: 0.28 }, 'exit');
            if (reveal > 0 && outPrice < 1) {
              const kick = tl.p(t, 'in', { delay: landed - 0.07, dur: 0.07 }, 'swift');
              const settle = tl.p(t, 'in', { delay: landed, dur: 0.4 }, calm ? 'glide' : 'pop');
              const scale = 1 + punch * kick * (1 - settle);
              const baseline = offerY + priceBaseline;
              const originX = priceRow ? priceLeft : anchor;
              const window: Rect = {
                x: priceBounds.x - priceSize,
                y: offerY + priceTop - priceSize * 0.35,
                w: priceBounds.w + 2 * priceSize,
                h: priceHeight + priceSize * 0.55,
              };
              const draw = (g: Draw) =>
                g.group(
                  {
                    y: (1 - reveal) * window.h + drop(outPrice),
                    scale,
                    originX,
                    originY: baseline - priceCap / 2,
                  },
                  (g) => {
                    const opacity = 1 - outPrice;
                    if (odometer && roll && rollFrame) {
                      for (let i = 0; i < roll.slots.length; i++) {
                        const order = roll.order[i] ?? -1;
                        const at = 1.55 + Math.max(0, order) * rollGap;
                        rollFrame.progress[i] =
                          order < 0
                            ? tl.p(
                                t,
                                'in',
                                { delay: 1.55, dur: rollDur + lastDigit * rollGap },
                                'snap',
                              )
                            : tl.p(t, 'in', { delay: at, dur: rollDur }, calm ? 'drift' : 'snap');
                      }
                      rollFrame.turns = turns;
                      drawRoll(g, roll, rollFrame, {
                        x: priceAnchor,
                        y: baseline,
                        fill: fg,
                        align: priceAlign,
                        opacity,
                      });
                    } else if (odometer) {
                      odometer.draw(g, newLabel, {
                        x: priceAnchor,
                        y: baseline,
                        fill: fg,
                        align: priceAlign,
                        opacity,
                      });
                    } else if (priceWords) {
                      g.text(priceWords, {
                        fill: fg,
                        x: alignX(priceAlign, priceAnchor, colW),
                        y: offerY + priceTop,
                        opacity,
                      });
                    }
                  },
                );
              if (reveal < 1) g.clip(window, draw);
              else draw(g);
              g.editable('newPrice', priceBounds);
            }
          }

          // CTA: the pill slides in, its arrow follows and nudges forward in the hold.
          if (ctaLabel && pill) {
            const inP = tl.p(t, 'in', { delay: 2.5, dur: 0.4 }, energy.enter);
            const fade = tl.p(t, 'in', { delay: 2.5, dur: 0.25 }, 'drift');
            const outP = tl.p(t, 'out', { dur: 0.25 }, 'exit');
            const alpha = fade * (1 - outP);
            if (alpha > 0) {
              const from = align === 'right' ? 1 : align === 'center' ? 0 : -1;
              const dx = from * (1 - inP) * ctx.travel(5 * u);
              const dy = align === 'center' ? (1 - inP) * 2 * u : 0;
              const arrowIn = tl.p(t, 'in', { delay: 2.62, dur: 0.36 }, energy.enter);
              const nudge = calm ? 0 : bump(floatTime - 0.6, punchy ? 1 : 2, 0.45) * ctaSize * 0.3;
              g.group({ x: dx, y: dy + drop(outP) * 0.5, opacity: alpha }, (g) => {
                g.roundRect(pill, pillH / 2, { fill: fg });
                const lx = pill.x + padX;
                const midY = pill.y + pillH / 2;
                g.text(ctaLabel, { fill: bg, x: lx, y: midY - ctaLabel.height / 2 });
                const ax = lx + ctaLabel.width + arrowGap - (1 - arrowIn) * arrowGap + nudge;
                g.group({ x: ax, y: midY, opacity: arrowIn }, (g) =>
                  g.path(arrow, {
                    stroke: {
                      color: bg,
                      width: ctaLabel.size * 0.11,
                      cap: 'round',
                      join: 'round',
                    },
                  }),
                );
              });
              g.editable('cta', pill);
            }
          }
        });
      },
    };
  },
});
