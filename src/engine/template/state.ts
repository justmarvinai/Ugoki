/**
 * Design state — everything a draft or a share link stores about one design
 * (docs/05-architecture.md §6–8). `sanitizeState` makes any stored or shared state safe to use.
 */

import type { LayoutOffset } from '../draw/types';
import { type EnergyId, isEnergyId } from '../timeline/energy';
import { type ControlSchema, defaultProps, resolveProps } from './controls';
import type { AnyTemplate, Look } from './define';
import { type FormatId, isFormatId } from './formats';
import {
  type FontId,
  isPairingAvailable,
  isPairingId,
  type PairingId,
  pairingFonts,
} from './pairings';
import { type PaletteRef, sanitizePaletteRef } from './palettes';

export const FINISHES = ['clean', 'grain', 'glow'] as const;
export type Finish = (typeof FINISHES)[number];

export type DesignState = {
  templateId: string;
  templateVersion: number;
  props: Readonly<Record<string, unknown>>;
  format: FormatId;
  duration: number | 'auto';
  energy: EnergyId;
  palette: PaletteRef;
  pairing: PairingId;
  transparent: boolean;
  finish: Finish;
  seed: number;
  /** Offsets of movable groups: x/y in `u`, scale around the group's center. */
  layout: Readonly<Record<string, LayoutOffset>>;
};

/** Pairings of a template that can be offered (fonts built), in the template's order. */
/** Every font a design needs: its pairing's, plus any the template sets text in itself. */
export function designFonts(template: AnyTemplate, state: DesignState): FontId[] {
  return [...new Set([...pairingFonts(state.pairing), ...(template.fonts ?? [])])];
}

export function availablePairings(template: AnyTemplate): PairingId[] {
  return template.pairings.filter(isPairingAvailable);
}

function firstAvailablePairing(template: AnyTemplate, preferred?: PairingId): PairingId {
  if (preferred && isPairingAvailable(preferred)) return preferred;
  const available = availablePairings(template);
  const first = available[0];
  if (!first) throw new Error(`Template "${template.id}" has no pairing whose fonts are built`);
  return first;
}

export function initialState(template: AnyTemplate, lookIndex = 0): DesignState {
  const look = template.looks[lookIndex] ?? template.looks[0];
  const base: DesignState = {
    templateId: template.id,
    templateVersion: template.version,
    props: defaultProps(template.controls as ControlSchema),
    format: template.formats[0] as FormatId,
    duration: template.duration.default,
    energy: 'balanced',
    palette: template.palettes[0] ?? { kind: 'library', id: 'paper' },
    pairing: firstAvailablePairing(template),
    transparent: template.alpha === 'default',
    finish: 'clean',
    seed: 1,
    layout: {},
  };
  return look ? applyLook(template, base, look) : base;
}

export function applyLook(
  template: AnyTemplate,
  state: DesignState,
  look: Look<ControlSchema>,
): DesignState {
  return {
    ...state,
    palette: look.palette,
    pairing: firstAvailablePairing(template, look.pairing),
    props: look.values
      ? resolveProps(template.controls as ControlSchema, { ...state.props, ...look.values })
      : state.props,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function sanitizeLayout(value: unknown): Record<string, LayoutOffset> {
  if (!isRecord(value)) return {};
  const out: Record<string, LayoutOffset> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]{0,31}$/i.test(id) || !isRecord(raw)) continue;
    const num = (v: unknown, fallback: number, min: number, max: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
    out[id] = {
      x: num(raw.x, 0, -100, 100),
      y: num(raw.y, 0, -100, 100),
      scale: num(raw.scale, 1, 0.25, 4),
    };
  }
  return out;
}

/**
 * Turns untrusted input (a share link, an old draft) into a valid state for `template`.
 * Unknown keys are dropped, invalid values fall back to defaults, and older template versions
 * are migrated.
 */
export function sanitizeState(template: AnyTemplate, raw: unknown): DesignState {
  const fallback = initialState(template);
  if (!isRecord(raw)) return fallback;

  let props = isRecord(raw.props) ? raw.props : {};
  const version = typeof raw.templateVersion === 'number' ? raw.templateVersion : template.version;
  if (version < template.version && template.migrate) props = template.migrate(props, version);

  const format =
    isFormatId(raw.format) && template.formats.includes(raw.format) ? raw.format : fallback.format;
  const { min, max } = template.duration;
  const duration =
    raw.duration === 'auto' && template.duration.default === 'auto'
      ? 'auto'
      : typeof raw.duration === 'number' && Number.isFinite(raw.duration)
        ? Math.min(max, Math.max(min, raw.duration))
        : fallback.duration;

  return {
    templateId: template.id,
    templateVersion: template.version,
    props: resolveProps(template.controls as ControlSchema, props),
    format,
    duration,
    energy: isEnergyId(raw.energy) ? raw.energy : fallback.energy,
    palette: sanitizePaletteRef(raw.palette, fallback.palette),
    pairing:
      isPairingId(raw.pairing) &&
      template.pairings.includes(raw.pairing) &&
      isPairingAvailable(raw.pairing)
        ? raw.pairing
        : fallback.pairing,
    transparent: template.alpha !== 'none' && raw.transparent === true,
    finish: (FINISHES as readonly unknown[]).includes(raw.finish)
      ? (raw.finish as Finish)
      : 'clean',
    seed:
      typeof raw.seed === 'number' && Number.isInteger(raw.seed) ? raw.seed >>> 0 : fallback.seed,
    layout: sanitizeLayout(raw.layout),
  };
}
