/**
 * Seeded simplex noise (after Stefan Gustavson's public-domain reference): smooth, continuous
 * randomness for organic edges, drifting shapes and camera shake. Create it in `build` from
 * `ctx.rng(key)`; evaluating it in `render` is pure — the same seed and point give the same
 * value on every frame, in preview and export.
 */

import type { Rng } from './rng';

export type Noise = {
  /** Smooth noise in about [-1, 1]. */
  noise2(x: number, y: number): number;
  noise3(x: number, y: number, z: number): number;
  /** Fractal sum of `octaves` layers (each `lacunarity`× finer, `gain`× weaker), about [-1, 1]. */
  fbm2(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
  fbm3(
    x: number,
    y: number,
    z: number,
    octaves?: number,
    lacunarity?: number,
    gain?: number,
  ): number;
};

const GRAD3: readonly (readonly [number, number, number])[] = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

export function createNoise(rng: Rng): Noise {
  const order = rng.shuffle(Array.from({ length: 256 }, (_, i) => i));
  const perm = new Uint8Array(512);
  const grad = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = order[i & 255] as number;
    grad[i] = (perm[i] as number) % 12;
  }
  const g = (index: number) => GRAD3[grad[index] as number] as readonly [number, number, number];

  function noise2(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const corner = (x: number, y: number, index: number) => {
      const r = 0.5 - x * x - y * y;
      if (r < 0) return 0;
      const [gx, gy] = g(index);
      return r ** 4 * (gx * x + gy * y);
    };
    const n0 = corner(x0, y0, ii + (perm[jj] as number));
    const n1 = corner(x1, y1, ii + i1 + (perm[jj + j1] as number));
    const n2 = corner(x2, y2, ii + 1 + (perm[jj + 1] as number));
    return 70 * (n0 + n1 + n2);
  }

  function noise3(xin: number, yin: number, zin: number): number {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1: number;
    let j1: number;
    let k1: number;
    let i2: number;
    let j2: number;
    let k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const corner = (x: number, y: number, z: number, index: number) => {
      const r = 0.6 - x * x - y * y - z * z;
      if (r < 0) return 0;
      const [gx, gy, gz] = g(index);
      return r ** 4 * (gx * x + gy * y + gz * z);
    };
    const p = (a: number, b: number, c: number) => a + (perm[b + (perm[c] as number)] as number);
    const n0 = corner(x0, y0, z0, p(ii, jj, kk));
    const n1 = corner(x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, p(ii + i1, jj + j1, kk + k1));
    const n2 = corner(
      x0 - i2 + 2 * G3,
      y0 - j2 + 2 * G3,
      z0 - k2 + 2 * G3,
      p(ii + i2, jj + j2, kk + k2),
    );
    const n3 = corner(x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, p(ii + 1, jj + 1, kk + 1));
    return 32 * (n0 + n1 + n2 + n3);
  }

  const fractal =
    (sample: (scale: number) => number) =>
    (octaves: number, lacunarity: number, gain: number): number => {
      let sum = 0;
      let amplitude = 1;
      let frequency = 1;
      let norm = 0;
      for (let o = 0; o < Math.max(1, Math.floor(octaves)); o++) {
        sum += amplitude * sample(frequency);
        norm += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
      }
      return sum / norm;
    };

  return {
    noise2,
    noise3,
    fbm2: (x, y, octaves = 4, lacunarity = 2, gain = 0.5) =>
      fractal((f) => noise2(x * f, y * f))(octaves, lacunarity, gain),
    fbm3: (x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) =>
      fractal((f) => noise3(x * f, y * f, z * f))(octaves, lacunarity, gain),
  };
}
