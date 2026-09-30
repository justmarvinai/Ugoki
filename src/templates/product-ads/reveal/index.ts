/**
 * Reveal — hero launch (docs/templates/04-product-ads.md §4.3).
 *
 * The expensive detail: one light does all the work. The product waits in darkness until a band
 * of light sweeps up through it — a soft gradient matte lights it from below, and a brighter
 * rim at the band's leading edge lifts the material itself (the product brightened and cast in
 * the light's color, masked to the band), so it reads as light raking a surface rather than a
 * wipe. The same light shows in the floor reflection (flipped, faded, blurred) as it reaches the
 * product's foot, lifts the haze in the air while it passes, and grazes the product again every
 * few seconds of the hold. No other decoration.
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
  mixOklab,
  type Rect,
  rgb,
  type TextBlock,
  type TextLine,
  unionRect,
  withAlpha,
} from '@/engine';
import { bakeReflection, bakeRim, type Grade } from './rim';

type Composition = {
  /** `side`: product left, type right (16:9); `stack`: product above centered type. */
  layout: 'side' | 'stack';
  /** Name (display face), tagline and availability sizes (text face), in u. */
  name: number;
  tagline: number;
  availability: number;
  /** Largest product height (share of the layout area's height) and width (share of its width). */
  productH: number;
  productW: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': {
    layout: 'side',
    name: 10.5,
    tagline: 3.3,
    availability: 2.5,
    productH: 0.72,
    productW: 0.36,
  },
  '1:1': {
    layout: 'stack',
    name: 7.6,
    tagline: 3.2,
    availability: 2.4,
    productH: 0.54,
    productW: 0.5,
  },
  '4:5': {
    layout: 'stack',
    name: 7.6,
    tagline: 3.3,
    availability: 2.4,
    productH: 0.58,
    productW: 0.5,
  },
  '9:16': {
    layout: 'stack',
    name: 8.6,
    tagline: 3.7,
    availability: 2.8,
    productH: 0.56,
    productW: 0.56,
  },
};

/** The band travels up, tilted this much (degrees) — a studio light, not a scanner. */
const TILT = -7;
const WHITE: Color = rgb(1, 1, 1);
/** Tungsten-ish warm white. */
const WARM: Color = rgb(1, 0.86, 0.68);
/** Name tracking at rest (all caps get a little air) and how far it tracks in from (em). */
const TRACK_CAPS = 0.06;
const TRACK_FROM = 0.5;

/** Unit gradients (0..1 along y), stretched per frame by group transforms. */
const RAMP: Gradient = {
  kind: 'linear',
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 1,
  stops: [0, 0.2, 0.4, 0.6, 0.8, 1].map((offset) => ({
    offset,
    color: withAlpha(WHITE, offset * offset * (3 - 2 * offset)),
  })),
};
const BAND: Gradient = {
  kind: 'linear',
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 1,
  stops: [0, 0.15, 0.3, 0.42, 0.5, 0.58, 0.7, 0.85, 1].map((offset) => ({
    offset,
    color: withAlpha(
      WHITE,
      Math.exp(-((offset - 0.5) ** 2) / 0.03) * (offset > 0 && offset < 1 ? 1 : 0),
    ),
  })),
};

export default defineTemplate({
  id: 'reveal',
  version: 1,
  meta: {
    name: 'Reveal',
    tagline: 'Hero launch',
    category: 'product-ads',
    tags: ['product', 'launch', 'reveal', 'premium', 'light'],
    useCases: ['Product launches', 'Coming soon', 'Premium announcements', 'Hardware reveals'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 7, min: 5, max: 15 },
  alpha: 'none',
  poster: 4.9,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'film' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'mono-dark' },
    { kind: 'library', id: 'forest' },
  ],
  pairings: ['wide', 'grotesk', 'technical', 'editorial', 'classic'],
  controls: {
    product: c.image({
      label: 'Product image',
      accept: 'object',
      default: { kind: 'placeholder', id: 'object-watch' },
    }),
    name: c.text({ label: 'Name', default: 'ORBIT', maxLength: 20, primary: true }),
    tagline: c.text({
      label: 'Tagline',
      default: 'Made to move with you.',
      maxLength: 60,
      optional: true,
    }),
    availability: c.text({
      label: 'Availability',
      default: 'Available 10.10',
      maxLength: 28,
      optional: true,
      hint: 'A launch date or a call to action',
    }),
    light: c.choice({
      label: 'Light color',
      default: 'white',
      options: [
        { value: 'white', label: 'White' },
        { value: 'warm', label: 'Warm' },
        { value: 'accent', label: 'Accent' },
      ],
    }),
    reflection: c.toggle({ label: 'Reflection', default: true }),
  },
  looks: [
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'wide' },
    {
      id: 'midnight',
      name: 'Midnight',
      palette: { kind: 'library', id: 'midnight' },
      pairing: 'wide',
      values: { light: 'accent' },
    },
    {
      id: 'film',
      name: 'Film',
      palette: { kind: 'library', id: 'film' },
      pairing: 'editorial',
      values: { light: 'warm' },
    },
  ],
  timing: ({ props }) => ({ in: 3.9, out: 0.8, tail: CLEAN_END, readable: props.name }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const product = ctx.graphic('product');
    const display = pairing.display;
    const body = pairing.text;
    const side = comp.layout === 'side';

    // --- type -------------------------------------------------------------------------------
    // Centered type is symmetric around the frame's center, even where the social zone isn't.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const textW = side ? area.w * 0.44 : half * 2;
    const align = side ? 'left' : 'center';
    const nameText = props.name.trim();
    const caps = nameText === nameText.toUpperCase() && nameText !== nameText.toLowerCase();
    const trackRest = display.tracking + (caps ? TRACK_CAPS : 0);
    const name: TextBlock | null = nameText
      ? text.layout(nameText, {
          style: {
            font: display.font,
            italicFont: display.italic,
            size: comp.name * u,
            weight: display.weight,
            width: display.width,
            tracking: trackRest,
            features: display.features,
          },
          maxWidth: textW,
          maxLines: 2,
          lineHeight: display.lineHeight + 0.04,
          align,
          fit: { minSize: 3.6 * u },
        })
      : null;
    const taglineText = props.tagline.trim();
    const taglineW = side ? textW : Math.min(textW, 70 * u);
    const tagline: TextBlock | null = taglineText
      ? text.layout(taglineText, {
          style: {
            font: body.font,
            size: comp.tagline * u,
            weight: 450,
            width: body.width,
            tracking: 0.005,
            features: body.features,
          },
          maxWidth: taglineW,
          maxLines: 2,
          lineHeight: 1.3,
          align,
          fit: { minSize: 2.6 * u },
        })
      : null;
    const availabilityText = props.availability.trim();
    const pillSize = comp.availability * u;
    const padX = pillSize * 1.15;
    const availability: TextBlock | null = availabilityText
      ? text.layout(availabilityText, {
          style: {
            font: body.font,
            size: pillSize,
            weight: 600,
            width: body.width,
            tracking: 0.04,
            features: body.features,
          },
          maxWidth: textW - 2 * padX,
          maxLines: 1,
          lineHeight: 1.2,
          fit: { minSize: 2.4 * u },
        })
      : null;
    const pillH = availability ? availability.size * 2.5 : 0;
    const pillW = availability ? availability.width + 2 * padX : 0;

    // The type block (local: y = 0 is the name's cap height).
    let y = 0;
    const nameY = y;
    if (name) y += name.height;
    const taglineY = tagline ? y + (name ? 0.32 * name.size + 2.2 * u : 0) : y;
    if (tagline) y = taglineY + tagline.height;
    const pillY = availability ? y + (name || tagline ? 4.2 * u : 0) : y;
    if (availability) y = pillY + pillH;
    const typeH = y;

    // --- product box --------------------------------------------------------------------------
    const ink = product?.ink ?? { x: 0, y: 0, w: 1, h: 2 };
    const aspect = ink.w > 0 && ink.h > 0 ? ink.w / ink.h : 0.5;
    const fitBox = (maxH: number, maxW: number) => {
      let h = maxH;
      let w = h * aspect;
      if (w > maxW) {
        w = maxW;
        h = w / aspect;
      }
      return { w, h };
    };

    let productRect: Rect;
    let typeX: number;
    let typeTop: number;
    if (side) {
      // Product and type side by side as one lockup, centered in the frame; the product stands
      // a little low so its reflection has the floor, the type centered on it.
      const size = fitBox(area.h * comp.productH, area.w * comp.productW);
      const typeWidth = Math.max(name?.width ?? 0, tagline?.width ?? 0, pillW);
      const gap = Math.max(9 * u, size.w * 0.3);
      const lockupW = size.w + gap + typeWidth;
      const left = Math.max(area.x, frame.cx - lockupW / 2);
      const floor = area.y + area.h * 0.8;
      productRect = { x: left, y: floor - size.h, w: size.w, h: size.h };
      typeX = left + size.w + gap;
      typeTop = productRect.y + (size.h - typeH) * 0.5;
    } else {
      // Product on top, its reflection, then the type centered below.
      const gap = 6 * u;
      const room = area.h - typeH - gap;
      const size = fitBox(Math.min(room / 1.18, area.h * comp.productH), area.w * comp.productW);
      const total = size.h * 1.18 + gap + typeH;
      const top = area.y + (area.h - total) * 0.45;
      productRect = { x: frame.cx - size.w / 2, y: top, w: size.w, h: size.h };
      typeX = frame.cx - textW / 2;
      typeTop = top + size.h * 1.18 + gap;
    }
    const { w: productW, h: productH } = productRect;
    const pcx = productRect.x + productW / 2;
    const pcy = productRect.y + productH / 2;
    const floorY = productRect.y + productH;
    const photo =
      product?.kind === 'raster' &&
      ink.w * ink.h >= 0.985 * product.image.width * product.image.height;

    // Type positions (frame coordinates).
    const taglineX = side ? typeX : frame.cx - taglineW / 2;
    const pillX = side ? typeX : frame.cx - pillW / 2;
    const shift = (r: Rect, x: number, yy: number): Rect => ({
      x: r.x + x,
      y: r.y + yy,
      w: r.w,
      h: r.h,
    });
    const nameBounds = name ? shift(name.ink, typeX, typeTop + nameY) : null;
    const taglineBounds = tagline ? shift(tagline.ink, taglineX, typeTop + taglineY) : null;
    const pill: Rect | null = availability
      ? { x: pillX, y: typeTop + pillY, w: pillW, h: pillH }
      : null;
    let typeBounds: Rect | null = null;
    for (const r of [nameBounds, taglineBounds, pill]) {
      if (r) typeBounds = typeBounds ? unionRect(typeBounds, r) : r;
    }

    // --- light --------------------------------------------------------------------------------
    const light = props.light === 'warm' ? WARM : props.light === 'accent' ? accent : WHITE;
    const hazeColor = mixOklab(bg, light, 0.6);
    const hazeR = Math.max(productH * 0.95, productW * 1.6);
    const haze: Gradient = {
      kind: 'radial',
      cx: 0,
      cy: 0,
      r: 1,
      stops: [0, 0.2, 0.4, 0.6, 0.8, 1].map((offset) => ({
        offset,
        color: withAlpha(hazeColor, Math.exp(-3.2 * offset * offset) * (offset < 1 ? 1 : 0)),
      })),
    };
    // The band sweeps through the product's extent along its (tilted) axis.
    const rad = (TILT * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.abs(Math.sin(rad));
    const reach = (productH * cos + productW * sin) / 2;
    const soft = productH * (energy.id === 'calm' ? 0.38 : energy.id === 'punchy' ? 0.22 : 0.3);
    const rim = productH * (energy.id === 'punchy' ? 0.1 : 0.13);
    const wide = Math.hypot(productW, productH) + 8 * u;
    const bounds: Rect = {
      x: productRect.x - 2 * u,
      y: productRect.y - 2 * u,
      w: productW + 4 * u,
      h: productH + 4 * u,
    };
    // Edge position along the band axis (local y, 0 = product center): from below the product
    // (s = 0) to above it (s = 1), with room for the soft ramp and the rim.
    const edgeAt = (s: number) => reach + soft + rim - s * (2 * reach + 2 * soft + 2 * rim);
    // The rim light: the product lit (brightened and cast in the light's color) and a glow of
    // its brightest parts — metal, glass, print glint as the band crosses them. Baked once.
    const grade: Grade = {
      brightness: palette.dark ? 1.85 : 1.35,
      contrast: 1.05,
      tint: { color: light, amount: props.light === 'white' ? 0.12 : 0.4 },
    };
    /** Design units per product-image pixel. */
    const perPixel = productW / Math.max(1, ink.w);
    const rimImages = bakeRim(product, grade, 0.6, (1.3 * u) / perPixel);
    const glint = palette.dark ? 0.95 : 0.4;
    const imageDest: Rect = rimImages
      ? {
          x: productRect.x + (rimImages.area.x - ink.x) * perPixel,
          y: productRect.y + (rimImages.area.y - ink.y) * perPixel,
          w: rimImages.area.w * perPixel,
          h: rimImages.area.h * perPixel,
        }
      : productRect;
    const glowDest: Rect | null = rimImages
      ? {
          x: imageDest.x - rimImages.padX * imageDest.w,
          y: imageDest.y - rimImages.padY * imageDest.h,
          w: imageDest.w * (1 + 2 * rimImages.padX),
          h: imageDest.h * (1 + 2 * rimImages.padY),
        }
      : null;
    const rimBounds: Rect = {
      x: productRect.x - 5 * u,
      y: productRect.y - 5 * u,
      w: productW + 10 * u,
      h: productH + 10 * u,
    };

    // --- reflection -------------------------------------------------------------------------
    // Baked once (flipped, faded, blurred); drawn live only for vector artwork.
    const reflect = props.reflection;
    const DEPTH = 0.34;
    const PEAK = 0.3;
    const depth = productH * DEPTH;
    const reflection = reflect ? bakeReflection(product, DEPTH, PEAK, (0.45 * u) / perPixel) : null;
    const reflectionDest: Rect | null = reflection
      ? {
          x: productRect.x + reflection.x * productW,
          y: floorY,
          w: reflection.w * productW,
          h: reflection.h * productH,
        }
      : null;
    const reflectionBounds: Rect = {
      x: productRect.x - 3 * u,
      y: floorY,
      w: productW + 6 * u,
      h: depth + 2 * u,
    };
    const fade: Gradient = {
      kind: 'linear',
      x0: 0,
      y0: floorY,
      x1: 0,
      y1: floorY + depth,
      stops: [0, 0.15, 0.35, 0.6, 1].map((offset) => ({
        offset,
        color: withAlpha(WHITE, PEAK * (1 - offset) ** 2.2),
      })),
    };

    // --- motion (Balanced seconds; energy scales the in/out windows) ------------------------
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    const sweepCurve = punchy ? 'snap' : 'drift';
    const rimPeak = calm ? 0.8 : punchy ? 1 : 0.92;
    const hold = timeline.sections.hold;
    const every = calm ? 4 : punchy ? 2 : 3;
    const pass = 1.25;
    const trackFrom = TRACK_FROM * (0.6 + 0.4 * energy.travel);
    const blurFrom = 2.2 * energy.blur;
    const pushTo = 1 + 0.04 * (calm ? 0.8 : 1);

    const nameFirst = name?.lines.map((line) => line.glyphs[0]?.index ?? 0) ?? [];
    const namePivot = name?.lines.map((line) => (side ? 0 : (line.glyphs.length - 1) / 2)) ?? [];
    const motion: GlyphTransform = { dx: 0 };
    let spread = 0;
    const trackGlyph = (glyph: Glyph, line: TextLine): GlyphTransform => {
      const k = glyph.index - (nameFirst[line.index] ?? 0) - (namePivot[line.index] ?? 0);
      motion.dx = spread * k;
      return motion;
    };
    const nameArea: Rect | null = nameBounds
      ? {
          x: nameBounds.x - (side ? 1 : 6) * u - (side ? 0 : nameBounds.w * trackFrom),
          y: nameBounds.y - 4 * u,
          w: nameBounds.w * (1 + trackFrom * 2) + 12 * u,
          h: nameBounds.h + 8 * u,
        }
      : null;

    const drawProduct = (g: Draw) => {
      if (!product) return;
      if (photo) {
        g.clip({ rect: productRect, radius: 1.6 * u }, (g) => g.graphic(product, productRect));
      } else {
        g.graphic(product, productRect);
      }
    };

    /** The band's matte, rotated with the band: `edge` in band space, drawn relative to (pcx, pcy). */
    const bandMatte = (g: Draw, edge: number, lit: boolean, rimmed: boolean) =>
      g.group({ x: pcx, y: pcy, rotate: TILT }, (g) => {
        if (lit) {
          // Lit below the edge, a soft ramp above it.
          g.rect({ x: -wide / 2, y: edge, w: wide, h: 3 * wide }, { fill: WHITE });
          g.group({ y: edge - soft, scaleY: soft }, (g) =>
            g.rect({ x: -wide / 2, y: 0, w: wide, h: 1 }, { fill: RAMP }),
          );
        }
        if (rimmed) {
          g.group({ y: edge - soft * 0.45 - rim, scaleY: 2 * rim }, (g) =>
            g.rect({ x: -wide / 2, y: 0, w: wide, h: 1 }, { fill: BAND }),
          );
        }
      });

    const drawLit = (g: Draw) => {
      if (!rimImages || !glowDest) {
        g.fx({ adjust: grade, bounds }, drawProduct);
        return;
      }
      if (photo) {
        g.clip({ rect: productRect, radius: 1.6 * u }, (g) => g.image(rimImages.lit, imageDest));
      } else {
        g.image(rimImages.lit, imageDest);
      }
      g.group({ blend: 'lighter', opacity: glint }, (g) => g.image(rimImages.glow, glowDest));
    };

    const drawRim = (g: Draw, edge: number, strength: number) => {
      if (strength <= 0.01) return;
      g.group({ opacity: Math.min(1, strength) }, (g) =>
        g.mask((g) => bandMatte(g, edge, false, true), drawLit, { bounds: rimBounds }),
      );
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        const out = tl.p(t, 'out', { delay: 0.1, dur: 0.7 }, 'drift');
        const typeOut = tl.p(t, 'out', { dur: 0.5 }, 'drift');
        const push = 1 + (pushTo - 1) * tl.p(t, 'hold', {}, 'drift');
        const typePush = 1 + (push - 1) * 0.35;

        // The main sweep and the faint passes of the hold.
        const s = tl.p(t, 'in', { delay: 0.6, dur: 1.4 }, sweepCurve);
        const edge = edgeAt(s);
        const revealed = s >= 1;
        let late = -1;
        let lateStrength = 0;
        const since = t - hold.start - 0.5;
        if (since > 0) {
          const start = 0.5 + Math.floor(since / every) * every;
          if (hold.start + start + pass <= hold.end - 0.1) {
            const q = (t - hold.start - start) / pass;
            if (q > 0 && q < 1) {
              late = tl.p(t, 'hold', { delay: start, dur: pass }, 'drift');
              lateStrength = Math.sin(Math.PI * q) ** 0.5;
            }
          }
        }
        // How much the light is "in the air": up while the band crosses the product.
        const crossing = s > 0 && s < 1 ? Math.sin(Math.PI * s) : 0;

        g.movable('product', productRect, (g) => {
          g.group({ scale: push, originX: pcx, originY: floorY, opacity: 1 - out }, (g) => {
            // Haze: faint light in the air around the product, lifted by the passing band.
            const hazeIn = tl.p(t, 'in', { dur: 0.8 }, 'drift');
            const hazeAlpha = hazeIn * (0.05 + 0.035 * crossing) * (palette.dark ? 1 : 0.6);
            if (hazeAlpha > 0) {
              g.group(
                { x: pcx, y: pcy + productH * 0.05, scaleX: hazeR * 1.15, scaleY: hazeR },
                (g) => g.circle(0, 0, 1, { fill: haze, opacity: hazeAlpha }),
              );
            }

            // Reflection: the lit product, flipped at the floor, faded and softened.
            if (reflect && product) {
              const lit = revealed ? 1 : Math.min(1, Math.max(0, (s - 0.04) / 0.3));
              if (lit > 0 && reflection && reflectionDest) {
                g.image(reflection.image, reflectionDest, { opacity: lit });
              } else if (lit > 0) {
                g.group({ opacity: lit }, (g) =>
                  g.fx({ blur: 0.45, bounds: reflectionBounds }, (g) =>
                    g.mask(
                      (g) => g.rect(reflectionBounds, { fill: fade }),
                      (g) => g.group({ scaleY: -1, originY: floorY }, drawProduct),
                      { bounds: reflectionBounds },
                    ),
                  ),
                );
              }
            }

            // The product: lit by the band's matte until the sweep is through.
            if (s > 0) {
              if (revealed) drawProduct(g);
              else g.mask((g) => bandMatte(g, edge, true, false), drawProduct, { bounds });
              if (!revealed) drawRim(g, edge, rimPeak * Math.min(1, s * 6));
            }
            if (late >= 0) drawRim(g, edgeAt(late), 0.42 * rimPeak * lateStrength);
            g.editable('product', productRect);
          });
        });

        // --- type -------------------------------------------------------------------------
        if (!typeBounds) return;
        const tcx = typeBounds.x + typeBounds.w / 2;
        const tcy = typeBounds.y + typeBounds.h / 2;
        g.movable('type', typeBounds, (g) => {
          g.group({ scale: typePush, originX: tcx, originY: tcy, opacity: 1 - typeOut }, (g) => {
            // Name: letters track in while they come into focus.
            if (name && nameBounds && nameArea) {
              const p = tl.p(t, 'in', { delay: 1.8, dur: 1.2 }, punchy ? 'snap' : 'glide');
              const shown = tl.p(t, 'in', { delay: 1.8, dur: 0.7 }, 'drift');
              if (shown > 0) {
                spread = trackFrom * name.size * (1 - p);
                const blur = blurFrom * (1 - p);
                const draw = (g: Draw) =>
                  g.text(name, {
                    fill: fg,
                    x: typeX,
                    y: typeTop + nameY,
                    glyph: p < 1 ? trackGlyph : undefined,
                  });
                if (blur > 0.02) g.fx({ blur, opacity: shown, bounds: nameArea }, draw);
                else if (shown < 1) g.layer({ opacity: shown, bounds: nameArea }, draw);
                else draw(g);
              }
              g.editable('name', nameBounds);
            }

            // Tagline: fades up.
            if (tagline && taglineBounds) {
              const p = tl.p(t, 'in', { delay: 2.7, dur: 0.7 }, 'glide');
              if (p > 0) {
                g.text(tagline, {
                  fill: muted,
                  x: taglineX,
                  y: typeTop + taglineY + (1 - p) * 1.4 * u,
                  opacity: p,
                });
              }
              g.editable('tagline', taglineBounds);
            }

            // Availability: a hairline pill in the accent.
            if (availability && pill) {
              const p = tl.p(t, 'in', { delay: 3.4, dur: 0.5 }, punchy ? 'pop' : 'glide');
              const alpha = tl.p(t, 'in', { delay: 3.4, dur: 0.35 }, 'drift');
              if (alpha > 0) {
                const px = pill.x + pill.w / 2;
                const py = pill.y + pill.h / 2;
                g.group(
                  {
                    y: (1 - Math.min(1, p)) * 1.2 * u,
                    scale: punchy ? 0.9 + 0.1 * p : 1,
                    originX: px,
                    originY: py,
                    opacity: alpha,
                  },
                  (g) => {
                    g.roundRect(pill, pill.h / 2, {
                      stroke: { color: accent, width: Math.max(0.16 * u, g.pixel) },
                    });
                    g.text(availability, {
                      fill: accent,
                      x: pill.x + padX,
                      y: py - availability.height / 2,
                    });
                  },
                );
              }
              g.editable('availability', pill);
            }
          });
        });
      },
    };
  },
});
