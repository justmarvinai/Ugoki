/**
 * Where exported frames go (docs/07-export.md §3–6): video through WebCodecs (Mediabunny), a
 * PNG sequence streamed into a ZIP (fflate, stored — PNGs are already compressed), a GIF
 * (modern-gif, one global palette) or a single PNG. Each sink reads the frame from its canvas,
 * and writes to the user's file as it goes when given a stream, or into memory otherwise.
 */

import { strToU8, Zip, ZipPassThrough } from 'fflate';
import {
  BufferTarget,
  CanvasSource,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  WebMOutputFormat,
} from 'mediabunny';
import { Encoder as GifEncoder } from 'modern-gif';
import { type ExportSettings, MIME_TYPES, videoBitrate } from './settings';

export type ExportStage = 'load' | 'build' | 'render' | 'encode' | 'save';

/** An export failure with the stage it happened in (for specific messages and fallbacks). */
export class ExportError extends Error {
  override name = 'ExportError';
  constructor(
    readonly stage: ExportStage,
    message: string,
  ) {
    super(message);
  }
}

export type SinkResult = {
  /** The file, unless it was written straight to disk. */
  blob: Blob | null;
  bytes: number;
};

export interface FrameSink {
  /** Frames are rendered into this canvas, then handed over with `add`. */
  readonly canvas: OffscreenCanvas;
  /** Takes the canvas's current frame (awaiting it respects the encoder's backpressure). */
  add(index: number, t: number): Promise<void>;
  finish(): Promise<SinkResult>;
  /** Stops and discards the output (the user's file isn't written). */
  cancel(): Promise<void>;
}

export type SinkOptions = {
  settings: ExportSettings;
  width: number;
  height: number;
  frames: number;
  /** The design is transparent and the format keeps alpha. */
  alpha: boolean;
  /** The user's file, when the browser can write to it as the export goes. */
  writable?: FileSystemWritableFileStream | undefined;
  /** README contents for PNG sequences. */
  readme?: string;
  /** Folder name inside the ZIP (the file name without its extension). */
  folder?: string;
};

export async function createSink(options: SinkOptions): Promise<FrameSink> {
  switch (options.settings.format) {
    case 'mp4':
    case 'webm':
      return VideoSink.create(options);
    case 'png-zip':
      return new PngZipSink(options);
    case 'gif':
      return new GifSink(options);
    case 'still':
      return new StillSink(options);
  }
}

/** Collects bytes into a Blob, or writes them to the user's file in order. */
class ByteWriter {
  private readonly chunks: Uint8Array[] = [];
  private pending: Promise<void> = Promise.resolve();
  private failed: unknown = null;
  bytes = 0;

  constructor(
    private readonly writable: FileSystemWritableFileStream | undefined,
    private readonly mime: string,
  ) {}

  write(chunk: Uint8Array): void {
    this.bytes += chunk.byteLength;
    const writable = this.writable;
    if (!writable) {
      this.chunks.push(chunk);
      return;
    }
    const copy = new Uint8Array(chunk);
    this.pending = this.pending.then(() =>
      writable.write(copy).catch((error: unknown) => {
        this.failed = error;
      }),
    );
  }

  /** Resolves once everything written so far has reached the file. */
  async drain(): Promise<void> {
    await this.pending;
    if (this.failed)
      throw new ExportError('save', `Couldn’t write the file: ${String(this.failed)}`);
  }

  async close(): Promise<SinkResult> {
    await this.drain();
    if (this.writable) {
      await this.writable.close();
      return { blob: null, bytes: this.bytes };
    }
    const blob = new Blob(this.chunks as BlobPart[], { type: this.mime });
    return { blob, bytes: blob.size };
  }

  async abort(): Promise<void> {
    this.chunks.length = 0;
    await this.pending.catch(() => undefined);
    await this.writable?.abort().catch(() => undefined);
  }
}

class VideoSink implements FrameSink {
  private constructor(
    readonly canvas: OffscreenCanvas,
    private readonly output: Output,
    private readonly source: CanvasSource,
    private readonly fps: number,
    private readonly writable: FileSystemWritableFileStream | undefined,
  ) {}

  static async create(options: SinkOptions): Promise<VideoSink> {
    const { settings, width, height, frames, writable } = options;
    const mp4 = settings.format === 'mp4';
    const codec = mp4 ? 'avc' : 'vp9';
    const bitrate = videoBitrate(Math.min(width, height), settings.fps, settings.quality);
    const alpha = !mp4 && options.alpha ? 'keep' : 'discard';
    const supported = await canEncodeVideo(codec, {
      width,
      height,
      bitrate,
      frameRate: settings.fps,
      alpha,
    }).catch(() => false);
    if (!supported) {
      throw new ExportError(
        'encode',
        `This browser can’t encode ${mp4 ? 'MP4 (H.264)' : 'WebM (VP9)'} at ${width} × ${height}. Try a lower resolution${mp4 ? ' or WebM' : ''}.`,
      );
    }
    const canvas = new OffscreenCanvas(width, height);
    const output = new Output({
      format: mp4
        ? // Metadata up front ("fast start"): reserved in the file, or assembled in memory.
          new Mp4OutputFormat({ fastStart: writable ? 'reserve' : 'in-memory' })
        : new WebMOutputFormat(),
      target: writable ? new StreamTarget(writable, { chunked: true }) : new BufferTarget(),
    });
    const source = new CanvasSource(canvas, {
      codec,
      quality: new Quality({ bitrate }),
      keyFrameInterval: 2,
      latencyMode: 'quality',
      alpha,
    });
    output.addVideoTrack(source, { frameRate: settings.fps, maximumPacketCount: frames + 1 });
    await output.start();
    return new VideoSink(canvas, output, source, settings.fps, writable);
  }

  async add(index: number): Promise<void> {
    try {
      await this.source.add(index / this.fps, 1 / this.fps);
    } catch (error) {
      throw new ExportError('encode', `The video encoder stopped: ${String(error)}`);
    }
  }

  async finish(): Promise<SinkResult> {
    try {
      await this.output.finalize();
    } catch (error) {
      throw new ExportError('save', `Couldn’t finish the file: ${String(error)}`);
    }
    const target = this.output.target;
    if (target instanceof BufferTarget) {
      const buffer = target.buffer;
      if (!buffer) throw new ExportError('save', 'The encoder produced no data');
      const blob = new Blob([buffer], { type: this.output.format.mimeType });
      return { blob, bytes: blob.size };
    }
    // StreamTarget closes the user's file itself.
    return { blob: null, bytes: 0 };
  }

  async cancel(): Promise<void> {
    await this.output.cancel().catch(() => undefined);
    await this.writable?.abort().catch(() => undefined);
  }
}

/** PNG frames (straight alpha) streamed into a ZIP, with a README. */
class PngZipSink implements FrameSink {
  readonly canvas: OffscreenCanvas;
  private readonly writer: ByteWriter;
  private readonly zip: Zip;
  private readonly folder: string;

  constructor(private readonly options: SinkOptions) {
    this.canvas = new OffscreenCanvas(options.width, options.height);
    this.writer = new ByteWriter(options.writable, MIME_TYPES['png-zip']);
    this.folder = options.folder ?? 'frames';
    this.zip = new Zip((error, chunk) => {
      if (error) throw new ExportError('save', `Couldn’t write the ZIP: ${error.message}`);
      this.writer.write(chunk);
    });
  }

  private addFile(name: string, data: Uint8Array): void {
    const file = new ZipPassThrough(`${this.folder}/${name}`);
    this.zip.add(file);
    file.push(data, true);
  }

  async add(index: number): Promise<void> {
    const blob = await this.canvas.convertToBlob({ type: 'image/png' });
    this.addFile(
      `frame_${String(index + 1).padStart(5, '0')}.png`,
      new Uint8Array(await blob.arrayBuffer()),
    );
    // Keep memory bounded: let the file catch up before the next frame.
    await this.writer.drain();
  }

  async finish(): Promise<SinkResult> {
    if (this.options.readme) this.addFile('README.txt', strToU8(this.options.readme));
    this.zip.end();
    return this.writer.close();
  }

  async cancel(): Promise<void> {
    this.zip.terminate();
    await this.writer.abort();
  }
}

/** A looping GIF with one global palette (modern-gif; no dithering — ADR-025). */
class GifSink implements FrameSink {
  readonly canvas: OffscreenCanvas;
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private readonly encoder: GifEncoder;
  private readonly delay: number;

  constructor(private readonly options: SinkOptions) {
    const { width, height, settings } = options;
    this.canvas = new OffscreenCanvas(width, height);
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ExportError('render', 'Canvas 2D is unavailable');
    this.ctx = ctx;
    this.encoder = new GifEncoder({ width, height, maxColors: 255, looped: true, loopCount: 0 });
    this.delay = 1000 / settings.fps;
  }

  async add(): Promise<void> {
    const { width, height } = this.canvas;
    const data = this.ctx.getImageData(0, 0, width, height).data;
    await this.encoder.encode({ data, delay: this.delay });
  }

  async finish(): Promise<SinkResult> {
    let blob: Blob;
    try {
      blob = await this.encoder.flush('blob');
    } catch (error) {
      throw new ExportError('encode', `The GIF encoder stopped: ${String(error)}`);
    }
    const writer = new ByteWriter(this.options.writable, MIME_TYPES.gif);
    if (!this.options.writable) return { blob, bytes: blob.size };
    writer.write(new Uint8Array(await blob.arrayBuffer()));
    return writer.close();
  }

  async cancel(): Promise<void> {
    await this.options.writable?.abort().catch(() => undefined);
  }
}

/** One PNG (straight alpha). */
class StillSink implements FrameSink {
  readonly canvas: OffscreenCanvas;
  private blob: Blob | null = null;

  constructor(private readonly options: SinkOptions) {
    this.canvas = new OffscreenCanvas(options.width, options.height);
  }

  async add(): Promise<void> {
    this.blob = await this.canvas.convertToBlob({ type: 'image/png' });
  }

  async finish(): Promise<SinkResult> {
    const blob = this.blob;
    if (!blob) throw new ExportError('render', 'No frame was rendered');
    if (!this.options.writable) return { blob, bytes: blob.size };
    const writer = new ByteWriter(this.options.writable, MIME_TYPES.still);
    writer.write(new Uint8Array(await blob.arrayBuffer()));
    return writer.close();
  }

  async cancel(): Promise<void> {
    await this.options.writable?.abort().catch(() => undefined);
  }
}
