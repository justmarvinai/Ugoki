/**
 * The design being edited (docs/05-architecture.md §6): the single source of truth for the
 * editor, serializable, with undo/redo over every change. Outside React so the engine host,
 * autosave and share links read it directly.
 */

import { createStore } from 'zustand/vanilla';
import type { DesignState } from '@/engine/host';
import { History, type HistoryOptions } from './history';

export type DesignUpdate = Partial<DesignState> | ((design: DesignState) => DesignState);

export type ProjectState = {
  /** Null until the template has loaded. */
  design: DesignState | null;
  /** The draft's name (the template's until renamed). */
  name: string;
  /** The local draft it saves to (null until first saved). */
  draftId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Starts editing a design; history starts over. */
  load(design: DesignState, meta?: { name?: string; draftId?: string | null }): void;
  /**
   * Changes the design (a change to the same values is ignored). Changes with the same
   * `coalesce` key in quick succession — typing into one field, dragging one slider — undo as one.
   */
  change(update: DesignUpdate, options?: { coalesce?: string }): void;
  undo(): void;
  redo(): void;
  rename(name: string): void;
  setDraftId(draftId: string): void;
};

export type ProjectStore = ReturnType<typeof createProjectStore>;

const same = (a: DesignState, b: DesignState) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function createProjectStore(options: HistoryOptions = {}) {
  const history = new History<DesignState>(options);
  return createStore<ProjectState>()((set, get) => {
    const steps = () => ({ canUndo: history.canUndo, canRedo: history.canRedo });
    return {
      design: null,
      name: '',
      draftId: null,
      canUndo: false,
      canRedo: false,
      load(design, meta = {}) {
        history.clear();
        set({
          design,
          name: meta.name ?? get().name,
          draftId: meta.draftId === undefined ? get().draftId : meta.draftId,
          ...steps(),
        });
      },
      change(update, { coalesce } = {}) {
        const current = get().design;
        if (!current) return;
        const next = typeof update === 'function' ? update(current) : { ...current, ...update };
        if (same(next, current)) return;
        history.record(current, coalesce);
        set({ design: next, ...steps() });
      },
      undo() {
        const current = get().design;
        const previous = current && history.undo(current);
        if (previous) set({ design: previous, ...steps() });
      },
      redo() {
        const current = get().design;
        const next = current && history.redo(current);
        if (next) set({ design: next, ...steps() });
      },
      rename(name) {
        set({ name });
      },
      setDraftId(draftId) {
        set({ draftId });
      },
    };
  });
}
