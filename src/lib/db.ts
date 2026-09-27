/**
 * Local persistence (docs/05-architecture.md §7): drafts and the user's files live in this
 * browser's IndexedDB only — never uploaded. Schema changes go through Dexie versions.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { DesignState } from '@/engine/host';

/**
 * Bytes are stored as ArrayBuffers, not Blobs: browsers keep Blobs in IndexedDB as files, which
 * WebKit's private and ephemeral sessions refuse to write — ArrayBuffers are stored inline.
 */
export type StoredBytes = { bytes: ArrayBuffer; type: string };

export type DraftRecord = {
  id: string;
  templateId: string;
  templateVersion: number;
  state: DesignState;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** A small still of the design (PNG), for lists. */
  thumbnail?: StoredBytes;
};

/** A file the user added, by the SHA-256 of its bytes (shared by every draft that uses it). */
export type AssetRecord = {
  hash: string;
  bytes: ArrayBuffer;
  name: string;
  mime: string;
  createdAt: number;
};

export async function toStored(blob: Blob): Promise<StoredBytes> {
  return { bytes: await blob.arrayBuffer(), type: blob.type };
}

export const toBlob = (stored: StoredBytes) => new Blob([stored.bytes], { type: stored.type });

export type PrefRecord = { key: string; value: unknown };

export type UgokiDb = Dexie & {
  projects: EntityTable<DraftRecord, 'id'>;
  assets: EntityTable<AssetRecord, 'hash'>;
  prefs: EntityTable<PrefRecord, 'key'>;
};

let instance: UgokiDb | null = null;

/** The database (opened on first use; null where IndexedDB isn't available). */
export function db(): UgokiDb | null {
  if (typeof indexedDB === 'undefined') return null;
  if (!instance) {
    const database = new Dexie('ugoki') as UgokiDb;
    database.version(1).stores({
      projects: 'id, updatedAt, templateId',
      assets: 'hash',
      prefs: 'key',
    });
    instance = database;
  }
  return instance;
}

/** A new draft id: short, random, URL-safe. */
export function draftId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

/** The user's file hashes a design uses. */
export function assetHashes(state: DesignState): string[] {
  const hashes = new Set<string>();
  for (const value of Object.values(state.props)) {
    const ref = value as { kind?: string; hash?: string } | null;
    if (ref?.kind === 'user' && typeof ref.hash === 'string') hashes.add(ref.hash);
  }
  return [...hashes];
}

/** Why a write failed, in words for the user. */
export function storageError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const inner = (error as { inner?: { name?: string } } | null)?.inner?.name ?? '';
  return name === 'QuotaExceededError' || inner === 'QuotaExceededError'
    ? 'Couldn’t save your draft — browser storage is full. Export or delete old drafts.'
    : 'Couldn’t save your draft on this device.';
}
