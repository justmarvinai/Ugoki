/**
 * Editorial — serif elegance (docs/templates/02-lower-thirds.md §2.4).
 *
 * The expensive detail: one left edge measured from ink. The italic name is placed by its actual
 * ink (the overhang of its first letter, not its side bearing), and the hairline and the title
 * start exactly there; the title's caps are tracked by their size — smaller caps get more air —
 * and settle from wider tracking as they fade in, letter by letter. Nothing wobbles: the hold only
 * drifts 0.4u, and the exit is a fade through blur, never a hard cut.
 */

import {
  CLEAN_END,
  c,
  type Draw,
  defineTemplate,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type Rect,
  type TextBlock,
  type TextLine,
  type TextStyle,
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
const NAME_SIZE: Record<FormatId, number> = { '16:9': 7.2, '9:16': 8.6, '1:1': 7.8, '4:5': 8.1 };
/** Title caps in u at size M. */
const TITLE_SIZE: Record<FormatId, number> = { '16:9': 2.5, '9:16': 3, '1:1': 2.7, '4:5': 2.8 };
/** Share of the layout area's width the lockup may use. */
const MEASURE: Record<FormatId, number> = { '16:9': 0.56, '9:16': 1, '1:1': 0.86, '4:5': 0.9 };
const SIZES = { s: 0.82, m: 1, l: 1.2 } as const;

/** Title tracking at the reference caps size (2.6u); smaller caps get more air. */
const TRACKING = 0.14;
/** Tracking the title's letters start from as they fade in. */
const TRACK_FROM = 0.22;
/** Blur the name resolves from: 8 px at 1080p (σ, in u). */
const BLUR_IN = 8 / 10.8;
/** Blur everything fades out through (σ, in u). */
const BLUR_OUT = 5 / 10.8;

function placement(anchor: Anchor): {
  v: 'top' | 'middle' | 'bottom';
  h: 'left' | 'center' | 'right';
} {
  if (anchor === 'center') return { v: 'middle', h: 'center' };
  const [v, h] = anchor.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right'];
  return { v, h };
}

export default defineTemplate({
  id: 'editorial',
  version: 1,
  meta: {
    name: 'Editorial',
    tagline: 'Serif elegance',
    category: 'lower-thirds',
    tags: ['lower third', 'name', 'serif', 'documentary', 'luxury'],
    useCases: ['Documentaries', 'Fashion', 'Luxury brands', 'Museum and culture'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 7, min: 3, max: 20 },
  alpha: 'default',
  poster: 3,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'film' },
    { kind: 'library', id: 'mono-dark' },
    { kind: 'library', id: 'mono-light' },
    { kind: 'library', id: 'sand' },
  ],
  pairings: ['editorial', 'classic', 'soft', 'grotesk'],
  controls: {
    name: c.text({ label: 'Name', default: 'Élodie Marchand', maxLength: 40, primary: true }),
    title: c.text({
      label: 'Title',
      default: 'PERFUMER · MAISON LUMIÈRE',
      maxLength: 48,
      optional: true,
    }),
    align: c.choice({
      label: 'Alignment',
      default: 'left',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
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
    shadow: c.toggle({ label: 'Shadow', default: false, hint: 'A soft shadow for busy footage' }),
    anchor: c.choice({
      label: 'Anchor',
      group: 'layout',
      default: 'bottom-left',
      options: ANCHORS,
      display: 'select',
    }),
  },
  looks: [
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'editorial' },
    {
      id: 'paper',
      name: 'Paper',
      palette: { kind: 'library', id: 'paper' },
      pairing: 'editorial',
    },
    { id: 'film', name: 'Film', palette: { kind: 'library', id: 'film' }, pairing: 'classic' },
  ],
  timing: ({ props }) => ({
    in: 1.6,
    out: 0.8,
    tail: CLEAN_END,
    readable: `${props.name} ${props.title}`,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text } = ctx;
    const { u } = frame;
    const { bg, fg } = palette.roles;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const { v, h } = placement(props.anchor);
    const k = SIZES[props.size];
    const align = props.align === 'center' ? 'center' : h === 'right' ? 'right' : 'left';
    const measure = area.w * MEASURE[frame.format];

    // --- type -------------------------------------------------------------------------------
    const display = pairing.display;
    const nameSize = NAME_SIZE[frame.format] * u * k;
    const layoutName = (maxLines: number, size: number) =>
      text.layout(props.name.trim() || ' ', {
        style: {
          font: display.font,
          italicFont: display.italic,
          italic: true,
          size,
          weight: display.weight,
          width: display.width,
          tracking: display.tracking,
          features: display.features,
        },
        maxWidth: measure,
        maxLines,
        lineHeight: 1.04,
        align,
        fit: { minSize: nameSize * 0.72 },
      });
    // One line, shrinking a little; only very long names take a second line.
    let name = layoutName(1, nameSize);
    if (name.overflow) name = layoutName(2, nameSize * 0.84);

    // Title caps: tracked by their size (smaller caps get more air), fitted to the measure.
    const titleText = props.title.trim();
    const trackingFor = (size: number) => TRACKING * ((2.6 * u) / size) ** 0.35;
    const titleStyle = (size: number): TextStyle => ({
      font: pairing.text.font,
      size,
      weight: 500,
      width: pairing.text.width,
      tracking: trackingFor(size),
      features: pairing.text.features,
      case: 'upper',
    });
    const layoutTitle = (size: number, maxLines: number) =>
      text.layout(titleText, {
        style: titleStyle(size),
        maxWidth: measure,
        maxLines,
        lineHeight: 1.5,
        align,
      });
    let title: TextBlock | null = null;
    if (titleText) {
      const target = TITLE_SIZE[frame.format] * u * k;
      const floor = Math.max(2.4 * u, target * 0.8);
      let size = target;
      title = layoutTitle(size, 1);
      // Shrink (retracking at every size) before taking a second line.
      for (let i = 0; i < 6 && title.overflow && size > floor; i++) {
        size = Math.max(floor, size * 0.95);
        title = layoutTitle(size, 1);
      }
      if (title.overflow) title = layoutTitle(size, 2);
    }

    // --- lockup (local: y = 0 is the name's cap height) --------------------------------------
    // One edge from ink: the name's first letter (its italic overhang included) sets it.
    const nameInk = name.ink;
    const titleInk = title?.ink ?? null;
    // The hairline clears the name's descenders; the title's caps hang below it.
    const ruleY = name.height + Math.max(0.4 * name.size, 2 * u * k);
    const ruleH = 0.1 * u;
    const titleY = ruleY + ruleH + 1.9 * u * k;
    const lockupW = Math.max(nameInk.w, titleInk?.w ?? 0);
    const lockupH = title ? titleY + title.height + 0.28 * title.size : ruleY + ruleH;

    // Where the lockup's ink edges sit, from the anchor.
    const edgeX =
      h === 'left' ? area.x : h === 'right' ? area.x + area.w - lockupW : frame.cx - lockupW / 2;
    const bottomRoom = 2 * u;
    const top =
      v === 'top'
        ? area.y + 2 * u
        : v === 'bottom'
          ? area.y + area.h - bottomRoom - lockupH
          : area.y + (area.h - lockupH) / 2;

    // Blocks are laid out in a measure-wide box; shift them so their ink meets the edge.
    const inkLeft = (ink: Rect) =>
      align === 'left'
        ? edgeX
        : align === 'right'
          ? edgeX + lockupW - ink.w
          : edgeX + (lockupW - ink.w) / 2;
    const nameX = inkLeft(nameInk) - nameInk.x;
    const nameY = top;
    const titleX = title && titleInk ? inkLeft(titleInk) - titleInk.x : 0;
    const titleTop = top + titleY;
    const rule: Rect = { x: edgeX, y: top + ruleY, w: lockupW, h: ruleH };

    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const nameBounds = shift(nameInk, nameX, nameY);
    const titleBounds = title && titleInk ? shift(titleInk, titleX, titleTop) : null;
    let lockup = unionRect(nameBounds, rule);
    if (titleBounds) lockup = unionRect(lockup, titleBounds);
    // Everything the lockup ever shows: drift, the title's opening tracking, blur.
    const longest = Math.max(1, ...(title?.lines.map((line) => line.glyphs.length) ?? [1]));
    const reach = 2 * u + (title ? (TRACK_FROM - TRACKING) * title.size * longest : 0);
    const lockupArea: Rect = {
      x: lockup.x - reach,
      y: lockup.y - 2 * u,
      w: lockup.w + 2 * reach,
      h: lockup.h + 4 * u,
    };
    const nameArea: Rect = {
      x: nameBounds.x - 1.5 * u,
      y: nameBounds.y - 1.5 * u,
      w: nameBounds.w + 3 * u,
      h: nameBounds.h + 4 * u,
    };

    // --- motion -------------------------------------------------------------------------------
    const rise = ctx.travel(u);
    const drift = 0.4 * u;
    const blurIn = BLUR_IN * energy.blur;
    const letterGap = ctx.stagger(Math.min(0.018, 0.5 / Math.max(1, (title?.glyphCount ?? 1) - 1)));
    const titleFrom = title ? (TRACK_FROM - TRACKING) * title.size : 0;
    // Per-glyph lookups for the title's tracking settle (index within its line, pivot).
    const pivot = new Float64Array(Math.max(1, title?.glyphCount ?? 1));
    title?.lines.forEach((line) => {
      const n = line.glyphs.length;
      line.glyphs.forEach((glyph, i) => {
        pivot[glyph.index] =
          align === 'left' ? i : align === 'right' ? i - (n - 1) : i - (n - 1) / 2;
      });
    });
    const shown = new Float64Array(Math.max(1, title?.glyphCount ?? 1));
    let open = 0;
    const letter: GlyphTransform = { dx: 0, opacity: 1 };
    const animateTitle = (glyph: Glyph, _line: TextLine): GlyphTransform | null => {
      const opacity = shown[glyph.index] ?? 1;
      if (opacity <= 0) return null;
      letter.dx = (pivot[glyph.index] ?? 0) * titleFrom * open;
      letter.opacity = opacity;
      return letter;
    };
    const shadow = props.shadow
      ? { color: bg, blur: 1.2, opacity: palette.dark ? 0.7 : 0.8, y: 0.12 }
      : undefined;

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        const gone = tl.p(t, 'out', { dur: 0.8 }, 'drift');
        if (gone >= 1) return;
        const held = tl.p(t, 'hold', {}, 'drift');
        const lift = -drift * held;

        const nameIn = tl.p(t, 'in', { dur: 1.1 }, 'drift');
        const nameShown = tl.p(t, 'in', { dur: 0.8 }, 'drift');
        const ruleIn = tl.p(t, 'in', { delay: 0.45, dur: 0.8 }, energy.enter);
        // Title: letters fade in on a stagger while the line's tracking settles.
        const titleStart = 0.7;
        if (title) {
          open = 1 - tl.p(t, 'in', { delay: titleStart, dur: 0.9 }, 'glide');
          for (let i = 0; i < title.glyphCount; i++) {
            shown[i] = tl.p(t, 'in', { delay: titleStart + i * letterGap, dur: 0.4 }, 'drift');
          }
        }

        const drawName = (g: Draw) =>
          g.text(name, { fill: fg, x: nameX, y: nameY + (1 - nameIn) * rise });
        const lockupDraw = (g: Draw) => {
          // Name: resolves from blur while it drifts up.
          if (nameShown > 0) {
            const blur = blurIn * (1 - nameIn);
            g.group({ opacity: nameShown }, (g) => {
              if (blur > 0.01 && gone <= 0) g.fx({ blur, bounds: nameArea }, drawName);
              else drawName(g);
            });
          }
          // Hairline: draws from the anchor side (from the center when centered), on whole
          // output pixels — a crisp line, not a soft one straddling two rows.
          if (ruleIn > 0) {
            const w = rule.w * ruleIn;
            const x =
              align === 'left'
                ? rule.x
                : align === 'right'
                  ? rule.x + rule.w - w
                  : rule.x + (rule.w - w) / 2;
            const px = g.pixel;
            const y = Math.round((rule.y + lift) / px) * px - lift;
            const h = Math.max(1, Math.round(rule.h / px)) * px;
            g.rect({ x, y, w, h }, { fill: fg, opacity: 0.9 });
          }
          if (title) {
            g.text(title, { fill: fg, x: titleX, y: titleTop, opacity: 0.86, glyph: animateTitle });
          }
        };
        const withShadow = (g: Draw) => {
          if (shadow) g.fx({ shadow, bounds: lockupArea }, lockupDraw);
          else lockupDraw(g);
        };

        g.movable('lockup', lockup, (g) => {
          g.group({ y: lift }, (g) => {
            // Exit: everything fades through blur — never a hard cut.
            if (gone > 0) {
              g.fx({ blur: BLUR_OUT * gone, opacity: 1 - gone, bounds: lockupArea }, withShadow);
            } else {
              withShadow(g);
            }
          });
          g.editable('name', nameBounds);
          if (titleBounds) g.editable('title', titleBounds);
        });
      },
    };
  },
});
