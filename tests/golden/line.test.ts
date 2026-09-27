/** Golden frames for Line (see tests/support/golden.ts). */

import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { applyLook, type DesignState, initialState } from '@/engine/template/state';
import { loadTemplate } from '@/templates/registry';
import { expectFrame } from '../support/golden';
import { build, render } from '../support/render';

const line = await loadTemplate('line');
const base = initialState(line);
const SCALE = 0.4;
const patched =
  (patch: Partial<DesignState>, props: Record<string, unknown> = {}) =>
  () => ({
    ...base,
    ...patch,
    props: { ...base.props, ...props },
  });

beforeAll(async () => {
  await page.viewport(1100, 1000);
});

const CASES: { name: string; t: number; state: () => DesignState }[] = [
  { name: 'line-16x9-hold', t: line.poster, state: () => base },
  { name: 'line-16x9-emerging', t: 0.3, state: () => base },
  { name: 'line-16x9-exit', t: 5.62, state: () => base },
  { name: 'line-9x16-hold', t: line.poster, state: patched({ format: '9:16' }) },
  {
    name: 'line-16x9-paper-shadow',
    t: line.poster,
    state: () => ({
      ...applyLook(line, base, line.looks[1]!),
      props: { ...base.props, shadow: true },
    }),
  },
  {
    name: 'line-16x9-brand-bold',
    t: line.poster,
    state: () => applyLook(line, base, line.looks[2]!),
  },
  {
    name: 'line-1x1-right-large',
    t: line.poster,
    state: patched({ format: '1:1' }, { anchor: 'bottom-right', size: 'l' }),
  },
  {
    name: 'line-4x5-editorial-top',
    t: line.poster,
    state: patched({ format: '4:5', pairing: 'editorial' }, { anchor: 'top-center' }),
  },
];

for (const { name, t, state } of CASES) {
  test(name, async () => {
    await expectFrame(render(await build(line, state()), t, SCALE), name, { backdrop: true });
  });
}
