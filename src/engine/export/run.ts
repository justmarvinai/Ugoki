/**
 * The export loop (docs/07-export.md §3): builds the design at export resolution and renders
 * every frame — t = f / fps, motion blur by quality, the finish — into the sink, the same way
 * previews render, so exported frame N is the preview at t = N / fps.
 */

import type { Compositor } from '../compositor';
import { type Backdrop, BackdropPainter } from '../runtime/backdrop';
import { FrameRenderer } from '../runtime/frame';
import { type AssetLookup, buildScene } from '../runtime/scene';
import type { AnyTemplate } from '../template/define';
import type { DesignState } from '../template/state';
import type { TextEngine } from '../text/types';
import {
  cutFrame,
  type ExportSettings,
  exportFileName,
  exportSize,
  frameCount,
  KEEPS_ALPHA,
  MIME_TYPES,
  motionBudget,
} from './settings';
import { createSink, ExportError, type FrameSink } from './sinks';

export type ExportJob = { state: DesignState; settings: ExportSettings };

export type ExportProgress = {
  /** Frames done. */
  frame: number;
  frames: number;
  /** Seconds since the export started. */
  elapsed: number;
};

export type ExportResult = {
  name: string;
  mime: string;
  /** The file, unless it was written straight to the user's disk. */
  blob: Blob | null;
  bytes: number;
  width: number;
  height: number;
  frames: number;
  /** Seconds of video (0 for stills). */
  duration: number;
};

export type ExportEnvironment = {
  template: AnyTemplate;
  text: TextEngine;
  assets: AssetLookup;
  compositor: Compositor;
  writable?: FileSystemWritableFileStream | undefined;
  onProgress?: (progress: ExportProgress) => void;
  /** A small copy of the latest frame, for the stage to fast-forward through the export. */
  onPreview?: (frame: ImageBitmap, t: number) => void;
  signal?: AbortSignal;
};

const PROGRESS_INTERVAL = 100;
const PREVIEW_INTERVAL = 250;
const PREVIEW_WIDTH = 480;

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ExportError('render', 'Canvas 2D is unavailable');
  return ctx;
}

/** Transparent designs keep their alpha only where the format can carry it. */
function exportedState(job: ExportJob, bake: Backdrop | null): DesignState {
  const { state, settings } = job;
  if (!state.transparent || bake || KEEPS_ALPHA[settings.format]) return state;
  return { ...state, transparent: false };
}

export async function runExport(job: ExportJob, env: ExportEnvironment): Promise<ExportResult> {
  const started = performance.now();
  const { settings } = job;
  const bake =
    job.state.transparent && settings.backdrop && settings.backdrop.kind !== 'none'
      ? settings.backdrop
      : null;
  const state = exportedState(job, bake);

  let built: ReturnType<typeof buildScene>;
  try {
    built = buildScene(env.template, state, env.text, env.assets);
  } catch (error) {
    throw new ExportError('build', error instanceof Error ? error.message : String(error));
  }
  const { timeline } = built;
  const size = exportSize(state.format, settings);
  const still = settings.format === 'still';
  const frames = still ? 1 : frameCount(timeline.duration, settings.fps);
  const name = exportFileName({ templateId: env.template.id, settings, size, cut: timeline.cut });
  const readme = [
    `${env.template.meta.name} — exported with Ugoki`,
    `${size.width} × ${size.height}, ${settings.fps} fps, ${frames} frames (${(frames / settings.fps).toFixed(2)} s)`,
    'Frames are PNG with straight alpha, numbered from frame_00001.png.',
    ...(timeline.cut === null
      ? []
      : [
          `Cut point: frame ${cutFrame(timeline.cut, settings.fps) + 1} (t = ${timeline.cut.toFixed(3)} s) — the frame of full coverage.`,
        ]),
    '',
  ].join('\n');

  const sink: FrameSink = await createSink({
    settings,
    width: size.width,
    height: size.height,
    frames,
    alpha: state.transparent && !bake,
    writable: env.writable,
    readme,
    folder: name.replace(/\.[a-z0-9]+$/, ''),
  });
  const renderer = new FrameRenderer(env.compositor);
  const target = context(sink.canvas);
  // Baking: the design renders on its own layer, over the backdrop.
  const layer = bake ? new OffscreenCanvas(size.width, size.height) : null;
  const layerCtx = layer ? context(layer) : null;
  const painter = bake ? new BackdropPainter() : null;
  const scale = size.width / built.frame.width;
  const budget = motionBudget(settings);

  let lastProgress = 0;
  let lastPreview = Number.NEGATIVE_INFINITY;
  try {
    for (let f = 0; f < frames; f++) {
      if (env.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const t = still ? (settings.time ?? 0) : f / settings.fps;
      try {
        renderer.render(built, layerCtx ?? target, {
          t,
          scale,
          ...budget,
          frameDuration: 1 / settings.fps,
        });
        if (layer && painter && bake) {
          painter.draw(target, bake, {
            t,
            cut: timeline.cut,
            image: bake.kind === 'image' ? env.assets(bake.hash) : undefined,
          });
          target.drawImage(layer, 0, 0);
        }
      } catch (error) {
        if (error instanceof ExportError) throw error;
        throw new ExportError('render', error instanceof Error ? error.message : String(error));
      }
      await sink.add(f, t);
      const now = performance.now();
      if (env.onPreview && now - lastPreview >= PREVIEW_INTERVAL) {
        lastPreview = now;
        const width = Math.min(PREVIEW_WIDTH, size.width);
        const bitmap = await createImageBitmap(sink.canvas, {
          resizeWidth: width,
          resizeHeight: Math.max(1, Math.round((width / size.width) * size.height)),
          resizeQuality: 'medium',
        });
        env.onPreview(bitmap, t);
      }
      if (env.onProgress && (now - lastProgress >= PROGRESS_INTERVAL || f === frames - 1)) {
        lastProgress = now;
        env.onProgress({ frame: f + 1, frames, elapsed: (now - started) / 1000 });
      }
    }
    const result = await sink.finish();
    return {
      name,
      mime: MIME_TYPES[settings.format],
      blob: result.blob,
      bytes: result.bytes,
      width: size.width,
      height: size.height,
      frames,
      duration: still ? 0 : frames / settings.fps,
    };
  } catch (error) {
    await sink.cancel();
    throw error;
  }
}
