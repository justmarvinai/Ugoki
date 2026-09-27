/**
 * Golden frames for templates without a golden file of their own (see tests/support/golden.ts):
 * the poster frame in the template's first two formats, plus a mid-entrance frame — enough to
 * catch unintended changes to layout, type and motion.
 */

import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import type { FormatId } from '@/engine/template/formats';
import { initialState } from '@/engine/template/state';
import { loadTemplate, TEMPLATES } from '@/templates/registry';
import { expectFrame } from '../support/golden';
import { build, render } from '../support/render';

/** Templates with their own, more detailed golden file. */
const OWN_FILE = new Set(['rise', 'line', 'sheen', 'layers']);
const SCALE = 0.3;

beforeAll(async () => {
  await page.viewport(1100, 1000);
});

const entries = TEMPLATES.filter((entry) => !OWN_FILE.has(entry.id));
if (entries.length === 0) test.skip('every template has its own golden file', () => {});

for (const entry of entries) {
  const template = await loadTemplate(entry.id);
  const base = initialState(template);
  const formats = template.formats as readonly FormatId[];
  const [first, second] = formats as [FormatId, FormatId | undefined];
  const slug = (format: FormatId) => format.replace(':', 'x');
  const cases: { name: string; format: FormatId; at: 'poster' | 'entrance' }[] = [
    { name: `${slug(first)}-poster`, format: first, at: 'poster' },
    { name: `${slug(first)}-entrance`, format: first, at: 'entrance' },
    ...(second ? [{ name: `${slug(second)}-poster`, format: second, at: 'poster' as const }] : []),
  ];
  for (const { name, format, at } of cases) {
    test(`${entry.id}-${name}`, async () => {
      const built = await build(template, { ...base, format });
      const { duration, sections } = built.timeline;
      const poster = Math.min(template.poster, duration - 1 / 60);
      const entrance = sections.in.start + (sections.in.end - sections.in.start) * 0.45;
      const t = at === 'poster' ? poster : entrance;
      await expectFrame(render(built, t, SCALE), `${entry.id}-${name}`, {
        backdrop: built.state.transparent,
      });
    });
  }
}
