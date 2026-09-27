/**
 * Main-thread client for the render worker (docs/06-engine.md §3). Features talk to the engine
 * only through this client; template code never loads on the main thread.
 */

import type { DesignState } from '../template/state';
import type {
  FrameInfo,
  HostMessage,
  QualityMode,
  TransferableGraphic,
  ViewId,
  ViewSize,
  WorkerMessage,
} from './protocol';

/** A Worker, or anything with the same messaging shape (see `createInlineEndpoint`). */
export type RenderEndpoint = {
  postMessage(message: HostMessage, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerMessage>) => void): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerMessage>) => void,
  ): void;
  terminate(): void;
};

type Views = ViewId | readonly ViewId[];
type Pending = { resolve: (blob: Blob) => void; reject: (error: Error) => void };

const list = (views: Views): readonly ViewId[] => (typeof views === 'string' ? [views] : views);

export class RenderClient {
  private readonly listeners = new Set<(message: WorkerMessage) => void>();
  private readonly snapshots = new Map<number, Pending>();
  /** Sequence number of the latest transport command sent to each view. */
  private readonly transport = new Map<ViewId, number>();
  private nextRequest = 1;
  private nextSeq = 1;
  private disposed = false;

  constructor(private readonly endpoint: RenderEndpoint) {
    endpoint.addEventListener('message', this.receive);
  }

  /** Hands a canvas to the worker; pass `canvasElement.transferControlToOffscreen()`. */
  attach(view: ViewId, canvas: OffscreenCanvas, size: ViewSize, interactive = false): void {
    this.send({ type: 'attach', view, canvas, size, interactive }, [canvas]);
  }

  detach(view: ViewId): void {
    this.send({ type: 'detach', view });
  }

  resize(view: ViewId, size: ViewSize): void {
    this.send({ type: 'resize', view, size });
  }

  /** Loads a template; the worker answers with `loaded` (descriptor + sanitized state). */
  load(view: ViewId, templateId: string, options: { state?: unknown; look?: number } = {}): void {
    this.send({ type: 'load', view, templateId, ...options });
  }

  setState(view: ViewId, state: DesignState): void {
    this.send({ type: 'setState', view, state });
  }

  play(views: Views): void {
    this.send({ type: 'play', views: list(views), seq: this.sequence(views) });
  }

  pause(views: Views): void {
    this.send({ type: 'pause', views: list(views), seq: this.sequence(views) });
  }

  seek(views: Views, t: number, scrub = false): void {
    this.send({ type: 'seek', views: list(views), t, scrub, seq: this.sequence(views) });
  }

  /**
   * Whether a frame reflects the latest transport command sent to its view. Frames already in
   * flight when the page seeks, plays or pauses show an older time; a playhead that follows
   * frames should skip them.
   */
  isCurrent(frame: FrameInfo): boolean {
    return frame.seq >= (this.transport.get(frame.view) ?? 0);
  }

  setLoop(views: Views, loop: boolean): void {
    this.send({ type: 'setLoop', views: list(views), loop });
  }

  setQuality(views: Views, mode: QualityMode): void {
    this.send({ type: 'setQuality', views: list(views), mode });
  }

  /** Renders a PNG still of `view` at time `t` and short-side resolution `shortSide`. */
  snapshot(view: ViewId, t: number, shortSide: number): Promise<Blob> {
    const requestId = this.nextRequest++;
    return new Promise<Blob>((resolve, reject) => {
      this.snapshots.set(requestId, { resolve, reject });
      this.send({ type: 'snapshot', requestId, view, t, shortSide });
    });
  }

  /** Asks the rendering side for its capabilities (answered with a `capabilities` message). */
  probe(): void {
    this.send({ type: 'probe' });
  }

  /** Hands a decoded user file to the worker; a raster bitmap is transferred (not usable here after). */
  setAsset(hash: string, asset: TransferableGraphic): void {
    this.send({ type: 'setAsset', hash, asset }, asset.kind === 'raster' ? [asset.bitmap] : []);
  }

  dropAsset(hash: string): void {
    this.send({ type: 'dropAsset', hash });
  }

  /** Subscribes to worker messages; returns the unsubscribe function. */
  subscribe(listener: (message: WorkerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.endpoint.removeEventListener('message', this.receive);
    this.endpoint.terminate();
    for (const pending of this.snapshots.values()) pending.reject(new Error('Renderer disposed'));
    this.snapshots.clear();
    this.listeners.clear();
  }

  private sequence(views: Views): number {
    const seq = this.nextSeq++;
    for (const view of list(views)) this.transport.set(view, seq);
    return seq;
  }

  private send(message: HostMessage, transfer: Transferable[] = []): void {
    if (!this.disposed) this.endpoint.postMessage(message, transfer);
  }

  private readonly receive = (event: MessageEvent<WorkerMessage>): void => {
    const message = event.data;
    if (message.type === 'snapshot') {
      const pending = this.snapshots.get(message.requestId);
      this.snapshots.delete(message.requestId);
      if (message.blob) pending?.resolve(message.blob);
      else pending?.reject(new Error(message.error ?? 'Snapshot failed'));
      return;
    }
    for (const listener of this.listeners) listener(message);
  };
}
