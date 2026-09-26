/** Text engine facade used by templates via `ctx.text` (docs/06-engine.md §7). */

import type { FontId } from '../template/pairings';
import type { FontBytesLoader } from './font-source';
import { FontRegistry } from './fonts';
import { loadHarfBuzz } from './harfbuzz';
import { type FallbackMeasure, TextLayouter } from './layout';
import type { FontFace, TextBlock, TextBlockOptions, TextEngine, TextStyle } from './types';

export type TextEngineHandle = TextEngine & {
  readonly registry: FontRegistry;
  /** Loads fonts by manifest id; must resolve before `layout` uses them. */
  load(fonts: readonly FontId[]): Promise<void>;
};

export async function createTextEngine(options: {
  loadBytes: FontBytesLoader;
  measureFallback?: FallbackMeasure;
}): Promise<TextEngineHandle> {
  const hb = await loadHarfBuzz();
  const registry = new FontRegistry(hb, options.loadBytes);
  const layouter = new TextLayouter(registry, options.measureFallback);
  return {
    registry,
    load: (fonts) => registry.load(fonts),
    layout: (text: string, blockOptions: TextBlockOptions): TextBlock =>
      layouter.layout(text, blockOptions),
    line: (text: string, style: TextStyle): TextBlock =>
      layouter.layout(text.replace(/\n/g, ' '), {
        style,
        maxWidth: Number.POSITIVE_INFINITY,
        lineHeight: 1.2,
        balance: false,
      }),
    face: (style: TextStyle): FontFace => layouter.face(style),
    hasFont: (font: FontId) => registry.has(font),
  };
}
