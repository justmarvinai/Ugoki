'use client';

/**
 * Sheet (docs/03-design-system.md §8): a side sheet on desktop (420 px), full height on
 * phones — the export sheet, the shortcut list. Focus moves in and returns when it closes;
 * Escape and the close button dismiss it. Slides in on `glide`, out on `exit`.
 */

import { Dialog } from '@base-ui/react/dialog';
import type { ReactNode } from 'react';
import { CloseIcon } from '@/design/icons';
import { cn } from '@/lib/cn';

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Sheet({ open, onOpenChange, title, description, children, className }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-(--duration-medium) data-ending-style:opacity-0 data-starting-style:opacity-0 sm:bg-black/10" />
        <Dialog.Popup
          data-theme="cinema"
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-bg-2 text-fg shadow-[0_12px_32px_rgb(0_0_0/0.4)] outline-none sm:w-[420px] sm:rounded-l-[14px] sm:border-line sm:border-l',
            'transition-transform duration-(--duration-medium) ease-glide data-ending-style:translate-x-full data-ending-style:ease-exit data-starting-style:translate-x-full',
            className,
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-line border-b pr-2 pl-5">
            <Dialog.Title className="text-[15px] font-[650]">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              title="Close (Esc)"
              className="inline-flex size-9 items-center justify-center rounded-md text-fg-2 transition-colors duration-(--duration-micro) hover:bg-bg-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
            >
              <CloseIcon size={18} />
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description className="px-5 pt-4 text-[13px] leading-snug text-fg-2">
              {description}
            </Dialog.Description>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
