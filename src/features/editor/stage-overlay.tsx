'use client';

/**
 * Connects the stage overlay to the editor's stores. Only this subscribes to the stage's
 * regions (reported up to ~10 times a second while playing), so the rest of the editor doesn't
 * re-render with them.
 */

import { useStore } from 'zustand';
import type { FormatId } from '@/engine/host';
import type { ProjectStore } from '@/stores/project';
import type { UiStore } from '@/stores/ui';
import { Overlay } from '../stage/overlay';
import type { StageBox } from '../stage/stage';

type StageOverlayProps = {
  box: StageBox;
  /** Control labels and group names, for the elements' accessible names. */
  names: Readonly<Record<string, string>>;
  format: FormatId;
  project: ProjectStore;
  ui: UiStore;
  /** A drag began: playback pauses so the element holds still under the pointer. */
  onGrab: () => void;
};

export function StageOverlay({ box, names, format, project, ui, onGrab }: StageOverlayProps) {
  const regions = useStore(ui, (s) => s.regions);
  const selected = useStore(ui, (s) => s.selected);
  const hovered = useStore(ui, (s) => s.hovered);
  const layout = useStore(project, (s) => s.design?.layout ?? EMPTY);
  return (
    <Overlay
      format={format}
      box={box}
      regions={regions}
      names={names}
      layout={layout}
      selected={selected}
      hovered={hovered}
      onHover={(control) => {
        if (ui.getState().hovered !== control) ui.getState().hover(control);
      }}
      onSelect={(group) => ui.getState().select(group)}
      onFocusControl={(control) => ui.getState().focusControl(control)}
      onGrab={onGrab}
      onMove={(group, offset, gesture) =>
        project.getState().change((d) => ({ ...d, layout: { ...d.layout, [group]: offset } }), {
          coalesce: `layout.${gesture}`,
        })
      }
    />
  );
}

const EMPTY = {};
