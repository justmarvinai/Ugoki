'use client';

/**
 * Editor keyboard shortcuts (docs/02-experience.md §8). Playback and single-key shortcuts
 * stay out of the way while typing; undo, redo, export and save work everywhere (the inspector's
 * fields edit the design, so their undo is the design's).
 */

import { useEffect, useEffectEvent } from 'react';
import type { FormatId } from '@/engine/host';

export type ShortcutActions = {
  togglePlay: () => void;
  /** Moves the playhead by `delta` seconds (pausing). */
  step: (delta: number) => void;
  seek: (to: 'start' | 'end') => void;
  undo: () => void;
  redo: () => void;
  exportNow: () => void;
  save: () => void;
  format: (format: FormatId) => void;
  formats: readonly FormatId[];
  toggleGuides: () => void;
  toggleLoop: () => void;
  resetSelected: () => void;
  /** Deselects, closes a sheet or ends a preview. */
  escape: () => void;
  shortcuts: () => void;
  /** Moves the selected group by (x, y) in u; false when nothing is selected. */
  nudge: (x: number, y: number) => boolean;
};

const TYPING = 'input, textarea, select, [contenteditable="true"], [role="slider"]';

/** One frame at 30 fps. */
const FRAME = 1 / 30;

export function useShortcuts(actions: ShortcutActions | null) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!actions) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const typing = Boolean(target?.closest(TYPING));
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (mod && !event.altKey) {
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) actions.redo();
        else actions.undo();
      } else if (key === 'y' && !event.shiftKey) {
        event.preventDefault();
        actions.redo();
      } else if (key === 'e') {
        event.preventDefault();
        actions.exportNow();
      } else if (key === 's') {
        event.preventDefault();
        actions.save();
      }
      return;
    }
    if (event.key === 'Escape') {
      actions.escape();
      return;
    }
    if (typing || event.altKey) return;

    // With a group selected, arrows move it (Shift: ×10); otherwise they move the playhead.
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const arrow = arrows[event.key];
    if (arrow) {
      const by = event.shiftKey ? 10 : 1;
      if (actions.nudge(arrow[0] * by * 0.1, arrow[1] * by * 0.1)) {
        event.preventDefault();
        return;
      }
      if (arrow[1] !== 0) return;
      event.preventDefault();
      actions.step(arrow[0] * (event.shiftKey ? 1 : FRAME));
      return;
    }

    switch (event.key) {
      case ' ':
        if (target?.closest('button, a')) return;
        event.preventDefault();
        actions.togglePlay();
        return;
      case 'Home':
        event.preventDefault();
        actions.seek('start');
        return;
      case 'End':
        event.preventDefault();
        actions.seek('end');
        return;
      case 'g':
      case 'G':
        actions.toggleGuides();
        return;
      case 'l':
      case 'L':
        actions.toggleLoop();
        return;
      case 'r':
      case 'R':
        actions.resetSelected();
        return;
      case '?':
        actions.shortcuts();
        return;
    }
    const index = ['1', '2', '3', '4'].indexOf(event.key);
    const format = index >= 0 ? (['16:9', '9:16', '1:1', '4:5'] as const)[index] : undefined;
    if (format && actions.formats.includes(format)) actions.format(format);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
