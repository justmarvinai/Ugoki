/** Stagger patterns (docs/04-motion-language.md §7). */

import { createRng } from './rng';

export type StaggerPattern =
  | 'forward'
  | 'reverse'
  | 'center-out'
  | 'edges-in'
  | 'random'
  | 'accelerating';

export type StaggerOptions = {
  /** Gap between neighbours in seconds (already multiplied by the energy factor). */
  each: number;
  pattern?: StaggerPattern;
  /** Seed for `random`. */
  seed?: number | string;
  /** Gap ratio for `accelerating` (each gap is `ratio` × the previous one). */
  ratio?: number;
};

const randomOrders = new Map<string, Int32Array>();

function randomRank(i: number, n: number, seed: number | string): number {
  const key = `${n}:${seed}`;
  let ranks = randomOrders.get(key);
  if (!ranks) {
    const order = createRng(seed).shuffle(Array.from({ length: n }, (_, k) => k));
    ranks = new Int32Array(n);
    order.forEach((item, rank) => {
      (ranks as Int32Array)[item] = rank;
    });
    if (randomOrders.size > 256) randomOrders.clear();
    randomOrders.set(key, ranks);
  }
  return ranks[i] ?? 0;
}

/** Delay (seconds) of item `i` out of `n` for the given pattern. */
export function stagger(i: number, n: number, options: StaggerOptions): number {
  const { each, pattern = 'forward', seed = 0, ratio = 0.85 } = options;
  if (n <= 1) return 0;
  const center = (n - 1) / 2;
  switch (pattern) {
    case 'forward':
      return i * each;
    case 'reverse':
      return (n - 1 - i) * each;
    case 'center-out':
      return Math.abs(i - center) * each;
    case 'edges-in':
      return (center - Math.abs(i - center)) * each;
    case 'random':
      return randomRank(i, n, seed) * each;
    case 'accelerating':
      // Geometric series: each + each·r + each·r² + … (i terms).
      return ratio === 1 ? i * each : (each * (1 - ratio ** i)) / (1 - ratio);
  }
}

/** Total span from the first to the last start for a pattern (useful for sizing sections). */
export function staggerSpan(n: number, options: StaggerOptions): number {
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, stagger(i, n, options));
  return max;
}
