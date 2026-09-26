/**
 * The template contract (docs/06-engine.md §4, ADR-008).
 *
 * A template is a pure function of (props, format, t): `build` does all t-independent work once
 * per state change and returns a Scene whose `render` draws any frame synchronously.
 */

import type { Rng } from '../core/rng';
import type { Draw } from '../draw/types';
import type { TextEngine } from '../text/types';
import type { EnergyProfile } from '../timeline/energy';
import type { Structure, Timeline, TimingSpec } from '../timeline/timeline';
import type { CategoryId } from './categories';
import type { ControlSchema, Props } from './controls';
import type { FormatId, FrameSpec } from './formats';
import type { Pairing, PairingId } from './pairings';
import type { Palette, PaletteRef } from './palettes';

export type AlphaSupport = 'default' | 'optional' | 'none';

export type TemplateMeta = {
  name: string;
  /** One-liner shown in the gallery. */
  tagline: string;
  category: CategoryId;
  tags: readonly string[];
  useCases: readonly string[];
};

export type Look<S extends ControlSchema> = {
  id: string;
  name: string;
  palette: PaletteRef;
  pairing: PairingId;
  values?: Partial<Props<S>>;
};

export type TimingContext<S extends ControlSchema> = {
  props: Props<S>;
  frame: FrameSpec;
  energy: EnergyProfile;
};

export type BuildContext<S extends ControlSchema> = {
  props: Props<S>;
  frame: FrameSpec;
  palette: Palette;
  pairing: Pairing;
  energy: EnergyProfile;
  timeline: Timeline;
  text: TextEngine;
  /** Background is rendered as a palette color, or left transparent for alpha export. */
  transparent: boolean;
  seed: number;
  /** Seeded random stream for an element key (stable across renders and exports). */
  rng(key: string): Rng;
  /** A stagger gap scaled by the energy profile. */
  stagger(gap: number): number;
  /** A travel distance scaled by the energy profile. */
  travel(distance: number): number;
};

export type RenderContext = {
  /** Time in seconds. */
  t: number;
  g: Draw;
  tl: Timeline;
};

export type Scene = {
  render(frame: RenderContext): void;
};

export type TemplateDefinition<S extends ControlSchema> = {
  id: string;
  /** Bump when the control schema changes incompatibly, and add `migrate`. */
  version: number;
  meta: TemplateMeta;
  /** Supported formats; the first is the default. */
  formats: readonly FormatId[];
  structure: Structure;
  duration: { default: number | 'auto'; min: number; max: number };
  alpha: AlphaSupport;
  /** The hero frame in seconds at the default duration (gallery posters, thumbnails). */
  poster: number;
  palettes: readonly PaletteRef[];
  pairings: readonly PairingId[];
  controls: S;
  looks: readonly Look<S>[];
  timing(context: TimingContext<S>): TimingSpec;
  build(context: BuildContext<S>): Scene;
  migrate?(props: Readonly<Record<string, unknown>>, fromVersion: number): Record<string, unknown>;
};

/** Any template, regardless of its control schema. */
// biome-ignore lint/suspicious/noExplicitAny: heterogenous registry of differently-typed templates
export type AnyTemplate = TemplateDefinition<any>;

/** Declares a template. Performs structural checks so mistakes surface at load time. */
export function defineTemplate<const S extends ControlSchema>(
  definition: TemplateDefinition<S>,
): TemplateDefinition<S> {
  const problems: string[] = [];
  if (!/^[a-z][a-z0-9-]*$/.test(definition.id)) problems.push('id must be a lowercase slug');
  if (definition.formats.length === 0) problems.push('at least one format is required');
  if (definition.looks.length === 0) problems.push('at least one Look is required');
  if (definition.pairings.length === 0) problems.push('at least one pairing is required');
  const { min, max } = definition.duration;
  if (!(min > 0 && max >= min)) problems.push('duration bounds are invalid');
  if (typeof definition.duration.default === 'number') {
    const d = definition.duration.default;
    if (d < min || d > max) problems.push('default duration is outside its bounds');
  }
  if (problems.length > 0) {
    throw new Error(`Template "${definition.id}": ${problems.join('; ')}`);
  }
  return definition;
}
