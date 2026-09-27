import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex } from '../core/color';
import { createRng } from '../core/rng';
import { PALETTES } from '../template/palettes';
import { CursorPath } from './cursor';
import {
  minimumJerk,
  minimumJerkVelocity,
  monotoneAt,
  monotonePath,
  monotoneTangents,
  niceTicks,
  PathSampler,
} from './curves';
import { morphRect, phi } from './shape';
import { pickAccent, uiTheme } from './theme';
import { caretOpacity, typedCount, typedFigure, typedText, typingSchedule } from './typing';

describe('monotone cubic interpolation', () => {
  const xs = [0, 1, 2, 3, 4, 5, 6];
  const ys = [12, 18, 15, 15, 28, 26, 58];
  const m = monotoneTangents(xs, ys);

  it('passes through every point', () => {
    xs.forEach((x, i) => {
      expect(monotoneAt(xs, ys, m, x)).toBeCloseTo(ys[i] as number, 9);
    });
  });

  it('never overshoots the data between two points', () => {
    for (let i = 0; i < xs.length - 1; i++) {
      const lo = Math.min(ys[i] as number, ys[i + 1] as number);
      const hi = Math.max(ys[i] as number, ys[i + 1] as number);
      for (let k = 1; k < 50; k++) {
        const y = monotoneAt(xs, ys, m, i + k / 50);
        expect(y).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(y).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
  });

  it('keeps flat stretches flat and extremes level', () => {
    expect(m[2]).toBe(0); // 18 → 15 → 15: a turn
    expect(m[3]).toBe(0);
    for (let k = 1; k < 10; k++) expect(monotoneAt(xs, ys, m, 2 + k / 10)).toBeCloseTo(15, 9);
  });

  it('builds cubic segments that end on the data', () => {
    const points = xs.map((x, i) => ({ x: x * 100, y: 500 - (ys[i] as number) * 5 }));
    const path = monotonePath(points);
    expect(path).toHaveLength(points.length);
    const last = path[path.length - 1];
    expect(last?.[0]).toBe('C');
    if (last?.[0] === 'C') {
      expect(last[5]).toBe(600);
      expect(last[6]).toBe(500 - 58 * 5);
    }
  });
});

describe('path sampling', () => {
  it('finds points by arc length and fractions by x', () => {
    const sampler = new PathSampler([
      ['M', 0, 0],
      ['L', 100, 0],
      ['L', 100, 100],
    ]);
    expect(sampler.length).toBeCloseTo(200, 6);
    expect(sampler.at(0.25)).toEqual({ x: 50, y: 0 });
    expect(sampler.at(0.75).y).toBeCloseTo(50, 6);
    expect(sampler.fractionAtX(50)).toBeCloseTo(0.25, 6);
  });
});

describe('ticks', () => {
  it('rounds to 1, 2, 2.5 or 5 × 10ⁿ', () => {
    expect(niceTicks(0, 58, 4).values).toEqual([0, 20, 40, 60]);
    expect(niceTicks(0, 72.8, 3).values).toEqual([0, 25, 50, 75]);
    expect(niceTicks(0, 0.37, 4).values).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
  });
});

describe('minimum jerk', () => {
  it('starts and ends at rest, symmetric around the midpoint', () => {
    expect(minimumJerk(0)).toBe(0);
    expect(minimumJerk(1)).toBe(1);
    expect(minimumJerk(0.5)).toBeCloseTo(0.5, 12);
    for (const s of [0.1, 0.3, 0.45]) {
      expect(minimumJerk(s) + minimumJerk(1 - s)).toBeCloseTo(1, 12);
    }
    expect(minimumJerkVelocity(0)).toBe(0);
    expect(minimumJerkVelocity(1)).toBe(0);
    expect(minimumJerkVelocity(0.5)).toBeCloseTo(1.875, 12);
  });

  it('moves a cursor along its path by arc length, overshoots and corrects', () => {
    const path = new CursorPath({ x: 0, y: 0 }, 1);
    path.move({ x: 100, y: 0 }, { dur: 0.5, overshoot: 4, correct: 0.2 });
    path.wait(0.1).click();
    expect(path.at(0.5)).toMatchObject({ x: 0, y: 0 });
    // Halfway through the main movement: halfway along its arc.
    expect(path.at(1.25).x).toBeCloseTo(52, 0);
    // At the end of the main movement: past the target, then corrected onto it.
    expect(path.at(1.5).x).toBeCloseTo(104, 6);
    expect(path.at(1.7).x).toBeCloseTo(100, 6);
    expect(path.clicks).toEqual([1.8]);
    expect(path.pressAt(1.79)).toBe(0);
    expect(path.pressAt(1.84)).toBe(1);
    expect(path.pressAt(2.2)).toBe(0);
  });
});

describe('typing', () => {
  it('formats money live as it is typed', () => {
    const typed = typedFigure('€250.00');
    expect(typed?.states).toEqual(['', '€2', '€25', '€250', '€250.', '€250.0', '€250.00']);
    expect(typed?.keys).toEqual(['2', '5', '0', '.', '0', '0']);
    expect(typed?.placeholder).toBe('€0.00');
    expect(typedFigure('8,431')?.states).toEqual(['', '8', '84', '843', '8,431']);
    expect(typedFigure('3.8%')?.states).toEqual(['', '3', '3.', '3.8', '3.8%']);
    expect(typedFigure('no number')).toBeNull();
  });

  it('types plain text grapheme by grapheme', () => {
    expect(typedText('Łódź').states).toEqual(['', 'Ł', 'Łó', 'Łód', 'Łódź']);
  });

  it('has a seeded, human, monotonic rhythm', () => {
    const keys = typedText('maya@halden.studio').keys;
    const a = typingSchedule(keys, createRng('seed'));
    const b = typingSchedule(keys, createRng('seed'));
    expect([...a]).toEqual([...b]);
    expect(a[0]).toBe(0);
    for (let i = 1; i < a.length; i++) expect(a[i] as number).toBeGreaterThan(a[i - 1] as number);
    const gaps = [...a].slice(1).map((t, i) => t - (a[i] as number));
    expect(new Set(gaps.map((g) => g.toFixed(3))).size).toBeGreaterThan(keys.length / 2);
    const fitted = typingSchedule(keys, createRng('seed'), { fit: 1.2 });
    expect(fitted[fitted.length - 1]).toBeCloseTo(1.2, 9);
    expect(typedCount(a, -0.01)).toBe(0);
    expect(typedCount(a, 0)).toBe(1);
    expect(typedCount(a, 99)).toBe(keys.length);
  });

  it('keeps the caret solid while typing, then blinks', () => {
    expect(caretOpacity(1.2, 1)).toBe(1);
    expect(caretOpacity(1 + 0.5 + 0.2, 1)).toBe(1);
    expect(caretOpacity(1 + 0.5 + 0.8, 1)).toBe(0);
    expect(caretOpacity(0.9, 1)).toBe(0);
  });
});

describe('themes and shapes', () => {
  it('picks the palette color that stands out on the UI surface', () => {
    const white = parseHex('#FFFFFF');
    const ink = parseHex('#111111');
    // Cobalt's yellow accent vanishes on a light card: its blue takes over.
    expect(pickAccent(PALETTES.cobalt, white, ink)).toEqual(PALETTES.cobalt.roles.bg);
    // Tangerine on a dark card: the orange background color.
    expect(pickAccent(PALETTES.tangerine, parseHex('#1a1b1e'), ink)).toEqual(
      PALETTES.tangerine.roles.bg,
    );
    // Monochrome palettes fall back to ink.
    expect(pickAccent(PALETTES['mono-light'], white, ink)).toEqual(ink);
  });

  it('keeps text contrast on every theme', () => {
    for (const palette of Object.values(PALETTES)) {
      for (const mode of ['light', 'dark'] as const) {
        const theme = uiTheme(palette, mode);
        expect(contrastRatio(theme.text, theme.surface)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(theme.muted, theme.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme.accentInk, theme.surface)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(theme.success, theme.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('morphs a pill into a circle around the same center, radius continuous', () => {
    let previous = morphRect(100, 50, 300, 52, 26, 0).radius;
    for (let k = 1; k <= 20; k++) {
      const { rect, radius } = morphRect(100, 50, 300, 52, 12, k / 20);
      expect(rect.x + rect.w / 2).toBeCloseTo(100, 9);
      expect(rect.y + rect.h / 2).toBeCloseTo(50, 9);
      expect(Math.abs(radius - previous)).toBeLessThan(26);
      previous = radius;
    }
    const circle = morphRect(100, 50, 300, 52, 12, 1);
    expect(circle.rect.w).toBe(52);
    expect(circle.radius).toBe(26);
  });

  it('computes the normal CDF', () => {
    expect(phi(0)).toBeCloseTo(0.5, 7);
    expect(phi(1.959964)).toBeCloseTo(0.975, 6);
    expect(phi(-1.959964)).toBeCloseTo(0.025, 6);
  });
});
