/**
 * Scroll's tour (docs/templates/10-ui-motion.md §10.3): where the page stops for each caption,
 * and when the finger flicks, the page settles, and each caption shows and hides — fitted into
 * the hold at human speed.
 */

import { clamp, type EnergyId, InertialScroll, readingTime, type ScreenKind } from '@/engine';

export type Caption = {
  text: string;
  /** Where on the page it stops (0..1 of the scroll range), from a trailing "@ 60%". */
  at: number | null;
};

const POSITION = /\s*@\s*(\d{1,3}(?:\.\d+)?)\s*%\s*$/;

/** One caption per non-empty line (at most four); "@ 60%" at the end sets its stop. */
export function parseCaptions(value: string): Caption[] {
  const captions: Caption[] = [];
  for (const raw of value.split('\n')) {
    const match = raw.match(POSITION);
    const text = (match ? raw.slice(0, match.index) : raw).trim();
    if (!text) continue;
    captions.push({ text, at: match ? clamp(Number(match[1]) / 100, 0, 1) : null });
    if (captions.length === 4) break;
  }
  return captions;
}

/** The spots each built-in screen tours, in order (anchor ids of `Screen`). */
export const TOURS: Record<ScreenKind, readonly string[]> = {
  feed: ['week', 'insights', 'share', 'post'],
  finance: ['balance', 'spending', 'activity', 'goals'],
  analytics: ['kpis', 'trend', 'sessions', 'channels'],
  chat: ['thread', 'image', 'reply', 'typing'],
  settings: ['profile', 'preferences', 'general', 'support'],
};

/** A stop: the scroll offset (UI px) and the page point the caption's connector points at. */
export type Stop = { scroll: number; x: number; y: number };

/** Flick physics and pacing per energy. */
export const FLICKS: Record<EnergyId, { tau: number; drag: number; read: number }> = {
  calm: { tau: 0.4, drag: 0.16, read: 1.15 },
  balanced: { tau: 0.325, drag: 0.12, read: 1 },
  punchy: { tau: 0.27, drag: 0.1, read: 0.9 },
};

/**
 * Time constants into a glide when its caption starts to reveal: the page is 92% there, and the
 * connector's dot rides the rest of the glide on the page.
 */
const REVEAL_AT = Math.log(1 / 0.08);
/** Seconds a caption takes to clear before the next flick. */
export const HIDE = 0.28;

export type Beat = {
  /** The flick that brings this stop in (null: already in view). */
  flick: { start: number; release: number } | null;
  /** When the caption begins to reveal, and when it begins to hide (null: stays). */
  reveal: number;
  hide: number | null;
};

export type Tour = { scroll: InertialScroll; beats: Beat[] };

/**
 * Plans the tour inside the hold [start, end]: each caption gets a flick to its stop (unless the
 * page is already there) and a pause to read it; the last caption stays until the exit. When
 * the last stop is the end of the page the throw runs past it and rubber-bands.
 */
export function planTour(
  stops: readonly Stop[],
  captions: readonly Caption[],
  options: { start: number; end: number; maxScroll: number; energy: EnergyId; overscroll: number },
): Tour {
  const pace = FLICKS[options.energy];
  const n = stops.length;
  const moves = stops.map((stop, i) => {
    const from = i === 0 ? 0 : (stops[i - 1] as Stop).scroll;
    return Math.abs(stop.scroll - from) > 24;
  });
  const reads = captions.map((c) => clamp(readingTime(c.text) * 0.62 * pace.read, 1.1, 1.8));
  // The first stop shows as the phone lands; later ones wait for their flick.
  const lead = moves[0] ? 0.2 : -0.2;
  const glideTo = pace.drag + pace.tau * REVEAL_AT;
  // Natural length: lead, each flick until its reveal, each read but the last, a last read.
  const flicks = moves.filter(Boolean).length;
  const lastRead = Math.max(1.3, reads[n - 1] ?? 1.3);
  const fixed = lead + flicks * glideTo + (n - 1) * HIDE * 0.6;
  const readTotal = reads.slice(0, -1).reduce((s, r) => s + r, 0) + lastRead;
  const available = options.end - options.start;
  // Stretch or squeeze the reading pauses to fit; the last caption takes any surplus.
  let scale = (available - fixed) / readTotal;
  let flickScale = 1;
  if (scale < 0.7) {
    scale = 0.7;
    flickScale = clamp(
      (available - readTotal * scale - lead) / Math.max(0.01, fixed - lead),
      0.6,
      1,
    );
  }
  const pauseScale = Math.min(scale, 1.7);
  const scroll = new InertialScroll({ max: options.maxScroll });
  const beats: Beat[] = [];
  let t = options.start + lead;
  for (let i = 0; i < n; i++) {
    const stop = stops[i] as Stop;
    let flick: Beat['flick'] = null;
    let reveal = t + 0.05;
    if (moves[i]) {
      const last = i === n - 1;
      const atEnd = stop.scroll >= options.maxScroll - 1;
      const to =
        last && atEnd && options.maxScroll > 0 ? stop.scroll + options.overscroll : stop.scroll;
      const tau = pace.tau * flickScale;
      const drag = pace.drag * Math.max(0.8, flickScale);
      scroll.flick({ at: t, to, tau, drag });
      flick = { start: t, release: t + drag };
      reveal = t + drag + tau * REVEAL_AT;
    }
    const read = (i === n - 1 ? lastRead : (reads[i] as number)) * pauseScale;
    const hide = i === n - 1 ? null : reveal + read;
    beats.push({ flick, reveal, hide });
    t = hide === null ? reveal + read : hide + HIDE * 0.6;
  }
  return { scroll, beats };
}
