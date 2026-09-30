'use client';

/**
 * The gallery's choices (docs/02-experience.md §5): the personalization text and the format.
 * They outlive the gallery's pages — moving between categories, visiting the editor and coming
 * back — and a reload in the same tab (sessionStorage; nothing leaves the device). The text is
 * applied to the tiles ~150 ms after typing stops; the field shows every keystroke.
 */

import { useSyncExternalStore } from 'react';
import { FORMAT_IDS, type FormatId } from '@/engine/host';

export type GalleryChoices = {
  /** What the field shows. */
  text: string;
  /** The text the tiles show (debounced). */
  headline: string;
  format: FormatId;
};

/** Personalization is applied this long after typing stops (ms). */
const DEBOUNCE = 150;
/** Longest personalization text (templates cut it further to fit). */
export const HEADLINE_MAX = 80;
const HEADLINE_KEY = 'ugoki.gallery.headline';
const FORMAT_KEY = 'ugoki.gallery.format';
const DEFAULTS: GalleryChoices = { text: '', headline: '', format: '16:9' };

const isFormat = (value: unknown): value is FormatId =>
  (FORMAT_IDS as readonly unknown[]).includes(value);

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage refused (private mode, quota): the choice still holds for this visit.
  }
}

let choices: GalleryChoices | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function current(): GalleryChoices {
  if (!choices) {
    const text = (read(HEADLINE_KEY) ?? '').slice(0, HEADLINE_MAX);
    const format = read(FORMAT_KEY);
    choices = { text, headline: text, format: isFormat(format) ? format : DEFAULTS.format };
  }
  return choices;
}

function update(next: Partial<GalleryChoices>): void {
  choices = { ...current(), ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGalleryChoices(): GalleryChoices {
  return useSyncExternalStore(subscribe, current, () => DEFAULTS);
}

/** The field's text; the tiles follow once typing pauses. */
export function typeHeadline(value: string): void {
  const text = value.replace(/[\r\n]+/g, ' ').slice(0, HEADLINE_MAX);
  update({ text });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    update({ headline: text });
    write(HEADLINE_KEY, text);
  }, DEBOUNCE);
}

/** Clears the text at once (the clear button, Escape). */
export function clearHeadline(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  update({ text: '', headline: '' });
  write(HEADLINE_KEY, '');
}

export function chooseFormat(format: FormatId): void {
  update({ format });
  write(FORMAT_KEY, format);
}
