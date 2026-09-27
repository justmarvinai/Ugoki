/**
 * Whether transparent WebM works here, checked the way exports make it (docs/07-export.md §2):
 * Mediabunny's alpha mode — color and alpha split on the CPU into frames built from buffers,
 * two VP9 encoders, the alpha plane as side data — on frames of a bar moving across a clear
 * background. Each frame's color and alpha are then decoded on their own and must show that
 * frame's bar.
 *
 * CI's WebKit (Linux, GStreamer) accepts all of it, but encodes each frame built from a buffer
 * with the pixels of a later one; its transparent files decode without their alpha. (Frames
 * made from canvases are fine there, so MP4 and opaque WebM still work.)
 */

import type { EncodedPacket } from 'mediabunny';
import {
  answerWithin,
  CHECK_FRAMES,
  CHECK_SIZE,
  declaredEncoders,
  decodesEachBar,
  drawCheckBar,
  type EncoderSupport,
  encodesMotion,
} from '../runtime/capabilities';

/**
 * What exports can rely on here, from round trips (ADR-034): H.264 and VP9 only if moving
 * frames come back as encoded, transparent WebM only if its alpha does. Runs in an export
 * worker when the export options are first shown, never while previews start. It answers once
 * its encoders and decoders are closed (a check that gave up gets two seconds to close them).
 */
export async function verifyEncoders(declared?: EncoderSupport): Promise<EncoderSupport> {
  const claimed = declared ?? (await declaredEncoders());
  const [avc, vp9] = await Promise.all([
    claimed.avc && encodesMotion('avc1.640028'),
    claimed.vp9 && encodesMotion('vp09.00.40.08'),
  ]);
  const vp9Alpha = vp9 && (await transparentWebmWorks());
  return { avc, vp9, vp9Alpha, av1: claimed.av1 };
}

const FPS = 30;
/** Mediabunny starts a worker and two encoders; a broken pipeline may never finish. */
const TIMEOUT = 4000;

export function transparentWebmWorks(): Promise<boolean> {
  const codecs = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
  if (!codecs || typeof OffscreenCanvas === 'undefined') return Promise.resolve(false);
  return answerWithin(TIMEOUT, roundTrip);
}

async function roundTrip(signal: AbortSignal): Promise<boolean> {
  const {
    ALL_FORMATS,
    BufferSource,
    BufferTarget,
    CanvasSource,
    EncodedPacketSink,
    Input,
    Output,
    Quality,
    WebMOutputFormat,
  } = await import('mediabunny');
  const canvas = new OffscreenCanvas(CHECK_SIZE, CHECK_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx || signal.aborted) return false;
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, {
    codec: 'vp9',
    quality: new Quality({ bitrate: 1_000_000 }),
    alpha: 'keep',
  });
  output.addVideoTrack(source, { frameRate: FPS });
  // Cancelling releases the encoders and Mediabunny's splitting worker.
  const cancel = () => output.cancel().catch(() => undefined);
  const onAbort = () => void cancel();
  signal.addEventListener('abort', onAbort);
  try {
    await output.start();
    for (let i = 0; i < CHECK_FRAMES; i++) {
      ctx.clearRect(0, 0, CHECK_SIZE, CHECK_SIZE);
      drawCheckBar(ctx, i);
      await source.add(i / FPS, 1 / FPS);
    }
    await output.finalize();
  } catch {
    await cancel();
    return false;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
  const buffer = output.target.buffer;
  if (!buffer || signal.aborted) return false;

  // Read back as players do: each packet's color, and its alpha from the side data. (Plain
  // decoders on this thread: Mediabunny's sinks would merge the two in a pool of workers.)
  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    const config = await track?.getDecoderConfig();
    if (!track || !config || !(await track.canBeTransparent())) return false;
    const packets: EncodedPacket[] = [];
    for await (const packet of new EncodedPacketSink(track).packets()) packets.push(packet);
    if (!packets.every((packet) => packet.sideData.alpha)) return false;
    const color = packets.map((packet) => packet.toEncodedVideoChunk());
    if (!(await decodesEachBar(config, color, signal))) return false;
    // The alpha plane is coded as the luma of its own frames: opaque is white.
    const alpha = packets.map((packet) => packet.alphaToEncodedVideoChunk());
    return await decodesEachBar(config, alpha, signal);
  } finally {
    input.dispose();
  }
}
