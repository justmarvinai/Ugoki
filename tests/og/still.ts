/**
 * Stills for the site's pre-rendered images (`pnpm og`): a template frame rendered exactly as a
 * paused preview paints it — the same frame renderer (motion blur, effects, finish) and, for
 * designs that are transparent by default, the backdrop the gallery shows behind them.
 */

import { commands } from 'vitest/browser';
import { createCompositor } from '@/engine/compositor';
import { type Backdrop, BackdropPainter } from '@/engine/runtime/backdrop';
import { FrameRenderer } from '@/engine/runtime/frame';
import { primaryTextKey } from '@/engine/template/controls';
import type { AnyTemplate } from '@/engine/template/define';
import type { FormatId } from '@/engine/template/formats';
import { type DesignState, initialState } from '@/engine/template/state';
import { loadTemplate } from '@/templates/registry';
import { build } from '../support/render';

const compositor = createCompositor();
const frames = new FrameRenderer(compositor);
const backdrops = new BackdropPainter();

/** A paused preview's motion blur (src/engine/host/runtime.ts). */
const PREVIEW = { samples: 8, maxSamples: 24, maxStep: 4, frameDuration: 1 / 30 } as const;

/** Transitions preview A → B; overlays (transparent by default) preview over footage. */
function backdropFor(template: AnyTemplate): Backdrop {
  if (template.structure === 'transition') return { kind: 'scenes' };
  return template.alpha === 'default' ? { kind: 'footage' } : { kind: 'none' };
}

export type StillOptions = {
  /** Default: the template's first format with 16:9 preferred. */
  format?: FormatId;
  /** Text for the template's primary text control (as the gallery's personalization does). */
  headline?: string;
  /** Output width in pixels (the height follows the format). */
  width: number;
  /** Seconds; default: the template's poster time. */
  t?: number;
};

export type Still = {
  canvas: OffscreenCanvas;
  template: AnyTemplate;
  state: DesignState;
  format: FormatId;
  t: number;
};

const templates = new Map<string, Promise<AnyTemplate>>();

export function template(id: string): Promise<AnyTemplate> {
  let loaded = templates.get(id);
  if (!loaded) {
    loaded = loadTemplate(id);
    templates.set(id, loaded);
  }
  return loaded;
}

/** The format a card shows: 16:9 when the template has it, else its first (default) format. */
export function cardFormat(formats: readonly FormatId[]): FormatId {
  return formats.includes('16:9') ? '16:9' : (formats[0] as FormatId);
}

/** The template's first Look at its poster time, rendered `width` pixels wide. */
export async function still(id: string, options: StillOptions): Promise<Still> {
  const tpl = await template(id);
  const base = initialState(tpl);
  const format = options.format ?? cardFormat(tpl.formats as readonly FormatId[]);
  const key = primaryTextKey(tpl.controls);
  const headline = options.headline?.trim();
  const state: DesignState = {
    ...base,
    format,
    props: headline && key ? { ...base.props, [key]: headline } : base.props,
  };
  const built = await build(tpl, state);
  const t = Math.min(options.t ?? tpl.poster, built.timeline.duration - 1 / 60);
  const scale = options.width / built.frame.width;
  const width = options.width;
  const height = Math.round(built.frame.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const backdrop = built.state.transparent ? backdropFor(tpl) : ({ kind: 'none' } as const);
  if (backdrop.kind === 'none') {
    frames.render(built, ctx, { t, scale, ...PREVIEW });
  } else {
    const layer = new OffscreenCanvas(width, height);
    const layerCtx = layer.getContext('2d');
    if (!layerCtx) throw new Error('Canvas 2D is unavailable');
    frames.render(built, layerCtx, { t, scale, ...PREVIEW });
    backdrops.draw(ctx, backdrop, { t, cut: built.timeline.cut });
    ctx.drawImage(layer, 0, 0);
  }
  return { canvas, template: tpl, state: built.state, format, t };
}

/** Writes a canvas as an image file, relative to the project root. */
export async function save(
  canvas: OffscreenCanvas,
  path: string,
  type: 'image/png' | 'image/jpeg' | 'image/webp',
  quality?: number,
): Promise<number> {
  const blob = await canvas.convertToBlob({ type, quality });
  if (blob.type !== type) throw new Error(`This browser can't encode ${type}`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  await commands.writeFile(path, btoa(binary), 'base64');
  return bytes.length;
}
