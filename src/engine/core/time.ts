/** Time helpers (docs/04-motion-language.md §2). All engine time is continuous seconds. */

/**
 * Quantizes time to a fixed cadence (e.g. 24 fps for grain, scramble, split-flaps) so a
 * 60 fps export shows the same mechanical rhythm as a 24 fps one.
 */
export function stepped(t: number, fps: number): number {
  return Math.floor(t * fps + 1e-9) / fps;
}

/** Index of the current step at a cadence, e.g. which scramble glyph to show. */
export function stepIndex(t: number, fps: number): number {
  return Math.floor(t * fps + 1e-9);
}

/** Frame timestamp used by the exporter: frame `f` is sampled at `f / fps`. */
export function frameTime(frame: number, fps: number): number {
  return frame / fps;
}

/** Number of frames needed to cover `duration` seconds at `fps`. */
export function frameCount(duration: number, fps: number): number {
  return Math.max(1, Math.round(duration * fps));
}

/** Traveling sine wave for element `i` — breathing, accordions, width waves. */
export function wave(
  t: number,
  i: number,
  options: { period: number; amplitude: number; phasePerItem?: number; phase?: number },
): number {
  const { period, amplitude, phasePerItem = 0.12, phase = 0 } = options;
  return amplitude * Math.sin(((t / period + phase) * 2 - i * phasePerItem * 2) * Math.PI);
}
