/**
 * Timelines (docs/04-motion-language.md §2, §5 and docs/06-engine.md §5).
 *
 * An `in · hold · out` template declares how long its entrance and exit take at *Balanced*
 * energy; the engine scales them by the energy profile and gives the remaining time to the hold.
 * Choreography is written relative to sections, so changing duration only stretches the hold —
 * entrances and exits keep their crafted timing.
 */

import { type EaseName, type EasingFn, resolveEase } from '../core/easing';
import { clamp, clamp01 } from '../core/math';
import type { EnergyProfile } from './energy';

export type Structure = 'in-hold-out' | 'sequence' | 'loop' | 'transition';

export const SECTION_NAMES = ['lead', 'in', 'hold', 'out', 'tail'] as const;
export type SectionName = (typeof SECTION_NAMES)[number];

export type Section = { start: number; end: number };

/** What a template tells the engine about its timing (seconds at Balanced energy). */
export type TimingSpec = {
  /** Clean frames before the entrance (not scaled by energy). */
  lead?: number;
  /** Entrance length (scaled by energy). */
  in: number;
  /** Exit length (scaled by energy). Use 0 for templates that end on a held frame. */
  out: number;
  /** Clean frames after the exit (not scaled by energy). */
  tail?: number;
  /** Primary text, used for the readable-hold check. */
  readable?: string;
  /** Duration for `duration: 'auto'` templates (sequences), already including in/out. */
  auto?: number;
  /** Transitions: the cut point (fully covered frame) as a share of the duration (default ½). */
  cut?: number;
};

export type TimelineWarning =
  | { kind: 'hold-too-short'; hold: number; recommended: number; suggestedDuration: number }
  | { kind: 'duration-clamped'; requested: number; used: number };

export type Window = { delay?: number; dur?: number };

export interface Timeline {
  readonly duration: number;
  readonly structure: Structure;
  readonly energy: EnergyProfile;
  readonly sections: Readonly<Record<SectionName, Section>>;
  readonly cut: number | null;
  readonly warnings: readonly TimelineWarning[];
  /** Absolute time of `offset` seconds (Balanced) into a section; in/out offsets scale with energy. */
  at(section: SectionName, offset?: number): number;
  /** Seconds since the section started (negative before it, beyond its length after it). */
  local(t: number, section: SectionName): number;
  /** Linear 0..1 progress through the whole section. */
  sectionProgress(t: number, section: SectionName): number;
  /**
   * Eased 0..1 progress of a window inside a section. `delay`/`dur` are Balanced seconds and
   * scale with energy inside `in`/`out` (hold and clean sections are absolute).
   */
  p(t: number, section: SectionName, window?: Window, curve?: EaseName | EasingFn): number;
  /** Energy scale applied to offsets in the given section. */
  scale(section: SectionName): number;
}

/** Minimum on-screen time for primary text (docs/04-motion-language.md §5). */
export function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp(0.9 + 0.28 * words, 1.5, 8);
}

export type DurationBounds = { min: number; max: number };

/** Smallest hold we allow even when the user forces a very short duration. */
const MIN_HOLD = 0.2;

export function createTimeline(options: {
  structure: Structure;
  spec: TimingSpec;
  energy: EnergyProfile;
  /** Requested duration in seconds, or 'auto'. */
  duration: number | 'auto';
  bounds: DurationBounds;
}): Timeline {
  const { structure, spec, energy, bounds } = options;
  const warnings: TimelineWarning[] = [];
  const lead = spec.lead ?? 0;
  const tail = spec.tail ?? 0;
  const inLength = spec.in * energy.time;
  const outLength = spec.out * energy.time;
  const floor = lead + inLength + outLength + tail + MIN_HOLD;

  const requested = options.duration === 'auto' ? (spec.auto ?? bounds.min) : options.duration;
  let duration = clamp(requested, Math.max(bounds.min, 0.1), bounds.max);
  if (structure === 'transition') {
    const clamped = duration !== requested && options.duration !== 'auto';
    return transitionTimeline(duration, spec, energy, clamped, requested);
  }
  if (structure === 'in-hold-out' && duration < floor) duration = floor;
  if (duration !== requested && options.duration !== 'auto') {
    warnings.push({ kind: 'duration-clamped', requested, used: duration });
  }

  const inStart = lead;
  const inEnd = inStart + inLength;
  const tailStart = duration - tail;
  const outStart = Math.max(inEnd, tailStart - outLength);
  const sections: Record<SectionName, Section> = {
    lead: { start: 0, end: inStart },
    in: { start: inStart, end: inEnd },
    hold: { start: inEnd, end: outStart },
    out: { start: outStart, end: tailStart },
    tail: { start: tailStart, end: duration },
  };

  if (structure === 'in-hold-out' && spec.readable) {
    const recommended = readingTime(spec.readable);
    const hold = sections.hold.end - sections.hold.start;
    if (hold + 1e-9 < recommended) {
      warnings.push({
        kind: 'hold-too-short',
        hold,
        recommended,
        suggestedDuration: Math.min(bounds.max, Math.ceil((duration - hold + recommended) * 2) / 2),
      });
    }
  }

  const scale = (section: SectionName) => (section === 'in' || section === 'out' ? energy.time : 1);

  const timeline: Timeline = {
    duration,
    structure,
    energy,
    sections,
    cut: null,
    warnings,
    at: (section, offset = 0) => sections[section].start + offset * scale(section),
    local: (t, section) => t - sections[section].start,
    sectionProgress: (t, section) => {
      const { start, end } = sections[section];
      return end <= start ? (t >= end ? 1 : 0) : clamp01((t - start) / (end - start));
    },
    p: (t, section, window = {}, curve = 'linear') => {
      const s = scale(section);
      const start = sections[section].start + (window.delay ?? 0) * s;
      const length = window.dur === undefined ? sections[section].end - start : window.dur * s;
      const raw = length <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / length);
      return resolveEase(curve)(raw);
    },
    scale,
  };
  return timeline;
}

/**
 * Transitions (docs/templates/08-transitions.md): the user sets the length and the choreography
 * is written relative to it — `in` runs up to the cut point, `out` after it, and Energy changes
 * character (curves, gaps, motion blur) but never the length.
 */
function transitionTimeline(
  duration: number,
  spec: TimingSpec,
  energy: EnergyProfile,
  clamped: boolean,
  requested: number,
): Timeline {
  const cut = duration * clamp(spec.cut ?? 0.5, 0.05, 0.95);
  const sections: Record<SectionName, Section> = {
    lead: { start: 0, end: 0 },
    in: { start: 0, end: cut },
    hold: { start: cut, end: cut },
    out: { start: cut, end: duration },
    tail: { start: duration, end: duration },
  };
  const warnings: TimelineWarning[] = clamped
    ? [{ kind: 'duration-clamped', requested, used: duration }]
    : [];
  return {
    duration,
    structure: 'transition',
    energy,
    sections,
    cut,
    warnings,
    at: (section, offset = 0) => sections[section].start + offset,
    local: (t, section) => t - sections[section].start,
    sectionProgress: (t, section) => {
      const { start, end } = sections[section];
      return end <= start ? (t >= end ? 1 : 0) : clamp01((t - start) / (end - start));
    },
    p: (t, section, window = {}, curve = 'linear') => {
      const start = sections[section].start + (window.delay ?? 0);
      const length = window.dur === undefined ? sections[section].end - start : window.dur;
      const raw = length <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / length);
      return resolveEase(curve)(raw);
    },
    scale: () => 1,
  };
}

// --- sequences ------------------------------------------------------------------------------

/** Beat length for one sequence item (docs/04-motion-language.md §5). */
export function beatLength(text: string, pace = 1): number {
  const characters = [...text.trim()].length;
  return clamp(0.28 + 0.045 * characters, 0.3, 1.2) * pace;
}

export type SequenceBeat = { readonly index: number; readonly start: number; readonly end: number };

export type Sequence = {
  readonly beats: readonly SequenceBeat[];
  /** From the first beat's start to the last beat's end (seconds). */
  readonly total: number;
  /** The beat at time `t` (relative to the sequence start), its local time and 0..1 progress. */
  at(t: number): { index: number; local: number; progress: number };
};

export type SequenceOptions = {
  /** Multiplies every beat (Energy or a template "pace" control). */
  pace?: number;
  /** Seconds between beats (negative overlaps them). */
  gap?: number;
  /**
   * Fixed total length: beats scale proportionally, but never outside
   * [0.3, 1.2] × pace, so a fixed duration can't make any beat unreadable or dead.
   */
  fit?: number;
};

/**
 * Lays out a sequence of beats (messages, statements, tips). Items are texts (beat length from
 * reading speed) or explicit lengths in seconds. With `duration: 'auto'`, a template's total
 * duration is `sequence(...).total` plus its in/out sections.
 */
export function sequence(
  items: readonly (string | number)[],
  options: SequenceOptions = {},
): Sequence {
  const pace = options.pace ?? 1;
  const gap = options.gap ?? 0;
  let lengths = items.map((item) =>
    typeof item === 'number' ? Math.max(0, item) * pace : beatLength(item, pace),
  );
  if (options.fit !== undefined && lengths.length > 0) {
    const gaps = gap * (lengths.length - 1);
    const natural = lengths.reduce((sum, length) => sum + length, 0);
    const scale = natural > 0 ? Math.max(0, options.fit - gaps) / natural : 0;
    lengths = lengths.map((length) => clamp(length * scale, 0.3 * pace, 1.2 * pace));
  }
  const beats: SequenceBeat[] = [];
  let cursor = 0;
  lengths.forEach((length, index) => {
    beats.push({ index, start: cursor, end: cursor + length });
    cursor += length + gap;
  });
  const total = beats.length > 0 ? (beats[beats.length - 1] as SequenceBeat).end : 0;
  return {
    beats,
    total,
    at(t) {
      if (beats.length === 0) return { index: -1, local: t, progress: 0 };
      let lo = 0;
      let hi = beats.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((beats[mid] as SequenceBeat).start <= t) lo = mid;
        else hi = mid - 1;
      }
      const beat = beats[lo] as SequenceBeat;
      const length = beat.end - beat.start;
      const local = t - beat.start;
      return { index: lo, local, progress: length > 0 ? clamp01(local / length) : 1 };
    },
  };
}
