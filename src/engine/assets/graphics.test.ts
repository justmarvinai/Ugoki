import { describe, expect, it } from 'vitest';
import { c, resolveProps } from '../template/controls';
import { defineTemplate } from '../template/define';
import { PLACEHOLDERS, placeholderGraphic } from './placeholders';

const HASH = 'a'.repeat(64);

describe('image controls', () => {
  const logo = c.image({
    label: 'Logo',
    accept: 'logo',
    default: { kind: 'placeholder', id: 'nova' },
  });
  const optional = c.image({
    label: 'Badge',
    accept: 'logo',
    default: { kind: 'placeholder', id: 'aero' },
    optional: true,
  });
  const schema = { logo, optional };

  it('keeps valid references and repairs everything else', () => {
    const props = resolveProps(schema, {
      logo: { kind: 'user', hash: HASH, name: 'mark.svg‮', extra: 1 },
      optional: null,
    });
    expect(props.logo).toEqual({ kind: 'user', hash: HASH, name: 'mark.svg' });
    expect(props.optional).toBeNull();

    const repaired = resolveProps(schema, {
      logo: { kind: 'user', hash: 'not-a-hash' },
      optional: { kind: 'placeholder', id: 'unknown' },
    });
    expect(repaired.logo).toEqual({ kind: 'placeholder', id: 'nova' });
    expect(repaired.optional).toEqual({ kind: 'placeholder', id: 'aero' });

    // A required slot can't be emptied; other placeholders of the same kind are fine.
    expect(resolveProps(schema, { logo: null }).logo).toEqual({ kind: 'placeholder', id: 'nova' });
    expect(resolveProps(schema, { logo: { kind: 'placeholder', id: 'halden' } }).logo).toEqual({
      kind: 'placeholder',
      id: 'halden',
    });
    expect(resolveProps(schema, { logo: 'nova' }).logo).toEqual({
      kind: 'placeholder',
      id: 'nova',
    });
  });

  it('requires templates to give image controls a placeholder default', () => {
    expect(() =>
      defineTemplate({
        id: 'bad',
        version: 1,
        meta: { name: 'Bad', tagline: '', category: 'logo-branding', tags: [], useCases: [] },
        formats: ['16:9'],
        structure: 'in-hold-out',
        duration: { default: 4, min: 3, max: 8 },
        alpha: 'none',
        poster: 1,
        palettes: [{ kind: 'library', id: 'ink' }],
        pairings: ['grotesk'],
        controls: {
          logo: c.image({ label: 'Logo', accept: 'logo', default: { kind: 'user', hash: HASH } }),
        },
        looks: [
          { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
        ],
        timing: () => ({ in: 1, out: 0 }),
        build: () => ({ render: () => {} }),
      }),
    ).toThrow(/placeholder default/);
  });
});

describe('placeholder logos', () => {
  it('import as vector artwork in currentColor with sensible proportions', () => {
    for (const id of PLACEHOLDERS.logo) {
      const graphic = placeholderGraphic(id);
      expect(graphic?.kind).toBe('vector');
      if (graphic?.kind !== 'vector') continue;
      expect(graphic.shapes.length).toBeGreaterThan(1);
      expect(graphic.shapes.every((shape) => shape.fill === 'current')).toBe(true);
      // Horizontal lockups: mark plus wordmark, a little under 100 units tall.
      expect(graphic.ink.h).toBeGreaterThan(95);
      expect(graphic.ink.w / graphic.ink.h).toBeGreaterThan(2);
      expect(graphic.ink.w / graphic.ink.h).toBeLessThan(4.5);
    }
    expect(placeholderGraphic('nova')).toBe(placeholderGraphic('nova'));
    expect(placeholderGraphic('missing')).toBeNull();
  });
});
