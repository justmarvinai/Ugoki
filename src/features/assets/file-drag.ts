'use client';

/**
 * Dropping files from the desktop (docs/02-experience.md §6): image fields and the stage take a
 * dropped image; anywhere else a dropped file is refused, so the browser never navigates away
 * from the editor to show it.
 */

import { type DragEvent as ReactDragEvent, useEffect, useRef, useState } from 'react';

/** Whether a drag carries files (not text or a link). */
export const carriesFiles = (data: DataTransfer | null): boolean =>
  data !== null && Array.from(data.types).includes('Files');

/** The file a drop brings: its first image, or else its first file. */
export function droppedFile(data: DataTransfer | null): File | null {
  const files = Array.from(data?.files ?? []);
  return files.find((file) => file.type.startsWith('image/')) ?? files[0] ?? null;
}

type FileDragOptions = {
  /** Whether a drop here would be taken (default: yes). */
  accepts?: (event: ReactDragEvent<HTMLElement>) => boolean;
  /** Every move of a drag over the element that it accepts. */
  onOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop: (file: File, event: ReactDragEvent<HTMLElement>) => void;
};

/**
 * Makes an element a drop target for files. `over` is true while a file is dragged over it —
 * counted through its children, which fire their own enter/leave pairs.
 */
export function useFileDrag({ accepts, onOver, onDrop }: FileDragOptions) {
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const takes = (event: ReactDragEvent<HTMLElement>) =>
    carriesFiles(event.dataTransfer) && (accepts?.(event) ?? true);
  const leave = () => {
    depth.current = 0;
    setOver(false);
  };
  return {
    over,
    handlers: {
      onDragEnter: (event: ReactDragEvent<HTMLElement>) => {
        if (!takes(event)) return;
        event.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (event: ReactDragEvent<HTMLElement>) => {
        if (!takes(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
        onOver?.(event);
      },
      onDragLeave: (event: ReactDragEvent<HTMLElement>) => {
        if (!carriesFiles(event.dataTransfer)) return;
        depth.current -= 1;
        if (depth.current <= 0) leave();
      },
      onDrop: (event: ReactDragEvent<HTMLElement>) => {
        if (!takes(event)) return;
        event.preventDefault();
        leave();
        const file = droppedFile(event.dataTransfer);
        if (file) onDrop(file, event);
      },
    },
  };
}

/** Refuses files dropped outside a drop target (the browser would open them instead). */
export function useFileDropGuard(): void {
  useEffect(() => {
    const refuse = (event: DragEvent) => {
      if (event.defaultPrevented || !carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', refuse);
    window.addEventListener('drop', refuse);
    return () => {
      window.removeEventListener('dragover', refuse);
      window.removeEventListener('drop', refuse);
    };
  }, []);
}
