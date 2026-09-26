/**
 * Golden frames for Rise (docs/05-architecture.md §17). References live in `__screenshots__`
 * and are Chromium-referenced; accept intentional changes with `pnpm test:golden --update`.
 * Exact determinism (two renders identical) is asserted separately in every browser.
 */

import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import type { DesignState } from '@/engine/template/state';
import { applyLook, initialState } from '@/engine/template/state';
import { loadTemplate } from '@/templates/registry';
import { build, type Frame, render } from '../support/render';

const rise = await loadTemplate('rise');
const base = initialState(rise);
const SCALE = 0.4;

beforeAll(async () => {
  await page.viewport(1100, 1000);
});

/** Shows a rendered frame as a DOM canvas and compares it with the reference. */
async function expectFrame(frame: Frame, name: string) {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  canvas.style.cssText = `display:block;width:${frame.width}px;height:${frame.height}px`;
  canvas.getContext('2d')?.drawImage(frame.canvas, 0, 0);
  document.body.replaceChildren(canvas);
  await expect.element(page.elementLocator(canvas)).toMatchScreenshot(name, {
    comparatorName: 'pixelmatch',
    comparatorOptions: { threshold: 0.1, allowedMismatchedPixelRatio: 0.002 },
  });
}

const CASES: { name: string; t: number; state: () => DesignState }[] = [
  { name: 'rise-16x9-hold', t: rise.poster, state: () => base },
  { name: 'rise-16x9-rising', t: 0.45, state: () => base },
  { name: 'rise-16x9-exit', t: 4.2, state: () => base },
  { name: 'rise-9x16-hold', t: rise.poster, state: () => ({ ...base, format: '9:16' }) },
  { name: 'rise-1x1-hold', t: rise.poster, state: () => ({ ...base, format: '1:1' }) },
  { name: 'rise-4x5-hold', t: rise.poster, state: () => ({ ...base, format: '4:5' }) },
  {
    name: 'rise-16x9-ink',
    t: rise.poster,
    state: () => applyLook(rise, base, rise.looks[1]!),
  },
  {
    name: 'rise-16x9-brand-bold',
    t: rise.poster,
    state: () => applyLook(rise, base, rise.looks[2]!),
  },
  {
    name: 'rise-16x9-editorial-center',
    t: rise.poster,
    state: () => ({ ...base, pairing: 'editorial', props: { ...base.props, align: 'center' } }),
  },
  {
    name: 'rise-1x1-max-length',
    t: rise.poster,
    state: () => ({
      ...base,
      format: '1:1',
      props: {
        ...base.props,
        headline: 'Ölçü, Łódź & Ærø: 1,234 Jahre Straßenfußball in 60 Zeichen!',
      },
    }),
  },
  {
    name: 'rise-16x9-transparent',
    t: rise.poster,
    state: () => ({ ...base, transparent: true }),
  },
];

for (const { name, t, state } of CASES) {
  test(name, async () => {
    await expectFrame(render(await build(rise, state()), t, SCALE), name);
  });
}
