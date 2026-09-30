/**
 * Departures' board layout: a grid of flap modules filling the layout width — a larger title
 * row on top, then one entry per row: destination, time and status side by side where the
 * format is wide enough, destination and time/status (one field) in narrower formats, or
 * destination over time/status when stacking makes the modules markedly bigger.
 */

import { breakTitle, padTo, type Row } from './board';

/** Module width as a share of its pitch (the rest is the gap between modules). */
export const MODULE = 0.88;
/** Module height / width. */
export const ASPECT = 1.42;
/** Gap between lines of modules, as a share of the module height. */
const LINE_GAP = 0.16;
/** Extra gap between stacked entries, as a share of the module height. */
const ENTRY_GAP = 0.55;
/** Gap between column groups (destination · time · status), in pitches. */
const GROUP = 0.75;
/** Gap between the title and the rows, as a share of a row module's height. */
const TITLE_GAP = 1.05;
/** The title's modules are at least this much larger than the rows'. */
const TITLE_MIN = 1.25;

export type Kind = 'wide' | 'row' | 'stack';

type FieldKey = 'dest' | 'time' | 'status' | 'field';
type Field = { key: FieldKey; width: number; align: 'left' | 'right' };

/** One module: its top-left corner, what it shows once the board has flipped in. */
export type Cell = { x: number; y: number; title: boolean; char: string };

/** The modules of an entry's time/status field — the ones that flip during the hold. */
export type StatusField = {
  cells: number[];
  align: 'left' | 'right';
  /** What the field shows at rest, and what it flips to (and back). */
  rest: string;
  alternate: string;
};

export type Board = {
  kind: Kind;
  /** Row module pitch and size; title module pitch and size (design units). */
  pitch: number;
  w: number;
  h: number;
  titlePitch: number;
  titleW: number;
  titleH: number;
  cells: Cell[];
  titleCells: number;
  /** Index of the first cell of each entry (and of the cells after the last one). */
  entries: number[];
  status: StatusField[];
  bounds: { x: number; y: number; w: number; h: number };
  titleBounds: { x: number; y: number; w: number; h: number };
  rowsBounds: { x: number; y: number; w: number; h: number };
};

export const BOARDING = 'BOARDING';
export const ON_TIME = 'ON TIME';

const len = (text: string) => [...text].length;

function linesOf(kind: Kind, dest: number, time: number, status: number): Field[][] {
  const field = Math.max(time, status);
  if (kind === 'wide') {
    return [
      [
        { key: 'dest', width: dest, align: 'left' },
        { key: 'time', width: time, align: 'right' },
        { key: 'status', width: status, align: 'left' },
      ],
    ];
  }
  if (kind === 'row') {
    return [
      [
        { key: 'dest', width: dest, align: 'left' },
        { key: 'field', width: field, align: 'right' },
      ],
    ];
  }
  return [
    [{ key: 'dest', width: dest, align: 'left' }],
    [{ key: 'field', width: field, align: 'left' }],
  ];
}

/** A line's width in pitches: its modules, the group gaps, less the last module's gap. */
const units = (line: Field[]) =>
  line.reduce((sum, field) => sum + field.width, 0) + (line.length - 1) * GROUP - (1 - MODULE);

export type Area = { x: number; y: number; w: number; h: number };

/** Lays out the board of `kind` in `area` (null when the kind can't hold the rows). */
export function layoutBoard(
  kind: Kind,
  rows: readonly Row[],
  title: string,
  area: Area,
  options: { titleMax: number; titleLines: number; place: number },
): Board {
  const dest = Math.max(6, ...rows.map((row) => len(row.dest)));
  const time = Math.max(5, ...rows.map((row) => len(row.time)));
  const status = Math.max(BOARDING.length, ...rows.map((row) => len(row.status)));
  const natural = linesOf(kind, dest, time, status);
  const perEntry = natural.length;
  const widest = Math.max(...natural.map(units));

  // Row modules as large as the width allows; the title at least TITLE_MIN× larger.
  let pitch = area.w / widest;
  const hasTitle = title.trim().length > 0;
  const titleOptions = hasTitle
    ? [1, 2, 3].filter((n) => n <= options.titleLines).map((n) => breakTitle(title, n))
    : [];
  const titleFor = (p: number) => {
    let best: { lines: string[]; pitch: number } = { lines: [], pitch: p };
    for (const lines of titleOptions) {
      const longest = Math.max(1, ...lines.map(len));
      const tp = Math.min(options.titleMax * p, (area.w + (1 - MODULE) * p) / longest);
      if (best.lines.length === 0 || tp > best.pitch + 1e-6) best = { lines, pitch: tp };
      if (tp >= TITLE_MIN * p) return { lines, pitch: tp };
    }
    return best;
  };
  let head = titleFor(pitch);
  if (hasTitle && head.pitch < TITLE_MIN * pitch) {
    pitch = head.pitch / TITLE_MIN;
    head = titleFor(pitch);
  }

  const heightAt = (p: number, tp: number, titleLines: number) => {
    const h = p * MODULE * ASPECT;
    const th = tp * MODULE * ASPECT;
    const lines = rows.length * perEntry;
    const rowsH =
      lines * h +
      (lines - rows.length) * LINE_GAP * h +
      (rows.length - 1) * (perEntry > 1 ? ENTRY_GAP + LINE_GAP : LINE_GAP) * h;
    const titleH = titleLines * th + Math.max(0, titleLines - 1) * LINE_GAP * th;
    const gap = titleLines > 0 && rows.length > 0 ? TITLE_GAP * h : 0;
    return { rowsH, titleH, gap, total: titleH + gap + rowsH };
  };
  let size = heightAt(pitch, head.pitch, head.lines.length);
  if (size.total > area.h) {
    const k = area.h / size.total;
    pitch *= k;
    head = { lines: head.lines, pitch: head.pitch * k };
    size = heightAt(pitch, head.pitch, head.lines.length);
  }

  const w = pitch * MODULE;
  const h = w * ASPECT;
  // Lines fill the width: extra modules widen the destination (or pad a stacked line).
  const across = (area.w + (1 - MODULE) * pitch) / pitch;
  const lines = natural.map((line) => {
    const extra = Math.max(0, Math.floor(across - units(line) - (1 - MODULE) + 1e-6));
    return line.map((field, i) =>
      i === 0 ? { ...field, width: field.width + extra } : { ...field },
    );
  });
  const boardW = Math.max(...lines.map(units)) * pitch;
  const left = area.x + (area.w - boardW) / 2;

  // Title: lines of large modules exactly as wide as the board, the text flush left.
  const longest = Math.max(1, ...head.lines.map(len));
  const titleCols = Math.max(
    longest,
    Math.floor((boardW + (1 - MODULE) * head.pitch) / head.pitch + 1e-6),
  );
  const titleStep = boardW / (titleCols - (1 - MODULE));
  const tw = titleStep * MODULE;
  const th = tw * ASPECT;
  size = heightAt(pitch, titleStep, head.lines.length);
  const top = area.y + Math.max(0, area.h - size.total) * options.place;

  const cells: Cell[] = [];
  head.lines.forEach((line, i) => {
    padTo(line, titleCols, 'left').forEach((char, col) => {
      cells.push({
        x: left + col * titleStep,
        y: top + i * th * (1 + LINE_GAP),
        title: true,
        char,
      });
    });
  });
  const titleCells = cells.length;

  const entries: number[] = [];
  const statusFields: StatusField[] = [];
  let y = top + size.titleH + size.gap;
  rows.forEach((row, r) => {
    entries.push(cells.length);
    const fieldText = (key: FieldKey) =>
      key === 'dest'
        ? row.dest
        : key === 'time'
          ? row.time
          : key === 'status'
            ? row.status || (r === 0 ? BOARDING : ON_TIME)
            : row.time || row.status;
    lines.forEach((line, l) => {
      let x = left;
      line.forEach((field) => {
        const text = fieldText(field.key);
        const chars = padTo(text, field.width, field.align);
        const start = cells.length;
        chars.forEach((char, col) => {
          cells.push({ x: x + col * pitch, y, title: false, char });
        });
        const flips = kind === 'wide' ? field.key === 'status' : field.key === 'field';
        if (flips) {
          // The field flips to the row's own status (in a narrow board, where only one of time
          // and status shows) or between BOARDING and ON TIME.
          const own = field.key === 'field' && row.time && row.status ? row.status : '';
          statusFields.push({
            cells: Array.from({ length: field.width }, (_, k) => start + k),
            align: field.align,
            rest: text,
            alternate: own || (text === BOARDING ? ON_TIME : BOARDING),
          });
        }
        x += field.width * pitch + GROUP * pitch;
      });
      y += h * (1 + LINE_GAP);
      if (l === lines.length - 1 && perEntry > 1) y += ENTRY_GAP * h;
    });
  });
  entries.push(cells.length);

  return {
    kind,
    pitch,
    w,
    h,
    titlePitch: titleStep,
    titleW: tw,
    titleH: th,
    cells,
    titleCells,
    entries,
    status: statusFields,
    bounds: { x: left, y: top, w: boardW, h: size.total },
    titleBounds: { x: left, y: top, w: boardW, h: size.titleH },
    rowsBounds: { x: left, y: top + size.titleH + size.gap, w: boardW, h: size.rowsH },
  };
}
