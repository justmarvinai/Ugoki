/**
 * Columns — parallax portfolio reel (docs/templates/05-showcase.md §5.1).
 *
 * The expensive detail: the loop is exact. Each column's content is built to a length that its
 * speed covers a whole number of times per loop (tile heights are fitted to it), so the frame at
 * the loop's end is the frame at its start; the columns' different speeds give each its own
 * motion-blur length under the engine's temporal motion blur. The title inverts whatever passes
 * beneath it (difference blend).
 *
 * Images: eight image slots (1–4 required, 5–8 optional). The columns cycle through the slots
 * that are filled, so four to eight images work without a list control.
 */

import {
  bestContrast,
  CLEAN_END,
  type Color,
  c,
  contrastRatio,
  type Draw,
  defineTemplate,
  type FocalPoint,
  type FormatId,
  type Graphic,
  mod,
  type Rect,
  rgb,
  type TextBlock,
  type Timeline,
  unionRect,
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
] as const;

type ImageKey = (typeof IMAGE_KEYS)[number];

const image = (n: number, optional: boolean) =>
  c.image({
    label: `Image ${n}`,
    accept: 'artwork',
    default: { kind: 'placeholder', id: `artwork-${n}` },
    ...(optional ? { optional: true, advanced: true } : {}),
  });

/**
 * Relative column speeds per energy, cycled (Balanced: the spec's 0.9× / 1.2× / 1.0×). Calm
 * drifts every column the same way with a tight spread; Punchy alternates with a wide one.
 */
const SPEEDS = {
  calm: [0.96, 1.06, 1, 1.03, 0.98],
  balanced: [0.9, 1.2, 1, 1.1, 0.95],
  punchy: [0.82, 1.36, 1, 1.2, 0.9],
} as const;
const PACE = { calm: 0.85, balanced: 1, punchy: 1.3 } as const;
/** Tile proportions across the scroll (height / width in columns), masonry-mixed. */
const PROPORTIONS = [0.78, 1.0, 1.25, 1.5, 1.12];

type Composition = { title: number; subtitle: number; measure: number };

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { title: 18, subtitle: 3.2, measure: 0.9 },
  '9:16': { title: 17, subtitle: 3.8, measure: 1 },
  '1:1': { title: 19, subtitle: 3.4, measure: 1 },
  '4:5': { title: 18, subtitle: 3.4, measure: 1 },
};

const WHITE: Color = rgb(1, 1, 1);
const BLACK: Color = rgb(0, 0, 0);

const grow = (r: Rect, d: number): Rect => ({
  x: r.x - d,
  y: r.y - d,
  w: r.w + 2 * d,
  h: r.h + 2 * d,
});

type Tile = {
  /** Index into the filled image slots. */
  readonly image: number;
  readonly graphic: Graphic;
  readonly focal: FocalPoint;
  /** Start along the scroll axis within the column's content, and length. */
  readonly start: number;
  readonly length: number;
};

type Column = {
  /** Across the scroll axis: position and size. */
  readonly across: number;
  readonly size: number;
  /** Content length (one repeat) and scroll direction (−1 up/left, +1 down/right). */
  readonly content: number;
  readonly direction: number;
  /** Whole content lengths travelled per loop, and the starting phase. */
  readonly laps: number;
  readonly phase: number;
  readonly speed: number;
  readonly tiles: readonly Tile[];
};

export default defineTemplate({
  id: 'columns',
  version: 1,
  meta: {
    name: 'Columns',
    tagline: 'Parallax portfolio reel',
    category: 'showcase',
    tags: ['portfolio', 'gallery', 'parallax', 'loop', 'reel'],
    useCases: ['Studio reels', 'Portfolio intros', 'Collection launches', 'Mood reels'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'loop',
  duration: { default: 8, min: 5, max: 20 },
  alpha: 'none',
  poster: 2,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'swiss' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'film' },
  ],
  pairings: ['grotesk', 'editorial', 'wide', 'studio', 'technical', 'classic'],
  controls: {
    image1: image(1, false),
    image2: image(2, false),
    image3: image(3, false),
    image4: image(4, false),
    image5: image(5, true),
    image6: image(6, true),
    image7: image(7, true),
    image8: image(8, true),
    title: c.text({ label: 'Title', default: 'HALDEN STUDIO', maxLength: 32, primary: true }),
    subtitle: c.text({
      label: 'Subtitle',
      default: 'Selected work 2020—2026',
      maxLength: 48,
      optional: true,
    }),
    columns: c.number({
      label: 'Columns',
      group: 'style',
      default: 4,
      min: 3,
      max: 5,
      step: 1,
    }),
    gap: c.number({
      label: 'Gap',
      group: 'style',
      default: 1.2,
      min: 0,
      max: 4,
      step: 0.2,
      unit: 'u',
    }),
    radius: c.number({
      label: 'Radius',
      group: 'style',
      default: 0.8,
      min: 0,
      max: 4,
      step: 0.2,
      unit: 'u',
    }),
    titleStyle: c.choice({
      label: 'Title style',
      default: 'difference',
      options: [
        { value: 'difference', label: 'Difference' },
        { value: 'band', label: 'Band' },
        { value: 'plain', label: 'Plain' },
      ],
    }),
    direction: c.choice({
      label: 'Direction',
      group: 'motion',
      default: 'vertical',
      options: [
        { value: 'vertical', label: 'Vertical' },
        { value: 'horizontal', label: 'Horizontal' },
      ],
    }),
    speed: c.number({ label: 'Speed', default: 1, min: 0.5, max: 2, step: 0.25, unit: '×' }),
    loop: c.toggle({
      label: 'Loop',
      group: 'motion',
      default: true,
      hint: 'Off: the columns slide in and away',
    }),
  },
  looks: [
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    {
      id: 'paper',
      name: 'Paper',
      palette: { kind: 'library', id: 'paper' },
      pairing: 'classic',
      values: { titleStyle: 'band' },
    },
    {
      id: 'swiss',
      name: 'Swiss',
      palette: { kind: 'library', id: 'swiss' },
      pairing: 'grotesk',
      values: { titleStyle: 'band' },
    },
  ],
  timing: ({ props }) =>
    props.loop ? { in: 0, out: 0 } : { in: 1.5, out: 0.7, tail: CLEAN_END, readable: props.title },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u, width: W, height: H } = frame;
    const { bg, fg, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const vertical = props.direction === 'vertical';
    const duration = timeline.duration;

    // --- images: the filled slots, cycled ---------------------------------------------------
    const images = IMAGE_KEYS.flatMap((key: ImageKey) => {
      const graphic = ctx.graphic(key);
      return graphic ? [{ key, graphic, focal: ctx.focal(key) }] : [];
    });

    // --- columns (rows when horizontal): exact loop lengths --------------------------------
    const count = Math.round(props.columns);
    const gap = props.gap * u;
    const radius = props.radius * u;
    /** Along the scroll axis: the viewport; across it: the space the columns share. */
    const view = vertical ? H : W;
    const span = vertical ? W : H;
    const size = (span - (count + 1) * gap) / count;
    const rng = ctx.rng('columns');
    const spread = SPEEDS[energy.id];
    const ratio = (i: number) => spread[i % spread.length] ?? 1;
    let base = 13 * u * props.speed * PACE[energy.id];
    let slowest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i++) slowest = Math.min(slowest, ratio(i));
    // A loop needs every column to travel its whole content: at least two tiles' worth, so a
    // column never shows one tile after itself.
    const pitch = 1.13 * size + gap;
    if (props.loop) base = Math.max(base, (2.2 * pitch) / (slowest * duration));
    const target = Math.max(view * 1.05, 2.2 * pitch);

    let next = 0;
    const columns: Column[] = Array.from({ length: count }, (_, i) => {
      const speed = base * ratio(i);
      const travel = speed * duration;
      // One loop covers `laps` whole content lengths; the content is fitted to that.
      const laps = props.loop ? Math.max(1, Math.floor(travel / target)) : 1;
      const content = props.loop ? travel / laps : Math.max(view * 1.4, travel);
      const proportions: number[] = [];
      let natural = 0;
      const average = 1.13 * size + gap;
      const tiles = Math.max(2, Math.round(content / average));
      for (let k = 0; k < tiles; k++) {
        const p = PROPORTIONS[Math.floor(rng.next() * PROPORTIONS.length)] ?? 1;
        proportions.push(p);
        natural += p * size;
      }
      const fit = (content - tiles * gap) / natural;
      let start = 0;
      const slotsFilled = Math.max(1, images.length);
      const first = next % slotsFilled;
      const list: Tile[] = proportions.map((p, k) => {
        let index = next % slotsFilled;
        // The column repeats: its last tile meets the next copy's first — never the same image.
        if (k === tiles - 1 && k > 0 && index === first && slotsFilled > 2) {
          index = (index + 1) % slotsFilled;
        }
        const source = images[index];
        next += 1;
        const length = p * size * fit;
        const tile = {
          image: index,
          graphic: source?.graphic as Graphic,
          focal: source?.focal ?? { x: 0.5, y: 0.5 },
          start,
          length,
        };
        start += length + gap;
        return tile;
      });
      // Neighbouring columns start on different images.
      next += 1;
      return {
        across: gap + i * (size + gap),
        size,
        content,
        direction: energy.id === 'calm' || i % 2 === 0 ? -1 : 1,
        laps,
        phase: rng.next() * content,
        speed,
        tiles: images.length > 0 ? list : [],
      };
    });

    // --- title & subtitle --------------------------------------------------------------------
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const measure = half * 2 * comp.measure;
    const lockLeft = frame.cx - measure / 2;
    const display = pairing.display;
    const titleText = props.title.trim();
    const title: TextBlock | null = titleText
      ? text.layout(titleText, {
          style: {
            font: display.font,
            italicFont: display.italic,
            size: comp.title * u,
            // A step heavier than the pairing's display weight: it has to hold over images.
            weight: Math.min(900, display.weight + 100),
            width: display.width,
            tracking: display.tracking,
            features: display.features,
          },
          maxWidth: measure,
          maxLines: 2,
          lineHeight: display.lineHeight,
          align: 'center',
          fit: { minSize: comp.title * u * 0.45 },
        })
      : null;
    const subtitleText = props.subtitle.trim();
    const subtitle: TextBlock | null = subtitleText
      ? text.layout(subtitleText, {
          style: {
            font: pairing.text.font,
            size: comp.subtitle * u,
            weight: 600,
            width: pairing.text.width,
            tracking: 0.02,
            features: pairing.text.features,
          },
          maxWidth: measure,
          maxLines: 2,
          lineHeight: 1.25,
          align: 'center',
          fit: { minSize: 2.4 * u },
        })
      : null;
    const between = title && subtitle ? Math.max(2.4 * u, title.size * 0.32) : 0;
    const lockH = (title?.height ?? 0) + (subtitle ? between + subtitle.height : 0);
    const titleY = area.y + (area.h - lockH) * 0.48;
    const subtitleY = titleY + (title?.height ?? 0) + between;
    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const titleBounds = title ? shift(title.ink, lockLeft, titleY) : null;
    const subtitleBounds = subtitle ? shift(subtitle.ink, lockLeft, subtitleY) : null;
    const lockup =
      titleBounds && subtitleBounds
        ? unionRect(titleBounds, subtitleBounds)
        : (titleBounds ?? subtitleBounds);
    // The band: full width, around the lockup with room for descenders.
    const bandPad = Math.max(2.6 * u, (title?.size ?? 30 * u) * 0.3);
    const band: Rect | null = lockup
      ? { x: 0, y: lockup.y - bandPad, w: W, h: lockup.h + bandPad * 2 }
      : null;
    // The subtitle's chip (Difference style): a pill of the page around the line.
    const subtitleChip: Rect | null =
      subtitle && subtitleBounds
        ? {
            x: subtitleBounds.x - subtitle.size * 0.9,
            y: subtitleBounds.y - subtitle.size * 0.5,
            w: subtitleBounds.w + subtitle.size * 1.8,
            h: subtitleBounds.h + subtitle.size * 1.0,
          }
        : null;
    const bandInk =
      contrastRatio(bg, accent) >= 4.5 ? bg : bestContrast(accent, [fg, WHITE, BLACK]);
    const style = props.titleStyle;
    const ink = style === 'difference' ? WHITE : style === 'band' ? bandInk : fg;
    // Plain: a soft halo of the page keeps the title apart from busy artwork.
    const shadow = { color: bg, blur: 1.8, opacity: palette.dark ? 0.85 : 0.8, y: 0.15 };

    // --- motion ------------------------------------------------------------------------------
    const loop = props.loop;
    const outStart = timeline.sections.out.start;
    const gapIn = ctx.stagger(0.08);
    // Staggered exits always finish inside the out section.
    const exitGap = Math.min(ctx.stagger(0.05), 0.2 / Math.max(1, count - 1));

    const drawTile = (g: Draw, tile: Tile, r: Rect) => {
      if (radius > 0.01) {
        g.clip({ rect: r, radius }, (g) =>
          g.graphic(tile.graphic, r, { fit: 'cover', focal: tile.focal }),
        );
      } else {
        g.graphic(tile.graphic, r, { fit: 'cover', focal: tile.focal });
      }
    };

    // Drop targets for the editor: each image slot's most visible tile this frame (a slot
    // shown several times would otherwise register one region spanning all its tiles).
    const bestArea = new Float64Array(images.length);
    const bestRect: Rect[] = images.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));

    const drawColumn = (g: Draw, column: Column, offset: number, slide: number) => {
      const shiftAlong = mod(column.phase + column.direction * offset, column.content);
      for (const tile of column.tiles) {
        // The tile's first copy at or before the viewport, then every content length after.
        let at = mod(tile.start + shiftAlong, column.content) - column.content;
        for (; at < view; at += column.content) {
          if (at + tile.length <= 0) continue;
          const r: Rect = vertical
            ? { x: column.across, y: at, w: column.size, h: tile.length }
            : { x: at, y: column.across, w: tile.length, h: column.size };
          drawTile(g, tile, r);
          const shown = Math.min(at + slide + tile.length, view) - Math.max(at + slide, 0);
          const area = shown * column.size;
          if (area > (bestArea[tile.image] ?? 0)) {
            bestArea[tile.image] = area;
            const best = bestRect[tile.image];
            if (best) {
              best.x = vertical ? r.x : r.x + slide;
              best.y = vertical ? r.y + slide : r.y;
              best.w = r.w;
              best.h = r.h;
            }
          }
        }
      }
    };

    const drawLockup = (g: Draw, t: number, tl: Timeline) => {
      const revealed = (delay: number) =>
        loop ? 1 : tl.p(t, 'in', { delay, dur: 0.6 }, energy.enter);
      const titleLines = (g: Draw) => {
        if (title && titleBounds) {
          title.lines.forEach((line, i) => {
            const p = revealed(0.7 + i * ctx.stagger(0.08));
            if (p <= 0) return;
            const mask = shift(line.mask, lockLeft, titleY);
            g.clip(mask, (g) =>
              g.text(line, { fill: ink, x: lockLeft, y: titleY + (1 - p) * mask.h * 1.05 }),
            );
          });
        }
      };
      const subtitleLine = (g: Draw, chip: boolean) => {
        if (!subtitle || !subtitleBounds) return;
        const p = revealed(0.9);
        if (p <= 0) return;
        const opacity = loop ? 1 : tl.p(t, 'in', { delay: 0.9, dur: 0.4 }, 'drift');
        const y = (1 - p) * u;
        // Over the images, the small line sits on a chip of the page: it reads on any artwork.
        if (chip && subtitleChip) {
          g.roundRect(
            { x: subtitleChip.x, y: subtitleChip.y + y, w: subtitleChip.w, h: subtitleChip.h },
            subtitleChip.h / 2,
            { fill: bg, opacity },
          );
        }
        g.text(subtitle, { fill: chip ? fg : ink, x: lockLeft, y: subtitleY + y, opacity });
      };
      const content = (g: Draw) => {
        titleLines(g);
        subtitleLine(g, false);
      };
      if (!lockup) return;
      if (style === 'difference') {
        if (titleBounds) {
          g.layer({ blend: 'difference', bounds: grow(titleBounds, 2 * u) }, titleLines);
        }
        subtitleLine(g, true);
      } else if (style === 'band' && band) {
        const open = loop ? 1 : tl.p(t, 'in', { delay: 0.55, dur: 0.5 }, 'snap');
        if (open > 0) {
          const h = band.h * open;
          g.rect({ x: band.x, y: band.y + (band.h - h) / 2, w: band.w, h }, { fill: accent });
          g.clip({ x: band.x, y: band.y + (band.h - h) / 2, w: band.w, h }, content);
        }
      } else {
        g.fx({ shadow, bounds: grow(lockup, 2 * u) }, content);
      }
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        bestArea.fill(0);

        for (let i = 0; i < columns.length; i++) {
          const column = columns[i];
          if (!column || column.tiles.length === 0) continue;
          let offset: number;
          let slide = 0;
          if (loop) {
            // Exact: a whole number of content lengths per loop.
            const laps = (t / duration) * column.laps;
            offset = (laps - Math.floor(laps)) * column.content;
          } else {
            offset = column.speed * t;
            // In from the edge it scrolls away from, out the way it's going (accelerating).
            const inP = tl.p(t, 'in', { delay: i * gapIn, dur: 0.8 }, 'glide');
            const outP = tl.p(
              t,
              'out',
              { delay: (columns.length - 1 - i) * exitGap, dur: 0.5 },
              'exit',
            );
            slide =
              -column.direction * (1 - inP) * view * 1.05 + column.direction * outP * view * 1.05;
          }
          if (slide === 0) {
            drawColumn(g, column, offset, 0);
          } else {
            // The column moves as one block a viewport long, so nothing trails in from beyond.
            const block: Rect = vertical
              ? { x: column.across, y: 0, w: column.size, h: view }
              : { x: 0, y: column.across, w: view, h: column.size };
            g.group(vertical ? { y: slide } : { x: slide }, (g) =>
              g.clip(block, (g) => drawColumn(g, column, offset, slide)),
            );
          }
        }
        images.forEach((image, k) => {
          const rect = bestRect[k];
          if (rect && (bestArea[k] ?? 0) > 0) g.editable(image.key, rect);
        });

        // The title cuts on the way out (loop off).
        if (!loop && t >= outStart) return;
        if (lockup) {
          g.movable('title', lockup, (g) => {
            drawLockup(g, t, tl);
            if (titleBounds) g.editable('title', titleBounds);
            if (subtitleBounds) g.editable('subtitle', subtitleBounds);
          });
        }
      },
    };
  },
});
