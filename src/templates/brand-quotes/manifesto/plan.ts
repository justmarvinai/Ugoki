/**
 * Manifesto's edit (docs/templates/06-brand-quotes.md §6.3). Each statement is on screen for
 * 1.2 s + 0.05 s per character (× Pace) — then shaped by the rhythm of an edited film: the
 * opening statement gets its full length, the middle ones tighten progressively (an
 * accelerando), the last one lands at full length, and the finale holds long. Cuts are placed
 * where no export frame's shutter straddles them, so a hard cut never blurs two statements
 * into one frame.
 */

import { CLEAN_END } from '@/engine';

export const PACES = { slow: 1.3, normal: 1, fast: 0.78 } as const;
export type Pace = keyof typeof PACES;

/** Background before the first statement cuts in. */
export const LEAD = 0.08;
/** The finale's fade to the page (Balanced seconds). */
export const OUT = 0.6;
export const TAIL = CLEAN_END;
/** The middle statements tighten by up to this share (the accelerando). */
const ACCELERANDO = 0.3;
/** The finale: logo and final line hold at least this long (× Pace). */
const FINALE = 2.4;
/** A fixed duration never squeezes a statement or the finale below these (seconds). */
const MIN_STATEMENT = 0.75;
const MIN_FINALE = 1.4;

/** A statement's text without its emphasis markup (`\*` stays a literal star). */
export function plain(statement: string): string {
  return statement
    .replace(/(?<!\\)\*/g, '')
    .replace(/\\\*/g, '*')
    .trim();
}

/** The statements: one per line that has something to show (markup kept for the layout). */
export function parseStatements(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => plain(line).length > 0);
}

/** How much of its natural length statement `i` of `n` gets: full, tighter, full again. */
export function rhythm(i: number, n: number): number {
  if (n <= 2 || i === 0 || i === n - 1) return 1;
  const through = i / (n - 1);
  return 1 - ACCELERANDO * through ** 0.8;
}

const characters = (text: string) => [...plain(text)].length;

/** Natural lengths (seconds): each statement, then the finale (0 when there is none). */
function natural(statements: readonly string[], finale: string | null, pace: number) {
  const n = statements.length;
  const lengths = statements.map(
    (statement, i) => (1.2 + 0.05 * characters(statement)) * pace * rhythm(i, n),
  );
  const hold = finale === null ? 0 : Math.max(FINALE, 1.4 + 0.045 * [...finale].length) * pace;
  return { lengths, hold };
}

/** Auto duration: the statements at their rhythm, the finale's hold and the fade. */
export function autoDuration(
  statements: readonly string[],
  finale: string | null,
  pace: number,
  time: number,
): number {
  const { lengths, hold } = natural(statements, finale, pace);
  return LEAD + lengths.reduce((sum, length) => sum + length, 0) + hold + OUT * time + TAIL;
}

// --- clean cuts ------------------------------------------------------------------------------

/** Export frame rates (docs/07-export.md §1), weighted: 60 and 30 matter most. */
const EXPORT_FPS = [60, 30, 50, 25, 24] as const;
const WEIGHT = [10, 10, 1, 1, 1] as const;
/** A cut this many frames from every frame is never straddled by a 180° shutter. */
const MARGIN = 0.255;
/** How far (seconds) a cut may move to find such a time. */
const REACH = 0.017;
const STEP = 0.0001;

/** The time near `t` that is cleanest to cut on at every export frame rate. */
export function cleanCut(t: number): number {
  let best = t;
  let bestScore = -1;
  let bestShift = Number.POSITIVE_INFINITY;
  const reach = Math.round(REACH / STEP);
  const center = Math.round(t / STEP);
  for (let k = -reach; k <= reach; k++) {
    const candidate = (center + k) * STEP;
    if (candidate <= 0) continue;
    let score = 0;
    for (let i = 0; i < EXPORT_FPS.length; i++) {
      const frames = candidate * (EXPORT_FPS[i] ?? 60);
      if (Math.abs(frames - Math.round(frames)) >= MARGIN) score += WEIGHT[i] ?? 1;
    }
    const shift = Math.abs(candidate - t);
    if (score > bestScore || (score === bestScore && shift < bestShift)) {
      best = candidate;
      bestScore = score;
      bestShift = shift;
    }
  }
  return best;
}

export type Plan = {
  /** When each statement starts (its cut), then when the finale starts. */
  readonly starts: readonly number[];
  /** When the finale starts fading out (the `out` section). */
  readonly fade: number;
  /** How much each statement's entrance is tightened (1 = full), following the rhythm. */
  readonly tempo: readonly number[];
};

/**
 * The edit for a timeline of `duration` seconds. At Auto every statement keeps its rhythm; a
 * fixed duration scales statements and finale alike (within readable minimums).
 */
export function planEdit(
  statements: readonly string[],
  finale: string | null,
  pace: number,
  time: number,
  duration: number,
): Plan {
  const n = statements.length;
  const { lengths, hold } = natural(statements, finale, pace);
  const fade = duration - TAIL - OUT * time;
  const available = Math.max(0.1, fade - LEAD);
  const parts = finale === null ? [...lengths] : [...lengths, hold];
  const mins = parts.map((_, i) => (i < n ? MIN_STATEMENT : MIN_FINALE));
  // Scale to the available time; pieces that hit their minimum stay there, the rest absorb.
  let scaled = parts.slice();
  const total = parts.reduce((sum, length) => sum + length, 0);
  if (total > 0 && Math.abs(total - available) > 1e-6) {
    const fixed = new Array(parts.length).fill(false);
    for (let pass = 0; pass < 3; pass++) {
      const free = parts.reduce((sum, length, i) => (fixed[i] ? sum : sum + length), 0);
      const taken = scaled.reduce((sum, length, i) => (fixed[i] ? sum + length : sum), 0);
      const k = free > 0 ? Math.max(0, available - taken) / free : 0;
      let changed = false;
      scaled = parts.map((length, i) => {
        if (fixed[i]) return scaled[i] ?? length;
        const value = length * k;
        if (value < (mins[i] ?? 0)) {
          fixed[i] = true;
          changed = true;
          return mins[i] ?? 0;
        }
        return value;
      });
      if (!changed) break;
    }
    // Still too long (a very short fixed duration): squeeze everything proportionally.
    const sum = scaled.reduce((acc, length) => acc + length, 0);
    if (sum > available) scaled = scaled.map((length) => (length * available) / sum);
  }
  const starts: number[] = [];
  let cursor = LEAD;
  for (let i = 0; i < scaled.length; i++) {
    const previous = starts[starts.length - 1];
    const at = cleanCut(cursor);
    starts.push(previous === undefined ? at : Math.max(at, previous + 1 / 30));
    cursor += scaled[i] ?? 0;
  }
  if (finale === null) starts.push(fade);
  const tempo = statements.map((_, i) => Math.sqrt(rhythm(i, n)));
  return { starts, fade, tempo };
}
