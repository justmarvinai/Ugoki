import { describe, expect, test } from 'vitest';
import { answerWithin } from './capabilities';

describe('answerWithin', () => {
  test('gives the check’s answer, then aborts its signal', async () => {
    let seen: AbortSignal | undefined;
    const answer = await answerWithin(1000, async (signal) => {
      seen = signal;
      return true;
    });
    expect(answer).toBe(true);
    expect(seen?.aborted).toBe(true);
  });

  test('a check that fails answers false', async () => {
    expect(
      await answerWithin(1000, async () => {
        throw new Error('no encoder');
      }),
    ).toBe(false);
  });

  test('a check that takes too long answers false, once it has let go of what it holds', async () => {
    let released = false;
    const started = performance.now();
    const answer = await answerWithin(
      30,
      (signal) =>
        new Promise<boolean>((resolve) => {
          // Like a codec: aborting closes it, which takes a moment.
          signal.addEventListener('abort', () =>
            setTimeout(() => {
              released = true;
              resolve(true);
            }, 20),
          );
        }),
    );
    expect(answer).toBe(false);
    expect(released).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
