import { describe, expect, it } from 'vitest';
import { sanitizeBackdrop } from './backdrop';

describe('preview backdrops', () => {
  it('accepts the known kinds', () => {
    expect(sanitizeBackdrop({ kind: 'footage' })).toEqual({ kind: 'footage' });
    expect(sanitizeBackdrop({ kind: 'scenes' })).toEqual({ kind: 'scenes' });
    expect(sanitizeBackdrop({ kind: 'color', color: '#1F38E8' })).toEqual({
      kind: 'color',
      color: '#1F38E8',
    });
    const hash = 'ab'.repeat(32);
    expect(sanitizeBackdrop({ kind: 'image', hash })).toEqual({ kind: 'image', hash });
  });

  it('falls back to none for anything else', () => {
    for (const value of [
      null,
      'footage',
      { kind: 'video' },
      { kind: 'color', color: 'red' },
      { kind: 'color', color: 'url(https://example.com)' },
      { kind: 'image', hash: '../../etc/passwd' },
      { kind: 'image', hash: 'AB'.repeat(32) },
    ]) {
      expect(sanitizeBackdrop(value)).toEqual({ kind: 'none' });
    }
  });

  it('drops unknown fields', () => {
    expect(sanitizeBackdrop({ kind: 'footage', extra: 1 })).toEqual({ kind: 'footage' });
  });
});
