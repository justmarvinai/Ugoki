import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { springProgress } from '../core/spring';
import { InertialScroll, SpringChain, springRange } from './motion';
import { streamSchedule, streamTokens } from './stream';

describe('inertial scroll', () => {
  it('drags, glides out exponentially and lands exactly', () => {
    const scroll = new InertialScroll({ max: 2000 }).flick({ at: 1, to: 600 });
    const [flick] = scroll.timings;
    expect(scroll.at(0.5)).toBe(0);
    expect(scroll.at(1)).toBe(0);
    expect(scroll.at(flick!.end)).toBeCloseTo(600, 6);
    expect(scroll.at(flick!.end + 3)).toBeCloseTo(600, 6);
    // Continuous and monotonic all the way, fastest at the release.
    let previous = 0;
    let fastest = { v: 0, t: 0 };
    for (let t = 1; t <= flick!.end; t += 1 / 240) {
      const x = scroll.at(t);
      expect(x).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(x - previous).toBeLessThan(40);
      previous = x;
      const v = scroll.velocity(t);
      if (v > fastest.v) fastest = { v, t };
    }
    expect(fastest.t).toBeCloseTo(flick!.release, 1);
    // One τ after the release, the speed has decayed to ~1/e.
    const v0 = scroll.velocity(flick!.release + 0.002);
    const v1 = scroll.velocity(flick!.release + 0.002 + 0.325);
    expect(v1 / v0).toBeCloseTo(Math.exp(-1), 1);
    // Settled means within 1% of the travel.
    expect(600 - scroll.at(flick!.settled)).toBeLessThanOrEqual(6.01);
  });

  it('rubber-bands off the end and rests on it', () => {
    const scroll = new InertialScroll({ max: 1000, limit: 80 }).flick({ at: 0, to: 1400 });
    const [flick] = scroll.timings;
    expect(flick!.bounced).toBe(true);
    let peak = 0;
    for (let t = 0; t <= flick!.end; t += 1 / 240) peak = Math.max(peak, scroll.at(t));
    expect(peak).toBeGreaterThan(1000);
    expect(peak).toBeLessThan(1080);
    expect(scroll.at(flick!.end + 0.5)).toBeCloseTo(1000, 0);
  });

  it('catches a glide where the finger lands', () => {
    const scroll = new InertialScroll({ max: 3000 }).flick({ at: 0, to: 800 });
    const caught = scroll.at(0.4);
    scroll.flick({ at: 0.4, to: 1500 });
    expect(scroll.at(0.4)).toBeCloseTo(caught, 9);
    expect(scroll.position).toBe(1500);
  });
});

describe('coupled springs', () => {
  const chain = new SpringChain({ links: 4, lead: 'snappy', follow: 'snappy' });

  it('leads with the spring and trails down the chain', () => {
    for (const t of [0.05, 0.1, 0.2]) {
      expect(chain.at(0, t)).toBeCloseTo(springProgress(t, 'snappy'), 3);
      for (let i = 1; i < 4; i++) expect(chain.at(i, t)).toBeLessThan(chain.at(i - 1, t));
    }
    expect(chain.at(2, 0)).toBe(0);
    for (let i = 0; i < 4; i++) expect(chain.at(i, chain.settle + 0.01)).toBeCloseTo(1, 2);
  });

  it('adds a delay per link', () => {
    const delayed = new SpringChain({ links: 3, delay: 0.1 });
    expect(delayed.at(2, 0.2)).toBe(0);
    expect(delayed.at(1, 0.15)).toBeCloseTo(new SpringChain({ links: 3 }).at(1, 0.05), 6);
  });
});

describe('spring range', () => {
  it('stretches toward its travel and settles', () => {
    const from = { start: 0, end: 50 };
    const to = { start: 100, end: 150 };
    expect(springRange(0, from, to)).toEqual(from);
    const mid = springRange(0.08, from, to);
    expect(mid.end - mid.start).toBeGreaterThan(50);
    const done = springRange(3, from, to);
    expect(done.start).toBeCloseTo(100, 3);
    expect(done.end).toBeCloseTo(150, 3);
  });
});

describe('streaming text', () => {
  it('cuts text into tokens that join back into it', () => {
    const text = 'Done. Your launch video is ready — exported in extraordinary 4K.';
    const tokens = streamTokens(text);
    expect(tokens.join('')).toBe(text);
    expect(tokens).toContain('.');
    // Long words come in pieces of three to five letters; short words stay whole.
    expect(tokens.slice(tokens.indexOf(' extr'), tokens.indexOf(' extr') + 3)).toEqual([
      ' extr',
      'aord',
      'inary',
    ]);
    expect(tokens).toContain(' launch');
  });

  it('arrives on a seeded, uneven, monotonic schedule', () => {
    const tokens = streamTokens('Your video is ready. It is 15 seconds long and exported as MP4.');
    const a = streamSchedule(tokens, createRng('answer'));
    const b = streamSchedule(tokens, createRng('answer'));
    expect([...a]).toEqual([...b]);
    expect(a[0]).toBe(0);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThanOrEqual(a[i - 1] as number);
    const fitted = streamSchedule(tokens, createRng('answer'), { fit: 1.3 });
    expect(fitted[fitted.length - 1]).toBeCloseTo(1.3, 9);
  });
});
