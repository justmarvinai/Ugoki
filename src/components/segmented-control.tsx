'use client';

/**
 * Segmented control (docs/03-design-system.md §8) — the signature control for formats, energy
 * and themes. A pill track whose indicator slides between options on the `snappy` spring.
 */

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { motion } from 'motion/react';
import { type ReactNode, useId } from 'react';
import { uiSpring } from '@/design/motion';
import { cn } from '@/lib/cn';

export type SegmentedOption<V extends string> = {
  value: V;
  label: ReactNode;
  /** Accessible name when the label is not text (e.g. an icon). */
  ariaLabel?: string;
};

export type SegmentedControlProps<V extends string> = {
  label: string;
  value: V;
  options: readonly SegmentedOption<V>[];
  onValueChange: (value: V) => void;
  size?: 'sm' | 'md';
  className?: string;
};

export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onValueChange,
  size = 'md',
  className,
}: SegmentedControlProps<V>) {
  const id = useId();
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(values) => {
        // Single choice: pressing the active option again keeps it selected.
        const next = values.find((v) => v !== value) ?? values[0];
        if (next !== undefined && next !== value) onValueChange(next as V);
      }}
      className={cn('inline-flex max-w-full rounded-full bg-bg-3 p-0.5', className)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          className={cn(
            'relative isolate flex min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-full font-[550] text-fg-2 select-none',
            'transition-colors duration-(--duration-micro) ease-swift hover:text-fg data-pressed:text-fg',
            size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3.5 text-[13px]',
          )}
        >
          {option.value === value && (
            <motion.span
              layoutId={`${id}-indicator`}
              transition={uiSpring.snappy}
              className="absolute inset-0 -z-10 rounded-full bg-bg-4 shadow-[inset_0_0_0_1px_var(--line-strong)]"
            />
          )}
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
