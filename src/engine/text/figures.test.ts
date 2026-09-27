import { describe, expect, it } from 'vitest';
import { counterWheels, formatFigure, formatMoney, parseFigure, rollWheels } from './figures';

describe('figures', () => {
  it('parses what surrounds a number and writes it back at any value', () => {
    const cases: [string, number, string][] = [
      ['€48.2k', 12.345, '€12.3k'],
      ['12M+', 3, '3M+'],
      ['98%', 97.6, '98%'],
      ['+12.4%', 5, '+5.0%'],
      ['3.2×', 1, '1.0×'],
      ['8,431', 1234.4, '1,234'],
      ['−31%', 7, '−7%'],
      ['+0.6 pt', 0.25, '+0.3 pt'],
    ];
    for (const [written, value, expected] of cases) {
      const figure = parseFigure(written);
      expect(figure).not.toBeNull();
      expect(formatFigure(figure!)).toBe(written);
      expect(formatFigure(figure!, value)).toBe(expected);
    }
    expect(parseFigure('no digits')).toBeNull();
  });

  it('formats money in English with EUR by default', () => {
    expect(formatMoney(27)).toBe('€27.00');
    expect(formatMoney(1234.5, { currency: 'USD' })).toBe('$1,234.50');
  });

  it('turns counter wheels like a mechanical odometer', () => {
    const at = (value: number) =>
      counterWheels(value, { digits: 2 }).map((w) => ('digit' in w ? w.digit : w.char));
    expect(at(7)).toEqual([0, 7]);
    expect(at(19.5)).toEqual([1.5, 9.5]);
    expect(at(18.5)).toEqual([1, 8.5]);
    expect(
      counterWheels(4.9, { decimals: 1 }).map((w) => ('digit' in w ? w.digit : w.char)),
    ).toEqual([4, '.', 9]);
  });

  it('rolls each slot from its old digit to its new one', () => {
    const wheels = rollWheels('€39.00', '€27.00', 0.5, 'down');
    expect(wheels).toEqual([
      { char: '€' },
      { digit: 2.5 },
      { digit: 8 },
      { char: '.' },
      { digit: 0 },
      { digit: 0 },
    ]);
    expect(rollWheels('9', '0', 0.5, 'up')).toEqual([{ digit: 9.5 }]);
    expect(rollWheels('06', '07', 1)).toEqual([{ digit: 0 }, { digit: 7 }]);
  });
});
