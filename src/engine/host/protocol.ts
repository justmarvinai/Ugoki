/**
 * Render worker protocol (docs/06-engine.md §3). The worker hosts any number of *views* — a
 * canvas transferred from the page (the editor stage, the Lab's four formats, gallery tiles) —
 * each with its own template, state and transport.
 */

import type { VectorGraphic } from '../assets/types';
import type { Rect } from '../core/math';
import type { EditableRegion } from '../draw/types';
import type { Backdrop } from '../runtime/backdrop';
import type { Capabilities } from '../runtime/capabilities';
import type { TemplateDescriptor } from '../template/describe';
import type { DesignState } from '../template/state';
import type { Section, SectionName, TimelineWarning } from '../timeline/timeline';

export type ViewId = string;

/** CSS size of a view's canvas and the device pixel ratio. */
export type ViewSize = { width: number; height: number; dpr: number };

export type QualityMode = 'adaptive' | 'full';

/**
 * What a view is for. A `stage` (editor, Lab) renders paused frames with motion blur and can
 * report editable regions; a `tile` (gallery) renders every frame with one sample, so posters
 * are cheap, and shares the worker's time with many other tiles.
 */
export type ViewRole = 'stage' | 'tile';

/** A user's file, decoded on the main thread (raster bitmaps are transferred, not copied). */
export type TransferableGraphic =
  | { kind: 'vector'; graphic: VectorGraphic }
  | { kind: 'raster'; bitmap: ImageBitmap; ink: Rect };

export type HostMessage =
  | {
      type: 'attach';
      view: ViewId;
      canvas: OffscreenCanvas;
      size: ViewSize;
      /** Editor stage: report movable/editable regions for the overlay. */
      interactive?: boolean;
      /** Default `stage`. */
      role?: ViewRole;
    }
  | { type: 'detach'; view: ViewId }
  | { type: 'resize'; view: ViewId; size: ViewSize }
  /**
   * Loads a template into a view. `state` (e.g. from a share link or a draft) is sanitized and
   * migrated; without it the view starts from the Look at `look`.
   */
  | { type: 'load'; view: ViewId; templateId: string; state?: unknown; look?: number }
  /** Replaces the view's design state (sanitized in the worker). */
  | { type: 'setState'; view: ViewId; state: DesignState }
  /**
   * Transport commands carry the client's sequence number (`seq`); frames echo the latest one
   * applied to their view, so the page can ignore frames rendered before its last command.
   */
  | { type: 'play'; views: readonly ViewId[]; seq: number }
  | { type: 'pause'; views: readonly ViewId[]; seq: number }
  /** `scrub` renders at the adaptive scale until 120 ms of stillness. */
  | { type: 'seek'; views: readonly ViewId[]; t: number; scrub?: boolean; seq: number }
  | { type: 'setLoop'; views: readonly ViewId[]; loop: boolean }
  | { type: 'setQuality'; views: readonly ViewId[]; mode: QualityMode }
  /**
   * Views out of sight (e.g. tiles scrolled away) neither build nor render — the worker catches
   * up when they come back. Views are visible when attached.
   */
  | { type: 'setVisible'; views: readonly ViewId[]; visible: boolean }
  /** Caps a view's playback frame rate (ambient tile previews); null = the display's rate. */
  | { type: 'setFrameRate'; views: readonly ViewId[]; fps: number | null }
  /** What shows behind transparent designs in the preview (never in stills or exports). */
  | { type: 'setBackdrop'; views: readonly ViewId[]; backdrop: Backdrop }
  /** Renders a still at `shortSide` resolution (PNG). */
  | { type: 'snapshot'; requestId: number; view: ViewId; t: number; shortSide: number }
  /** Asks what the rendering side can do; answered with `capabilities`. */
  | { type: 'probe' }
  /** Provides a user's file (by the SHA-256 of its bytes) to every view that references it. */
  | { type: 'setAsset'; hash: string; asset: TransferableGraphic }
  | { type: 'dropAsset'; hash: string };

export type FrameInfo = {
  view: ViewId;
  t: number;
  playing: boolean;
  /** The latest transport command applied to the view when it rendered this frame. */
  seq: number;
  /** Milliseconds spent in `render` (recording). */
  cost: number;
  /** Render scale relative to full quality (1, 0.75, 0.5). */
  quality: number;
};

export type WorkerMessage =
  | { type: 'loaded'; view: ViewId; template: TemplateDescriptor; state: DesignState }
  | {
      type: 'built';
      view: ViewId;
      duration: number;
      sections: Readonly<Record<SectionName, Section>>;
      warnings: readonly TimelineWarning[];
      /** Transitions: the frame of full coverage, in seconds (null for other structures). */
      cut: number | null;
      /** Image controls whose file isn't available yet (drawn with their placeholder). */
      missingAssets: readonly string[];
      /** Build time in milliseconds. */
      cost: number;
    }
  | ({ type: 'frame' } & FrameInfo)
  | { type: 'regions'; view: ViewId; regions: readonly EditableRegion[] }
  | { type: 'snapshot'; requestId: number; blob: Blob | null; error?: string }
  | { type: 'capabilities'; capabilities: Capabilities }
  | { type: 'error'; view: ViewId | null; phase: 'load' | 'build' | 'render'; message: string };
