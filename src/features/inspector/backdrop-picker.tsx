'use client';

/** What shows behind a transparent design (preview only — never exported unless baked). */

import { useState } from 'react';
import { SegmentedControl } from '@/components/segmented-control';
import type { Backdrop } from '@/engine/host';
import { type AddFile, FileButton } from './control-field';
import { Field } from './field';

export function BackdropPicker({
  value,
  onChange,
  transition,
  onAddFile,
}: {
  value: Backdrop;
  onChange: (backdrop: Backdrop) => void;
  transition: boolean;
  onAddFile: AddFile;
}) {
  const [status, setStatus] = useState<string | null>(null);
  type Kind = 'none' | 'footage' | 'scenes';
  const options: { value: Kind; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'footage', label: 'Footage' },
    ...(transition ? [{ value: 'scenes' as const, label: 'A → B' }] : []),
  ];
  const current: Kind = value.kind === 'footage' || value.kind === 'scenes' ? value.kind : 'none';
  return (
    <Field label="Backdrop">
      <SegmentedControl
        label="Backdrop"
        size="sm"
        value={value.kind === 'image' ? ('' as Kind) : current}
        options={options}
        onValueChange={(kind) => onChange({ kind })}
        className="w-full"
      />
      <div className="flex items-center gap-2">
        <FileButton
          label="Preview on my footage…"
          onFile={(file) => {
            setStatus('Reading…');
            onAddFile(file).then(
              (imported) => {
                if (imported.asset.kind !== 'raster') {
                  setStatus('Use a still frame (PNG, JPG or WebP).');
                  return;
                }
                onChange({ kind: 'image', hash: imported.hash });
                setStatus(null);
              },
              (error: unknown) => setStatus(error instanceof Error ? error.message : String(error)),
            );
          }}
        />
      </div>
      {status && (
        <p role="status" className="text-[12px] leading-snug text-fg-3">
          {status}
        </p>
      )}
    </Field>
  );
}
