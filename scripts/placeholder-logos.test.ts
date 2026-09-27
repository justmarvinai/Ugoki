/**
 * Generates the placeholder logos of the fictional brands Halden, Nova and Aero
 * (docs/templates/00-foundations.md §7): geometric marks drawn here, wordmarks outlined from
 * Ugoki's own fonts, written as small SVG documents to `src/engine/assets/placeholder-logos.ts`.
 *
 * `pnpm test` checks the committed file is current; `UPDATE_PLACEHOLDERS=1 pnpm test` rewrites it.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createTextEngine } from '../src/engine/text/engine';
import { gunzipIfNeeded } from '../src/engine/text/font-source';
import {
  type TextBlock,
  type TextStyle,
  VERB_CLOSE,
  VERB_CUBIC,
  VERB_LINE,
  VERB_MOVE,
  VERB_QUAD,
} from '../src/engine/text/types';

const OUTPUT = join(process.cwd(), 'src/engine/assets/placeholder-logos.ts');
const MARK = 100;
const GAP = 24;

const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** A disk-clipped horizontal band of the Halden mark (circle radius 36 around 50,50). */
function band(y1: number, y2: number): string {
  const r = 36;
  const h1 = Math.sqrt(r * r - (y1 - 50) ** 2);
  const h2 = Math.sqrt(r * r - (y2 - 50) ** 2);
  return (
    `M${n(50 - h1)} ${n(y1)}L${n(50 + h1)} ${n(y1)}A${r} ${r} 0 0 1 ${n(50 + h2)} ${n(y2)}` +
    `L${n(50 - h2)} ${n(y2)}A${r} ${r} 0 0 1 ${n(50 - h1)} ${n(y1)}Z`
  );
}

const ring = (outer: number, inner: number) =>
  `M${50 + outer} 50A${outer} ${outer} 0 1 1 ${50 - outer} 50A${outer} ${outer} 0 1 1 ${50 + outer} 50Z` +
  `M${50 + inner} 50A${inner} ${inner} 0 1 0 ${50 - inner} 50A${inner} ${inner} 0 1 0 ${50 + inner} 50Z`;

type Brand = {
  /** Mark paths in a 100 × 100 box (fill-rule evenodd). */
  mark: string[];
  word: string;
  style: TextStyle;
  /** Height of the band centered on the mark: x-height (lowercase) or cap height. */
  align: 'x-height' | 'cap-height';
  /** Target height of that band in mark units. */
  target: number;
};

const BRANDS: Record<'halden' | 'nova' | 'aero', Brand> = {
  // Design studio: three horizon lines settling into a circle; a quiet serif wordmark.
  halden: {
    mark: [ring(50, 42), band(52, 59), band(64, 71), band(76, 83)],
    word: 'Halden',
    style: { font: 'instrument-serif', size: 100, weight: 400, width: 100, tracking: 0.01 },
    align: 'cap-height',
    target: 54,
  },
  // Tech product: a four-point star whose inner corners are fully rounded.
  nova: {
    mark: ['M50 0C55 32 68 45 100 50C68 55 55 68 50 100C45 68 32 55 0 50C32 45 45 32 50 0Z'],
    word: 'nova',
    style: { font: 'mona-sans', size: 100, weight: 720, width: 125, tracking: -0.01 },
    align: 'x-height',
    target: 46,
  },
  // Consumer goods: a geometric single-story "a" monogram.
  aero: {
    mark: [ring(50, 31), 'M82 0H100V100H82Z'],
    word: 'aero',
    style: { font: 'inter', size: 100, weight: 640, width: 100, tracking: -0.02 },
    align: 'x-height',
    target: 46,
  },
};

/** SVG path data for all glyphs of a single-line block, baseline at `baseline`, left at `left`. */
function outline(block: TextBlock, left: number, baseline: number): string {
  let d = '';
  for (const line of block.lines) {
    for (const glyph of line.glyphs) {
      if (!glyph.ink || glyph.fallback) continue;
      const k = glyph.size / glyph.face.upem;
      const ox = left + line.x + glyph.x;
      const oy = baseline + glyph.y;
      const X = (x: number) => n(ox + x * k);
      const Y = (y: number) => n(oy - y * k);
      const { verbs, commands: c } = glyph.face.outline(glyph.id);
      let i = 0;
      for (const verb of verbs) {
        switch (verb) {
          case VERB_MOVE:
            d += `M${X(c[i] as number)} ${Y(c[i + 1] as number)}`;
            i += 2;
            break;
          case VERB_LINE:
            d += `L${X(c[i] as number)} ${Y(c[i + 1] as number)}`;
            i += 2;
            break;
          case VERB_QUAD:
            d += `Q${X(c[i] as number)} ${Y(c[i + 1] as number)} ${X(c[i + 2] as number)} ${Y(c[i + 3] as number)}`;
            i += 4;
            break;
          case VERB_CUBIC:
            d += `C${X(c[i] as number)} ${Y(c[i + 1] as number)} ${X(c[i + 2] as number)} ${Y(c[i + 3] as number)} ${X(c[i + 4] as number)} ${Y(c[i + 5] as number)}`;
            i += 6;
            break;
          case VERB_CLOSE:
            d += 'Z';
            break;
        }
      }
    }
  }
  return d;
}

async function generate(): Promise<string> {
  const text = await createTextEngine({
    loadBytes: async (url) => {
      const file = await readFile(join(process.cwd(), 'public', url));
      return gunzipIfNeeded(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    },
  });
  await text.load(['mona-sans', 'inter', 'instrument-serif']);

  const entries: string[] = [];
  for (const [id, brand] of Object.entries(BRANDS)) {
    // Size the wordmark so its x-height (or cap height) spans `target` mark units.
    const face = text.face(brand.style);
    const band = (brand.align === 'x-height' ? face.xHeight : face.capHeight) / face.upem;
    const size = brand.target / band;
    const block = text.line(brand.word, { ...brand.style, size });
    const left = MARK + GAP;
    const baseline = 50 + brand.target / 2;
    const width = left + block.ink.x + block.ink.w;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${MARK}" fill="currentColor" fill-rule="evenodd">` +
      brand.mark.map((d) => `<path d="${d}"/>`).join('') +
      `<path fill-rule="nonzero" d="${outline(block, left, baseline)}"/>` +
      '</svg>';
    entries.push(`  ${id}:\n    '${svg}',`);
  }
  return `/**
 * Placeholder logos of the fictional brands Halden, Nova and Aero
 * (docs/templates/00-foundations.md §7) as SVG documents in \`currentColor\`.
 * Generated by scripts/placeholder-logos.test.ts from hand-drawn marks and wordmarks outlined
 * from Ugoki's fonts — do not edit; run \`UPDATE_PLACEHOLDERS=1 pnpm test\`.
 */

export const PLACEHOLDER_LOGOS = {
${entries.join('\n')}
} as const;

export type PlaceholderLogoId = keyof typeof PLACEHOLDER_LOGOS;
`;
}

test('placeholder logos are generated from the committed fonts', async () => {
  const generated = await generate();
  if (process.env.UPDATE_PLACEHOLDERS === '1') {
    await writeFile(OUTPUT, generated);
    return;
  }
  const committed = await readFile(OUTPUT, 'utf8').catch(() => '');
  expect(committed, 'Run UPDATE_PLACEHOLDERS=1 pnpm test to regenerate').toBe(generated);
});
