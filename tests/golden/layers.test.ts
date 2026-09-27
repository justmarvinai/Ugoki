/** Golden frames for Layers (see tests/support/golden.ts). */

import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { applyLook, type DesignState, initialState } from '@/engine/template/state';
import { loadTemplate } from '@/templates/registry';
import { expectFrame } from '../support/golden';
import { build, render } from '../support/render';

const layers = await loadTemplate('layers');
const base = initialState(layers);
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
  { name: 'layers-16x9-entering', t: 0.3, state: () => base },
  { name: 'layers-16x9-leaving', t: 0.85, state: () => base },
  {
    name: 'layers-9x16-diagonal',
    t: 0.35,
    state: patched({ format: '9:16' }, { direction: 'down-right', layers: 5 }),
  },
  {
    name: 'layers-1x1-mono-up',
    t: 0.4,
    state: () => ({
      ...applyLook(layers, base, layers.looks[1]!),
      format: '1:1',
      props: { ...base.props, direction: 'up', layers: 4 },
    }),
  },
  {
    name: 'layers-4x5-brand-bold',
    t: 0.3,
    state: () => ({ ...applyLook(layers, base, layers.looks[2]!), format: '4:5' }),
  },
];

for (const { name, t, state } of CASES) {
  test(name, async () => {
    await expectFrame(render(await build(layers, state()), t, SCALE), name, { backdrop: true });
  });
}
