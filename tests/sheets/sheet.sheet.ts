/**
 * Contact sheets for building templates (`pnpm sheet <id> [mode…]`): one PNG per mode in
 * `.sheets/`, rendering a template over a grid of formats, times, Looks, energies, durations or
 * stress text — to look at while designing. Title-safe areas are outlined (magenta; the social
 * zone of vertical formats in cyan). Not part of CI.
 *
 * Modes: timeline (default) · looks · energy · duration · stress · transparent · big (one large
 * poster frame per format, for typography detail)
 */

import { inject, test } from 'vitest';
import { commands } from 'vitest/browser';
import type { ControlSchema } from '@/engine/template/controls';
import type { AnyTemplate } from '@/engine/template/define';
import type { FormatId } from '@/engine/template/formats';
import { applyLook, type DesignState, initialState } from '@/engine/template/state';
import type { EnergyId } from '@/engine/timeline/energy';
import { build, render } from '../support/render';

declare module 'vitest' {
  export interface ProvidedContext {
    sheet: string;
    sheetMode: string;
  }
}

const modules = import.meta.glob('/src/templates/*/*/index.ts') as Record<
  string,
  () => Promise<{ default: AnyTemplate }>
>;

async function loadById(id: string): Promise<AnyTemplate> {
  const key = Object.keys(modules).find((path) => path.endsWith(`/${id}/index.ts`));
  const load = key ? modules[key] : undefined;
  if (!load) throw new Error(`No template directory named "${id}" under src/templates/*/`);
  return (await load()).default;
}

type Cell = { label: string; state: DesignState; t: number; scale?: number };
type Row = { label: string; cells: Cell[] };

/** Output pixels per design unit: cells ~260 px on their long side. */
const SCALE = 0.135;
const GAP = 10;
const LABEL = 150;
const HEADER = 22;
const GREY = '#5a5d61';

function times(
  template: AnyTemplate,
  state: DesignState,
  built: { timeline: { duration: number } },
) {
  const duration = built.timeline.duration;
  const last = duration - 1 / 60;
  const poster = Math.min(template.poster, last);
  const at = [0, 0.05, 0.1, 0.18, 0.28, 0.75, 0.88, 0.95].map((f) => f * duration);
  const all = [...at, poster, last].sort((a, b) => a - b);
  void state;
  return all.map((t) => Number(t.toFixed(3)));
}

const BRANDS = ['#E4572E', '#1B998B', '#6B4EFF'];

/** Text that fills a control to its limits (realistic words, not filler). */
function stressText(maxLength: number, maxLines: number | undefined, kind: string): string {
  const words: Record<string, string[]> = {
    long: ['Extraordinary', 'announcements', 'deserve', 'beautifully', 'considered', 'motion'],
    accents: ['Łódź', 'Ärger', 'Øresund', 'Écoute', 'Ñandú', 'Ğüzel', 'Straße'],
    numbers: ['2026', '1,234,567', '98.6%', '€3,499', '24/7', '#42'],
  };
  const pool = words[kind] ?? words.long!;
  let text = '';
  let i = 0;
  while (text.length < maxLength) text += `${text ? ' ' : ''}${pool[i++ % pool.length]}`;
  text = text.slice(0, maxLength).trim();
  if (maxLines && maxLines > 1) {
    const parts = text.split(' ');
    const per = Math.ceil(parts.length / maxLines);
    const lines: string[] = [];
    for (let l = 0; l < maxLines; l++) lines.push(parts.slice(l * per, (l + 1) * per).join(' '));
    text = lines.filter(Boolean).join('\n');
  }
  return text;
}

function withText(template: AnyTemplate, state: DesignState, kind: string): DesignState {
  const props: Record<string, unknown> = { ...state.props };
  for (const [key, control] of Object.entries(template.controls as ControlSchema)) {
    if (control.kind !== 'text') continue;
    props[key] =
      kind === 'one-word'
        ? control.primary
          ? 'Wow'
          : props[key]
        : stressText(control.maxLength, control.multiline ? control.maxLines : 1, kind);
  }
  return { ...state, props };
}

async function rows(template: AnyTemplate, mode: string): Promise<Row[]> {
  const base = initialState(template);
  const formats = template.formats as readonly FormatId[];
  const probe = await build(template, base);
  const timeline = times(template, base, probe);
  const poster = Math.min(template.poster, probe.timeline.duration - 1 / 60);
  const across = (state: DesignState, ts: number[]): Cell[] =>
    ts.map((t) => ({ label: `${t.toFixed(2)}s`, state, t }));
  switch (mode) {
    case 'looks':
      return [
        ...template.looks.map((look) => ({
          label: `Look: ${look.name}`,
          cells: formats.map((format) => ({
            label: format,
            state: { ...applyLook(template, base, look), format },
            t: poster,
          })),
        })),
        ...(['light', 'dark', 'bold'] as const).map((variant, i) => ({
          label: `Brand ${variant} ${BRANDS[i]}`,
          cells: formats.map((format) => ({
            label: format,
            state: {
              ...base,
              format,
              palette: { kind: 'brand' as const, color: BRANDS[i]!, variant },
            },
            t: poster,
          })),
        })),
      ];
    case 'energy':
      return (['calm', 'balanced', 'punchy'] as EnergyId[]).map((energy) => ({
        label: energy,
        cells: across({ ...base, energy }, timeline),
      }));
    case 'duration': {
      const { min, max } = template.duration;
      const out: Row[] = [];
      for (const duration of [min, max]) {
        const state = { ...base, duration };
        const built = await build(template, state);
        out.push({ label: `${duration}s`, cells: across(state, times(template, state, built)) });
      }
      return out;
    }
    case 'stress':
      return ['one-word', 'long', 'accents', 'numbers'].map((kind) => ({
        label: kind,
        cells: formats.map((format) => ({
          label: format,
          state: { ...withText(template, base, kind), format },
          t: poster,
        })),
      }));
    case 'big':
      return [
        {
          label: 'poster',
          cells: formats.map((format) => ({
            label: `${format} @ ${poster.toFixed(2)}s`,
            state: { ...base, format },
            t: poster,
            scale: 0.4,
          })),
        },
      ];
    case 'transparent':
      return formats.map((format) => ({
        label: `${format} alpha`,
        cells: across({ ...base, format, transparent: true }, timeline),
      }));
    default:
      return formats.map((format) => ({
        label: format,
        cells: across({ ...base, format }, timeline),
      }));
  }
}

async function sheet(template: AnyTemplate, mode: string): Promise<string> {
  const grid = await rows(template, mode);
  const frames = [];
  for (const row of grid) {
    const rendered = [];
    for (const cell of row.cells) {
      const built = await build(template, cell.state);
      rendered.push({ cell, built, frame: render(built, cell.t, cell.scale ?? SCALE) });
    }
    frames.push(rendered);
  }
  const rowHeights = frames.map((row) => Math.max(...row.map(({ frame }) => frame.height)));
  const widths = frames.map((row) => row.reduce((w, { frame }) => w + frame.width + GAP, 0));
  const width = LABEL + Math.max(...widths);
  const height = rowHeights.reduce((h, rh) => h + rh + HEADER + GAP, GAP);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = '#1b1c1e';
  ctx.fillRect(0, 0, width, height);
  ctx.font = '13px sans-serif';
  let y = GAP;
  frames.forEach((row, r) => {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText(grid[r]!.label, 8, y + HEADER + 16);
    let x = LABEL;
    for (const { cell, built, frame } of row) {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillText(cell.label, x, y + 15);
      ctx.fillStyle = GREY;
      ctx.fillRect(x, y + HEADER, frame.width, frame.height);
      ctx.drawImage(frame.canvas, x, y + HEADER);
      const safe = [
        { rect: built.frame.safe.title, color: 'rgba(255,0,200,0.55)' },
        ...(built.frame.vertical
          ? [{ rect: built.frame.safe.social, color: 'rgba(0,220,255,0.55)' }]
          : []),
      ];
      for (const { rect, color } of safe) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(
          x + rect.x * frame.scale + 0.5,
          y + HEADER + rect.y * frame.scale + 0.5,
          rect.w * frame.scale,
          rect.h * frame.scale,
        );
      }
      x += frame.width + GAP;
    }
    y += rowHeights[r]! + HEADER + GAP;
  });
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const path = `.sheets/${template.id}-${mode}.png`;
  await commands.writeFile(path, btoa(binary), 'base64');
  return `.sheets/${template.id}-${mode}.png`;
}

const id = inject('sheet');
const modes = (inject('sheetMode') || 'timeline').split(',');
/** Sheet ids other files in this project handle (see tests/sheets/imagery.sheet.ts). */
const OTHER_SHEETS = new Set(['imagery']);

for (const mode of modes) {
  test.runIf(Boolean(id) && !OTHER_SHEETS.has(id))(
    `${id} — ${mode}`,
    { timeout: 180_000 },
    async () => {
      const template = await loadById(id);
      const file = await sheet(template, mode);
      console.info(`sheet: ${file}`);
    },
  );
}
