/**
 * The site's pre-rendered images (`pnpm og [filter…]`, docs/05-architecture.md §14), rendered
 * with the engine — every picture of a template is a real poster frame:
 *
 *  - `public/posters/hero-16x9.webp`, `hero-1x1.webp` — the landing hero until the engine paints;
 *  - `public/og/<key>.jpg` — 1200 × 630 share cards: `home`, `templates`, `templates-<category>`,
 *    `template-<id>`;
 *  - `src/app/apple-icon.png` — the Dot in its square (as src/app/icon.svg).
 *
 * Also writes contact sheets of the cards it rendered to `.cache/og/sheet-<n>.png` for review.
 * Not part of CI: rerun it when templates or the cards change, and commit the output.
 */

import { afterAll, expect, inject, test } from 'vitest';
import { commands } from 'vitest/browser';
import { contrastRatio, ensureContrast, parseHex, toCss, toOklch } from '@/engine/core/color';
import { CATEGORIES, type CategoryId, categoryName } from '@/engine/template/categories';
import { FORMATS, type FormatId } from '@/engine/template/formats';
import { resolvePalette } from '@/engine/template/palettes';
import type { DesignState } from '@/engine/template/state';
import { TEMPLATES, type TemplateEntry } from '@/templates/registry';
import {
  CARD,
  type Ctx,
  card,
  fitText,
  INK,
  lines,
  loadFont,
  MARGIN,
  media,
  setType,
  type Type,
  wordmark,
  wrap,
} from './card';
import { cardFormat, type Still, save, still } from './still';

declare module 'vitest' {
  export interface ProvidedContext {
    og: string;
  }
}

/** `*` (everything) or a comma-separated filter from `pnpm og`; empty when run any other way. */
const request = inject('og');
const filters = request === '*' ? [] : request.split(',').filter(Boolean);

/** Whether an output is asked for: by its key, or a name or group it belongs to. */
const wanted = (key: string, names: readonly string[]) =>
  request !== '' && (filters.length === 0 || filters.some((f) => f === key || names.includes(f)));

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

// --- stills ------------------------------------------------------------------------------------

const stills = new Map<string, Promise<Still>>();

/**
 * Frames that show a template better than its poster frame at card size (seconds). Layers'
 * poster is the cut — the frame its panels cover completely, one flat color.
 */
const CARD_TIMES: Readonly<Record<string, number>> = { layers: 0.25 };

/** A template's poster frame (first Look), `width` px wide — cached, cards share them. */
function poster(id: string, width: number, format?: FormatId): Promise<Still> {
  const entry = TEMPLATES.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown template "${id}"`);
  const shown = format ?? cardFormat(entry.formats);
  const key = `${id}:${shown}:${width}`;
  let shot = stills.get(key);
  if (!shot) {
    shot = still(id, { format: shown, width, t: CARD_TIMES[id] });
    stills.set(key, shot);
  }
  return shot;
}

/** Size of a `format` box that fits `max` (px). */
function fitBox(format: FormatId, max: { w: number; h: number }) {
  const { aspect } = FORMATS[format];
  const w = Math.min(max.w, Math.round(max.h * aspect));
  return { w, h: Math.round(w / aspect) };
}

// --- type --------------------------------------------------------------------------------------

/** The card's headline voice (display-l: 700 · wdth 112, −3%). */
const DISPLAY: Type = {
  size: 76,
  weight: 750,
  stretch: 'semi-expanded',
  tracking: -0.03,
  color: INK.fg,
};
/** The landing's display voice (display-xxl: 800 · wdth 125, −4%). */
const HERO: Type = { size: 96, weight: 800, stretch: 'expanded', tracking: -0.04, color: INK.fg };
const SUB: Type = { size: 26, weight: 450, tracking: -0.005, color: INK.fg2 };
const LABEL: Type = { size: 22, weight: 550, tracking: 0.01, color: INK.fg3 };
const WORDMARK_SIZE = 34;

/** Distance from the baseline to the top of lowercase ascenders / capitals. */
function ascent(ctx: Ctx, type: Type, text: string): number {
  setType(ctx, type);
  return ctx.measureText(text).actualBoundingBoxAscent;
}

/** The wordmark with its top (the k's ascender) on `top`. */
function brand(ctx: Ctx, x: number, top: number, dot?: string) {
  const type: Type = { size: WORDMARK_SIZE, weight: 800, stretch: 'expanded', color: INK.fg };
  wordmark(ctx, x, top + ascent(ctx, type, 'k'), WORDMARK_SIZE, INK.fg, dot);
}

/**
 * A text column's block, bottom-aligned: an optional label, a headline, and a subline whose
 * last baseline sits on `bottom`.
 */
function block(
  ctx: Ctx,
  x: number,
  bottom: number,
  width: number,
  content: {
    label?: string;
    headline: string;
    display: Type;
    min: number;
    maxLines: number;
    sub?: string;
    subLines?: number;
  },
) {
  const sub = content.sub ? wrap(ctx, SUB, content.sub, width).slice(0, content.subLines ?? 2) : [];
  const subLeading = Math.round(SUB.size * 1.32);
  const firstSub = bottom - (sub.length - 1) * subLeading;
  const head = fitText(ctx, content.display, content.headline, width, {
    min: content.min,
    maxLines: content.maxLines,
  });
  const leading = Math.round(head.type.size * 0.98);
  const lastHead = sub.length ? firstSub - SUB.size - Math.round(head.type.size * 0.3) : bottom;
  const firstHead = lastHead - (head.lines.length - 1) * leading;
  lines(ctx, head.type, head.lines, x, firstHead, leading);
  if (sub.length) lines(ctx, SUB, sub, x, firstSub, subLeading);
  if (content.label) {
    const capital = ascent(ctx, head.type, 'H');
    setType(ctx, LABEL);
    ctx.fillText(content.label, x, firstHead - capital - Math.round(LABEL.size * 1.1));
  }
}

// --- color -------------------------------------------------------------------------------------

/** The Dot takes the template's accent (docs/03-design-system.md §2), kept visible on Cinema. */
function accentDot(state: DesignState): string {
  const { roles } = resolvePalette(state.palette);
  const bg = parseHex(INK.bg);
  for (const role of ['accent', 'accent2', 'accent3'] as const) {
    const color = roles[role];
    if (toOklch(color).C < 0.06) continue;
    const dot = ensureContrast(color, bg, 3);
    if (contrastRatio(dot, bg) >= 3) return toCss(dot);
  }
  return INK.fg;
}

// --- cards -------------------------------------------------------------------------------------

/** Half-size copies of this run's cards, for the contact sheets. */
const rendered: { key: string; image: ImageBitmap }[] = [];

async function publish(key: string, canvas: OffscreenCanvas) {
  const path = `public/og/${key}.jpg`;
  const bytes = await save(canvas, path, 'image/jpeg', 0.82);
  const image = await createImageBitmap(canvas, {
    resizeWidth: CARD.width / 2,
    resizeHeight: CARD.height / 2,
    resizeQuality: 'high',
  });
  rendered.push({ key, image });
  expect.soft(bytes, `${path}: ${kb(bytes)}, over its 150 KB budget`).toBeLessThan(150 * 1024);
}

const GUTTER = 48;
/** Right-hand media area of a card. */
const MEDIA = { w: 720, h: CARD.height - 2 * MARGIN };

async function templateCard(entry: TemplateEntry) {
  const format = cardFormat(entry.formats);
  const box = fitBox(format, MEDIA);
  // Centered in the media area (vertical formats are narrower than it).
  const x = CARD.width - MARGIN - MEDIA.w + Math.round((MEDIA.w - box.w) / 2);
  const y = Math.round((CARD.height - box.h) / 2);
  const shot = await poster(entry.id, box.w, format);
  const { canvas, ctx } = card();
  media(ctx, shot.canvas, { x, y, ...box });
  const column = CARD.width - MARGIN - MEDIA.w - GUTTER - MARGIN;
  brand(ctx, MARGIN, y, accentDot(shot.state));
  block(ctx, MARGIN, y + box.h - 4, column, {
    label: categoryName(entry.category),
    headline: entry.name,
    display: DISPLAY,
    min: 40,
    maxLines: 1,
    sub: entry.tagline,
  });
  return canvas;
}

/** A category's templates, in gallery order. */
const inCategory = (id: CategoryId) => TEMPLATES.filter((e) => e.category === id);

const list = (names: readonly string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/**
 * Categories shown as a row of three 9:16 posters instead of a 2 × 2 grid of 16:9 ones, and
 * which templates they show: social is vertical-first; lower thirds sit over the same footage
 * backdrop, so they need the larger share of the frame a vertical format gives them.
 */
const ROWS: Partial<Record<CategoryId, readonly string[]>> = {
  social: ['punch', 'listicle', 'countdown'],
  'lower-thirds': ['broadcast', 'capsule', 'editorial'],
};

async function categoryCard(id: CategoryId, name: string) {
  const entries = inCategory(id);
  const row = ROWS[id];
  const { canvas, ctx } = card();
  const gap = 12;
  let top = 0;
  let bottom = 0;
  if (row) {
    const picks = row.map((pick) => entries.find((e) => e.id === pick)!);
    const w = Math.floor((MEDIA.w - gap * (picks.length - 1)) / picks.length);
    const h = Math.round((w * 16) / 9);
    top = Math.round((CARD.height - h) / 2);
    bottom = top + h;
    for (const [i, entry] of picks.entries()) {
      const shot = await poster(entry.id, w, '9:16');
      const x = CARD.width - MARGIN - MEDIA.w + i * (w + gap);
      media(ctx, shot.canvas, { x, y: top, w, h }, 16);
    }
  } else {
    // A 2 × 2 grid of 16:9 posters.
    const picks = entries.filter((e) => e.formats.includes('16:9')).slice(0, 4);
    const w = Math.floor((MEDIA.w - gap) / 2);
    const h = Math.round((w * 9) / 16);
    top = Math.round((CARD.height - (2 * h + gap)) / 2);
    bottom = top + 2 * h + gap;
    for (const [i, entry] of picks.entries()) {
      const shot = await poster(entry.id, w, '16:9');
      const x = CARD.width - MARGIN - MEDIA.w + (i % 2) * (w + gap);
      const y = top + Math.floor(i / 2) * (h + gap);
      media(ctx, shot.canvas, { x, y, w, h }, 16);
    }
  }
  const column = CARD.width - MARGIN - MEDIA.w - GUTTER - MARGIN;
  brand(ctx, MARGIN, top);
  block(ctx, MARGIN, bottom - 4, column, {
    headline: name,
    display: DISPLAY,
    min: 40,
    maxLines: 3,
    sub: `${entries.length} templates: ${list(entries.map((e) => e.name))}`,
    subLines: 3,
  });
  return canvas;
}

/** Round-robin through the categories, so neighbors differ. */
function mixed(): TemplateEntry[] {
  const lanes = CATEGORIES.map((c) => inCategory(c.id));
  const out: TemplateEntry[] = [];
  for (let i = 0; out.length < TEMPLATES.length; i++) {
    for (const lane of lanes) {
      const entry = lane[i];
      if (entry) out.push(entry);
    }
  }
  return out;
}

async function galleryCard() {
  const { canvas, ctx } = card();
  // A wall of posters running off the card's edges: there is more than fits.
  const w = 256;
  const h = Math.round((w * 9) / 16);
  const gap = 12;
  const x0 = 500;
  const wall = mixed().filter((e) => e.formats.includes('16:9'));
  let n = 0;
  for (let col = 0; x0 + col * (w + gap) < CARD.width; col++) {
    const offset = col % 2 === 0 ? -48 : -48 - Math.round((h + gap) / 2);
    for (let row = 0; offset + row * (h + gap) < CARD.height; row++) {
      const entry = wall[n++ % wall.length]!;
      const shot = await poster(entry.id, w, '16:9');
      media(ctx, shot.canvas, { x: x0 + col * (w + gap), y: offset + row * (h + gap), w, h }, 14);
    }
  }
  const column = x0 - GUTTER - MARGIN;
  brand(ctx, MARGIN, MARGIN);
  block(ctx, MARGIN, CARD.height - MARGIN - 4, column, {
    headline: `${TEMPLATES.length} motion templates`,
    display: DISPLAY,
    min: 40,
    maxLines: 2,
    sub: 'Titles, lower thirds, social, ads, openers, transitions and logos.',
    subLines: 3,
  });
  return canvas;
}

/** The landing's card: the tagline beside a composition of posters in several formats. */
async function homeCard() {
  const { canvas, ctx } = card();
  const gap = 12;
  const width = 660;
  // A tall 9:16 poster beside two stacked 16:9 posters, all one height.
  const tallH = Math.round((width - gap + (gap * 16) / 18) / (9 / 16 + 16 / 18));
  const tallW = Math.round((tallH * 9) / 16);
  const sideW = width - gap - tallW;
  const sideH = Math.round((sideW * 9) / 16);
  const top = Math.round((CARD.height - tallH) / 2);
  const x = CARD.width - MARGIN - width;
  const tall = await poster('stretch', tallW, '9:16');
  media(ctx, tall.canvas, { x, y: top, w: tallW, h: tallH }, 16);
  const first = await poster('cinematic', sideW, '16:9');
  media(ctx, first.canvas, { x: x + tallW + gap, y: top, w: sideW, h: sideH }, 16);
  const second = await poster('deal', sideW, '16:9');
  const y2 = top + tallH - sideH;
  media(ctx, second.canvas, { x: x + tallW + gap, y: y2, w: sideW, h: sideH }, 16);
  const column = x - GUTTER - MARGIN;
  brand(ctx, MARGIN, top);
  block(ctx, MARGIN, top + tallH - 4, column, {
    headline: 'Motion,\nmade yours.',
    display: HERO,
    min: 48,
    maxLines: 2,
    sub: 'Art-directed motion templates. Free, in your browser.',
    subLines: 2,
  });
  return canvas;
}

// --- outputs -----------------------------------------------------------------------------------

// Hero posters: what the landing's hero stage shows until the engine paints — Rise, first Look,
// "Make it yours", at its poster time.
const HERO_TEXT = 'Make it yours';
for (const { key, format, width } of [
  { key: 'hero-16x9', format: '16:9', width: 1600 },
  { key: 'hero-1x1', format: '1:1', width: 900 },
] as const) {
  test.runIf(wanted(key, ['posters', 'hero']))(key, { timeout: 60_000 }, async () => {
    const { canvas } = await still('rise', { format, headline: HERO_TEXT, width });
    await save(canvas, `public/posters/${key}.webp`, 'image/webp', 0.85);
  });
}

test.runIf(wanted('home', ['cards']))('home', { timeout: 120_000 }, async () => {
  await loadFont();
  await publish('home', await homeCard());
});

test.runIf(wanted('templates', ['cards']))('templates', { timeout: 300_000 }, async () => {
  await loadFont();
  await publish('templates', await galleryCard());
});

for (const { id, name } of CATEGORIES) {
  const key = `templates-${id}`;
  test.runIf(wanted(key, ['cards', 'categories', id]))(key, { timeout: 120_000 }, async () => {
    await loadFont();
    await publish(key, await categoryCard(id, name));
  });
}

for (const entry of TEMPLATES) {
  const key = `template-${entry.id}`;
  test.runIf(wanted(key, ['cards', 'template', entry.id]))(key, { timeout: 120_000 }, async () => {
    await loadFont();
    await publish(key, await templateCard(entry));
  });
}

test.runIf(wanted('apple-icon', ['icon', 'icons']))('apple-icon', async () => {
  // Full-bleed: iOS rounds the corners itself (and would fill transparent ones with black).
  const size = 180;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = INK.bg;
  ctx.fillRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, (11 / 64) * size, 0, Math.PI * 2);
  ctx.fillStyle = INK.fg;
  ctx.fill();
  await save(canvas, 'src/app/apple-icon.png', 'image/png');
});

// Contact sheets of what this run rendered, for review (older pages are removed).
afterAll(async () => {
  if (rendered.length === 0) return;
  const per = 12;
  const cols = 3;
  const cw = CARD.width / 2;
  const ch = CARD.height / 2;
  for (let page = 0; page * per < rendered.length; page++) {
    const items = rendered.slice(page * per, (page + 1) * per);
    const rows = Math.ceil(items.length / cols);
    const sheet = new OffscreenCanvas(cols * cw + (cols + 1) * 8, rows * (ch + 24) + 8);
    const ctx = sheet.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#2a2b2e';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.font = '14px sans-serif';
    items.forEach(({ key, image }, i) => {
      const x = 8 + (i % cols) * (cw + 8);
      const y = 8 + Math.floor(i / cols) * (ch + 24);
      ctx.fillStyle = '#ccc';
      ctx.fillText(key, x, y + 13);
      ctx.drawImage(image, x, y + 18);
    });
    await save(sheet, `.cache/og/sheet-${page + 1}.png`, 'image/png');
  }
  for (let page = Math.ceil(rendered.length / per) + 1; ; page++) {
    try {
      await commands.removeFile(`.cache/og/sheet-${page}.png`);
    } catch {
      break;
    }
  }
});
