'use client';

/**
 * Buttons (docs/03-design-system.md §8): pill primary/secondary/ghost, 36 px in the app and
 * 56 px on marketing pages; icon buttons are 36 × 36 with a 10 px radius. Pressing scales to
 * 0.97 with a tone step; focus shows the 2 px ring.
 */

import { Button as BaseButton } from '@base-ui/react/button';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-[550] select-none ' +
  'transition-[transform,background-color,color,border-color,opacity] duration-(--duration-micro) ease-swift ' +
  'active:scale-[0.97] data-disabled:pointer-events-none data-disabled:opacity-40';

const variants: Record<Variant, string> = {
  primary: 'rounded-full bg-fg text-bg hover:bg-fg/88 active:bg-fg/80',
  secondary: 'rounded-full border border-line-strong text-fg hover:bg-bg-3 active:bg-bg-4',
  ghost: 'rounded-full text-fg-2 hover:bg-bg-3 hover:text-fg active:bg-bg-4',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-[13px]',
  lg: 'h-14 px-7 text-[17px]',
};

export type ButtonProps = ComponentProps<typeof BaseButton> & { variant?: Variant; size?: Size };

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <BaseButton
      className={cn(base, variants[variant], sizes[size], className as string | undefined)}
      {...props}
    />
  );
}

export type IconButtonProps = ComponentProps<typeof BaseButton> & {
  /** Accessible name (icons are decorative). */
  label: string;
  pressed?: boolean;
};

export function IconButton({ label, pressed, className, ...props }: IconButtonProps) {
  return (
    <BaseButton
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        base,
        'size-9 rounded-md text-fg-2 hover:bg-bg-3 hover:text-fg active:bg-bg-4',
        pressed && 'bg-bg-3 text-fg',
        className as string | undefined,
      )}
      {...props}
    />
  );
}
