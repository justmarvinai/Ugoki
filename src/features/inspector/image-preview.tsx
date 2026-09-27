'use client';

/** An image control's artwork in the inspector: the preview, drawn into a canvas of any size. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { loadPreview, type Preview, peekPreview } from '../assets/previews';

/**
 * The preview of `source` (see `previewSource`): undefined while it's being made, null when
 * there's nothing to show.
 */
export function usePreview(source: string | null): Preview | null | undefined {
  const [made, setMade] = useState<{ source: string; preview: Preview | null } | null>(null);
  useEffect(() => {
    if (source === null || peekPreview(source) !== undefined) return;
    let live = true;
    void loadPreview(source).then((preview) => {
      if (live) setMade({ source, preview });
    });
    return () => {
      live = false;
    };
  }, [source]);
  const known = peekPreview(source);
  if (known !== undefined) return known;
  return made?.source === source ? made.preview : undefined;
}

/** Cut-outs sit on the stage's checkerboard (docs/03-design-system.md §4), at a smaller scale. */
export const CHECKERBOARD =
  '[background:repeating-conic-gradient(#1b1b1e_0%_25%,#141416_0%_50%)_0_0/8px_8px]';

/**
 * Draws a preview into its box: `cover` fills it (cropping), `contain` fits it whole with `inset`
 * (a share of the box's short side) around it. The canvas follows its CSS size.
 */
export function PreviewCanvas({
  preview,
  fit,
  inset = 0,
  className,
}: {
  preview: Preview;
  fit: 'cover' | 'contain';
  inset?: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(element.clientWidth * dpr));
      const h = Math.max(1, Math.round(element.clientHeight * dpr));
      if (element.width !== w) element.width = w;
      if (element.height !== h) element.height = h;
      const ctx = element.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const pad = Math.min(w, h) * inset;
      const room = { w: w - 2 * pad, h: h - 2 * pad };
      const k =
        fit === 'cover'
          ? Math.max(room.w / preview.width, room.h / preview.height)
          : Math.min(room.w / preview.width, room.h / preview.height);
      const dw = preview.width * k;
      const dh = preview.height * k;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(preview.image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [preview, fit, inset]);
  return <canvas ref={canvas} className={cn('block size-full', className)} />;
}
