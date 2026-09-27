'use client';

/**
 * Lab inspector: Looks, palettes (incl. brand colors), pairings, energy, duration, the
 * template's own controls (logos and images included), stress text, preview options with the
 * backdrop, stills and the raw state.
 */

import { type ReactNode, useId, useState } from 'react';
import { Button } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { Slider } from '@/components/slider';
import { Switch } from '@/components/switch';
import { DownloadIcon } from '@/design/icons';
import {
  type Backdrop,
  type Capabilities,
  type Control,
  type DesignState,
  ENERGY_IDS,
  type EnergyId,
  type FormatId,
  PAIRINGS,
  type QualityMode,
  type TemplateDescriptor,
  type TimelineWarning,
} from '@/engine/host';
import { cn } from '@/lib/cn';
import type { ImportedFile } from '../assets/import-file';
import { BackdropPicker } from '../inspector/backdrop-picker';
import { ControlField } from '../inspector/control-field';
import { Field, Group } from '../inspector/field';
import { LookSwatches } from '../inspector/looks';
import { PalettePicker } from '../inspector/palette-picker';
import { maxLengthText, STRESS_PRESETS } from './presets';

export type Focus = 'all' | FormatId;

type InspectorProps = {
  descriptor: TemplateDescriptor;
  state: DesignState;
  onChange: (state: DesignState) => void;
  warnings: readonly TimelineWarning[];
  focus: Focus;
  onFocus: (focus: Focus) => void;
  guides: boolean;
  onGuides: (guides: boolean) => void;
  quality: QualityMode;
  onQuality: (quality: QualityMode) => void;
  onCapture: () => void;
  onApplyJson: (raw: unknown) => void;
  capabilities: Capabilities | null;
  /** Rendering on the main thread (`?worker=0`). */
  inline: boolean;
  backdrop: Backdrop;
  onBackdrop: (backdrop: Backdrop) => void;
  /** Reads a user's file on this device and hands it to the renderer. */
  onAddFile: (file: File) => Promise<ImportedFile>;
  exportPanel?: ReactNode;
};

const ENERGY_LABELS: Record<EnergyId, string> = {
  calm: 'Calm',
  balanced: 'Balanced',
  punchy: 'Punchy',
};

export function Inspector(props: InspectorProps) {
  const { descriptor, state, onChange, warnings } = props;
  const set = (patch: Partial<DesignState>) => onChange({ ...state, ...patch });
  const setProp = (key: string, value: unknown) =>
    onChange({ ...state, props: { ...state.props, [key]: value } });

  const controls = Object.entries(descriptor.controls);
  const byGroup = (group: Control['group']) => controls.filter(([, c]) => c.group === group);
  const primary = controls.find(([, c]) => c.kind === 'text' && c.primary);
  const { min, max } = descriptor.duration;
  const duration = typeof state.duration === 'number' ? state.duration : min;

  return (
    <div className="flex flex-col">
      <Group title="Look">
        <LookSwatches descriptor={descriptor} design={state} onChange={onChange} />
      </Group>

      <Group title="Palette">
        <PalettePicker
          palettes={descriptor.palettes}
          value={state.palette}
          onChange={(palette) => set({ palette })}
        />
      </Group>

      <Group title="Type">
        <SegmentedControl
          label="Font pairing"
          value={state.pairing}
          options={descriptor.pairings.map((id) => ({ value: id, label: PAIRINGS[id].name }))}
          onValueChange={(pairing) => set({ pairing })}
          className="w-full"
        />
      </Group>

      <Group title="Motion">
        <SegmentedControl
          label="Energy"
          value={state.energy}
          options={ENERGY_IDS.map((id) => ({ value: id, label: ENERGY_LABELS[id] }))}
          onValueChange={(energy) => set({ energy })}
          className="w-full"
        />
        <Field label="Duration" value={`${duration.toFixed(1)} s`}>
          <Slider
            label="Duration"
            value={duration}
            min={min}
            max={max}
            step={0.5}
            format={(v) => `${v.toFixed(1)} s`}
            onValueChange={(value) => set({ duration: value })}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => set({ duration: min })}>
              Min {min} s
            </Button>
            <Button size="sm" onClick={() => set({ duration: max })}>
              Max {max} s
            </Button>
          </div>
        </Field>
        {warnings.map((warning) => (
          <p key={warning.kind} role="status" className="text-[12px] leading-snug text-warning">
            {warning.kind === 'hold-too-short'
              ? `Hold ${warning.hold.toFixed(2)} s is shorter than the ${warning.recommended.toFixed(1)} s reading time — try ${warning.suggestedDuration} s.`
              : `Duration clamped to ${warning.used.toFixed(2)} s.`}
          </p>
        ))}
        {byGroup('motion').map(([key, control]) => (
          <ControlField
            key={key}
            name={key}
            control={control}
            value={state.props[key]}
            onChange={setProp}
            onAddFile={props.onAddFile}
          />
        ))}
      </Group>

      <Group title="Content">
        {byGroup('content').map(([key, control]) => (
          <ControlField
            key={key}
            name={key}
            control={control}
            value={state.props[key]}
            onChange={setProp}
            onAddFile={props.onAddFile}
          />
        ))}
        {primary && (
          <div className="flex flex-wrap gap-1.5">
            {STRESS_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                size="sm"
                variant="ghost"
                className="border border-line"
                onClick={() => {
                  const [key, control] = primary;
                  const text =
                    preset.text ?? maxLengthText(control.kind === 'text' ? control.maxLength : 60);
                  setProp(key, text);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        )}
      </Group>

      {byGroup('style').length > 0 && (
        <Group title="Style">
          {byGroup('style').map(([key, control]) => (
            <ControlField
              key={key}
              name={key}
              control={control}
              value={state.props[key]}
              onChange={setProp}
              onAddFile={props.onAddFile}
            />
          ))}
        </Group>
      )}

      {byGroup('layout').length > 0 && (
        <Group title="Layout">
          {byGroup('layout').map(([key, control]) => (
            <ControlField
              key={key}
              name={key}
              control={control}
              value={state.props[key]}
              onChange={setProp}
              onAddFile={props.onAddFile}
            />
          ))}
        </Group>
      )}

      <Group title="Preview">
        <SegmentedControl
          label="Formats"
          size="sm"
          value={props.focus}
          options={[
            { value: 'all' as const, label: 'All' },
            ...descriptor.formats.map((id) => ({ value: id, label: id })),
          ]}
          onValueChange={props.onFocus}
          className="w-full"
        />
        {descriptor.alpha !== 'none' && (
          <Switch
            label="Transparent background"
            checked={state.transparent}
            onCheckedChange={(transparent) => set({ transparent })}
          />
        )}
        {state.transparent && (
          <BackdropPicker
            value={props.backdrop}
            onChange={props.onBackdrop}
            transition={descriptor.structure === 'transition'}
            onAddFile={props.onAddFile}
          />
        )}
        <Switch label="Safe areas (G)" checked={props.guides} onCheckedChange={props.onGuides} />
        <Field label="Render quality">
          <SegmentedControl
            label="Render quality"
            size="sm"
            value={props.quality}
            options={[
              { value: 'adaptive', label: 'Adaptive' },
              { value: 'full', label: 'Full' },
            ]}
            onValueChange={props.onQuality}
            className="w-full"
          />
        </Field>
        <Button onClick={props.onCapture} className="w-full">
          <DownloadIcon size={18} /> PNG stills at 1080p
        </Button>
      </Group>

      {props.exportPanel && <Group title="Export">{props.exportPanel}</Group>}

      <Group title="This device">
        <DeviceReport capabilities={props.capabilities} inline={props.inline} />
      </Group>

      <Group title="State">
        <StateEditor state={state} onApply={props.onApplyJson} />
      </Group>
    </div>
  );
}

function StateEditor({ state, onApply }: { state: DesignState; onApply: (raw: unknown) => void }) {
  const serialized = JSON.stringify(state, null, 2);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  return (
    <details className="group">
      <summary className="cursor-pointer text-[12px] text-fg-2 select-none">Edit as JSON</summary>
      <div className="mt-3 flex flex-col gap-2">
        <label htmlFor={id} className="sr-only">
          Design state JSON
        </label>
        <textarea
          id={id}
          spellCheck={false}
          rows={14}
          value={draft ?? serialized}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          className="w-full resize-y rounded-md border border-line bg-bg-3 p-3 font-mono text-[11px] leading-relaxed text-fg-2"
        />
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={draft === null}
            onClick={() => {
              try {
                onApply(JSON.parse(draft ?? serialized));
                setDraft(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Invalid JSON');
              }
            }}
          >
            Apply
          </Button>
          <Button
            size="sm"
            disabled={draft === null}
            onClick={() => {
              setDraft(null);
              setError(null);
            }}
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void navigator.clipboard?.writeText(serialized)}
          >
            Copy
          </Button>
        </div>
      </div>
    </details>
  );
}

/** Capability readout, so real devices (Safari, iOS) can be checked from the Lab. */
function DeviceReport({
  capabilities,
  inline,
}: {
  capabilities: Capabilities | null;
  inline: boolean;
}) {
  if (!capabilities) return <p className="text-[12px] text-fg-3">Probing…</p>;
  const where = inline ? 'main thread' : 'worker';
  const rows: [string, boolean | string][] = [
    [`Animation frames (${where})`, capabilities.animationFrame],
    ['OffscreenCanvas', capabilities.offscreenCanvas],
    ['WebGL2', capabilities.webgl2],
    ['Float color buffers', capabilities.floatColorBuffer],
    ['Half-float color buffers', capabilities.halfFloatColorBuffer],
    ['Max texture', capabilities.maxTextureSize ? `${capabilities.maxTextureSize} px` : false],
    ['WebCodecs', capabilities.webCodecs],
    ['H.264 encode', capabilities.encoders.avc],
    ['VP9 encode', capabilities.encoders.vp9],
    ['Transparent WebM', capabilities.encoders.vp9Alpha],
    ['AV1 encode', capabilities.encoders.av1],
  ];
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[12px]">
      {rows.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="text-fg-2">{name}</dt>
          <dd
            className={cn(
              'text-right font-mono tabular-nums',
              value === false ? 'text-fg-3' : 'text-fg',
            )}
          >
            {typeof value === 'string' ? value : value ? 'Yes' : 'No'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
