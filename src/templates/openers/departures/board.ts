/**
 * Departures' board model: the rows parsed from the text, the character wheel of the flaps, and
 * each module's flip schedule — seeded cycling along the wheel, with a tiny seeded latency and
 * rate per module, like real mechanics.
 */

import { type Rng, stepped } from '@/engine';

/**
 * The order printed on a flap wheel. A module only ever turns forward, so on its way to a
 * character it shows the characters just before it on the wheel (… Q R S T) — and on its way
 * to blank, the last ones (… - / blank).
 */
export const WHEEL: readonly string[] = [...' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-/'];
const WHEEL_INDEX = new Map(WHEEL.map((char, i) => [char, i]));

export type Row = { dest: string; time: string; status: string };

const collapse = (text: string) => text.trim().replace(/\s+/g, ' ');

/**
 * One row per line: the destination, then a time (the last word, when it has a digit) —
 * `TOKYO 09:40`. A `|` separates fields explicitly: `TOKYO | 09:40 | DELAYED`.
 */
export function parseRows(text: string): Row[] {
  const rows: Row[] = [];
  for (const raw of text.split('\n')) {
    const line = collapse(raw.toLocaleUpperCase('en'));
    if (!line.replace(/\|/g, '').trim()) continue;
    if (line.includes('|')) {
      const [dest = '', time = '', status = ''] = line.split('|').map(collapse);
      rows.push({ dest, time, status });
      continue;
    }
    const words = line.split(' ');
    const last = words[words.length - 1] ?? '';
    if (words.length > 1 && /\d/.test(last)) {
      rows.push({ dest: words.slice(0, -1).join(' '), time: last, status: '' });
    } else {
      rows.push({ dest: line, time: '', status: '' });
    }
  }
  return rows;
}

/** A run of flips: from `chars[0]` through each character to the last, `period` apart. */
export type Segment = { start: number; period: number; chars: readonly string[] };

/** A module's state at a moment: at rest (`phase` 0, `from` = `to`), or flipping. */
export type FlapState = { from: string; to: string; phase: number; landed: number };

/**
 * The characters a module shows on its way from `from` to `to`: `count` characters just before
 * `to` on the wheel (blank skipped), then `to`. With `turning`, the module turns from where it
 * rests, so it passes at most the characters between `from` and `to`. Characters that aren't
 * on the wheel (Ä, Ø, Ł…) are reached through their base letter.
 */
export function cycle(
  from: string,
  to: string,
  count: number,
  rng: Rng,
  turning = false,
): string[] {
  if (from === to) return [from];
  const base = to.normalize('NFD')[0] ?? to;
  const index = WHEEL_INDEX.get(to) ?? WHEEL_INDEX.get(base);
  const chars = [from];
  if (index === undefined) {
    for (let i = 0; i < count; i++) chars.push(WHEEL[1 + Math.floor(rng.next() * 26)] ?? 'A');
    chars.push(to);
    return chars;
  }
  const start = WHEEL_INDEX.get(from);
  const n = WHEEL.length;
  const distance = turning && start !== undefined ? (index - start + n) % n : n;
  const passed: string[] = [];
  for (let k = 1; k < distance && passed.length < count; k++) {
    const char = WHEEL[(index - k + n) % n] ?? ' ';
    if (char !== ' ' && char !== from) passed.unshift(char);
  }
  chars.push(...passed);
  if (WHEEL[index] !== to) chars.push(WHEEL[index] ?? ' ');
  chars.push(to);
  return chars;
}

/** A module: where it sits, what it shows at rest before any flip, and its flip runs. */
export type Module = {
  x: number;
  y: number;
  title: boolean;
  initial: string;
  segments: Segment[];
};

/** Where a module stands at time `t` (segments are sorted by start and never overlap). */
export function flapAt(module: Module, t: number, out: FlapState): FlapState {
  let char = module.initial;
  out.phase = 0;
  out.landed = Number.POSITIVE_INFINITY;
  for (const segment of module.segments) {
    if (t < segment.start) break;
    const flips = segment.chars.length - 1;
    const local = t - segment.start;
    // The mechanism's cadence: one flip per period, on a stepped clock.
    const rate = 1 / segment.period;
    const step = Math.round(stepped(local, rate) * rate);
    if (step >= flips) {
      char = segment.chars[flips] ?? char;
      out.landed = local - flips * segment.period;
      continue;
    }
    out.from = segment.chars[step] ?? char;
    out.to = segment.chars[step + 1] ?? char;
    out.phase = local / segment.period - step;
    out.landed = Number.POSITIVE_INFINITY;
    return out;
  }
  out.from = char;
  out.to = char;
  return out;
}

/** The last character a module shows once all its segments have run. */
export function finalChar(module: Module): string {
  const last = module.segments[module.segments.length - 1];
  return last ? (last.chars[last.chars.length - 1] ?? module.initial) : module.initial;
}

/** The end of a module's last flip. */
export function settledAt(module: Module): number {
  let end = 0;
  for (const segment of module.segments) {
    end = Math.max(end, segment.start + (segment.chars.length - 1) * segment.period);
  }
  return end;
}

/** Pads or trims `text` to `width` cells, aligned left or right. */
export function padTo(text: string, width: number, align: 'left' | 'right'): string[] {
  const chars = [...text].slice(0, width);
  const pad = Array.from({ length: width - chars.length }, () => ' ');
  return align === 'left' ? [...chars, ...pad] : [...pad, ...chars];
}

/** Breaks a title into at most `lines` lines of about equal length (never inside a word). */
export function breakTitle(title: string, lines: number): string[] {
  const words = collapse(title).split(' ').filter(Boolean);
  if (lines <= 1 || words.length <= 1) return [words.join(' ')];
  let best: string[] = [words.join(' ')];
  let bestWidth = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const width = Math.max([...a].length, [...b].length);
    // Prefer breaking after punctuation ("NEXT STOP: / EVERYWHERE").
    const bonus = /[:,.;!?–—-]$/.test(a) ? 1.5 : 0;
    if (width - bonus < bestWidth) {
      best = [a, b];
      bestWidth = width - bonus;
    }
  }
  return best;
}
