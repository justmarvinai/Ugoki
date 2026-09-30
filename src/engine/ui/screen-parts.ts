/**
 * Parts of the procedural app screens (`screens.ts`): system chrome (status bar, tab bar, home
 * indicator), small controls (switch, segmented control, chips, progress bars, icon tiles,
 * message bubbles) and a stylized landscape "photo". Everything is laid out once in UI px (the
 * screen draws at unit 1 inside a scaled group) and painted per frame.
 */

import { type Color, fromOklch, mixOklab, toOklch, withAlpha } from '../core/color';
import type { Rect } from '../core/math';
import type { Draw, Gradient, PathCommand, PathData } from '../draw/types';
import type { TextBlock } from '../text/types';
import type { UiKit } from './context';
import { arcPath, drawIcon, type IconName } from './shape';
import type { UiTheme } from './theme';

export type Paint = (g: Draw) => void;

/** Draws a block with its cap top at (x, y). */
export function textAt(
  g: Draw,
  block: TextBlock,
  x: number,
  y: number,
  fill: Color,
  opacity?: number,
): void {
  g.text(block, { fill, x, y, opacity });
}

/** Draws a block right-aligned at `right` (by its advance) with its cap top at y. */
export function textRight(
  g: Draw,
  block: TextBlock,
  right: number,
  y: number,
  fill: Color,
  opacity?: number,
): void {
  g.text(block, { fill, x: right - block.width, y, opacity });
}

/** Draws a block centered on (cx, cy): by ink horizontally, by cap height vertically. */
export function textCentered(
  g: Draw,
  block: TextBlock,
  cx: number,
  cy: number,
  fill: Color,
  opacity?: number,
): void {
  g.text(block, {
    fill,
    x: cx - (block.ink.x + block.ink.w / 2),
    y: cy - block.capHeight / 2,
    opacity,
  });
}

/** The theme's ink at an alpha (hairlines, overlays). */
export const ink = (theme: UiTheme, alpha: number): Color => withAlpha(theme.text, alpha);

// --- status bar -----------------------------------------------------------------------------

export const STATUS_BAR = 50;

/** A generic status bar: time on the left; signal, wi-fi and battery on the right. */
export function statusBar(ui: UiKit, width: number, time: string, background: Color): Paint {
  const { theme } = ui;
  const clock = ui.text(time, 'label', { size: 16, weight: 640, features: ['tnum'] });
  // Centered in the display's left "ear", beside a camera cutout.
  const clockX = 54 - (clock.ink.x + clock.ink.w / 2);
  const cy = 26;
  const right = width - 28;
  // Battery: outline, level, cap.
  const battery: Rect = { x: right - 26, y: cy - 6.25, w: 24, h: 12.5 };
  const level: Rect = { x: battery.x + 2, y: battery.y + 2, w: (battery.w - 4) * 0.8, h: 8.5 };
  const cap: Rect = { x: battery.x + battery.w + 1.5, y: cy - 2.25, w: 1.75, h: 4.5 };
  // Wi-fi: three arcs and a dot, fanning up from a point.
  const wifiX = battery.x - 15;
  const wifiY = cy + 5;
  const wifi: PathCommand[] = [];
  for (const r of [4.25, 8, 11.75]) wifi.push(...arcPath(wifiX, wifiY, r, -42, 42));
  // Signal: four rising bars.
  const bars: Rect[] = [];
  const signalRight = wifiX - 19;
  for (let i = 0; i < 4; i++) {
    const h = 4 + i * 2.6;
    bars.push({ x: signalRight - (3 - i) * 5 - 3, y: cy + 5.75 - h, w: 3, h });
  }
  const back: Rect = { x: 0, y: 0, w: width, h: STATUS_BAR };
  return (g) => {
    g.rect(back, { fill: background });
    g.text(clock, { fill: theme.text, x: clockX, y: cy - clock.capHeight / 2 });
    for (const bar of bars) g.roundRect(bar, 1, { fill: theme.text });
    g.path(wifi, { stroke: { color: theme.text, width: 2.2, cap: 'round' } });
    g.circle(wifiX, wifiY - 0.4, 1.5, { fill: theme.text });
    g.roundRect(battery, 3.6, { stroke: { color: ink(theme, 0.4), width: 1 } });
    g.roundRect(level, 1.8, { fill: theme.text });
    g.roundRect(cap, 1, { fill: ink(theme, 0.4) });
  };
}

// --- tab bar & home indicator ---------------------------------------------------------------

export const TAB_BAR = 84;
const HOME_AREA = 30;

export type Tab = { icon: IconName; label: string };

/** A bottom tab bar (the first tab active) with the home-indicator area below it. */
export function tabBar(ui: UiKit, width: number, viewport: number, tabs: readonly Tab[]): Paint {
  const { theme } = ui;
  const top = viewport - TAB_BAR;
  const back: Rect = { x: 0, y: top, w: width, h: TAB_BAR };
  const slot = width / tabs.length;
  const items = tabs.map((tab, i) => ({
    icon: tab.icon,
    cx: slot * (i + 0.5),
    label: ui.text(tab.label, 'caption', { size: 10.5, weight: i === 0 ? 620 : 520 }),
    color: i === 0 ? theme.accentInk : theme.subtle,
  }));
  const fill = theme.dark ? theme.surface : theme.raised;
  return (g) => {
    g.rect(back, { fill });
    g.line(0, top + 0.5, width, top + 0.5, { color: theme.border, width: 1 });
    const iconY = top + 22;
    const labelY = top + 40;
    for (const item of items) {
      drawIcon(g, item.icon, item.cx, iconY, 25, item.color, { weight: 1.9 });
      g.text(item.label, {
        fill: item.color,
        x: item.cx - (item.label.ink.x + item.label.ink.w / 2),
        y: labelY,
      });
    }
  };
}

/** The gesture pill at the bottom of the screen. */
export function homeIndicator(ui: UiKit, width: number, viewport: number): Paint {
  const pill: Rect = { x: width / 2 - 68, y: viewport - HOME_AREA / 2 - 2.5 + 7, w: 136, h: 5 };
  const color = ink(ui.theme, 0.9);
  return (g) => g.roundRect(pill, 2.5, { fill: color });
}

// --- controls -------------------------------------------------------------------------------

/** An on/off switch (51 × 31) with its top-left at (x, y). */
export function switchControl(ui: UiKit, x: number, y: number, on: boolean): Paint {
  const { theme } = ui;
  const track: Rect = { x, y, w: 51, h: 31 };
  const knob = { cx: on ? x + 51 - 15.5 : x + 15.5, cy: y + 15.5, r: 13.5 };
  const trackFill = on ? theme.accent : theme.dark ? theme.borderStrong : theme.border;
  const shadow = withAlpha(theme.shadow, theme.dark ? 0.4 : 0.16);
  return (g) => {
    g.roundRect(track, 15.5, { fill: trackFill });
    g.circle(knob.cx, knob.cy + 1.5, knob.r, { fill: shadow });
    g.circle(knob.cx, knob.cy, knob.r, { fill: fromOklch({ L: 1, C: 0, h: 0 }) });
  };
}

/** A segmented control across `rect` with one segment selected. */
export function segmented(
  ui: UiKit,
  rect: Rect,
  labels: readonly string[],
  selected: number,
): Paint {
  const { theme } = ui;
  const n = Math.max(1, labels.length);
  const w = (rect.w - 4) / n;
  const blocks = labels.map((label, i) =>
    ui.text(label, 'label', { size: 13, weight: i === selected ? 620 : 520 }),
  );
  const pill: Rect = { x: rect.x + 2 + selected * w, y: rect.y + 2, w, h: rect.h - 4 };
  const shadow = ui.shadow(pill.w, pill.h, 7, 1);
  return (g) => {
    g.roundRect(rect, 9, { fill: theme.dark ? theme.sunken : ink(theme, 0.06) });
    shadow.draw(g, pill.x, pill.y);
    g.roundRect(pill, 7, { fill: theme.dark ? theme.borderStrong : theme.raised });
    blocks.forEach((block, i) => {
      textCentered(
        g,
        block,
        rect.x + 2 + w * (i + 0.5),
        rect.y + rect.h / 2,
        i === selected ? theme.text : theme.muted,
      );
    });
  };
}

export type ChipTone = 'solid' | 'soft' | 'outline' | 'success' | 'danger' | 'glass';

/** A pill label (filters, deltas, tags). Returns its painter and width. */
export function chip(
  ui: UiKit,
  x: number,
  y: number,
  label: string,
  tone: ChipTone,
  options: { icon?: IconName; height?: number; size?: number } = {},
): { paint: Paint; w: number; h: number } {
  const { theme } = ui;
  const h = options.height ?? 30;
  const size = options.size ?? 13;
  const block = ui.text(label, 'label', { size, weight: 580 });
  const iconSize = options.icon ? size * 1.15 : 0;
  const padX = h * 0.42;
  const gap = options.icon ? 4 : 0;
  const w = padX * 2 + iconSize + gap + block.ink.w;
  const rect: Rect = { x, y, w, h };
  const colors: Record<ChipTone, { fill: Color | null; text: Color; border?: Color }> = {
    solid: { fill: theme.accent, text: theme.onAccent },
    soft: { fill: theme.accentSoft, text: theme.accentInk },
    outline: { fill: null, text: theme.text, border: theme.borderStrong },
    success: { fill: theme.successSoft, text: theme.success },
    danger: { fill: theme.dangerSoft, text: theme.danger },
    // On an accent fill: a translucent pill of the on-accent color.
    glass: { fill: withAlpha(theme.onAccent, 0.16), text: theme.onAccent },
  };
  const tone_ = colors[tone];
  const cy = y + h / 2;
  const iconCx = x + padX + iconSize / 2;
  const textX = x + padX + iconSize + gap - block.ink.x;
  return {
    w,
    h,
    paint: (g) => {
      if (tone_.fill) g.roundRect(rect, h / 2, { fill: tone_.fill });
      if (tone_.border) {
        g.roundRect({ x: x + 0.5, y: y + 0.5, w: w - 1, h: h - 1 }, h / 2 - 0.5, {
          stroke: { color: tone_.border, width: 1 },
        });
      }
      if (options.icon)
        drawIcon(g, options.icon, iconCx, cy, iconSize, tone_.text, { weight: 2.4 });
      g.text(block, { fill: tone_.text, x: textX, y: cy - block.capHeight / 2 });
    },
  };
}

/** A progress track with a rounded fill (0..1). */
export function progressBar(ui: UiKit, rect: Rect, value: number, fill?: Color): Paint {
  const { theme } = ui;
  const done: Rect = { ...rect, w: Math.max(rect.h, rect.w * Math.min(1, Math.max(0, value))) };
  const color = fill ?? theme.accent;
  return (g) => {
    g.roundRect(rect, rect.h / 2, { fill: theme.dark ? theme.borderStrong : theme.sunken });
    g.roundRect(done, rect.h / 2, { fill: color });
  };
}

/** A rounded-square icon tile: soft (accent tint, accent glyph) or solid (accent, on-accent). */
export function iconTile(
  ui: UiKit,
  cx: number,
  cy: number,
  size: number,
  icon: IconName,
  tone: 'soft' | 'solid' = 'soft',
): Paint {
  const { theme } = ui;
  const rect: Rect = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
  const fill = tone === 'solid' ? theme.accent : theme.accentSoft;
  const glyph = tone === 'solid' ? theme.onAccent : theme.accentInk;
  const radius = size * 0.3;
  return (g) => {
    g.roundRect(rect, radius, { fill });
    drawIcon(g, icon, cx, cy, size * 0.56, glyph, { weight: 2.1 });
  };
}

// --- message bubble -------------------------------------------------------------------------

export type Bubble = {
  readonly rect: Rect;
  readonly paint: Paint;
};

/**
 * A chat bubble around wrapped text: incoming (left, neutral) or outgoing (right, accent). The
 * corner on the sender's side is tighter on the last bubble of a group.
 */
export function bubble(
  ui: UiKit,
  text: string,
  options: {
    y: number;
    width: number;
    outgoing: boolean;
    last: boolean;
    maxWidth?: number;
    fill?: Color;
  },
): Bubble {
  const { theme } = ui;
  const maxW = options.maxWidth ?? 262;
  const padX = 14;
  const padY = 11;
  const block = ui.text(text, 'body', {
    size: 16,
    weight: 430,
    maxWidth: maxW - padX * 2,
    maxLines: 6,
    lineHeight: 1.32,
    balance: false,
  });
  const w = Math.max(40, block.width + padX * 2);
  const h = block.height + block.size * 0.3 + padY * 2;
  const margin = 16;
  const x = options.outgoing ? options.width - margin - w : margin;
  const rect: Rect = { x, y: options.y, w, h };
  const fill = options.fill ?? (options.outgoing ? theme.accent : bubbleFill(theme));
  const color = options.outgoing ? theme.onAccent : theme.text;
  const r = 19;
  const tight = options.last ? 6 : r;
  const path = asymmetricRoundRect(
    rect,
    r,
    options.outgoing ? tight : r,
    options.outgoing ? r : tight,
  );
  return {
    rect,
    paint: (g) => {
      g.path(path, { fill });
      g.text(block, { fill: color, x: x + padX - block.lines[0]!.x, y: options.y + padY + 1.5 });
    },
  };
}

/** Neutral bubble color: a step off the page, so it reads on both themes. */
export function bubbleFill(theme: UiTheme): Color {
  return theme.dark ? theme.raised : mixOklab(theme.surface, theme.text, 0.075);
}

/** A rounded rect whose bottom-right and bottom-left corners have their own radii. */
function asymmetricRoundRect(
  r: Rect,
  radius: number,
  bottomRight: number,
  bottomLeft: number,
): PathData {
  const k = 1 - 0.5522847498;
  const { x, y, w, h } = r;
  const a = Math.min(radius, w / 2, h / 2);
  const br = Math.min(bottomRight, w / 2, h / 2);
  const bl = Math.min(bottomLeft, w / 2, h / 2);
  return [
    ['M', x + a, y],
    ['L', x + w - a, y],
    ['C', x + w - a * k, y, x + w, y + a * k, x + w, y + a],
    ['L', x + w, y + h - br],
    ['C', x + w, y + h - br * k, x + w - br * k, y + h, x + w - br, y + h],
    ['L', x + bl, y + h],
    ['C', x + bl * k, y + h, x, y + h - bl * k, x, y + h - bl],
    ['L', x, y + a],
    ['C', x, y + a * k, x + a * k, y, x + a, y],
    ['Z'],
  ];
}

// --- art --------------------------------------------------------------------------------------

/**
 * A stylized landscape "photo" in the theme's accent hue: a sky gradient, a low sun and three
 * layers of hills with atmospheric perspective. `variant` shifts the light and the ridges.
 */
export function landscape(theme: UiTheme, rect: Rect, radius: number, variant = 0): Paint {
  const lch = toOklch(theme.accent);
  const hue = lch.C < 0.04 ? 250 : lch.h;
  const chroma = Math.max(0.06, Math.min(0.14, lch.C));
  const warm = hue + 55 + variant * 25;
  const sky: Gradient = {
    kind: 'linear',
    x0: 0,
    y0: rect.y,
    x1: 0,
    y1: rect.y + rect.h * 0.72,
    stops: [
      { offset: 0, color: fromOklch({ L: 0.62, C: chroma, h: hue }) },
      { offset: 0.6, color: fromOklch({ L: 0.8, C: chroma * 0.8, h: warm }) },
      { offset: 1, color: fromOklch({ L: 0.9, C: chroma * 0.55, h: warm + 10 }) },
    ],
  };
  const sun = {
    cx: rect.x + rect.w * (0.66 - variant * 0.28),
    cy: rect.y + rect.h * 0.5,
    r: rect.h * 0.13,
  };
  const glow: Gradient = {
    kind: 'radial',
    cx: sun.cx,
    cy: sun.cy,
    r: rect.h * 0.55,
    stops: [
      { offset: 0, color: withAlpha(fromOklch({ L: 0.97, C: 0.05, h: warm }), 0.75) },
      { offset: 1, color: withAlpha(fromOklch({ L: 0.97, C: 0.05, h: warm }), 0) },
    ],
  };
  const layers = [0, 1, 2].map((i) => {
    const base = rect.y + rect.h * (0.55 + i * 0.13);
    const amp = rect.h * (0.1 - i * 0.022);
    const path: PathCommand[] = [['M', rect.x, rect.y + rect.h]];
    const steps = 24;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const phase = variant * 1.7 + i * 2.1;
      const y =
        base -
        amp *
          (0.55 * Math.sin(u * 5.1 + phase) +
            0.3 * Math.sin(u * 11.3 + phase * 1.9) +
            0.15 * Math.sin(u * 23.7 + phase * 0.7));
      path.push(['L', rect.x + rect.w * u, y]);
    }
    path.push(['L', rect.x + rect.w, rect.y + rect.h], ['Z']);
    const color = fromOklch({ L: 0.5 - i * 0.12, C: chroma * (0.7 + i * 0.12), h: hue + 8 * i });
    return { path, color };
  });
  const clip = { rect, radius };
  return (g) => {
    g.clip(clip, (g) => {
      g.rect(rect, { fill: sky });
      g.rect(rect, { fill: glow });
      g.circle(sun.cx, sun.cy, sun.r, { fill: fromOklch({ L: 0.98, C: 0.03, h: warm }) });
      for (const layer of layers) g.path(layer.path, { fill: layer.color });
    });
  };
}
