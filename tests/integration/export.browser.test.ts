/**
 * Exports through a real module worker (docs/07-export.md §3): the page starts a job with the
 * client, gets progress and preview frames, and receives the file — or cancels.
 */

import { unzipSync } from 'fflate';
import { expect, test } from 'vitest';
import { importSvg } from '@/engine/assets/svg';
import { type ExportEndpoint, type ExportJob, probeExport, startExport } from '@/engine/host';
import { initialState } from '@/engine/template/state';
import { loadTemplate } from '@/templates/registry';

const worker = (): ExportEndpoint =>
  new Worker(new URL('../support/export.worker.ts', import.meta.url), { type: 'module' });

test('exports a PNG sequence through the export worker, with progress and previews', async () => {
  const sheen = await loadTemplate('sheen');
  const svg = importSvg(
    '<svg viewBox="0 0 100 40"><rect width="100" height="40" fill="#1ea672"/></svg>',
  );
  if (!svg.ok) throw new Error(svg.detail);
  const hash = 'b'.repeat(64);
  const state = {
    ...initialState(sheen),
    duration: 3,
    props: { ...initialState(sheen).props, logo: { kind: 'user', hash, name: 'mark.svg' } },
  };
  const job: ExportJob = {
    state,
    settings: { format: 'png-zip', resolution: 180, fps: 24, quality: 'standard' },
  };
  let progress = 0;
  let previews = 0;
  const run = startExport(worker(), job, {
    assets: [{ hash, asset: { kind: 'vector', graphic: svg.graphic } }],
    onProgress: ({ frame, frames }) => {
      progress = frame / frames;
    },
    onPreview: (frame) => {
      previews++;
      expect(frame.width).toBeLessThanOrEqual(480);
      frame.close();
    },
  });
  const result = await run.done;
  expect(result.name).toBe('ugoki-sheen-320x180-24fps.zip');
  expect(result.frames).toBe(72);
  expect(progress).toBe(1);
  expect(previews).toBeGreaterThan(0);
  const files = unzipSync(new Uint8Array(await (result.blob as Blob).arrayBuffer()));
  expect(Object.keys(files)).toHaveLength(73);
  // The user's green mark, not the placeholder, is in the finished frame.
  const png = files['ugoki-sheen-320x180-24fps/frame_00072.png'];
  const bitmap = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(320, 180);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx?.drawImage(bitmap, 0, 0);
  const center = ctx?.getImageData(160, 72, 1, 1).data;
  expect([center?.[0], center?.[1], center?.[2]]).toEqual([30, 166, 114]);
});

test('cancels an export in the worker', async () => {
  const rise = await loadTemplate('rise');
  const run = startExport(
    worker(),
    {
      state: { ...initialState(rise), duration: 12 },
      settings: { format: 'png-zip', resolution: 360, fps: 60, quality: 'max' },
    },
    { onProgress: () => run.cancel() },
  );
  await expect(run.done).rejects.toThrow('cancelled');
});

test('reports what failed, and where', async () => {
  const run = startExport(worker(), {
    state: { ...initialState(await loadTemplate('rise')), templateId: 'nope' },
    settings: { format: 'still', resolution: 180, fps: 30, quality: 'standard' },
  });
  await expect(run.done).rejects.toMatchObject({ name: 'ExportFailure', stage: 'load' });
});

test('an export worker verifies which video formats work here', async () => {
  const encoders = await probeExport(worker());
  console.info(`verified encoders ${JSON.stringify(encoders)}`);
  expect(encoders).not.toBeNull();
  // Every engine Ugoki supports makes some video; Chromium and Firefox keep transparency too.
  expect(encoders?.vp9 || encoders?.avc).toBe(true);
  if (/Chrome\/|Firefox\//.test(navigator.userAgent)) expect(encoders?.vp9Alpha).toBe(true);
  // The worker is ended as soon as it answers, as pages do: again and again, the same answer
  // (CI's Firefox once lost the page when codecs were still busy at that moment).
  for (let round = 0; round < 3; round++) expect(await probeExport(worker())).toEqual(encoders);
});
