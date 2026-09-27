/**
 * Exports end to end in the browser (docs/07-export.md): every format is produced, read back
 * and compared with the preview — exported frame N is the preview at t = N / fps (Phase 2 exit).
 */

import { unzipSync } from 'fflate';
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { decodeFrames, decode as decodeGif } from 'modern-gif';
import { describe, expect, it } from 'vitest';
import { createCompositor } from '@/engine/compositor';
import { transparentWebmWorks } from '@/engine/export/probe';
import { type ExportEnvironment, type ExportJob, runExport } from '@/engine/export/run';
import { type ExportSettings, exportSize, motionBudget } from '@/engine/export/settings';
import { encodesMotion } from '@/engine/runtime/capabilities';
import { FrameRenderer } from '@/engine/runtime/frame';
import { buildScene } from '@/engine/runtime/scene';
import { type DesignState, initialState } from '@/engine/template/state';
import { CLEAN_END } from '@/engine/timeline/timeline';
import { loadTemplate } from '@/templates/registry';
import { textEngine } from '../support/render';

const settings = (patch: Partial<ExportSettings>): ExportSettings => ({
  format: 'png-zip',
  resolution: 180,
  fps: 10,
  quality: 'standard',
  ...patch,
});

async function job(templateId: string, patch: Partial<DesignState> = {}) {
  const template = await loadTemplate(templateId);
  const state: DesignState = { ...initialState(template), ...patch };
  return { template, state };
}

async function exportOf(
  templateId: string,
  patch: Partial<DesignState>,
  exportSettings: ExportSettings,
  extra: Partial<ExportEnvironment> = {},
) {
  const { template, state } = await job(templateId, patch);
  const text = await textEngine();
  const result = await runExport({ state, settings: exportSettings } satisfies ExportJob, {
    template,
    text,
    assets: () => undefined,
    compositor: createCompositor({ gpu: false }),
    ...extra,
  });
  return { result, template, state };
}

/**
 * The preview's pixels for the same frame: the frame renderer at the export's size and samples,
 * into a canvas made like the export's (and the stage's). Not `willReadFrequently`: engines may
 * rasterize such canvases differently (WebKit draws large canvases on the GPU, anti-aliasing
 * edges differently, but never ones meant for reading back).
 */
async function preview(
  templateId: string,
  state: DesignState,
  exportSettings: ExportSettings,
  t: number,
): Promise<Uint8ClampedArray> {
  const template = await loadTemplate(templateId);
  const built = buildScene(template, state, await textEngine());
  const { width, height } = exportSize(state.format, exportSettings);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  new FrameRenderer(createCompositor({ gpu: false })).render(built, ctx, {
    t,
    scale: width / built.frame.width,
    ...motionBudget(exportSettings),
    frameDuration: 1 / exportSettings.fps,
  });
  return ctx.getImageData(0, 0, width, height).data;
}

async function pixels(source: Blob | CanvasImageSource, width: number, height: number) {
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : source;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

/** Peak signal-to-noise ratio over RGB, in dB. */
function psnr(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = (a[i + c] ?? 0) - (b[i + c] ?? 0);
      sum += d * d;
      n++;
    }
  }
  const mse = sum / n;
  return mse === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / mse);
}

/**
 * Whether this browser session can write files (in the origin-private file system, standing in
 * for the file the user picks). WebKit's test sessions can't — nor does the product stream into
 * files there: only where it can ask where to save (Chromium).
 */
async function canWriteFiles(): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('ugoki-probe', { create: true });
    const writable = await handle.createWritable();
    await writable.write(new Uint8Array([1]));
    await writable.close();
    const written = (await handle.getFile()).size === 1;
    await root.removeEntry('ugoki-probe');
    return written;
  } catch (error) {
    console.info(`No writable files in this browser session: ${String(error)}`);
    return false;
  }
}

/** Whether Ugoki offers `codec` here: declared supported, and it encodes motion (the probe). */
const canEncode = async (codec: string) =>
  typeof VideoEncoder !== 'undefined' &&
  (await VideoEncoder.isConfigSupported({ codec, width: 320, height: 180 })).supported === true &&
  (await encodesMotion(codec));

describe('exports', () => {
  it('writes a PNG sequence whose frame N is the preview at t = N / fps', async () => {
    const exportSettings = settings({ format: 'png-zip' });
    const { result, state } = await exportOf('rise', { duration: 3 }, exportSettings);
    expect(result.name).toBe('ugoki-rise-320x180-10fps.zip');
    expect(result.frames).toBe(30);
    expect(result.blob?.type).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await (result.blob as Blob).arrayBuffer()));
    const names = Object.keys(files).sort();
    expect(names).toHaveLength(31);
    expect(names[0]).toBe('ugoki-rise-320x180-10fps/README.txt');
    expect(names[1]).toBe('ugoki-rise-320x180-10fps/frame_00001.png');
    expect(names[30]).toBe('ugoki-rise-320x180-10fps/frame_00030.png');
    for (const f of [0, 4, 12, 22, 29]) {
      const png = files[`ugoki-rise-320x180-10fps/frame_${String(f + 1).padStart(5, '0')}.png`];
      const exported = await pixels(new Blob([png as BlobPart], { type: 'image/png' }), 320, 180);
      // Motion blur included (4 samples at Standard): identical, pixel for pixel.
      expect(exported).toEqual(await preview('rise', state, exportSettings, f / 10));
    }
  });

  it('keeps transparency in PNG sequences, clean first and last frames', async () => {
    // Video and PNG presets start at 24 fps: the last frame, 1/24 s before the end, and its
    // shutter (motion blur looks back ≤ 3/8 of a frame) stay within CLEAN_END.
    const exportSettings = settings({ format: 'png-zip', fps: 24 });
    const { result } = await exportOf('line', { duration: 3 }, exportSettings);
    expect(1 / 24 + 0.375 / 24).toBeLessThan(CLEAN_END);
    const files = unzipSync(new Uint8Array(await (result.blob as Blob).arrayBuffer()));
    const frame = async (n: number) => {
      const png = files[`ugoki-line-320x180-24fps/frame_${String(n).padStart(5, '0')}.png`];
      return pixels(new Blob([png as BlobPart], { type: 'image/png' }), 320, 180);
    };
    const alphas = (data: Uint8ClampedArray) => data.filter((_, i) => i % 4 === 3);
    expect(result.frames).toBe(72);
    expect(alphas(await frame(1)).every((a) => a === 0)).toBe(true);
    expect(alphas(await frame(72)).every((a) => a === 0)).toBe(true);
    const hold = alphas(await frame(40));
    expect(hold[0]).toBe(0);
    expect(hold.some((a) => a === 255)).toBe(true);
  });

  it('encodes MP4 (H.264) matching the preview', async (context) => {
    if (!(await canEncode('avc1.42001f'))) context.skip();
    const exportSettings = settings({ format: 'mp4', fps: 30, quality: 'high' });
    const { result, state } = await exportOf('rise', { duration: 3 }, exportSettings);
    expect(result.name).toBe('ugoki-rise-320x180-30fps.mp4');
    expect(result.blob?.type).toBe('video/mp4');
    const input = new Input({ source: new BlobSource(result.blob as Blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('no video track');
    expect([track.displayWidth, track.displayHeight]).toEqual([320, 180]);
    expect((await track.computePacketStats()).packetCount).toBe(90);
    expect(await input.computeDuration()).toBeCloseTo(3, 1);
    const sink = new CanvasSink(track);
    for (const f of [15, 45, 80]) {
      const frame = await sink.getCanvas(f / 30 + 0.001);
      if (!frame) throw new Error(`no frame ${f}`);
      const exported = await pixels(frame.canvas as OffscreenCanvas, 320, 180);
      expect(psnr(exported, await preview('rise', state, exportSettings, f / 30))).toBeGreaterThan(
        30,
      );
    }
  });

  it('encodes transparent WebM (VP9 + alpha) for transparent designs', async (context) => {
    if (!(await canEncode('vp09.00.10.08')) || !(await transparentWebmWorks())) context.skip();
    const exportSettings = settings({ format: 'webm', fps: 15 });
    const { result, state } = await exportOf('line', { duration: 3 }, exportSettings);
    expect(result.name).toBe('ugoki-line-320x180-15fps.webm');
    const input = new Input({ source: new BlobSource(result.blob as Blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('no video track');
    expect(await track.canBeTransparent()).toBe(true);
    const t = 25 / 15;
    const frame = await new CanvasSink(track, { alpha: true }).getCanvas(t + 0.001);
    if (!frame) throw new Error('no frame');
    const data = await pixels(frame.canvas as OffscreenCanvas, 320, 180);
    // The alpha plane is lossy, and each browser's encoder spends different bits on it (WebKit's
    // far fewer), softening edges by different amounts: compare coverage, not peaks.
    const coverage = (rgba: Uint8ClampedArray) => {
      let sum = 0;
      for (let i = 3; i < rgba.length; i += 4) sum += rgba[i] ?? 0;
      return sum / 255;
    };
    const expected = coverage(await preview('line', state, exportSettings, t));
    const share = coverage(data) / expected;
    console.info(`WebM alpha coverage: ${share.toFixed(3)} × the preview's`);
    expect(data[3], 'the background stays clear').toBeLessThan(8);
    expect(share, `alpha coverage: ${share.toFixed(3)} × the preview's`).toBeGreaterThan(0.8);
    expect(share, `alpha coverage: ${share.toFixed(3)} × the preview's`).toBeLessThan(1.25);
  });

  it('bakes Scene A → B under a transition and names its cut frame', async (context) => {
    if (!(await canEncode('vp09.00.10.08'))) context.skip();
    const exportSettings = settings({ format: 'webm', fps: 30, backdrop: { kind: 'scenes' } });
    const { result } = await exportOf('layers', {}, exportSettings);
    expect(result.name).toBe('ugoki-layers-320x180-30fps-cut-f18.webm');
    const input = new Input({ source: new BlobSource(result.blob as Blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('no video track');
    expect(await track.canBeTransparent()).toBe(false);
    expect((await track.computePacketStats()).packetCount).toBe(36);
  });

  it('makes a looping GIF close to the preview (256 colors, no motion blur)', async () => {
    const exportSettings = settings({ format: 'gif', resolution: 160, fps: 10 });
    const { result, state } = await exportOf('rise', { duration: 3 }, exportSettings);
    expect(result.name).toBe('ugoki-rise-160x90-10fps.gif');
    const buffer = await (result.blob as Blob).arrayBuffer();
    const gif = decodeGif(buffer);
    expect([gif.width, gif.height]).toEqual([160, 90]);
    expect(gif.frames).toHaveLength(30);
    expect(gif.looped).toBe(true);
    const frames = decodeFrames(buffer, { gif });
    const exported = frames[22]?.data;
    if (!exported) throw new Error('no frame 22');
    expect(psnr(exported, await preview('rise', state, exportSettings, 2.2))).toBeGreaterThan(28);
  });

  it('renders a sharp still at the chosen time', async () => {
    const exportSettings = settings({ format: 'still', resolution: 360, time: 1.25 });
    const { result, state } = await exportOf('sheen', {}, exportSettings);
    expect(result.name).toBe('ugoki-sheen-640x360-1.25s.png');
    const exported = await pixels(result.blob as Blob, 640, 360);
    expect(exported).toEqual(await preview('sheen', state, exportSettings, 1.25));
  });

  it('streams into the file the user picked', async (context) => {
    if (!(await canWriteFiles())) context.skip();
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('ugoki-export-test.zip', { create: true });
    const writable = await handle.createWritable();
    const { result } = await exportOf(
      'rise',
      { duration: 3 },
      settings({ format: 'png-zip', fps: 5 }),
      {
        writable,
      },
    );
    expect(result.blob).toBeNull();
    const file = await handle.getFile();
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    expect(Object.keys(files)).toHaveLength(16);
    await root.removeEntry('ugoki-export-test.zip');
  });

  it('streams MP4 into the file with its metadata up front', async (context) => {
    if (!(await canEncode('avc1.42001f')) || !(await canWriteFiles())) context.skip();
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('ugoki-export-test.mp4', { create: true });
    const writable = await handle.createWritable();
    await exportOf('rise', { duration: 3 }, settings({ format: 'mp4', fps: 30 }), { writable });
    const file = await handle.getFile();
    const head = new TextDecoder().decode(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
    expect(head).toContain('ftyp');
    expect(head).toContain('moov'); // "fast start": playable while downloading
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    expect((await track?.computePacketStats())?.packetCount).toBe(90);
    await root.removeEntry('ugoki-export-test.mp4');
  });

  it('stops when cancelled and reports progress', async () => {
    const controller = new AbortController();
    const progress: number[] = [];
    await expect(
      exportOf('rise', { duration: 3 }, settings({ format: 'png-zip', fps: 30 }), {
        signal: controller.signal,
        onProgress: ({ frame }) => {
          progress.push(frame);
          if (frame >= 10) controller.abort();
        },
      }),
    ).rejects.toThrow('cancelled');
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toBeLessThan(90);
  });
});
