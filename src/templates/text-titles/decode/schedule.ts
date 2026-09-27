/**
 * Decode's entrance plan (Balanced seconds): the cursor blinks for 0.4 s, then characters
 * arrive left → right — about 20 a second for the default text, faster for long texts, never
 * slower than 14 a second — and each scrambles for up to 0.55 s before it locks.
 *
 * The entrance (`in`) ends 0.2 s after the last character arrives: the text reads from the
 * moment most of it has locked, so the hold — the readable time the editor checks — starts
 * while the last few characters settle (`settled`: the last possible lock).
 */
export function schedule(text: string): {
  start: number;
  span: number;
  populate: number;
  settled: number;
} {
  const count = [...text.trim().replace(/\n/g, '')].length;
  const gap = count > 1 ? Math.min(0.07, Math.max(0.03, 0.95 / (count - 1))) : 0;
  const start = 0.4;
  const span = Math.max(0, count - 1) * gap;
  return { start, span, populate: start + span + 0.2, settled: start + span + 0.55 };
}
