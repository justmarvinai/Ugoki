/**
 * Capability probing (docs/05-architecture.md §12, docs/07-export.md): what this browser can do
 * where rendering happens (the worker) — cheap, so it never holds up the first frames. Video
 * formats are verified by round trips in an export worker before exports offer them
 * (`engine/export/probe.ts`); the Lab shows both, so real devices can be checked.
 */

export type EncoderSupport = {
  /** H.264 High @ 1080p (MP4). */
  avc: boolean;
  /** VP9 @ 1080p (WebM). */
  vp9: boolean;
  /** Transparent WebM: VP9 with the alpha plane as side data, round-tripped (not just declared). */
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

/** Side of the motion check's frames (hardware encoders may refuse tiny ones). */
export const CHECK_SIZE = 128;
export const CHECK_FRAMES = 4;
/** A broken encoder may never answer; the check gives up after this long (ms). */
const CHECK_TIMEOUT = 3000;
/** How long a check that gave up gets to close its codecs before its answer goes out (ms). */
const RELEASE_GRACE = 2000;

/** Draws the bar of motion-check frame `i`: white, stepping right 32 px a frame. */
export function drawCheckBar(ctx: OffscreenCanvasRenderingContext2D, i: number): void {
  ctx.fillStyle = '#fff';
  ctx.fillRect(8 + i * 32, 16, 24, CHECK_SIZE - 32);
}

/**
 * `check`'s answer, or false if it fails or takes longer than `ms`. Its signal aborts once the
 * answer is in. A check that gave up is waited for (briefly) while it closes its codecs, so
 * none are still busy if the worker is ended right after the answer.
 */
export async function answerWithin(
  ms: number,
  check: (signal: AbortSignal) => Promise<boolean>,
): Promise<boolean> {
  const abort = new AbortController();
  const answer = check(abort.signal).catch(() => false);
  const after = (wait: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), wait);
    });
    return { done, cancel: () => clearTimeout(timer) };
  };
  const deadline = after(ms);
  const result = await Promise.race([answer, deadline.done]);
  deadline.cancel();
  abort.abort();
  if (result !== null) return result;
  const grace = after(RELEASE_GRACE);
  await Promise.race([answer, grace.done]);
  grace.cancel();
  return false;
}

/** Closes `codec` when `signal` aborts; the returned function closes it now (and stops listening). */
function closeOnAbort(codec: VideoEncoder | VideoDecoder, signal: AbortSignal): () => void {
  const close = () => {
    if (codec.state !== 'closed') codec.close();
  };
  signal.addEventListener('abort', close);
  return () => {
    signal.removeEventListener('abort', close);
    close();
  };
}

/** Where the bars' centers are (x), on the middle row. */
const barCenter = (i: number) => 20 + i * 32;

/**
 * How decoded frames are read: drawn onto a canvas (as players and Mediabunny's plain sinks
 * do), or copied out with `VideoFrame.copyTo` (as Mediabunny's alpha reader does).
 */
export type FrameReading = 'drawn' | 'copied';

/** The first sample (luma, or the first color channel) at each bar's center, copied out. */
async function copiedSamples(frame: VideoFrame): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < CHECK_FRAMES; i++) {
    // Two by two, so the rectangle stays aligned to subsampled chroma.
    const rect = { x: barCenter(i), y: CHECK_SIZE / 2, width: 2, height: 2 };
    const pixels = new Uint8Array(frame.allocationSize({ rect }));
    await frame.copyTo(pixels, { rect });
    samples.push(pixels[0] ?? 0);
  }
  return samples;
}

/**
 * Decodes the motion check's frames: whether each shows its own bar — lit there (x 8 + 32i …
 * 32 + 32i), dark where the others were. A frame encoded with another's pixels fails. The
 * decoder is closed before this returns.
 */
export async function decodesEachBar(
  config: VideoDecoderConfig,
  chunks: readonly EncodedVideoChunk[],
  signal: AbortSignal,
  reading: FrameReading = 'drawn',
): Promise<boolean> {
  const canvas = new OffscreenCanvas(CHECK_SIZE, CHECK_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || signal.aborted || chunks.length !== CHECK_FRAMES) return false;
  let decoded = 0;
  let correct = true;
  const judge = (index: number, samples: readonly number[]) => {
    for (let i = 0; i < CHECK_FRAMES; i++) {
      if ((samples[i] ?? 0) > 160 !== (i === index)) correct = false;
    }
  };
  const copies: Promise<void>[] = [];
  const decoder = new VideoDecoder({
    output: (frame) => {
      const index = decoded++;
      if (reading === 'copied') {
        const copy = copiedSamples(frame).then(
          (samples) => judge(index, samples),
          () => {
            correct = false;
          },
        );
        copies.push(copy.finally(() => frame.close()));
        return;
      }
      ctx.drawImage(frame, 0, 0, CHECK_SIZE, CHECK_SIZE);
      frame.close();
      const luma = (x: number) => ctx.getImageData(x, CHECK_SIZE / 2, 1, 1).data[0] ?? 0;
      judge(
        index,
        Array.from({ length: CHECK_FRAMES }, (_, i) => luma(barCenter(i))),
      );
    },
    error: () => undefined,
  });
  const close = closeOnAbort(decoder, signal);
  try {
    decoder.configure(config);
    for (const chunk of chunks) decoder.decode(chunk);
    await decoder.flush();
    await Promise.all(copies);
    return correct && decoded === CHECK_FRAMES;
  } finally {
    close();
  }
}

/**
 * Where the motion check's frames come from: a canvas (as exports draw them), or a buffer in
 * the formats Mediabunny's alpha mode builds — BGRX for color, I420 for the alpha plane.
 */
export type FrameSource = 'canvas' | 'BGRX' | 'I420';

/** Motion-check frame `i` built from a buffer: a white bar on black. */
function bufferFrame(i: number, format: 'BGRX' | 'I420', timestamp: number): VideoFrame {
  const pixels = CHECK_SIZE * CHECK_SIZE;
  const bar = (p: number) => {
    const x = p % CHECK_SIZE;
    const y = Math.floor(p / CHECK_SIZE);
    return x >= 8 + i * 32 && x < 32 + i * 32 && y >= 16 && y < CHECK_SIZE - 16;
  };
  const init = { codedWidth: CHECK_SIZE, codedHeight: CHECK_SIZE, timestamp, duration: 33_333 };
  if (format === 'BGRX') {
    const data = new Uint8Array(pixels * 4);
    for (let p = 0; p < pixels; p++) data.fill(bar(p) ? 255 : 0, p * 4, p * 4 + 4);
    return new VideoFrame(data, { ...init, format });
  }
  // Luma, then both chroma planes at neutral.
  const data = new Uint8Array(pixels * 1.5).fill(128);
  for (let p = 0; p < pixels; p++) data[p] = bar(p) ? 255 : 0;
  return new VideoFrame(data, { ...init, format });
}

/**
 * Whether `codec` encodes motion: frames of a moving bar go through the encoder and back
 * through the decoder, and every decoded frame must show the bar where that frame drew it.
 * Saying yes to a configuration isn't enough — CI's WebKit (Linux, GStreamer) encodes each
 * frame made from a buffer with the pixels of a later one (see `transparentWebmWorks`).
 */
export function encodesMotion(codec: string, source: FrameSource = 'canvas'): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    return Promise.resolve(false);
  }
  return answerWithin(CHECK_TIMEOUT, async (signal) => {
    const canvas = new OffscreenCanvas(CHECK_SIZE, CHECK_SIZE);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    const chunks: EncodedVideoChunk[] = [];
    let config: VideoDecoderConfig | undefined;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        chunks.push(chunk);
        if (meta?.decoderConfig) config ??= meta.decoderConfig;
      },
      error: () => undefined,
    });
    const close = closeOnAbort(encoder, signal);
    try {
      encoder.configure({
        codec,
        width: CHECK_SIZE,
        height: CHECK_SIZE,
        bitrate: 1_000_000,
        framerate: 30,
      });
      for (let i = 0; i < CHECK_FRAMES; i++) {
        let frame: VideoFrame;
        if (source === 'canvas') {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, CHECK_SIZE, CHECK_SIZE);
          drawCheckBar(ctx, i);
          frame = new VideoFrame(canvas, { timestamp: i * 33_333, duration: 33_333 });
        } else {
          frame = bufferFrame(i, source, i * 33_333);
        }
        encoder.encode(frame, { keyFrame: i === 0 });
        frame.close();
      }
      await encoder.flush();
    } finally {
      close();
    }
    if (!config || chunks.length !== CHECK_FRAMES) return false;
    return decodesEachBar(config, chunks, signal);
  });
}

/**
 * What this browser says it can encode (cheap). Transparent WebM is assumed wherever VP9 is —
 * Mediabunny encodes the alpha plane itself — until an export worker verifies it
 * (`verifyEncoders`), as it does every video codec, before exports rely on any of it.
 */
export async function declaredEncoders(): Promise<EncoderSupport> {
  if (typeof VideoEncoder === 'undefined') {
    return { avc: false, vp9: false, vp9Alpha: false, av1: false };
  }
  const base = { width: 1920, height: 1080, bitrate: 8_000_000, framerate: 30 };
  const [avc, vp9, av1] = await Promise.all([
    supported({ ...base, codec: 'avc1.640028' }),
    supported({ ...base, codec: 'vp09.00.40.08' }),
    supported({ ...base, codec: 'av01.0.08M.08' }),
  ]);
  return { avc, vp9, vp9Alpha: vp9, av1 };
}

export async function probeCapabilities(): Promise<Capabilities> {
  return {
    animationFrame: typeof globalThis.requestAnimationFrame === 'function',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    ...probeWebGl(),
    decompressionStream: typeof DecompressionStream !== 'undefined',
    webCodecs: typeof VideoEncoder !== 'undefined',
    encoders: await declaredEncoders(),
  };
}
