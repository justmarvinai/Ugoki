/**
 * Scene building (docs/06-engine.md §2): resolves a design state against its template into a
 * ready-to-render scene. Fonts load first (async); `build` then runs synchronously, so a scene
 * is either complete or not swapped in at all.
 */

import { placeholderGraphic } from '../assets/placeholders';
import { type AssetRef, CENTER, type FocalPoint, type Graphic } from '../assets/types';
import type { Effects } from '../compositor/effects';
import { clamp } from '../core/math';
import { hashString, mixSeeds, rngFor } from '../core/rng';
import type { Canvas2D, CanvasDraw } from '../draw/canvas-draw';
import type { EditableRegion } from '../draw/types';
import type { ControlSchema, Props } from '../template/controls';
import type { AnyTemplate, BuildContext, Scene } from '../template/define';
import { createFrame, type FrameSpec } from '../template/formats';
import { PAIRINGS, type Pairing, pairingFonts } from '../template/pairings';
import { type Palette, resolvePalette } from '../template/palettes';
import type { DesignState } from '../template/state';
import type { TextEngineHandle } from '../text/engine';
import type { TextEngine } from '../text/types';
import { ENERGIES } from '../timeline/energy';
import { createTimeline, type Timeline } from '../timeline/timeline';

export type BuiltScene = {
  readonly template: AnyTemplate;
  readonly state: DesignState;
  readonly frame: FrameSpec;
  readonly palette: Palette;
  readonly pairing: Pairing;
  readonly timeline: Timeline;
  readonly scene: Scene;
  /** Image controls whose file wasn't available (drawn with their placeholder instead). */
  readonly missingAssets: readonly string[];
};

/** Finds a user's file (decoded) by the SHA-256 of its bytes. */
export type AssetLookup = (hash: string) => Graphic | undefined;

/** Loads the fonts a state needs, then builds its scene. */
export async function prepareScene(
  template: AnyTemplate,
  state: DesignState,
  text: TextEngineHandle,
  assets?: AssetLookup,
): Promise<BuiltScene> {
  await text.load(pairingFonts(state.pairing));
  return buildScene(template, state, text, assets);
}

/** The asset references a state uses (user files only), for loading them before a build. */
export function userAssets(template: AnyTemplate, state: DesignState): string[] {
  const hashes: string[] = [];
  for (const [key, control] of Object.entries(template.controls as ControlSchema)) {
    const ref = state.props[key] as AssetRef | null | undefined;
    if (control.kind === 'image' && ref?.kind === 'user' && !hashes.includes(ref.hash)) {
      hashes.push(ref.hash);
    }
  }
  return hashes;
}

/** Builds a scene synchronously; the pairing's fonts must already be loaded. */
export function buildScene(
  template: AnyTemplate,
  state: DesignState,
  text: TextEngine,
  assets?: AssetLookup,
): BuiltScene {
  const frame = createFrame(state.format);
  const energy = ENERGIES[state.energy];
  const palette = resolvePalette(state.palette);
  const pairing = PAIRINGS[state.pairing];
  const props = state.props as Props<ControlSchema>;
  const timeline = createTimeline({
    structure: template.structure,
    spec: template.timing({ props, frame, energy }),
    energy,
    duration: state.duration,
    bounds: template.duration,
  });
  // Different templates with the same user seed still get unrelated random streams.
  const seed = mixSeeds(hashString(template.id), state.seed);
  const controls = template.controls as ControlSchema;
  const missingAssets: string[] = [];
  const graphic = (key: string): Graphic | null => {
    const control = controls[key];
    if (control?.kind !== 'image') throw new Error(`"${key}" is not an image control`);
    const ref = props[key] as AssetRef | null;
    if (ref === null) return null;
    if (ref.kind === 'user') {
      const found = assets?.(ref.hash);
      if (found) return found;
      if (!missingAssets.includes(key)) missingAssets.push(key);
    } else {
      const found = placeholderGraphic(ref.id);
      if (found) return found;
    }
    return control.default.kind === 'placeholder' ? placeholderGraphic(control.default.id) : null;
  };
  const focal = (key: string): FocalPoint => {
    const control = controls[key];
    if (control?.kind !== 'image') throw new Error(`"${key}" is not an image control`);
    return (props[key] as AssetRef | null)?.focal ?? CENTER;
  };
  const context: BuildContext<ControlSchema> = {
    props,
    frame,
    palette,
    pairing,
    energy,
    timeline,
    text,
    transparent: state.transparent,
    seed,
    rng: (key) => rngFor(seed, key),
    // `tl.p` already scales in/out windows by `energy.time`; compensate so real gaps are
    // `gap × energy.stagger` (docs/04-motion-language.md §4).
    stagger: (gap) => (gap * energy.stagger) / energy.time,
    travel: (distance) => distance * energy.travel,
    graphic,
    focal,
  };
  const scene = template.build(context);
  return { template, state, frame, palette, pairing, timeline, scene, missingAssets };
}

export type RenderOptions = {
  ctx: Canvas2D;
  /** Output pixels per design unit. */
  scale: number;
  /** Seconds; clamped to the scene's duration. */
  t: number;
  collectRegions?: boolean;
  /** Effects backend for `g.fx` and luma masks (Canvas 2D when omitted). */
  effects?: Effects;
};

/** Renders one frame of a built scene with `drawer`; returns the editor regions. */
export function renderScene(
  built: BuiltScene,
  drawer: CanvasDraw,
  options: RenderOptions,
): EditableRegion[] {
  drawer.begin({
    ctx: options.ctx,
    frame: built.frame,
    scale: options.scale,
    transparent: built.state.transparent,
    layout: built.state.layout,
    collectRegions: options.collectRegions ?? false,
    effects: options.effects,
  });
  built.scene.render({
    t: clamp(options.t, 0, built.timeline.duration),
    g: drawer,
    tl: built.timeline,
  });
  return drawer.end();
}
