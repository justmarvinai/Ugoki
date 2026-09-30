/**
 * Drawing for the Open Graph cards (`pnpm og`): the monochrome Cinema card, Ugoki Sans set with
 * Canvas text (tooling, not a template — no HarfBuzz needed), the `ugoki` wordmark with the Dot,
 * and renders framed like the gallery's tiles (radius, hairline).
 */

export const CARD = { width: 1200, height: 630 } as const;
export const MARGIN = 56;

/** Cinema tokens (docs/03-design-system.md §4). */
export const INK = {
  bg: '#0A0A0B',
  fg: '#F5F5F4',
  fg2: '#A1A1A6',
  fg3: '#7C7C82',
  line: 'rgba(255, 255, 255, 0.1)',
} as const;

const FAMILY = 'Ugoki Sans';
let fontLoad: Promise<void> | null = null;

/** Loads the UI font (Mona Sans as Ugoki Sans: wght 350–850, wdth 100–125) into the page. */
export function loadFont(): Promise<void> {
  fontLoad ??= (async () => {
    const url = new URL('../../src/fonts/ugoki-sans.woff2', import.meta.url);
    const bytes = await (await fetch(url)).arrayBuffer();
    const face = new FontFace(FAMILY, bytes, { weight: '350 850', stretch: '100% 125%' });
    await face.load();
    document.fonts.add(face);
  })();
  return fontLoad;
}

export type Ctx = OffscreenCanvasRenderingContext2D;

export type Type = {
  size: number;
  weight: number;
  /** `semi-expanded` = wdth 112.5, `expanded` = 125. */
  stretch?: CanvasFontStretch;
  /** Tracking in em. */
  tracking?: number;
  color: string;
};

export function setType(ctx: Ctx, type: Type): void {
  ctx.font = `${type.weight} ${type.size}px "${FAMILY}"`;
  ctx.fontStretch = type.stretch ?? 'normal';
  ctx.fontKerning = 'normal';
  ctx.letterSpacing = `${(type.tracking ?? 0) * type.size}px`;
  ctx.fillStyle = type.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** Width of `text` as set, without the tracking after its last letter. */
export function measure(ctx: Ctx, type: Type, text: string): number {
  setType(ctx, type);
  return ctx.measureText(text).width - (type.tracking ?? 0) * type.size;
}

/** Breaks `text` into lines no wider than `width` (at spaces; `\n` forces a break). */
export function wrap(ctx: Ctx, type: Type, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(ctx, type, next) > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** The largest size from `type.size` down to `min` at which `text` fits `width` in `maxLines`. */
export function fitText(
  ctx: Ctx,
  type: Type,
  text: string,
  width: number,
  { min, maxLines = 1 }: { min: number; maxLines?: number },
): { type: Type; lines: string[] } {
  for (let size = type.size; size > min; size -= 1) {
    const sized = { ...type, size };
    const lines = wrap(ctx, sized, text, width);
    if (lines.length <= maxLines && lines.every((l) => measure(ctx, sized, l) <= width)) {
      return { type: sized, lines };
    }
  }
  const sized = { ...type, size: min };
  return { type: sized, lines: wrap(ctx, sized, text, width) };
}

/** Sets lines from a first baseline; returns the last baseline. */
export function lines(
  ctx: Ctx,
  type: Type,
  text: readonly string[],
  x: number,
  y: number,
  leading: number,
) {
  setType(ctx, type);
  text.forEach((line, i) => {
    ctx.fillText(line, x, y + i * leading);
  });
  return y + (text.length - 1) * leading;
}

/**
 * The `ugoki` wordmark (as src/components/wordmark.tsx): Ugoki Sans 800 at wdth 125, −4%
 * tracking, a dotless ı with the Dot — a perfect circle, 0.2 em — for its tittle. Returns its
 * width.
 */
export function wordmark(
  ctx: Ctx,
  x: number,
  baseline: number,
  size: number,
  color: string = INK.fg,
  dot: string = color,
): number {
  const type: Type = { size, weight: 800, stretch: 'expanded', tracking: -0.04, color };
  setType(ctx, type);
  ctx.fillText('ugokı', x, baseline);
  const before = ctx.measureText('ugok').width;
  const i = ctx.measureText('ı');
  // The component's geometry: a 1 em line box (leading-none) around the ı, the Dot 0.02 em
  // below its top and centered on the letter's advance (tracking included, as CSS does).
  const lineTop = baseline - (size + i.fontBoundingBoxAscent - i.fontBoundingBoxDescent) / 2;
  const cx = x + before + i.width / 2;
  ctx.beginPath();
  ctx.arc(cx, lineTop + 0.12 * size, 0.1 * size, 0, Math.PI * 2);
  ctx.fillStyle = dot;
  ctx.fill();
  return measure(ctx, type, 'ugokı');
}

/** A render framed like a gallery tile: rounded corners and an inner hairline. */
export function media(
  ctx: Ctx,
  image: CanvasImageSource,
  box: { x: number; y: number; w: number; h: number },
  radius = 20,
): void {
  const { x, y, w, h } = box;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, x, y, w, h);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, radius - 0.5);
  ctx.strokeStyle = INK.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** A blank card. */
export function card(): { canvas: OffscreenCanvas; ctx: Ctx } {
  const canvas = new OffscreenCanvas(CARD.width, CARD.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = INK.bg;
  ctx.fillRect(0, 0, CARD.width, CARD.height);
  return { canvas, ctx };
}
