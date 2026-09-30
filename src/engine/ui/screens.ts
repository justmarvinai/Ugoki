/**
 * App screens (docs/templates/00-foundations.md §7, "Screens"): procedural, unbranded phone
 * screens drawn with the UI Kit — a finance home, a feed, analytics, a chat and settings — for
 * device mockups (Float) and scroll tours (Scroll).
 *
 * A screen is laid out once in `build` at a phone's size in UI px (390 wide) and drawn into any
 * rect: its width sets the scale, its height the viewport (bars pin to the viewport's edges).
 * Tall screens run past the viewport and scroll (`draw(g, { scroll })`, in UI px); `anchors`
 * name the interesting spots of the page (for captions and scroll stops).
 */

import { adjustLightness, type Color, mixOklab, withAlpha } from '../core/color';
import type { Rect, Vec2 } from '../core/math';
import type { Draw, Gradient } from '../draw/types';
import type { FontId } from '../template/pairings';
import type { Palette } from '../template/palettes';
import type { TextBlock, TextEngine } from '../text/types';
import { chartDomain } from './charts';
import { createUiKit, type UiKit } from './context';
import {
  bubble,
  bubbleFill,
  chip,
  homeIndicator,
  iconTile,
  ink,
  landscape,
  type Paint,
  progressBar,
  STATUS_BAR,
  segmented,
  statusBar,
  switchControl,
  TAB_BAR,
  type Tab,
  tabBar,
  textAt,
  textCentered,
  textRight,
} from './screen-parts';
import { drawIcon, type IconName } from './shape';
import type { UiMode, UiTheme } from './theme';

export const SCREEN_KINDS = ['finance', 'feed', 'analytics', 'chat', 'settings'] as const;
export type ScreenKind = (typeof SCREEN_KINDS)[number];

/** A phone screen's width in UI px (points). */
export const SCREEN_WIDTH = 390;
/** A phone screen's height in UI px (the viewport of a 19.5 : 9 display). */
export const SCREEN_HEIGHT = 844;

const W = SCREEN_WIDTH;
const PAD = 20;
const INNER = W - 2 * PAD;

export type ScreenOptions = {
  text: TextEngine;
  palette: Palette;
  mode: UiMode;
  kind: ScreenKind;
  /** Where the screen is drawn (design units): its width is the phone's 390 UI px. */
  rect: Rect;
  /** Corner radius of the display (design units, default 0). */
  radius?: number;
  /** A long page that scrolls (default: one screenful). */
  tall?: boolean;
  /** Status bar, tab and tool bars, home indicator (default true). */
  chrome?: boolean;
  /** Status bar time (default "9:30"). */
  time?: string;
  /** Force an accent instead of the palette's. */
  accent?: Color;
  /** UI font (default Inter) and a fallback when it isn't loaded. */
  font?: FontId;
  fallbackFont?: FontId;
};

/** An interesting spot on a screen's page: a card or section worth pointing at. */
export type ScreenAnchor = {
  readonly id: string;
  /** What it shows, in a few words. */
  readonly label: string;
  /** Its bounds in page coordinates (UI px; y from the top of the page). */
  readonly rect: Rect;
};

type Item = { readonly top: number; readonly bottom: number; readonly paint: Paint };

/** Content collected while a page is laid out. */
class Page {
  readonly items: Item[] = [];
  readonly overlays: Paint[] = [];
  readonly anchors: ScreenAnchor[] = [];
  background: Color;
  top = STATUS_BAR;
  bottom = 0;
  y = STATUS_BAR;

  constructor(
    readonly ui: UiKit,
    readonly viewport: number,
    readonly tall: boolean,
    readonly chrome: boolean,
    readonly time: string,
  ) {
    this.background = ui.theme.canvas;
  }

  get theme(): UiTheme {
    return this.ui.theme;
  }

  /** Adds `h` UI px of content at the current y; `make` gets the top and returns the painter. */
  block(h: number, make: (top: number) => Paint): number {
    const top = this.y;
    this.items.push({ top, bottom: top + h, paint: make(top) });
    this.y += h;
    return top;
  }

  gap(h: number): void {
    this.y += h;
  }

  anchor(id: string, label: string, rect: Rect): void {
    this.anchors.push({ id, label, rect });
  }

  /** A one-screen page stops once its content is well past the viewport. */
  get done(): boolean {
    return !this.tall && this.y > this.viewport + 24;
  }
}

/**
 * A procedural app screen (see `createScreen`). `draw` paints it into its rect; the page scrolls
 * under fixed bars, and scroll offsets past either end (a rubber band) show the page color.
 */
export class Screen {
  readonly kind: ScreenKind;
  readonly rect: Rect;
  readonly radius: number;
  /** Design units per UI px. */
  readonly scale: number;
  readonly theme: UiTheme;
  /** The page color. */
  readonly background: Color;
  /** Visible height in UI px. */
  readonly viewport: number;
  /** Height of the whole page in UI px (≥ viewport). */
  readonly contentHeight: number;
  /** Largest scroll offset in UI px. */
  readonly maxScroll: number;
  /** Parts of the viewport covered by fixed bars (UI px from the top and from the bottom). */
  readonly insets: { readonly top: number; readonly bottom: number };
  readonly anchors: readonly ScreenAnchor[];
  private readonly items: readonly Item[];
  private readonly overlays: readonly Paint[];
  private readonly view: Rect;
  private readonly frame = { x: 0, y: 0, scale: 1 };
  private readonly page = { y: 0 };

  constructor(options: ScreenOptions) {
    this.kind = options.kind;
    this.rect = options.rect;
    this.radius = options.radius ?? 0;
    this.scale = options.rect.w / W;
    this.viewport = options.rect.h / this.scale;
    const ui = createUiKit({
      text: options.text,
      palette: options.palette,
      mode: options.mode,
      unit: 1,
      accent: options.accent,
      font: options.font,
      fallbackFont: options.fallbackFont,
    });
    this.theme = ui.theme;
    const page = new Page(
      ui,
      this.viewport,
      options.tall ?? false,
      options.chrome ?? true,
      options.time ?? '9:30',
    );
    BUILDERS[options.kind](page);
    this.background = page.background;
    this.items = page.items;
    this.overlays = page.overlays;
    this.anchors = page.anchors;
    this.insets = { top: page.top, bottom: page.bottom };
    this.contentHeight = Math.max(this.viewport, page.y + page.bottom);
    this.maxScroll = this.contentHeight - this.viewport;
    this.view = { x: 0, y: 0, w: W, h: this.viewport };
    this.frame.x = options.rect.x;
    this.frame.y = options.rect.y;
    this.frame.scale = this.scale;
  }

  /** The anchor with this id. */
  anchor(id: string): ScreenAnchor | undefined {
    return this.anchors.find((a) => a.id === id);
  }

  /**
   * The scroll offset (UI px, within 0 … maxScroll) that puts a page position — an anchor's
   * center, or a y — at `at` (0..1) of the viewport between its bars.
   */
  scrollTo(target: ScreenAnchor | number, at = 0.42): number {
    const y = typeof target === 'number' ? target : target.rect.y + target.rect.h / 2;
    const top = this.insets.top;
    const visible = this.viewport - top - this.insets.bottom;
    return Math.max(0, Math.min(this.maxScroll, y - (top + visible * at)));
  }

  /** Where a page point (UI px) is in the frame (design units) at a scroll offset. */
  toFrame(x: number, y: number, scroll = 0, out: Vec2 = { x: 0, y: 0 }): Vec2 {
    out.x = this.rect.x + x * this.scale;
    out.y = this.rect.y + (y - scroll) * this.scale;
    return out;
  }

  /**
   * Draws the screen into its rect. `scroll` is in UI px (outside 0 … maxScroll the page is
   * pulled past its end, as in a rubber band); `opacity` fades it as one layer.
   */
  draw(g: Draw, options: { scroll?: number; opacity?: number } = {}): void {
    const opacity = options.opacity ?? 1;
    if (opacity <= 0) return;
    if (opacity < 1) {
      g.layer({ opacity, bounds: this.rect }, (g) => this.paint(g, options.scroll ?? 0));
    } else {
      this.paint(g, options.scroll ?? 0);
    }
  }

  private paint(g: Draw, scroll: number): void {
    const clip = this.radius > 0 ? { rect: this.rect, radius: this.radius } : this.rect;
    g.clip(clip, (g) =>
      g.group(this.frame, (g) => {
        g.rect(this.view, { fill: this.background });
        const from = scroll - 8;
        const to = scroll + this.viewport + 8;
        this.page.y = -scroll;
        g.group(this.page, (g) => {
          for (const item of this.items) {
            if (item.bottom >= from && item.top <= to) item.paint(g);
          }
        });
        for (const overlay of this.overlays) overlay(g);
      }),
    );
  }
}

/** Lays out a procedural app screen (see `Screen`). */
export function createScreen(options: ScreenOptions): Screen {
  return new Screen(options);
}

// --- shared pieces ------------------------------------------------------------------------

/** Status bar on top; a tab bar or just the home indicator at the bottom. */
function chrome(p: Page, tabs: readonly Tab[] | null): void {
  if (!p.chrome) {
    p.top = 0;
    p.y = Math.min(p.y, 12);
    return;
  }
  p.overlays.push(statusBar(p.ui, W, p.time, p.background));
  if (tabs) {
    p.overlays.push(tabBar(p.ui, W, p.viewport, tabs));
    p.bottom = TAB_BAR;
  } else {
    p.bottom = 30;
  }
  p.overlays.push(homeIndicator(p.ui, W, p.viewport));
}

/** A card behind content (soft elevation, hairline border). */
function card(p: Page, rect: Rect, radius = 22): Paint {
  const c = p.ui.card(rect, { radius, elevation: 1 });
  return (g) => c.draw(g);
}

/** A section title with an optional action on the right. */
function sectionHeader(p: Page, title: string, action?: string): void {
  const { ui, theme } = p;
  const heading = ui.text(title, 'title', { size: 18, weight: 660 });
  const link = action ? ui.text(action, 'label', { size: 14, weight: 560 }) : null;
  p.block(34, (top) => (g) => {
    textAt(g, heading, PAD, top + 8, theme.text);
    if (link) textRight(g, link, W - PAD, top + 10, theme.accentInk);
  });
  p.gap(8);
}

type ListRow = {
  icon?: IconName;
  avatar?: string;
  title: string;
  detail: string;
  /** Right-aligned value (amounts, times). */
  value?: string;
  valueTone?: 'text' | 'success' | 'muted' | 'accent';
  chevron?: boolean;
};

/** A card of list rows: a leading tile, title and detail, a trailing value or chevron. */
function listCard(p: Page, rows: readonly ListRow[], rowH = 66): Rect {
  const { ui, theme } = p;
  const inset = 6;
  const rect: Rect = { x: PAD, y: p.y, w: INNER, h: inset * 2 + rows.length * rowH };
  const back = card(p, rect);
  const textX = PAD + 70;
  const right = W - PAD - 16;
  const painters = rows.map((row, i) => {
    const top = rect.y + inset + i * rowH;
    const cy = top + rowH / 2;
    const lead: Paint | null = row.avatar
      ? (
          (a) => (g: Draw) =>
            a.draw(g)
        )(ui.avatar({ cx: PAD + 37, cy, size: 42, name: row.avatar }))
      : row.icon
        ? iconTile(ui, PAD + 37, cy, 42, row.icon)
        : null;
    const value = row.value
      ? ui.text(row.value, 'body', { size: 15.5, weight: 620, features: ['tnum'] })
      : null;
    const reserve = (value ? value.width + 12 : 0) + (row.chevron ? 24 : 0);
    const title = ui.text(row.title, 'body', {
      size: 15.5,
      weight: 590,
      maxWidth: right - reserve - textX,
    });
    const detail = ui.text(row.detail, 'label', {
      size: 13,
      weight: 450,
      maxWidth: right - reserve - textX,
    });
    const textTop = cy - (title.capHeight + 8 + detail.capHeight) / 2 - 1;
    const valueColor =
      row.valueTone === 'success'
        ? theme.success
        : row.valueTone === 'muted'
          ? theme.muted
          : row.valueTone === 'accent'
            ? theme.accentInk
            : theme.text;
    const separator = i < rows.length - 1;
    return (g: Draw) => {
      lead?.(g);
      textAt(g, title, textX, textTop, theme.text);
      textAt(g, detail, textX, textTop + title.capHeight + 8, theme.muted);
      if (value)
        textRight(g, value, right - (row.chevron ? 24 : 0), cy - value.capHeight / 2, valueColor);
      if (row.chevron) drawIcon(g, 'chevronRight', right - 8, cy, 18, theme.subtle);
      if (separator)
        g.line(textX, top + rowH, W - PAD, top + rowH, { color: theme.border, width: 1 });
    };
  });
  p.block(rect.h, () => (g) => {
    back(g);
    for (const paint of painters) paint(g);
  });
  return rect;
}

/** Bars growing from a baseline, one highlighted, with day letters under them. */
function dayBars(
  p: Page,
  plot: Rect,
  values: readonly number[],
  highlight: number,
  labels: readonly string[],
): Paint {
  const { ui, theme } = p;
  const max = Math.max(...values, 1);
  const slot = plot.w / values.length;
  const barW = Math.min(24, slot * 0.52);
  const soft = theme.dark ? mixOklab(theme.accent, theme.surface, 0.62) : theme.accentSoft;
  const bars = values.map((v, i) => {
    const h = Math.max(6, (v / max) * plot.h);
    return {
      rect: { x: plot.x + slot * (i + 0.5) - barW / 2, y: plot.y + plot.h - h, w: barW, h },
      fill: i === highlight ? theme.accent : soft,
    };
  });
  const letters = labels.map((label, i) => ({
    block: ui.text(label, 'caption', { size: 11.5, weight: i === highlight ? 660 : 520 }),
    cx: plot.x + slot * (i + 0.5),
    color: i === highlight ? theme.accentInk : theme.subtle,
  }));
  const labelY = plot.y + plot.h + 10;
  return (g) => {
    for (const bar of bars) g.roundRect(bar.rect, Math.min(7, barW / 2), { fill: bar.fill });
    for (const l of letters) {
      g.text(l.block, { fill: l.color, x: l.cx - (l.block.ink.x + l.block.ink.w / 2), y: labelY });
    }
  };
}

/** A monotone line with an area fill under it, and a dot on its last point. */
function sparkArea(
  p: Page,
  plot: Rect,
  values: readonly number[],
  options: { dot?: boolean; width?: number } = {},
): Paint {
  const { theme } = p;
  const domain = chartDomain(values, 3);
  const chart = p.ui.lineChart({ plot, values, domain });
  const fill = chart.areaFill(theme.accent, theme.dark ? 0.32 : 0.22);
  const last = chart.points[chart.points.length - 1] ?? { x: plot.x, y: plot.y };
  const width = options.width ?? 2.5;
  return (g) => {
    g.path(chart.area, { fill });
    g.path(chart.line, { stroke: { color: theme.accentInk, width, cap: 'round', join: 'round' } });
    if (options.dot) {
      g.circle(last.x, last.y, 6.5, { fill: theme.surface });
      g.circle(last.x, last.y, 4.25, { fill: theme.accentInk });
    }
  };
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// --- finance --------------------------------------------------------------------------------

function finance(p: Page): void {
  const { ui, theme } = p;
  chrome(p, [
    { icon: 'home', label: 'Home' },
    { icon: 'card', label: 'Cards' },
    { icon: 'bars', label: 'Insights' },
    { icon: 'user', label: 'Profile' },
  ]);
  p.gap(8);

  // Header: avatar, greeting, notifications.
  const avatar = ui.avatar({ cx: PAD + 21, cy: p.y + 24, size: 42, name: 'Maya Chen' });
  const hello = ui.text('Good morning', 'label', { size: 13, weight: 480 });
  const name = ui.text('Maya Chen', 'title', { size: 17, weight: 660 });
  p.block(48, (top) => {
    const bell = { cx: W - PAD - 21, cy: top + 24 };
    const button = p.theme.dark ? theme.surface : theme.raised;
    return (g) => {
      avatar.draw(g);
      textAt(g, hello, PAD + 54, top + 9, theme.muted);
      textAt(g, name, PAD + 54, top + 28, theme.text);
      g.circle(bell.cx, bell.cy, 21, { fill: button });
      g.circle(bell.cx, bell.cy, 20.5, { stroke: { color: theme.border, width: 1 } });
      drawIcon(g, 'bell', bell.cx, bell.cy, 21, theme.text, { weight: 1.9 });
      g.circle(bell.cx + 7.5, bell.cy - 8, 5, { fill: button });
      g.circle(bell.cx + 7.5, bell.cy - 8, 3.5, { fill: theme.accent });
    };
  });
  p.gap(18);

  // Balance: the hero card in the accent.
  const hero: Rect = { x: PAD, y: p.y, w: INNER, h: 196 };
  p.anchor('balance', 'Balance at a glance', hero);
  const on = theme.onAccent;
  const label = ui.text('Total balance', 'label', { size: 14, weight: 520 });
  const balance = ui.text('€12,480.35', 'display', {
    size: 38,
    weight: 700,
    features: ['tnum'],
    tracking: -0.028,
  });
  const delta = chip(ui, hero.x + 24, hero.y + 104, '+€320.40 this week', 'glass', {
    icon: 'trendUp',
    height: 28,
  });
  const account = ui.text('Main account', 'caption', { size: 12.5, weight: 520 });
  const number = ui.text('•••• 4096', 'label', { size: 13.5, weight: 600, features: ['tnum'] });
  const heroFill: Gradient = {
    kind: 'linear',
    x0: hero.x,
    y0: hero.y,
    x1: hero.x + hero.w,
    y1: hero.y + hero.h,
    stops: [
      { offset: 0, color: adjustLightness(theme.accent, 0.035) },
      { offset: 1, color: adjustLightness(theme.accent, -0.045) },
    ],
  };
  const heroShadow = ui.shadow(hero.w, hero.h, 26, 2);
  p.block(hero.h, (top) => (g) => {
    heroShadow.draw(g, hero.x, top, 0.8);
    g.clip({ rect: hero, radius: 26 }, (g) => {
      g.rect(hero, { fill: heroFill });
      g.circle(hero.x + hero.w - 20, top + 6, 124, { fill: withAlpha(on, 0.07) });
      g.circle(hero.x + hero.w + 26, top + hero.h + 18, 96, { fill: withAlpha(on, 0.06) });
    });
    textAt(g, label, hero.x + 24, top + 28, on, 0.8);
    textAt(g, balance, hero.x + 22, top + 54, on);
    delta.paint(g);
    textAt(g, account, hero.x + 24, top + hero.h - 36, on, 0.72);
    textRight(g, number, hero.x + hero.w - 24, top + hero.h - 37, on, 0.9);
  });
  p.gap(22);

  // Quick actions.
  const actions: [IconName, string][] = [
    ['send', 'Send'],
    ['download', 'Request'],
    ['plus', 'Top up'],
    ['grid', 'More'],
  ];
  const actionsTop = p.y;
  p.anchor('actions', 'Quick actions', { x: PAD, y: actionsTop, w: INNER, h: 86 });
  const buttons = actions.map(([icon, text], i) => ({
    icon,
    cx: PAD + (INNER / 4) * (i + 0.5),
    label: ui.text(text, 'caption', { size: 12.5, weight: 540 }),
  }));
  const circleShadow = ui.shadow(56, 56, 28, 1);
  p.block(86, (top) => (g) => {
    for (const b of buttons) {
      const cy = top + 28;
      if (!theme.dark) circleShadow.draw(g, b.cx - 28, cy - 28);
      g.circle(b.cx, cy, 28, { fill: theme.dark ? theme.surface : theme.raised });
      g.circle(b.cx, cy, 27.5, { stroke: { color: theme.border, width: 1 } });
      drawIcon(g, b.icon, b.cx, cy, 23, theme.text, { weight: 1.9 });
      textCentered(g, b.label, b.cx, top + 74, theme.muted);
    }
  });
  p.gap(20);

  // Spending this week.
  const spend: Rect = { x: PAD, y: p.y, w: INNER, h: 178 };
  p.anchor('spending', 'Weekly spending', spend);
  const spendCard = card(p, spend);
  const spendLabel = ui.text('Spending this week', 'label', { size: 13, weight: 500 });
  const spendValue = ui.text('€412.60', 'heading', { size: 26, weight: 700, features: ['tnum'] });
  const trend = chip(ui, 0, 0, '−8% vs last week', 'success', {
    icon: 'trendDown',
    height: 26,
    size: 12.5,
  });
  const bars = dayBars(
    p,
    { x: spend.x + 22, y: spend.y + 88, w: spend.w - 44, h: 54 },
    [42, 68, 35, 90, 54, 76, 48],
    3,
    DAYS,
  );
  p.block(spend.h, (top) => (g) => {
    spendCard(g);
    textAt(g, spendLabel, spend.x + 22, top + 22, theme.muted);
    textAt(g, spendValue, spend.x + 21, top + 44, theme.text);
    g.group({ x: spend.x + spend.w - 20 - trend.w, y: top + 20 }, (g) => trend.paint(g));
    bars(g);
  });
  p.gap(26);

  // Recent activity.
  sectionHeader(p, 'Recent activity', 'See all');
  const activity: ListRow[] = [
    {
      icon: 'download',
      title: 'Studio North',
      detail: 'Transfer · Today',
      value: '+€1,200.00',
      valueTone: 'success',
    },
    { icon: 'bag', title: 'Grocer & Co.', detail: 'Groceries · Today', value: '−€42.80' },
    { icon: 'pin', title: 'City Transit', detail: 'Travel · Yesterday', value: '−€29.00' },
    { icon: 'star', title: 'Coffee Lab', detail: 'Food & drink · Yesterday', value: '−€3.60' },
    { icon: 'bolt', title: 'Nova Cloud', detail: 'Subscription · Mon', value: '−€9.99' },
    {
      avatar: 'Priya Raman',
      title: 'Priya Raman',
      detail: 'Split dinner · Sun',
      value: '+€24.50',
      valueTone: 'success',
    },
  ];
  const list = listCard(p, p.tall ? activity : activity.slice(0, 4));
  p.anchor('activity', 'Recent activity', list);
  if (p.done) return;
  p.gap(28);

  // Goals.
  sectionHeader(p, 'Goals', 'Add goal');
  const goals: { icon: IconName; name: string; progress: string; value: number }[] = [
    { icon: 'sun', name: 'Summer trip', progress: '€1,840 of €2,500', value: 0.736 },
    { icon: 'bolt', name: 'New laptop', progress: '€570 of €1,500', value: 0.38 },
    { icon: 'shield', name: 'Rainy-day fund', progress: '€3,100 of €5,000', value: 0.62 },
  ];
  const goalsRect: Rect = { x: PAD, y: p.y, w: INNER, h: 12 + goals.length * 80 };
  p.anchor('goals', 'Savings goals', goalsRect);
  const goalsCard = card(p, goalsRect);
  const goalRows = goals.map((goal, i) => {
    const top = goalsRect.y + 6 + i * 80;
    const tile = iconTile(ui, PAD + 37, top + 32, 42, goal.icon);
    const title = ui.text(goal.name, 'body', { size: 15.5, weight: 590 });
    const detail = ui.text(goal.progress, 'label', { size: 13, weight: 450, features: ['tnum'] });
    const pct = ui.text(`${Math.round(goal.value * 100)}%`, 'label', {
      size: 13.5,
      weight: 650,
      features: ['tnum'],
    });
    const bar = progressBar(ui, { x: PAD + 70, y: top + 56, w: INNER - 86, h: 6 }, goal.value);
    return (g: Draw) => {
      tile(g);
      textAt(g, title, PAD + 70, top + 15, theme.text);
      textAt(g, detail, PAD + 70, top + 36, theme.muted);
      textRight(g, pct, W - PAD - 16, top + 16, theme.accentInk);
      bar(g);
    };
  });
  p.block(goalsRect.h, () => (g) => {
    goalsCard(g);
    for (const row of goalRows) row(g);
  });
  p.gap(28);

  sectionHeader(p, 'Upcoming');
  const upcoming = listCard(p, [
    { icon: 'calendar', title: 'Rent', detail: 'Due in 3 days', value: '€1,150.00' },
    { icon: 'calendar', title: 'Phone plan', detail: 'Due in 8 days', value: '€19.99' },
    { icon: 'calendar', title: 'Gym membership', detail: 'Due 1 Nov', value: '€34.00' },
  ]);
  p.anchor('upcoming', 'Upcoming payments', upcoming);
  p.gap(24);
}

// --- feed -----------------------------------------------------------------------------------

function feed(p: Page): void {
  const { ui, theme } = p;
  chrome(p, [
    { icon: 'home', label: 'Home' },
    { icon: 'globe', label: 'Explore' },
    { icon: 'bars', label: 'Activity' },
    { icon: 'user', label: 'Profile' },
  ]);
  p.gap(12);

  // Header: date, large title, avatar.
  const date = ui.text('WEDNESDAY, 14 OCTOBER', 'caption', {
    size: 12,
    weight: 620,
    tracking: 0.05,
  });
  const title = ui.text('Today', 'display', { size: 34, weight: 740, tracking: -0.03 });
  const avatar = ui.avatar({ cx: W - PAD - 20, cy: p.y + 36, size: 40, name: 'Maya Chen' });
  p.block(72, (top) => (g) => {
    textAt(g, date, PAD, top + 6, theme.muted);
    textAt(g, title, PAD - 1, top + 28, theme.text);
    avatar.draw(g);
  });
  p.gap(16);

  // This week: activity rings per day and three stats.
  const week: Rect = { x: PAD, y: p.y, w: INNER, h: 218 };
  p.anchor('week', 'Your week at a glance', week);
  const weekCard = card(p, week, 24);
  const weekTitle = ui.text('This week', 'title', { size: 17, weight: 660 });
  const weekRange = ui.text('12–18 Oct', 'label', { size: 13, weight: 500 });
  const rings = [0.92, 0.74, 0.58, 0, 0, 0, 0];
  const today = 2;
  const slot = (week.w - 40) / 7;
  const ringY = week.y + 76;
  const dayLabels = DAYS.map((d, i) =>
    ui.text(d, 'caption', { size: 12, weight: i === today ? 700 : 540 }),
  );
  const stats: [string, string][] = [
    ['18.5 h', 'Focus time'],
    ['42', 'Tasks done'],
    ['12', 'Day streak'],
  ];
  const statBlocks = stats.map(([v, l]) => ({
    value: ui.text(v, 'heading', { size: 20, weight: 700, features: ['tnum'] }),
    label: ui.text(l, 'caption', { size: 12, weight: 500 }),
  }));
  const track = theme.dark ? theme.borderStrong : theme.sunken;
  p.block(week.h, (top) => (g) => {
    weekCard(g);
    textAt(g, weekTitle, week.x + 20, top + 22, theme.text);
    textRight(g, weekRange, week.x + week.w - 20, top + 24, theme.muted);
    for (let i = 0; i < 7; i++) {
      const cx = week.x + 20 + slot * (i + 0.5);
      g.circle(cx, ringY, 15, { stroke: { color: track, width: 5 } });
      const v = rings[i] ?? 0;
      if (v > 0) {
        g.circle(cx, ringY, 15, {
          stroke: { color: theme.accentInk, width: 5, cap: 'round', trim: [0, v] },
        });
      }
      const block = dayLabels[i] as TextBlock;
      if (i === today) {
        g.roundRect({ x: cx - 12, y: ringY + 25, w: 24, h: 20 }, 10, { fill: theme.accentSoft });
      }
      textCentered(g, block, cx, ringY + 35, i === today ? theme.accentInk : theme.subtle);
    }
    g.line(week.x + 20, top + 140, week.x + week.w - 20, top + 140, {
      color: theme.border,
      width: 1,
    });
    statBlocks.forEach((s, i) => {
      const cx = week.x + 20 + ((week.w - 40) / 3) * (i + 0.5);
      textCentered(g, s.value, cx, top + 170, theme.text);
      textCentered(g, s.label, cx, top + 194, theme.muted);
      if (i > 0) {
        const x = week.x + 20 + ((week.w - 40) / 3) * i;
        g.line(x, top + 156, x, top + 204, { color: theme.border, width: 1 });
      }
    });
  });
  p.gap(18);

  // Filter chips (the last one runs off the edge, as they do).
  const chipTop = p.y;
  let x = PAD;
  const chips = ['For you', 'Work', 'Health', 'Money', 'Travel'].map((label, i) => {
    const c = chip(ui, x, chipTop, label, i === 0 ? 'solid' : 'outline', {
      height: 34,
      size: 13.5,
    });
    x += c.w + 8;
    return c.paint;
  });
  p.block(34, () => (g) => {
    for (const paint of chips) paint(g);
  });
  p.gap(18);

  // A smart insight: a sentence and the day's focus curve.
  const insight: Rect = { x: PAD, y: p.y, w: INNER, h: 256 };
  p.anchor('insights', 'Smart insights', insight);
  const insightCard = card(p, insight, 24);
  const tag = ui.text('Insight', 'label', { size: 13, weight: 640 });
  const when = ui.text('Just now', 'caption', { size: 12, weight: 500 });
  const sentence = ui.text('You focus best between 9 and 11 in the morning.', 'heading', {
    size: 20,
    weight: 660,
    maxWidth: insight.w - 40,
    maxLines: 2,
    lineHeight: 1.22,
    balance: false,
  });
  const focus = [12, 26, 58, 74, 66, 40, 28, 34, 46, 38, 24, 16, 10];
  const plot: Rect = { x: insight.x + 20, y: insight.y + 124, w: insight.w - 40, h: 64 };
  const area = sparkArea(p, plot, focus);
  const band: Rect = {
    x: plot.x + (plot.w / (focus.length - 1)) * 1.5,
    y: plot.y - 8,
    w: (plot.w / (focus.length - 1)) * 3,
    h: plot.h + 8,
  };
  const hours = ['8 am', '12 pm', '4 pm', '8 pm'].map((h) =>
    ui.text(h, 'caption', { size: 11, weight: 520 }),
  );
  const based = ui.text('Based on your last 30 days', 'caption', { size: 12, weight: 480 });
  const why = ui.text('See why', 'label', { size: 13.5, weight: 620 });
  p.block(insight.h, (top) => (g) => {
    insightCard(g);
    g.circle(insight.x + 34, top + 32, 14, { fill: theme.accentSoft });
    drawIcon(g, 'sparkle', insight.x + 34, top + 32, 17, theme.accentInk);
    textAt(g, tag, insight.x + 56, top + 27, theme.accentInk);
    textRight(g, when, insight.x + insight.w - 20, top + 28, theme.subtle);
    textAt(g, sentence, insight.x + 20, top + 62, theme.text);
    g.roundRect(band, 10, { fill: withAlpha(theme.accent, theme.dark ? 0.16 : 0.09) });
    area(g);
    hours.forEach((h, i) => {
      const hx = plot.x + (plot.w / 3) * i;
      const x0 = i === 0 ? hx : i === 3 ? hx - h.width : hx - h.width / 2;
      textAt(g, h, x0, plot.y + plot.h + 10, theme.subtle);
    });
    g.line(insight.x + 20, top + 214, insight.x + insight.w - 20, top + 214, {
      color: theme.border,
      width: 1,
    });
    textAt(g, based, insight.x + 20, top + 230, theme.muted);
    textRight(g, why, insight.x + insight.w - 38, top + 229, theme.accentInk);
    drawIcon(g, 'chevronRight', insight.x + insight.w - 28, top + 234, 16, theme.accentInk, {
      weight: 2.4,
    });
  });
  if (p.done) return;
  p.gap(28);

  // Up next.
  sectionHeader(p, 'Up next', 'Calendar');
  const next = listCard(
    p,
    [
      {
        icon: 'calendar',
        title: 'Design review',
        detail: '10:30 – 11:15 · Studio 2',
        chevron: true,
      },
      { icon: 'users', title: 'Lunch with Kai', detail: '12:30 · Harbour Café', chevron: true },
      { icon: 'pin', title: 'Evening run', detail: '18:00 · 5 km loop', chevron: true },
    ],
    64,
  );
  p.anchor('upnext', 'Your day, planned', next);
  p.gap(24);

  // A post from a friend.
  const post: Rect = { x: PAD, y: p.y, w: INNER, h: 388 };
  p.anchor('post', 'Moments from friends', post);
  const postCard = card(p, post, 24);
  const author = ui.avatar({ cx: post.x + 36, cy: post.y + 36, size: 40, name: 'Noa Lindqvist' });
  const authorName = ui.text('Noa Lindqvist', 'body', { size: 15, weight: 640 });
  const shared = ui.text('Shared a moment · 2 h', 'label', { size: 12.5, weight: 460 });
  const photo = landscape(theme, { x: post.x + 12, y: post.y + 70, w: post.w - 24, h: 214 }, 16, 0);
  const caption = ui.text('Golden hour on the ridge. Worth every step.', 'body', {
    size: 15,
    weight: 450,
    maxWidth: post.w - 40,
    maxLines: 2,
    balance: false,
  });
  const likes = ui.text('128', 'label', { size: 13.5, weight: 600, features: ['tnum'] });
  const comments = ui.text('24', 'label', { size: 13.5, weight: 600, features: ['tnum'] });
  p.block(post.h, (top) => (g) => {
    postCard(g);
    author.draw(g);
    textAt(g, authorName, post.x + 64, top + 21, theme.text);
    textAt(g, shared, post.x + 64, top + 41, theme.muted);
    drawIcon(g, 'more', post.x + post.w - 28, top + 36, 20, theme.subtle);
    photo(g);
    textAt(g, caption, post.x + 20, top + 302, theme.text);
    const ay = top + 356;
    drawIcon(g, 'heart', post.x + 30, ay, 20, theme.accentInk, { weight: 2 });
    textAt(g, likes, post.x + 46, ay - likes.capHeight / 2, theme.text);
    drawIcon(g, 'chat', post.x + 96, ay, 20, theme.muted, { weight: 2 });
    textAt(g, comments, post.x + 112, ay - comments.capHeight / 2, theme.text);
    drawIcon(g, 'bookmark', post.x + post.w - 30, ay, 20, theme.muted, { weight: 2 });
  });
  p.gap(24);

  // Share the week: avatars and one big button.
  const share: Rect = { x: PAD, y: p.y, w: INNER, h: 240 };
  p.anchor('share', 'Share in one tap', share);
  const shareCard = card(p, share, 24);
  const shareTitle = ui.text('Share your week', 'heading', { size: 20, weight: 700 });
  const shareBody = ui.text('Send your recap to friends, or post it anywhere.', 'body', {
    size: 15,
    weight: 450,
    maxWidth: share.w - 40,
    maxLines: 2,
  });
  const people = ['Kai Morgan', 'Sam Rivera', 'Aiko Tanaka', 'Luca Bianchi'].map((name, i) =>
    ui.avatar({ cx: share.x + 38 + i * 31, cy: share.y + 132, size: 36, name }),
  );
  const more = chip(ui, share.x + 38 + 3 * 31 + 18 + 10, share.y + 118, '+5 more', 'soft', {
    height: 28,
    size: 12.5,
  });
  const button: Rect = { x: share.x + 20, y: share.y + 170, w: share.w - 40, h: 50 };
  const buttonLabel = ui.text('Share recap', 'button', { size: 16, weight: 640 });
  const buttonShadow = ui.shadow(button.w, button.h, 25, 1);
  p.block(share.h, (top) => (g) => {
    shareCard(g);
    textAt(g, shareTitle, share.x + 20, top + 24, theme.text);
    textAt(g, shareBody, share.x + 20, top + 56, theme.muted);
    for (const person of people) {
      g.circle(person.options.cx, person.options.cy, person.r + 2.5, { fill: theme.surface });
      person.draw(g);
    }
    more.paint(g);
    buttonShadow.draw(g, button.x, button.y, 0.8);
    g.roundRect(button, 25, { fill: theme.accent });
    const group = 20 + 8 + buttonLabel.ink.w;
    const gx = button.x + button.w / 2 - group / 2;
    drawIcon(g, 'share', gx + 10, button.y + 25, 20, theme.onAccent, { weight: 2.1 });
    textAt(
      g,
      buttonLabel,
      gx + 28 - buttonLabel.ink.x,
      button.y + 25 - buttonLabel.capHeight / 2,
      theme.onAccent,
    );
  });
  p.gap(28);

  // Recommended: two tiles.
  sectionHeader(p, 'Recommended');
  const tileW = (INNER - 12) / 2;
  const tiles = [
    { title: 'Weekend reset', detail: '12 min · Guided', variant: 1 },
    { title: 'Deep work mix', detail: '2 h 10 min · Playlist', variant: 2 },
  ].map((tile, i) => {
    const x0 = PAD + i * (tileW + 12);
    const art = landscape(theme, { x: x0, y: p.y, w: tileW, h: 128 }, 18, tile.variant);
    const t = ui.text(tile.title, 'body', { size: 15, weight: 620, maxWidth: tileW });
    const d = ui.text(tile.detail, 'label', { size: 12.5, weight: 460, maxWidth: tileW });
    return { x0, art, t, d };
  });
  const rec: Rect = { x: PAD, y: p.y, w: INNER, h: 180 };
  p.anchor('recommended', 'Picked for you', rec);
  p.block(rec.h, (top) => (g) => {
    for (const tile of tiles) {
      tile.art(g);
      textAt(g, tile.t, tile.x0 + 2, top + 144, theme.text);
      textAt(g, tile.d, tile.x0 + 2, top + 166, theme.muted);
    }
  });
  p.gap(24);
}

// --- analytics ------------------------------------------------------------------------------

function analytics(p: Page): void {
  const { ui, theme } = p;
  chrome(p, [
    { icon: 'pie', label: 'Overview' },
    { icon: 'doc', label: 'Reports' },
    { icon: 'bell', label: 'Alerts' },
    { icon: 'sliders', label: 'Settings' },
  ]);
  p.gap(12);

  const title = ui.text('Analytics', 'display', { size: 32, weight: 740, tracking: -0.03 });
  p.block(48, (top) => (g) => {
    textAt(g, title, PAD - 1, top + 8, theme.text);
    g.circle(W - PAD - 20, top + 22, 20, { fill: theme.dark ? theme.surface : theme.raised });
    g.circle(W - PAD - 20, top + 22, 19.5, { stroke: { color: theme.border, width: 1 } });
    drawIcon(g, 'calendar', W - PAD - 20, top + 22, 19, theme.text, { weight: 1.9 });
  });
  p.gap(14);
  const seg = segmented(
    ui,
    { x: PAD, y: p.y, w: INNER, h: 36 },
    ['Day', 'Week', 'Month', 'Year'],
    1,
  );
  p.block(36, () => seg);
  p.gap(18);

  // KPIs.
  const kpis: { label: string; value: string; delta: string; up: boolean }[] = [
    { label: 'Revenue', value: '€48.2k', delta: '+12.4%', up: true },
    { label: 'Active users', value: '8,431', delta: '+5.1%', up: true },
    { label: 'Conversion', value: '3.8%', delta: '+0.6 pt', up: true },
    { label: 'Avg. order', value: '€56.10', delta: '−1.2%', up: false },
  ];
  const kw = (INNER - 12) / 2;
  const kh = 104;
  const grid: Rect = { x: PAD, y: p.y, w: INNER, h: kh * 2 + 12 };
  p.anchor('kpis', 'Key numbers', grid);
  const cells = kpis.map((k, i) => {
    const rect: Rect = {
      x: PAD + (i % 2) * (kw + 12),
      y: grid.y + Math.floor(i / 2) * (kh + 12),
      w: kw,
      h: kh,
    };
    const back = card(p, rect, 20);
    const label = ui.text(k.label, 'label', { size: 13, weight: 520 });
    const value = ui.text(k.value, 'heading', {
      size: 26,
      weight: 720,
      features: ['tnum'],
      tracking: -0.025,
    });
    const delta = ui.text(k.delta, 'caption', { size: 12.5, weight: 640, features: ['tnum'] });
    const color = k.up ? theme.success : theme.danger;
    return (g: Draw) => {
      back(g);
      textAt(g, label, rect.x + 16, rect.y + 18, theme.muted);
      textAt(g, value, rect.x + 15, rect.y + 44, theme.text);
      drawIcon(g, k.up ? 'trendUp' : 'trendDown', rect.x + 23, rect.y + 84, 15, color, {
        weight: 2.4,
      });
      textAt(g, delta, rect.x + 35, rect.y + 84 - delta.capHeight / 2, color);
    };
  });
  p.block(grid.h, () => (g) => {
    for (const cell of cells) cell(g);
  });
  p.gap(16);

  // Revenue trend: axis, monotone line with its area, a tooltip on the newest value.
  const trend: Rect = { x: PAD, y: p.y, w: INNER, h: 244 };
  p.anchor('trend', 'Revenue trend', trend);
  const trendCard = card(p, trend);
  const trendTitle = ui.text('Revenue trend', 'title', { size: 16, weight: 650 });
  const trendDetail = ui.text('Last 12 weeks', 'label', { size: 13, weight: 480 });
  const values = [12, 18, 15, 22, 28, 26, 34, 39, 37, 45, 52, 58];
  const ticks = chartDomain(values, 3);
  const plot: Rect = { x: trend.x + 52, y: trend.y + 84, w: trend.w - 72, h: 112 };
  const axis = ui.valueAxis({ plot, ticks, format: (v) => (v === 0 ? '0' : `€${v}k`) });
  const chart = ui.lineChart({ plot, values, domain: ticks });
  const fill = chart.areaFill(theme.accent, theme.dark ? 0.3 : 0.2);
  const last = chart.points[chart.points.length - 1] as Vec2;
  const tip = ui.tooltip({ text: '€58k' });
  const months = ['Jul', 'Aug', 'Sep', 'Oct'].map((m) =>
    ui.text(m, 'caption', { size: 11, weight: 520 }),
  );
  p.block(trend.h, (top) => (g) => {
    trendCard(g);
    textAt(g, trendTitle, trend.x + 20, top + 24, theme.text);
    textAt(g, trendDetail, trend.x + 20, top + 46, theme.muted);
    axis.draw(g);
    g.path(chart.area, { fill });
    g.path(chart.line, {
      stroke: { color: theme.accentInk, width: 2.5, cap: 'round', join: 'round' },
    });
    g.circle(last.x, last.y, 7, { fill: theme.surface });
    g.circle(last.x, last.y, 4.5, { fill: theme.accentInk });
    tip.draw(g, last.x, last.y - 4, 1, 1, { min: trend.x + 12, max: trend.x + trend.w - 12 });
    months.forEach((m, i) => {
      const mx = plot.x + (plot.w / 3) * i;
      const x0 = i === 0 ? mx : i === 3 ? mx - m.width : mx - m.width / 2;
      textAt(g, m, x0, plot.y + plot.h + 12, theme.subtle);
    });
  });
  if (p.done) return;
  p.gap(16);

  // Sessions by day.
  const sessions: Rect = { x: PAD, y: p.y, w: INNER, h: 196 };
  p.anchor('sessions', 'Sessions by day', sessions);
  const sessionsCard = card(p, sessions);
  const sTitle = ui.text('Sessions by day', 'title', { size: 16, weight: 650 });
  const sDetail = ui.text('Peak on Saturday', 'label', { size: 13, weight: 480 });
  const sBars = dayBars(
    p,
    { x: sessions.x + 22, y: sessions.y + 70, w: sessions.w - 44, h: 84 },
    [34, 42, 39, 51, 47, 62, 58],
    5,
    DAYS,
  );
  p.block(sessions.h, (top) => (g) => {
    sessionsCard(g);
    textAt(g, sTitle, sessions.x + 20, top + 24, theme.text);
    textAt(g, sDetail, sessions.x + 20, top + 46, theme.muted);
    sBars(g);
  });
  p.gap(16);

  // Monthly goal.
  const goal: Rect = { x: PAD, y: p.y, w: INNER, h: 142 };
  p.anchor('goal', 'Monthly goal', goal);
  const goalCard = card(p, goal);
  const donut = ui.donut({ cx: goal.x + 72, cy: goal.y + goal.h / 2, r: 42, width: 13 });
  const gLabel = ui.text('Monthly goal', 'label', { size: 13, weight: 520 });
  const gValue = ui.text('72%', 'display', { size: 34, weight: 740, features: ['tnum'] });
  const gDetail = ui.text('€48.2k of €67k', 'label', { size: 13, weight: 480, features: ['tnum'] });
  p.block(goal.h, (top) => (g) => {
    goalCard(g);
    donut.draw(g, 0.72, theme.accent, { track: 1 });
    textAt(g, gLabel, goal.x + 144, top + 34, theme.muted);
    textAt(g, gValue, goal.x + 142, top + 56, theme.text);
    textAt(g, gDetail, goal.x + 144, top + 102, theme.muted);
  });
  p.gap(16);

  // Top channels.
  const channels: [string, number][] = [
    ['Direct', 0.42],
    ['Search', 0.31],
    ['Social', 0.18],
    ['Email', 0.09],
  ];
  const ch: Rect = { x: PAD, y: p.y, w: INNER, h: 62 + channels.length * 50 };
  p.anchor('channels', 'Top channels', ch);
  const chCard = card(p, ch);
  const chTitle = ui.text('Top channels', 'title', { size: 16, weight: 650 });
  const rows = channels.map(([name, v], i) => {
    const top = ch.y + 60 + i * 50;
    const label = ui.text(name, 'body', { size: 15, weight: 540 });
    const value = ui.text(`${Math.round(v * 100)}%`, 'label', {
      size: 13.5,
      weight: 640,
      features: ['tnum'],
    });
    const bar = progressBar(
      ui,
      { x: ch.x + 20, y: top + 24, w: ch.w - 40, h: 7 },
      (v / 0.42) * 0.86,
    );
    return (g: Draw) => {
      textAt(g, label, ch.x + 20, top, theme.text);
      textRight(g, value, ch.x + ch.w - 20, top + 1, theme.muted);
      bar(g);
    };
  });
  p.block(ch.h, (top) => (g) => {
    chCard(g);
    textAt(g, chTitle, ch.x + 20, top + 24, theme.text);
    for (const row of rows) row(g);
  });
  p.gap(24);
}

// --- chat -----------------------------------------------------------------------------------

type Message =
  | { from: 'in' | 'out'; text: string }
  | { from: 'in'; image: string }
  | { day: string };

function chat(p: Page): void {
  const { ui, theme } = p;
  // A chat reads on the page color; incoming bubbles sit one step off it.
  p.background = theme.dark ? theme.canvas : theme.surface;
  const NAV = 58;
  const INPUT = 64;
  if (p.chrome) {
    p.overlays.push(statusBar(ui, W, p.time, p.background));
    // Navigation bar: back, contact, actions.
    const avatar = ui.avatar({ cx: 66, cy: STATUS_BAR + NAV / 2, size: 38, name: 'Maya Chen' });
    const name = ui.text('Maya Chen', 'title', { size: 16, weight: 660 });
    const status = ui.text('Online', 'caption', { size: 12, weight: 540 });
    const navY = STATUS_BAR;
    p.overlays.push((g) => {
      g.rect({ x: 0, y: navY, w: W, h: NAV }, { fill: p.background });
      g.line(0, navY + NAV - 0.5, W, navY + NAV - 0.5, { color: theme.border, width: 1 });
      drawIcon(g, 'chevronLeft', 24, navY + NAV / 2, 26, theme.accentInk, { weight: 2.3 });
      avatar.draw(g);
      textAt(g, name, 96, navY + 14, theme.text);
      g.circle(100, navY + 40, 3.5, { fill: theme.success });
      textAt(g, status, 109, navY + 40 - status.capHeight / 2, theme.success);
      drawIcon(g, 'film', W - 64, navY + NAV / 2, 24, theme.accentInk, { weight: 1.9 });
      drawIcon(g, 'more', W - 26, navY + NAV / 2, 22, theme.accentInk);
    });
    // Composer: attach, field, send.
    const top = p.viewport - INPUT - 30;
    const placeholder = ui.text('Message', 'body', { size: 16, weight: 430 });
    const field: Rect = { x: 60, y: top + 12, w: W - 60 - 62, h: 40 };
    p.overlays.push((g) => {
      g.rect({ x: 0, y: top, w: W, h: p.viewport - top }, { fill: p.background });
      g.line(0, top + 0.5, W, top + 0.5, { color: theme.border, width: 1 });
      g.circle(34, top + 32, 18, { fill: bubbleFill(theme) });
      drawIcon(g, 'plus', 34, top + 32, 20, theme.muted, { weight: 2.1 });
      g.roundRect(field, 20, { stroke: { color: theme.borderStrong, width: 1 } });
      textAt(g, placeholder, field.x + 16, field.y + 20 - placeholder.capHeight / 2, theme.subtle);
      drawIcon(g, 'mic', field.x + field.w - 20, field.y + 20, 19, theme.subtle, { weight: 1.9 });
      g.circle(W - 34, top + 32, 20, { fill: theme.accent });
      drawIcon(g, 'arrowUp', W - 34, top + 32, 20, theme.onAccent, { weight: 2.4 });
    });
    p.overlays.push(homeIndicator(ui, W, p.viewport));
    p.top = STATUS_BAR + NAV;
    p.bottom = INPUT + 30;
  } else {
    p.top = 0;
  }
  p.y = p.top + 14;

  const earlier: Message[] = [
    { day: 'Yesterday 18:40' },
    { from: 'in', text: 'Are we still on for the edit tomorrow?' },
    { from: 'out', text: 'Yes! 9 sharp. I’ll bring the new music options.' },
    { from: 'in', text: 'Perfect. Élodie wants to sit in for the first hour.' },
    { from: 'out', text: 'Great, the more eyes the better.' },
  ];
  const today: Message[] = [
    { day: 'Today 9:12' },
    { from: 'in', text: 'Morning! Did the new cut come through?' },
    { from: 'out', text: 'Just landed. Watching it now.' },
    { from: 'in', text: 'The opening is so much tighter.' },
    { from: 'in', text: 'And the color pass really lands.' },
    { from: 'out', text: 'Agreed. Can we lock it by Friday?' },
    { from: 'in', image: 'poster' },
    { from: 'in', text: 'Poster frame for the launch' },
    { from: 'out', text: 'Love it. Sending it to Kai now.' },
  ];
  const messages = p.tall ? [...earlier, ...today] : today;
  const imageW = 236;
  messages.forEach((m, i) => {
    const next = messages[i + 1];
    const sameNext =
      next !== undefined && !('day' in next) && !('day' in m) && next.from === m.from;
    if ('day' in m) {
      const block = ui.text(m.day, 'caption', { size: 12, weight: 580 });
      if (i > 0) p.gap(10);
      p.block(30, (top) => (g) => textCentered(g, block, W / 2, top + 12, theme.subtle));
      return;
    }
    if ('image' in m) {
      const rect: Rect = { x: 16, y: p.y, w: imageW, h: 164 };
      const art = landscape(theme, rect, 20, 1);
      if (!p.anchors.some((a) => a.id === 'image')) p.anchor('image', 'Shared media', rect);
      p.block(rect.h, () => art);
      p.gap(sameNext ? 4 : 14);
      return;
    }
    const b = bubble(ui, m.text, { y: p.y, width: W, outgoing: m.from === 'out', last: !sameNext });
    if (i === 1 || (p.tall && i === earlier.length + 1)) {
      if (!p.anchors.some((a) => a.id === 'thread')) p.anchor('thread', 'Conversations', b.rect);
    }
    p.block(b.rect.h, () => b.paint);
    p.gap(sameNext ? 4 : 12);
  });
  // Read receipt under the last message, then Maya typing.
  const receipt = ui.text('Read 9:24', 'caption', { size: 11.5, weight: 520 });
  p.gap(-8);
  p.block(18, (top) => (g) => textRight(g, receipt, W - 20, top + 3, theme.subtle));
  const last = [...p.items].reverse().find((item) => item.bottom - item.top > 30);
  if (last)
    p.anchor('reply', 'Instant replies', {
      x: W / 2,
      y: last.top,
      w: W / 2 - 16,
      h: last.bottom - last.top,
    });
  p.gap(8);
  const typing: Rect = { x: 16, y: p.y, w: 64, h: 40 };
  p.anchor('typing', 'Live typing', typing);
  const fillIn = bubbleFill(theme);
  p.block(typing.h, (top) => (g) => {
    g.roundRect({ ...typing, y: top }, 20, { fill: fillIn });
    for (let k = 0; k < 3; k++) {
      g.circle(typing.x + 20 + k * 12, top + 20, 4, { fill: ink(theme, 0.25 + 0.15 * k) });
    }
  });
  p.gap(16);
}

// --- settings -------------------------------------------------------------------------------

type SettingRow = { icon: IconName; title: string; on?: boolean; value?: string };

function settings(p: Page): void {
  const { ui, theme } = p;
  chrome(p, null);
  p.gap(12);
  const title = ui.text('Settings', 'display', { size: 34, weight: 740, tracking: -0.03 });
  p.block(44, (top) => (g) => textAt(g, title, PAD - 1, top + 6, theme.text));
  p.gap(12);

  const search: Rect = { x: PAD, y: p.y, w: INNER, h: 40 };
  const searchText = ui.text('Search', 'body', { size: 16, weight: 430 });
  p.block(search.h, (top) => (g) => {
    g.roundRect({ ...search, y: top }, 12, {
      fill: theme.dark ? theme.surface : ink(theme, 0.055),
    });
    drawIcon(g, 'search', search.x + 22, top + 20, 18, theme.subtle, { weight: 2.1 });
    textAt(g, searchText, search.x + 40, top + 20 - searchText.capHeight / 2, theme.subtle);
  });
  p.gap(20);

  // Profile.
  const profile: Rect = { x: PAD, y: p.y, w: INNER, h: 80 };
  p.anchor('profile', 'Your account', profile);
  const profileCard = card(p, profile, 20);
  const avatar = ui.avatar({
    cx: profile.x + 42,
    cy: profile.y + 40,
    size: 52,
    name: 'Amara Okafor',
  });
  const name = ui.text('Amara Okafor', 'title', { size: 17, weight: 660 });
  const detail = ui.text('Account, security and billing', 'label', { size: 13, weight: 460 });
  p.block(profile.h, (top) => (g) => {
    profileCard(g);
    avatar.draw(g);
    textAt(g, name, profile.x + 80, top + 23, theme.text);
    textAt(g, detail, profile.x + 80, top + 46, theme.muted);
    drawIcon(g, 'chevronRight', profile.x + profile.w - 22, top + 40, 18, theme.subtle);
  });
  p.gap(26);

  const group = (id: string, label: string, heading: string, rows: readonly SettingRow[]) => {
    const head = ui.text(heading, 'caption', { size: 12, weight: 620, tracking: 0.05 });
    p.block(22, (top) => (g) => textAt(g, head, PAD + 16, top + 2, theme.muted));
    const rowH = 54;
    const rect: Rect = { x: PAD, y: p.y, w: INNER, h: rows.length * rowH };
    p.anchor(id, label, rect);
    const back = card(p, rect, 20);
    const painters = rows.map((row, i) => {
      const top = rect.y + i * rowH;
      const cy = top + rowH / 2;
      const tile = iconTile(ui, PAD + 32, cy, 30, row.icon, 'solid');
      const t = ui.text(row.title, 'body', { size: 16, weight: 480 });
      const value = row.value ? ui.text(row.value, 'body', { size: 15.5, weight: 430 }) : null;
      const toggle =
        row.on !== undefined ? switchControl(ui, W - PAD - 16 - 51, cy - 15.5, row.on) : null;
      const separator = i < rows.length - 1;
      return (g: Draw) => {
        tile(g);
        textAt(g, t, PAD + 60, cy - t.capHeight / 2, theme.text);
        if (toggle) toggle(g);
        else {
          if (value) textRight(g, value, W - PAD - 38, cy - value.capHeight / 2, theme.muted);
          drawIcon(g, 'chevronRight', W - PAD - 22, cy, 17, theme.subtle);
        }
        if (separator)
          g.line(PAD + 60, top + rowH, W - PAD, top + rowH, { color: theme.border, width: 1 });
      };
    });
    p.block(rect.h, () => (g) => {
      back(g);
      for (const paint of painters) paint(g);
    });
    p.gap(24);
  };

  group('preferences', 'Smart preferences', 'PREFERENCES', [
    { icon: 'bell', title: 'Notifications', on: true },
    { icon: 'moon', title: 'Focus mode', on: false },
    { icon: 'lock', title: 'Biometric unlock', on: true },
  ]);
  group('general', 'Make it yours', 'GENERAL', [
    { icon: 'sun', title: 'Appearance', value: theme.dark ? 'Dark' : 'Light' },
    { icon: 'globe', title: 'Language', value: 'English' },
    { icon: 'pie', title: 'Storage', value: '12.4 GB' },
  ]);
  if (p.done) return;
  group('support', 'Help when you need it', 'SUPPORT', [
    { icon: 'shield', title: 'Privacy' },
    { icon: 'help', title: 'Help & feedback' },
    { icon: 'info', title: 'About', value: '2.4.0' },
  ]);
  if (p.tall) {
    group('account', 'Account', 'ACCOUNT', [
      { icon: 'users', title: 'Family sharing', value: '3 people' },
      { icon: 'wallet', title: 'Subscriptions', value: 'Plus' },
    ]);
  }
}

const BUILDERS: Record<ScreenKind, (p: Page) => void> = {
  finance,
  feed,
  analytics,
  chat,
  settings,
};
