/**
 * The engine host — the only way features reach the engine (docs/05-architecture.md §4).
 * Main-thread safe: nothing here imports the renderer or template code. The worker side lives
 * in `./serve` (bound in `src/workers/render.worker.ts`).
 */

export { RenderClient, type RenderEndpoint } from './client';
export type {
  FrameInfo,
  HostMessage,
  QualityMode,
  ViewId,
  ViewSize,
  WorkerMessage,
} from './protocol';
