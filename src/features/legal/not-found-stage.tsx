'use client';

/**
 * The 404's stage (docs/02-experience.md §2): a 16:9 box, reserved in the server HTML, whose live
 * "404" (`not-found-engine.tsx`) loads only after the page has painted — the engine never sits on
 * the critical path. Until the first frame arrives, the Dot pulses (the loading state of
 * docs/02-experience.md §9); without JavaScript the page's heading still says 404.
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

const NotFoundEngine = lazy(() => import('./not-found-engine'));

export function NotFoundStage({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div
      className={cn(
        'relative aspect-video w-full overflow-hidden rounded-[20px] bg-bg-2',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 size-3 -translate-1/2 animate-pulse rounded-full bg-dot"
      />
      {mounted ? (
        <Suspense fallback={null}>
          <NotFoundEngine />
        </Suspense>
      ) : null}
    </div>
  );
}
