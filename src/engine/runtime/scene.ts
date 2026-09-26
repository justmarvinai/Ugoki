/**
 * Scene building (docs/06-engine.md §2): resolves a design state against its template into a
 * ready-to-render scene. Fonts load first (async); `build` then runs synchronously, so a scene
 * is either complete or not swapped in at all.
 */

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
};

/** Loads the fonts a state needs, then builds its scene. */
export async function prepareScene(
  template: AnyTemplate,
  state: DesignState,
  text: TextEngineHandle,
): Promise<BuiltScene> {
  await text.load(pairingFonts(state.pairing));
  return buildScene(template, state, text);
}

/** Builds a scene synchronously; the pairing's fonts must already be loaded. */
export function buildScene(
  template: AnyTemplate,
  state: DesignState,
  text: TextEngine,
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
    stagger: (gap) => gap * energy.stagger,
    travel: (distance) => distance * energy.travel,
  };
  const scene = template.build(context);
  return { template, state, frame, palette, pairing, timeline, scene };
}

export type RenderOptions = {
  ctx: Canvas2D;
  /** Output pixels per design unit. */
  scale: number;
  /** Seconds; clamped to the scene's duration. */
  t: number;
  collectRegions?: boolean;
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
  });
  built.scene.render({
    t: clamp(options.t, 0, built.timeline.duration),
    g: drawer,
    tl: built.timeline,
  });
  return drawer.end();
}
