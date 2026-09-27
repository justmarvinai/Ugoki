/**
 * Golden-frame comparison (docs/05-architecture.md §17): shows a rendered frame as a DOM canvas
 * and compares it with the Chromium reference in `__screenshots__` (accept intentional changes
 * with `pnpm test:golden --update`).
 */

import { expect } from 'vitest';
import { page } from 'vitest/browser';
import type { Frame } from './render';

/** Transparent overlays are shown over this neutral grey, so the reference shows them. */
const BACKDROP = '#5a5d61';

export async function expectFrame(
  frame: Frame,
  name: string,
  options: { backdrop?: boolean } = {},
) {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  canvas.style.cssText = `display:block;width:${frame.width}px;height:${frame.height}px`;
  const ctx = canvas.getContext('2d');
  if (options.backdrop && ctx) {
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, frame.width, frame.height);
  }
  ctx?.drawImage(frame.canvas, 0, 0);
  document.body.replaceChildren(canvas);
  await expect.element(page.elementLocator(canvas)).toMatchScreenshot(name, {
    comparatorName: 'pixelmatch',
    comparatorOptions: { threshold: 0.1, allowedMismatchedPixelRatio: 0.002 },
  });
}
