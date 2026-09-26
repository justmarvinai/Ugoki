'use client';

/** Switch for on/off settings (Base UI `Switch`), with the label as its accessible name. */

import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { useId } from 'react';
import { cn } from '@/lib/cn';

export type SwitchProps = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
};

export function Switch({ label, checked, onCheckedChange, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <label htmlFor={id} className="text-[13px] text-fg-2">
        {label}
      </label>
      <BaseSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-bg-4 p-0.5 transition-colors duration-(--duration-micro) ease-swift data-checked:bg-fg"
      >
        <BaseSwitch.Thumb className="size-4 rounded-full bg-fg-2 transition-[translate,background-color] duration-(--duration-small) ease-glide data-checked:translate-x-4 data-checked:bg-bg" />
      </BaseSwitch.Root>
    </div>
  );
}
