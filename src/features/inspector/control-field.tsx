'use client';

/**
 * Fields for a template's own controls (docs/06-engine.md §4): text, choices, toggles, numbers
 * and image slots (the built-in placeholders or a file from this device).
 */

import { useId, useState } from 'react';
import { Button } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { Slider } from '@/components/slider';
import { Switch } from '@/components/switch';
import {
  type AssetRef,
  type Control,
  type ImageControl,
  PLACEHOLDER_NAMES,
  PLACEHOLDERS,
} from '@/engine/host';
import { ACCEPTED_FILES, type ImportedFile } from '../assets/import-file';
import { Field } from './field';

/**
 * A control's new value. `continuous` marks edits that come in streams (typing, dragging a
 * slider), which undo as one step per pause.
 */
export type ControlChange = (key: string, value: unknown, continuous?: boolean) => void;

export type AddFile = (file: File) => Promise<ImportedFile>;

const INPUT =
  'w-full resize-none rounded-md border border-line bg-bg-3 px-3 py-2 text-[14px] leading-snug text-fg placeholder:text-fg-3 transition-colors duration-(--duration-micro) hover:border-line-strong focus:border-line-strong focus-visible:outline-2 focus-visible:outline-focus';

export function ControlField({
  name,
  control,
  value,
  onChange,
  onAddFile,
}: {
  name: string;
  control: Control;
  value: unknown;
  onChange: ControlChange;
  onAddFile: AddFile;
}) {
  const id = useId();
  switch (control.kind) {
    case 'text': {
      const text = typeof value === 'string' ? value : control.default;
      const count = [...text].length;
      const near = count >= control.maxLength * 0.8;
      const common = {
        id,
        value: text,
        maxLength: control.maxLength,
        placeholder: control.placeholder ?? (control.optional ? 'Optional' : undefined),
        onChange: (event: { target: { value: string } }) =>
          onChange(name, event.target.value, true),
        className: INPUT,
      };
      return (
        <Field
          label={control.label}
          htmlFor={id}
          control={name}
          value={near ? `${count}/${control.maxLength}` : undefined}
        >
          {control.multiline ? (
            <textarea rows={Math.min(control.maxLines ?? 3, 4)} {...common} />
          ) : (
            <input type="text" {...common} />
          )}
        </Field>
      );
    }
    case 'choice':
      if (control.display === 'select') {
        return (
          <Field label={control.label} htmlFor={id} control={name}>
            <select
              id={id}
              value={typeof value === 'string' ? value : control.default}
              onChange={(event) => onChange(name, event.target.value)}
              className="h-8 w-full rounded-md border border-line bg-bg-3 px-2 text-[13px] font-[550] text-fg"
            >
              {control.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        );
      }
      return (
        <Field label={control.label} control={name}>
          <SegmentedControl
            label={control.label}
            value={typeof value === 'string' ? value : control.default}
            options={control.options.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            onValueChange={(next) => onChange(name, next)}
            className="w-full"
          />
        </Field>
      );
    case 'toggle':
      return (
        <div data-control={name}>
          <Switch
            label={control.label}
            checked={typeof value === 'boolean' ? value : control.default}
            onCheckedChange={(next) => onChange(name, next)}
          />
        </div>
      );
    case 'image':
      return (
        <ImageField
          name={name}
          control={control}
          value={value}
          onChange={onChange}
          onAddFile={onAddFile}
        />
      );
    case 'number': {
      const number = typeof value === 'number' ? value : control.default;
      const unit = control.unit ?? '';
      return (
        <Field label={control.label} value={`${number}${unit}`} control={name}>
          <Slider
            label={control.label}
            value={number}
            min={control.min}
            max={control.max}
            step={control.step}
            format={(v) => `${v}${unit}`}
            onValueChange={(next) => onChange(name, next, true)}
          />
        </Field>
      );
    }
  }
}

export function FileButton({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="inline-flex h-8 cursor-pointer items-center rounded-full border border-line-strong px-3 text-[13px] font-[550] text-fg transition-colors duration-(--duration-micro) ease-swift hover:bg-bg-3 has-focus-visible:outline-2 has-focus-visible:outline-focus"
    >
      {label}
      <input
        id={id}
        type="file"
        accept={ACCEPTED_FILES}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

/** A logo/image slot: the built-in placeholders, or a file from this device. */
function ImageField({
  name,
  control,
  value,
  onChange,
  onAddFile,
}: {
  name: string;
  control: ImageControl;
  value: unknown;
  onChange: ControlChange;
  onAddFile: AddFile;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const ref = (value === undefined ? control.default : value) as AssetRef | null;
  const add = async (file: File) => {
    setStatus('Reading…');
    try {
      const imported = await onAddFile(file);
      onChange(name, { kind: 'user', hash: imported.hash, name: imported.name });
      setStatus(imported.notes.length > 0 ? imported.notes.join(' ') : null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Field label={control.label} control={name}>
      <div className="flex flex-wrap gap-1.5">
        {PLACEHOLDERS[control.accept].map((id) => (
          <Button
            key={id}
            size="sm"
            variant={ref?.kind === 'placeholder' && ref.id === id ? 'primary' : 'secondary'}
            aria-pressed={ref?.kind === 'placeholder' && ref.id === id}
            onClick={() => onChange(name, { kind: 'placeholder', id })}
          >
            {PLACEHOLDER_NAMES[id] ?? id}
          </Button>
        ))}
        <FileButton label="Your file…" onFile={(file) => void add(file)} />
        {control.optional && (
          <Button size="sm" variant="ghost" onClick={() => onChange(name, null)}>
            None
          </Button>
        )}
      </div>
      {ref?.kind === 'user' && (
        <p className="truncate text-[12px] text-fg-2">{ref.name ?? 'Your file'}</p>
      )}
      {status && (
        <p role="status" className="text-[12px] leading-snug text-fg-3">
          {status}
        </p>
      )}
    </Field>
  );
}
