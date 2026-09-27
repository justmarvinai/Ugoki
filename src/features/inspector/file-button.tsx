'use client';

/** A secondary pill that opens the file picker for an image from this device. */

import { useId } from 'react';
import { ACCEPTED_FILES } from '../assets/import-file';

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
