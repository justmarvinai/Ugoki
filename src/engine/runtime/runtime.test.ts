import { describe, expect, it } from 'vitest';
import { mixOklab, rgb, toOklab } from '../core/color';
import { expandGradientStops } from '../draw/canvas-draw';
import { AdaptiveQuality } from './quality';

describe('gradients', () => {
  it('mixes in premultiplied OKLab: fading to transparent keeps the color', () => {
    const white = rgb(1, 1, 1);
    const clear = rgb(0, 0, 0, 0);
    const mid = mixOklab(white, clear, 0.5);
    expect(mid.a).toBeCloseTo(0.5);
    expect(mid.r).toBeCloseTo(1);
    expect(mid.g).toBeCloseTo(1);
  });

  it('is perceptually even between opaque colors', () => {
    const a = rgb(0, 0, 1);
    const b = rgb(1, 1, 0);
    const mid = toOklab(mixOklab(a, b, 0.5));
    expect(mid.L).toBeCloseTo((toOklab(a).L + toOklab(b).L) / 2, 2);
  });

  it('expands stops with intermediates and keeps hard stops hard', () => {
    const expanded = expandGradientStops({
      kind: 'linear',
      x0: 0,
      y0: 0,
      x1: 1,
      y1: 0,
      stops: [
        { offset: 0, color: rgb(1, 0, 0) },
        { offset: 0.5, color: rgb(0, 0, 1) },
        { offset: 0.5, color: rgb(0, 1, 0) },
        { offset: 1, color: rgb(0, 0, 0) },
      ],
    });
    expect(expanded.offsets[0]).toBe(0);
    expect(expanded.offsets.at(-1)).toBe(1);
    expect(expanded.offsets.length).toBe(4 + 2 * 7);
    for (let i = 1; i < expanded.offsets.length; i++) {
      expect(expanded.offsets[i]!).toBeGreaterThanOrEqual(expanded.offsets[i - 1]!);
    }
  });
});

describe('adaptive quality', () => {
  it('drops the render scale when frames are slow and recovers after a cooldown', () => {
    const quality = new AdaptiveQuality(8);
    let now = 0;
    const run = (frames: number, cost: number, interval: number) => {
      for (let i = 0; i < frames; i++) {
        now += interval;
        quality.record(cost, interval, now);
      }
    };
    expect(quality.scale).toBe(1);
    run(11, 4, 30); // 33 fps, still averaging
    expect(quality.scale).toBe(1);
    run(1, 4, 30);
    expect(quality.scale).toBe(0.75);
    run(15, 4, 30); // < 500 ms since the drop
    expect(quality.scale).toBe(0.75);
    run(5, 4, 30);
    expect(quality.scale).toBe(0.5);
    run(60, 4, 30);
    expect(quality.scale).toBe(0.5); // floor
    run(300, 1, 16.7); // 5 s: the cooldown (doubled per drop, now 8 s) is still running
    expect(quality.scale).toBe(0.5);
    run(1200, 1, 16.7); // smooth and cheap for 20 s → steps back up, one level per cooldown
    expect(quality.scale).toBe(1);
  });

  it('holds full quality when rendering is cheap and smooth', () => {
    const quality = new AdaptiveQuality(8);
    let now = 0;
    for (let i = 0; i < 200; i++) {
      now += 16.7;
      quality.record(2, 16.7, now);
    }
    expect(quality.scale).toBe(1);
  });
});
