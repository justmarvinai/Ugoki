/**
 * The preview's time and play state, outside React (docs/05-architecture.md §6): frames arrive
 * at up to 60 Hz, so only the components that show the playhead subscribe.
 */

type Listener = () => void;

export type Playhead = { readonly t: number; readonly playing: boolean };

export type PlayheadStore = {
  get(): Playhead;
  set(next: Playhead): void;
  subscribe(listener: Listener): () => void;
};

export function createPlayhead(): PlayheadStore {
  let state: Playhead = { t: 0, playing: false };
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(next) {
      if (next.t === state.t && next.playing === state.playing) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
