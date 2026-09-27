/**
 * Punch's timing (docs/templates/03-social.md §3.1): one beat per script line, each as long as
 * its words take to read (`sequence` + Pace), then a held final beat — and every cut placed where
 * no export frame's shutter straddles it, so motion blur never mixes two beats into one frame.
 */

import { beatLength, CLEAN_END, sequence } from '@/engine';

export const PACES = { chill: 1.35, normal: 1, hyper: 0.72 } as const;
export type Pace = keyof typeof PACES;

/** Where the first beat cuts in, just after the clean frame 0. */
const FIRST = 0.09;
/** Background-only time at the end (before the clean tail), so the video ends and loops clean. */
const CLEAR = 0.1;
/** Everything after the last beat: the clear, then the engine's clean tail. */
export const TAIL = CLEAR + CLEAN_END;
/** The final beat holds at least this long (spec: "Final beat holds ≥ 1.2 s"). */
const FINAL_HOLD = 1.2;
/** A short fixed duration never squeezes the final beat below this. */
const FINAL_FLOOR = 0.7;

/** Export frame rates (docs/07-export.md §1); 60 and 30 matter most for social video. */
const EXPORT_FPS = [60, 30, 50, 25, 24] as const;
const WEIGHT = [10, 10, 1, 1, 1] as const;
/**
 * A cut this many frames away from every frame is never straddled: Punch's 180° shutter opens
 * a quarter frame either side of a frame, and sub-frames stay strictly inside it.
 */
const MARGIN = 0.255;
/** How far (seconds) a cut may move to find such a time — imperceptible in the rhythm. */
const REACH = 0.017;
const STEP = 0.0001;

/**
 * The time near `t` that is cleanest to cut on at every export frame rate: always between
 * frames (never straddled by the shutter) at 60 and 30 fps, and at 50/25/24 fps where a time
 * within reach allows it. Candidates are integers of 0.1 ms, so every render finds the same one.
 */
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

/** A beat's text without emphasis markup (`\*` stays a literal star). */
export function plain(beat: string): string {
  return beat
    .replace(/(?<!\\)\*/g, '')
    .replace(/\\\*/g, '*')
    .trim();
}

/** The script's beats: one per line that has something to show (markup kept for the layout). */
export function scriptBeats(script: string): string[] {
  return script
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => plain(line).length > 0);
}

/** How long the final beat holds: at least 1.2 s, longer at a slow pace, plus the CTA's read. */
function finalHold(beat: string, cta: string, pace: number): number {
  const reading = cta ? 0.6 + 0.04 * [...cta].length : 0;
  return Math.max(FINAL_HOLD, FINAL_HOLD * pace, beatLength(plain(beat), pace)) + reading;
}

export type Plan = {
  /** When each beat cuts in (seconds); the last one is the final beat. */
  readonly starts: readonly number[];
  /** When the final beat cuts back to the background. */
  readonly clear: number;
};

/** When the first beat cuts in (the timeline's lead). */
export const firstCut = (): number => cleanCut(FIRST);

/** Auto duration: the beats at reading rhythm, the final hold and the clean ending. */
export function autoDuration(script: string, cta: string, pace: number): number {
  const beats = scriptBeats(script);
  const last = beats[beats.length - 1];
  if (last === undefined) return FIRST + FINAL_HOLD + TAIL;
  const lead = sequence(beats.slice(0, -1).map(plain), { pace });
  return FIRST + lead.total + finalHold(last, cta.trim(), pace) + TAIL;
}

/**
 * Beat cuts for a timeline of `duration` seconds. At Auto duration the beats keep their reading
 * rhythm; a fixed duration scales them proportionally within readable limits (0.3–1.2 s × Pace)
 * and the final beat takes the rest — only a duration too short for that squeezes them further.
 */
export function planBeats(script: string, cta: string, pace: number, duration: number): Plan {
  const beats = scriptBeats(script);
  const last = beats[beats.length - 1];
  const clear = cleanCut(duration - TAIL);
  if (last === undefined) return { starts: [], clear };

  const texts = beats.slice(0, -1).map(plain);
  const hold = finalHold(last, cta.trim(), pace);
  const available = duration - FIRST - TAIL;
  let lead = sequence(texts, { pace });
  if (texts.length > 0 && Math.abs(lead.total + hold - available) > 1e-6) {
    lead = sequence(texts, { pace, fit: (available * lead.total) / (lead.total + hold) });
    if (available - lead.total < FINAL_FLOOR) {
      const squeeze = Math.max(0, available - FINAL_FLOOR) / lead.total;
      lead = sequence(
        lead.beats.map((beat) => (beat.end - beat.start) * squeeze),
        { pace: 1 },
      );
    }
  }

  const starts: number[] = [];
  const cut = (t: number) => {
    const previous = starts[starts.length - 1];
    // Never two cuts on one frame, however hard a fixed duration squeezes.
    starts.push(previous === undefined ? cleanCut(t) : Math.max(cleanCut(t), previous + 1 / 60));
  };
  for (const beat of lead.beats) cut(FIRST + beat.start);
  cut(FIRST + lead.total);
  return { starts, clear };
}
