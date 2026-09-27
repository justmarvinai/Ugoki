/**
 * Typing: what a field shows after each keystroke, when each key lands (a seeded, human
 * cadence — not a metronome) and a caret that stays solid while typing and blinks when idle.
 */

import { clamp, clamp01, smoothstep } from '../core/math';
import type { Rng } from '../core/rng';
import { formatFigure, parseFigure } from '../text/figures';

export type Typed = {
  /** What the field shows after 0, 1, 2… keystrokes (`states[0]` is empty). */
  readonly states: readonly string[];
  /** The key pressed to reach each state after the first (`keys[i]` → `states[i + 1]`). */
  readonly keys: readonly string[];
  /** Placeholder shown while the field is empty. */
  readonly placeholder: string;
};

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Plain text typed grapheme by grapheme. */
export function typedText(value: string, placeholder = ''): Typed {
  const keys = [...graphemes.segment(value)].map((s) => s.segment);
  const states = [''];
  let text = '';
  for (const key of keys) {
    text += key;
    states.push(text);
  }
  return { states, keys, placeholder };
}

/**
 * A written number typed digit by digit and formatted live, the way money inputs behave:
 * "€250.00" shows €2 → €25 → €250 → €250. → €250.0 → €250.00 (and "€1,200" groups as it
 * grows); the placeholder is the figure at zero (€0.00). Null when `value` has no number.
 */
export function typedFigure(value: string): Typed | null {
  const figure = parseFigure(value);
  if (!figure) return null;
  const whole = Math.trunc(figure.value);
  const fraction = figure.decimals > 0 ? figure.value.toFixed(figure.decimals).split('.')[1] : '';
  const digits = String(whole);
  const integer = { ...figure, decimals: 0, suffix: '' };
  const keys: string[] = [];
  const states = [''];
  for (let i = 1; i <= digits.length; i++) {
    keys.push(digits[i - 1] as string);
    states.push(formatFigure(integer, Number(digits.slice(0, i))));
  }
  const head = formatFigure(integer, whole);
  if (fraction) {
    keys.push('.');
    states.push(`${head}.`);
    for (let i = 1; i <= fraction.length; i++) {
      keys.push(fraction[i - 1] as string);
      states.push(`${head}.${fraction.slice(0, i)}`);
    }
  }
  const full = formatFigure(figure);
  if (figure.suffix.trim()) {
    keys.push(figure.suffix.trim());
    states.push(full);
  } else if (states[states.length - 1] !== full) {
    states[states.length - 1] = full;
  }
  return { states, keys, placeholder: formatFigure(figure, 0) };
}

export type TypingOptions = {
  /** Mean keystrokes per second (default 11: a quick, confident typist). */
  cps?: number;
  /** Spread of each interval (lognormal σ, default 0.28). */
  jitter?: number;
  /** Mean extra pause before a new word, seconds (default 0.07). */
  wordPause?: number;
  /** Scales the schedule so the last key lands exactly `fit` seconds after the first. */
  fit?: number;
};

const isSpace = (key: string) => /^\s+$/.test(key);
const isShifted = (key: string) => /[A-Z@#$%&*()?!:"€£¥+]/.test(key);

/**
 * When each key lands, in seconds after the first (which is 0). Intervals vary around the mean
 * (lognormal), quick bursts and small hesitations happen, new words start after a short pause
 * and shifted characters take a beat longer — seeded, so every render agrees.
 */
export function typingSchedule(
  keys: readonly string[],
  rng: Rng,
  options: TypingOptions = {},
): Float64Array {
  const base = 1 / (options.cps ?? 11);
  const jitter = options.jitter ?? 0.28;
  const wordPause = options.wordPause ?? 0.07;
  const times = new Float64Array(keys.length);
  let t = 0;
  for (let i = 1; i < keys.length; i++) {
    const key = keys[i] as string;
    const previous = keys[i - 1] as string;
    let interval = base * clamp(Math.exp(rng.gauss(jitter)), 0.45, 2.4);
    if (rng.chance(0.22)) interval *= 0.62; // a practised bigram
    if (isSpace(previous) && !isSpace(key)) interval += wordPause * rng.range(0.6, 1.5);
    if (isShifted(key)) interval += base * 0.35;
    if (i > 2 && rng.chance(0.05)) interval += rng.range(0.1, 0.2); // a small hesitation
    t += interval;
    times[i] = t;
  }
  if (options.fit !== undefined && t > 0) {
    const k = Math.max(0, options.fit) / t;
    for (let i = 0; i < times.length; i++) times[i] = (times[i] as number) * k;
  }
  return times;
}

/** Keys typed by `local` seconds after the first key time (0 before it). */
export function typedCount(times: ArrayLike<number>, local: number): number {
  if (times.length === 0 || local < (times[0] as number)) return 0;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((times[mid] as number) <= local) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Caret opacity at `t`: solid for `idle` seconds after the last activity (focus or keystroke),
 * then blinking with `period` (on half, off half, 60 ms soft edges so motion blur never
 * strobes).
 */
export function caretOpacity(
  t: number,
  lastActivity: number,
  options: { period?: number; idle?: number } = {},
): number {
  const since = t - lastActivity;
  if (since < 0) return 0;
  const idle = options.idle ?? 0.5;
  if (since < idle) return 1;
  const period = options.period ?? 1.06;
  const phase = ((since - idle) / period) % 1;
  const edge = 0.06 / period;
  // Off in the second half, with soft edges.
  const off = smoothstep(0.5 - edge, 0.5, phase) * (1 - smoothstep(1 - edge, 1, phase));
  return clamp01(1 - off);
}
