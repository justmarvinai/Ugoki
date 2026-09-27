'use client';

/**
 * The editor's inspector (docs/02-experience.md §6): one scrolling column with sticky section
 * headers — Looks, Content, Style, Motion, Layout — generated from the template's control
 * schema. Pointing at a Look, palette or pairing previews it on the stage; a click commits.
 * Every change goes through the project store, so it can be undone.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { Slider } from '@/components/slider';
import { ShuffleIcon } from '@/design/icons';
import {
  type Control,
  type DesignState,
  ENERGY_IDS,
  type EnergyId,
  PAIRINGS,
  type TemplateDescriptor,
  type TimelineWarning,
} from '@/engine/host';
import { cn } from '@/lib/cn';
import type { ProjectStore } from '@/stores/project';
import type { UiStore } from '@/stores/ui';
import type { FileInbox } from '../assets/inbox';
import { BackdropPicker } from '../inspector/backdrop-picker';
import { type AddFile, type ControlChange, ControlField } from '../inspector/control-field';
import { Field, Group } from '../inspector/field';
import { currentLook, LookSwatches, withLook } from '../inspector/looks';
import { PalettePicker } from '../inspector/palette-picker';

const ENERGY_LABELS: Record<EnergyId, string> = {
  calm: 'Calm',
  balanced: 'Balanced',
  punchy: 'Punchy',
};

const FINISH_LABELS = { clean: 'Clean', grain: 'Grain', glow: 'Soft glow' } as const;

/** Movable groups can be scaled within this range. */
const SCALE = { min: 0.5, max: 2 };

type EditorInspectorProps = {
  descriptor: TemplateDescriptor;
  design: DesignState;
  project: ProjectStore;
  ui: UiStore;
  warnings: readonly TimelineWarning[];
  /** The design's current length in seconds (what an Auto duration resolved to). */
  length: number | null;
  onAddFile: AddFile;
  /** Files dropped on the stage or pasted, for the image fields. */
  inbox: FileInbox;
  /** Starts the template over (its first Look), as one undoable step. */
  onReset: () => void;
};

const title = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' ');

export function EditorInspector(props: EditorInspectorProps) {
  const { descriptor, design, project, ui } = props;
  const change = project.getState().change;
  const preview = ui.getState().setPreview;
  const backdrop = useStore(ui, (s) => s.backdrop);
  const regions = useStore(ui, (s) => s.regions);
  const focus = useStore(ui, (s) => s.focus);
  const column = useRef<HTMLDivElement>(null);

  // Clicking an element on the stage brings its field into view and focuses it.
  useEffect(() => {
    if (!focus) return;
    const field = column.current?.querySelector(`[data-control="${CSS.escape(focus.control)}"]`);
    if (!field) return;
    field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    field
      .querySelector<HTMLElement>('input, textarea, select, button, [tabindex="0"]')
      ?.focus({ preventScroll: true });
  }, [focus]);

  const setProp: ControlChange = (key, value, continuous) =>
    change((d) => ({ ...d, props: { ...d.props, [key]: value } }), {
      ...(continuous ? { coalesce: `props.${key}` } : {}),
    });

  const controls = Object.entries(descriptor.controls);
  const byGroup = (group: Control['group']) => controls.filter(([, c]) => c.group === group);
  const fields = (group: Control['group']) =>
    byGroup(group).map(([key, control]) => (
      <ControlField
        key={key}
        name={key}
        control={control}
        value={design.props[key]}
        onChange={setProp}
        onAddFile={props.onAddFile}
        inbox={props.inbox}
      />
    ));

  const shuffle = () => {
    const looks = descriptor.looks;
    const look = looks[(currentLook(descriptor, design) + 1) % looks.length];
    if (!look) return;
    change({ ...withLook(descriptor, design, look), seed: (design.seed + 1) >>> 0 });
  };

  const movable = [
    ...new Set(regions.filter((r) => r.kind === 'movable').map((r) => r.target)),
  ].sort();
  const { min, max } = descriptor.duration;
  const canAuto = descriptor.duration.default === 'auto';
  const auto = design.duration === 'auto';
  const duration =
    typeof design.duration === 'number'
      ? design.duration
      : Math.min(max, Math.max(min, props.length ?? min));

  return (
    <div ref={column} className="flex flex-col">
      <Group title="Looks" sticky>
        <LookSwatches
          descriptor={descriptor}
          design={design}
          onChange={(next) => change(next)}
          onPreview={preview}
        />
        {descriptor.looks.length > 1 && (
          <Button size="sm" variant="ghost" className="self-start" onClick={shuffle}>
            <ShuffleIcon size={16} /> Shuffle
          </Button>
        )}
      </Group>

      <Group title="Content" sticky>
        {fields('content')}
      </Group>

      <Group title="Style" sticky>
        <Field label="Palette">
          <PalettePicker
            palettes={descriptor.palettes}
            value={design.palette}
            onChange={(palette) => change({ palette })}
            onPreview={(palette) => preview(palette ? { ...design, palette } : null)}
          />
        </Field>
        {descriptor.pairings.length > 1 && (
          <Field label="Font pairing">
            <fieldset className="grid grid-cols-2 gap-1.5" onPointerLeave={() => preview(null)}>
              <legend className="sr-only">Font pairing</legend>
              {descriptor.pairings.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={design.pairing === id}
                  title={PAIRINGS[id].personality}
                  onClick={() => {
                    preview(null);
                    change({ pairing: id });
                  }}
                  onPointerEnter={(event) => {
                    if (event.pointerType === 'mouse') preview({ ...design, pairing: id });
                  }}
                  className={cn(
                    'h-9 truncate rounded-md px-3 text-left text-[13px] font-[550] ring-1 ring-line transition-colors duration-(--duration-micro) hover:bg-bg-3',
                    design.pairing === id ? 'text-fg ring-2 ring-fg' : 'text-fg-2',
                  )}
                >
                  {PAIRINGS[id].name}
                </button>
              ))}
            </fieldset>
          </Field>
        )}
        {fields('style')}
        {descriptor.alpha !== 'none' && (
          <Field label="Background">
            <SegmentedControl
              label="Background"
              size="sm"
              value={design.transparent ? 'transparent' : 'color'}
              options={[
                { value: 'color', label: 'Palette color' },
                { value: 'transparent', label: 'Transparent' },
              ]}
              onValueChange={(value) => change({ transparent: value === 'transparent' })}
              className="w-full"
            />
          </Field>
        )}
        {design.transparent && (
          <BackdropPicker
            value={backdrop}
            onChange={ui.getState().setBackdrop}
            transition={descriptor.structure === 'transition'}
            onAddFile={props.onAddFile}
          />
        )}
        <Field label="Finish">
          <SegmentedControl
            label="Finish"
            size="sm"
            value={design.finish}
            options={(['clean', 'grain', 'glow'] as const).map((value) => ({
              value,
              label: FINISH_LABELS[value],
            }))}
            onValueChange={(finish) => change({ finish })}
            className="w-full"
          />
        </Field>
      </Group>

      <Group title="Motion" sticky>
        <Field label="Energy">
          <SegmentedControl
            label="Energy"
            value={design.energy}
            options={ENERGY_IDS.map((id) => ({ value: id, label: ENERGY_LABELS[id] }))}
            onValueChange={(energy) => change({ energy })}
            className="w-full"
          />
        </Field>
        <Field label="Duration" value={`${auto ? 'Auto · ' : ''}${duration.toFixed(1)} s`}>
          {canAuto && (
            <SegmentedControl
              label="Duration mode"
              value={auto ? 'auto' : 'fixed'}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'fixed', label: 'Fixed' },
              ]}
              onValueChange={(mode) =>
                change({ duration: mode === 'auto' ? 'auto' : Math.round(duration * 10) / 10 })
              }
              className="w-full"
            />
          )}
          <Slider
            label="Duration"
            value={duration}
            min={min}
            max={max}
            step={0.1}
            format={(v) => `${v.toFixed(1)} s`}
            onValueChange={(value) => change({ duration: value }, { coalesce: 'duration' })}
          />
        </Field>
        {props.warnings.map((warning) => (
          <Warning
            key={warning.kind}
            warning={warning}
            onDuration={(d) => change({ duration: d })}
          />
        ))}
        {fields('motion')}
      </Group>

      {(byGroup('layout').length > 0 || movable.length > 0) && (
        <Group title="Layout" sticky>
          {fields('layout')}
          {movable.map((id) => (
            <MovableField key={id} id={id} design={design} project={project} />
          ))}
        </Group>
      )}

      <div className="px-5 py-5">
        <ResetButton onReset={props.onReset} />
      </div>
    </div>
  );
}

function Warning({
  warning,
  onDuration,
}: {
  warning: TimelineWarning;
  onDuration: (duration: number) => void;
}) {
  if (warning.kind === 'hold-too-short') {
    return (
      <p role="status" className="text-[12px] leading-snug text-warning">
        The text holds {warning.hold.toFixed(1)} s — shorter than the{' '}
        {warning.recommended.toFixed(1)} s it takes to read.{' '}
        <button
          type="button"
          className="font-[550] text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg"
          onClick={() => onDuration(warning.suggestedDuration)}
        >
          Use {warning.suggestedDuration} s
        </button>
      </p>
    );
  }
  return (
    <p role="status" className="text-[12px] leading-snug text-fg-3">
      The duration is limited to {warning.used.toFixed(1)} s here.
    </p>
  );
}

/** A movable group: its size, and a way back to where the template put it. */
function MovableField({
  id,
  design,
  project,
}: {
  id: string;
  design: DesignState;
  project: ProjectStore;
}) {
  const offset = design.layout[id] ?? { x: 0, y: 0, scale: 1 };
  const moved = offset.x !== 0 || offset.y !== 0 || offset.scale !== 1;
  const setOffset = (next: typeof offset, coalesce?: string) =>
    project
      .getState()
      .change((d) => ({ ...d, layout: { ...d.layout, [id]: next } }), coalesce ? { coalesce } : {});
  return (
    <Field label={title(id)} value={`${Math.round(offset.scale * 100)}%`} control={`layout.${id}`}>
      <Slider
        label={`${title(id)} size`}
        value={offset.scale}
        min={SCALE.min}
        max={SCALE.max}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onValueChange={(scale) => setOffset({ ...offset, scale }, `layout.${id}.scale`)}
      />
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        disabled={!moved}
        onClick={() => setOffset({ x: 0, y: 0, scale: 1 })}
      >
        Reset position (R)
      </Button>
    </Field>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        Reset template
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-2">
      <span>Start over from the template? You can undo this.</span>
      <Button
        size="sm"
        onClick={() => {
          setConfirming(false);
          onReset();
        }}
      >
        Reset
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
