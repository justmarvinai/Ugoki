/**
 * UI Kit charts: a monotone line/area chart drawn on with a trim path, bars that grow from a
 * shared baseline, a donut that sweeps to its value, and value/category axes with gridlines.
 * Geometry and labels are built once; frames only pass progress values.
 */

import { type Color, withAlpha } from '../core/color';
import { clamp01, type Rect, type Vec2 } from '../core/math';
import type { Draw, Gradient, PathCommand, PathData } from '../draw/types';
import type { TextBlock } from '../text/types';
import type { UiKit } from './context';
import { monotonePath, monotoneTangents, niceTicks, PathSampler, type Ticks } from './curves';

export type Domain = { readonly min: number; readonly max: number };

/** A domain from zero (or the data's minimum, if negative) to a nice maximum, with its ticks. */
export function chartDomain(values: readonly number[], ticks = 4, zero = true): Ticks {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  if (!Number.isFinite(min)) return niceTicks(0, 1, ticks);
  return niceTicks(zero ? Math.min(0, min) : min, max, ticks);
}

// --- line / area --------------------------------------------------------------------------

export type LineChartOptions = {
  plot: Rect;
  values: readonly number[];
  domain: Domain;
  /**
   * Intervals across the plot's width (default values.length − 1). With more values than
   * `span + 1`, the extra points run past the right edge (a live chart scrolls them in).
   */
  span?: number;
};

/** A monotone cubic line through the values, its area down to the baseline, and a sampler. */
export class LineChart {
  readonly plot: Rect;
  readonly domain: Domain;
  readonly step: number;
  readonly points: readonly Vec2[];
  readonly line: PathData;
  readonly area: PathData;
  readonly sampler: PathSampler;
  readonly baseline: number;
  private readonly tangents: Float64Array;

  constructor(options: LineChartOptions) {
    const { plot, values, domain } = options;
    this.plot = plot;
    this.domain = domain;
    const span = Math.max(1, options.span ?? values.length - 1);
    this.step = plot.w / span;
    this.baseline = this.y(Math.max(domain.min, Math.min(domain.max, 0)));
    this.points = values.map((v, i) => ({ x: plot.x + i * this.step, y: this.y(v) }));
    const line = monotonePath(this.points);
    this.line = line;
    this.tangents = monotoneTangents(
      this.points.map((p) => p.x),
      this.points.map((p) => p.y),
    );
    const last = this.points[this.points.length - 1];
    const first = this.points[0];
    const area: PathCommand[] = [...line];
    if (first && last) {
      area.push(['L', last.x, this.baseline], ['L', first.x, this.baseline], ['Z']);
    }
    this.area = area;
    this.sampler = new PathSampler(line);
  }

  /** Screen y of a value. */
  y(value: number): number {
    const { min, max } = this.domain;
    const t = max > min ? (value - min) / (max - min) : 0;
    return this.plot.y + this.plot.h * (1 - t);
  }

  /** Tangent (dy/dx) of the curve at point `i`. */
  slope(i: number): number {
    return this.tangents[i] ?? 0;
  }

  /** A vertical fill for the area: the color at `alpha` under the line, fading to nothing. */
  areaFill(color: Color, alpha: number): Gradient {
    const top = Math.min(...this.points.map((p) => p.y), this.baseline);
    return {
      kind: 'linear',
      x0: 0,
      y0: top,
      x1: 0,
      y1: this.baseline,
      stops: [
        { offset: 0, color: withAlpha(color, alpha) },
        { offset: 0.55, color: withAlpha(color, alpha * 0.32) },
        { offset: 1, color: withAlpha(color, 0) },
      ],
    };
  }
}

// --- bars ---------------------------------------------------------------------------------

export type BarChartOptions = {
  plot: Rect;
  values: readonly number[];
  domain: Domain;
  /** Share of each slot left empty between bars (default 0.42). */
  gap?: number;
  /** Top corner radius in UI px (default 5). */
  radius?: number;
};

/** Bars on a shared baseline; each grows by its own 0..1 (overshoot allowed). */
export class BarChart {
  readonly plot: Rect;
  /** Each bar at full height. */
  readonly bars: readonly Rect[];
  readonly baseline: number;
  readonly radius: number;
  private readonly clip: Rect;
  private readonly bar: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(ui: UiKit, options: BarChartOptions) {
    const { plot, values, domain } = options;
    this.plot = plot;
    const n = Math.max(1, values.length);
    const slot = plot.w / n;
    const gap = options.gap ?? 0.42;
    const w = slot * (1 - gap);
    const y = (v: number) => {
      const t = domain.max > domain.min ? (v - domain.min) / (domain.max - domain.min) : 0;
      return plot.y + plot.h * (1 - t);
    };
    this.baseline = y(Math.max(domain.min, Math.min(domain.max, 0)));
    this.bars = values.map((v, i) => {
      const top = Math.min(y(v), this.baseline);
      return { x: plot.x + slot * i + (slot - w) / 2, y: top, w, h: this.baseline - top };
    });
    this.radius = Math.min(ui.px(options.radius ?? 5), w / 2);
    // Everything above the baseline (bars may overshoot the plot's top while they pop).
    this.clip = {
      x: plot.x - w,
      y: plot.y - plot.h,
      w: plot.w + 2 * w,
      h: this.baseline - plot.y + plot.h,
    };
  }

  /**
   * Draws the bars grown by `grow(i)` (0..1, may overshoot) in `color(i)`; the rounded bottoms
   * hide below the baseline, so only the tops are round.
   */
  draw(g: Draw, grow: (i: number) => number, color: (i: number) => Color, opacity = 1): void {
    if (opacity <= 0) return;
    g.clip(this.clip, (g) => {
      for (let i = 0; i < this.bars.length; i++) {
        const full = this.bars[i] as Rect;
        const k = grow(i);
        if (!(k > 0)) continue;
        const h = full.h * k;
        this.bar.x = full.x;
        this.bar.y = this.baseline - h;
        this.bar.w = full.w;
        this.bar.h = h + this.radius * 2;
        g.roundRect(this.bar, this.radius, { fill: color(i), opacity });
      }
    });
  }
}

// --- donut --------------------------------------------------------------------------------

export type DonutOptions = {
  cx: number;
  cy: number;
  /** Radius to the middle of the ring (design units). */
  r: number;
  /** Ring width in UI px (default 12). */
  width?: number;
};

/** A ring that sweeps clockwise from 12 o'clock to its value. */
export class Donut {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly width: number;

  constructor(
    private readonly ui: UiKit,
    options: DonutOptions,
  ) {
    this.cx = options.cx;
    this.cy = options.cy;
    this.r = options.r;
    this.width = ui.px(options.width ?? 12);
  }

  /** `sweep` is the share of the circle drawn (0..1); the track shows at `track` opacity. */
  draw(g: Draw, sweep: number, color: Color, options: { track?: number; opacity?: number } = {}) {
    const opacity = options.opacity ?? 1;
    if (opacity <= 0) return;
    const track = options.track ?? 1;
    if (track > 0) {
      g.circle(this.cx, this.cy, this.r, {
        stroke: { color: this.ui.theme.sunken, width: this.width },
        opacity: opacity * track,
      });
    }
    const s = clamp01(sweep);
    if (s > 0.0005) {
      g.circle(this.cx, this.cy, this.r, {
        stroke: { color, width: this.width, cap: 'round', trim: [0, s] },
        opacity,
      });
    }
  }
}

// --- axes ---------------------------------------------------------------------------------

export type ValueAxisOptions = {
  plot: Rect;
  ticks: Ticks;
  format?: (value: number) => string;
  /** Labels left of the plot (default) or none (gridlines only). */
  labels?: 'left' | 'none';
};

/** Horizontal gridlines at each tick, with tabular labels. */
export class ValueAxis {
  readonly labels: readonly { y: number; block: TextBlock }[];
  private readonly lines: PathData;
  private readonly labelRight: number;
  private readonly width: number;

  constructor(
    private readonly ui: UiKit,
    options: ValueAxisOptions,
  ) {
    const { plot, ticks } = options;
    const format = options.format ?? ((v: number) => String(v));
    const y = (v: number) =>
      plot.y +
      plot.h * (1 - (ticks.max > ticks.min ? (v - ticks.min) / (ticks.max - ticks.min) : 0));
    const lines: PathCommand[] = [];
    for (const v of ticks.values) {
      const ly = y(v);
      lines.push(['M', plot.x, ly], ['L', plot.x + plot.w, ly]);
    }
    this.lines = lines;
    this.width = ui.px(1);
    this.labelRight = plot.x - ui.px(10);
    this.labels =
      options.labels === 'none'
        ? []
        : ticks.values.map((v) => ({
            y: y(v),
            block: ui.text(format(v), 'caption', { features: ['tnum'], weight: 500 }),
          }));
  }

  /** Widest label (to reserve room left of the plot). */
  get labelWidth(): number {
    return this.labels.reduce((w, l) => Math.max(w, l.block.width), 0);
  }

  draw(g: Draw, opacity = 1): void {
    if (opacity <= 0) return;
    const { theme } = this.ui;
    g.path(this.lines, { stroke: { color: theme.gridline, width: this.width }, opacity });
    for (const label of this.labels) {
      g.text(label.block, {
        fill: theme.subtle,
        x: this.labelRight - label.block.width,
        y: label.y - label.block.capHeight / 2,
        opacity,
      });
    }
  }
}

export type CategoryAxisOptions = {
  /** Label centers (design units) and the baseline they hang from. */
  xs: readonly number[];
  y: number;
  labels: readonly string[];
};

/** Category labels under a chart (months, weekdays), centered on their x. */
export class CategoryAxis {
  readonly items: readonly { x: number; block: TextBlock }[];
  private readonly top: number;

  constructor(
    private readonly ui: UiKit,
    options: CategoryAxisOptions,
  ) {
    this.top = options.y + ui.px(10);
    this.items = options.labels.flatMap((label, i) =>
      label.trim()
        ? [{ x: options.xs[i] ?? 0, block: ui.text(label, 'caption', { weight: 500 }) }]
        : [],
    );
  }

  /** Bottom of the labels (for layout). */
  get bottom(): number {
    const cap = this.items[0]?.block.capHeight ?? 0;
    return this.top + cap;
  }

  /** Draws the labels; `shift` moves them sideways (a live chart scrolling). */
  draw(g: Draw, opacity = 1, shift = 0, visible?: Rect): void {
    if (opacity <= 0) return;
    const { theme } = this.ui;
    for (const item of this.items) {
      const x = item.x + shift;
      let alpha = opacity;
      if (visible) {
        // Labels scrolling past either edge of the visible span fade out just beyond it.
        const fade = this.ui.px(14);
        const left = visible.x;
        const right = visible.x + visible.w;
        alpha *= clamp01((x - left + fade) / fade) * clamp01((right + fade - x) / fade);
      }
      if (alpha <= 0) continue;
      g.text(item.block, {
        fill: theme.subtle,
        x: x - (item.block.ink.x + item.block.ink.w / 2),
        y: this.top,
        opacity: alpha,
      });
    }
  }
}
