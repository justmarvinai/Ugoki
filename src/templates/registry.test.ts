import { describe, expect, it } from 'vitest';
import { loadTemplate, TEMPLATES, templateEntry } from './registry';

describe('template registry', () => {
  it('has unique ids', () => {
    const ids = TEMPLATES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const entry of TEMPLATES) {
    it(`${entry.id}: metadata matches the template definition`, async () => {
      const template = await loadTemplate(entry.id);
      expect(template.id).toBe(entry.id);
      expect(template.meta.name).toBe(entry.name);
      expect(template.meta.tagline).toBe(entry.tagline);
      expect(template.meta.category).toBe(entry.category);
      expect(template.meta.tags).toEqual(entry.tags);
      expect(template.meta.useCases).toEqual(entry.useCases);
      expect(template.formats).toEqual(entry.formats);
      expect(template.duration).toEqual(entry.duration);
      expect(template.structure).toBe(entry.structure);
      expect(template.alpha).toBe(entry.alpha);
      expect(template.looks.length).toBe(3);
    });
  }

  it('rejects unknown ids, including prototype keys', async () => {
    await expect(loadTemplate('nope')).rejects.toThrow('Unknown template');
    await expect(loadTemplate('constructor')).rejects.toThrow('Unknown template');
    expect(templateEntry('rise')?.name).toBe('Rise');
  });
});
