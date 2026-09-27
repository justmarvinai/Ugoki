'use client';

/**
 * The editor's top bar (docs/02-experience.md §6): back to the templates, the template's name
 * and category, the format, undo/redo, Share and Export.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, IconButton } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { ArrowLeftIcon, RedoIcon, UndoIcon } from '@/design/icons';
import { FORMATS, type FormatId } from '@/engine/host';
import type { SaveStatus } from '../drafts/drafts';

type TopBarProps = {
  name: string;
  category: string;
  formats: readonly FormatId[];
  format: FormatId | null;
  onFormat: (format: FormatId) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** The Share button (with its popover). */
  share: ReactNode;
  saveStatus: SaveStatus;
  onExport: () => void;
  /** Nothing to share or export until the design has loaded. */
  ready: boolean;
};

const mod = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export function TopBar(props: TopBarProps) {
  const key = mod();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-line border-b bg-bg px-2 md:gap-4 md:px-4">
      <Link
        href="/templates"
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-[550] text-fg-2 transition-colors duration-(--duration-micro) hover:bg-bg-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
      >
        <ArrowLeftIcon size={18} />
        <span className="hidden sm:inline">Templates</span>
      </Link>
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-[15px] font-[650] text-fg">{props.name}</h1>
        <span className="hidden truncate text-[13px] text-fg-3 lg:inline">{props.category}</span>
        <SaveIndicator status={props.saveStatus} />
      </div>

      <div className="mx-auto hidden md:block">
        {props.format && props.formats.length > 1 && (
          <SegmentedControl
            label="Format"
            size="sm"
            value={props.format}
            options={props.formats.map((id) => ({ value: id, label: id }))}
            onValueChange={props.onFormat}
          />
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
        <IconButton label={`Undo (${key}Z)`} disabled={!props.canUndo} onClick={props.onUndo}>
          <UndoIcon size={18} />
        </IconButton>
        <IconButton label={`Redo (${key}Shift+Z)`} disabled={!props.canRedo} onClick={props.onRedo}>
          <RedoIcon size={18} />
        </IconButton>
        {props.share}
        <Button
          variant="primary"
          size="sm"
          disabled={!props.ready}
          onClick={props.onExport}
          className="ml-1"
        >
          Export
        </Button>
      </div>
    </header>
  );
}

/** The format control for narrow screens (under the stage). */
export function FormatStrip({
  formats,
  format,
  onFormat,
}: {
  formats: readonly FormatId[];
  format: FormatId;
  onFormat: (format: FormatId) => void;
}) {
  if (formats.length < 2) return null;
  return (
    <div className="flex justify-center border-line border-t px-4 py-2 md:hidden">
      <SegmentedControl
        label="Format"
        size="sm"
        value={format}
        options={formats.map((id) => ({ value: id, label: FORMATS[id].label }))}
        onValueChange={onFormat}
      />
    </div>
  );
}

/** Autosave, quietly: "Saving…", "Saved on this device", or why it couldn't. */
function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status.phase === 'idle') return null;
  if (status.phase === 'error') {
    return (
      <span role="alert" className="truncate text-[12px] text-warning">
        {status.message}
      </span>
    );
  }
  return (
    <span role="status" className="hidden truncate text-[12px] text-fg-3 xl:inline">
      {status.phase === 'saving' ? 'Saving…' : 'Saved on this device'}
    </span>
  );
}
