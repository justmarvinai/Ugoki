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
  /** Transitions: the cut point (fully covered frame) in seconds from the start. */
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
    cut: spec.cut === undefined ? null : spec.cut,
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
