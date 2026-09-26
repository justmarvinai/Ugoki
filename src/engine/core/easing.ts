/**
 * Named easing curves — the only curves templates and the UI may use
 * (docs/04-motion-language.md §3). Cubic-bézier evaluation follows the approach of WebKit's
 * UnitBezier / gre's bezier-easing: a sample table for the initial guess, Newton–Raphson
 * refinement, bisection as a fallback. Accurate to ~1e-7 and allocation-free per call.
 */

import { clamp01 } from './math';

export type EasingFn = (t: number) => number;

const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 1e-7;
const SUBDIVISION_MAX_ITERATIONS = 12;
const SAMPLE_COUNT = 11;
const SAMPLE_STEP = 1 / (SAMPLE_COUNT - 1);

const a = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1;
const b = (a1: number, a2: number) => 3 * a2 - 6 * a1;
const c = (a1: number) => 3 * a1;
/** x(t) or y(t) of the bézier for control values a1, a2. */
const calcBezier = (t: number, a1: number, a2: number) =>
  ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t;
/** dx/dt or dy/dt. */
const getSlope = (t: number, a1: number, a2: number) =>
  3 * a(a1, a2) * t * t + 2 * b(a1, a2) * t + c(a1);

/**
 * Creates a CSS-compatible `cubic-bezier(x1, y1, x2, y2)` easing. `x1`/`x2` must lie in [0, 1];
 * `y1`/`y2` may overshoot (e.g. `pop`).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) {
    throw new RangeError('cubicBezier: x values must be within [0, 1]');
  }
  if (x1 === y1 && x2 === y2) return (t) => clamp01(t);

  const samples = new Float64Array(SAMPLE_COUNT);
  for (let i = 0; i < SAMPLE_COUNT; i++) samples[i] = calcBezier(i * SAMPLE_STEP, x1, x2);

  const tForX = (x: number): number => {
    let intervalStart = 0;
    let current = 1;
    const last = SAMPLE_COUNT - 1;
    for (; current !== last && (samples[current] ?? 1) <= x; current++) {
      intervalStart += SAMPLE_STEP;
    }
    current--;
    const s0 = samples[current] ?? 0;
    const s1 = samples[current + 1] ?? 1;
    const dist = (x - s0) / (s1 - s0);
    let guess = intervalStart + dist * SAMPLE_STEP;

    const initialSlope = getSlope(guess, x1, x2);
    if (initialSlope >= NEWTON_MIN_SLOPE) {
      for (let i = 0; i < NEWTON_ITERATIONS; i++) {
        const slope = getSlope(guess, x1, x2);
        if (slope === 0) return guess;
        guess -= (calcBezier(guess, x1, x2) - x) / slope;
      }
      return guess;
    }
    if (initialSlope === 0) return guess;

    // Bisection fallback for flat regions.
    let lo = intervalStart;
    let hi = intervalStart + SAMPLE_STEP;
    let mid = guess;
    for (let i = 0; i < SUBDIVISION_MAX_ITERATIONS; i++) {
      mid = lo + (hi - lo) / 2;
      const delta = calcBezier(mid, x1, x2) - x;
      if (Math.abs(delta) <= SUBDIVISION_PRECISION) break;
      if (delta > 0) hi = mid;
      else lo = mid;
    }
    return mid;
  };

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return calcBezier(tForX(t), y1, y2);
  };
}

/** The named curves of the motion language. */
export const EASE_DEFINITIONS = {
  /** Fast start, long silky settle (expo-out family). Default entrance. */
  glide: [0.16, 1, 0.3, 1],
  /** Decisive in-out (quint). Wipes, panels, blocks, transitions. */
  snap: [0.83, 0, 0.17, 1],
  /** Standard, neutral. UI state changes, small repositions. */
  swift: [0.4, 0, 0.2, 1],
  /** Accelerates away (expo-in family). Exits. */
  exit: [0.7, 0, 0.84, 0],
  /** Gentle sine in-out. Holds, ambience, editorial fades, camera pushes. */
  drift: [0.37, 0, 0.63, 1],
  /** Back-out with ~10% overshoot. Badges, stickers, chips. */
  pop: [0.34, 1.56, 0.64, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type EaseName = keyof typeof EASE_DEFINITIONS | 'linear';

const linear: EasingFn = (t) => clamp01(t);

export const ease: Record<EaseName, EasingFn> = {
  linear,
  glide: cubicBezier(...EASE_DEFINITIONS.glide),
  snap: cubicBezier(...EASE_DEFINITIONS.snap),
  swift: cubicBezier(...EASE_DEFINITIONS.swift),
  exit: cubicBezier(...EASE_DEFINITIONS.exit),
  drift: cubicBezier(...EASE_DEFINITIONS.drift),
  pop: cubicBezier(...EASE_DEFINITIONS.pop),
};

export const EASE_NAMES = Object.keys(ease) as EaseName[];

/** Resolves a curve by name or passes a custom easing function through. */
export function resolveEase(curve: EaseName | EasingFn | undefined): EasingFn {
  if (curve === undefined) return linear;
  return typeof curve === 'function' ? curve : ease[curve];
}

/** CSS string for a named curve (used by the UI so both share one definition). */
export function easeToCss(name: EaseName): string {
  if (name === 'linear') return 'linear';
  const [x1, y1, x2, y2] = EASE_DEFINITIONS[name];
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}
