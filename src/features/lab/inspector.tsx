'use client';

/**
 * Lab inspector: Looks, palettes (incl. brand colors), pairings, energy, duration, the
 * template's own controls (logos and images included), stress text, preview options with the
 * backdrop, stills and the raw state.
 */

import { type ReactNode, useId, useState } from 'react';
import { Button, IconButton } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { Slider } from '@/components/slider';
import { Switch } from '@/components/switch';
import { DownloadIcon, ShuffleIcon } from '@/design/icons';
import {
  type AssetRef,
  type Backdrop,
  BRAND_VARIANTS,
  type BrandVariant,
  type Capabilities,
  type Control,
  type DesignState,
  ENERGY_IDS,
  type EnergyId,
  type FormatId,
  type ImageControl,
  PAIRINGS,
  type PaletteRef,
  PLACEHOLDER_NAMES,
  PLACEHOLDERS,
  type QualityMode,
  resolvePalette,
  type TemplateDescriptor,
  type TimelineWarning,
  toCss,
} from '@/engine/host';
import { cn } from '@/lib/cn';
import { ACCEPTED_FILES, type ImportedFile } from '../assets/import-file';
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

const sameRef = (a: PaletteRef, b: PaletteRef) => JSON.stringify(a) === JSON.stringify(b);

function randomBrandColor(): string {
  // Vivid-ish random colors: random hue, high saturation, mid lightness (HSL → hex).
  const h = Math.random() * 360;
  const s = 0.55 + Math.random() * 0.4;
  const l = 0.35 + Math.random() * 0.3;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

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
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="sr-only">Looks</legend>
          {descriptor.looks.map((look) => {
            const palette = resolvePalette(look.palette);
            const active = sameRef(state.palette, look.palette) && state.pairing === look.pairing;
            return (
              <button
                key={look.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    ...state,
                    palette: look.palette,
                    pairing: descriptor.pairings.includes(look.pairing)
                      ? look.pairing
                      : state.pairing,
                    props: look.values ? { ...state.props, ...look.values } : state.props,
                  })
                }
                className={cn(
                  'flex h-16 flex-col justify-end rounded-md p-2 text-left text-[12px] font-[550] ring-1 ring-line transition-[box-shadow,transform] duration-(--duration-micro) ease-swift active:scale-[0.97]',
                  active && 'ring-2 ring-fg',
                )}
                style={{ background: toCss(palette.roles.bg), color: toCss(palette.roles.fg) }}
              >
                <span
                  className="mb-auto h-0.5 w-4 rounded-full"
                  style={{ background: toCss(palette.roles.accent) }}
                />
                {look.name}
              </button>
            );
          })}
        </fieldset>
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-line border-b px-5 py-5">
      <h2 className="text-[13px] font-[650] text-fg">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  htmlFor,
  children,
}: {
  label: string;
  value?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[12px]">
        <label htmlFor={htmlFor} className="text-fg-2">
          {label}
        </label>
        {value && <span className="font-mono text-fg-3 tabular-nums">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function ControlField({
  name,
  control,
  value,
  onChange,
  onAddFile,
}: {
  name: string;
  control: Control;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  onAddFile: (file: File) => Promise<ImportedFile>;
}) {
  const id = useId();
  switch (control.kind) {
    case 'text': {
      const text = typeof value === 'string' ? value : control.default;
      const count = [...text].length;
      const near = count >= control.maxLength * 0.8;
      const common = {
        id,
        value: text,
        maxLength: control.maxLength,
        placeholder: control.placeholder ?? (control.optional ? 'Optional' : undefined),
        onChange: (event: { target: { value: string } }) => onChange(name, event.target.value),
        className:
          'w-full resize-none rounded-md border border-line bg-bg-3 px-3 py-2 text-[14px] leading-snug text-fg placeholder:text-fg-3 transition-colors duration-(--duration-micro) hover:border-line-strong focus:border-line-strong focus-visible:outline-2 focus-visible:outline-focus',
      };
      return (
        <Field
          label={control.label}
          htmlFor={id}
          value={near ? `${count}/${control.maxLength}` : undefined}
        >
          {control.multiline ? (
            <textarea rows={Math.min(control.maxLines ?? 3, 4)} {...common} />
          ) : (
            <input type="text" {...common} />
          )}
        </Field>
      );
    }
    case 'choice':
      if (control.display === 'select') {
        return (
          <Field label={control.label} htmlFor={id}>
            <select
              id={id}
              value={typeof value === 'string' ? value : control.default}
              onChange={(event) => onChange(name, event.target.value)}
              className="h-8 w-full rounded-md border border-line bg-bg-3 px-2 text-[13px] font-[550] text-fg"
            >
              {control.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        );
      }
      return (
        <Field label={control.label}>
          <SegmentedControl
            label={control.label}
            value={typeof value === 'string' ? value : control.default}
            options={control.options.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            onValueChange={(next) => onChange(name, next)}
            className="w-full"
          />
        </Field>
      );
    case 'toggle':
      return (
        <Switch
          label={control.label}
          checked={typeof value === 'boolean' ? value : control.default}
          onCheckedChange={(next) => onChange(name, next)}
        />
      );
    case 'image':
      return (
        <ImageField
          name={name}
          control={control}
          value={value}
          onChange={onChange}
          onAddFile={onAddFile}
        />
      );
    case 'number': {
      const number = typeof value === 'number' ? value : control.default;
      const unit = control.unit ?? '';
      return (
        <Field label={control.label} value={`${number}${unit}`}>
          <Slider
            label={control.label}
            value={number}
            min={control.min}
            max={control.max}
            step={control.step}
            format={(v) => `${v}${unit}`}
            onValueChange={(next) => onChange(name, next)}
          />
        </Field>
      );
    }
  }
}

function FileButton({ label, onFile }: { label: string; onFile: (file: File) => void }) {
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

/** A logo/image slot: the built-in placeholders, or a file from this device. */
function ImageField({
  name,
  control,
  value,
  onChange,
  onAddFile,
}: {
  name: string;
  control: ImageControl;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  onAddFile: (file: File) => Promise<ImportedFile>;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const ref = (value === undefined ? control.default : value) as AssetRef | null;
  const add = async (file: File) => {
    setStatus('Reading…');
    try {
      const imported = await onAddFile(file);
      onChange(name, { kind: 'user', hash: imported.hash, name: imported.name });
      setStatus(imported.notes.length > 0 ? imported.notes.join(' ') : null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Field label={control.label}>
      <div className="flex flex-wrap gap-1.5">
        {PLACEHOLDERS[control.accept].map((id) => (
          <Button
            key={id}
            size="sm"
            variant={ref?.kind === 'placeholder' && ref.id === id ? 'primary' : 'secondary'}
            aria-pressed={ref?.kind === 'placeholder' && ref.id === id}
            onClick={() => onChange(name, { kind: 'placeholder', id })}
          >
            {PLACEHOLDER_NAMES[id] ?? id}
          </Button>
        ))}
        <FileButton label="Your file…" onFile={(file) => void add(file)} />
        {control.optional && (
          <Button size="sm" variant="ghost" onClick={() => onChange(name, null)}>
            None
          </Button>
        )}
      </div>
      {ref?.kind === 'user' && (
        <p className="truncate text-[12px] text-fg-2">{ref.name ?? 'Your file'}</p>
      )}
      {status && (
        <p role="status" className="text-[12px] leading-snug text-fg-3">
          {status}
        </p>
      )}
    </Field>
  );
}

/** What shows behind a transparent design (preview only — never exported unless baked). */
function BackdropPicker({
  value,
  onChange,
  transition,
  onAddFile,
}: {
  value: Backdrop;
  onChange: (backdrop: Backdrop) => void;
  transition: boolean;
  onAddFile: (file: File) => Promise<ImportedFile>;
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

function PalettePicker({
  palettes,
  value,
  onChange,
}: {
  palettes: readonly PaletteRef[];
  value: PaletteRef;
  onChange: (palette: PaletteRef) => void;
}) {
  const [brand, setBrand] = useState(value.kind === 'brand' ? value.color : '#5A2BE8');
  const variant: BrandVariant = value.kind === 'brand' ? value.variant : 'bold';
  const colorId = useId();
  const applyBrand = (color: string, next: BrandVariant) => {
    setBrand(color);
    onChange({ kind: 'brand', color, variant: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="grid grid-cols-5 gap-2">
        <legend className="sr-only">Palettes</legend>
        {palettes.map((ref) => {
          const palette = resolvePalette(ref);
          const active = sameRef(ref, value);
          return (
            <button
              key={JSON.stringify(ref)}
              type="button"
              aria-pressed={active}
              aria-label={palette.name}
              title={palette.name}
              onClick={() => onChange(ref)}
              className={cn(
                'flex h-10 overflow-hidden rounded-md ring-1 ring-line transition-transform duration-(--duration-micro) ease-swift active:scale-[0.95]',
                active && 'ring-2 ring-fg',
              )}
            >
              {(['bg', 'fg', 'accent', 'muted'] as const).map((role) => (
                <span
                  key={role}
                  className={role === 'bg' ? 'flex-[2]' : 'flex-1'}
                  style={{ background: toCss(palette.roles[role]) }}
                />
              ))}
            </button>
          );
        })}
      </fieldset>
      <div className="flex items-center gap-2">
        <label htmlFor={colorId} className="sr-only">
          Brand color
        </label>
        <input
          id={colorId}
          type="color"
          value={brand}
          onChange={(event) => applyBrand(event.target.value, variant)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-sm border border-line bg-transparent"
        />
        <SegmentedControl
          label="Brand palette"
          size="sm"
          value={value.kind === 'brand' ? value.variant : ('none' as const)}
          options={[
            ...BRAND_VARIANTS.map((v) => ({
              value: v,
              label: v[0]?.toUpperCase() + v.slice(1),
            })),
          ]}
          onValueChange={(next) => applyBrand(brand, next as BrandVariant)}
          className="flex-1"
        />
        <IconButton
          label="Random brand color"
          onClick={() => applyBrand(randomBrandColor(), variant)}
        >
          <ShuffleIcon size={18} />
        </IconButton>
      </div>
      {value.kind === 'brand' && (
        <p className="font-mono text-[11px] text-fg-3 uppercase tabular-nums">
          Brand {value.variant} · {value.color}
        </p>
      )}
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
    ['VP9 + alpha encode', capabilities.encoders.vp9Alpha],
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
