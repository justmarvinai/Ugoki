/**
 * Font registry: loads engine fonts into HarfBuzz and hands out faces at specific variation
 * instances (docs/06-engine.md §7). Faces cache glyph outlines, ink extents and shaping results.
 */

import type { Feature } from 'harfbuzzjs';
import type { FontId } from '../template/pairings';
import manifest from './font-manifest.json';
import type { FontBytesLoader } from './font-source';
import type { HarfBuzz } from './harfbuzz';
import {
  type FontFace,
  type GlyphOutline,
  VERB_CLOSE,
  VERB_CUBIC,
  VERB_LINE,
  VERB_MOVE,
  VERB_QUAD,
} from './types';

/** HarfBuzz positions are integers; scaling the font by 64 keeps sub-unit precision. */
const SCALE = 64;

/**
 * Optical sizing: opsz axes are point-based (Mona Sans "Regular" = 20, "Display" = 72). Videos are
 * usually watched scaled down (a 1080p frame on a phone is ~0.35–0.6×), so we bias toward the
 * sturdier text cut: opsz = size (1080p px) × 0.6, clamped to the axis range.
 */
export const OPSZ_VIEW_SCALE = 0.6;

type AxisRange = { min: number; default: number; max: number };
type ManifestEntry = {
  url: string;
  family: string;
  axes: Record<string, AxisRange>;
  metrics: {
    upem: number;
    ascender: number;
    descender: number;
    capHeight: number;
    xHeight: number;
  };
};

const MANIFEST = manifest.fonts as Record<string, ManifestEntry>;

/** Quantization steps per axis, so animated axes reuse cached outlines. */
const AXIS_STEP: Record<string, number> = { wght: 1, wdth: 0.25, opsz: 1 };

export type Variations = Readonly<Record<string, number>>;

export type ShapedGlyph = {
  id: number;
  cluster: number;
  /** Font units (y up for offsets). */
  xAdvance: number;
  xOffset: number;
  yOffset: number;
};

export type InkBox = { x: number; y: number; w: number; h: number };

type LoadedFont = {
  id: FontId;
  face: InstanceType<HarfBuzz['Face']>;
  upem: number;
  axes: Record<string, AxisRange>;
};

export class FaceInstance implements FontFace {
  readonly key: string;
  readonly id: FontId;
  readonly upem: number;
  readonly ascender: number;
  readonly descender: number;
  readonly capHeight: number;
  readonly xHeight: number;
  readonly variations: Variations;

  private readonly font: InstanceType<HarfBuzz['Font']>;
  private readonly outlines = new Map<number, GlyphOutline>();
  private readonly inks = new Map<number, InkBox | null>();
  private readonly shaped = new Map<string, ShapedGlyph[]>();

  constructor(
    private readonly hb: HarfBuzz,
    private readonly registry: FontRegistry,
    loaded: LoadedFont,
    variations: Variations,
    key: string,
  ) {
    this.key = key;
    this.id = loaded.id;
    this.upem = loaded.upem;
    this.variations = variations;
    this.font = new hb.Font(loaded.face);
    this.font.setScale(loaded.upem * SCALE, loaded.upem * SCALE);
    const entries = Object.entries(variations);
    if (entries.length > 0) {
      this.font.setVariations(entries.map(([tag, value]) => new hb.Variation(tag, value)));
    }
    const metric = (tag: number) => this.font.getMetricPositionWithFallback(tag) / SCALE;
    const { MetricsTag } = hb;
    this.ascender = metric(MetricsTag.HORIZONTAL_ASCENDER);
    this.descender = -metric(MetricsTag.HORIZONTAL_DESCENDER);
    this.capHeight = metric(MetricsTag.CAP_HEIGHT);
    this.xHeight = metric(MetricsTag.X_HEIGHT);
  }

  /** Outline in font units, y up. */
  outline(glyph: number): GlyphOutline {
    let cached = this.outlines.get(glyph);
    if (!cached) {
      cached = this.registry.drawOutline(this.font, glyph);
      this.outlines.set(glyph, cached);
    }
    return cached;
  }

  /** Ink bounds in font units, y down, relative to the glyph origin; null for blank glyphs. */
  ink(glyph: number): InkBox | null {
    if (this.inks.has(glyph)) return this.inks.get(glyph) ?? null;
    const extents = this.font.glyphExtents(glyph);
    const box =
      extents && extents.width !== 0 && extents.height !== 0
        ? {
            x: extents.xBearing / SCALE,
            y: -extents.yBearing / SCALE,
            w: extents.width / SCALE,
            h: -extents.height / SCALE,
          }
        : null;
    this.inks.set(glyph, box);
    return box;
  }

  /** Shapes `text` (cached). Cluster values are UTF-16 indices into `text`. */
  shape(text: string, features: readonly string[], lang: string): ShapedGlyph[] {
    const cacheKey = `${features.join(',')}\u0000${lang}\u0000${text}`;
    const cached = this.shaped.get(cacheKey);
    if (cached) return cached;

    const { hb } = this;
    const buffer = new hb.Buffer();
    buffer.addText(text);
    buffer.setLanguage(lang);
    buffer.guessSegmentProperties();
    hb.shape(this.font, buffer, features.map(toFeature(hb)));
    const result: ShapedGlyph[] = buffer.getGlyphInfosAndPositions().map((g) => ({
      id: g.codepoint,
      cluster: g.cluster,
      xAdvance: (g.xAdvance ?? 0) / SCALE,
      xOffset: (g.xOffset ?? 0) / SCALE,
      yOffset: (g.yOffset ?? 0) / SCALE,
    }));
    if (this.shaped.size > 400) this.shaped.clear();
    this.shaped.set(cacheKey, result);
    return result;
  }
}

function toFeature(hb: HarfBuzz) {
  return (spec: string): Feature => {
    const off = spec.startsWith('-');
    const tag = off ? spec.slice(1) : spec.replace(/^\+/, '');
    return new hb.Feature(tag, off ? 0 : 1);
  };
}

export class FontRegistry {
  private readonly fonts = new Map<FontId, LoadedFont>();
  private readonly pending = new Map<FontId, Promise<void>>();
  private readonly instances = new Map<string, FaceInstance>();
  private drawFuncs: InstanceType<HarfBuzz['DrawFuncs']> | null = null;
  private verbs: number[] = [];
  private coords: number[] = [];

  constructor(
    readonly hb: HarfBuzz,
    private readonly loadBytes: FontBytesLoader,
  ) {}

  has(id: FontId): boolean {
    return this.fonts.has(id);
  }

  /** Loads fonts by manifest id (idempotent; concurrent calls share one request). */
  async load(ids: readonly FontId[]): Promise<void> {
    await Promise.all(ids.map((id) => this.loadOne(id)));
  }

  private loadOne(id: FontId): Promise<void> {
    if (this.fonts.has(id)) return Promise.resolve();
    let promise = this.pending.get(id);
    if (!promise) {
      const entry = MANIFEST[id];
      if (!entry)
        return Promise.reject(new Error(`Unknown font "${id}" (not in the font manifest)`));
      promise = this.loadBytes(entry.url).then((bytes) => {
        const blob = new this.hb.Blob(bytes);
        const face = new this.hb.Face(blob, 0);
        this.fonts.set(id, { id, face, upem: face.upem, axes: entry.axes });
      });
      promise.finally(() => this.pending.delete(id)).catch(() => {});
      this.pending.set(id, promise);
    }
    return promise;
  }

  axes(id: FontId): Readonly<Record<string, AxisRange>> {
    return MANIFEST[id]?.axes ?? {};
  }

  /**
   * Face for `id` at the given variation. Unknown axes are ignored, values are clamped to the
   * axis range and quantized so animated axes share cached instances.
   */
  instance(id: FontId, requested: Variations): FaceInstance {
    const loaded = this.fonts.get(id);
    if (!loaded) throw new Error(`Font "${id}" is not loaded — call registry.load() first`);
    const variations: Record<string, number> = {};
    for (const [tag, range] of Object.entries(loaded.axes)) {
      const value = requested[tag];
      if (value === undefined) continue;
      const step = AXIS_STEP[tag] ?? 1;
      const clamped = Math.min(range.max, Math.max(range.min, value));
      variations[tag] = Math.round(clamped / step) * step;
    }
    const key = `${id}|${Object.entries(variations)
      .map(([tag, value]) => `${tag}=${value}`)
      .join(',')}`;
    let face = this.instances.get(key);
    if (!face) {
      face = new FaceInstance(this.hb, this, loaded, variations, key);
      if (this.instances.size > 256) this.instances.clear();
      this.instances.set(key, face);
    }
    return face;
  }

  /** @internal Draws a glyph outline through HarfBuzz into compact typed arrays (font units). */
  drawOutline(font: InstanceType<HarfBuzz['Font']>, glyph: number): GlyphOutline {
    const funcs = this.getDrawFuncs();
    this.verbs = [];
    this.coords = [];
    font.drawGlyph(glyph, funcs);
    return { verbs: Uint8Array.from(this.verbs), commands: Float32Array.from(this.coords) };
  }

  private getDrawFuncs(): InstanceType<HarfBuzz['DrawFuncs']> {
    if (this.drawFuncs) return this.drawFuncs;
    const funcs = new this.hb.DrawFuncs();
    const s = 1 / SCALE;
    funcs.setMoveToFunc((x, y) => {
      this.verbs.push(VERB_MOVE);
      this.coords.push(x * s, y * s);
    });
    funcs.setLineToFunc((x, y) => {
      this.verbs.push(VERB_LINE);
      this.coords.push(x * s, y * s);
    });
    funcs.setQuadraticToFunc((cx, cy, x, y) => {
      this.verbs.push(VERB_QUAD);
      this.coords.push(cx * s, cy * s, x * s, y * s);
    });
    funcs.setCubicToFunc((c1x, c1y, c2x, c2y, x, y) => {
      this.verbs.push(VERB_CUBIC);
      this.coords.push(c1x * s, c1y * s, c2x * s, c2y * s, x * s, y * s);
    });
    funcs.setClosePathFunc(() => {
      this.verbs.push(VERB_CLOSE);
    });
    this.drawFuncs = funcs;
    return funcs;
  }
}

/** Resolves an axis value for `opsz: 'auto'` from the rendered size (design units). */
export function autoOpsz(size: number, range: AxisRange | undefined): number | undefined {
  if (!range) return undefined;
  return Math.min(range.max, Math.max(range.min, size * OPSZ_VIEW_SCALE));
}
