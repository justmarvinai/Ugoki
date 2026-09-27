'use client';

/**
 * Fields for a template's own controls (docs/06-engine.md §4): text, choices, toggles, numbers
 * and image slots (the built-in placeholders or a file from this device; see `image-field.tsx`).
 */

import { useId } from 'react';
import { SegmentedControl } from '@/components/segmented-control';
import { Slider } from '@/components/slider';
import { Switch } from '@/components/switch';
import type { Control } from '@/engine/host';
import type { ImportedFile } from '../assets/import-file';
import type { FileInbox } from '../assets/inbox';
import { Field } from './field';
import { ImageField } from './image-field';

/**
 * A control's new value. `continuous` marks edits that come in streams (typing, dragging a
 * slider or a focal point), which undo as one step per pause.
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
  inbox,
}: {
  name: string;
  control: Control;
  value: unknown;
  onChange: ControlChange;
  onAddFile: AddFile;
  /** Files dropped on the stage or pasted, for image fields (the editor). */
  inbox?: FileInbox | undefined;
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
          inbox={inbox}
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
