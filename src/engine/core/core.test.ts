import { describe, expect, it } from 'vitest';
import {
  bestContrast,
  contrastRatio,
  ensureContrast,
  fromOklch,
  mixOklch,
  parseHex,
  rgb,
  toHex,
  toOklab,
  toOklch,
} from './color';
import { cubicBezier, EASE_NAMES, ease, easeToCss } from './easing';
import { clamp, invLerp, lerp, mod, progress, remap } from './math';
import { createRng, hashString, rngFor } from './rng';
import { dampingRatio, SPRINGS, spring, springProgress, springSettleTime } from './spring';
import { stagger, staggerSpan } from './stagger';
import { frameCount, stepIndex, stepped, wave } from './time';

describe('math', () => {
  it('clamps, lerps and remaps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(invLerp(10, 20, 15)).toBe(0.5);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
    expect(mod(-1, 360)).toBe(359);
  });

  it('computes clamped window progress', () => {
    expect(progress(0.5, 1, 2)).toBe(0);
    expect(progress(2, 1, 2)).toBe(0.5);
    expect(progress(9, 1, 2)).toBe(1);
    expect(progress(1, 1, 0)).toBe(1);
  });
});

describe('easing', () => {
  it('hits the endpoints exactly for every named curve', () => {
    for (const name of EASE_NAMES) {
      expect(ease[name](0)).toBe(0);
      expect(ease[name](1)).toBe(1);
      expect(ease[name](-1)).toBe(0);
      expect(ease[name](2)).toBe(1);
    }
  });

  it('matches known cubic-bezier values', () => {
    // CSS `ease` = cubic-bezier(0.25, 0.1, 0.25, 1); reference value from browser engines.
    const cssEase = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(cssEase(0.5)).toBeCloseTo(0.8024033877399112, 5);
    // A linear bezier is the identity.
    const identity = cubicBezier(0.3, 0.3, 0.7, 0.7);
    for (let t = 0; t <= 1; t += 0.1) expect(identity(t)).toBeCloseTo(t, 9);
  });

  it('keeps monotonic curves monotonic and lets pop overshoot', () => {
    for (const name of ['glide', 'snap', 'swift', 'exit', 'drift'] as const) {
      let previous = 0;
      for (let i = 1; i <= 200; i++) {
        const value = ease[name](i / 200);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
    let max = 0;
    for (let i = 0; i <= 200; i++) max = Math.max(max, ease.pop(i / 200));
    expect(max).toBeGreaterThan(1.05);
    expect(max).toBeLessThan(1.15);
  });

  it('describes character: glide front-loads, exit back-loads', () => {
    expect(ease.glide(0.25)).toBeGreaterThan(0.7);
    expect(ease.exit(0.5)).toBeLessThan(0.15);
    expect(ease.snap(0.5)).toBeCloseTo(0.5, 2);
  });

  it('exports CSS strings for the UI', () => {
    expect(easeToCss('glide')).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(easeToCss('linear')).toBe('linear');
  });

  it('rejects invalid x control points', () => {
    expect(() => cubicBezier(-0.1, 0, 1, 1)).toThrow(RangeError);
  });
});

describe('springs', () => {
  it('matches the damping ratios documented in the motion language', () => {
    expect(dampingRatio(SPRINGS.gentle)).toBeCloseTo(0.913, 2);
    expect(dampingRatio(SPRINGS.snappy)).toBeCloseTo(0.7, 3);
    expect(dampingRatio(SPRINGS.bouncy)).toBeCloseTo(0.346, 2);
    expect(dampingRatio(SPRINGS.heavy)).toBeCloseTo(1.028, 2);
  });

  it('matches the documented overshoot', () => {
    const peak = (name: keyof typeof SPRINGS) => {
      let max = 0;
      for (let t = 0; t < 3; t += 1 / 2000) max = Math.max(max, springProgress(t, name));
      return max - 1;
    };
    expect(peak('snappy')).toBeCloseTo(0.046, 2);
    expect(peak('bouncy')).toBeCloseTo(0.313, 2);
    expect(peak('heavy')).toBeLessThanOrEqual(1e-9);
  });

  it('agrees with a numerical integration of the ODE (incl. initial velocity)', () => {
    for (const config of Object.values(SPRINGS)) {
      for (const v0 of [0, 3]) {
        // Semi-implicit Euler on displacement y = x - 1.
        let y = -1;
        let v = v0;
        const dt = 1 / 20000;
        for (let step = 1; step <= 0.6 / dt; step++) {
          const acc = (-config.stiffness * y - config.damping * v) / config.mass;
          v += acc * dt;
          y += v * dt;
        }
        expect(springProgress(0.6, config, v0)).toBeCloseTo(y + 1, 3);
      }
    }
  });

  it('maps from/to and settles within the documented times (2% band)', () => {
    expect(spring(0, 10, 20)).toBe(10);
    expect(spring(5, 10, 20)).toBeCloseTo(20, 6);
    expect(springSettleTime('snappy', 0.02)).toBeCloseTo(0.3, 1);
    expect(springSettleTime('gentle', 0.02)).toBeCloseTo(0.44, 1);
    expect(springSettleTime('bouncy', 0.02)).toBeCloseTo(0.64, 1);
    expect(springSettleTime('heavy', 0.02)).toBeCloseTo(0.97, 1);
  });
});

describe('rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    const seqC = Array.from({ length: 8 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const value of seqA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('produces a stable, engine-independent sequence (regression guard)', () => {
    // Pinned values: changing the generator would silently change every seeded template layout.
    const r = createRng('ugoki');
    expect(Array.from({ length: 4 }, () => Math.floor(r.next() * 1e6))).toEqual([
      369059, 14240, 503077, 594132,
    ]);
    expect(createRng(42).next()).toBe(0.23955312534235418);
    expect(hashString('ugoki')).toBe(1167606179);
    expect(hashString('')).toBe(2872998923);
    expect(hashString('ugoki')).not.toBe(hashString('Ugoki'));
  });

  it('keys per-element streams by (seed, key)', () => {
    expect(rngFor(7, 'line-1').next()).toBe(rngFor(7, 'line-1').next());
    expect(rngFor(7, 'line-1').next()).not.toBe(rngFor(7, 'line-2').next());
  });

  it('is roughly uniform and shuffles into permutations', () => {
    const r = createRng(1);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) buckets[Math.floor(r.next() * 10)]++;
    for (const count of buckets) expect(Math.abs(count - 2000)).toBeLessThan(200);
    const items = [1, 2, 3, 4, 5, 6];
    const shuffled = createRng(9).shuffle(items);
    expect([...shuffled].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    const ints = Array.from({ length: 500 }, () => r.int(1, 3));
    expect(new Set(ints)).toEqual(new Set([1, 2, 3]));
  });
});

describe('stagger', () => {
  it('implements the documented patterns', () => {
    const each = 0.1;
    expect([0, 1, 2, 3].map((i) => stagger(i, 4, { each }))).toEqual([
      0, 0.1, 0.2, 0.30000000000000004,
    ]);
    expect(stagger(0, 4, { each, pattern: 'reverse' })).toBeCloseTo(0.3);
    expect(stagger(2, 5, { each, pattern: 'center-out' })).toBe(0);
    expect(stagger(0, 5, { each, pattern: 'center-out' })).toBeCloseTo(0.2);
    expect(stagger(0, 5, { each, pattern: 'edges-in' })).toBe(0);
    expect(stagger(2, 5, { each, pattern: 'edges-in' })).toBeCloseTo(0.2);
    expect(stagger(0, 1, { each })).toBe(0);
  });

  it('assigns every random rank exactly once, deterministically', () => {
    const delays = Array.from({ length: 10 }, (_, i) =>
      stagger(i, 10, { each: 1, pattern: 'random', seed: 'tiles' }),
    );
    expect([...delays].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(stagger(3, 10, { each: 1, pattern: 'random', seed: 'tiles' })).toBe(delays[3]);
  });

  it('shrinks gaps geometrically when accelerating', () => {
    const d = (i: number) => stagger(i, 20, { each: 0.1, pattern: 'accelerating', ratio: 0.5 });
    expect(d(1)).toBeCloseTo(0.1);
    expect(d(2) - d(1)).toBeCloseTo(0.05);
    expect(staggerSpan(20, { each: 0.1, pattern: 'accelerating', ratio: 0.5 })).toBeLessThan(0.2);
  });
});

describe('time', () => {
  it('quantizes to a fixed cadence independent of export fps', () => {
    expect(stepped(1 / 24 - 1e-12, 24)).toBe(1 / 24);
    expect(stepped(0.99, 24)).toBeCloseTo(23 / 24);
    expect(stepIndex(0.5, 24)).toBe(12);
    // Every 60 fps frame maps onto the 24 fps grid.
    const steps = new Set(Array.from({ length: 60 }, (_, f) => stepIndex(f / 60, 24)));
    expect(steps.size).toBe(24);
    expect(frameCount(5, 30)).toBe(150);
  });

  it('produces a periodic traveling wave', () => {
    const w = (t: number) => wave(t, 3, { period: 1.6, amplitude: 12 });
    expect(w(0.4)).toBeCloseTo(w(2.0), 9);
    expect(Math.abs(w(0.7))).toBeLessThanOrEqual(12);
  });
});

describe('color', () => {
  it('round-trips hex', () => {
    expect(toHex(parseHex('#1F38E8'))).toBe('#1f38e8');
    expect(toHex(parseHex('#abc'))).toBe('#aabbcc');
    expect(toHex(parseHex('#ff000080'))).toBe('#ff000080');
    expect(() => parseHex('red')).toThrow();
  });

  it('matches OKLab reference values', () => {
    const white = toOklab(rgb(1, 1, 1));
    expect(white.L).toBeCloseTo(1, 4);
    expect(white.a).toBeCloseTo(0, 4);
    expect(white.b).toBeCloseTo(0, 4);
    const red = toOklab(rgb(1, 0, 0));
    expect(red.L).toBeCloseTo(0.62796, 4);
    expect(red.a).toBeCloseTo(0.22486, 4);
    expect(red.b).toBeCloseTo(0.12585, 4);
  });

  it('round-trips through OKLCH within 1/255', () => {
    for (const hex of ['#1f38e8', '#d4ff3a', '#0b0b0c', '#f5f4f0', '#ff6a1a']) {
      const color = parseHex(hex);
      expect(toHex(fromOklch(toOklch(color)))).toBe(hex);
    }
  });

  it('maps out-of-gamut colors by reducing chroma, keeping hue', () => {
    const vivid = fromOklch({ L: 0.7, C: 0.4, h: 150 });
    for (const channel of [vivid.r, vivid.g, vivid.b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
    expect(toOklch(vivid).h).toBeCloseTo(150, 0);
  });

  it('mixes perceptually along the shortest hue arc', () => {
    const a = parseHex('#ff0000');
    const b = parseHex('#0000ff');
    expect(mixOklch(a, b, 0)).toBe(a);
    expect(mixOklch(a, b, 1)).toBe(b);
    const mid = toOklch(mixOklch(a, b, 0.5));
    // red ≈ 29°, blue ≈ 264° → shortest arc passes through magenta (~327°), not green.
    expect(mid.h).toBeGreaterThan(300);
    expect(mid.h).toBeLessThan(345);
    const grey = mixOklch(parseHex('#808080'), parseHex('#ff0000'), 0.5);
    expect(toOklch(grey).h).toBeCloseTo(toOklch(parseHex('#ff0000')).h, 0);
  });

  it('computes WCAG contrast and repairs failing pairs', () => {
    expect(contrastRatio(rgb(0, 0, 0), rgb(1, 1, 1))).toBeCloseTo(21, 5);
    const paper = parseHex('#F5F4F0');
    expect(contrastRatio(parseHex('#0B0B0C'), paper)).toBeCloseTo(17.88, 1);
    const weak = parseHex('#9a9a9a');
    const fixed = ensureContrast(weak, paper, 4.5);
    expect(contrastRatio(fixed, paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fixed, paper)).toBeLessThan(4.8);
    expect(bestContrast(parseHex('#1F38E8'), [rgb(0, 0, 0), rgb(1, 1, 1)])).toEqual(rgb(1, 1, 1));
  });
});
