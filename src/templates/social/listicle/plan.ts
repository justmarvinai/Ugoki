/**
 * Listicle's timing (docs/templates/03-social.md §3.3): a title card, one beat per item — a
 * 0.5 s transition, then a hold of 1.2 s + 0.06 s per character — and an optional CTA card,
 * laid out with `sequence`. Pace stretches the holds; Energy the transitions.
 */

import { CLEAN_END, type Sequence, sequence } from '@/engine';

export const PACES = { chill: 1.3, normal: 1, hyper: 0.75 } as const;
export type Pace = keyof typeof PACES;

/** Title card entrance (words rise), in Balanced seconds. */
export const TITLE_IN = 1.2;
/** Item and CTA transitions, in Balanced seconds. */
export const TRANSITION = 0.5;
/** The exit at the end, in Balanced seconds. */
export const OUT = 0.45;
export const TAIL = CLEAN_END;

export type Item = { readonly title: string; readonly detail: string };

/** One item per line; a detail may follow a `|` ("Ease out | Motion should decelerate"). */
export function parseItems(text: string): Item[] {
  return text
    .split('\n')
    .map((line) => {
      const bar = line.indexOf('|');
      const title = (bar < 0 ? line : line.slice(0, bar)).trim();
      const detail = bar < 0 ? '' : line.slice(bar + 1).trim();
      return { title, detail };
    })
    .filter((item) => item.title.length > 0);
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const characters = (text: string) => [...text.trim()].length;

/** Natural lengths (seconds): the title card, each item, the CTA card. */
function beats(title: string, items: readonly Item[], cta: string, pace: number, time: number) {
  const titleHold = Math.max(1, 0.24 * words(title)) * pace;
  const lengths = [TITLE_IN * time + titleHold];
  const holds = [titleHold];
  for (const item of items) {
    const hold = (1.2 + 0.06 * characters(`${item.title} ${item.detail}`)) * pace;
    lengths.push(TRANSITION * time + hold);
    holds.push(hold);
  }
  if (cta) {
    const hold = Math.max(1.2, 0.8 + 0.05 * characters(cta)) * pace;
    lengths.push(TRANSITION * time + hold);
    holds.push(hold);
  }
  return { lengths, holds };
}

/** Auto duration: every beat at its natural length, the exit and the clean tail. */
export function autoDuration(
  title: string,
  itemText: string,
  cta: string,
  pace: number,
  time: number,
): number {
  const { lengths } = beats(title, parseItems(itemText), cta.trim(), pace, time);
  return lengths.reduce((sum, length) => sum + length, 0) + OUT * time + TAIL;
}

export type Plan = {
  readonly beats: Sequence;
  /** Time scale of the transitions (1, or less when a short fixed duration squeezes them). */
  readonly speed: number;
};

/**
 * The beats laid out for a timeline of `duration` seconds: at Auto they keep their natural
 * lengths; a fixed duration stretches or shrinks the holds (transitions keep their timing), and
 * only a duration too short for readable holds speeds the transitions up too.
 */
export function planBeats(
  title: string,
  items: readonly Item[],
  cta: string,
  pace: number,
  time: number,
  duration: number,
): Plan {
  const { lengths, holds } = beats(title, items, cta, pace, time);
  const natural = lengths.reduce((sum, length) => sum + length, 0);
  const available = duration - OUT * time - TAIL;
  const held = holds.reduce((sum, hold) => sum + hold, 0);
  const moving = natural - held;
  if (Math.abs(natural - available) < 1e-6) return { beats: sequence(lengths), speed: 1 };
  const stretch = (available - moving) / held;
  if (stretch >= 0.35) {
    const stretched = lengths.map((length, i) => length - (holds[i] ?? 0) * (1 - stretch));
    return { beats: sequence(stretched), speed: 1 };
  }
  const speed = available / natural;
  return { beats: sequence(lengths.map((length) => length * speed)), speed };
}
