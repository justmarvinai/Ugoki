'use client';

import { useEffect, useState } from 'react';
import { RenderClient } from '@/engine/host';
import { createRenderEndpoint } from '@/workers';

/** A render worker for this component's lifetime (null until it has started). */
export function useRenderClient(): RenderClient | null {
  const [client, setClient] = useState<RenderClient | null>(null);
  useEffect(() => {
    let disposed = false;
    let instance: RenderClient | null = null;
    void createRenderEndpoint().then((endpoint) => {
      if (disposed) {
        endpoint.terminate();
        return;
      }
      instance = new RenderClient(endpoint);
      setClient(instance);
    });
    return () => {
      disposed = true;
      instance?.dispose();
      setClient(null);
    };
  }, []);
  return client;
}
