/**
 * Snapshot undo/redo (docs/05-architecture.md §6). Designs are small JSON, so every step keeps
 * the whole earlier state. Rapid edits of one thing — typing into a field, dragging a slider —
 * join one step until they pause for `coalesceMs`; at most `limit` steps are kept.
 */

export type HistoryOptions = {
  /** Steps kept (the oldest drop off). */
  limit?: number;
  /** Edits with the same key closer together than this share one step. */
  coalesceMs?: number;
  /** Clock (tests). */
  now?: () => number;
};

export class History<T> {
  private readonly past: T[] = [];
  private future: T[] = [];
  private lastKey: string | null = null;
  private lastAt = Number.NEGATIVE_INFINITY;
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 200;
    this.coalesceMs = options.coalesceMs ?? 500;
    this.now = options.now ?? (() => performance.now());
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Records that the state is about to change from `previous`. An edit with the same `key` as
   * the last one, within `coalesceMs` of it, joins that step (the step keeps its earlier state).
   */
  record(previous: T, key?: string): void {
    const now = this.now();
    const joins = key !== undefined && key === this.lastKey && now - this.lastAt < this.coalesceMs;
    this.lastKey = key ?? null;
    this.lastAt = now;
    this.future = [];
    if (joins) return;
    this.past.push(previous);
    if (this.past.length > this.limit) this.past.shift();
  }

  /** The state before the last step (`current` becomes redoable), or null if there is none. */
  undo(current: T): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(current);
    this.lastKey = null;
    return previous;
  }

  /** The state the last undo left (`current` becomes undoable again), or null. */
  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    this.lastKey = null;
    return next;
  }

  clear(): void {
    this.past.length = 0;
    this.future = [];
    this.lastKey = null;
  }
}
