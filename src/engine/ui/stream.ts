/**
 * Streaming text: an answer arriving the way AI interfaces render it — model tokens (a word with
 * its leading space, punctuation on its own, long words in pieces) in quick, uneven chunks, each
 * fading up into place, with a soft caret riding the end of the text. Laid out once, greedily,
 * at its final length, so what has arrived never reflows (a greedy layout's prefix is stable).
 */

import type { Color } from '../core/color';
import { clamp, clamp01 } from '../core/math';
import type { Rng } from '../core/rng';
import type { Draw, GlyphTransform } from '../draw/types';
import type { Glyph, TextBlock, TextLine } from '../text/types';
import type { UiKit, UiTextOptions, UiTypeRole } from './context';
import { caretOpacity } from './typing';

const WORDS = new Intl.Segmenter('en', { granularity: 'word' });
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Splits text into model-like tokens: each word carries the whitespace before it, punctuation
 * comes apart from words, and words longer than seven letters split into pieces of three to
 * five. Joined, the tokens are the text again.
 */
export function streamTokens(text: string): string[] {
  const tokens: string[] = [];
  let pending = '';
  for (const { segment, isWordLike } of WORDS.segment(text)) {
    if (/^\s+$/.test(segment)) {
      pending += segment;
      continue;
    }
    if (!isWordLike) {
      tokens.push(pending + segment);
      pending = '';
      continue;
    }
    const letters = [...GRAPHEMES.segment(segment)].map((s) => s.segment);
    if (letters.length <= 7) {
      tokens.push(pending + segment);
    } else {
      // Pieces of 4 (a trailing piece of at least 3), the way subword vocabularies cut them.
      let i = 0;
      let first = true;
      while (i < letters.length) {
        const rest = letters.length - i;
        const take = rest <= 5 ? rest : rest - 4 < 3 ? rest - 3 : 4;
        tokens.push((first ? pending : '') + letters.slice(i, i + take).join(''));
        first = false;
        i += take;
      }
    }
    pending = '';
  }
  if (pending) {
    if (tokens.length > 0) tokens[tokens.length - 1] += pending;
    else tokens.push(pending);
  }
  return tokens;
}

export type StreamOptions = {
  /** Mean seconds per word (default 0.06). */
  perWord?: number;
  /** Spread of the gaps (lognormal σ, default 0.55). */
  jitter?: number;
  /** Chance a token arrives in the same chunk as the one before it (default 0.28). */
  burst?: number;
  /** Scales the schedule so the last token arrives `fit` seconds after the first. */
  fit?: number;
};

/**
 * When each token arrives, in seconds after the first (0). Chunks come unevenly — several
 * tokens at once, then a short wait, now and then a longer one after a sentence — seeded, so
 * every render agrees.
 */
export function streamSchedule(
  tokens: readonly string[],
  rng: Rng,
  options: StreamOptions = {},
): Float64Array {
  const perWord = options.perWord ?? 0.06;
  const jitter = options.jitter ?? 0.55;
  const burst = options.burst ?? 0.28;
  const times = new Float64Array(tokens.length);
  let t = 0;
  for (let i = 1; i < tokens.length; i++) {
    const previous = tokens[i - 1] as string;
    const token = tokens[i] as string;
    // Pieces of a word and punctuation cost less than a new word.
    const weight = /^\s/.test(token) ? 1 : /^\p{P}+$/u.test(token.trim()) ? 0.35 : 0.6;
    let gap = rng.chance(burst) ? 0 : perWord * weight * clamp(Math.exp(rng.gauss(jitter)), 0.3, 3);
    if (/[.!?]\s*$/.test(previous) && rng.chance(0.6)) gap += perWord * rng.range(1.5, 3);
    t += gap;
    times[i] = t;
  }
  if (options.fit !== undefined && t > 0) {
    const k = Math.max(0, options.fit) / t;
    for (let i = 0; i < times.length; i++) times[i] = (times[i] as number) * k;
  }
  return times;
}

export type StreamingTextOptions = UiTextOptions & {
  /** Seeds the arrival rhythm (`ctx.rng(key)`). */
  rng: Rng;
  stream?: StreamOptions;
  /** How long a token takes to fade up (seconds, default 0.14). */
  fade?: number;
};

export type CaretState = {
  /** Left edge of the caret's position (block coordinates). */
  x: number;
  /** Baseline of its line (block coordinates). */
  baseline: number;
  line: number;
};

/**
 * Text that streams in token by token (see `streamTokens`, `streamSchedule`). Draw it with the
 * seconds since the first token arrived; `drawCaret` adds the soft caret that rides the end
 * of the text and blinks once the stream is done.
 */
export class StreamingText {
  readonly block: TextBlock;
  readonly tokens: readonly string[];
  /** Arrival time of each token (seconds after the first). */
  readonly times: Float64Array;
  /** When the last token arrives. */
  readonly duration: number;
  private readonly glyphTime: Float64Array;
  private readonly fade: number;
  private readonly rise: number;
  /** Per token: the end of its last glyph (caret position). */
  private readonly ends: CaretState[];
  private readonly transform: GlyphTransform = { opacity: 1, dy: 0 };
  private local = 0;
  private readonly glyph = (glyph: Glyph, _line: TextLine): GlyphTransform | null => {
    const arrival = this.glyphTime[glyph.index] ?? 0;
    const p = (this.local - arrival) / this.fade;
    if (p <= 0) return null;
    if (p >= 1) {
      this.transform.opacity = 1;
      this.transform.dy = 0;
      return this.transform;
    }
    const e = 1 - (1 - p) * (1 - p);
    this.transform.opacity = e;
    this.transform.dy = (1 - e) * this.rise;
    return this.transform;
  };

  constructor(ui: UiKit, text: string, role: UiTypeRole, options: StreamingTextOptions) {
    this.block = ui.text(text, role, { ...options, balance: false });
    this.tokens = streamTokens(text);
    this.times = streamSchedule(this.tokens, options.rng, options.stream);
    this.duration = this.times[this.times.length - 1] ?? 0;
    this.fade = Math.max(0.01, options.fade ?? 0.14);
    this.rise = this.block.size * 0.12;
    // Token of each non-space character, in reading order.
    const owner: number[] = [];
    this.tokens.forEach((token, k) => {
      for (const { segment } of GRAPHEMES.segment(token)) {
        if (!/^\s+$/.test(segment)) owner.push(k);
      }
    });
    this.glyphTime = new Float64Array(Math.max(1, this.block.glyphCount));
    this.ends = this.tokens.map(() => ({ x: 0, baseline: 0, line: 0 }));
    let chars = 0;
    let lastToken = 0;
    for (const line of this.block.lines) {
      for (const glyph of line.glyphs) {
        const count = [...GRAPHEMES.segment(glyph.text)].filter(
          (s) => !/^\s+$/.test(s.segment),
        ).length;
        if (count === 0) {
          this.glyphTime[glyph.index] =
            this.times[Math.min(lastToken + 1, this.times.length - 1)] ?? 0;
          continue;
        }
        const token = owner[Math.min(chars + count - 1, owner.length - 1)] ?? lastToken;
        lastToken = token;
        this.glyphTime[glyph.index] = this.times[token] ?? 0;
        chars += count;
        const end = this.ends[token];
        if (end) {
          end.x = line.x + glyph.x + glyph.advance;
          end.baseline = line.baseline;
          end.line = line.index;
        }
      }
    }
    // Tokens without glyphs (trailing space) keep the previous token's end.
    for (let k = 1; k < this.ends.length; k++) {
      const end = this.ends[k] as CaretState;
      const before = this.ends[k - 1] as CaretState;
      if (end.x === 0 && end.baseline === 0) Object.assign(end, before);
    }
  }

  /** Index of the last token arrived `local` seconds after the first (−1 before). */
  arrived(local: number): number {
    const { times } = this;
    if (times.length === 0 || local < (times[0] as number)) return -1;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((times[mid] as number) <= local) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Draws the text as streamed `local` seconds after the first token, cap top at (x, y). */
  draw(
    g: Draw,
    local: number,
    options: { x: number; y: number; fill: Color; opacity?: number },
  ): void {
    if (local < 0) return;
    this.local = local;
    const done = local >= this.duration + this.fade;
    g.text(this.block, {
      fill: options.fill,
      x: options.x,
      y: options.y,
      opacity: options.opacity,
      glyph: done ? undefined : this.glyph,
    });
  }

  /**
   * Where the caret is `local` seconds after the first token (block coordinates): after the
   * newest token, easing over from the previous token's end within its line.
   */
  caret(local: number, out: CaretState = { x: 0, baseline: 0, line: 0 }): CaretState {
    const k = this.arrived(local);
    const first = this.block.lines[0];
    if (k < 0) {
      out.x = first?.x ?? 0;
      out.baseline = first?.baseline ?? 0;
      out.line = 0;
      return out;
    }
    const current = this.ends[k] as CaretState;
    const previous = k > 0 ? (this.ends[k - 1] as CaretState) : null;
    const p = clamp01((local - (this.times[k] as number)) / 0.08);
    const e = 1 - (1 - p) ** 3;
    out.baseline = current.baseline;
    out.line = current.line;
    out.x =
      previous && previous.line === current.line
        ? previous.x + (current.x - previous.x) * e
        : current.x;
    return out;
  }

  /**
   * Draws the caret (a soft dot at x-height) after the streamed text: solid while tokens
   * arrive, blinking gently once the stream is done, breathing before the first token (a
   * negative `local`: the answer is being thought about).
   */
  drawCaret(
    g: Draw,
    local: number,
    options: { x: number; y: number; color: Color; opacity?: number; state?: CaretState },
  ): void {
    const opacity = options.opacity ?? 1;
    if (opacity <= 0) return;
    const state = this.caret(local, options.state);
    const cap = this.block.capHeight;
    const r = cap * 0.3;
    const gap = r * 1.5;
    const blink =
      local < 0
        ? 0.55 + 0.45 * Math.cos(local * Math.PI * 2.2)
        : local <= this.duration
          ? 1
          : caretOpacity(local, this.duration, { idle: 0.45, period: 1.1 });
    const a = opacity * clamp01(blink);
    if (a <= 0.001) return;
    g.circle(options.x + state.x + gap + r, options.y + state.baseline - cap * 0.36, r, {
      fill: options.color,
      opacity: a,
    });
  }
}
