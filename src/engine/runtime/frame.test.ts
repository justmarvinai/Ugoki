import { describe, expect, it } from 'vitest';
import { displacement } from './frame';

/** A w × h RGBA image, opaque white left of `edge`, transparent right of it. */
function edge(w: number, h: number, at: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < Math.min(w, at); x++) data.fill(255, (y * w + x) * 4, (y * w + x) * 4 + 4);
  }
  return data;
}

describe('motion across the shutter', () => {
  it('is 0 when nothing changes', () => {
    expect(displacement(edge(40, 20, 10), edge(40, 20, 10), 40, 20)).toBe(0);
  });

  it('measures how far an edge travels, along any axis', () => {
    expect(displacement(edge(40, 20, 10), edge(40, 20, 17), 40, 20)).toBe(7);
    // Transposed: a horizontal edge moving down by 5.
    const w = 20;
    const h = 40;
    const rows = (at: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      data.fill(255, 0, at * w * 4);
      return data;
    };
    expect(displacement(rows(12), rows(17), w, h)).toBe(5);
  });

  it('counts slow changes as motion, but not as travel', () => {
    const a = edge(40, 20, 10);
    const b = new Uint8ClampedArray(a);
    b[3] = 240; // one pixel fades a little
    expect(displacement(a, b, 40, 20)).toBe(0.5);
  });
});
