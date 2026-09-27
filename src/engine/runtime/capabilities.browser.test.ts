import { expect, test } from 'vitest';
import { transparentWebmWorks } from '../export/probe';
import { encodesMotion } from './capabilities';

const CODECS = ['vp09.00.10.08', 'avc1.42001f'];

/** The first codec whose encoder works here, if any. */
async function workingCodec(): Promise<string | null> {
  for (const codec of CODECS) if (await encodesMotion(codec)) return codec;
  return null;
}

test('the encoder check turns down codecs this browser can’t encode', async () => {
  expect(await encodesMotion('not-a-codec')).toBe(false);
});

test('every engine has a video encoder that passes the check', async () => {
  const results = await Promise.all(
    CODECS.map(async (codec) => [codec, await encodesMotion(codec)]),
  );
  console.info(`encodes motion: ${JSON.stringify(Object.fromEntries(results))}`);
  expect(await workingCodec()).not.toBeNull();
});

test('it catches an encoder that keeps encoding the first frame', async (context) => {
  const codec = await workingCodec();
  if (!codec) context.skip();
  const Real = globalThis.VideoEncoder;
  // Like CI's WebKit VP9: every frame after the first comes out as "nothing changed".
  class Stuck extends Real {
    private first: VideoFrame | null = null;
    override encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions): void {
      this.first ??= frame.clone();
      const same = new VideoFrame(this.first, {
        timestamp: frame.timestamp,
        duration: frame.duration ?? undefined,
      });
      super.encode(same, options);
      same.close();
    }
    override close(): void {
      this.first?.close();
      super.close();
    }
  }
  globalThis.VideoEncoder = Stuck;
  try {
    expect(await encodesMotion(codec as string)).toBe(false);
  } finally {
    globalThis.VideoEncoder = Real;
  }
});

test('transparent WebM round-trips where it is known to work', async () => {
  const works = await transparentWebmWorks();
  console.info(`transparent WebM round trip: ${works}`);
  // Chromium and Firefox keep the alpha plane (CI's WebKit doesn't: ADR-034). A check that
  // failed everywhere would quietly turn transparent WebM off — and skip its tests.
  if (/Chrome\/|Firefox\//.test(navigator.userAgent)) expect(works).toBe(true);
});
