/**
 * Dashboard — analytics build (docs/templates/10-ui-motion.md §10.4).
 *
 * The expensive detail: the line is a monotone cubic (it never invents peaks or dips between
 * data points), every card builds its scaffolding — gridlines, axis labels, tracks — before
 * its data arrives, and every number is set in tabular figures, so counting KPIs, ticks and
 * tooltips never jitter. In the hold the line takes a live data point: the chart scrolls one
 * step, the new segment draws on and the tooltip follows the newest value.
 */

import {
  CLEAN_END,
  type Color,
  c,
  clamp01,
  createOdometer,
  createUiKit,
  type Draw,
  defineTemplate,
  drawIcon,
  type EaseName,
  ease,
  type FormatId,
  formatFigure,
  type Gradient,
  type LineChart,
  mixOklch,
  niceTicks,
  type Odometer,
  type Rect,
  springProgress,
  type TextBlock,
  UI_FONT,
  type UiCard,
  type UiKit,
  type UiTooltip,
  type Vec2,
} from '@/engine';
import {
  barLabels,
  continueSeries,
  type Kpi,
  lineLabels,
  parseKpis,
  parseSeries,
  seriesDecimals,
} from './data';

type CellKind = 'line' | 'bars' | 'donut' | 'side';

type Arrangement = {
  /** Grid width in UI px; the kit's unit follows from the area's width. */
  width: number;
  /** KPI columns for n KPIs. */
  kpiCols: (n: number) => number;
  /** Chart rows (cells with width shares) and their relative heights. */
  rows: readonly (readonly { kind: CellKind; share: number }[])[];
  weights: readonly number[];
  /** Least height of each chart row in UI px. */
  minRow: readonly number[];
  /** Headline size in u. */
  headline: number;
};

const ARRANGEMENTS: Record<FormatId, Arrangement> = {
  '16:9': {
    width: 880,
    kpiCols: (n) => n,
    rows: [
      [
        { kind: 'line', share: 0.635 },
        { kind: 'side', share: 0.365 },
      ],
    ],
    weights: [1],
    minRow: [290],
    headline: 5.8,
  },
  '9:16': {
    width: 410,
    kpiCols: (n) => (n === 4 ? 2 : n),
    rows: [
      [{ kind: 'line', share: 1 }],
      [
        { kind: 'bars', share: 0.54 },
        { kind: 'donut', share: 0.46 },
      ],
    ],
    weights: [1.15, 1],
    minRow: [170, 150],
    headline: 7.2,
  },
  '1:1': {
    width: 540,
    kpiCols: (n) => n,
    rows: [
      [{ kind: 'line', share: 1 }],
      [
        { kind: 'bars', share: 0.58 },
        { kind: 'donut', share: 0.42 },
      ],
    ],
    weights: [1.4, 1],
    minRow: [170, 136],
    headline: 5.6,
  },
  '4:5': {
    width: 480,
    kpiCols: (n) => n,
    rows: [
      [{ kind: 'line', share: 1 }],
      [
        { kind: 'bars', share: 0.56 },
        { kind: 'donut', share: 0.44 },
      ],
    ],
    weights: [1.4, 1],
    minRow: [170, 136],
    headline: 6,
  },
};

const DENSITY = {
  comfortable: { gap: 16, pad: 20, radius: 14, value: 28 },
  compact: { gap: 11, pad: 16, radius: 10, value: 26 },
} as const;

const DEFAULT_LINE = [12, 18, 15, 22, 28, 26, 34, 39, 37, 45, 52, 58];
const DEFAULT_BARS = [34, 42, 39, 51, 47, 62, 58];

const win = (t: number, start: number, dur: number, curve: EaseName) =>
  ease[curve](dur <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / dur));

/** Card motion: appears (fade, rise, scale) and leaves (fade, scale) — shared by every card. */
type CardMotion = { order: number; rect: Rect; card: UiCard };

export default defineTemplate({
  id: 'dashboard',
  version: 1,
  meta: {
    name: 'Dashboard',
    tagline: 'Analytics build',
    category: 'ui-motion',
    tags: ['ui', 'dashboard', 'charts', 'data', 'saas'],
    useCases: ['SaaS launches', 'Investor updates', 'Analytics features', 'Monthly reports'],
  },
  formats: ['16:9', '1:1', '4:5', '9:16'],
  structure: 'in-hold-out',
  duration: { default: 7, min: 5, max: 12 },
  alpha: 'none',
  poster: 4.2,
  palettes: [
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'lilac' },
  ],
  pairings: ['grotesk', 'technical', 'editorial', 'mono'],
  // The UI Kit sets interface text in Inter, whatever the pairing.
  fonts: [UI_FONT],
  controls: {
    headline: c.text({
      label: 'Headline',
      default: 'See growth as it happens.',
      maxLength: 40,
      multiline: true,
      maxLines: 2,
      optional: true,
      primary: true,
    }),
    kpis: c.text({
      label: 'KPIs',
      default: 'Revenue €48.2k +12.4%\nActive users 8,431 +5.1%\nConversion 3.8% +0.6 pt',
      maxLength: 120,
      multiline: true,
      maxLines: 4,
      hint: 'One per line: label, value, change — e.g. Revenue €48.2k +12.4%',
    }),
    line: c.text({
      label: 'Line data',
      default: DEFAULT_LINE.join(', '),
      maxLength: 120,
      hint: 'Comma-separated numbers, charted under the first KPI',
    }),
    bars: c.text({
      label: 'Bar data',
      default: DEFAULT_BARS.join(', '),
      maxLength: 96,
      hint: 'Comma-separated numbers, charted under the second KPI (7 = a week)',
    }),
    donut: c.number({
      label: 'Donut value',
      group: 'content',
      default: 72,
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
    }),
    donutLabel: c.text({ label: 'Donut label', default: 'Monthly goal', maxLength: 24 }),
    theme: c.choice({
      label: 'Theme',
      default: 'light',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    }),
    density: c.choice({
      label: 'Density',
      default: 'comfortable',
      options: [
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'compact', label: 'Compact' },
      ],
    }),
  },
  looks: [
    {
      id: 'light-cobalt',
      name: 'Light · Cobalt',
      palette: { kind: 'library', id: 'cobalt' },
      pairing: 'grotesk',
      values: { theme: 'light' },
    },
    {
      id: 'dark-graphite',
      name: 'Dark · Graphite',
      palette: { kind: 'library', id: 'graphite' },
      pairing: 'grotesk',
      values: { theme: 'dark' },
    },
    {
      id: 'light-mint',
      name: 'Light · Mint',
      palette: { kind: 'library', id: 'mint' },
      pairing: 'grotesk',
      values: { theme: 'light' },
    },
  ],
  timing: ({ props }) => ({
    lead: 0.1,
    in: 2.4,
    out: 0.6,
    tail: CLEAN_END,
    readable: props.headline,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg } = palette.roles;
    const arrangement = ARRANGEMENTS[frame.format];
    const density = DENSITY[props.density];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const column = frame.vertical ? { x: frame.cx - half, w: half * 2 } : { x: area.x, w: area.w };

    // --- data -------------------------------------------------------------------------------
    let kpis = parseKpis(props.kpis);
    if (kpis.length < 2)
      kpis = [...kpis, ...parseKpis('Revenue €48.2k +12.4%\nActive users 8,431 +5.1%')].slice(0, 2);
    const lineValues = parseSeries(props.line) ?? DEFAULT_LINE;
    const barValues = parseSeries(props.bars, 2, 16) ?? DEFAULT_BARS;
    const donutValue = clamp01(props.donut / 100);

    // --- headline ---------------------------------------------------------------------------
    const headlineText = props.headline.trim();
    const headline: TextBlock | null = headlineText
      ? text.layout(headlineText, {
          style: {
            font: pairing.display.font,
            italicFont: pairing.display.italic,
            size: arrangement.headline * u,
            weight: pairing.display.weight,
            width: pairing.display.width,
            tracking: pairing.display.tracking,
            features: pairing.display.features,
          },
          maxWidth: column.w,
          maxLines: 2,
          lineHeight: Math.max(pairing.display.lineHeight, 1),
          align: 'left',
          fit: { minSize: arrangement.headline * u * 0.6 },
        })
      : null;
    const headGap = 3.6 * u;
    // Accents on capitals (Ö, Å) rise above the cap height: the headline's ink starts there.
    const headAbove = headline ? Math.max(0, -headline.ink.y) : 0;
    const headH = headline ? headAbove + headline.height + 0.24 * headline.size + headGap : 0;

    // --- grid (UI px) -----------------------------------------------------------------------
    const W = arrangement.width;
    const gap = density.gap;
    const pad = density.pad;
    const cols = arrangement.kpiCols(kpis.length);
    const kpiRows = Math.ceil(kpis.length / cols);
    const kpiW = (W - (cols - 1) * gap) / cols;
    const wideKpi = kpiW - 2 * pad >= 160;
    const valueSize = density.value;
    const CAP = 0.727;
    const kpiH = wideKpi
      ? pad * 2 + 13 * CAP + 14 + valueSize * CAP
      : pad * 2 + 13 * CAP + 13 + valueSize * CAP + 14 + 22;
    const rowsFixed = kpiRows * kpiH + (kpiRows - 1) * gap + arrangement.rows.length * gap;
    const minCharts = arrangement.minRow.reduce((a, b) => a + b, 0);
    let unit = column.w / W;
    let chartsH = (area.h - headH) / unit - rowsFixed;
    if (chartsH < minCharts) {
      unit = (area.h - headH) / (rowsFixed + minCharts);
      chartsH = minCharts;
    }
    chartsH = Math.min(chartsH, minCharts * 1.45);
    const weightSum = arrangement.weights.reduce((a, b) => a + b, 0);
    // Rows share the height by weight; a row held at its minimum leaves the rest to the others.
    const rowHeights = arrangement.weights.map((w) => (chartsH * w) / weightSum);
    for (let pass = 0; pass < rowHeights.length; pass++) {
      let fixed = 0;
      let free = 0;
      rowHeights.forEach((h, i) => {
        const min = arrangement.minRow[i] ?? 0;
        if (h <= min) fixed += min;
        else free += arrangement.weights[i] ?? 0;
      });
      rowHeights.forEach((h, i) => {
        const min = arrangement.minRow[i] ?? 0;
        rowHeights[i] =
          h <= min
            ? min
            : ((chartsH - fixed) * (arrangement.weights[i] ?? 0)) / Math.max(free, 1e-9);
      });
    }
    const gridH = rowsFixed + rowHeights.reduce((a, b) => a + b, 0);
    const gridW = W * unit;
    const blockH = headH + gridH * unit;
    const top = area.y + Math.max(0, (area.h - blockH) * 0.45);
    const gx = frame.vertical ? frame.cx - gridW / 2 : area.x;
    const gy = top + headH;
    const headlineX = gx;
    const headlineY = top + headAbove;

    const ui: UiKit = createUiKit({
      text,
      palette,
      mode: props.theme,
      unit,
      fallbackFont: pairing.text.font,
    });
    const { theme } = ui;
    const px = (v: number) => ui.px(v);
    const R = (x: number, y: number, w: number, h: number): Rect => ({
      x: gx + px(x),
      y: gy + px(y),
      w: px(w),
      h: px(h),
    });

    // --- cells ------------------------------------------------------------------------------
    const cards: CardMotion[] = [];
    const addCard = (rect: Rect) => {
      const motion = {
        order: cards.length,
        rect,
        card: ui.card(rect, { radius: density.radius, elevation: 1 }),
      };
      cards.push(motion);
      return motion;
    };

    const kpiRects = kpis.map((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return R(col * (kpiW + gap), row * (kpiH + gap), kpiW, kpiH);
    });
    const kpiCards = kpiRects.map(addCard);
    const cells: { kind: Exclude<CellKind, 'side'>; rect: Rect }[] = [];
    let y = kpiRows * (kpiH + gap);
    arrangement.rows.forEach((row, r) => {
      const h = rowHeights[r] ?? 0;
      const usable = W - (row.length - 1) * gap;
      let x = 0;
      for (const cell of row) {
        const w = usable * cell.share;
        if (cell.kind === 'side') {
          const each = (h - gap) / 2;
          cells.push({ kind: 'bars', rect: R(x, y, w, each) });
          cells.push({ kind: 'donut', rect: R(x, y + each + gap, w, each) });
        } else {
          cells.push({ kind: cell.kind, rect: R(x, y, w, h) });
        }
        x += w + gap;
      }
      y += h + gap;
    });
    // Grid order for the stagger: KPI row(s), then charts left to right, top to bottom.
    cells.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    const chartCards = new Map(
      cells.map((cell) => [cell.kind, { ...cell, motion: addCard(cell.rect) }]),
    );

    // --- KPI cards --------------------------------------------------------------------------
    type KpiView = {
      label: TextBlock;
      labelX: number;
      labelY: number;
      odometer: Odometer | null;
      valueBlock: TextBlock | null;
      valueX: number;
      baseline: number;
      pill: {
        rect: Rect;
        text: TextBlock;
        textX: number;
        textY: number;
        icon: 'arrowUp' | 'arrowDown' | null;
        iconX: number;
        fill: Color;
        ink: Color;
      } | null;
      kpi: Kpi;
    };
    const kpiViews: KpiView[] = kpis.map((kpi, i) => {
      const rect = kpiRects[i] as Rect;
      const inner = rect.w - 2 * px(pad);
      const x = rect.x + px(pad);
      const labelY = rect.y + px(pad);
      const label = ui.text(kpi.label, 'label', { maxWidth: inner, minSize: 10.5 });
      const valueTop = labelY + label.height + px(wideKpi ? 14 : 13);
      const style = ui.style('display', { size: valueSize, weight: 650, tracking: -0.02 });
      // Tabular digits sized so the final value fits (the count-up never reflows).
      const pillText = kpi.delta
        ? ui.text(kpi.delta, 'caption', { weight: 620, features: ['tnum'], size: 12 })
        : null;
      const pillW = pillText ? pillText.width + px(kpi.trend !== 0 ? 30 : 18) : 0;
      const valueRoom = wideKpi && pillText ? inner - pillW - px(10) : inner;
      let odometer: Odometer | null = null;
      let valueBlock: TextBlock | null = null;
      let valueWidth = 0;
      if (kpi.figure) {
        odometer = createOdometer(text, style);
        const final = formatFigure(kpi.figure);
        valueWidth = odometer.width(final);
        if (valueWidth > valueRoom) {
          odometer = createOdometer(text, {
            ...style,
            size: (style.size * valueRoom) / valueWidth,
          });
          valueWidth = odometer.width(final);
        }
        odometer.width(formatFigure(kpi.figure, 0));
      } else {
        valueBlock = ui.text(kpi.value, 'display', {
          size: valueSize,
          weight: 650,
          maxWidth: valueRoom,
          minSize: 14,
        });
        valueWidth = valueBlock.width;
      }
      const cap = odometer ? odometer.capHeight : (valueBlock?.capHeight ?? 0);
      const baseline = valueTop + cap;
      let pill: KpiView['pill'] = null;
      if (pillText) {
        const h = px(22);
        const pillX = wideKpi ? x + valueWidth + px(10) : x;
        const pillY = wideKpi ? baseline - h + px(2) : baseline + px(14);
        const good = kpi.trend >= 0;
        const tone = good ? theme.success : theme.danger;
        pill = {
          rect: { x: pillX, y: pillY, w: pillW, h },
          text: pillText,
          textX: pillX + px(kpi.trend !== 0 ? 22 : 9),
          textY: pillY + h / 2 - pillText.capHeight / 2,
          icon: kpi.trend > 0 ? 'arrowUp' : kpi.trend < 0 ? 'arrowDown' : null,
          iconX: pillX + px(13),
          fill: good ? theme.successSoft : theme.dangerSoft,
          ink: tone,
        };
      }
      return {
        label,
        labelX: x,
        labelY,
        odometer,
        valueBlock,
        valueX: x,
        baseline,
        pill,
        kpi,
      };
    });

    // --- line chart -------------------------------------------------------------------------
    const lineCell = chartCards.get('line');
    const hold = timeline.sections.hold;
    const holdLength = hold.end - hold.start;
    const firstLive = hold.start + Math.min(0.9, holdLength * 0.3);
    const LIVE = 0.75;
    const EVERY = 2.6;
    let liveCount = 0;
    if (holdLength >= 1.5) {
      for (let k = 0; k < 3; k++) {
        if (firstLive + k * EVERY + LIVE + 0.7 <= hold.end) liveCount++;
      }
    }
    const liveStarts = Array.from({ length: liveCount }, (_, k) => firstLive + k * EVERY);
    const liveRng = ctx.rng('live');
    const extra = continueSeries(lineValues, Math.max(1, liveCount), () => liveRng.next());
    const allValues = [...lineValues, ...extra.slice(0, liveCount)];
    const n = lineValues.length;
    const decimals = seriesDecimals(lineValues);
    const lineFigure = kpis[0]?.figure ?? null;
    const unitless = { prefix: '', value: 0, decimals, grouping: true, suffix: '' };
    const figured = lineFigure && (lineFigure.prefix.trim() || lineFigure.suffix.trim());
    // Values in the first KPI's units ("€58k"); zero stays a plain "€0".
    const formatValue = (v: number) =>
      figured && lineFigure
        ? v === 0
          ? `${lineFigure.prefix}0`
          : formatFigure({ ...lineFigure, decimals, grouping: true }, v)
        : formatFigure(unitless, v);

    const lineTitle = lineCell
      ? ui.text(kpis[0]?.label ?? 'Trend', 'title', {
          size: 15,
          maxWidth: lineCell.rect.w - 2 * px(pad),
          minSize: 11,
        })
      : null;
    let chart: LineChart | null = null;
    let plot: Rect = { x: 0, y: 0, w: 1, h: 1 };
    let axis: ReturnType<UiKit['valueAxis']> | null = null;
    let months: ReturnType<UiKit['categoryAxis']> | null = null;
    let areaFill: Gradient | null = null;
    let tooltips: UiTooltip[] = [];
    let peak = 0;
    let lastFraction = 1;
    let plotClip: Rect = plot;
    let tipSpan = { min: 0, max: frame.width };
    if (lineCell && lineTitle) {
      const rect = lineCell.rect;
      const plotTop = rect.y + px(pad) + lineTitle.height + px(22);
      const plotBottom = rect.y + rect.h - px(pad) - px(22);
      // Zero-based, with headroom above the peak for the tooltip; as many gridlines as the
      // height carries without crowding their labels.
      const plotH = (plotBottom - plotTop) / unit;
      const tickCount = plotH >= 150 ? 4 : plotH >= 70 ? 3 : 2;
      const ticks = niceTicks(0, Math.max(...allValues) * 1.12, tickCount);
      const provisional = ui.valueAxis({
        plot: { x: 0, y: 0, w: 1, h: 1 },
        ticks,
        format: formatValue,
      });
      const labelW = provisional.labelWidth;
      const plotX = rect.x + px(pad) + labelW + px(10);
      plot = {
        x: plotX,
        y: plotTop,
        w: rect.x + rect.w - px(pad) - px(6) - plotX,
        h: plotBottom - plotTop,
      };
      axis = ui.valueAxis({ plot, ticks, format: formatValue });
      chart = ui.lineChart({ plot, values: allValues, domain: ticks, span: n - 1 });
      areaFill = chart.areaFill(theme.accent, theme.dark ? 0.32 : 0.2);
      const labels = lineLabels(allValues.length);
      months = ui.categoryAxis({
        xs: chart.points.map((p) => p.x),
        y: plot.y + plot.h,
        labels: labels.map((label, i) => (n > 8 && i % 2 === 1 ? '' : label)),
      });
      for (let i = 1; i < n; i++) if ((lineValues[i] ?? 0) >= (lineValues[peak] ?? 0)) peak = i;
      tooltips = [peak, ...extra.slice(0, liveCount).map((_, k) => n + k)].map((index) =>
        ui.tooltip({ text: formatValue(allValues[index] ?? 0) }),
      );
      lastFraction = chart.sampler.fractionAtX(chart.points[n - 1]?.x ?? plot.x + plot.w);
      tipSpan = { min: rect.x + px(10), max: rect.x + rect.w - px(10) };
      plotClip = {
        x: plot.x - px(1),
        y: rect.y,
        w: plot.w + px(12),
        h: plot.y + plot.h - rect.y + px(8),
      };
    }

    // --- bars -------------------------------------------------------------------------------
    const barsCell = chartCards.get('bars');
    const barsTitle = barsCell
      ? ui.text(kpis[1]?.label ?? 'Activity', 'title', {
          size: 15,
          maxWidth: barsCell.rect.w - 2 * px(pad),
          minSize: 11,
        })
      : null;
    let bars: ReturnType<UiKit['barChart']> | null = null;
    let days: ReturnType<UiKit['categoryAxis']> | null = null;
    let barValueLabel: TextBlock | null = null;
    const barHighlight = barValues.length - 1;
    if (barsCell && barsTitle) {
      const rect = barsCell.rect;
      const plotTop = rect.y + px(pad) + barsTitle.height + px(26);
      const plotBottom = rect.y + rect.h - px(pad) - px(20);
      const barsPlot = {
        x: rect.x + px(pad),
        y: plotTop,
        w: rect.w - 2 * px(pad),
        h: Math.max(px(20), plotBottom - plotTop),
      };
      const maxBar = Math.max(...barValues);
      bars = ui.barChart({
        plot: barsPlot,
        values: barValues,
        domain: { min: 0, max: maxBar * 1.08 || 1 },
        gap: barValues.length > 10 ? 0.34 : 0.42,
        radius: 4,
      });
      days = ui.categoryAxis({
        xs: bars.bars.map((b) => b.x + b.w / 2),
        y: bars.baseline,
        labels: barLabels(barValues.length),
      });
      barValueLabel = ui.text(
        formatFigure(
          { prefix: '', value: 0, decimals: seriesDecimals(barValues), grouping: true, suffix: '' },
          barValues[barHighlight] ?? 0,
        ),
        'caption',
        { weight: 620, features: ['tnum'] },
      );
    }
    const barSoft = mixOklch(theme.accent, theme.surface, theme.dark ? 0.55 : 0.62);

    // --- donut ------------------------------------------------------------------------------
    const donutCell = chartCards.get('donut');
    const donutTitle = donutCell
      ? ui.text(props.donutLabel.trim() || ' ', 'title', {
          size: 15,
          maxWidth: donutCell.rect.w - 2 * px(pad),
          minSize: 11,
        })
      : null;
    let donut: ReturnType<UiKit['donut']> | null = null;
    let donutOdometer: Odometer | null = null;
    if (donutCell && donutTitle) {
      const rect = donutCell.rect;
      const top = rect.y + px(pad) + donutTitle.height + px(14);
      const bottom = rect.y + rect.h - px(pad);
      const room = Math.min(rect.w - 2 * px(pad), bottom - top);
      const ring = Math.max(px(6), Math.min(px(14), room * 0.1));
      const r = Math.max(px(10), room / 2 - ring / 2);
      donut = ui.donut({ cx: rect.x + rect.w / 2, cy: (top + bottom) / 2, r, width: ring / unit });
      const size = Math.min(26, (r * 0.62) / unit);
      donutOdometer = createOdometer(
        text,
        ui.style('display', { size, weight: 650, tracking: -0.02 }),
      );
      donutOdometer.width('0123456789%');
    }

    // --- editor regions -------------------------------------------------------------------
    const headlineBounds = headline
      ? {
          x: headline.ink.x + headlineX,
          y: headline.ink.y + headlineY,
          w: headline.ink.w,
          h: headline.ink.h,
        }
      : null;
    const gridRect: Rect = { x: gx, y: gy, w: gridW, h: gridH * unit };
    const kpiBounds = kpiRects.reduce((a, b) => ({
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
      h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
    }));

    // --- motion ---------------------------------------------------------------------------
    const cardGap = ctx.stagger(0.06);
    const exitGap = ctx.stagger(0.04);
    // Every card is gone by the end of the exit, however many there are.
    const exitDur = Math.max(0.25, 0.58 - (cards.length - 1) * exitGap);
    const cardCount = cards.length;
    const rise = ctx.travel(1.6 * u);
    const barGap = ctx.stagger(0.05);
    const barCurve: EaseName = energy.overshoot === 0 ? 'glide' : 'pop';
    const lineCurve: EaseName = energy.id === 'punchy' ? 'snap' : 'glide';
    const lineWidth = px(2.5);
    const dotR = px(4.5);
    const dotRing = px(2.5);
    const lineInk = theme.accentInk;
    const breathe = 0.35 * u;
    // Reused per frame.
    const areaClip: Rect = { x: 0, y: 0, w: 0, h: 0 };
    const head: Vec2 = { x: 0, y: 0 };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        const breath = win(t, hold.start, Math.max(0.01, holdLength), 'drift');
        const drift = -breathe * breath;

        // Headline: rises in first, leaves with the cards.
        if (headline && headlineBounds) {
          const p = tl.p(t, 'in', { dur: 0.7 }, energy.enter);
          const a = tl.p(t, 'in', { dur: 0.45 }, 'drift');
          const out = tl.p(t, 'out', { delay: 0.1, dur: 0.45 }, 'exit');
          const opacity = a * (1 - out);
          if (opacity > 0) {
            g.movable('headline', headlineBounds, (g) => {
              g.text(headline, {
                fill: fg,
                x: headlineX,
                y: headlineY + (1 - p) * rise + drift - out * rise * 0.6,
                opacity,
              });
              g.editable('headline', headlineBounds);
            });
          }
        }

        // Per card: appearance and exit (grid order in, reverse order out).
        const shown = (i: number) =>
          tl.p(t, 'in', { delay: 0.1 + i * cardGap, dur: 0.55 }, energy.enter);
        const faded = (i: number) =>
          tl.p(t, 'in', { delay: 0.1 + i * cardGap, dur: 0.35 }, 'drift');
        const gone = (i: number) =>
          tl.p(t, 'out', { delay: (cardCount - 1 - i) * exitGap, dur: exitDur }, 'exit');
        // Scaffolding (labels, gridlines, tracks) arrives with its card, data after it.
        const scaffold = (i: number) =>
          tl.p(t, 'in', { delay: 0.3 + i * cardGap, dur: 0.4 }, 'drift');

        const withCard = (motion: CardMotion, draw: (g: Draw, opacity: number) => void) => {
          const i = motion.order;
          const inP = shown(i);
          const opacity = faded(i) * (1 - gone(i));
          if (opacity <= 0) return;
          const { rect } = motion;
          const scale = (0.965 + 0.035 * inP) * (1 - 0.02 * gone(i));
          g.group(
            {
              y: (1 - inP) * rise + drift,
              scale,
              originX: rect.x + rect.w / 2,
              originY: rect.y + rect.h / 2,
              opacity,
            },
            (g) => {
              motion.card.draw(g);
              draw(g, scaffold(i));
            },
          );
        };

        g.movable('dashboard', gridRect, (g) => {
          // KPIs: labels first, then the values count up and the changes slide in.
          kpiViews.forEach((view, i) => {
            const motion = kpiCards[i] as CardMotion;
            withCard(motion, (g, sc) => {
              g.text(view.label, {
                fill: theme.muted,
                x: view.labelX,
                y: view.labelY,
                opacity: sc,
              });
              const count = tl.p(t, 'in', { delay: 0.8 + i * cardGap, dur: 1.2 }, 'glide');
              if (view.odometer && view.kpi.figure) {
                const value = formatFigure(view.kpi.figure, view.kpi.figure.value * count);
                view.odometer.draw(g, value, {
                  x: view.valueX,
                  y: view.baseline,
                  fill: theme.text,
                  opacity: sc,
                });
              } else if (view.valueBlock) {
                g.text(view.valueBlock, {
                  fill: theme.text,
                  x: view.valueX,
                  y: view.baseline - view.valueBlock.capHeight,
                  opacity: count,
                });
              }
              const pill = view.pill;
              if (pill) {
                const p = tl.p(t, 'in', { delay: 1.15 + i * cardGap, dur: 0.5 }, energy.enter);
                if (p > 0) {
                  g.group(
                    {
                      x: (1 - p) * -px(8),
                      opacity: tl.p(t, 'in', { delay: 1.15 + i * cardGap, dur: 0.3 }, 'drift'),
                    },
                    (g) => {
                      g.roundRect(pill.rect, pill.rect.h / 2, { fill: pill.fill });
                      if (pill.icon)
                        drawIcon(
                          g,
                          pill.icon,
                          pill.iconX,
                          pill.rect.y + pill.rect.h / 2,
                          px(12),
                          pill.ink,
                          { weight: 2.6 },
                        );
                      g.text(pill.text, { fill: pill.ink, x: pill.textX, y: pill.textY });
                    },
                  );
                }
              }
            });
          });

          // Line: gridlines and labels, then the line draws on with its area under it.
          const lineMotion = lineCell?.motion;
          if (lineMotion && chart && axis && months && lineTitle && areaFill) {
            withCard(lineMotion, (g, sc) => {
              const rect = lineMotion.rect;
              g.text(lineTitle, {
                fill: theme.text,
                x: rect.x + px(pad),
                y: rect.y + px(pad),
                opacity: sc,
              });
              axis.draw(g, sc);
              // Live updates: each scrolls the chart one step and draws the new segment on.
              let shift = 0;
              let moving = 0;
              for (let k = 0; k < liveCount; k++) {
                const q = win(t, liveStarts[k] as number, LIVE, 'snap');
                shift += q * chart.step;
                if (q > 0 && q < 1) moving = q;
              }
              const drawn = tl.p(t, 'in', { delay: 1.0, dur: 1.2 }, lineCurve);
              const endX = chart.plot.x + (n - 1 + shift / chart.step) * chart.step;
              const fraction = shift > 0 ? chart.sampler.fractionAtX(endX) : drawn * lastFraction;
              months.draw(g, sc, -shift, { x: plot.x, y: plot.y, w: plot.w, h: plot.h });
              const areaIn = tl.p(t, 'in', { delay: 1.25, dur: 1.0 }, 'drift');
              g.clip(plotClip, (g) => {
                g.group({ x: -shift }, (g) => {
                  if (fraction > 0) {
                    const end = chart.sampler.at(fraction);
                    head.x = end.x;
                    head.y = end.y;
                    if (areaIn > 0) {
                      areaClip.x = plot.x - px(2);
                      areaClip.y = plot.y - plot.h;
                      areaClip.w = Math.max(0, head.x - areaClip.x);
                      areaClip.h = plot.h * 2 + px(2);
                      g.clip(areaClip, (g) =>
                        g.path(chart.area, { fill: areaFill, opacity: areaIn }),
                      );
                    }
                    g.path(chart.line, {
                      stroke: {
                        color: lineInk,
                        width: lineWidth,
                        cap: 'round',
                        join: 'round',
                        trim: fraction < 0.9999 ? [0, fraction] : undefined,
                      },
                    });
                    // The head (and, at rest, the newest point) with a live pulse in the hold.
                    const pulse = t > hold.start ? ((t - hold.start) % 1.6) / 1.6 : 0;
                    if (pulse > 0 && moving === 0) {
                      g.circle(head.x, head.y, dotR + px(10) * ease.glide(pulse), {
                        fill: lineInk,
                        opacity: 0.22 * (1 - pulse),
                      });
                    }
                    g.circle(head.x, head.y, dotR, {
                      fill: lineInk,
                      stroke: { color: theme.surface, width: dotRing },
                    });
                  }
                });
              });
              // Tooltip: pops at the peak, then follows the newest value.
              const popped = tl.p(
                t,
                'in',
                { delay: 1.95, dur: 0.35 },
                energy.overshoot === 0 ? 'glide' : 'pop',
              );
              const tipIn = tl.p(t, 'in', { delay: 1.95, dur: 0.2 }, 'drift');
              if (tipIn > 0 && tooltips.length > 0) {
                const at = (index: number) => chart.points[index] as Vec2;
                let from = at(peak);
                let tip = 0;
                let q = 1;
                for (let k = 0; k < liveCount; k++) {
                  if (t >= (liveStarts[k] as number)) {
                    tip = k + 1;
                    from = k === 0 ? at(peak) : at(n - 1 + k);
                    q = springProgress(t - (liveStarts[k] as number), energy.spring);
                  }
                }
                const target = tip === 0 ? at(peak) : at(n - 1 + tip);
                const x = from.x + (target.x - from.x) * q - shift;
                const yy = from.y + (target.y - from.y) * q;
                const previous = tooltips[Math.max(0, tip - 1)] as UiTooltip;
                const current = tooltips[tip] as UiTooltip;
                const blend = tip === 0 ? 1 : clamp01(q * 1.6);
                if (tip > 0 && blend < 1) {
                  previous.draw(g, x, yy - dotR, tipIn * (1 - blend), 1, tipSpan);
                }
                current.draw(g, x, yy - dotR, tipIn * blend, 0.85 + 0.15 * popped, tipSpan);
              }
            });
          }

          // Bars: the baseline and labels first, then the bars grow in a wave.
          const barsMotion = barsCell?.motion;
          if (barsMotion && bars && days && barsTitle) {
            withCard(barsMotion, (g, sc) => {
              const rect = barsMotion.rect;
              g.text(barsTitle, {
                fill: theme.text,
                x: rect.x + px(pad),
                y: rect.y + px(pad),
                opacity: sc,
              });
              days.draw(g, sc);
              const count = bars.bars.length;
              const grow = (i: number) => {
                const delay = 1.2 + i * barGap * Math.min(1, 7 / count);
                return energy.id === 'punchy'
                  ? springProgress(t - tl.at('in', delay), 'lively')
                  : tl.p(t, 'in', { delay, dur: 0.55 }, barCurve);
              };
              bars.draw(g, grow, (i) => (i === barHighlight ? theme.accent : barSoft));
              const last = bars.bars[barHighlight];
              if (last && barValueLabel) {
                const shownLabel = tl.p(t, 'in', { delay: 1.9, dur: 0.35 }, 'drift');
                g.text(barValueLabel, {
                  fill: theme.muted,
                  x: last.x + last.w / 2 - (barValueLabel.ink.x + barValueLabel.ink.w / 2),
                  y: last.y - px(8) - barValueLabel.capHeight + (1 - shownLabel) * px(4),
                  opacity: shownLabel,
                });
              }
            });
          }

          // Donut: the track first, then the sweep while the percentage counts.
          const donutMotion = donutCell?.motion;
          if (donutMotion && donut && donutOdometer && donutTitle) {
            withCard(donutMotion, (g, sc) => {
              const rect = donutMotion.rect;
              g.text(donutTitle, {
                fill: theme.text,
                x: rect.x + px(pad),
                y: rect.y + px(pad),
                opacity: sc,
              });
              const sweep = tl.p(t, 'in', { delay: 1.4, dur: 1.0 }, 'glide');
              donut.draw(g, donutValue * sweep, theme.accent, { track: sc });
              const value = `${Math.round(props.donut * sweep)}%`;
              donutOdometer.draw(g, value, {
                x: donut.cx,
                y: donut.cy + donutOdometer.capHeight / 2,
                fill: theme.text,
                align: 'center',
                opacity: sc,
              });
            });
          }

          g.editable('kpis', kpiBounds);
          if (lineCell) g.editable('line', lineCell.rect);
          if (barsCell) g.editable('bars', barsCell.rect);
          if (donutCell) g.editable('donutLabel', donutCell.rect);
        });
      },
    };
  },
});
