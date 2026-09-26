/**
 * Serializable template descriptions. Template code only runs inside the render worker
 * (docs/05-architecture.md §9); the main thread receives this plain-data description to build
 * the inspector, Looks and format pickers.
 */

import type { Structure } from '../timeline/timeline';
import type { ControlSchema } from './controls';
import type { AlphaSupport, AnyTemplate, Look, TemplateMeta } from './define';
import type { FormatId } from './formats';
import type { PairingId } from './pairings';
import type { PaletteRef } from './palettes';
import { availablePairings } from './state';

export type TemplateDescriptor = {
  id: string;
  version: number;
  meta: TemplateMeta;
  formats: readonly FormatId[];
  structure: Structure;
  duration: { default: number | 'auto'; min: number; max: number };
  alpha: AlphaSupport;
  poster: number;
  palettes: readonly PaletteRef[];
  /** Pairings whose fonts are built, in the template's order. */
  pairings: readonly PairingId[];
  controls: ControlSchema;
  looks: readonly Look<ControlSchema>[];
};

export function describeTemplate(template: AnyTemplate): TemplateDescriptor {
  return {
    id: template.id,
    version: template.version,
    meta: template.meta,
    formats: template.formats,
    structure: template.structure,
    duration: template.duration,
    alpha: template.alpha,
    poster: template.poster,
    palettes: template.palettes,
    pairings: availablePairings(template),
    controls: template.controls as ControlSchema,
    looks: template.looks as readonly Look<ControlSchema>[],
  };
}
