'use client';

/**
 * Which gallery tiles render and play (docs/02-experience.md §5, docs/06-engine.md §10). Outside
 * React: it owns an IntersectionObserver, a few window listeners and one timer — no per-frame
 * work on the main thread.
 *
 * - **Visibility**: tiles within a generous margin of the viewport are visible to the worker
 *   (it builds and paints their posters); the rest neither build nor render. A tile also stays
 *   hidden until its page has sent its own state, so the worker never paints a design the
 *   gallery is about to replace.
 * - **Posters**: idle tiles are paused on their template's poster frame.
 * - **Hover / focus**: the tile under the pointer, and the focused one, play from the start at
 *   the display's frame rate.
 * - **Ambient**: on capable devices, the tiles nearest the pointer (or the viewport center)
 *   play at 30 fps — up to 8, fewer when their frames cost more (measured from the worker's
 *   `frame` messages); on phones only the tile nearest the center; none with reduced motion.
 */

import type { RenderClient, ViewId, WorkerMessage } from '@/engine/host';

type Mode = 'poster' | 'hover' | 'ambient';

export type TileHandle = {
  view: ViewId;
  /** The tile's media box: observed for visibility, measured for distance. */
  element: HTMLElement;
  /** Worker messages for this view. */
  onMessage: (message: WorkerMessage) => void;
};

type Tile = TileHandle & {
  /** Within the observer's margin. */
  near: boolean;
  /** The page has sent the tile's state (until then the worker keeps it hidden). */
  stateful: boolean;
  /** What the worker was last told. */
  shown: boolean;
  /** The template's poster time, once loaded. */
  poster: number | null;
  mode: Mode;
  /** The first frame's recording cost has been sampled. */
  sampled: boolean;
};

/** Ambient previews' frame rate. */
export const AMBIENT_FPS = 30;
/** Most tiles playing ambiently at once. */
const AMBIENT_MAX = 8;
/** Recording time all ambient tiles may take per frame together (ms). */
const AMBIENT_BUDGET = 8;
/** A tile frame costing more than this means the device is too slow for ambient previews. */
const TOO_SLOW = 12;
/** Ambient choices are revisited at most this often while scrolling or pointing (ms). */
const UPDATE_EVERY = 200;
/** Tiles this close to the viewport (fraction of its height) render their posters. */
const MARGIN = '75% 0px';

const PHONE = '(pointer: coarse), (max-width: 767px)';
const REDUCED = '(prefers-reduced-motion: reduce)';

/** A percentile of recent samples: robust to the odd expensive frame (a rebuild, a resize). */
const percentile = (values: readonly number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};
/** Playing-frame costs kept for the estimate. */
const PLAY_SAMPLES = 48;

export class TileScheduler {
  private client: RenderClient | null = null;
  private readonly tiles = new Map<ViewId, Tile>();
  private readonly byElement = new Map<Element, Tile>();
  private observer: IntersectionObserver | null = null;
  private hovered: ViewId | null = null;
  private focused: ViewId | null = null;
  private pointer: { x: number; y: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private phone = false;
  private reduced = false;
  /** Recent recording costs of playing tile frames (ms, normalized to full quality). */
  private readonly playCosts: number[] = [];
  private playSamples = 0;
  /** First-frame (poster) costs. */
  private readonly posterCosts: number[] = [];
  /** The ambient limit the last update applied. */
  private appliedLimit = 0;

  /** Starts scheduling with a render client; returns the disconnect function. */
  connect(client: RenderClient): () => void {
    this.client = client;
    const unsubscribe = client.subscribe(this.receive);
    this.observer = new IntersectionObserver(this.observe, { rootMargin: MARGIN });
    for (const tile of this.tiles.values()) this.observer.observe(tile.element);

    const phone = window.matchMedia(PHONE);
    const reduced = window.matchMedia(REDUCED);
    const media = () => {
      this.phone = phone.matches;
      this.reduced = reduced.matches;
      this.schedule();
    };
    media();
    phone.addEventListener('change', media);
    reduced.addEventListener('change', media);
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      this.pointer = { x: event.clientX, y: event.clientY };
      this.schedule();
    };
    const leave = (event: MouseEvent) => {
      if (event.relatedTarget) return;
      this.pointer = null;
      this.schedule();
    };
    const soon = () => this.schedule();
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('mouseout', leave);
    window.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    document.addEventListener('visibilitychange', soon);

    return () => {
      unsubscribe();
      this.observer?.disconnect();
      this.observer = null;
      phone.removeEventListener('change', media);
      reduced.removeEventListener('change', media);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('mouseout', leave);
      window.removeEventListener('scroll', soon);
      window.removeEventListener('resize', soon);
      document.removeEventListener('visibilitychange', soon);
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.client = null;
    };
  }

  /** Adds a tile whose view is attached (and hidden) in the worker; returns the removal. */
  register(handle: TileHandle): () => void {
    const tile: Tile = {
      ...handle,
      near: false,
      stateful: false,
      shown: false,
      poster: null,
      mode: 'poster',
      sampled: false,
    };
    this.tiles.set(handle.view, tile);
    this.byElement.set(handle.element, tile);
    this.observer?.observe(handle.element);
    return () => {
      this.observer?.unobserve(handle.element);
      if (this.byElement.get(handle.element) === tile) this.byElement.delete(handle.element);
      if (this.tiles.get(handle.view) === tile) this.tiles.delete(handle.view);
      if (this.hovered === handle.view) this.hovered = null;
      if (this.focused === handle.view) this.focused = null;
    };
  }

  /** The page has sent the tile's state: it may now build and paint when near. */
  stateSent(view: ViewId): void {
    const tile = this.tiles.get(view);
    if (!tile || tile.stateful) return;
    tile.stateful = true;
    this.show(tile);
  }

  /** The pointer entered or left a tile. */
  hover(view: ViewId, on: boolean): void {
    if (on) this.hovered = view;
    else if (this.hovered === view) this.hovered = null;
    this.update();
  }

  /** A tile gained or lost keyboard focus. */
  focus(view: ViewId, on: boolean): void {
    if (on) this.focused = view;
    else if (this.focused === view) this.focused = null;
    this.update();
  }

  /** The layout changed (format, filters): revisit what plays. */
  invalidate(): void {
    this.schedule();
  }

  /** What the scheduler is doing (debugging, tests and performance checks). */
  stats(): {
    modes: Record<ViewId, Mode>;
    visible: number;
    estimate: number | null;
    limit: number;
  } {
    const modes: Record<ViewId, Mode> = {};
    let visible = 0;
    for (const tile of this.tiles.values()) {
      if (tile.mode !== 'poster') modes[tile.view] = tile.mode;
      if (tile.shown) visible++;
    }
    return { modes, visible, estimate: this.estimate(), limit: this.ambientLimit() };
  }

  // --- internals --------------------------------------------------------------------------

  private readonly receive = (message: WorkerMessage): void => {
    if (!('view' in message) || message.view === null) return;
    const tile = this.tiles.get(message.view);
    if (!tile) return;
    if (message.type === 'loaded') {
      tile.poster = message.template.poster;
      if (tile.mode === 'poster') this.client?.seek(tile.view, tile.poster);
      this.schedule();
    } else if (message.type === 'frame') {
      this.sample(tile, message.cost, message.playing, message.quality);
    }
    tile.onMessage(message);
  };

  private sample(tile: Tile, cost: number, playing: boolean, quality: number): void {
    if (playing) {
      // Normalized to full quality: a view that had to scale down would cost more at full size.
      this.playCosts.push(cost / Math.max(0.25, quality * quality));
      if (this.playCosts.length > PLAY_SAMPLES) this.playCosts.shift();
      // Now and then: costs moved enough to play more or fewer tiles?
      if (++this.playSamples % 24 === 0 && this.ambientLimit() !== this.appliedLimit) {
        this.schedule();
      }
    } else if (!tile.sampled) {
      tile.sampled = true;
      this.posterCosts.push(cost);
      if (this.posterCosts.length > 24) this.posterCosts.shift();
      // The first posters decide whether ambient previews start at all.
      if (this.posterCosts.length === 3) this.schedule();
    }
  }

  private readonly observe = (entries: IntersectionObserverEntry[]): void => {
    for (const entry of entries) {
      const tile = this.byElement.get(entry.target);
      if (!tile) continue;
      tile.near = entry.isIntersecting;
      this.show(tile);
    }
    this.schedule();
  };

  /** Tells the worker whether a tile is visible: near the viewport, with its state sent. */
  private show(tile: Tile): void {
    const shown = tile.near && tile.stateful;
    if (shown === tile.shown) return;
    tile.shown = shown;
    this.client?.setVisible(tile.view, shown);
    this.schedule();
  }

  /** What one ambient tile frame costs (ms), or null before anything was measured. */
  private estimate(): number | null {
    if (this.playCosts.length >= 12) return percentile(this.playCosts, 0.75);
    if (this.posterCosts.length >= 3) return percentile(this.posterCosts, 0.5);
    return null;
  }

  private ambientLimit(): number {
    if (this.reduced || document.hidden) return 0;
    const cost = this.estimate();
    if (cost === null || cost > TOO_SLOW) return 0;
    if (this.phone) return 1;
    return Math.max(1, Math.min(AMBIENT_MAX, Math.floor(AMBIENT_BUDGET / Math.max(cost, 0.25))));
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.update();
    }, UPDATE_EVERY);
  }

  /** Decides every tile's mode and sends the changes. */
  private update(): void {
    const client = this.client;
    if (!client) return;
    const want = new Map<ViewId, Mode>();
    for (const view of [this.hovered, this.focused]) {
      const tile = view ? this.tiles.get(view) : undefined;
      if (tile?.shown && tile.poster !== null) want.set(tile.view, 'hover');
    }
    const limit = this.ambientLimit();
    this.appliedLimit = limit;
    if (limit > 0) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const origin = this.pointer && !this.phone ? this.pointer : { x: width / 2, y: height / 2 };
      const candidates: { view: ViewId; distance: number }[] = [];
      for (const tile of this.tiles.values()) {
        if (!tile.shown || tile.poster === null || want.has(tile.view)) continue;
        const rect = tile.element.getBoundingClientRect();
        // At least half on screen.
        const visible =
          Math.min(rect.bottom, height) - Math.max(rect.top, 0) >= rect.height / 2 &&
          rect.right > 0 &&
          rect.left < width;
        if (!visible || rect.width === 0) continue;
        const dx = rect.left + rect.width / 2 - origin.x;
        const dy = rect.top + rect.height / 2 - origin.y;
        candidates.push({ view: tile.view, distance: Math.hypot(dx, dy) });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      for (const { view } of candidates.slice(0, limit)) want.set(view, 'ambient');
    }
    for (const tile of this.tiles.values())
      this.apply(client, tile, want.get(tile.view) ?? 'poster');
  }

  private apply(client: RenderClient, tile: Tile, mode: Mode): void {
    if (tile.mode === mode) return;
    const { view } = tile;
    if (mode === 'hover') {
      // Hover and focus play from the start, at the display's rate.
      client.setFrameRate(view, null);
      client.seek(view, 0);
      client.play(view);
    } else if (mode === 'ambient') {
      client.setFrameRate(view, AMBIENT_FPS);
      if (tile.mode === 'poster') client.play(view);
    } else {
      client.pause(view);
      client.seek(view, tile.poster ?? 0);
    }
    tile.mode = mode;
  }
}
