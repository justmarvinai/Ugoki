/**
 * Review — testimonial with rating (docs/templates/06-brand-quotes.md §6.2).
 *
 * The expensive detail: the stars fill from one continuous value — the same value the rating
 * counts up with — so the fill runs across the row in step with the number and lands exactly on
 * the rating: 4.9 leaves the fifth star filled to 90% of its width (clipped to the star's exact
 * ink box), on the frame the number lands.
 */

import {
  bestContrast,
  CLEAN_END,
  c,
  createOdometer,
  type Draw,
  defineTemplate,
  type Figure,
  type FormatId,
  formatFigure,
  initials,
  type Rect,
  type TextBlock,
  type TextLine,
  type Timeline,
  unionRect,
  withAlpha,
} from '@/engine';
import { checkPath, roundedStar } from './shapes';

type Composition = {
  /** Width of one star (u). */
  star: number;
  /** Largest and smallest quote size (u). */
  quote: number;
  min: number;
  /** Name size (u) and avatar diameter (u). */
  name: number;
  avatar: number;
  /** Widest the quote may get, as a share of the layout area's width. */
  measure: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '1:1': { star: 8.4, quote: 7.6, min: 3.8, name: 3.7, avatar: 9, measure: 0.9 },
  '4:5': { star: 8.4, quote: 7.6, min: 3.8, name: 3.8, avatar: 9.2, measure: 1 },
  '9:16': { star: 9.2, quote: 8.4, min: 4.2, name: 4.2, avatar: 10, measure: 1 },
  '16:9': { star: 7.8, quote: 7.4, min: 3.6, name: 3.5, avatar: 8.6, measure: 0.62 },
};

/** Quotation marks the user may have typed around the quote (we set our own). */
const QUOTES = /^["“”„'‘’«»\s]+|["“”„'‘’«»\s]+$/g;

// --- choreography (Balanced seconds from the start of `in`) -----------------------------------
const STAR_GAP = 0.07;
const STAR_DUR = 0.32;
const COUNT_AT = 0.2;
const COUNT_DUR = 0.7;
const QUOTE_AT = 0.72;
const LINE_GAP = 0.08;
const LINE_DUR = 0.66;
const REVIEWER_AT = 1.3;
/** The card settles first; everything on it starts this much later. */
const CARD_LEAD = 0.12;
const OUT = 0.5;
/** Space between the rating, the quote and the reviewer (u). */
const GAP = 7.4;

export default defineTemplate({
  id: 'review',
  version: 1,
  meta: {
    name: 'Review',
    tagline: 'Testimonial with rating',
    category: 'brand-quotes',
    tags: ['review', 'testimonial', 'rating', 'stars', 'social proof'],
    useCases: ['Reviews', 'App ratings', 'Customer love', 'Case-study teasers'],
  },
  formats: ['1:1', '4:5', '9:16', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 4, max: 12 },
  alpha: 'optional',
  poster: 3,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'mono-light' },
  ],
  pairings: ['grotesk', 'editorial', 'soft', 'technical', 'quirky'],
  controls: {
    rating: c.number({
      label: 'Rating',
      group: 'content',
      default: 4.9,
      min: 0,
      max: 5,
      step: 0.1,
    }),
    label: c.text({
      label: 'Rating label',
      default: 'from 2,300+ reviews',
      maxLength: 32,
      optional: true,
    }),
    quote: c.text({
      label: 'Quote',
      default: 'Honestly the fastest way we’ve ever made a launch video.',
      maxLength: 140,
      primary: true,
    }),
    name: c.text({ label: 'Name', default: 'Sam Rivera', maxLength: 32 }),
    role: c.text({
      label: 'Role / Company',
      default: 'Head of Marketing, Halden',
      maxLength: 48,
      optional: true,
    }),
    avatar: c.image({
      label: 'Avatar',
      accept: 'portrait',
      default: { kind: 'placeholder', id: 'portrait-3' },
      optional: true,
      hint: 'Without a photo, the avatar shows the initials',
    }),
    verified: c.toggle({ label: 'Verified', group: 'content', default: true }),
    layout: c.choice({
      label: 'Layout',
      default: 'center',
      options: [
        { value: 'center', label: 'Centered' },
        { value: 'left', label: 'Left' },
      ],
    }),
    card: c.toggle({ label: 'Card', default: false, hint: 'Sets the review on a card' }),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    {
      id: 'mint-card',
      name: 'Mint card',
      palette: { kind: 'library', id: 'mint' },
      pairing: 'grotesk',
      values: { card: true, layout: 'left' },
    },
  ],
  timing: ({ props }) => ({
    // The quote is in by the end of `in`; the reviewer row settles early in the hold.
    in: 1.55 + (props.card ? CARD_LEAD : 0),
    out: OUT,
    tail: CLEAN_END,
    readable: props.quote,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent, surface } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const centered = props.layout === 'center';
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const display = pairing.display;
    const body = pairing.text;
    const pad = props.card ? 6 * u : 0;
    const lead = props.card ? CARD_LEAD : 0;

    // Centered layouts are symmetric around the frame's center, even where the social zone isn't.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const measure = (centered ? half * 2 : area.w) * comp.measure - 2 * pad;

    // --- stars -----------------------------------------------------------------------------------
    const unit = roundedStar(1);
    const starW = comp.star * u;
    const star = roundedStar(starW / unit.ink.w);
    const starH = star.ink.h;
    const starGap = starW * 0.2;
    const starsW = 5 * starW + 4 * starGap;
    const rating = Math.min(5, Math.max(0, props.rating));

    // --- the rating number: tabular digits, so it never shifts while it counts ------------------
    const numberStyle = {
      font: display.font,
      size: 100,
      weight: Math.max(display.weight, 700),
      width: display.width,
      tracking: 0,
      features: display.features,
    };
    const capRatio = text.line('0', numberStyle).capHeight / 100;
    const odometer = createOdometer(text, { ...numberStyle, size: (starH * 0.8) / capRatio });
    odometer.width('0123456789.'); // lays every glyph out now, not while rendering
    const figure: Figure = { prefix: '', value: rating, decimals: 1, grouping: false, suffix: '' };
    const numberW = odometer.width(formatFigure(figure));
    const numberGap = 2.4 * u;
    const ratingRowW = starsW + numberGap + numberW;

    const labelText = props.label.trim();
    const label: TextBlock | null = labelText
      ? text.layout(labelText, {
          style: {
            font: body.font,
            size: Math.max(2.4 * u, comp.name * u * 0.86),
            weight: body.weight,
            width: body.width,
            tracking: body.tracking,
            features: body.features,
          },
          maxWidth: measure,
          maxLines: 1,
          lineHeight: 1.25,
          align: centered ? 'center' : 'left',
          fit: { minSize: 2.4 * u },
        })
      : null;

    // --- reviewer row ------------------------------------------------------------------------------
    const nameText = props.name.trim();
    const roleText = props.role.trim();
    const photo = ctx.graphic('avatar');
    const monogram = photo ? '' : initials(nameText);
    const hasAvatar = photo !== null || monogram !== '';
    const diameter = hasAvatar ? comp.avatar * u : 0;
    const avatarGap = hasAvatar ? 2.2 * u : 0;
    const nameSize = comp.name * u;
    const badge = props.verified && nameText ? nameSize * 0.92 : 0;
    const badgeGap = badge ? nameSize * 0.34 : 0;
    const namesMax = measure - diameter - avatarGap;
    const nameStyle = {
      font: body.font,
      size: nameSize,
      weight: 620,
      width: body.width,
      tracking: body.tracking,
      features: body.features,
    };
    const name: TextBlock | null = nameText
      ? text.layout(nameText, {
          style: nameStyle,
          maxWidth: namesMax - badge - badgeGap,
          maxLines: 1,
          lineHeight: 1.2,
          fit: { minSize: 2.4 * u },
        })
      : null;
    const role: TextBlock | null = roleText
      ? text.layout(roleText, {
          style: { ...nameStyle, size: Math.max(2.4 * u, nameSize * 0.84), weight: body.weight },
          maxWidth: namesMax,
          maxLines: 1,
          lineHeight: 1.25,
          fit: { minSize: 2.4 * u },
        })
      : null;
    const monogramBlock: TextBlock | null = monogram
      ? text.line(monogram, { ...nameStyle, size: diameter * 0.36, weight: 600, tracking: 0.02 })
      : null;
    const roleGap = name && role ? role.size * 0.8 : 0;
    const namesH = (name?.height ?? 0) + roleGap + (role?.height ?? 0);
    const namesW = Math.max((name?.width ?? 0) + badgeGap + badge, role?.width ?? 0);
    const rowW = diameter + avatarGap + namesW;
    const rowH = Math.max(diameter, namesH + 0.3 * ((role ?? name)?.size ?? 0));
    const hasReviewer = hasAvatar || name !== null || role !== null;

    // --- the quote, in its own quotation marks, fitted to the width and the height left ----------
    const quoteText = props.quote.replace(QUOTES, '');
    // Short quotes may grow past the usual size, so one word doesn't sit small.
    const boost = 1 + 0.5 * Math.min(1, Math.max(0, (40 - quoteText.length) / 32));
    const quoteStyle = {
      font: display.font,
      size: comp.quote * u * boost,
      weight: Math.min(display.weight, 520),
      width: display.width,
      tracking: display.tracking * 0.5,
      features: display.features,
    };
    // Left: the opening mark hangs outside the column (room for it comes off the measure).
    const markRoom = centered || !quoteText ? 0 : text.line('“', quoteStyle).width;
    const quoteLineHeight = Math.max(1.16, display.lineHeight + 0.22);
    const aboveQuote = starH + (label ? 3 * u + label.height : 0) + GAP * u;
    const belowQuote = hasReviewer ? GAP * u + rowH : 0;
    const room = area.h - 2 * pad - aboveQuote - belowQuote;
    const layoutQuote = (size: number) => {
      const lines = Math.floor((room - 0.72 * size) / (size * quoteLineHeight)) + 1;
      return text.layout(quoteText ? `“${quoteText}”` : ' ', {
        style: { ...quoteStyle, size },
        maxWidth: measure - markRoom,
        maxLines: Math.max(1, Math.min(5, lines)),
        lineHeight: quoteLineHeight,
        align: centered ? 'center' : 'left',
      });
    };
    const fitsRoom = (block: TextBlock) =>
      !block.overflow && block.height + (hasReviewer ? 0 : 0.25 * block.size) <= room;
    let quote = layoutQuote(quoteStyle.size);
    if (!fitsRoom(quote)) {
      let lo = comp.min * u;
      let hi = quoteStyle.size;
      quote = layoutQuote(lo);
      for (let i = 0; i < 10 && hi - lo > 0.1 * u; i++) {
        const mid = (lo + hi) / 2;
        const candidate = layoutQuote(mid);
        if (fitsRoom(candidate)) {
          lo = mid;
          quote = candidate;
        } else {
          hi = mid;
        }
      }
    }
    // Hanging punctuation: the first line moves left until its first letter lines up with the
    // lines below; the mark sits in the margin.
    const [open, next] = quote.lines[0]?.glyphs ?? [];
    const hang =
      markRoom > 0 && open?.ink && next?.ink ? next.x + next.ink.x - (open.x + open.ink.x) : 0;

    // --- vertical rhythm (local y = 0 is the top of the stars) ----------------------------------
    const labelY = starH + 3 * u;
    const quoteY = aboveQuote;
    const rowY = quoteY + quote.height + GAP * u;
    const contentH = hasReviewer ? rowY + rowH : quoteY + quote.height + 0.25 * quote.size;
    const contentW = Math.max(
      ratingRowW,
      label?.width ?? 0,
      quote.width + markRoom,
      hasReviewer ? rowW : 0,
    );

    const top = area.y + (area.h - contentH - 2 * pad) * 0.47 + pad;
    // Left: the column (with its hanging mark) is centered in the area as one block.
    const blockLeft = area.x + pad + (area.w - 2 * pad - contentW) / 2;
    const col = centered ? frame.cx - measure / 2 : blockLeft + markRoom;
    const rowStart = centered ? frame.cx - ratingRowW / 2 : col;
    const starCenters = Array.from({ length: 5 }, (_, i) => ({
      x: rowStart + i * (starW + starGap) - star.ink.x,
      y: top - star.ink.y,
    }));
    const starsRect: Rect = { x: rowStart, y: top, w: starsW, h: starH };
    const numberX = rowStart + starsW + numberGap;
    const numberBaseline = top + starH / 2 + odometer.capHeight / 2;
    const numberRect: Rect = {
      x: numberX,
      y: numberBaseline - odometer.capHeight,
      w: numberW,
      h: odometer.capHeight,
    };
    const labelTop = top + labelY;
    const quoteTop = top + quoteY;
    const lineX = (i: number) => col - (i === 0 ? hang : 0);

    const rowX = centered ? frame.cx - rowW / 2 : col;
    const rowTop = top + rowY;
    const avatarRect: Rect = {
      x: rowX,
      y: rowTop + (rowH - diameter) / 2,
      w: diameter,
      h: diameter,
    };
    const namesX = rowX + diameter + avatarGap;
    const nameY = rowTop + (rowH - namesH) / 2;
    const roleY = nameY + (name ? name.height + roleGap : 0);
    const badgeCx = namesX + (name?.width ?? 0) + badgeGap + badge / 2;
    const badgeCy = nameY + (name ? name.capHeight / 2 : 0);

    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const labelBounds = label ? shift(label.ink, col, labelTop) : null;
    const quoteBounds = quote.lines
      .map((line, i) => shift(line.ink, lineX(i), quoteTop))
      .reduce((a, b) => unionRect(a, b));
    const nameBounds = name ? shift(name.ink, namesX, nameY) : null;
    const roleBounds = role ? shift(role.ink, namesX, roleY) : null;
    const ratingBounds = unionRect(starsRect, numberRect);
    let content = unionRect(ratingBounds, quoteBounds);
    if (labelBounds) content = unionRect(content, labelBounds);
    if (nameBounds) content = unionRect(content, nameBounds);
    if (roleBounds) content = unionRect(content, roleBounds);
    if (hasAvatar) content = unionRect(content, avatarRect);
    if (badge) {
      content = unionRect(content, {
        x: badgeCx - badge / 2,
        y: badgeCy - badge / 2,
        w: badge,
        h: badge,
      });
    }
    const cardRect: Rect = {
      x: content.x - pad,
      y: content.y - pad,
      w: content.w + 2 * pad,
      h: content.h + 2 * pad,
    };
    const lockup = props.card ? cardRect : content;

    // --- colors --------------------------------------------------------------------------------
    const track = withAlpha(fg, palette.dark ? 0.17 : 0.12);
    const onAccent = bestContrast(accent, [bg, fg]);
    // The card's soft shadow: stacked translucent fills, a little lower than the card (cheap and
    // identical everywhere — no blur on a card-sized layer every frame).
    const SHADOW_STEPS = 8;
    const shadowStep = withAlpha(palette.dark ? bg : fg, palette.dark ? 0.06 : 0.014);
    const cardRadius = 3.2 * u;
    const drawCard = (g: Draw) => {
      for (let k = SHADOW_STEPS; k >= 1; k--) {
        const e = k * 0.5 * u;
        g.roundRect(
          {
            x: cardRect.x - e,
            y: cardRect.y - e + 1.2 * u,
            w: cardRect.w + 2 * e,
            h: cardRect.h + 2 * e,
          },
          cardRadius + e,
          { fill: shadowStep },
        );
      }
      g.roundRect(cardRect, cardRadius, { fill: surface });
    };
    const cardArea: Rect = {
      x: cardRect.x - 5 * u,
      y: cardRect.y - 5 * u,
      w: cardRect.w + 10 * u,
      h: cardRect.h + 12 * u,
    };

    // --- motion --------------------------------------------------------------------------------
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    /** How far a star's pop overshoots (scale 0 → 1 + overshoot → 1). */
    const overshoot = calm ? 0 : punchy ? 0.24 : 0.15;
    const rise = ctx.travel(0.8 * u);
    const slide = ctx.travel(2 * u);
    const drift = ctx.travel(0.6 * u);
    const starStagger = ctx.stagger(STAR_GAP);
    const lineStagger = ctx.stagger(LINE_GAP);
    const lineRise = (quote.lines[0]?.mask.h ?? quote.size) * 1.05;
    const focal = ctx.focal('avatar');
    const check = checkPath(badge);
    const countCurve = calm ? 'drift' : 'swift';

    /** A star's scale at linear pop progress `p`: rises past 1, then settles on it. */
    const popScale = (p: number) => {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      if (overshoot === 0) return 1 - (1 - p) ** 3;
      const peak = 1 + overshoot;
      return p < 0.55
        ? peak * (1 - (1 - p / 0.55) ** 2)
        : peak + (1 - peak) * (1 - (1 - (p - 0.55) / 0.45) ** 2);
    };

    // The star that holds the rating's last fraction settles as the number lands.
    const landing = rating > 0 ? Math.min(4, Math.ceil(rating - 1e-9) - 1) : -1;
    const settle = calm ? 0 : punchy ? 0.12 : 0.07;

    const drawStars = (g: Draw, t: number, tl: Timeline, value: number) => {
      starCenters.forEach((center, i) => {
        let scale = popScale(tl.p(t, 'in', { delay: lead + i * starStagger, dur: STAR_DUR }));
        if (scale <= 0) return;
        if (i === landing && settle > 0) {
          const q = tl.p(t, 'in', { delay: lead + COUNT_AT + COUNT_DUR - 0.05, dur: 0.28 });
          scale *= 1 + settle * Math.sin(Math.PI * q);
        }
        const fill = Math.min(1, Math.max(0, value - i));
        g.group({ x: center.x, y: center.y, scale }, (g) => {
          if (fill < 1) g.path(star.path, { fill: track });
          if (fill >= 1) {
            g.path(star.path, { fill: accent });
          } else if (fill > 0) {
            // The fill covers `fill` of the star's exact ink width (4.9 → 90% of the fifth).
            const clip: Rect = {
              x: star.ink.x - u,
              y: star.ink.y - u,
              w: star.ink.w * fill + u,
              h: star.ink.h + 2 * u,
            };
            g.clip(clip, (g) => g.path(star.path, { fill: accent }));
          }
        });
      });
    };

    const drawAvatar = (g: Draw) => {
      const cx = avatarRect.x + diameter / 2;
      const cy = avatarRect.y + diameter / 2;
      if (photo) {
        g.clip({ rect: avatarRect, radius: diameter / 2 }, (g) =>
          g.graphic(photo, avatarRect, { fit: 'cover', focal }),
        );
      } else if (monogramBlock) {
        g.circle(cx, cy, diameter / 2, { fill: fg });
        g.text(monogramBlock, {
          fill: bg,
          x: cx - monogramBlock.ink.x - monogramBlock.ink.w / 2,
          y: cy - monogramBlock.capHeight / 2,
        });
      }
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        const breath = tl.p(t, 'hold', {}, 'drift');
        // Rows leave top to bottom, rising as they came; the card goes last.
        // (The last of them, the card, is gone at 3 × 0.04 + 0.36 = 0.48 s, inside `out`.)
        const out = (order: number) => tl.p(t, 'out', { delay: order * 0.04, dur: 0.36 }, 'exit');

        g.movable('review', lockup, (g) => {
          g.group({ y: -drift * breath }, (g) => {
            if (props.card) {
              const shown = tl.p(t, 'in', { dur: 0.55 }, 'glide');
              const opacity = shown * (1 - out(3));
              if (opacity > 0) {
                g.group(
                  {
                    scale: 0.965 + 0.035 * shown,
                    originX: cardRect.x + cardRect.w / 2,
                    originY: cardRect.y + cardRect.h / 2,
                  },
                  (g) => {
                    // Isolated while it fades, so the shadow never shows through the card.
                    if (opacity < 1) g.layer({ opacity, bounds: cardArea }, drawCard);
                    else drawCard(g);
                  },
                );
              }
            }

            // Stars and rating: one value drives both the number and the fill.
            const value =
              rating * tl.p(t, 'in', { delay: lead + COUNT_AT, dur: COUNT_DUR }, countCurve);
            const gone0 = out(0);
            if (gone0 < 1) {
              g.group({ y: -slide * gone0, opacity: 1 - gone0 }, (g) => {
                drawStars(g, t, tl, value);
                const shown = tl.p(t, 'in', { delay: lead + COUNT_AT - 0.05, dur: 0.25 }, 'swift');
                if (shown > 0) {
                  odometer.draw(g, formatFigure(figure, Math.floor(value * 10 + 1e-6) / 10), {
                    x: numberX,
                    y: numberBaseline,
                    fill: fg,
                    opacity: shown,
                  });
                }
                if (label) {
                  const p = tl.p(t, 'in', { delay: lead + COUNT_AT + 0.15, dur: 0.5 }, 'glide');
                  if (p > 0) {
                    g.text(label, {
                      fill: muted,
                      x: col,
                      y: labelTop + (1 - p) * rise,
                      opacity: p,
                    });
                  }
                }
              });
            }

            // The quote rises line by line through masks.
            const gone1 = out(1);
            if (gone1 < 1) {
              g.group({ y: -slide * gone1, opacity: 1 - gone1 }, (g) => {
                quote.lines.forEach((line: TextLine, i) => {
                  const p = tl.p(
                    t,
                    'in',
                    { delay: lead + QUOTE_AT + i * lineStagger, dur: LINE_DUR },
                    energy.enter,
                  );
                  if (p <= 0) return;
                  const x = lineX(i);
                  g.clip(shift(line.mask, x, quoteTop), (g) =>
                    g.text(line, { fill: fg, x, y: quoteTop + (1 - p) * lineRise }),
                  );
                });
              });
            }

            // Reviewer: the avatar and names slide in, then the verified check draws.
            const gone2 = out(2);
            if (hasReviewer && gone2 < 1) {
              g.group({ y: -slide * gone2, opacity: 1 - gone2 }, (g) => {
                const p = tl.p(t, 'in', { delay: lead + REVIEWER_AT, dur: 0.6 }, energy.enter);
                if (hasAvatar && p > 0) {
                  g.group(
                    {
                      scale: 0.8 + 0.2 * p,
                      originX: avatarRect.x + diameter / 2,
                      originY: avatarRect.y + diameter / 2,
                      opacity: p,
                    },
                    drawAvatar,
                  );
                }
                const q = tl.p(
                  t,
                  'in',
                  { delay: lead + REVIEWER_AT + 0.08, dur: 0.6 },
                  energy.enter,
                );
                const dx = -slide * (1 - q);
                if (name && q > 0) g.text(name, { fill: fg, x: namesX + dx, y: nameY, opacity: q });
                if (role) {
                  const r = tl.p(t, 'in', { delay: lead + REVIEWER_AT + 0.2, dur: 0.5 }, 'drift');
                  if (r > 0) g.text(role, { fill: muted, x: namesX, y: roleY, opacity: r });
                }
                if (badge > 0) {
                  const b = tl.p(
                    t,
                    'in',
                    { delay: lead + REVIEWER_AT + 0.36, dur: 0.36 },
                    calm ? 'glide' : 'pop',
                  );
                  const drawn = tl.p(
                    t,
                    'in',
                    { delay: lead + REVIEWER_AT + 0.5, dur: 0.3 },
                    'snap',
                  );
                  if (b > 0) {
                    g.group({ x: badgeCx + dx, y: badgeCy, scale: b }, (g) => {
                      g.circle(0, 0, badge / 2, { fill: accent });
                      if (drawn > 0) {
                        g.path(check, {
                          stroke: {
                            color: onAccent,
                            width: badge * 0.12,
                            cap: 'round',
                            join: 'round',
                            trim: [0, drawn],
                          },
                        });
                      }
                    });
                  }
                }
              });
            }
          });
          g.editable('rating', ratingBounds);
          if (labelBounds) g.editable('label', labelBounds);
          g.editable('quote', quoteBounds);
          if (nameBounds) g.editable('name', nameBounds);
          if (roleBounds) g.editable('role', roleBounds);
          if (hasAvatar) g.editable('avatar', avatarRect);
        });
      },
    };
  },
});
