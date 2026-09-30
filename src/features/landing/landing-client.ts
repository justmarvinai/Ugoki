'use client';

/**
 * The landing page's render worker (docs/02-experience.md §4): one for every live canvas on the
 * page — hero stage, reel, mini-editor, category previews, the 404 — so the page holds a single
 * GPU context. It starts on first use (after first paint: sections attach their views when they
 * come near the viewport) and is kept briefly after the last view goes, so back/forward
 * navigation finds it warm.
 */

import { useEffect, useState } from 'react';
import { RenderClient } from '@/engine/host';
import { createRenderEndpoint } from '@/workers';

/** How long an unused landing worker is kept (ms). Idle, it does no work. */
const KEEP_WARM = 30_000;

let shared: Promise<RenderClient> | null = null;
let users = 0;
let idle: ReturnType<typeof setTimeout> | null = null;

function acquire(): Promise<RenderClient> {
  users++;
  if (idle) clearTimeout(idle);
  idle = null;
  if (!shared) {
    const created = createRenderEndpoint().then((endpoint) => new RenderClient(endpoint));
    created.catch(() => {
      if (shared === created) shared = null;
    });
    shared = created;
  }
  return shared;
}

function release(): void {
  users = Math.max(0, users - 1);
  const current = shared;
  if (users > 0 || !current) return;
  idle = setTimeout(() => {
    idle = null;
    if (users > 0 || shared !== current) return;
    shared = null;
    void current.then((client) => client.dispose());
  }, KEEP_WARM);
}

/**
 * The page's render client, or null — until `enabled` first turns true and the worker has
 * started. Pass `enabled: false` to keep the worker (and the engine's chunks) from loading at all
 * until a section needs it.
 */
export function useLandingClient(enabled = true): RenderClient | null {
  const [client, setClient] = useState<RenderClient | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    acquire().then(
      (created) => {
        if (active) setClient(created);
      },
      () => undefined,
    );
    return () => {
      active = false;
      release();
      setClient(null);
    };
  }, [enabled]);
  return client;
}
