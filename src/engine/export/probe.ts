/**
 * Whether transparent WebM works here, checked the way exports make it (docs/07-export.md §2):
 * Mediabunny's alpha mode — color and alpha split on the CPU into frames built from buffers,
 * two VP9 encoders, the alpha plane as side data — on frames of a bar moving across a clear
 * background, decoded back with their alpha.
 *
 * CI's WebKit (Linux, GStreamer) accepts all of it, but encodes each frame built from a buffer
 * with the pixels of a later one; its transparent files decode without their alpha. (Frames
 * made from canvases are fine there, so MP4 and opaque WebM still work.)
 */

const SIZE = 128;
const FRAMES = 4;
const FPS = 30;
/** Mediabunny starts a worker and two encoders; a broken pipeline may never finish. */
const TIMEOUT = 4000;

/** Frame i's bar spans x 8 + 32i … 32 + 32i. */
const barCenter = (i: number) => 20 + i * 32;

export async function transparentWebmWorks(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof OffscreenCanvas === 'undefined') return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      roundTrip(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), TIMEOUT);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function roundTrip(): Promise<boolean> {
  const {
    ALL_FORMATS,
    BufferSource,
    BufferTarget,
    CanvasSink,
    CanvasSource,
    Input,
    Output,
    Quality,
    WebMOutputFormat,
  } = await import('mediabunny');
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, {
    codec: 'vp9',
    quality: new Quality({ bitrate: 1_000_000 }),
    alpha: 'keep',
  });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  for (let i = 0; i < FRAMES; i++) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#fff';
    ctx.fillRect(barCenter(i) - 12, 16, 24, SIZE - 32);
    await source.add(i / FPS, 1 / FPS);
  }
  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) return false;

  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track || !(await track.canBeTransparent())) return false;
  const sink = new CanvasSink(track, { alpha: true });
  const read = new OffscreenCanvas(SIZE, SIZE);
  const readCtx = read.getContext('2d', { willReadFrequently: true });
  if (!readCtx) return false;
  for (let i = 0; i < FRAMES; i++) {
    const frame = await sink.getCanvas(i / FPS + 0.001);
    if (!frame) return false;
    readCtx.clearRect(0, 0, SIZE, SIZE);
    readCtx.drawImage(frame.canvas as OffscreenCanvas, 0, 0, SIZE, SIZE);
    // Opaque where this frame drew its bar, clear where the others were.
    for (let j = 0; j < FRAMES; j++) {
      const alpha = readCtx.getImageData(barCenter(j), SIZE / 2, 1, 1).data[3] ?? 0;
      if (j === i ? alpha < 200 : alpha > 56) return false;
    }
  }
  return true;
}
