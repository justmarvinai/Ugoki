import { describe, expect, it } from 'vitest';
import { ENERGIES } from './energy';
import { beatLength, createTimeline, sequence } from './timeline';

describe('sequences', () => {
  it('derives beat lengths from reading speed, clamped to 0.3–1.2 s', () => {
    expect(beatLength('Hi')).toBeCloseTo(0.37);
    expect(beatLength('')).toBeCloseTo(0.3);
    expect(beatLength('A very long statement that keeps going')).toBeCloseTo(1.2);
    expect(beatLength('Hi', 2)).toBeCloseTo(0.74);
  });

  it('lays beats out back to back with gaps and reports the total', () => {
    const seq = sequence(['One', 'Two words', 0.5], { gap: 0.1 });
    expect(seq.beats.map((b) => b.index)).toEqual([0, 1, 2]);
    expect(seq.beats[1]?.start).toBeCloseTo((seq.beats[0]?.end ?? 0) + 0.1);
    expect(seq.total).toBeCloseTo(seq.beats[2]?.end ?? 0);
    expect(seq.beats[2]!.end - seq.beats[2]!.start).toBeCloseTo(0.5);
  });

  it('finds the beat at a time', () => {
    const seq = sequence([1, 1, 1]);
    expect(seq.at(-0.5)).toMatchObject({ index: 0, progress: 0 });
    expect(seq.at(1.5)).toMatchObject({ index: 1, progress: 0.5 });
    expect(seq.at(9)).toMatchObject({ index: 2, progress: 1 });
    expect(sequence([]).at(1).index).toBe(-1);
  });

  it('fits a fixed duration proportionally within readable limits', () => {
    const fitted = sequence(['a', 'bb', 'ccc'], { fit: 2.4 });
    expect(fitted.total).toBeCloseTo(2.4, 1);
    const squeezed = sequence(['one', 'two', 'three'], { fit: 0.3 });
    for (const beat of squeezed.beats) expect(beat.end - beat.start).toBeCloseTo(0.3);
  });
});

describe('transition timelines', () => {
  const make = (duration: number, energy: keyof typeof ENERGIES = 'balanced', cut?: number) =>
    createTimeline({
      structure: 'transition',
      spec: { in: 0, out: 0, ...(cut === undefined ? {} : { cut }) },
      energy: ENERGIES[energy],
      duration,
      bounds: { min: 0.6, max: 2.4 },
    });

  it('cuts at half the duration and splits in/out there', () => {
    const tl = make(1.2);
    expect(tl.cut).toBeCloseTo(0.6);
    expect(tl.sections.in).toEqual({ start: 0, end: 0.6 });
    expect(tl.sections.out.start).toBeCloseTo(0.6);
    expect(tl.sections.out.end).toBeCloseTo(1.2);
    expect(make(1.6, 'balanced', 0.25).cut).toBeCloseTo(0.4);
  });

  it('keeps the length the user set, whatever the energy', () => {
    for (const energy of ['calm', 'balanced', 'punchy'] as const) {
      const tl = make(1.2, energy);
      expect(tl.duration).toBe(1.2);
      expect(tl.p(0.3, 'in', { dur: 0.6 })).toBeCloseTo(0.5);
    }
  });

  it('clamps the duration and says so', () => {
    const tl = make(5);
    expect(tl.duration).toBe(2.4);
    expect(tl.cut).toBeCloseTo(1.2);
    expect(tl.warnings).toEqual([{ kind: 'duration-clamped', requested: 5, used: 2.4 }]);
  });
});
