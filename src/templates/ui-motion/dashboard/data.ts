/**
 * Dashboard data: KPIs written the way people write them ("Revenue €48.2k +12.4%"), number
 * series from comma-separated text, a plausible live continuation for the line, and axis
 * labels (months, weekdays).
 */

import { type Figure, parseFigure } from '@/engine';

export type Kpi = {
  label: string;
  /** The value as written, e.g. "€48.2k". */
  value: string;
  figure: Figure | null;
  /** The change as written, e.g. "+12.4%" (empty when there is none). */
  delta: string;
  /** Direction of the change: up (good), down, or none. */
  trend: 1 | -1 | 0;
};

/** A change at the end of a line: a sign, a number and an optional unit ("+12.4%", "−2 pt"). */
const DELTA = /\s([+\-−–]\s?\d[\d.,]*\s?(?:%|pts?|pp|x|×|[a-zA-Z€$£]{0,3})?)\s*$/u;
/** The value: the last token that holds a digit. */
const VALUE = /(\S*\d\S*)\s*$/u;

/**
 * One KPI per line: `label value change`, parsed from the right (so labels may contain
 * numbers, like "Q3 revenue €1.2M +8%"), or with `|` separators: `label | value | change`.
 */
export function parseKpis(text: string, max = 4): Kpi[] {
  const kpis: Kpi[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let label = line;
    let value = '';
    let delta = '';
    if (line.includes('|')) {
      const parts = line.split('|').map((part) => part.trim());
      label = parts[0] ?? '';
      value = parts[1] ?? '';
      delta = parts[2] ?? '';
    } else {
      const d = DELTA.exec(` ${line}`);
      let rest = ` ${line}`;
      if (d?.[1]) {
        delta = d[1].replace(/\s+/g, ' ').trim();
        rest = rest.slice(0, d.index);
      }
      const v = VALUE.exec(rest);
      if (v?.[1] && v.index > 0) {
        value = v[1];
        label = rest.slice(0, v.index).trim();
      } else {
        label = rest.trim();
      }
    }
    const sign = delta.trim()[0];
    const trend = sign === '+' ? 1 : sign === '-' || sign === '−' || sign === '–' ? -1 : 0;
    kpis.push({
      label: label || value || '—',
      value: value || '—',
      figure: value ? parseFigure(value) : null,
      delta: delta.replace(/^-/, '−'),
      trend,
    });
    if (kpis.length >= max) break;
  }
  return kpis;
}

/** Numbers from text ("12, 18, 15" or "12 18 15"), at most `max`; null for fewer than `min`. */
export function parseSeries(text: string, min = 2, max = 24): number[] | null {
  const values = text
    .split(/[,;\s]+/)
    .filter((token) => /\d/.test(token))
    .map((token) => Number(token.replace(/[^\d.\-−]/g, '').replace('−', '-')))
    .filter((v) => Number.isFinite(v) && v >= 0)
    .slice(0, max);
  return values.length >= min ? values : null;
}

/** Decimals the series is written with (0 for whole numbers, up to 2). */
export function seriesDecimals(values: readonly number[]): number {
  let decimals = 0;
  for (const v of values) {
    const fraction = String(v).split('.')[1];
    if (fraction) decimals = Math.max(decimals, Math.min(2, fraction.length));
  }
  return decimals;
}

/**
 * The next values of a trend, for the live update: the recent slope, eased a little each step,
 * with seeded wobble; never negative; rounded like the data.
 */
export function continueSeries(
  values: readonly number[],
  count: number,
  random: () => number,
): number[] {
  const n = values.length;
  const last = values[n - 1] ?? 0;
  const window = Math.min(3, n - 1);
  let slope = 0;
  for (let i = n - window; i < n; i++) slope += (values[i] ?? 0) - (values[i - 1] ?? 0);
  slope = window > 0 ? slope / window : 0;
  const range = Math.max(...values) - Math.min(...values) || Math.abs(last) || 1;
  const decimals = seriesDecimals(values);
  const round = (v: number) => Number(Math.max(0, v).toFixed(decimals));
  const out: number[] = [];
  let current = last;
  for (let i = 0; i < count; i++) {
    const wobble = (random() - 0.35) * range * 0.06;
    current = round(current + slope * 0.75 ** i + wobble);
    out.push(current);
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Labels for the line's points: months (wrapping), or numbers for long series. */
export function lineLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    count <= 26 ? (MONTHS[i % 12] as string) : String(i + 1),
  );
}

/** Labels for bars: weekdays for a week, months for up to a year, else numbers. */
export function barLabels(count: number): string[] {
  if (count === 7) return DAYS.slice();
  if (count <= 12) return MONTHS.slice(0, count).map((m) => m[0] as string);
  return Array.from({ length: count }, (_, i) => String(i + 1));
}
