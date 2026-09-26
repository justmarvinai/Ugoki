/**
 * Deterministic randomness (docs/06-engine.md §12). Templates never call Math.random; they get
 * seeded streams from `ctx.rng(key)`. The generators use only 32-bit integer math (Math.imul,
 * >>>), so every JavaScript engine produces the same sequence.
 */

/** 32-bit FNV-1a string hash, finalized with a murmur3 avalanche. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Combines two 32-bit values into a new well-mixed seed. */
export function mixSeeds(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export type Rng = {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** -1 or 1. */
  sign(): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** New array with the items in random order (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Approximately normal (Irwin–Hall, n=4), mean 0, std ≈ `spread`. */
  gauss(spread?: number): number;
};

/** SFC32 generator seeded through splitmix32. */
export function createRng(seed: number | string): Rng {
  const numericSeed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const init = splitmix32(numericSeed);
  let a = init();
  let b = init();
  let c = init();
  let d = init();

  const nextUint = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    return t >>> 0;
  };
  // Discard the first outputs so similar seeds diverge immediately.
  for (let i = 0; i < 12; i++) nextUint();

  const next = () => nextUint() / 4294967296;

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    sign: () => (next() < 0.5 ? -1 : 1),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new RangeError('rng.pick: empty array');
      return items[Math.floor(next() * items.length)] as T;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i] as T;
        out[i] = out[j] as T;
        out[j] = tmp;
      }
      return out;
    },
    gauss: (spread = 1) => ((next() + next() + next() + next() - 2) / 0.5773502691896258) * spread,
  };
}

/** Stateless per-element randomness: the same (seed, key) always yields the same stream. */
export function rngFor(seed: number, key: string): Rng {
  return createRng(mixSeeds(seed >>> 0, hashString(key)));
}
