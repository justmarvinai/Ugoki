import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/engine/host';
import { TEMPLATES } from '@/templates/registry';
import { CATEGORY_PAGES, editorHref, formatFor, matchesQuery } from './catalog';

const found = (query: string) =>
  TEMPLATES.filter((entry) => matchesQuery(entry, query)).map((entry) => entry.id);

const entry = (id: string) => {
  const match = TEMPLATES.find((template) => template.id === id);
  if (!match) throw new Error(id);
  return match;
};

describe('gallery search', () => {
  it('matches names, categories, tags and use cases, ignoring case and accents', () => {
    expect(found('rise')).toEqual(['rise']);
    expect(found('LOWER THIRDS')).toEqual(['line', 'broadcast', 'capsule']);
    expect(found('podcast')).toEqual(expect.arrayContaining(['decode', 'capsule', 'episode']));
    expect(found('wedding')).toEqual(['cinematic']);
    expect(found('YouTube')).toEqual(expect.arrayContaining(['rise', 'capsule', 'episode']));
    expect(found('sale')).toEqual(expect.arrayContaining(['deal', 'sale']));
    expect(found('décode')).toEqual(['decode']);
  });

  it('needs every word, and takes plurals loosely', () => {
    expect(found('logo light')).toEqual(['sheen']);
    expect(found('weddings')).toEqual(['cinematic']);
    expect(found('reels').length).toBeGreaterThan(1);
    expect(found('   ')).toHaveLength(TEMPLATES.length);
    expect(found('zebra')).toEqual([]);
  });
});

describe('category pages', () => {
  it('have copy for every category, without banned words or exclamation marks', () => {
    expect(CATEGORY_PAGES.map((page) => page.id)).toEqual(CATEGORIES.map((c) => c.id));
    const banned =
      /revolutionary|unleash|supercharge|seamless|effortless|magic|next-level|ai-powered|stunning|!/i;
    for (const page of CATEGORY_PAGES) {
      for (const text of [page.heading, page.intro, page.title, page.description]) {
        expect(text.length).toBeGreaterThan(5);
        expect(text).not.toMatch(banned);
      }
      expect(page.description.length).toBeLessThanOrEqual(170);
    }
  });
});

describe('editor links', () => {
  it('carry only the choices that change something', () => {
    expect(editorHref(entry('rise'))).toBe('/editor/rise');
    expect(editorHref(entry('rise'), { format: '16:9', headline: '  ', look: 0 })).toBe(
      '/editor/rise',
    );
    expect(editorHref(entry('punch'), { format: '16:9' })).toBe('/editor/punch?format=16:9');
    expect(editorHref(entry('rise'), { headline: 'Hello & bye', look: 2 })).toBe(
      '/editor/rise?headline=Hello%20%26%20bye&look=2',
    );
  });

  it('fall back to a template’s first format when it lacks the gallery’s', () => {
    expect(formatFor(['9:16', '1:1'], '16:9')).toBe('9:16');
    expect(formatFor(['9:16', '1:1'], '1:1')).toBe('1:1');
  });
});
