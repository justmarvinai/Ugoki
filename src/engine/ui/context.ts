/**
 * The UI Kit instance a template creates in `build`: a theme, a scale (UI px → design units),
 * UI typography on the text engine, and factories for components and charts. Components are
 * laid out once when created and drawn every frame from plain state values.
 */

import type { Color } from '../core/color';
import type { Rect } from '../core/math';
import type { FontId } from '../template/pairings';
import type { Palette } from '../template/palettes';
import type { TextAlign, TextBlock, TextEngine, TextStyle } from '../text/types';
import {
  BarChart,
  type BarChartOptions,
  CategoryAxis,
  type CategoryAxisOptions,
  Donut,
  type DonutOptions,
  LineChart,
  type LineChartOptions,
  ValueAxis,
  type ValueAxisOptions,
} from './charts';
import {
  Avatar,
  type AvatarOptions,
  Button,
  type ButtonOptions,
  Card,
  type CardOptions,
  Field,
  type FieldOptions,
  Row,
  type RowOptions,
  Toast,
  type ToastOptions,
  Tooltip,
  type TooltipOptions,
} from './components';
import {
  LockClock,
  type LockClockOptions,
  Notification,
  type NotificationOptions,
} from './notification';
import { BoxShadow } from './shape';
import { StreamingText, type StreamingTextOptions } from './stream';
import {
  ELEVATIONS,
  type Elevation,
  UI_RADIUS,
  type UiMode,
  type UiRadius,
  type UiTheme,
  uiTheme,
} from './theme';

const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Realistic UI is set in Inter. */
export const UI_FONT: FontId = 'inter';

/** UI type roles in UI px (Inter's dynamic tracking: tighter as it grows). */
export const UI_TYPE = {
  display: { size: 32, weight: 640, tracking: -0.021, lineHeight: 1.1 },
  heading: { size: 20, weight: 640, tracking: -0.017, lineHeight: 1.2 },
  title: { size: 16, weight: 600, tracking: -0.011, lineHeight: 1.3 },
  body: { size: 15, weight: 450, tracking: -0.009, lineHeight: 1.4 },
  label: { size: 13, weight: 540, tracking: -0.003, lineHeight: 1.3 },
  caption: { size: 12, weight: 480, tracking: 0, lineHeight: 1.3 },
  button: { size: 15, weight: 600, tracking: -0.009, lineHeight: 1.2 },
} as const;
export type UiTypeRole = keyof typeof UI_TYPE;

export type UiTextOptions = {
  /** Size in UI px (default: the role's). */
  size?: number;
  weight?: number;
  tracking?: number;
  features?: readonly string[];
  /** Wrap and fit within this width (design units); without it the text is one line. */
  maxWidth?: number;
  maxLines?: number;
  lineHeight?: number;
  align?: TextAlign;
  /** Shrink down to this size (UI px) to fit `maxWidth` and `maxLines`. */
  minSize?: number;
  /**
   * Balanced line breaks (default true). Interfaces wrap greedily — pass false for message
   * text, and for text that streams in (a greedy layout's prefix never reflows).
   */
  balance?: boolean;
};

export type UiKitOptions = {
  text: TextEngine;
  palette: Palette;
  mode: UiMode;
  /** Design units per UI px — the template's choice of how large the UI appears. */
  unit: number;
  /** Font for UI text (default Inter). */
  font?: FontId;
  /** Used when `font` isn't loaded (e.g. the pairing's text font). */
  fallbackFont?: FontId;
  /** Force an accent instead of the palette's (e.g. a Look that wants ink buttons). */
  accent?: Color;
  /** What the UI floats on (default: the palette's background) — sets shadow density. */
  stage?: Color;
};

export class UiKit {
  readonly theme: UiTheme;
  /** Design units per UI px. */
  readonly unit: number;
  readonly font: FontId;
  readonly engine: TextEngine;
  private readonly shadows = new Map<string, BoxShadow>();

  constructor(options: UiKitOptions) {
    this.engine = options.text;
    this.unit = options.unit;
    const preferred = options.font ?? UI_FONT;
    this.font =
      options.text.hasFont(preferred) || !options.fallbackFont ? preferred : options.fallbackFont;
    this.theme = uiTheme(options.palette, options.mode, {
      accent: options.accent,
      stage: options.stage,
    });
  }

  /** UI px → design units. */
  px(value: number): number {
    return value * this.unit;
  }

  /** A radius token (or UI px) in design units. */
  radius(radius: UiRadius | number): number {
    return (typeof radius === 'number' ? radius : UI_RADIUS[radius]) * this.unit;
  }

  /** The text style of a role (sizes in design units). */
  style(role: UiTypeRole, options: UiTextOptions = {}): TextStyle {
    const type = UI_TYPE[role];
    return {
      font: this.font,
      size: (options.size ?? type.size) * this.unit,
      weight: options.weight ?? type.weight,
      tracking: options.tracking ?? type.tracking,
      features: options.features,
      opsz: 'auto',
    };
  }

  /**
   * Lays out UI text in a role. With `maxWidth` it wraps into at most `maxLines` (1 by
   * default), shrinks down to `minSize`, and — like real UI — truncates what still doesn't fit
   * with an ellipsis.
   */
  text(content: string, role: UiTypeRole, options: UiTextOptions = {}): TextBlock {
    const style = this.style(role, options);
    const text = content.length > 0 ? content : ' ';
    if (options.maxWidth === undefined) return this.engine.line(text, style);
    const maxLines = options.maxLines ?? 1;
    const layout = (value: string) =>
      this.engine.layout(value, {
        style,
        maxWidth: options.maxWidth as number,
        maxLines,
        lineHeight: options.lineHeight ?? UI_TYPE[role].lineHeight,
        align: options.align ?? 'left',
        balance: options.balance,
        fit: options.minSize !== undefined ? { minSize: options.minSize * this.unit } : undefined,
      });
    const block = layout(text);
    if (!block.overflow) return block;
    // Longest prefix (whole graphemes) that fits with an ellipsis.
    const graphemes = [...GRAPHEMES.segment(text)].map((s) => s.segment);
    let lo = 0;
    let hi = graphemes.length - 1;
    let best = layout('…');
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const candidate = layout(`${graphemes.slice(0, mid).join('').trimEnd()}…`);
      if (candidate.overflow) hi = mid - 1;
      else {
        best = candidate;
        lo = mid + 1;
      }
    }
    return best;
  }

  /** The (cached) soft shadow of a w × h rounded rect at an elevation. */
  shadow(w: number, h: number, radius: number, elevation: Elevation): BoxShadow {
    const key = `${w}|${h}|${radius}|${elevation}`;
    let shadow = this.shadows.get(key);
    if (!shadow) {
      const { theme } = this;
      shadow = new BoxShadow(
        w,
        h,
        radius,
        ELEVATIONS[elevation],
        this.unit,
        theme.shadow,
        theme.shadowStrength,
      );
      this.shadows.set(key, shadow);
    }
    return shadow;
  }

  card(rect: Rect, options?: CardOptions): Card {
    return new Card(this, rect, options);
  }

  field(options: FieldOptions): Field {
    return new Field(this, options);
  }

  button(options: ButtonOptions): Button {
    return new Button(this, options);
  }

  toast(options: ToastOptions): Toast {
    return new Toast(this, options);
  }

  avatar(options: AvatarOptions): Avatar {
    return new Avatar(this, options);
  }

  row(options: RowOptions): Row {
    return new Row(this, options);
  }

  tooltip(options: TooltipOptions): Tooltip {
    return new Tooltip(this, options);
  }

  /** A notification card's content, laid out at (0, 0). */
  notification(options: NotificationOptions): Notification {
    return new Notification(this, options);
  }

  /** A lock screen's date and large time. */
  lockClock(options: LockClockOptions): LockClock {
    return new LockClock(this, options);
  }

  /** Text that streams in token by token (an AI answer). */
  streamingText(text: string, role: UiTypeRole, options: StreamingTextOptions): StreamingText {
    return new StreamingText(this, text, role, options);
  }

  lineChart(options: LineChartOptions): LineChart {
    return new LineChart(options);
  }

  barChart(options: BarChartOptions): BarChart {
    return new BarChart(this, options);
  }

  donut(options: DonutOptions): Donut {
    return new Donut(this, options);
  }

  valueAxis(options: ValueAxisOptions): ValueAxis {
    return new ValueAxis(this, options);
  }

  categoryAxis(options: CategoryAxisOptions): CategoryAxis {
    return new CategoryAxis(this, options);
  }
}

/** Creates the UI Kit for a build (see `UiKitOptions`). */
export function createUiKit(options: UiKitOptions): UiKit {
  return new UiKit(options);
}
