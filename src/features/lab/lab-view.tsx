'use client';

/**
 * One Lab view: a canvas handed to the render worker, with the checkerboard for transparent
 * designs, optional safe-area guides and a render-cost meter.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { FORMATS, type FormatId, type RenderClient } from '@/engine/host';
import { cn } from '@/lib/cn';
import { SafeAreas } from '../stage/safe-areas';
import type { StatsStore } from './stores';

type LabViewProps = {
  client: RenderClient;
  format: FormatId;
  /** CSS height of the frame box. */
  height: number;
  transparent: boolean;
  guides: boolean;
  stats: StatsStore;
};

export function LabView({ client, format, height, transparent, guides, stats }: LabViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const info = FORMATS[format];
  const width = height * info.aspect;

  // The canvas is created imperatively: control transfers once, and React may mount twice.
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const size = () => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, dpr: window.devicePixelRatio || 1 };
    };
    const initial = size();
    const canvas = document.createElement('canvas');
    canvas.className = 'block size-full';
    // Start at the backing size the worker will choose, so it rarely has to resize a
    // transferred canvas (the Lab only mounts views once the stage has been measured).
    canvas.width = Math.max(1, Math.round(initial.width * initial.dpr));
    canvas.height = Math.max(1, Math.round(initial.height * initial.dpr));
    element.append(canvas);
    client.attach(format, canvas.transferControlToOffscreen(), initial);
    const observer = new ResizeObserver(() => client.resize(format, size()));
    observer.observe(element);
    return () => {
      observer.disconnect();
      client.detach(format);
      canvas.remove();
    };
  }, [client, format]);

  return (
    <figure className="my-3 flex flex-col gap-2">
      <div
        role="img"
        aria-label={`${info.label} preview`}
        className={cn(
          'relative overflow-hidden rounded-xl bg-bg-2 ring-1 ring-line-strong',
          transparent &&
            '[background:repeating-conic-gradient(#1b1b1e_0%_25%,#141416_0%_50%)_0_0/16px_16px]',
        )}
        style={{ width, height }}
      >
        {/* Holds the worker-owned canvas; React never renders children into it. */}
        <div ref={host} className="absolute inset-0" />
        {guides && <SafeAreas format={format} />}
      </div>
      <figcaption className="flex items-baseline justify-between gap-3 px-1 text-[12px] text-fg-3">
        <span className="font-[550] text-fg-2">
          {format} <span className="font-normal text-fg-3">{info.label}</span>
        </span>
        <Meter format={format} stats={stats} />
      </figcaption>
    </figure>
  );
}

function Meter({ format, stats }: { format: FormatId; stats: StatsStore }) {
  const snapshot = useSyncExternalStore(stats.subscribe, stats.get, stats.get);
  const s = snapshot.get(format);
  if (!s) return <span className="font-mono tabular-nums">—</span>;
  const slow = s.cost > 8;
  return (
    <span className="font-mono tabular-nums">
      <span className={cn(slow && 'text-warning')}>{s.cost.toFixed(2)} ms</span>
      {s.fps > 0 && <span> · {Math.round(s.fps)} fps</span>}
      {s.quality < 1 && <span> · {Math.round(s.quality * 100)}%</span>}
    </span>
  );
}
