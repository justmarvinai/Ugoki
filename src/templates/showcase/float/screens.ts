/**
 * Float's default screens: a fictional finance app ("Halden"), laid out with the UI Kit and
 * painted once into textures (`rasterize`) so the 3D display maps an image, not hundreds of
 * draw calls per triangle. Phones show the kit's app screens; a tablet shows two of them split;
 * laptops and browser windows show a desktop dashboard.
 */

import {
  type BuildContext,
  type Color,
  type ControlSchema,
  chartDomain,
  createScreen,
  createUiKit,
  type Draw,
  drawIcon,
  type FrameSpec,
  type IconName,
  type Palette,
  type RasterGraphic,
  rasterize,
  type ScreenKind,
  type UiKit,
  type UiMode,
  withAlpha,
} from '@/engine';
import type { DeviceModel } from './device';

type TextEngine = BuildContext<ControlSchema>['text'];

const PHONE_PAGES: readonly ScreenKind[] = ['finance', 'analytics', 'settings'];
const SPLIT_PAGES: readonly (readonly [ScreenKind, ScreenKind])[] = [
  ['finance', 'analytics'],
  ['analytics', 'settings'],
  ['settings', 'finance'],
];

/**
 * The default screen for slot `index` of a device whose display is `width × height` design
 * units, painted at `scale` pixels per unit.
 */
export function defaultScreen(options: {
  model: DeviceModel;
  index: number;
  width: number;
  height: number;
  scale: number;
  frame: FrameSpec;
  text: TextEngine;
  palette: Palette;
  mode: UiMode;
}): RasterGraphic | null {
  const { model, index, width, height, scale, frame, text, palette, mode } = options;
  const unit = width / model.ui.w;
  return rasterize({
    width,
    height,
    scale,
    frame,
    draw: (g) => {
      switch (model.kind) {
        case 'phone': {
          const screen = createScreen({
            text,
            palette,
            mode,
            kind: PHONE_PAGES[index % PHONE_PAGES.length] ?? 'finance',
            rect: { x: 0, y: 0, w: width, h: height },
          });
          screen.draw(g);
          // The punch-hole camera sits in the display.
          g.circle(width / 2, 19 * unit, 6.2 * unit, { fill: { r: 0.02, g: 0.02, b: 0.03, a: 1 } });
          return;
        }
        case 'tablet': {
          const [left, right] = SPLIT_PAGES[index % SPLIT_PAGES.length] ?? ['finance', 'analytics'];
          const gutter = 8 * unit;
          const pane = (width - gutter) / 2;
          const ui = createUiKit({ text, palette, mode, unit });
          g.rect({ x: 0, y: 0, w: width, h: height }, { fill: ui.theme.sunken });
          for (const [k, kind] of [left, right].entries()) {
            createScreen({
              text,
              palette,
              mode,
              kind,
              rect: { x: k * (pane + gutter), y: 0, w: pane, h: height },
              // One status bar across the top is enough.
              chrome: true,
            }).draw(g);
          }
          // The split handle.
          g.roundRect(
            { x: width / 2 - 2 * unit, y: height / 2 - 28 * unit, w: 4 * unit, h: 56 * unit },
            2 * unit,
            { fill: withAlpha(ui.theme.text, 0.35) },
          );
          return;
        }
        default: {
          const ui = createUiKit({ text, palette, mode, unit });
          const top = model.toolbar * unit;
          if (model.kind === 'browser') drawToolbar(g, ui, width, top);
          g.group({ y: top }, (g) =>
            dashboard(g, ui, width, height - top, index % 2 === 0 ? 'overview' : 'insights'),
          );
        }
      }
    },
  });
}

/** A generic browser toolbar: three neutral dots and an address pill. */
function drawToolbar(g: Draw, ui: UiKit, width: number, height: number): void {
  const t = ui.theme;
  const u = ui.unit;
  g.rect({ x: 0, y: 0, w: width, h: height }, { fill: t.raised });
  g.rect({ x: 0, y: height - u, w: width, h: u }, { fill: t.border });
  for (let k = 0; k < 3; k++) {
    g.circle(22 * u + k * 18 * u, height / 2, 5.5 * u, { fill: withAlpha(t.text, 0.18) });
  }
  const pill = { x: width / 2 - 230 * u, y: height / 2 - 15 * u, w: 460 * u, h: 30 * u };
  g.roundRect(pill, 15 * u, { fill: t.sunken });
  drawIcon(g, 'lock', pill.x + 22 * u, pill.y + pill.h / 2, 13 * u, t.muted);
  const address = ui.text('halden.app/overview', 'caption', { size: 13 });
  g.text(address, {
    fill: t.muted,
    x: pill.x + pill.w / 2 - address.width / 2,
    y: pill.y + (pill.h - address.capHeight) / 2,
  });
}

type Page = 'overview' | 'insights';

const NAV: readonly [IconName, string][] = [
  ['home', 'Home'],
  ['wallet', 'Accounts'],
  ['card', 'Cards'],
  ['bars', 'Insights'],
  ['sliders', 'Settings'],
];

const BALANCE = [9.1, 9.4, 9.2, 9.8, 10.1, 10.0, 10.6, 11.2, 11.0, 11.7, 12.1, 12.48];
const MONTHS = [2.1, 2.6, 2.3, 2.9, 2.4, 2.0];
const ROWS: readonly [string, string, string, boolean][] = [
  ['Studio North', 'Transfer · Today', '+€1,200.00', true],
  ['Grocer & Co', 'Groceries · Today', '−€64.20', false],
  ['City Transit', 'Travel · Yesterday', '−€2.90', false],
  ['Blue Door Café', 'Food · Yesterday', '−€8.40', false],
];
const CATEGORIES: readonly [string, string, number][] = [
  ['Groceries', '€612.40', 0.72],
  ['Travel', '€338.10', 0.41],
  ['Food & drink', '€264.80', 0.33],
  ['Subscriptions', '€48.97', 0.12],
];

/** A desktop dashboard for a 1280 × 800 UI px page (scaled by the kit's unit). */
function dashboard(g: Draw, ui: UiKit, width: number, height: number, page: Page): void {
  const t = ui.theme;
  const u = ui.unit;
  g.rect({ x: 0, y: 0, w: width, h: height }, { fill: t.canvas });

  // Sidebar.
  const side = 232 * u;
  g.rect({ x: 0, y: 0, w: side, h: height }, { fill: t.surface });
  g.rect({ x: side - u, y: 0, w: u, h: height }, { fill: t.border });
  g.circle(32 * u, 38 * u, 11 * u, { fill: t.accent });
  g.rect({ x: 25 * u, y: 36.5 * u, w: 14 * u, h: 3 * u }, { fill: t.onAccent });
  const brand = ui.text('Halden', 'title', { size: 17, weight: 680 });
  g.text(brand, { fill: t.text, x: 52 * u, y: 38 * u - brand.capHeight / 2 });
  NAV.forEach(([icon, label], k) => {
    const y = 96 * u + k * 44 * u;
    const active = page === 'overview' ? k === 0 : k === 3;
    if (active) {
      g.roundRect({ x: 14 * u, y: y - 17 * u, w: side - 28 * u, h: 34 * u }, 9 * u, {
        fill: t.accentSoft,
      });
    }
    const color: Color = active ? t.accentInk : t.muted;
    drawIcon(g, icon, 34 * u, y, 17 * u, color);
    const text = ui.text(label, 'label', { size: 14, weight: active ? 600 : 500 });
    g.text(text, { fill: active ? t.text : t.muted, x: 54 * u, y: y - text.capHeight / 2 });
  });

  // Header.
  const x0 = side + 32 * u;
  const inner = width - x0 - 32 * u;
  const title = ui.text(page === 'overview' ? 'Good morning, Maya' : 'Insights', 'display', {
    size: 26,
  });
  g.text(title, { fill: t.text, x: x0, y: 34 * u });
  const date = ui.text(page === 'overview' ? 'Wednesday, 14 October' : 'October so far', 'label');
  g.text(date, { fill: t.muted, x: x0, y: 34 * u + title.height + 10 * u });
  g.circle(width - 50 * u, 48 * u, 18 * u, { fill: t.accentSoft });
  const initials = ui.text('MC', 'label', { size: 13, weight: 650 });
  g.text(initials, {
    fill: t.accentInk,
    x: width - 50 * u - initials.width / 2,
    y: 48 * u - initials.capHeight / 2,
  });
  drawIcon(g, 'bell', width - 96 * u, 48 * u, 18 * u, t.muted);
  const search = { x: width - 380 * u, y: 32 * u, w: 250 * u, h: 32 * u };
  g.roundRect(search, 16 * u, { fill: t.surface, stroke: { color: t.border, width: u } });
  drawIcon(g, 'search', search.x + 20 * u, search.y + 16 * u, 14 * u, t.subtle);
  const hint = ui.text('Search', 'label');
  g.text(hint, {
    fill: t.subtle,
    x: search.x + 36 * u,
    y: search.y + (search.h - hint.capHeight) / 2,
  });

  const y1 = 116 * u;
  if (page === 'overview') {
    // KPI cards.
    const kpis: [string, string, string, boolean][] = [
      ['Total balance', '€12,480.35', '+2.7% this month', true],
      ['Spent this month', '€2,318.40', '−8% vs September', true],
      ['Saved', '€5,120.00', 'Goal 64%', false],
    ];
    const gap = 20 * u;
    const kw = (inner - 2 * gap) / 3;
    const kh = 118 * u;
    kpis.forEach(([label, value, note, good], k) => {
      const rect = { x: x0 + k * (kw + gap), y: y1, w: kw, h: kh };
      ui.card(rect, { radius: 14, elevation: 1 }).draw(g);
      const l = ui.text(label, 'label');
      g.text(l, { fill: t.muted, x: rect.x + 20 * u, y: rect.y + 22 * u });
      const v = ui.text(value, 'display', { size: 28, features: ['tnum'] });
      g.text(v, { fill: t.text, x: rect.x + 20 * u, y: rect.y + 46 * u });
      const n = ui.text(note, 'caption', { weight: 600 });
      g.text(n, { fill: good ? t.success : t.muted, x: rect.x + 20 * u, y: rect.y + 90 * u });
    });
    // Balance chart.
    const y2 = y1 + kh + 20 * u;
    const chartRect = { x: x0, y: y2, w: inner * 0.6, h: height - y2 - 32 * u };
    ui.card(chartRect, { radius: 14, elevation: 1 }).draw(g);
    const ct = ui.text('Balance', 'title');
    g.text(ct, { fill: t.text, x: chartRect.x + 20 * u, y: chartRect.y + 22 * u });
    const plot = {
      x: chartRect.x + 24 * u,
      y: chartRect.y + 70 * u,
      w: chartRect.w - 48 * u,
      h: chartRect.h - 100 * u,
    };
    const domain = chartDomain(BALANCE, 4, false);
    for (let k = 0; k <= 3; k++) {
      const y = plot.y + (plot.h * k) / 3;
      g.rect({ x: plot.x, y, w: plot.w, h: u }, { fill: t.gridline });
    }
    const chart = ui.lineChart({ plot, values: BALANCE, domain });
    g.path(chart.area, { fill: chart.areaFill(t.accent, 0.18) });
    g.path(chart.line, {
      stroke: { color: t.accentInk, width: 2.5 * u, cap: 'round', join: 'round' },
    });
    const last = chart.points[chart.points.length - 1];
    if (last) {
      g.circle(last.x, last.y, 5 * u, {
        fill: t.surface,
        stroke: { color: t.accentInk, width: 2.5 * u },
      });
    }
    // Transactions.
    const listRect = {
      x: chartRect.x + chartRect.w + 20 * u,
      y: y2,
      w: inner - chartRect.w - 20 * u,
      h: chartRect.h,
    };
    ui.card(listRect, { radius: 14, elevation: 1 }).draw(g);
    const lt = ui.text('Recent activity', 'title');
    g.text(lt, { fill: t.text, x: listRect.x + 20 * u, y: listRect.y + 22 * u });
    ROWS.forEach(([name, meta, amount, income], k) => {
      const y = listRect.y + 76 * u + k * 60 * u;
      if (y + 40 * u > listRect.y + listRect.h) return;
      g.circle(listRect.x + 38 * u, y + 12 * u, 17 * u, {
        fill: income ? t.successSoft : t.sunken,
      });
      drawIcon(
        g,
        income ? 'arrowDown' : 'bag',
        listRect.x + 38 * u,
        y + 12 * u,
        15 * u,
        income ? t.success : t.muted,
      );
      const nm = ui.text(name, 'label', { size: 14, weight: 600 });
      g.text(nm, { fill: t.text, x: listRect.x + 66 * u, y });
      const mt = ui.text(meta, 'caption');
      g.text(mt, { fill: t.muted, x: listRect.x + 66 * u, y: y + 20 * u });
      const am = ui.text(amount, 'label', { size: 14, weight: 600, features: ['tnum'] });
      g.text(am, {
        fill: income ? t.success : t.text,
        x: listRect.x + listRect.w - 20 * u - am.width,
        y,
      });
    });
    return;
  }

  // Insights: monthly spending bars and categories.
  const barsRect = { x: x0, y: y1, w: inner * 0.56, h: height - y1 - 32 * u };
  ui.card(barsRect, { radius: 14, elevation: 1 }).draw(g);
  const bt = ui.text('Spending by month', 'title');
  g.text(bt, { fill: t.text, x: barsRect.x + 20 * u, y: barsRect.y + 22 * u });
  const total = ui.text('€2,318.40', 'display', { size: 30, features: ['tnum'] });
  g.text(total, { fill: t.text, x: barsRect.x + 20 * u, y: barsRect.y + 52 * u });
  const base = barsRect.y + barsRect.h - 46 * u;
  const top = barsRect.y + 120 * u;
  const bw = (barsRect.w - 40 * u) / MONTHS.length;
  const max = Math.max(...MONTHS);
  const labels = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  MONTHS.forEach((value, k) => {
    const h = ((base - top) * value) / max;
    const x = barsRect.x + 20 * u + k * bw + bw * 0.2;
    g.roundRect({ x, y: base - h, w: bw * 0.6, h }, 8 * u, {
      fill: k === MONTHS.length - 1 ? t.accent : t.accentSoft,
    });
    const label = ui.text(labels[k] ?? '', 'caption');
    g.text(label, { fill: t.muted, x: x + bw * 0.3 - label.width / 2, y: base + 16 * u });
  });
  const catRect = {
    x: barsRect.x + barsRect.w + 20 * u,
    y: y1,
    w: inner - barsRect.w - 20 * u,
    h: barsRect.h,
  };
  ui.card(catRect, { radius: 14, elevation: 1 }).draw(g);
  const cat = ui.text('Top categories', 'title');
  g.text(cat, { fill: t.text, x: catRect.x + 20 * u, y: catRect.y + 22 * u });
  CATEGORIES.forEach(([name, amount, share], k) => {
    const y = catRect.y + 74 * u + k * 72 * u;
    if (y + 40 * u > catRect.y + catRect.h) return;
    const nm = ui.text(name, 'label', { size: 14, weight: 600 });
    g.text(nm, { fill: t.text, x: catRect.x + 20 * u, y });
    const am = ui.text(amount, 'label', { size: 14, weight: 600, features: ['tnum'] });
    g.text(am, { fill: t.text, x: catRect.x + catRect.w - 20 * u - am.width, y });
    const track = { x: catRect.x + 20 * u, y: y + 26 * u, w: catRect.w - 40 * u, h: 8 * u };
    g.roundRect(track, 4 * u, { fill: t.sunken });
    g.roundRect({ ...track, w: track.w * share }, 4 * u, { fill: t.accent });
  });
}
