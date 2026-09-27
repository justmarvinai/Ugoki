'use client';

/**
 * Look swatches (docs/02-experience.md §6): a template's art-directed combinations of palette,
 * pairing and values. Pointing at one previews it on the stage (`onPreview`); a click commits.
 */

import { type DesignState, resolvePalette, type TemplateDescriptor, toCss } from '@/engine/host';
import { cn } from '@/lib/cn';
import { samePalette } from './palette-picker';

type Look = TemplateDescriptor['looks'][number];

/** The design with a Look applied: its palette, its pairing where built, and its values. */
export function withLook(descriptor: TemplateDescriptor, design: DesignState, look: Look) {
  return {
    ...design,
    palette: look.palette,
    pairing: descriptor.pairings.includes(look.pairing) ? look.pairing : design.pairing,
    props: look.values ? { ...design.props, ...look.values } : design.props,
  };
}

/** The Look the design currently wears, if any. */
export function currentLook(descriptor: TemplateDescriptor, design: DesignState): number {
  return descriptor.looks.findIndex(
    (look) => samePalette(design.palette, look.palette) && design.pairing === look.pairing,
  );
}

export function LookSwatches({
  descriptor,
  design,
  onChange,
  onPreview,
}: {
  descriptor: TemplateDescriptor;
  design: DesignState;
  onChange: (design: DesignState) => void;
  onPreview?: (design: DesignState | null) => void;
}) {
  const active = currentLook(descriptor, design);
  return (
    <fieldset className="grid grid-cols-3 gap-2" onPointerLeave={() => onPreview?.(null)}>
      <legend className="sr-only">Looks</legend>
      {descriptor.looks.map((look, i) => {
        const palette = resolvePalette(look.palette);
        return (
          <button
            key={look.id}
            type="button"
            aria-pressed={i === active}
            onClick={() => {
              onPreview?.(null);
              onChange(withLook(descriptor, design, look));
            }}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') onPreview?.(withLook(descriptor, design, look));
            }}
            className={cn(
              'flex h-16 flex-col justify-end rounded-md p-2 text-left text-[12px] font-[550] ring-1 ring-line transition-[box-shadow,transform] duration-(--duration-micro) ease-swift active:scale-[0.97]',
              i === active && 'ring-2 ring-fg',
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
  );
}
