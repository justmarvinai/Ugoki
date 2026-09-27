'use client';

/**
 * Drafts on this device (docs/02-experience.md §6, docs/05-architecture.md §7). Every change
 * is saved 500 ms after it settles — as a draft created with the first edit, so opening a
 * template leaves nothing behind. The URL then carries `?draft=<id>`, so a reload reopens it,
 * with the user's files, which are kept by hash next to the drafts.
 */

import { useEffect, useRef, useState } from 'react';
import {
  type AssetRecord,
  assetHashes,
  type DraftRecord,
  db,
  draftId,
  storageError,
  toStored,
} from '@/lib/db';
import type { ProjectStore } from '@/stores/project';

/** Quiet time before a change is written. */
const DEBOUNCE = 500;
/** Thumbnails are refreshed at most this often (ms). */
const THUMBNAIL_EVERY = 5000;

export type SaveStatus =
  | { phase: 'idle' | 'saving' | 'saved' }
  | { phase: 'error'; message: string };

type Autosaver = { flush(): Promise<void>; dispose(): void };

/**
 * Watches the project and writes it 500 ms after edits settle (not when a design loads, which
 * starts history over). Outside React: it owns a timer and a store subscription.
 */
function createAutosaver(
  project: ProjectStore,
  report: (status: SaveStatus) => void,
  thumbnail: () => (() => Promise<Blob | null>) | undefined,
): Autosaver {
  let pending: ReturnType<typeof setTimeout> | null = null;
  let lastThumbnail = 0;
  let persisted = false;

  const save = async () => {
    pending = null;
    const database = db();
    const { design, draftId: id, name } = project.getState();
    if (!database || !design) return;
    report({ phase: 'saving' });
    try {
      const now = Date.now();
      const key = id ?? draftId();
      const existing = id ? await database.projects.get(id) : undefined;
      let image = existing?.thumbnail;
      const snap = thumbnail();
      if (snap && now - lastThumbnail > THUMBNAIL_EVERY) {
        lastThumbnail = now;
        const still = await snap().catch(() => null);
        if (still) image = await toStored(still);
      }
      const record: DraftRecord = {
        id: key,
        templateId: design.templateId,
        templateVersion: design.templateVersion,
        state: design,
        name,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(image ? { thumbnail: image } : {}),
      };
      await database.projects.put(record);
      if (!id) {
        project.getState().setDraftId(key);
        const url = new URL(window.location.href);
        url.searchParams.set('draft', key);
        url.hash = '';
        window.history.replaceState(window.history.state, '', url);
      }
      if (!persisted) {
        persisted = true;
        void navigator.storage?.persist?.().catch(() => false);
      }
      report({ phase: 'saved' });
    } catch (error) {
      report({ phase: 'error', message: storageError(error) });
    }
  };

  const unsubscribe = project.subscribe((state, previous) => {
    // Edits, undos and redos — not a design being loaded (which starts history over).
    if (state.design === previous.design || !(state.canUndo || state.canRedo)) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => void save(), DEBOUNCE);
  });

  return {
    async flush() {
      if (!pending) return;
      clearTimeout(pending);
      await save();
    },
    dispose() {
      unsubscribe();
      // Leaving the editor: write what's pending.
      if (pending) {
        clearTimeout(pending);
        void save();
      }
    },
  };
}

/** Saves the project as it changes; `flush` writes a pending change now (⌘S). */
export function useAutosave({
  project,
  thumbnail,
}: {
  project: ProjectStore;
  /** A small still of the design, for draft lists. */
  thumbnail?: () => Promise<Blob | null>;
}) {
  const [status, setStatus] = useState<SaveStatus>({ phase: 'idle' });
  const [saver, setSaver] = useState<Autosaver | null>(null);
  // Saves run later (timers), so they read the latest callback from here.
  const still = useRef(thumbnail);
  useEffect(() => {
    still.current = thumbnail;
  });
  useEffect(() => {
    const created = createAutosaver(project, setStatus, () => still.current);
    setSaver(created);
    return () => created.dispose();
  }, [project]);
  return { status, flush: () => saver?.flush() ?? Promise.resolve() };
}

/** Keeps a file the user added, by the hash of its bytes (for reopening drafts). */
export async function keepFile(hash: string, file: File): Promise<void> {
  const database = db();
  if (!database) return;
  try {
    const record: AssetRecord = {
      hash,
      bytes: await file.arrayBuffer(),
      name: file.name,
      mime: file.type,
      createdAt: Date.now(),
    };
    await database.assets.put(record);
  } catch {
    // The draft still saves; the file just won't come back after a reload.
  }
}

/** A draft and the files it uses, or null if it isn't on this device. */
export async function openDraft(
  id: string,
): Promise<{ draft: DraftRecord; files: Map<string, File> } | null> {
  const database = db();
  const draft = await database?.projects.get(id).catch(() => undefined);
  if (!database || !draft) return null;
  const files = new Map<string, File>();
  for (const hash of assetHashes(draft.state)) {
    const asset = await database.assets.get(hash).catch(() => undefined);
    if (asset) files.set(hash, new File([asset.bytes], asset.name, { type: asset.mime }));
  }
  return { draft, files };
}

/** Recent drafts, newest first. */
export async function recentDrafts(limit = 12): Promise<DraftRecord[]> {
  const database = db();
  if (!database) return [];
  return database.projects.orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function deleteDraft(id: string): Promise<void> {
  await db()?.projects.delete(id);
}

/** A copy of a design under a new id (for "Duplicate"). */
export async function duplicateDraft(draft: DraftRecord): Promise<string> {
  const id = draftId();
  const now = Date.now();
  await db()?.projects.put({
    ...draft,
    id,
    name: `${draft.name} copy`,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}
