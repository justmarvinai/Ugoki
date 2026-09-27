/**
 * Diagnosis (temporary): WebKit's transparent WebM export decodes with ~2% of the design's alpha
 * coverage while the Phase 1 spike's round trip keeps it. Logs, per variant, the decoded alpha
 * coverage over time (× the preview's) and the color/alpha packet sizes; and what VideoFrames
 * made from canvases of each size carry. Asserts nothing — removed once the cause is fixed.
 */

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  EncodedPacketSink,
  Input,
  Output,
  QUALITY_HIGH,
  Quality,
  WebMOutputFormat,
} from 'mediabunny';
import { test } from 'vitest';
import { createCompositor } from '@/engine/compositor';
import { runExport } from '@/engine/export/run';
import { type ExportSettings, motionBudget } from '@/engine/export/settings';
import { FrameRenderer } from '@/engine/runtime/frame';
import { type BuiltScene, buildScene } from '@/engine/runtime/scene';
import { type DesignState, initialState } from '@/engine/template/state';
import { loadTemplate } from '@/templates/registry';
import { textEngine } from '../support/render';

const FPS = 15;
const FRAMES = 45;
const TIMES = [0.4, 1, 5 / 3, 2.2, 2.8];
const SETTINGS: ExportSettings = { format: 'webm', resolution: 180, fps: FPS, quality: 'standard' };

type SourceOptions = Omit<ConstructorParameters<typeof CanvasSource>[1], 'codec'>;
const OURS: SourceOptions = {
  quality: new Quality({ bitrate: 5_000_000 }),
  keyFrameInterval: 2,
  latencyMode: 'quality',
};

const canEncodeVp9 = async () =>
  typeof VideoEncoder !== 'undefined' &&
  (await VideoEncoder.isConfigSupported({ codec: 'vp09.00.10.08', width: 320, height: 180 }))
    .supported === true;

function coverage(data: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 3; i < data.length; i += 4) sum += data[i] ?? 0;
  return sum / 255;
}

function read(source: CanvasImageSource, width: number, height: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d');
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function renderInto(built: BuiltScene, ctx: OffscreenCanvasRenderingContext2D, t: number) {
  new FrameRenderer(createCompositor({ gpu: false })).render(built, ctx, {
    t,
    scale: ctx.canvas.width / built.frame.width,
    ...motionBudget(SETTINGS),
    frameDuration: 1 / FPS,
  });
}

async function scene(): Promise<{ state: DesignState; built: BuiltScene }> {
  const template = await loadTemplate('line');
  const state: DesignState = { ...initialState(template), duration: 3 };
  return { state, built: buildScene(template, state, await textEngine()) };
}

async function previews(built: BuiltScene, width: number, height: number) {
  const out = new Map<number, number>();
  for (const t of TIMES) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    renderInto(built, ctx, t);
    out.set(t, coverage(read(canvas, width, height)));
  }
  return out;
}

async function describeVideo(
  blob: Blob,
  width: number,
  height: number,
  expected: Map<number, number>,
): Promise<string> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) return 'no track';
  const sink = new CanvasSink(track, { alpha: true });
  const shares: string[] = [];
  for (const t of TIMES) {
    const frame = await sink.getCanvas(t + 0.001);
    const share = frame
      ? coverage(read(frame.canvas as OffscreenCanvas, width, height)) / (expected.get(t) ?? 1)
      : Number.NaN;
    shares.push(`${t.toFixed(2)}s ${share.toFixed(3)}`);
  }
  let n = 0;
  let color = 0;
  let alpha = 0;
  const keys: number[] = [];
  const first: string[] = [];
  for await (const packet of new EncodedPacketSink(track).packets()) {
    color += packet.byteLength;
    alpha += packet.sideData.alpha?.byteLength ?? 0;
    if (packet.type === 'key') keys.push(n);
    if (n < 3 || n === 25)
      first.push(`#${n} ${packet.type} ${packet.byteLength}/${packet.sideData.alpha?.byteLength}`);
    n++;
  }
  return `coverage ${shares.join(', ')} | ${n} packets, keys ${keys.join(',')}, color ${color} B, alpha ${alpha} B | ${first.join('; ')}`;
}

async function encode(
  built: BuiltScene,
  width: number,
  height: number,
  options: SourceOptions,
  via: 'direct' | 'bitmap',
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d');
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'vp9', alpha: 'keep', ...options });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FPS;
    if (via === 'direct') {
      renderInto(built, ctx, t);
    } else {
      const scratch = new OffscreenCanvas(width, height);
      const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
      if (!scratchCtx) throw new Error('no 2d');
      renderInto(built, scratchCtx, t);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(scratch, 0, 0);
    }
    await source.add(t, 1 / FPS);
  }
  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error('no output');
  return new Blob([buffer], { type: 'video/webm' });
}

/** What a VideoFrame made from a half-opaque canvas carries: its format and alpha bytes. */
async function frameFrom(width: number, height: number, willReadFrequently: boolean) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently });
  if (!ctx) throw new Error('no 2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width / 2, height);
  const frame = new VideoFrame(canvas, { timestamp: 0 });
  const format = frame.format;
  let alpha = 'n/a';
  try {
    const buffer = new Uint8Array(frame.allocationSize());
    const layout = await frame.copyTo(buffer);
    const plane = layout[0];
    if (plane && (format === 'RGBA' || format === 'BGRA')) {
      const row = plane.offset + Math.floor(height / 2) * plane.stride;
      alpha = `${buffer[row + 4 * Math.floor(width / 4) + 3]} | ${buffer[row + 4 * Math.floor((3 * width) / 4) + 3]}`;
    }
  } catch (error) {
    alpha = `copyTo failed: ${String(error)}`;
  }
  frame.close();
  return `${width}x${height}${willReadFrequently ? ' (willReadFrequently)' : ''}: ${format}, alpha opaque | clear half = ${alpha}`;
}

test('diagnose transparent WebM alpha per variant (logs only)', async (context) => {
  if (!(await canEncodeVp9())) context.skip();
  const log: string[] = [];
  for (const [w, h] of [
    [320, 180],
    [480, 270],
  ] as const) {
    log.push(`frame ${await frameFrom(w, h, false)}`);
    log.push(`frame ${await frameFrom(w, h, true)}`);
  }
  const { state, built } = await scene();
  const small = await previews(built, 320, 180);
  const large = await previews(built, 480, 270);
  log.push(`preview coverage 320x180: ${[...small.values()].map((v) => v.toFixed(0)).join(', ')}`);

  const result = await runExport(
    { state, settings: SETTINGS },
    {
      template: await loadTemplate('line'),
      text: await textEngine(),
      assets: () => undefined,
      compositor: createCompositor({ gpu: false }),
    },
  );
  log.push(`A export 320: ${await describeVideo(result.blob as Blob, 320, 180, small)}`);
  const variants: [string, number, number, SourceOptions, 'direct' | 'bitmap'][] = [
    ['B direct 320 ours', 320, 180, OURS, 'direct'],
    ['C bitmap 320 ours', 320, 180, OURS, 'bitmap'],
    ['D direct 320 spike settings', 320, 180, { quality: QUALITY_HIGH }, 'direct'],
    [
      'E direct 320 ours w/o keyframes+latency',
      320,
      180,
      { quality: new Quality({ bitrate: 5_000_000 }) },
      'direct',
    ],
    ['F direct 480 ours', 480, 270, OURS, 'direct'],
  ];
  for (const [label, w, h, options, via] of variants) {
    const blob = await encode(built, w, h, options, via);
    log.push(`${label}: ${await describeVideo(blob, w, h, w === 320 ? small : large)}`);
  }
  console.info(`webm-alpha diagnosis\n${log.join('\n')}`);
});
