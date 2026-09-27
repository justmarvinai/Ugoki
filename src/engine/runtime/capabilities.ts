/**
 * Capability probing (docs/05-architecture.md §12, docs/07-export.md): what this browser can do
 * where rendering happens (the worker). Export options are only offered once probed, and the
 * Lab shows the results so real devices can be checked — the Phase 1 platform spikes.
 */

export type EncoderSupport = {
  /** H.264 High @ 1080p (MP4). */
  avc: boolean;
  /** VP9 @ 1080p (WebM). */
  vp9: boolean;
  /** VP9 keeping the alpha channel (transparent WebM). */
  vp9Alpha: boolean;
  /** AV1 @ 1080p. */
  av1: boolean;
};

export type Capabilities = {
  /** requestAnimationFrame is available here (otherwise a timer drives playback). */
  animationFrame: boolean;
  offscreenCanvas: boolean;
  webgl2: boolean;
  /** EXT_color_buffer_float: float render targets for motion-blur accumulation. */
  floatColorBuffer: boolean;
  /** EXT_color_buffer_half_float (fallback accumulation format). */
  halfFloatColorBuffer: boolean;
  maxTextureSize: number;
  decompressionStream: boolean;
  webCodecs: boolean;
  encoders: EncoderSupport;
};

type WebGlProbe = Pick<
  Capabilities,
  'webgl2' | 'floatColorBuffer' | 'halfFloatColorBuffer' | 'maxTextureSize'
>;

function probeWebGl(): WebGlProbe {
  const none = {
    webgl2: false,
    floatColorBuffer: false,
    halfFloatColorBuffer: false,
    maxTextureSize: 0,
  };
  if (typeof OffscreenCanvas === 'undefined') return none;
  try {
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
    if (!gl) return none;
    const result = {
      webgl2: true,
      floatColorBuffer: gl.getExtension('EXT_color_buffer_float') !== null,
      halfFloatColorBuffer: gl.getExtension('EXT_color_buffer_half_float') !== null,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    };
    // Browsers cap live WebGL contexts (~16): release the probe immediately.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return result;
  } catch {
    return none;
  }
}

async function supported(config: VideoEncoderConfig): Promise<boolean> {
  try {
    return (await VideoEncoder.isConfigSupported(config)).supported === true;
  } catch {
    return false;
  }
}

/** Side of the frames the motion check encodes (hardware encoders may refuse tiny ones). */
const CHECK_SIZE = 128;
const CHECK_FRAMES = 4;
/** A broken encoder may never answer; the check gives up after this long (ms). */
const CHECK_TIMEOUT = 3000;

/** Draws frame `i` of the motion check: a white bar stepping right across black. */
function drawCheckFrame(ctx: OffscreenCanvasRenderingContext2D, i: number): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CHECK_SIZE, CHECK_SIZE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(8 + i * 32, 16, 24, CHECK_SIZE - 32);
}

/**
 * Whether `codec` encodes motion: frames of a moving bar go through the encoder and back
 * through the decoder, and the last frame must show the bar where it was drawn last. Saying
 * yes to a configuration isn't enough — CI's WebKit (Linux, GStreamer) accepts VP9 but emits
 * empty delta frames, so its files show the first frame throughout.
 */
export async function encodesMotion(codec: string): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return false;
  let encoder: VideoEncoder | null = null;
  let decoder: VideoDecoder | null = null;
  let last: VideoFrame | null = null;
  const check = async () => {
    const canvas = new OffscreenCanvas(CHECK_SIZE, CHECK_SIZE);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    const chunks: EncodedVideoChunk[] = [];
    let config: VideoDecoderConfig | undefined;
    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        chunks.push(chunk);
        if (meta?.decoderConfig) config ??= meta.decoderConfig;
      },
      error: () => undefined,
    });
    encoder.configure({
      codec,
      width: CHECK_SIZE,
      height: CHECK_SIZE,
      bitrate: 1_000_000,
      framerate: 30,
    });
    for (let i = 0; i < CHECK_FRAMES; i++) {
      drawCheckFrame(ctx, i);
      const frame = new VideoFrame(canvas, { timestamp: i * 33_333, duration: 33_333 });
      encoder.encode(frame, { keyFrame: i === 0 });
      frame.close();
    }
    await encoder.flush();
    if (!config || chunks.length !== CHECK_FRAMES) return false;
    decoder = new VideoDecoder({
      output: (frame) => {
        last?.close();
        last = frame;
      },
      error: () => undefined,
    });
    decoder.configure(config);
    for (const chunk of chunks) decoder.decode(chunk);
    await decoder.flush();
    const frame = last as VideoFrame | null;
    if (!frame) return false;
    ctx.drawImage(frame, 0, 0, CHECK_SIZE, CHECK_SIZE);
    const luma = (x: number) => ctx.getImageData(x, CHECK_SIZE / 2, 1, 1).data[0] ?? 0;
    // The last bar spans x 104…128; the first spanned 8…32.
    return luma(116) > 160 && luma(20) < 96;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      check(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), CHECK_TIMEOUT);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    const close = (codec: VideoEncoder | VideoDecoder | null) => {
      if (codec && codec.state !== 'closed') codec.close();
    };
    close(encoder);
    close(decoder);
    (last as VideoFrame | null)?.close();
  }
}

/** Declared support, then a round trip of moving frames (small, so it takes milliseconds). */
async function works(config: VideoEncoderConfig): Promise<boolean> {
  return (await supported(config)) && (await encodesMotion(config.codec));
}

async function probeEncoders(): Promise<EncoderSupport> {
  if (typeof VideoEncoder === 'undefined') {
    return { avc: false, vp9: false, vp9Alpha: false, av1: false };
  }
  const base = { width: 1920, height: 1080, bitrate: 8_000_000, framerate: 30 };
  const [avc, vp9, vp9Alpha, av1] = await Promise.all([
    works({ ...base, codec: 'avc1.640028' }),
    works({ ...base, codec: 'vp09.00.40.08' }),
    supported({ ...base, codec: 'vp09.00.40.08', alpha: 'keep' }),
    supported({ ...base, codec: 'av01.0.08M.08' }),
  ]);
  // Native alpha encoding only matters where VP9 itself works.
  return { avc, vp9, vp9Alpha: vp9 && vp9Alpha, av1 };
}

export async function probeCapabilities(): Promise<Capabilities> {
  return {
    animationFrame: typeof globalThis.requestAnimationFrame === 'function',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    ...probeWebGl(),
    decompressionStream: typeof DecompressionStream !== 'undefined',
    webCodecs: typeof VideoEncoder !== 'undefined',
    encoders: await probeEncoders(),
  };
}
