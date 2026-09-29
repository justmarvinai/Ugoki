'use client';

/**
 * The gallery's render worker (docs/05-architecture.md §3): one for every tile, shared by the
 * gallery's pages — and kept warm for a while after the gallery closes, so coming back from the
 * editor finds its templates, fonts and text engine loaded (tiles repaint in a few frames rather
 * than after a cold start), and a still being made for the editor still arrives.
 */

import { useEffect, useState } from 'react';
import { RenderClient } from '@/engine/host';
import { createRenderEndpoint } from '@/workers';

/** How long an unused gallery worker is kept (ms). Idle, it does no work. */
const KEEP_WARM = 120_000;

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

/** The gallery's render client (null until its worker has started). */
export function useGalleryClient(): RenderClient | null {
  const [client, setClient] = useState<RenderClient | null>(null);
  useEffect(() => {
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
  }, []);
  return client;
}
