'use client';

/**
 * An image or logo slot (docs/03-design-system.md §8, Image drop): the built-in placeholders as
 * swatches, or a file from this device — chosen, dropped on the field, or dropped on the stage
 * and pasted (both arrive through the editor's inbox). Images get the focal-point picker. Files
 * stay on the device; how reading one went shows in the field's status line.
 */

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Button } from '@/components/button';
import {
  type AssetRef,
  type FocalPoint,
  type ImageControl,
  PLACEHOLDER_NAMES,
  PLACEHOLDERS,
} from '@/engine/host';
import { cn } from '@/lib/cn';
import { useFileDrag } from '../assets/file-drag';
import type { FileInbox } from '../assets/inbox';
import { keepPreviewFile, previewSource } from '../assets/previews';
import type { AddFile, ControlChange } from './control-field';
import { Field } from './field';
import { FileButton } from './file-button';
import { CENTER, FocalPicker, isCenter } from './focal-picker';
import { CHECKERBOARD, PreviewCanvas, usePreview } from './image-preview';

type ImageFieldProps = {
  name: string;
  control: ImageControl;
  value: unknown;
  onChange: ControlChange;
  onAddFile: AddFile;
  /** Files dropped on the stage or pasted, headed for this field (the editor). */
  inbox?: FileInbox | undefined;
};

/** The reference with a new focal point (none when centered: that's the default). */
function withFocal(ref: AssetRef, focal: FocalPoint): AssetRef {
  const base: AssetRef =
    ref.kind === 'placeholder'
      ? { kind: 'placeholder', id: ref.id }
      : ref.name === undefined
        ? { kind: 'user', hash: ref.hash }
        : { kind: 'user', hash: ref.hash, name: ref.name };
  return isCenter(focal) ? base : { ...base, focal };
}

export function ImageField({ name, control, value, onChange, onAddFile, inbox }: ImageFieldProps) {
  const [status, setStatus] = useState<string | null>(null);
  const ref = (value === undefined ? control.default : value) as AssetRef | null;
  const logo = control.accept === 'logo';
  /** The latest file being read: an earlier one that finishes later doesn't replace it. */
  const reading = useRef(0);

  /** Reads a file into the field; resolves to the error message, or null when it's in. */
  const add = async (file: File): Promise<string | null> => {
    const turn = ++reading.current;
    setStatus('Reading…');
    try {
      const imported = await onAddFile(file);
      if (turn !== reading.current) return null;
      keepPreviewFile(imported.hash, file);
      // A new image starts centered: a focal point belongs to the image it was set on.
      onChange(name, { kind: 'user', hash: imported.hash, name: imported.name });
      setStatus(imported.notes.length > 0 ? imported.notes.join(' ') : null);
      return null;
    } catch (error) {
      if (turn !== reading.current) return null;
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      return message;
    }
  };

  const receive = useEffectEvent((file: File) => add(file));
  useEffect(() => inbox?.listen(name, (file) => receive(file)), [inbox, name]);

  const drag = useFileDrag({ onDrop: (file) => void add(file) });
  const preview = usePreview(logo ? null : previewSource(ref));

  return (
    <div
      data-image-field={name}
      className="relative"
      onFocusCapture={() => inbox?.touch(name)}
      onPointerDownCapture={() => inbox?.touch(name)}
      {...drag.handlers}
    >
      <Field label={control.label} control={name}>
        {!logo && ref && preview !== null && (
          <FocalPicker
            label={control.label}
            preview={preview}
            focal={ref.focal ?? CENTER}
            onChange={(focal, continuous) => onChange(name, withFocal(ref, focal), continuous)}
          />
        )}
        <Swatches
          control={control}
          selected={ref?.kind === 'placeholder' ? ref.id : null}
          onPick={(id) => onChange(name, { kind: 'placeholder', id })}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <FileButton label="Your file…" onFile={(file) => void add(file)} />
          {control.optional && (
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={ref === null}
              onClick={() => onChange(name, null)}
            >
              None
            </Button>
          )}
        </div>
        {ref?.kind === 'user' && (
          <p className="truncate text-[12px] text-fg-2">{ref.name ?? 'Your file'}</p>
        )}
        {status ? (
          <p role="status" className="text-[12px] leading-snug text-fg-3">
            {status}
          </p>
        ) : (
          <p className="text-[12px] leading-snug text-fg-3">
            {inbox ? 'Drop or paste' : 'Drop'} {logo ? 'a logo' : 'an image'} here. It stays on your
            device.
          </p>
        )}
      </Field>
      {drag.over && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-fg-2 border-dashed bg-bg-2/90 text-[13px] font-[550] text-fg"
        >
          Drop to use as {control.label}
        </div>
      )}
    </div>
  );
}

/** The control's built-in placeholders: logos as chips, images as square swatches. */
function Swatches({
  control,
  selected,
  onPick,
}: {
  control: ImageControl;
  selected: string | null;
  onPick: (id: string) => void;
}) {
  const logo = control.accept === 'logo';
  return (
    <fieldset className={cn('grid gap-2', logo ? 'grid-cols-3' : 'grid-cols-6')}>
      <legend className="sr-only">{logo ? 'Built-in logos' : 'Built-in images'}</legend>
      {PLACEHOLDERS[control.accept].map((id) => (
        <Swatch key={id} id={id} logo={logo} selected={id === selected} onPick={() => onPick(id)} />
      ))}
    </fieldset>
  );
}

function Swatch({
  id,
  logo,
  selected,
  onPick,
}: {
  id: string;
  logo: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  const preview = usePreview(previewSource({ kind: 'placeholder', id }));
  const name = PLACEHOLDER_NAMES[id] ?? id;
  const cutout = !logo && preview?.cutout === true;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={name}
      title={name}
      onClick={onPick}
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-sm bg-bg-3 focus-visible:outline-offset-4',
        'transition-[scale,box-shadow] duration-(--duration-micro) ease-swift active:scale-[0.95]',
        logo ? 'h-10' : 'aspect-square',
        selected
          ? 'ring-2 ring-fg ring-offset-2 ring-offset-bg-2'
          : 'ring-1 ring-line hover:ring-line-strong',
        cutout && CHECKERBOARD,
      )}
    >
      {preview ? (
        <PreviewCanvas
          preview={preview}
          fit={logo || cutout ? 'contain' : 'cover'}
          inset={logo ? 0.24 : cutout ? 0.08 : 0}
        />
      ) : (
        // No preview (yet): the name stands in.
        <span className="truncate px-1 text-[11px] font-[550] text-fg-2">
          {preview === null ? name : ''}
        </span>
      )}
    </button>
  );
}
