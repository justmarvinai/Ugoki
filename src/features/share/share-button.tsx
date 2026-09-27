'use client';

/**
 * Share (docs/02-experience.md §6): a link that opens this design — the design itself rides in
 * the link's hash, which browsers never send to a server. The user's images stay on their
 * device (the template's placeholders stand in on the other end).
 */

import { Popover } from '@base-ui/react/popover';
import { useState } from 'react';
import { Button } from '@/components/button';
import { LinkIcon } from '@/design/icons';
import type { DesignState } from '@/engine/host';
import { LONG_LINK, shareUrl } from '@/lib/share';

type ShareButtonProps = {
  /** The design as it is right now (read when the popover opens). */
  design: () => DesignState | null;
  disabled?: boolean;
  className?: string;
};

export function ShareButton({ design, disabled, className }: ShareButtonProps) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const hasImages = Object.values(design()?.props ?? {}).some(
    (value) => (value as { kind?: string } | null)?.kind === 'user',
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) return;
        const current = design();
        setUrl(current ? shareUrl(current, window.location.origin) : '');
        setCopied(null);
      }}
    >
      <Popover.Trigger
        disabled={disabled}
        render={<Button variant="ghost" size="sm" className={className} />}
      >
        <LinkIcon size={16} /> Share
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup
            data-theme="cinema"
            className="w-[min(360px,calc(100vw-24px))] rounded-[14px] bg-bg-2 p-4 text-fg shadow-[0_12px_32px_rgb(0_0_0/0.4)] ring-1 ring-line outline-none transition-[opacity,transform] duration-(--duration-small) ease-glide data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <Popover.Title className="text-[14px] font-[650]">Share this design</Popover.Title>
            <Popover.Description className="mt-1 text-[13px] leading-snug text-fg-2">
              Anyone with this link can open this design. Images aren’t included.
            </Popover.Description>
            <input
              readOnly
              aria-label="Share link"
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-3 h-9 w-full truncate rounded-md border border-line bg-bg-3 px-3 font-mono text-[12px] text-fg-2"
            />
            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" variant="primary" onClick={() => void copy()}>
                Copy link
              </Button>
              <span role="status" className="text-[12px] text-fg-3">
                {copied === 'yes' && 'Copied'}
                {copied === 'failed' && 'Couldn’t copy — select the link and copy it.'}
              </span>
            </div>
            {hasImages && (
              <p className="mt-3 text-[12px] leading-snug text-fg-3">
                Your images stay on this device; the template’s placeholders stand in for them.
              </p>
            )}
            {url.length > LONG_LINK && (
              <p className="mt-2 text-[12px] leading-snug text-warning">
                This link is long — some apps may cut it off.
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
