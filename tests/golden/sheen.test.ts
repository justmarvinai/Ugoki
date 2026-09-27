/** Golden frames for Sheen (see tests/support/golden.ts). */

import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { applyLook, type DesignState, initialState } from '@/engine/template/state';
import { loadTemplate } from '@/templates/registry';
import { expectFrame } from '../support/golden';
import { build, render } from '../support/render';

const sheen = await loadTemplate('sheen');
const base = initialState(sheen);
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
  { name: 'sheen-16x9-emerging', t: 0.6, state: () => base },
  { name: 'sheen-16x9-sweep', t: 1.45, state: () => base },
  { name: 'sheen-16x9-card', t: 4, state: () => base },
  { name: 'sheen-9x16-card', t: 4, state: patched({ format: '9:16' }) },
  {
    name: 'sheen-16x9-midnight-sweep',
    t: 1.6,
    state: () => applyLook(sheen, base, sheen.looks[1]!),
  },
  {
    name: 'sheen-1x1-paper-sweep',
    t: 1.5,
    state: () => ({ ...applyLook(sheen, base, sheen.looks[2]!), format: '1:1' }),
  },
  {
    name: 'sheen-4x5-halden-accent',
    t: 1.5,
    state: patched(
      { format: '4:5' },
      { logo: { kind: 'placeholder', id: 'halden' }, color: 'accent' },
    ),
  },
  {
    name: 'sheen-16x9-aero-transparent',
    t: 4,
    state: patched({ transparent: true }, { logo: { kind: 'placeholder', id: 'aero' } }),
  },
];

for (const { name, t, state } of CASES) {
  test(name, async () => {
    const built = await build(sheen, state());
    await expectFrame(render(built, t, SCALE), name, { backdrop: built.state.transparent });
  });
}
