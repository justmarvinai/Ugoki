'use client';

/**
 * Pasting an image (Cmd/Ctrl+V) from the clipboard — a screenshot, an image copied in another
 * app. Only when no text entry has focus: there, a paste belongs to the text.
 */

import { useEffect, useEffectEvent } from 'react';

/** Where the user is typing (a paste goes into the text). */
const TEXT_ENTRY =
  'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type="range"], [type="checkbox"], [type="radio"], [type="color"], [type="file"], [type="button"], [type="submit"], [type="reset"])';

/** Browsers call a copied image `image.png`: the field shows a clearer name. */
const GENERIC_NAME = /^image\.(\w+)$/i;

/** The first image on the clipboard of a paste, if there is one. */
export function pastedImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  const files = Array.from(data.items).flatMap((item) =>
    item.kind === 'file' && item.type.startsWith('image/') ? [item.getAsFile()] : [],
  );
  const file =
    files.find((candidate) => candidate !== null) ??
    Array.from(data.files).find((candidate) => candidate.type.startsWith('image/')) ??
    null;
  if (!file) return null;
  const generic = GENERIC_NAME.exec(file.name);
  return generic || file.name === ''
    ? new File([file], `Pasted image.${generic?.[1] ?? 'png'}`, { type: file.type })
    : file;
}

/**
 * Calls `onImage` with an image pasted anywhere outside text entry; it returns whether it took
 * the image (then the paste goes no further). Null turns pasting off.
 */
export function usePastedImage(onImage: ((file: File) => boolean) | null): void {
  const paste = useEffectEvent((event: ClipboardEvent) => {
    if (!onImage) return;
    const focused = document.activeElement;
    if (focused instanceof Element && focused.closest(TEXT_ENTRY)) return;
    const file = pastedImage(event.clipboardData);
    if (file && onImage(file)) event.preventDefault();
  });
  useEffect(() => {
    const listener = (event: ClipboardEvent) => paste(event);
    window.addEventListener('paste', listener);
    return () => window.removeEventListener('paste', listener);
  }, []);
}
