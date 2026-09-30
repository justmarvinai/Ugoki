import { describe, expect, it } from 'vitest';
import { createNoise } from './noise';
import { createRng } from './rng';

describe('noise', () => {
  it('is deterministic per seed, bounded and smooth', () => {
    const a = createNoise(createRng('liquid'));
    const b = createNoise(createRng('liquid'));
    const c = createNoise(createRng('other'));
    let differs = false;
    for (let i = 0; i < 200; i++) {
      const x = i * 0.137;
      const y = i * 0.071;
      const value = a.noise2(x, y);
      expect(value).toBe(b.noise2(x, y));
      expect(Math.abs(value)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(a.noise3(x, y, 0.5))).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(a.fbm2(x, y))).toBeLessThanOrEqual(1.0001);
      // Continuity: a tiny step moves the value a tiny amount.
      expect(Math.abs(a.noise2(x + 1e-4, y) - value)).toBeLessThan(0.01);
      if (c.noise2(x, y) !== value) differs = true;
    }
    expect(differs).toBe(true);
  });
});
