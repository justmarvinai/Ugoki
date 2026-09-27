/**
 * The public engine API — everything a template may import (docs/06-engine.md §4–7).
 * Templates import only from `@/engine`; ad-hoc bezier curves are deliberately not exported:
 * motion uses the named easings and springs of docs/04-motion-language.md.
 */

export * from './assets/imagery';
export { PROCEDURAL_IMAGES, type ProceduralSet } from './assets/procedural';
// Assets
export type {
  AssetRef,
  FocalPoint,
  Graphic,
  RasterGraphic,
  ShapePaint,
  VectorGraphic,
  VectorShape,
} from './assets/types';
// Color
export {
  adjustLightness,
  bestContrast,
  type Color,
  contrastRatio,
  ensureContrast,
  mixOklab,
  mixOklch,
  parseHex,
  rgb,
  withAlpha,
} from './core/color';
// Motion
export { EASE_NAMES, type EaseName, type EasingFn, ease, resolveEase } from './core/easing';
// Math
export {
  clamp,
  clamp01,
  degToRad,
  fract,
  insetRect,
  invLerp,
  lerp,
  mod,
  progress,
  type Rect,
  rect,
  remap,
  smoothstep,
  TAU,
  unionRect,
  type Vec2,
} from './core/math';
export type { Rng } from './core/rng';
export {
  SPRINGS,
  type SpringConfig,
  type SpringName,
  spring,
  springProgress,
  springSettleTime,
} from './core/spring';
export { type StaggerOptions, type StaggerPattern, stagger, staggerSpan } from './core/stagger';
export { stepped, wave } from './core/time';
// Drawing
export type {
  BlendMode,
  ClipShape,
  ColorAdjust,
  Draw,
  Fill,
  FxOptions,
  GlyphTransform,
  Gradient,
  GraphicOptions,
  GroupOptions,
  LayerOptions,
  MaskOptions,
  Paint,
  PathCommand,
  PathData,
  Stroke,
  TextDrawOptions,
  Transform,
} from './draw/types';
// Template contract
export { CATEGORIES, type CategoryId, categoryName } from './template/categories';
export {
  type Control,
  type ControlSchema,
  c,
  type Props,
} from './template/controls';
export {
  type AlphaSupport,
  type AnyTemplate,
  type BuildContext,
  defineTemplate,
  type Look,
  type RenderContext,
  type Scene,
  type TemplateDefinition,
  type TemplateMeta,
} from './template/define';
export { FORMATS, type FormatId, type FrameSpec } from './template/formats';
export type { FontRole, Pairing, PairingId } from './template/pairings';
export type { Palette, PaletteId, PaletteRef, PaletteRole } from './template/palettes';
export * from './text/figures';
// Text
export type {
  Glyph,
  TextAlign,
  TextBlock,
  TextBlockOptions,
  TextLine,
  TextStyle,
  TextWord,
} from './text/types';
// Time
export type { EnergyId, EnergyProfile } from './timeline/energy';
export {
  beatLength,
  CLEAN_END,
  readingTime,
  type SectionName,
  type Sequence,
  type SequenceBeat,
  type SequenceOptions,
  type Structure,
  sequence,
  type Timeline,
  type TimingSpec,
} from './timeline/timeline';
// UI Kit (UI-motion templates)
export * from './ui/kit';
