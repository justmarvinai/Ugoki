/**
 * UI Kit components: card, field, button, toast, avatar, list row and tooltip. Each is laid out
 * once (text shaped, rects measured) when created in `build` and drawn every frame from a few
 * state numbers (0..1 amounts and times), so `render` stays cheap and pure.
 */

import { initials } from '../assets/imagery';
import { adjustLightness, type Color, contrastRatio, mixOklch, withAlpha } from '../core/color';
import { clamp01, type Rect, smoothstep } from '../core/math';
import type { Draw, PathData } from '../draw/types';
import type { TextBlock } from '../text/types';
import type { UiKit } from './context';
import { type BoxShadow, drawIcon, type IconName, morphRect } from './shape';
import type { Elevation, UiRadius } from './theme';
import type { Typed } from './typing';

const TAU = Math.PI * 2;

/** Draws a text block centered on (cx, cy) by its ink horizontally and cap height vertically. */
function drawCentered(
  g: Draw,
  block: TextBlock,
  cx: number,
  cy: number,
  fill: Color,
  opacity = 1,
): void {
  g.text(block, {
    fill,
    x: cx - (block.ink.x + block.ink.w / 2),
    y: cy - block.capHeight / 2,
    opacity,
  });
}

// --- card ---------------------------------------------------------------------------------

export type CardOptions = {
  radius?: UiRadius | number;
  /** Shadow depth (0 = flat). */
  elevation?: Elevation | 0;
  fill?: Color;
  /** A hairline border (default on). */
  border?: boolean;
};

/** A panel: soft elevation shadow, surface and a hairline border. */
export class Card {
  readonly rect: Rect;
  readonly radius: number;
  private readonly shadow: BoxShadow | null;
  private readonly fill: Color;
  private readonly border: Color | null;
  private readonly borderWidth: number;
  private readonly borderRect: Rect;

  constructor(ui: UiKit, rect: Rect, options: CardOptions = {}) {
    const { theme } = ui;
    this.rect = rect;
    this.radius = Math.min(ui.radius(options.radius ?? 'xl'), rect.w / 2, rect.h / 2);
    const elevation = options.elevation ?? 2;
    this.shadow =
      elevation > 0 ? ui.shadow(rect.w, rect.h, this.radius, elevation as Elevation) : null;
    this.fill = options.fill ?? theme.surface;
    this.border =
      options.border === false ? null : theme.dark ? theme.border : withAlpha(theme.border, 0.9);
    this.borderWidth = ui.px(1);
    const half = this.borderWidth / 2;
    this.borderRect = {
      x: rect.x + half,
      y: rect.y + half,
      w: rect.w - 2 * half,
      h: rect.h - 2 * half,
    };
  }

  /** Draws the card at its rect; `shadow` scales the shadow's opacity (e.g. while it lifts). */
  draw(g: Draw, opacity = 1, shadow = 1): void {
    if (opacity <= 0) return;
    const { rect } = this;
    this.shadow?.draw(g, rect.x, rect.y, opacity * shadow);
    g.roundRect(rect, this.radius, { fill: this.fill, opacity });
    if (this.border) {
      g.roundRect(this.borderRect, this.radius - this.borderWidth / 2, {
        stroke: { color: this.border, width: this.borderWidth },
        opacity,
      });
    }
  }
}

// --- field --------------------------------------------------------------------------------

export type FieldOptions = {
  /** Top-left of the field (its label, when it has one) and its width, in design units. */
  x: number;
  y: number;
  w: number;
  label?: string;
  /** What the field shows after each keystroke (see `typedText`, `typedFigure`). */
  typed: Typed;
  /** Box height in UI px (default 48, or 60 for `lg`). */
  height?: number;
  /** `lg`: large value text (amounts). */
  size?: 'md' | 'lg';
  /** A leading icon inside the box. */
  icon?: IconName;
  /** Tabular figures for the value (amounts, codes). */
  tabular?: boolean;
};

export type FieldState = {
  /** Keystrokes typed so far (index into the typed states). */
  typed: number;
  /** Focus amount 0..1 (accent border and halo). */
  focus: number;
  /** Caret opacity 0..1. */
  caret: number;
  opacity?: number;
};

/** A text input: label, box, value typed state by state, placeholder, focus ring and caret. */
export class Field {
  /** Label and box together (for editor regions and layout). */
  readonly bounds: Rect;
  readonly box: Rect;
  readonly radius: number;
  readonly label: TextBlock | null;
  private readonly labelX: number;
  private readonly labelY: number;
  private readonly blocks: readonly TextBlock[];
  private readonly placeholder: TextBlock | null;
  private readonly inner: Rect;
  private readonly textY: number;
  private readonly caret: Rect;
  private readonly overflow: boolean;
  private readonly iconName: IconName | null;
  private readonly iconSize: number;
  private readonly halo: Rect;
  private readonly borderRect: Rect;
  private readonly borderWidth: number;
  private readonly focusWidth: number;

  constructor(
    private readonly ui: UiKit,
    options: FieldOptions,
  ) {
    const { x, y, w } = options;
    const large = options.size === 'lg';
    this.label = options.label
      ? ui.text(options.label, 'label', { maxWidth: w, minSize: 11 })
      : null;
    this.labelX = x;
    this.labelY = y;
    const top = this.label ? y + this.label.height + ui.px(11) : y;
    const h = ui.px(options.height ?? (large ? 60 : 48));
    this.box = { x, y: top, w, h };
    this.radius = ui.radius('md');
    this.bounds = { x, y, w, h: top + h - y };
    this.iconName = options.icon ?? null;
    this.iconSize = ui.px(18);
    const padX = ui.px(large ? 16 : 14);
    const iconSpace = this.iconName ? this.iconSize + ui.px(10) : 0;
    this.inner = { x: x + padX + iconSpace, y: top, w: w - 2 * padX - iconSpace, h };

    // One size for every state: the full value fitted into the box.
    const role = 'body' as const;
    const size = large ? 24 : 16;
    const weight = large ? 600 : 450;
    const features = options.tabular ? ['tnum'] : undefined;
    const tracking = large ? -0.018 : -0.009;
    const states = options.typed.states;
    const final = states[states.length - 1] ?? '';
    const fitted = ui.text(final, role, {
      size,
      weight,
      tracking,
      features,
      maxWidth: this.inner.w,
      minSize: size * 0.72,
    });
    const fittedSize = fitted.size / ui.unit;
    const cache = new Map<string, TextBlock>();
    this.blocks = states.map((state) => {
      let block = cache.get(state);
      if (!block) {
        block = ui.text(state, role, { size: fittedSize, weight, tracking, features });
        cache.set(state, block);
      }
      return block;
    });
    this.overflow = this.blocks.some((block) => block.width > this.inner.w);
    this.placeholder = options.typed.placeholder
      ? ui.text(options.typed.placeholder, role, { size: fittedSize, weight, tracking, features })
      : null;
    const capHeight = fitted.capHeight;
    this.textY = top + h / 2 - capHeight / 2;
    this.caret = {
      x: 0,
      y: this.textY - capHeight * 0.2,
      w: Math.max(ui.px(1.5), capHeight * 0.075),
      h: capHeight * 1.42,
    };
    this.borderWidth = ui.px(1);
    this.focusWidth = ui.px(1.5);
    const halo = ui.px(3.5);
    this.halo = { x: x - halo, y: top - halo, w: w + 2 * halo, h: h + 2 * halo };
    const half = this.borderWidth / 2;
    this.borderRect = { x: x + half, y: top + half, w: w - 2 * half, h: h - 2 * half };
  }

  /** Width of the value after `typed` keystrokes. */
  valueWidth(typed: number): number {
    return this.block(typed)?.width ?? 0;
  }

  private block(typed: number): TextBlock | undefined {
    const index = Math.max(0, Math.min(this.blocks.length - 1, Math.floor(typed)));
    return this.blocks[index];
  }

  draw(g: Draw, state: FieldState): void {
    const opacity = state.opacity ?? 1;
    if (opacity <= 0) return;
    const { theme } = this.ui;
    const focus = clamp01(state.focus);
    if (this.label) {
      g.text(this.label, { fill: theme.muted, x: this.labelX, y: this.labelY, opacity });
    }
    if (focus > 0) {
      g.roundRect(this.halo, this.radius + (this.halo.w - this.box.w) / 2, {
        fill: withAlpha(theme.accentInk, 0.2),
        opacity: opacity * focus,
      });
    }
    g.roundRect(this.box, this.radius, { fill: theme.surface, opacity });
    g.roundRect(this.borderRect, this.radius - this.borderWidth / 2, {
      stroke: { color: theme.borderStrong, width: this.borderWidth },
      opacity: opacity * (1 - focus),
    });
    if (focus > 0) {
      g.roundRect(this.borderRect, this.radius - this.borderWidth / 2, {
        stroke: { color: theme.accentInk, width: this.focusWidth },
        opacity: opacity * focus,
      });
    }
    if (this.iconName) {
      drawIcon(
        g,
        this.iconName,
        this.box.x + this.ui.px(14) + this.iconSize / 2,
        this.box.y + this.box.h / 2,
        this.iconSize,
        theme.muted,
        { opacity, weight: 1.9 },
      );
    }

    const typed = Math.max(0, Math.floor(state.typed));
    const block = this.block(typed);
    const inner = this.inner;
    const empty = typed === 0 || !block || (block.lines[0]?.text ?? '') === '';
    const width = empty ? 0 : (block?.width ?? 0);
    // Long values scroll like a real input: the end (and the caret) stay in view.
    const shift = Math.max(0, width + this.caret.w * 2 - inner.w);
    const x = inner.x - shift;
    const paint = (g: Draw) => {
      if (empty) {
        if (this.placeholder) {
          g.text(this.placeholder, { fill: theme.subtle, x: inner.x, y: this.textY, opacity });
        }
      } else if (block) {
        g.text(block, { fill: theme.text, x, y: this.textY, opacity });
      }
      const caret = clamp01(state.caret) * focus;
      if (caret > 0) {
        this.caret.x = x + width + (empty ? 0 : this.ui.px(1.5));
        g.rect(this.caret, { fill: theme.accentInk, opacity: opacity * caret });
      }
    };
    if (this.overflow) g.clip(inner, paint);
    else paint(g);
  }
}

// --- button -------------------------------------------------------------------------------

export type ButtonOptions = {
  /** Center and width in design units. */
  cx: number;
  cy: number;
  w: number;
  /** Height in UI px (default 52). */
  height?: number;
  label: string;
  /** Label of the success state (a check leads it). */
  done?: string;
  /** Resting corner radius (default: a pill). */
  radius?: UiRadius | 'pill';
  /**
   * Seconds between the start of loading and the start of `resolve`: the spinner is phased so
   * that its head arrives where the check begins.
   */
  spinDuration?: number;
  /** Fill of the success state: the success color (default) or the accent kept. */
  successTone?: 'success' | 'accent';
};

export type ButtonState = {
  /** Hover amount 0..1 (brightens). */
  hover: number;
  /** Press amount 0..1 (scales to 96.5% and darkens). */
  press: number;
  /** Pill → circle morph 0..1 (the label leaves, the spinner arrives). */
  loading: number;
  /** Seconds since loading started (spinner rotation). */
  spin: number;
  /** Spinner → check 0..1 (the arc closes, the check draws on). */
  resolve: number;
  /** Circle → pill with the done label 0..1 (the fill turns to the success color). */
  success: number;
  /** A click ripple: origin and progress 0..1. */
  ripple?: { x: number; y: number; p: number } | null;
  opacity?: number;
};

const SPIN_PERIOD = 0.9;

/**
 * A primary button whose loading morph keeps its center and radius continuous: the pill
 * narrows into a circle around the same center (radius → h/2 in step with the width), a
 * spinner turns, closes into a check that draws on, and the circle widens back into the pill
 * with the success label.
 */
export class Button {
  readonly rect: Rect;
  readonly radius: number;
  readonly h: number;
  private readonly cx: number;
  private readonly cy: number;
  private readonly w: number;
  private readonly labelBlock: TextBlock;
  private readonly doneBlock: TextBlock | null;
  private readonly colors: {
    fill: Color;
    hover: Color;
    pressed: Color;
    success: Color;
    on: Color;
    onSuccess: Color;
    edge: Color | null;
  };
  private readonly spinnerR: number;
  private readonly stroke: number;
  private readonly iconSize: number;
  private readonly gap: number;
  private readonly phase: number;
  private readonly spinDuration: number;
  private readonly shape: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly clipShape = { rect: this.shape, radius: 0 };

  constructor(
    private readonly ui: UiKit,
    options: ButtonOptions,
  ) {
    const { theme } = ui;
    this.cx = options.cx;
    this.cy = options.cy;
    this.w = options.w;
    this.h = ui.px(options.height ?? 52);
    this.rect = { x: this.cx - this.w / 2, y: this.cy - this.h / 2, w: this.w, h: this.h };
    this.radius =
      options.radius === undefined || options.radius === 'pill'
        ? this.h / 2
        : ui.radius(options.radius);
    const inner = this.w - this.h * 0.9;
    this.labelBlock = ui.text(options.label, 'button', { maxWidth: inner, minSize: 12 });
    this.iconSize = this.h * 0.46;
    this.gap = ui.px(8);
    this.doneBlock = options.done
      ? ui.text(options.done, 'button', {
          maxWidth: Math.max(1, inner - this.iconSize - this.gap),
          minSize: 12,
        })
      : null;
    const lift = theme.accent;
    const lighter = adjustLightness(lift, 0.045);
    this.colors = {
      fill: lift,
      hover: contrastRatio(lighter, lift) > 1.02 ? lighter : adjustLightness(lift, -0.03),
      pressed: adjustLightness(lift, -0.05),
      success: options.successTone === 'accent' ? lift : theme.success,
      on: theme.onAccent,
      onSuccess: options.successTone === 'accent' ? theme.onAccent : theme.onSuccess,
      // Pale accents (yellow on white) get a defining edge.
      edge: contrastRatio(lift, theme.surface) < 1.6 ? adjustLightness(lift, -0.12) : null,
    };
    this.spinnerR = this.h * 0.24;
    this.stroke = ui.px(2.5);
    // Spinner phase so its head reaches 9 o'clock (where the check starts) at `spinDuration`.
    const spinDuration = options.spinDuration ?? 0;
    this.spinDuration = spinDuration;
    const head = this.spinHead(spinDuration, 0);
    this.phase = 0.75 - (head - Math.floor(head));
  }

  /** Arc of the spinner at `spin` seconds: rotation and length in turns (before phasing). */
  private spinArc(spin: number): { start: number; length: number } {
    const turns = spin / SPIN_PERIOD;
    const length = 0.18 + 0.14 * (0.5 - 0.5 * Math.cos((spin / (SPIN_PERIOD * 1.5)) * TAU));
    return { start: turns, length };
  }

  private spinHead(spin: number, phase: number): number {
    const arc = this.spinArc(spin);
    return arc.start + arc.length + phase;
  }

  draw(g: Draw, s: ButtonState): void {
    const opacity = s.opacity ?? 1;
    if (opacity <= 0) return;
    const { colors, cx, cy, h } = this;
    const loading = clamp01(s.loading);
    const success = clamp01(s.success);
    const resolve = clamp01(s.resolve);
    const round = loading * (1 - success);
    const { rect, radius } = morphRect(cx, cy, this.w, h, this.radius, round, this.shape);
    this.clipShape.radius = radius;

    let fill = colors.fill;
    const hover = clamp01(s.hover) * (1 - loading);
    if (hover > 0) fill = mixOklch(fill, colors.hover, hover);
    if (s.press > 0) fill = mixOklch(fill, colors.pressed, clamp01(s.press));
    if (success > 0 && colors.success !== colors.fill) {
      fill = mixOklch(fill, colors.success, smoothstep(0, 0.6, success));
    }
    const on = success > 0.3 ? colors.onSuccess : colors.on;
    const scale = 1 - 0.035 * clamp01(s.press);

    g.group({ scale, originX: cx, originY: cy, opacity }, (g) => {
      g.roundRect(rect, radius, { fill });
      if (colors.edge && success < 1) {
        g.roundRect(rect, radius, {
          stroke: { color: colors.edge, width: this.ui.px(1) },
          opacity: 1 - success,
        });
      }
      const ripple = s.ripple;
      if (ripple && ripple.p > 0 && ripple.p < 1) {
        const reach = Math.hypot(
          this.w / 2 + Math.abs(ripple.x - cx),
          h / 2 + Math.abs(ripple.y - cy),
        );
        const p = 1 - (1 - ripple.p) ** 3;
        g.clip(this.clipShape, (g) =>
          g.circle(ripple.x, ripple.y, reach * p, {
            fill: withAlpha(colors.on, 0.2 * (1 - ripple.p) ** 1.5),
          }),
        );
      }

      // Label: leaves quickly as the pill starts to narrow.
      const labelOut = smoothstep(0, 0.4, loading);
      if (labelOut < 1) {
        const k = 1 - 0.06 * labelOut;
        g.group({ scale: k, originX: cx, originY: cy }, (g) =>
          drawCentered(g, this.labelBlock, cx, cy, on, 1 - labelOut),
        );
      }

      // Spinner: arrives as the circle closes; closes onto its head as the check begins.
      const spinnerIn = smoothstep(0.55, 0.95, loading);
      const closing = smoothstep(0, 0.45, resolve);
      if (spinnerIn > 0 && closing < 1) {
        // While it closes, the head creeps to a stop near 9 o'clock, where the check starts.
        const spin = resolve > 0 ? this.spinDuration + 0.05 * closing : Math.max(0, s.spin);
        const arc = this.spinArc(spin);
        const head = arc.start + arc.length + this.phase;
        const length = arc.length * (1 - closing);
        const r = this.spinnerR * (1 - 0.25 * closing);
        g.group({ rotate: (head - length) * 360, originX: cx, originY: cy }, (g) =>
          g.circle(cx, cy, r, {
            stroke: {
              color: on,
              width: this.stroke,
              cap: 'round',
              trim: [0, Math.max(0.001, length)],
            },
            opacity: spinnerIn * (1 - smoothstep(0.3, 0.45, resolve)),
          }),
        );
      }

      // Check: draws on, then slides left to lead the done label as the pill widens (both
      // clipped to the shape while it grows, so nothing shows outside the button).
      const check = smoothstep(0.3, 1, resolve);
      if (check > 0) {
        const done = this.doneBlock;
        const group = done ? this.iconSize + this.gap + done.ink.w : this.iconSize;
        const move = smoothstep(0, 1, success);
        const iconX = cx + (-group / 2 + this.iconSize / 2) * move;
        const content = (g: Draw) => {
          drawIcon(g, 'check', iconX, cy, this.iconSize, on, {
            weight: (this.stroke / this.iconSize) * 24,
            trim: check,
          });
          const shown = done ? smoothstep(0.35, 1, success) : 0;
          if (done && shown > 0) {
            const x =
              cx - group / 2 + this.iconSize + this.gap - done.ink.x - (1 - shown) * this.ui.px(6);
            g.text(done, { fill: on, x, y: cy - done.capHeight / 2, opacity: shown });
          }
        };
        if (success > 0 && success < 1) g.clip(this.clipShape, content);
        else content(g);
      }
    });
  }
}

// --- toast --------------------------------------------------------------------------------

export type ToastOptions = {
  /** Horizontal center and top edge (resting), in design units. */
  cx: number;
  y: number;
  maxW: number;
  /** Stretch to `maxW` (a banner across a panel) instead of hugging the text. */
  fill?: boolean;
  /** Height in UI px (default 54, or 64 with a detail line). */
  height?: number;
  elevation?: Elevation;
  title: string;
  detail?: string;
  icon?: IconName;
  tone?: 'success' | 'accent';
};

/** A raised confirmation: a tone badge with an icon, a title and an optional detail line. */
export class Toast {
  readonly rect: Rect;
  readonly radius: number;
  private readonly title: TextBlock;
  private readonly detail: TextBlock | null;
  private readonly shadow: BoxShadow;
  private readonly badge: { cx: number; cy: number; r: number };
  private readonly textX: number;
  private readonly titleY: number;
  private readonly detailY: number;
  private readonly tone: Color;
  private readonly onTone: Color;
  private readonly icon: IconName;
  private readonly borderRect: Rect;

  constructor(
    private readonly ui: UiKit,
    options: ToastOptions,
  ) {
    const { theme } = ui;
    const padX = ui.px(14);
    const badge = ui.px(26);
    const gap = ui.px(12);
    const textMax = Math.max(1, options.maxW - padX * 2 - badge - gap - ui.px(6));
    this.title = ui.text(options.title, 'title', { size: 15, maxWidth: textMax, minSize: 12 });
    this.detail = options.detail
      ? ui.text(options.detail, 'label', { weight: 450, maxWidth: textMax, minSize: 11 })
      : null;
    const lineGap = ui.px(7);
    const textH = this.title.height + (this.detail ? lineGap + this.detail.height : 0);
    const h = Math.max(ui.px(options.height ?? (this.detail ? 64 : 54)), textH + ui.px(26));
    const textW = Math.max(this.title.width, this.detail?.width ?? 0);
    const w = options.fill
      ? options.maxW
      : Math.min(options.maxW, padX * 2 + badge + gap + textW + ui.px(6));
    this.rect = { x: options.cx - w / 2, y: options.y, w, h };
    this.radius = ui.radius('lg');
    this.badge = { cx: this.rect.x + padX + badge / 2, cy: options.y + h / 2, r: badge / 2 };
    this.textX = this.rect.x + padX + badge + gap;
    const textTop = options.y + (h - textH) / 2;
    this.titleY = textTop;
    this.detailY = textTop + this.title.height + lineGap;
    this.tone = options.tone === 'accent' ? theme.accent : theme.success;
    this.onTone = options.tone === 'accent' ? theme.onAccent : theme.onSuccess;
    this.icon = options.icon ?? 'check';
    this.shadow = ui.shadow(w, h, this.radius, options.elevation ?? 3);
    const half = ui.px(0.5);
    this.borderRect = {
      x: this.rect.x + half,
      y: options.y + half,
      w: w - 2 * half,
      h: h - 2 * half,
    };
  }

  /**
   * `enter` 0..1 (may overshoot — pass a spring) slides it down from above and scales it up;
   * `opacity` fades it.
   */
  draw(g: Draw, enter: number, opacity: number): void {
    if (opacity <= 0) return;
    const { theme } = this.ui;
    const { rect } = this;
    const dy = (1 - enter) * -this.ui.px(16);
    const scale = 0.94 + 0.06 * enter;
    g.group({ y: dy, scale, originX: rect.x + rect.w / 2, originY: rect.y, opacity }, (g) => {
      this.shadow.draw(g, rect.x, rect.y);
      g.roundRect(rect, this.radius, { fill: theme.raised });
      g.roundRect(this.borderRect, this.radius, {
        stroke: { color: theme.border, width: this.ui.px(1) },
      });
      g.circle(this.badge.cx, this.badge.cy, this.badge.r, { fill: this.tone });
      drawIcon(g, this.icon, this.badge.cx, this.badge.cy, this.badge.r * 1.25, this.onTone, {
        weight: 2.6,
      });
      g.text(this.title, { fill: theme.text, x: this.textX, y: this.titleY });
      if (this.detail) {
        g.text(this.detail, { fill: theme.muted, x: this.textX, y: this.detailY });
      }
    });
  }
}

// --- avatar -------------------------------------------------------------------------------

export type AvatarOptions = {
  cx: number;
  cy: number;
  /** Diameter in UI px (default 40). */
  size?: number;
  name: string;
};

/** Initials on a tint of the accent (generated — never a photo). */
export class Avatar {
  readonly r: number;
  private readonly block: TextBlock;
  constructor(
    private readonly ui: UiKit,
    readonly options: AvatarOptions,
  ) {
    const size = options.size ?? 40;
    this.r = ui.px(size) / 2;
    this.block = ui.text(initials(options.name) || '·', 'label', {
      size: size * 0.38,
      weight: 620,
      tracking: 0.01,
    });
  }

  draw(g: Draw, opacity = 1): void {
    const { theme } = this.ui;
    const { cx, cy } = this.options;
    g.circle(cx, cy, this.r, { fill: theme.accentSoft, opacity });
    drawCentered(g, this.block, cx, cy, theme.accentInk, opacity);
  }
}

// --- list row -----------------------------------------------------------------------------

export type RowOptions = {
  x: number;
  y: number;
  w: number;
  /** Height in UI px (default 64). */
  height?: number;
  /** An initials avatar for a name, or an icon tile. */
  leading?: { avatar: string } | { icon: IconName };
  title: string;
  detail?: string;
  trailing?: 'chevron' | 'check' | null;
  /** A bordered, rounded container (a picker row). */
  framed?: boolean;
};

/** A list row / picker: leading avatar or icon, title and detail, trailing chevron. */
export class Row {
  readonly rect: Rect;
  private readonly title: TextBlock;
  private readonly detail: TextBlock | null;
  private readonly avatar: Avatar | null;
  private readonly icon: IconName | null;
  private readonly lead: { cx: number; cy: number; r: number } | null;
  private readonly textX: number;
  private readonly titleY: number;
  private readonly detailY: number;
  private readonly trailing: 'chevron' | 'check' | null;
  private readonly framed: boolean;
  private readonly radius: number;
  private readonly borderRect: Rect;
  private readonly tile: Rect | null;

  constructor(
    private readonly ui: UiKit,
    options: RowOptions,
  ) {
    const h = ui.px(options.height ?? 64);
    this.rect = { x: options.x, y: options.y, w: options.w, h };
    this.framed = options.framed ?? true;
    const pad = this.framed ? ui.px(12) : 0;
    const leadSize = ui.px(40);
    const cy = options.y + h / 2;
    this.lead = options.leading
      ? { cx: options.x + pad + leadSize / 2, cy, r: leadSize / 2 }
      : null;
    this.avatar =
      options.leading && 'avatar' in options.leading && this.lead
        ? new Avatar(ui, { cx: this.lead.cx, cy, size: 40, name: options.leading.avatar })
        : null;
    this.icon = options.leading && 'icon' in options.leading ? options.leading.icon : null;
    this.tile = this.lead
      ? { x: this.lead.cx - this.lead.r, y: cy - this.lead.r, w: leadSize, h: leadSize }
      : null;
    this.textX = options.x + pad + (this.lead ? leadSize + ui.px(12) : 0);
    this.trailing = options.trailing === undefined ? 'chevron' : options.trailing;
    const trailingW = this.trailing ? ui.px(28) : 0;
    const textMax = Math.max(1, options.x + options.w - pad - trailingW - this.textX);
    this.title = ui.text(options.title, 'body', { weight: 560, maxWidth: textMax, minSize: 12 });
    this.detail = options.detail
      ? ui.text(options.detail, 'label', { weight: 450, maxWidth: textMax, minSize: 11 })
      : null;
    const gap = ui.px(7);
    const textH = this.title.height + (this.detail ? gap + this.detail.height : 0);
    this.titleY = cy - textH / 2;
    this.detailY = this.titleY + this.title.height + gap;
    this.radius = ui.radius('md');
    const half = ui.px(0.5);
    this.borderRect = {
      x: options.x + half,
      y: options.y + half,
      w: options.w - 2 * half,
      h: h - 2 * half,
    };
  }

  draw(g: Draw, opacity = 1): void {
    if (opacity <= 0) return;
    const { theme } = this.ui;
    if (this.framed) {
      g.roundRect(this.borderRect, this.radius, {
        stroke: { color: theme.border, width: this.ui.px(1) },
        opacity,
      });
    }
    if (this.avatar) this.avatar.draw(g, opacity);
    else if (this.icon && this.lead && this.tile) {
      g.roundRect(this.tile, this.ui.radius('md'), { fill: theme.accentSoft, opacity });
      drawIcon(g, this.icon, this.lead.cx, this.lead.cy, this.lead.r * 1.05, theme.accentInk, {
        opacity,
      });
    }
    g.text(this.title, { fill: theme.text, x: this.textX, y: this.titleY, opacity });
    if (this.detail)
      g.text(this.detail, { fill: theme.muted, x: this.textX, y: this.detailY, opacity });
    if (this.trailing) {
      const pad = this.framed ? this.ui.px(12) : 0;
      const size = this.ui.px(20);
      drawIcon(
        g,
        this.trailing === 'check' ? 'check' : 'chevronRight',
        this.rect.x + this.rect.w - pad - size / 2,
        this.rect.y + this.rect.h / 2,
        size,
        this.trailing === 'check' ? theme.accentInk : theme.subtle,
        { opacity },
      );
    }
  }
}

// --- tooltip ------------------------------------------------------------------------------

export type TooltipOptions = {
  text: string;
  /** Tabular figures (default on). */
  tabular?: boolean;
};

/** A small dark label with a pointer, anchored above a point (chart values). */
export class Tooltip {
  readonly w: number;
  readonly h: number;
  private readonly block: TextBlock;
  private readonly radius: number;
  private readonly box: Rect;
  private readonly tip: PathData;
  private readonly gap: number;

  constructor(
    private readonly ui: UiKit,
    options: TooltipOptions,
  ) {
    this.block = ui.text(options.text, 'label', {
      weight: 600,
      features: options.tabular === false ? undefined : ['tnum'],
    });
    this.w = this.block.ink.w + ui.px(20);
    this.h = this.block.capHeight + ui.px(17);
    this.radius = ui.px(7);
    this.gap = ui.px(9);
    const pointer = ui.px(5);
    // Local coordinates: the anchor is (0, 0), the tooltip sits above it.
    const bottom = -this.gap;
    this.box = { x: -this.w / 2, y: bottom - pointer - this.h, w: this.w, h: this.h };
    this.tip = [
      ['M', -pointer, bottom - pointer - 0.5],
      ['L', pointer, bottom - pointer - 0.5],
      ['L', 0, bottom],
      ['Z'],
    ];
  }

  /** Top of the tooltip above its anchor (design units, negative). */
  get top(): number {
    return this.box.y;
  }

  /**
   * Draws it above (x, y); `scale` pops it from the pointer. `within` keeps the box inside a
   * horizontal span (e.g. its card) while the pointer stays on the point.
   */
  draw(
    g: Draw,
    x: number,
    y: number,
    opacity = 1,
    scale = 1,
    within?: { min: number; max: number },
  ): void {
    if (opacity <= 0) return;
    const { theme } = this.ui;
    const fill = theme.text;
    let slide = 0;
    if (within) {
      const left = x + this.box.x;
      const right = left + this.box.w;
      if (right > within.max) slide = within.max - right;
      if (left + slide < within.min) slide = within.min - left;
      // The pointer must stay under the box's straight edge.
      const limit = this.w / 2 - this.radius - this.ui.px(5);
      slide = Math.max(-limit, Math.min(limit, slide));
    }
    g.group({ x, y, scale, originX: 0, originY: -this.gap, opacity }, (g) => {
      if (slide !== 0) {
        g.group({ x: slide }, (g) => {
          g.roundRect(this.box, this.radius, { fill });
          drawCentered(g, this.block, 0, this.box.y + this.h / 2, theme.surface);
        });
      } else {
        g.roundRect(this.box, this.radius, { fill });
        drawCentered(g, this.block, 0, this.box.y + this.h / 2, theme.surface);
      }
      g.path(this.tip, { fill });
    });
  }
}
