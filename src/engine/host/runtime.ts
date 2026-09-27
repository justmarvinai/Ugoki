/**
 * The render runtime (docs/06-engine.md §3, §10): owns views, builds scenes and drives playback.
 * Environment-agnostic — `serveRenderWorker` binds it to a dedicated worker, and
 * `createInlineEndpoint` runs it on the main thread (debugging; fallback).
 *
 * Scenes are rebuilt at most once per frame per view and swapped in atomically, so the canvas
 * never shows a half-built state; a failing build keeps the last good scene on screen.
 */

import { graphicFromTransfer } from '../assets/transfer';
import type { Graphic } from '../assets/types';
import { type Compositor, createCompositor } from '../compositor';
import { type Backdrop, BackdropPainter, NO_BACKDROP, sanitizeBackdrop } from '../runtime/backdrop';
import { probeCapabilities } from '../runtime/capabilities';
import { FrameRenderer } from '../runtime/frame';
import { AdaptiveQuality } from '../runtime/quality';
import { type BuiltScene, buildScene, userAssets } from '../runtime/scene';
import type { AnyTemplate } from '../template/define';
import { describeTemplate } from '../template/describe';
import { outputSize } from '../template/formats';
import { pairingFonts } from '../template/pairings';
import { type DesignState, initialState, sanitizeState } from '../template/state';
import { createTextEngine, type TextEngineHandle } from '../text/engine';
import { createFetchLoader, type FontBytesLoader } from '../text/font-source';
import { createFallbackMeasure } from '../text/measure';
import type {
  HostMessage,
  QualityMode,
  TransferableGraphic,
  ViewId,
  ViewSize,
  WorkerMessage,
} from './protocol';

export type TemplateLoader = (id: string) => Promise<AnyTemplate>;

export type RuntimeOptions = {
  post: (message: WorkerMessage) => void;
  loadTemplate: TemplateLoader;
  loadFont?: FontBytesLoader;
};

/** Largest render scale: 2 × the 1080-unit design space = 2160p. */
const MAX_SCALE = 2;
/** Skip display frames closer than this (ms), so 120/144 Hz screens render ~60–72 fps. */
const MIN_FRAME_INTERVAL = 10;
/** Scrubbing renders at the adaptive scale; full quality after this much stillness (ms). */
const SCRUB_SETTLE = 120;
/** Editor regions are posted at most this often while playing (ms). */
const REGIONS_INTERVAL = 100;
/** Motion-blur sub-frames of a paused preview frame (playback renders one). */
const PREVIEW_SAMPLES = 8;
/** Fast motion in paused previews gets more sub-frames, each at most this many pixels apart. */
const PREVIEW_MAX_SAMPLES = 24;
const PREVIEW_STEP = 4;
/** Previews show motion blur as a 30 fps export would. */
const PREVIEW_FRAME = 1 / 30;

type View = {
  readonly id: ViewId;
  readonly canvas: OffscreenCanvas;
  readonly ctx: OffscreenCanvasRenderingContext2D;
  readonly interactive: boolean;
  readonly frames: FrameRenderer;
  readonly quality: AdaptiveQuality;
  size: ViewSize;
  template: AnyTemplate | null;
  loadVersion: number;
  /** A template is being imported for this view. */
  loading: boolean;
  /** Snapshots requested before the view had a scene; answered after its next build. */
  waiting: { requestId: number; t: number; shortSide: number }[];
  /** Latest state waiting to be built. */
  pending: DesignState | null;
  built: BuiltScene | null;
  playing: boolean;
  loop: boolean;
  scrubbing: boolean;
  scrubTimer: ReturnType<typeof setTimeout> | null;
  qualityMode: QualityMode;
  backdrop: Backdrop;
  /** The design, rendered apart when a backdrop goes underneath it. */
  layer: OffscreenCanvas | null;
  /** Seconds. */
  t: number;
  /** Sequence number of the latest transport command (echoed with frames). */
  seq: number;
  /** Clock time (ms) at which t was 0 during playback. */
  anchor: number;
  lastFrameAt: number;
  lastRegionsAt: number;
  dirty: boolean;
  lastError: string | null;
};

const now = () => performance.now();

/**
 * Schedules the next frame: the worker's `requestAnimationFrame` where it exists, else a timer.
 * Callbacks read `performance.now()` themselves — rAF timestamps in workers aren't guaranteed
 * to share its time base, and mixing the two can stall playback.
 */
const requestFrame: (callback: () => void) => void =
  typeof globalThis.requestAnimationFrame === 'function'
    ? (callback) => globalThis.requestAnimationFrame(() => callback())
    : (callback) => setTimeout(callback, 16);

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class RenderRuntime {
  private readonly views = new Map<ViewId, View>();
  private readonly templates = new Map<string, Promise<AnyTemplate>>();
  /** Users' files by content hash, shared by all views. */
  private readonly assets = new Map<string, Graphic>();
  private readonly backdrops = new BackdropPainter();
  private readonly loadingFonts = new Set<string>();
  private text: TextEngineHandle | null = null;
  private compositorInstance: Compositor | null = null;
  private textLoading = false;
  private frameRequested = false;
  private disposed = false;

  constructor(private readonly options: RuntimeOptions) {}

  handle(message: HostMessage): void {
    if (this.disposed) return;
    switch (message.type) {
      case 'attach':
        this.attach(message.view, message.canvas, message.size, message.interactive ?? false);
        break;
      case 'detach':
        this.detach(message.view);
        break;
      case 'resize': {
        const view = this.views.get(message.view);
        if (view) {
          view.size = message.size;
          this.invalidate(view);
        }
        break;
      }
      case 'load': {
        const view = this.views.get(message.view);
        if (view) void this.load(view, message.templateId, message.state, message.look ?? 0);
        break;
      }
      case 'setState': {
        const view = this.views.get(message.view);
        if (view) this.setState(view, message.state);
        break;
      }
      case 'play':
      case 'pause':
      case 'seek':
        this.forEach(message.views, (view) => {
          view.seq = message.seq;
          if (message.type === 'play') this.play(view);
          else if (message.type === 'pause') this.pause(view);
          else this.seek(view, message.t, message.scrub ?? false);
        });
        break;
      case 'setLoop':
        this.forEach(message.views, (view) => {
          view.loop = message.loop;
        });
        break;
      case 'setQuality':
        this.forEach(message.views, (view) => {
          view.qualityMode = message.mode;
          this.invalidate(view);
        });
        break;
      case 'setBackdrop': {
        const backdrop = sanitizeBackdrop(message.backdrop);
        this.forEach(message.views, (view) => {
          view.backdrop = backdrop;
          this.invalidate(view);
        });
        break;
      }
      case 'snapshot':
        this.snapshot(message.requestId, message.view, message.t, message.shortSide);
        break;
      case 'probe':
        void probeCapabilities().then((capabilities) =>
          this.post({ type: 'capabilities', capabilities }),
        );
        break;
      case 'setAsset':
        this.setAsset(message.hash, message.asset);
        break;
      case 'dropAsset': {
        const asset = this.assets.get(message.hash);
        if (asset?.kind === 'raster') (asset.image.source as ImageBitmap).close?.();
        this.assets.delete(message.hash);
        break;
      }
    }
  }

  private setAsset(hash: string, asset: TransferableGraphic): void {
    const previous = this.assets.get(hash);
    if (previous?.kind === 'raster') (previous.image.source as ImageBitmap).close?.();
    this.assets.set(hash, graphicFromTransfer(asset));
    // Rebuild views that drew a placeholder because this file wasn't here yet.
    for (const view of this.views.values()) {
      if (view.backdrop.kind === 'image' && view.backdrop.hash === hash) this.invalidate(view);
      const built = view.built;
      if (!built || !view.template || built.missingAssets.length === 0) continue;
      if (userAssets(view.template, built.state).includes(hash)) {
        this.queueBuild(view, view.pending ?? built.state);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const view of this.views.values()) this.detach(view.id);
  }

  // --- views ------------------------------------------------------------------------------

  private attach(id: ViewId, canvas: OffscreenCanvas, size: ViewSize, interactive: boolean): void {
    this.detach(id);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.post({ type: 'error', view: id, phase: 'render', message: 'Canvas 2D is unavailable' });
      return;
    }
    this.views.set(id, {
      id,
      canvas,
      ctx,
      interactive,
      frames: new FrameRenderer(this.compositor()),
      quality: new AdaptiveQuality(),
      size,
      template: null,
      loadVersion: 0,
      loading: false,
      waiting: [],
      pending: null,
      built: null,
      playing: false,
      loop: true,
      scrubbing: false,
      scrubTimer: null,
      qualityMode: 'adaptive',
      backdrop: NO_BACKDROP,
      layer: null,
      t: 0,
      seq: 0,
      anchor: 0,
      lastFrameAt: 0,
      lastRegionsAt: 0,
      dirty: true,
      lastError: null,
    });
    this.updateBudgets();
  }

  private detach(id: ViewId): void {
    const view = this.views.get(id);
    if (!view) return;
    if (view.scrubTimer) clearTimeout(view.scrubTimer);
    this.failWaiting(view, 'The view was detached');
    this.views.delete(id);
    this.updateBudgets();
  }

  /** One compositor per worker (a single WebGL2 context), created on first use. */
  private compositor(): Compositor {
    this.compositorInstance ??= createCompositor();
    return this.compositorInstance;
  }

  private forEach(ids: readonly ViewId[], fn: (view: View) => void): void {
    for (const id of ids) {
      const view = this.views.get(id);
      if (view) fn(view);
    }
  }

  /** Views share the frame budget (~8 ms of recording per frame in total). */
  private updateBudgets(): void {
    const budget = 8 / Math.max(1, this.views.size);
    for (const view of this.views.values()) view.quality.setBudget(budget);
  }

  // --- templates & state ------------------------------------------------------------------

  private template(id: string): Promise<AnyTemplate> {
    let promise = this.templates.get(id);
    if (!promise) {
      promise = this.options.loadTemplate(id);
      promise.catch(() => this.templates.delete(id));
      this.templates.set(id, promise);
    }
    return promise;
  }

  private async load(view: View, templateId: string, raw: unknown, look: number): Promise<void> {
    const version = ++view.loadVersion;
    view.loading = true;
    try {
      const template = await this.template(templateId);
      if (version !== view.loadVersion || this.views.get(view.id) !== view) return;
      const state = raw === undefined ? initialState(template, look) : sanitizeState(template, raw);
      view.template = template;
      view.built = null;
      this.post({ type: 'loaded', view: view.id, template: describeTemplate(template), state });
      this.queueBuild(view, state);
    } catch (error) {
      if (version === view.loadVersion) this.failWaiting(view, messageOf(error));
      this.post({ type: 'error', view: view.id, phase: 'load', message: messageOf(error) });
    } finally {
      if (version === view.loadVersion) view.loading = false;
    }
  }

  private setState(view: View, state: DesignState): void {
    if (!view.template || state.templateId !== view.template.id) {
      void this.load(view, state.templateId, state, 0);
      return;
    }
    this.queueBuild(view, sanitizeState(view.template, state));
  }

  private queueBuild(view: View, state: DesignState): void {
    view.pending = state;
    this.requestFrame();
  }

  /** Builds pending states whose fonts are ready; starts loading the rest. */
  private buildPending(): void {
    for (const view of this.views.values()) {
      const state = view.pending;
      if (!state || !view.template) continue;
      const text = this.text;
      if (!text) {
        this.loadText();
        continue;
      }
      const fonts = pairingFonts(state.pairing);
      if (!fonts.every((font) => text.hasFont(font))) {
        this.loadFonts(text, fonts, view);
        continue;
      }
      view.pending = null;
      this.build(view, view.template, state, text);
    }
  }

  private build(view: View, template: AnyTemplate, state: DesignState, text: TextEngineHandle) {
    const started = now();
    try {
      const built = buildScene(template, state, text, (hash) => this.assets.get(hash));
      view.built = built;
      view.lastError = null;
      if (view.t > built.timeline.duration) view.t = built.timeline.duration;
      this.post({
        type: 'built',
        view: view.id,
        duration: built.timeline.duration,
        sections: built.timeline.sections,
        warnings: built.timeline.warnings,
        cut: built.timeline.cut,
        missingAssets: built.missingAssets,
        cost: now() - started,
      });
      this.invalidate(view);
      this.answerWaiting(view);
    } catch (error) {
      this.failWaiting(view, messageOf(error));
      this.post({ type: 'error', view: view.id, phase: 'build', message: messageOf(error) });
    }
  }

  private loadText(): void {
    if (this.textLoading) return;
    this.textLoading = true;
    createTextEngine({
      loadBytes: this.options.loadFont ?? createFetchLoader(),
      measureFallback: createFallbackMeasure(),
    }).then(
      (text) => {
        this.text = text;
        this.requestFrame();
      },
      (error) => {
        this.textLoading = false;
        for (const view of this.views.values()) {
          view.pending = null;
          this.failWaiting(view, messageOf(error));
        }
        this.post({ type: 'error', view: null, phase: 'build', message: messageOf(error) });
      },
    );
  }

  private loadFonts(text: TextEngineHandle, fonts: string[], view: View): void {
    const key = fonts.join(',');
    if (this.loadingFonts.has(key)) return;
    this.loadingFonts.add(key);
    text.load(fonts).then(
      () => {
        this.loadingFonts.delete(key);
        this.requestFrame();
      },
      (error) => {
        this.loadingFonts.delete(key);
        view.pending = null;
        this.failWaiting(view, messageOf(error));
        this.post({ type: 'error', view: view.id, phase: 'build', message: messageOf(error) });
      },
    );
  }

  // --- transport --------------------------------------------------------------------------

  private play(view: View): void {
    if (view.playing) return;
    const duration = view.built?.timeline.duration ?? 0;
    if (duration > 0 && view.t >= duration) view.t = 0;
    view.playing = true;
    view.anchor = now() - view.t * 1000;
    view.lastFrameAt = now();
    this.requestFrame();
  }

  private pause(view: View): void {
    if (!view.playing) return;
    view.playing = false;
    view.quality.pause();
    this.invalidate(view);
  }

  private seek(view: View, t: number, scrub: boolean): void {
    const duration = view.built?.timeline.duration ?? Number.POSITIVE_INFINITY;
    view.t = Math.min(Math.max(0, Number.isFinite(t) ? t : 0), duration);
    view.anchor = now() - view.t * 1000;
    if (scrub) {
      view.scrubbing = true;
      if (view.scrubTimer) clearTimeout(view.scrubTimer);
      view.scrubTimer = setTimeout(() => {
        view.scrubbing = false;
        view.scrubTimer = null;
        this.invalidate(view);
      }, SCRUB_SETTLE);
    }
    this.invalidate(view);
  }

  private invalidate(view: View): void {
    view.dirty = true;
    this.requestFrame();
  }

  // --- the frame loop ---------------------------------------------------------------------

  private requestFrame(): void {
    if (this.frameRequested || this.disposed) return;
    this.frameRequested = true;
    requestFrame(this.tick);
  }

  private readonly tick = (): void => {
    this.frameRequested = false;
    if (this.disposed) return;
    const time = now();
    this.buildPending();
    let again = false;
    for (const view of this.views.values()) {
      if (!view.built) continue;
      if (view.playing) {
        again = true;
        if (time - view.lastFrameAt < MIN_FRAME_INTERVAL) continue;
        this.advance(view, time);
        this.render(view, time);
      } else if (view.dirty) {
        this.render(view, time);
      }
    }
    if (again) this.requestFrame();
  };

  private advance(view: View, time: number): void {
    const duration = view.built?.timeline.duration ?? 0;
    let t = (time - view.anchor) / 1000;
    if (t >= duration) {
      if (view.loop && duration > 0) {
        t %= duration;
        view.anchor = time - t * 1000;
      } else {
        t = duration;
        view.playing = false;
        view.quality.pause();
      }
    }
    view.t = Math.max(0, t);
  }

  private render(view: View, time: number): void {
    const built = view.built;
    if (!built) return;
    const adaptive = (view.playing || view.scrubbing) && view.qualityMode === 'adaptive';
    const quality = adaptive ? view.quality.scale : 1;
    const scale = this.fitCanvas(view, built, quality);
    const started = now();
    const backdrop = built.state.transparent ? view.backdrop : NO_BACKDROP;
    const target = backdrop.kind === 'none' ? view.ctx : this.layerContext(view);
    let regions: ReturnType<FrameRenderer['render']>;
    try {
      regions = view.frames.render(built, target, {
        t: view.t,
        scale,
        // Motion blur on paused frames only: playback stays at one render per frame.
        samples: view.playing || view.scrubbing ? 1 : PREVIEW_SAMPLES,
        maxSamples: PREVIEW_MAX_SAMPLES,
        maxStep: PREVIEW_STEP,
        frameDuration: PREVIEW_FRAME,
        collectRegions: view.interactive,
      });
    } catch (error) {
      view.dirty = false;
      view.playing = false;
      const message = messageOf(error);
      if (message !== view.lastError) {
        view.lastError = message;
        this.post({ type: 'error', view: view.id, phase: 'render', message });
      }
      return;
    }
    const cost = now() - started;
    if (target !== view.ctx) {
      this.backdrops.draw(view.ctx, backdrop, {
        t: view.t,
        cut: built.timeline.cut,
        image: backdrop.kind === 'image' ? this.assets.get(backdrop.hash) : undefined,
      });
      view.ctx.drawImage(target.canvas, 0, 0);
    }
    if (view.playing) view.quality.record(cost, time - view.lastFrameAt, time);
    view.lastFrameAt = time;
    view.dirty = false;
    this.post({
      type: 'frame',
      view: view.id,
      t: view.t,
      playing: view.playing,
      seq: view.seq,
      cost,
      quality,
    });
    if (view.interactive && (!view.playing || time - view.lastRegionsAt >= REGIONS_INTERVAL)) {
      view.lastRegionsAt = time;
      this.post({ type: 'regions', view: view.id, regions });
    }
  }

  /** The view's offscreen layer for rendering under a backdrop, sized like its canvas. */
  private layerContext(view: View): OffscreenCanvasRenderingContext2D {
    const { width, height } = view.canvas;
    if (!view.layer) {
      view.layer = new OffscreenCanvas(width, height);
    } else if (view.layer.width !== width || view.layer.height !== height) {
      view.layer.width = width;
      view.layer.height = height;
    }
    const ctx = view.layer.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    return ctx;
  }

  /** Sizes the backing store for the view's CSS size × DPR × quality; returns the scale. */
  private fitCanvas(view: View, built: BuiltScene, quality: number): number {
    const { frame } = built;
    const { width, height, dpr } = view.size;
    const fit = Math.min(MAX_SCALE, (width * dpr) / frame.width, (height * dpr) / frame.height);
    const scale = Math.max(fit, 1 / frame.width) * quality;
    const w = Math.max(1, Math.round(frame.width * scale));
    const h = Math.max(1, Math.round(frame.height * scale));
    if (view.canvas.width !== w || view.canvas.height !== h) {
      view.canvas.width = w;
      view.canvas.height = h;
    }
    return w / frame.width;
  }

  /** Renders a still; a view that is still loading or building answers once it has a scene. */
  private snapshot(requestId: number, id: ViewId, t: number, shortSide: number): void {
    const view = this.views.get(id);
    if (view && !view.built && (view.loading || view.pending)) {
      view.waiting.push({ requestId, t, shortSide });
      return;
    }
    if (!view?.built) {
      this.post({ type: 'snapshot', requestId, blob: null, error: 'The view has no scene' });
      return;
    }
    void this.renderSnapshot(requestId, view.built, t, shortSide);
  }

  private answerWaiting(view: View): void {
    const built = view.built;
    if (!built) return;
    for (const { requestId, t, shortSide } of view.waiting.splice(0)) {
      void this.renderSnapshot(requestId, built, t, shortSide);
    }
  }

  private failWaiting(view: View, error: string): void {
    for (const { requestId } of view.waiting.splice(0)) {
      this.post({ type: 'snapshot', requestId, blob: null, error });
    }
  }

  private async renderSnapshot(requestId: number, built: BuiltScene, t: number, shortSide: number) {
    try {
      const size = outputSize(built.state.format, shortSide);
      const canvas = new OffscreenCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D is unavailable');
      // Stills are sharp (no motion blur) but finished like the video.
      new FrameRenderer(this.compositor()).render(built, ctx, {
        t,
        scale: size.width / built.frame.width,
        samples: 1,
        frameDuration: PREVIEW_FRAME,
      });
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      this.post({ type: 'snapshot', requestId, blob });
    } catch (error) {
      this.post({ type: 'snapshot', requestId, blob: null, error: messageOf(error) });
    }
  }

  private post(message: WorkerMessage): void {
    if (!this.disposed) this.options.post(message);
  }
}
