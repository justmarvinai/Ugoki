/**
 * Diagnosis (temporary): which VideoFrame sources WebKit's VP9 encoder follows. A bar moves
 * across four 128 × 128 frames made from each source; each variant logs the packet sizes and
 * whether the decoded last frame shows the bar where it was drawn last. Asserts nothing.
 */

import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Output,
  Quality,
  WebMOutputFormat,
} from 'mediabunny';
import { test } from 'vitest';

const SIZE = 128;
const FRAMES = 4;
const CODEC = 'vp09.00.10.08';
const barX = (i: number) => 8 + i * 32;

/** Straight RGBA pixels of frame `i`: a white bar on black (or on clear, `alpha`). */
function rgba(i: number, alpha = false): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(new ArrayBuffer(SIZE * SIZE * 4));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const p = (y * SIZE + x) * 4;
      const bar = x >= barX(i) && x < barX(i) + 24 && y >= 16 && y < SIZE - 16;
      const v = bar ? 255 : 0;
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = alpha ? v : 255;
    }
  }
  return data;
}

function canvasFrame(i: number, t: number, alpha = false): OffscreenCanvas {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d');
  ctx.putImageData(new ImageData(rgba(i, alpha), SIZE, SIZE), 0, 0);
  void t;
  return canvas;
}

type Make = (i: number, timestamp: number) => VideoFrame | Promise<VideoFrame>;

const sources: Record<string, Make> = {
  canvas: (i, timestamp) => new VideoFrame(canvasFrame(i, timestamp), { timestamp }),
  'BGRA buffer': (i, timestamp) => {
    const data = rgba(i);
    for (let p = 0; p < data.length; p += 4)
      [data[p], data[p + 2]] = [data[p + 2] ?? 0, data[p] ?? 0];
    return new VideoFrame(data, { format: 'BGRA', codedWidth: SIZE, codedHeight: SIZE, timestamp });
  },
  'BGRX buffer': (i, timestamp) =>
    new VideoFrame(rgba(i), { format: 'BGRX', codedWidth: SIZE, codedHeight: SIZE, timestamp }),
  'RGBA buffer': (i, timestamp) =>
    new VideoFrame(rgba(i), { format: 'RGBA', codedWidth: SIZE, codedHeight: SIZE, timestamp }),
  'I420 buffer': (i, timestamp) => {
    const data = rgba(i);
    const yuv = new Uint8Array(SIZE * SIZE * 1.5).fill(128);
    for (let p = 0; p < SIZE * SIZE; p++) yuv[p] = data[p * 4] ?? 0;
    return new VideoFrame(yuv, { format: 'I420', codedWidth: SIZE, codedHeight: SIZE, timestamp });
  },
  'BGRX from a worker': (i, timestamp) =>
    new Promise<VideoFrame>((resolve, reject) => {
      const code = `self.onmessage = (e) => { const { data, timestamp, size } = e.data;
        const frame = new VideoFrame(data, { format: 'BGRX', codedWidth: size, codedHeight: size, timestamp });
        self.postMessage(frame, [frame]); };`;
      const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      worker.onmessage = (event) => {
        resolve(event.data as VideoFrame);
        worker.terminate();
      };
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage({ data: rgba(i), timestamp, size: SIZE });
    }),
};

/** Luma of the decoded last frame at the last bar and at the first bar. */
async function lastFrame(chunks: EncodedVideoChunk[], config: VideoDecoderConfig) {
  let last: VideoFrame | null = null;
  const decoder = new VideoDecoder({
    output: (frame) => {
      last?.close();
      last = frame;
    },
    error: () => undefined,
  });
  decoder.configure(config);
  for (const chunk of chunks) decoder.decode(chunk);
  await decoder.flush();
  decoder.close();
  const frame = last as VideoFrame | null;
  if (!frame) return 'nothing decoded';
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d');
  ctx.drawImage(frame, 0, 0);
  const format = frame.format;
  frame.close();
  const at = (x: number) => ctx.getImageData(x, SIZE / 2, 1, 1).data[0];
  return `decoded ${format}: last bar ${at(barX(3) + 12)}, first bar ${at(barX(0) + 12)}`;
}

async function viaWebCodecs(make: Make): Promise<string> {
  const chunks: EncodedVideoChunk[] = [];
  let config: VideoDecoderConfig | undefined;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      chunks.push(chunk);
      if (meta?.decoderConfig) config ??= meta.decoderConfig;
    },
    error: () => undefined,
  });
  encoder.configure({ codec: CODEC, width: SIZE, height: SIZE, bitrate: 1_000_000, framerate: 30 });
  for (let i = 0; i < FRAMES; i++) {
    const frame = await make(i, i * 33_333);
    encoder.encode(frame, { keyFrame: i === 0 });
    frame.close();
  }
  await encoder.flush();
  encoder.close();
  const sizes = chunks.map((chunk) => `${chunk.type[0]}${chunk.byteLength}`).join(' ');
  if (!config) return `packets ${sizes}; no decoder config`;
  return `packets ${sizes}; ${await lastFrame(chunks, config)}`;
}

async function viaMediabunny(alpha: 'keep' | 'discard'): Promise<string> {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d');
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, {
    codec: 'vp9',
    quality: new Quality({ bitrate: 1_000_000 }),
    alpha,
  });
  output.addVideoTrack(source, { frameRate: 30 });
  await output.start();
  for (let i = 0; i < FRAMES; i++) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(canvasFrame(i, 0, alpha === 'keep'), 0, 0);
    await source.add(i / 30, 1 / 30);
  }
  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) return 'no output';
  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) return 'no track';
  const frame = await new CanvasSink(track, { alpha: alpha === 'keep' }).getCanvas(3 / 30 + 0.001);
  if (!frame) return `${buffer.byteLength} B; no frame`;
  const read = new OffscreenCanvas(SIZE, SIZE);
  const readCtx = read.getContext('2d', { willReadFrequently: true });
  if (!readCtx) throw new Error('no 2d');
  readCtx.drawImage(frame.canvas as OffscreenCanvas, 0, 0);
  const at = (x: number) => [...readCtx.getImageData(x, SIZE / 2, 1, 1).data].join(',');
  return `${buffer.byteLength} B; last bar rgba ${at(barX(3) + 12)}, first bar rgba ${at(barX(0) + 12)}`;
}

test('diagnose which frame sources VP9 encodes (logs only)', async (context) => {
  if (typeof VideoEncoder === 'undefined') context.skip();
  const log: string[] = [];
  for (const [name, make] of Object.entries(sources)) {
    try {
      log.push(`${name}: ${await viaWebCodecs(make)}`);
    } catch (error) {
      log.push(`${name}: threw ${String(error)}`);
    }
  }
  for (const alpha of ['discard', 'keep'] as const) {
    try {
      log.push(`mediabunny alpha ${alpha}: ${await viaMediabunny(alpha)}`);
    } catch (error) {
      log.push(`mediabunny alpha ${alpha}: threw ${String(error)}`);
    }
  }
  console.info(`vp9 frame sources\n${log.join('\n')}`);
});
