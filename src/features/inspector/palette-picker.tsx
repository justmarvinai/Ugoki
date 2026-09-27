'use client';

/**
 * Palettes as swatch strips (docs/03-design-system.md §8), and a brand color turned into Brand
 * Light, Dark or Bold palettes. Pointing at a swatch previews it (`onPreview`); a click commits.
 */

import { useId, useState } from 'react';
import { IconButton } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { ShuffleIcon } from '@/design/icons';
import {
  BRAND_VARIANTS,
  type BrandVariant,
  type PaletteRef,
  resolvePalette,
  toCss,
} from '@/engine/host';
import { cn } from '@/lib/cn';

export const samePalette = (a: PaletteRef, b: PaletteRef) =>
  JSON.stringify(a) === JSON.stringify(b);

/** A vivid random color: random hue, high saturation, mid lightness (HSL → hex). */
export function randomBrandColor(): string {
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

const STRIP = ['bg', 'surface', 'fg', 'muted', 'accent', 'accent2'] as const;

export function PalettePicker({
  palettes,
  value,
  onChange,
  onPreview,
}: {
  palettes: readonly PaletteRef[];
  value: PaletteRef;
  onChange: (palette: PaletteRef) => void;
  /** A palette to show on the stage while pointing at it (null when the pointer leaves). */
  onPreview?: (palette: PaletteRef | null) => void;
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
      <fieldset className="grid grid-cols-5 gap-2" onPointerLeave={() => onPreview?.(null)}>
        <legend className="sr-only">Palettes</legend>
        {palettes.map((ref) => {
          const palette = resolvePalette(ref);
          const active = samePalette(ref, value);
          return (
            <button
              key={JSON.stringify(ref)}
              type="button"
              aria-pressed={active}
              aria-label={palette.name}
              title={palette.name}
              onClick={() => {
                onPreview?.(null);
                onChange(ref);
              }}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') onPreview?.(ref);
              }}
              className={cn(
                'flex h-10 overflow-hidden rounded-md ring-1 ring-line transition-transform duration-(--duration-micro) ease-swift active:scale-[0.95]',
                active && 'ring-2 ring-fg',
              )}
            >
              {STRIP.map((role) => (
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
          options={BRAND_VARIANTS.map((v) => ({
            value: v,
            label: v[0]?.toUpperCase() + v.slice(1),
          }))}
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
