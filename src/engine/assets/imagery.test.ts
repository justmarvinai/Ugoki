import { describe, expect, it } from 'vitest';
import { initials } from './imagery';

describe('initials', () => {
  it('takes the first letters of the first and last word', () => {
    expect(initials('Élodie Marchand')).toBe('ÉM');
    expect(initials('  amara   okafor ')).toBe('AO');
    expect(initials('Kai')).toBe('K');
    expect(initials('Noa van der Lindqvist')).toBe('NL');
    expect(initials('@halden.studio')).toBe('H');
    expect(initials('   ')).toBe('');
  });
});
