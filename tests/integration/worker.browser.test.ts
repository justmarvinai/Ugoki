/**
 * The render path end to end in each browser: a real module worker, an OffscreenCanvas
 * transferred from the page, HarfBuzz + fonts loaded inside the worker, Rise rendered,
 * played and snapshotted. Also records the worker's capabilities (Phase 1 platform spikes).
 */

import { afterEach, expect, test } from 'vitest';
import { RenderClient, type WorkerMessage } from '@/engine/host';

let client: RenderClient | null = null;

afterEach(() => {
  client?.dispose();
  client = null;
  document.body.replaceChildren();
});

function next<T extends WorkerMessage['type']>(
  target: RenderClient,
  type: T,
  match: (message: Extract<WorkerMessage, { type: T }>) => boolean = () => true,
): Promise<Extract<WorkerMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for "${type}"`));
    }, 10_000);
    const unsubscribe = target.subscribe((message) => {
      if (message.type === 'error') {
        clearTimeout(timer);
        unsubscribe();
        reject(new Error(`${message.phase}: ${message.message}`));
        return;
      }
      if (message.type !== type) return;
      const typed = message as Extract<WorkerMessage, { type: T }>;
      if (!match(typed)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(typed);
    });
  });
}

test('renders Rise through a real render worker', async () => {
  const worker = new Worker(new URL('../support/render.worker.ts', import.meta.url), {
    type: 'module',
  });
  client = new RenderClient(worker);

  const probed = next(client, 'capabilities');
  client.probe();
  const { capabilities } = await probed;
  console.info(`capabilities ${JSON.stringify(capabilities)}`);
  expect(capabilities.offscreenCanvas).toBe(true);

  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  client.attach('stage', canvas.transferControlToOffscreen(), { width: 480, height: 270, dpr: 1 });

  const built = next(client, 'built');
  client.load('stage', 'rise');
  expect((await built).duration).toBe(5);

  const seeked = next(client, 'frame', (frame) => Math.abs(frame.t - 2.2) < 1e-9);
  client.seek('stage', 2.2);
  await seeked;

  // A still rendered in the worker has the headline in it.
  const blob = await client.snapshot('stage', 2.2, 720);
  const bitmap = await createImageBitmap(blob);
  expect([bitmap.width, bitmap.height]).toEqual([1280, 720]);
  const probe = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx?.drawImage(bitmap, 0, 0);
  const data = ctx?.getImageData(0, 0, bitmap.width, bitmap.height).data ?? new Uint8ClampedArray();
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 255) < 60) dark++;
  expect(dark).toBeGreaterThan(bitmap.width * bitmap.height * 0.02);

  // Playback advances on the worker's clock.
  const advanced = next(client, 'frame', (frame) => frame.playing && frame.t > 2.5);
  client.play('stage');
  await advanced;
});
