/**
 * The Lab's render-cost meter: frames arrive at up to 60 Hz per view, so stats are averaged
 * here and published at 4 Hz to the components that show them.
 */

import type { FrameInfo, ViewId } from '@/engine/host';

type Listener = () => void;

export type ViewStats = {
  /** Average milliseconds spent recording a frame. */
  readonly cost: number;
  /** Frames per second while playing (0 when paused). */
  readonly fps: number;
  /** Render scale (1, 0.75, 0.5). */
  readonly quality: number;
};

export type StatsStore = {
  record(frame: FrameInfo): void;
  get(): ReadonlyMap<ViewId, ViewStats>;
  subscribe(listener: Listener): () => void;
};

/** Averages per-view frame stats and publishes them at 4 Hz. */
export function createStats(): StatsStore {
  type Running = { cost: number; fps: number; quality: number; last: number; playing: boolean };
  const running = new Map<ViewId, Running>();
  const listeners = new Set<Listener>();
  let snapshot: ReadonlyMap<ViewId, ViewStats> = new Map();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const publish = () => {
    timer = null;
    snapshot = new Map(
      [...running].map(([view, s]) => [
        view,
        { cost: s.cost, fps: s.playing ? s.fps : 0, quality: s.quality },
      ]),
    );
    for (const listener of listeners) listener();
  };

  return {
    record(frame) {
      const now = performance.now();
      const s = running.get(frame.view);
      if (!s) {
        running.set(frame.view, {
          cost: frame.cost,
          fps: 0,
          quality: frame.quality,
          last: now,
          playing: frame.playing,
        });
      } else {
        s.cost += (frame.cost - s.cost) * 0.1;
        const interval = now - s.last;
        if (frame.playing && s.playing && interval > 0 && interval < 250) {
          s.fps = s.fps === 0 ? 1000 / interval : s.fps + (1000 / interval - s.fps) * 0.1;
        }
        if (!frame.playing) s.fps = 0;
        s.last = now;
        s.quality = frame.quality;
        s.playing = frame.playing;
      }
      if (timer === null) timer = setTimeout(publish, 250);
    },
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
