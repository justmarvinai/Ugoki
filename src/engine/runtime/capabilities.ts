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

async function probeEncoders(): Promise<EncoderSupport> {
  if (typeof VideoEncoder === 'undefined') {
    return { avc: false, vp9: false, vp9Alpha: false, av1: false };
  }
  const base = { width: 1920, height: 1080, bitrate: 8_000_000, framerate: 30 };
  const [avc, vp9, vp9Alpha, av1] = await Promise.all([
    supported({ ...base, codec: 'avc1.640028' }),
    supported({ ...base, codec: 'vp09.00.40.08' }),
    supported({ ...base, codec: 'vp09.00.40.08', alpha: 'keep' }),
    supported({ ...base, codec: 'av01.0.08M.08' }),
  ]);
  return { avc, vp9, vp9Alpha, av1 };
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
