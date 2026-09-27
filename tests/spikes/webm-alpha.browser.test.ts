/**
 * Spike (Phase 1): transparent WebM via Mediabunny. Transparent Rise frames are encoded as VP9
 * with alpha (WebCodecs has no native VP9-alpha encoding, so Mediabunny encodes the alpha plane
 * as side data), muxed to WebM, decoded again and checked for surviving transparency.
 * Importing the file into Resolve/After Effects is checked by hand (see USER_QUESTIONS.md).
 */

import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
} from 'mediabunny';
import { expect, test } from 'vitest';
import { transparentWebmWorks } from '@/engine/export/probe';
import { initialState } from '@/engine/template/state';
import { loadTemplate } from '@/templates/registry';
import { build, render } from '../support/render';

// Where transparent WebM doesn't round-trip, the product doesn't offer it (ADR-034): CI's
// WebKit encodes frames built from buffers with a later frame's pixels, so this clip — which
// starts on a still frame — once passed there by accident.
const canEncodeVp9 = async () =>
  typeof VideoEncoder !== 'undefined' &&
  (await VideoEncoder.isConfigSupported({ codec: 'vp09.00.10.08', width: 480, height: 270 }))
    .supported === true &&
  (await transparentWebmWorks());

test('transparent WebM round trip keeps the alpha channel', async (context) => {
  if (!(await canEncodeVp9())) context.skip();
  const rise = await loadTemplate('rise');
  const built = await build(rise, { ...initialState(rise), transparent: true });
  const fps = 30;
  const scale = 0.25; // 480 × 270

  const canvas = new OffscreenCanvas(480, 270);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d');
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'vp9', quality: QUALITY_HIGH, alpha: 'keep' });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const started = performance.now();
  const frames = 2 * fps; // 1.5 s → 3.5 s: rise end, hold
  for (let i = 0; i < frames; i++) {
    const t = 1.5 + i / fps;
    const frame = render(built, t, scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame.canvas, 0, 0);
    await source.add(i / fps, 1 / fps);
  }
  await output.finalize();
  const encodeMs = performance.now() - started;
  const buffer = output.target.buffer;
  if (!buffer) throw new Error('no output');
  console.info(
    `webm-alpha ${frames} frames 480x270: ${buffer.byteLength} bytes, ${encodeMs.toFixed(0)} ms`,
  );

  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  expect(track).not.toBeNull();
  expect(await track?.canBeTransparent()).toBe(true);
  const sink = new CanvasSink(track!, { alpha: true });
  const decoded = await sink.getCanvas(1);
  expect(decoded).not.toBeNull();
  const out = decoded!.canvas as OffscreenCanvas | HTMLCanvasElement;
  const read = out.getContext('2d', { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  const data = read?.getImageData(0, 0, out.width, out.height).data;
  if (!data) throw new Error('no pixels');
  let clear = 0;
  let solid = 0;
  let partial = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i] ?? 0;
    if (a < 8) clear++;
    else if (a > 247) solid++;
    else partial++;
  }
  const total = data.length / 4;
  console.info(`alpha histogram: clear ${clear}, solid ${solid}, partial ${partial}`);
  // Encoders pick different bitrates (Chromium ~46 KB, Firefox ~121 KB for these 60 frames), so
  // a lossy alpha plane softens edges by different amounts; assert the property, not a count.
  expect(clear / total).toBeGreaterThan(0.7); // the background stays transparent
  expect((solid + partial) / total).toBeGreaterThan(0.03); // the headline keeps its coverage
  expect(solid / total).toBeGreaterThan(0.01); // with an opaque core
  expect(partial).toBeGreaterThan(0); // and anti-aliased edges keep intermediate alpha
});
