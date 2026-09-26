'use client';

/**
 * Slider (docs/03-design-system.md §8): 4 px track, 20 px thumb, a value bubble while dragging,
 * detents via `step`, arrow keys step and Shift/Page keys take ten steps.
 */

import { Slider as BaseSlider } from '@base-ui/react/slider';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  onValueCommitted?: (value: number) => void;
  /** Text for the value bubble and screen readers. */
  format?: (value: number) => string;
  /** Decorations drawn inside the track (e.g. timeline sections). */
  track?: ReactNode;
  className?: string;
  indicatorClassName?: string;
  thumbClassName?: string;
};

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  onValueCommitted,
  format = String,
  track,
  className,
  indicatorClassName,
  thumbClassName,
}: SliderProps) {
  return (
    <BaseSlider.Root
      value={value}
      min={min}
      max={max}
      step={step}
      largeStep={step * 10}
      onValueChange={(next) => onValueChange(next as number)}
      onValueCommitted={(next) => onValueCommitted?.(next as number)}
      className={cn('group/slider w-full', className)}
    >
      <BaseSlider.Control className="flex h-8 w-full touch-none items-center select-none">
        <BaseSlider.Track className="relative h-1 w-full rounded-full bg-bg-4">
          {track}
          <BaseSlider.Indicator className={cn('rounded-full bg-fg-2', indicatorClassName)} />
          <BaseSlider.Thumb
            aria-label={label}
            getAriaValueText={(_formatted, v) => format(v)}
            className={cn(
              'relative size-5 rounded-full bg-fg shadow-[0_1px_3px_rgb(0_0_0/0.35)] outline-offset-2',
              'transition-transform duration-(--duration-micro) ease-swift group-data-dragging/slider:scale-110',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
              thumbClassName,
            )}
          >
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-sm bg-fg px-1.5 py-0.5 font-mono text-[11px] text-bg tabular-nums opacity-0 transition-opacity duration-(--duration-micro) group-data-dragging/slider:opacity-100">
              {format(value)}
            </span>
          </BaseSlider.Thumb>
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
