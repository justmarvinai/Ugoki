/**
 * Hype's edit (docs/templates/07-openers.md §7.2): a beat grid from the BPM, the words and the
 * flashes laid on it in half-beats, the lockup on the last beats — and every cut placed where
 * no export frame's shutter straddles it, so the new shot appears exactly on its beat's frame
 * and motion blur never dissolves one shot into the next.
 *
 * Engine candidate: `beats(bpm)` + `cleanCut(t, shutter)` (Punch has the same cut search).
 */

import { beatLength, CLEAN_END, type Rng } from '@/engine';

/** Hard cuts must stay hard: a 180° shutter leaves a gap between frames to cut in. */
export const SHUTTER = 180;

/** Export frame rates (docs/07-export.md §1); 60 and 30 matter most. */
const EXPORT_FPS = [60, 30, 50, 25, 24] as const;
const WEIGHT = [10, 10, 1, 1, 1] as const;
/** A cut this many frames away from every frame is never inside a 180° shutter's sub-frames. */
const MARGIN = 0.255;
/** How far (seconds) a cut may move to find such a time — within a frame of its beat. */
const REACH = 0.017;
const STEP = 0.0001;

/** How many of the export rates (weighted) keep a cut at `t` between frames. */
function cleanliness(t: number): number {
  let score = 0;
  for (let i = 0; i < EXPORT_FPS.length; i++) {
    const frames = t * (EXPORT_FPS[i] ?? 60);
    if (Math.abs(frames - Math.round(frames)) >= MARGIN) score += WEIGHT[i] ?? 1;
  }
  return score;
}

/**
 * The time near `t` that is cleanest to cut on at every export frame rate: always between
 * frames at 60 and 30 fps, and at 50/25/24 fps where a time within reach allows it (after
 * Punch's plan.ts). `side` −1 searches only before `t` — a cut just before a beat makes the new
 * shot appear on the beat's own frame — and 0 on both sides. Candidates are integers of 0.1 ms,
 * so every render finds the same one.
 */
export function cleanCut(t: number, side: -1 | 0 = 0): number {
  let best = t;
  let bestScore = -1;
  let bestShift = Number.POSITIVE_INFINITY;
  const reach = Math.round(REACH / STEP);
  const center = Math.round(t / STEP);
  for (let k = -reach; k <= (side < 0 ? 0 : reach); k++) {
    const candidate = (center + k) * STEP;
    if (candidate <= 0) continue;
    const score = cleanliness(candidate);
    const shift = Math.abs(candidate - t);
    if (score > bestScore || (score === bestScore && shift < bestShift)) {
      best = candidate;
      bestScore = score;
      bestShift = shift;
    }
  }
  return best;
}

/** A cut on the beat at `t`: moved just before it, so the beat's frame shows the new shot. */
export const beatCut = (t: number): number => cleanCut(t, -1);

/** The first shot cuts in on frame 1 at every export rate (frame 0 is the clean background). */
export const FIRST = cleanCut(0.0115);
/** Background-only time at the end (before the clean tail): the last beat cuts to it. */
const CLEAR = 0.1;
export const TAIL = CLEAR + CLEAN_END;
/** The lockup takes the last 1.5 s (spec), never less than this. */
const LOCKUP = 1.5;
const LOCKUP_MIN = 1.1;

export type WordKind = 'slam' | 'repeat' | 'split' | 'fill' | 'type';
export type FlashKind = 'zoom' | 'frame' | 'burst' | 'stripes' | 'shapes';
export type ShotKind = WordKind | FlashKind;

export type PlannedShot = {
  readonly kind: ShotKind;
  /** Position and length on the grid, in half-beats. */
  readonly at: number;
  readonly len: number;
  /** Cut in and cut out (seconds). */
  readonly start: number;
  readonly end: number;
  /** The words a word shot shows (lines stack). */
  readonly card: string;
  /** Index into the filled image slots (image shots). */
  readonly image: number;
  /** Entered with a whip pan instead of a hard cut. */
  readonly whip: boolean;
  /** Wild: the shot swaps its colors on the half-beat. */
  readonly flip: boolean;
};

export type Plan = {
  readonly shots: readonly PlannedShot[];
  /** The lockup's cut (seconds) and the final cut to the background. */
  readonly lockup: number;
  readonly clear: number;
  /** Seconds per beat and per half-beat. */
  readonly beat: number;
  readonly half: number;
};

export type PlanOptions = {
  readonly words: readonly string[];
  /** How many image slots are filled. */
  readonly images: number;
  readonly duration: number;
  readonly bpm: number;
  readonly wild: boolean;
  readonly rng: Rng;
};

/** The words control: one card per line (a line may hold several words). */
export function parseWords(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0);
}

/**
 * Merges neighbouring cards (stacked in one shot) until there are at most `max`: always the
 * neighbours that make the shortest stack, so the rest keep a shot of their own.
 */
function merge(cards: readonly string[], max: number): string[] {
  const out = cards.slice();
  const limit = Math.max(1, max);
  while (out.length > limit) {
    let best = 0;
    let shortest = Number.POSITIVE_INFINITY;
    for (let i = 0; i + 1 < out.length; i++) {
      const length = [...(out[i] ?? '')].length + [...(out[i + 1] ?? '')].length;
      if (length < shortest) {
        shortest = length;
        best = i;
      }
    }
    out.splice(best, 2, `${out[best] ?? ''}\n${out[best + 1] ?? ''}`);
  }
  return out;
}

/** Picks from `options`, never `avoid` when anything else is left. */
function pickOther<T>(rng: Rng, options: readonly T[], avoid: readonly T[]): T {
  const fresh = options.filter((option) => !avoid.includes(option));
  return rng.pick(fresh.length > 0 ? fresh : options);
}

export function planShots(options: PlanOptions): Plan {
  const { rng, wild, images } = options;
  const beat = 60 / options.bpm;
  const half = beat / 2;
  const clear = cleanCut(options.duration - TAIL);

  // --- the lockup lands on a beat, about 1.5 s before the end -------------------------------
  let lockBeats = Math.max(1, Math.round((clear - LOCKUP) / beat));
  while (lockBeats > 1 && clear - lockBeats * beat < LOCKUP_MIN) lockBeats--;
  let cards = parseWords(options.words.join('\n'));
  // Short durations give the words room first (a word per beat), as long as the lockup keeps
  // its minimum.
  while (cards.length * 2 > lockBeats * 2 && clear - (lockBeats + 1) * beat >= LOCKUP_MIN) {
    lockBeats++;
  }
  const available = lockBeats * 2;

  // --- words: a beat each, a half-beat when time is short, merged when shorter still ----------
  // A card never flashes by in less than 0.3 s: at fast tempos the shortest card is a beat.
  const shortest = half >= 0.3 ? 1 : 2;
  cards = merge(cards, Math.floor(available / shortest));
  const passes = cards.length > 0 && available >= cards.length * 6 ? 2 : 1;
  const sequence = passes === 2 ? [...cards, ...cards] : cards;
  const lengths = sequence.map(() => 2);
  let used = lengths.reduce((sum, n) => sum + n, 0);
  // Shorter words read faster: they go down to a half-beat first.
  const byLength = sequence
    .map((card, i) => ({ i, reading: beatLength(card) }))
    .sort((a, b) => a.reading - b.reading || a.i - b.i);
  for (const { i } of byLength) {
    if (used <= available || shortest > 1) break;
    lengths[i] = 1;
    used--;
  }
  // Long durations: words hold longer before flashes take over (at most two beats each).
  const flashCap = (words: number) => Math.max(2, Math.round(words * 1.3));
  for (let round = 0; available - used > flashCap(used) && round < 2; round++) {
    for (let i = 0; i < lengths.length && available - used > flashCap(used); i++) {
      lengths[i] = (lengths[i] ?? 2) + 1;
      used++;
    }
  }
  let flash = Math.max(0, available - used);

  // --- flashes: beats (Clean) or half-beats (Wild), spread over the gaps after the words -----
  // Clean flashes last a beat (one takes the odd half-beat); Wild cuts mostly on half-beats.
  const segments: number[] = [];
  while (flash > 0) {
    const len = flash >= 2 && (wild ? rng.chance(0.25) : flash !== 3 || rng.chance(0.5)) ? 2 : 1;
    segments.push(len);
    flash -= len;
  }
  const gaps = Math.max(1, sequence.length);
  const perGap: number[][] = Array.from({ length: gaps }, () => []);
  // Round-robin from a seeded start; the gap before the lockup fills last.
  const order = Array.from({ length: gaps }, (_, i) => i);
  const lastFirst = order.slice(0, -1);
  const rotated =
    gaps > 1 ? [...rng.shuffle(lastFirst.length > 0 ? lastFirst : order), gaps - 1] : [0];
  segments.forEach((len, k) => {
    const gap = rotated[k % rotated.length] ?? 0;
    perGap[gap]?.push(len);
  });

  // --- treatments ---------------------------------------------------------------------------
  const hasImages = images > 0;
  const wordKinds: WordKind[] = hasImages
    ? ['repeat', 'split', 'fill', 'type', 'slam']
    : ['repeat', 'split', 'type', 'slam'];
  const flashKinds: FlashKind[] = hasImages
    ? ['zoom', 'burst', 'frame', 'stripes', 'shapes']
    : ['burst', 'stripes', 'shapes'];
  const wordBag = rng.shuffle(wordKinds.filter((kind) => kind !== 'slam'));
  const flashBag = rng.shuffle(flashKinds.slice(1));
  const planned: Omit<PlannedShot, 'start' | 'end'>[] = [];
  let at = 0;
  let image = 0;
  let lastWord: WordKind | null = null;
  let lastFlash: FlashKind | null = null;
  let flashIndex = 0;
  sequence.forEach((card, i) => {
    // The first card slams; then the bag, never the same treatment twice in a row.
    let kind: WordKind = i === 0 ? 'slam' : (wordBag[(i - 1) % wordBag.length] ?? 'slam');
    if (kind === lastWord) kind = pickOther(rng, wordKinds, [lastWord]);
    lastWord = kind;
    const len = lengths[i] ?? 2;
    const usesImage = kind === 'fill';
    planned.push({
      kind,
      at,
      len,
      card,
      image: usesImage ? image++ % Math.max(1, images) : 0,
      whip: false,
      flip: wild && len >= 2 && rng.chance(0.5),
    });
    at += len;
    for (const segment of perGap[i] ?? []) {
      // The first flash is the image zoom (spec), then the bag.
      let kind: FlashKind =
        flashIndex === 0
          ? (flashKinds[0] ?? 'burst')
          : (flashBag[(flashIndex - 1) % flashBag.length] ?? 'burst');
      flashIndex++;
      if (kind === lastFlash) kind = pickOther(rng, flashKinds, [lastFlash]);
      lastFlash = kind;
      const usesImage = kind === 'zoom' || kind === 'frame';
      planned.push({
        kind,
        at,
        len: segment,
        card: '',
        image: usesImage ? image++ % Math.max(1, images) : 0,
        whip: false,
        flip: false,
      });
      at += segment;
    }
  });
  if (planned.length === 0) {
    // No words at all: the flashes carry the whole edit.
    for (const len of segments.length > 0 ? segments : [available]) {
      const kind: FlashKind = pickOther(rng, flashKinds, lastFlash ? [lastFlash] : []);
      lastFlash = kind;
      planned.push({
        kind,
        at,
        len,
        card: '',
        image: kind === 'zoom' || kind === 'frame' ? image++ % Math.max(1, images) : 0,
        whip: false,
        flip: false,
      });
      at += len;
    }
  }

  // --- whips: some cuts become whip pans (never the first shot, never into the lockup) -------
  const eligible = planned
    .map((shot, i) => ({ shot, i }))
    .filter(({ shot, i }) => {
      const before = planned[i - 1];
      return i > 0 && before !== undefined && Math.min(before.len, shot.len) * half >= 0.2;
    })
    .map(({ i }) => i);
  const whipCount = wild ? 3 : 1;
  const whips = new Set<number>();
  for (const i of rng.shuffle(eligible)) {
    if (whips.size >= whipCount) break;
    if (whips.has(i - 1) || whips.has(i + 1)) continue;
    whips.add(i);
  }

  // --- seconds: cuts on the grid, moved between frames ---------------------------------------
  const lockup = beatCut(lockBeats * beat);
  const shots: PlannedShot[] = [];
  let previous = 0;
  planned.forEach((shot, i) => {
    const start = i === 0 ? FIRST : Math.max(beatCut(shot.at * half), previous + 1 / 60);
    previous = start;
    shots.push({ ...shot, start, end: 0, whip: whips.has(i) });
  });
  const withEnds = shots.map((shot, i) => ({ ...shot, end: shots[i + 1]?.start ?? lockup }));
  return { shots: withEnds, lockup, clear, beat, half };
}
