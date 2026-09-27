import { describe, expect, it } from 'vitest';
import { boxSizes } from './effects';

describe('box blurs', () => {
  // Below ~2 px, three odd widths can't match the variance closely (and it doesn't show).
  it('add up to the Gaussian’s variance', () => {
    for (const sigma of [2.5, 4, 8, 20]) {
      const sizes = boxSizes(sigma);
      for (const size of sizes) expect(size % 2).toBe(1);
      const variance = sizes.reduce((sum, w) => sum + (w * w - 1) / 12, 0);
      expect(Math.abs(variance - sigma * sigma) / (sigma * sigma)).toBeLessThan(0.1);
    }
  });
});
