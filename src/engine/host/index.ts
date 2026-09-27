/**
 * The engine host — the only way features reach the engine (docs/05-architecture.md §4).
 * Main-thread safe: the render client plus the engine's pure data (formats, palettes, pairings,
 * energies) and state types. Nothing here imports the renderer or template code; the worker
 * side lives in `./serve` (bound in `src/workers/render.worker.ts`).
 */

export { PLACEHOLDER_NAMES, PLACEHOLDERS } from '../assets/placeholders';
export { importSvg, type SvgImport, sanitizeSvg } from '../assets/svg';
export type { AssetRef, Graphic, VectorGraphic } from '../assets/types';
export { toCss } from '../core/color';
export type { ExportAsset } from '../export/protocol';
export type { ExportJob, ExportProgress, ExportResult } from '../export/run';
export {
  EXPORT_FORMATS,
  EXPORT_QUALITIES,
  EXPORT_RESOLUTIONS,
  EXTENSIONS,
  type ExportFormat,
  type ExportQuality,
  type ExportSettings,
  exportFileName,
  exportSize,
  FRAME_RATES,
  formatAvailability,
  frameCount,
  GIF_FRAME_RATES,
  GIF_WIDTHS,
  KEEPS_ALPHA,
  MIME_TYPES,
} from '../export/settings';
export type { Backdrop } from '../runtime/backdrop';
export type { Capabilities, EncoderSupport } from '../runtime/capabilities';
export type { Control, ControlSchema, ImageControl } from '../template/controls';
export type { TemplateDescriptor } from '../template/describe';
export {
  createFrame,
  FORMAT_IDS,
  FORMATS,
  type FormatId,
  type FrameSpec,
} from '../template/formats';
export { PAIRINGS, type PairingId } from '../template/pairings';
export {
  BRAND_VARIANTS,
  type BrandVariant,
  PALETTES,
  type Palette,
  type PaletteRef,
  resolvePalette,
} from '../template/palettes';
export type { DesignState } from '../template/state';
export { ENERGIES, ENERGY_IDS, type EnergyId } from '../timeline/energy';
export type { Section, SectionName, TimelineWarning } from '../timeline/timeline';
export { RenderClient, type RenderEndpoint } from './client';
export { type ExportEndpoint, ExportFailure, type ExportRun, startExport } from './export-client';
export type {
  FrameInfo,
  HostMessage,
  QualityMode,
  TransferableGraphic,
  ViewId,
  ViewSize,
  WorkerMessage,
} from './protocol';
