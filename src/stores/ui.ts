/**
 * Editor interface state (docs/05-architecture.md §6): what's selected and hovered on the
 * stage, preview options, open sheets, and hover previews — transient designs shown on the
 * stage while pointing at a Look or palette, never part of the design or its history.
 */

import { createStore } from 'zustand/vanilla';
import type { Backdrop, DesignState } from '@/engine/host';

export type Sheet = 'export' | 'share' | 'shortcuts';

export type UiState = {
  /** The selected movable group (drag, scale, `R` to reset). */
  selected: string | null;
  /** The editable region under the pointer (its control key). */
  hovered: string | null;
  /**
   * An inspector control to bring into view and focus (clicking text on the stage); `at`
   * makes a second click on the same element focus it again.
   */
  focus: { control: string; at: number } | null;
  /** Safe-area guides (`G`). */
  guides: boolean;
  zoom: 'fit' | 'actual';
  loop: boolean;
  /** What shows behind a transparent design (preview only). */
  backdrop: Backdrop;
  sheet: Sheet | null;
  /** A design previewed on the stage instead of the project's (hovering a Look or palette). */
  preview: DesignState | null;
  select(group: string | null): void;
  hover(control: string | null): void;
  focusControl(control: string): void;
  toggleGuides(): void;
  setZoom(zoom: UiState['zoom']): void;
  setLoop(loop: boolean): void;
  setBackdrop(backdrop: Backdrop): void;
  openSheet(sheet: Sheet | null): void;
  setPreview(preview: DesignState | null): void;
};

export type UiStore = ReturnType<typeof createUiStore>;

export function createUiStore() {
  return createStore<UiState>()((set) => ({
    selected: null,
    hovered: null,
    focus: null,
    guides: false,
    zoom: 'fit',
    loop: true,
    backdrop: { kind: 'none' },
    sheet: null,
    preview: null,
    select: (selected) => set({ selected }),
    hover: (hovered) => set({ hovered }),
    focusControl: (control) => set({ focus: { control, at: Date.now() } }),
    toggleGuides: () => set((state) => ({ guides: !state.guides })),
    setZoom: (zoom) => set({ zoom }),
    setLoop: (loop) => set({ loop }),
    setBackdrop: (backdrop) => set({ backdrop }),
    openSheet: (sheet) => set({ sheet }),
    setPreview: (preview) => set({ preview }),
  }));
}
