/**
 * Decode — character scramble (docs/templates/01-text-titles.md §1.5).
 *
 * The expensive detail: the layout never jitters. Every character owns a slot fixed to its final
 * glyph's advance; scrambled glyphs are picked among the set's glyphs of a similar width and
 * scaled to fit the slot exactly, so proportional faces scramble as calmly as monospace ones.
 * The scramble runs on a stepped 24 fps clock (12 fps in Calm) independent of the export frame
 * rate, and the block cursor blinks on the same clock — mechanical, never eased.
 */

import {
  CLEAN_END,
  type ClipShape,
  type Color,
  c,
  type Draw,
  defineTemplate,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  mixOklch,
  type PathCommand,
  type Rect,
  stepped,
  type TextBlock,
  type TextLine,
  unionRect,
} from '@/engine';
import { BLOCKS, GLYPH_SETS, SCRAMBLE_STEPS } from './glyphs';
import { schedule } from './schedule';

type Composition = {
  /** Text size in u. */
  size: number;
  /** Share of the layout width the text may use. */
  measure: number;
  /** Meta line size in u. */
  meta: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { size: 10.5, measure: 0.8, meta: 2.9 },
  '9:16': { size: 9, measure: 1, meta: 3.4 },
  '1:1': { size: 8.4, measure: 1, meta: 3 },
  '4:5': { size: 8.8, measure: 1, meta: 3.1 },
};

/** Variable-width display faces run a touch wide: technical without shouting. */
const WIDE = 108;
/** Scanlines: pitch (u; never finer than 3 output pixels) and the lit share of each line. */
const SCAN_PITCH = 0.5;
const SCAN_LIT = 0.64;
/** Opacity of the text between scanlines. */
const SCAN_DIM = 0.66;
/** A lock flashes the accent and decays to `fg` over this long (a phosphor afterglow). */
const FLASH = 0.12;

type Slot = {
  glyph: Glyph;
  /** Absolute origin and baseline. */
  x: number;
  baseline: number;
  /** Visual advance (without tracking) and its center. */
  width: number;
  center: number;
  ink: boolean;
  /** Indices into the glyph set that scramble in this slot. */
  candidates: number[];
  /** Hold glitches: [start, end) pairs (absolute seconds). */
  glitches: number[];
};

export default defineTemplate({
  id: 'decode',
  version: 1,
  meta: {
    name: 'Decode',
    tagline: 'Character scramble',
    category: 'text-titles',
    tags: ['title', 'tech', 'scramble', 'terminal', 'teaser'],
    useCases: ['Tech launches', 'Teasers', 'Gaming', 'Podcast intros'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 4, min: 3, max: 10 },
  alpha: 'optional',
  poster: 2.3,
  palettes: [
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'amber' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'acid' },
  ],
  pairings: ['technical', 'mono', 'grotesk', 'wide', 'sport'],
  controls: {
    text: c.text({
      label: 'Text',
      default: 'LOADING\nSOMETHING BIG_',
      maxLength: 32,
      multiline: true,
      maxLines: 2,
      primary: true,
    }),
    meta: c.text({ label: 'Meta line', default: '// TEASER 01', maxLength: 28, optional: true }),
    glyphs: c.choice({
      label: 'Glyph set',
      default: 'letters',
      display: 'select',
      options: [
        { value: 'letters', label: 'Letters' },
        { value: 'numbers', label: 'Numbers' },
        { value: 'symbols', label: 'Symbols' },
        { value: 'binary', label: 'Binary' },
        { value: 'blocks', label: 'Blocks' },
      ],
    }),
    flash: c.toggle({ label: 'Accent flash', default: true }),
    scanlines: c.toggle({ label: 'Scanlines', default: true }),
  },
  looks: [
    {
      id: 'graphite',
      name: 'Graphite',
      palette: { kind: 'library', id: 'graphite' },
      pairing: 'technical',
    },
    {
      id: 'ink',
      name: 'Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'technical',
      values: { glyphs: 'symbols' },
    },
    {
      id: 'paper',
      name: 'Paper',
      palette: { kind: 'library', id: 'paper' },
      pairing: 'mono',
      values: { scanlines: false },
    },
  ],
  timing: ({ props }) => ({
    in: schedule(props.text).populate,
    out: 0.6,
    tail: CLEAN_END,
    readable: props.text,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const at = (offset: number) => timeline.at('in', offset);
    const atOut = (offset: number) => timeline.at('out', offset);
    // Stepped moments land on the 24 fps grid.
    const grid = (time: number) => Math.ceil(time * 24 - 1e-6) / 24;

    // --- type -------------------------------------------------------------------------------
    const display = pairing.display;
    const size = comp.size * u;
    const styleAt = (width: number | undefined) => ({
      font: display.font,
      italicFont: display.italic,
      size,
      weight: display.weight,
      width,
      tracking: display.tracking + 0.04,
      features: display.features,
      case: 'upper' as const,
    });
    // Variable-width faces condense a little for long lines before the size shrinks.
    const widths = display.width !== undefined ? [WIDE, 96, 86] : [undefined];
    let style = styleAt(widths[0]);
    // The cursor needs a cell after the last character.
    const cellW = text.line('0', { ...style, tracking: 0 }).width;
    const measure = area.w * comp.measure - cellW * 1.4;
    const source = props.text.trim() || ' ';
    const hardLines = source.split('\n').length;
    const layoutText = (maxLines: number, minSize: number) =>
      text.layout(source, {
        style,
        maxWidth: measure,
        maxLines,
        lineHeight: Math.max(1.02, display.lineHeight + 0.1),
        align: 'left',
        fit: { minSize },
      });
    let block = layoutText(hardLines, size * 0.75);
    for (const width of widths.slice(1)) {
      if (!block.overflow) break;
      style = styleAt(width);
      block = layoutText(hardLines, size * 0.75);
    }
    if (block.overflow) block = layoutText(2, size * 0.45);
    const cap = block.capHeight;
    const cellWidth = text.line('0', { ...style, size: block.size, tracking: 0 }).width;

    const metaText = props.meta.trim();
    const meta: TextBlock | null = metaText
      ? text.layout(metaText, {
          style: {
            font: pairing.text.font,
            size: comp.meta * u,
            weight: 500,
            tracking: 0.06,
            features: pairing.text.features,
          },
          maxWidth: area.w,
          maxLines: 1,
          lineHeight: 1.2,
          align: 'left',
          fit: { minSize: 2.4 * u },
        })
      : null;

    // --- composition: meta, then the text; on the safe edge, optically centered -------------
    const metaGap = meta ? Math.max(2.6 * u, cap * 0.55) : 0;
    const metaH = meta ? meta.height + metaGap : 0;
    const top = area.y + (area.h - metaH - block.height) * 0.46;
    const mx = area.x;
    const my = top;
    const bx = area.x;
    const by = top + metaH;
    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const textBounds = shift(block.ink, bx, by);
    const metaBounds = meta ? shift(meta.ink, mx, my) : null;
    const lastLine = block.lines[block.lines.length - 1];
    const cursorEnd = lastLine ? bx + lastLine.x + lastLine.width + cellWidth * 0.15 : bx;
    const lockup = unionRect(metaBounds ? unionRect(textBounds, metaBounds) : textBounds, {
      x: cursorEnd,
      y: by + (lastLine?.baseline ?? cap) - cap,
      w: cellWidth,
      h: cap,
    });

    // --- slots: one per glyph, fixed to the final glyph's advance ---------------------------
    const set = GLYPH_SETS[props.glyphs];
    const setStyle = { ...style, tracking: 0, size: block.size };
    const setLines: TextLine[] = set.blocks
      ? []
      : set.chars.map((char) => text.line(char, setStyle).lines[0] as TextLine);
    const setAdvance = setLines.map((line) => line.glyphs[0]?.advance ?? block.size * 0.6);
    const tracking = style.tracking * block.size;
    const slots: Slot[] = [];
    for (const line of block.lines) {
      for (const glyph of line.glyphs) {
        const x = bx + line.x + glyph.x;
        const width = Math.max(glyph.advance - tracking, 0.2 * block.size);
        // Glyphs of a similar width scramble in this slot (and are scaled to fit it exactly).
        let candidates = set.chars.map((_, i) => i);
        if (!set.blocks && set.chars.length > 2) {
          const ranked = candidates
            .map((i) => ({ i, d: Math.abs(Math.log(width / (setAdvance[i] ?? width))) }))
            .sort((a, b) => a.d - b.d);
          const close = ranked.filter((entry) => entry.d < Math.log(1.3));
          candidates = (close.length >= 4 ? close : ranked.slice(0, 6)).map((entry) => entry.i);
        }
        slots.push({
          glyph,
          x,
          baseline: by + line.baseline,
          width,
          center: x + width / 2,
          ink: glyph.ink !== null,
          candidates,
          glitches: [],
        });
      }
    }
    const n = slots.length;

    // --- choreography (absolute seconds, precomputed) --------------------------------------
    const plan = schedule(props.text);
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    // Energy maps to the scramble's rate (Calm flickers at 12 fps) and length (via `in`).
    const rate = calm ? 12 : 24;
    const lengths = ctx.rng('lengths');
    const arrive = new Float64Array(n);
    const lock = new Float64Array(n);
    const leave = new Float64Array(n);
    const vanish = new Float64Array(n);
    const gapOut = Math.min(0.035, 0.34 / Math.max(1, n - 1));
    for (let i = 0; i < n; i++) {
      const offset = plan.start + (n > 1 ? (i * plan.span) / (n - 1) : 0);
      arrive[i] = grid(at(offset));
      lock[i] = grid(at(offset + lengths.range(0.25, 0.55)));
      leave[i] = grid(atOut((n - 1 - i) * gapOut));
      vanish[i] = grid(atOut((n - 1 - i) * gapOut + lengths.range(0.1, 0.18)));
    }
    // Scramble glyphs per slot and step: seeded, never the same glyph twice in a row.
    const rng = ctx.rng('scramble');
    const table = slots.map((slot) => {
      const steps = new Uint8Array(SCRAMBLE_STEPS);
      let previous = -1;
      for (let s = 0; s < SCRAMBLE_STEPS; s++) {
        const count = slot.candidates.length;
        let k = Math.floor(rng.next() * count);
        if (slot.candidates[k] === previous && count > 1) k = (k + 1) % count;
        steps[s] = slot.candidates[k] ?? 0;
        previous = steps[s] ?? 0;
      }
      return steps;
    });

    // Hold glitches: every ~1.2 s, one or two characters re-scramble for 0.2 s.
    const hold = timeline.sections.hold;
    // Every character has locked by now (the cursor starts blinking here).
    const settled = grid(at(plan.settled));
    const glitchRng = ctx.rng('glitches');
    const every = calm ? 1.6 : punchy ? 0.95 : 1.2;
    const inked = slots.filter((slot) => slot.ink);
    if (inked.length > 0) {
      // Only once every character has locked (and flashed).
      const first = Math.max(hold.start + every * 0.6, settled + 0.6);
      for (let when = first; when + 0.45 < hold.end; when += every) {
        const start = grid(when + glitchRng.range(-0.15, 0.15));
        const count = calm ? 1 : glitchRng.chance(punchy ? 0.7 : 0.45) ? 2 : 1;
        for (let j = 0; j < Math.min(count, inked.length); j++) {
          inked[Math.floor(glitchRng.next() * inked.length)]?.glitches.push(
            start,
            grid(start + 0.2),
          );
        }
      }
    }

    // Cursor: blinks twice before the text arrives, rides the frontier, blinks at 1 Hz after.
    const preroll = arrive[0] ?? at(plan.start);
    const blinkStep = preroll / 5;
    const cursorOff = grid(atOut(0.55));
    const outStart = timeline.sections.out.start;

    // Meta line: types in once the text has started, leaves first.
    const metaGlyphs = meta?.glyphCount ?? 0;
    const metaIn = Array.from({ length: metaGlyphs }, (_, j) =>
      grid(at(plan.start + 0.15 + j * 0.03)),
    );
    const metaOut = Array.from({ length: metaGlyphs }, (_, j) =>
      grid(atOut((metaGlyphs - 1 - j) * 0.02)),
    );

    // Lock flash: the accent decaying to fg, in precomputed steps.
    const flashColors: Color[] = Array.from({ length: 8 }, (_, i) => mixOklch(accent, fg, i / 7));

    // --- scanlines: lit bands through the text, the cursor and the meta line ---------------
    const scanTop = (metaBounds ?? textBounds).y - u;
    const scanBottom = textBounds.y + textBounds.h + u;
    const clips = new Map<number, ClipShape>();
    const scanClip = (pixel: number): ClipShape => {
      const pitch = Math.max(SCAN_PITCH * u, 3 * pixel);
      const key = Math.round(pitch * 100);
      let clip = clips.get(key);
      if (!clip) {
        const bands: PathCommand[] = [];
        const x0 = area.x - 2 * u;
        const x1 = area.x + area.w + 2 * u;
        for (let y = scanTop; y < scanBottom; y += pitch) {
          const h = pitch * SCAN_LIT;
          bands.push(['M', x0, y], ['L', x1, y], ['L', x1, y + h], ['L', x0, y + h], ['Z']);
        }
        clip = { path: bands };
        clips.set(key, clip);
      }
      return clip;
    };

    // --- drawing ----------------------------------------------------------------------------
    const state = new Int8Array(n); // 0 hidden · 1 scrambling · 2 locked
    const flash = new Float64Array(n).fill(1);
    const locked: GlyphTransform = {};
    const lockedGlyph = (glyph: Glyph): GlyphTransform | null => {
      const i = glyph.index;
      if (state[i] !== 2) return null;
      const level = flash[i] ?? 1;
      locked.color = level < 1 ? flashColors[Math.min(7, Math.floor(level * 8))] : undefined;
      return locked;
    };
    const scaled: GlyphTransform = { scaleX: 1, originX: 0 };
    const scaledGlyph = (): GlyphTransform => scaled;
    let metaFrom = 0;
    let metaTo = 0;
    const plain: GlyphTransform = {};
    const metaGlyph = (glyph: Glyph): GlyphTransform | null =>
      glyph.index >= metaFrom && glyph.index < metaTo ? plain : null;

    let tick = 0;
    let cursorX = 0;
    let cursorY = 0;
    let cursorOn = false;

    const drawScramble = (g: Draw, i: number) => {
      const slot = slots[i];
      if (!slot?.ink) return;
      const pick = table[i]?.[tick % SCRAMBLE_STEPS] ?? 0;
      if (set.blocks) {
        const w = slot.width * 0.88;
        const x = slot.center - w / 2;
        const y = slot.baseline - cap;
        for (const [px, py, pw, ph, alpha] of BLOCKS[pick % BLOCKS.length] ?? []) {
          g.rect(
            { x: x + px * w, y: y + py * cap, w: pw * w, h: ph * cap },
            { fill: muted, opacity: alpha },
          );
        }
        return;
      }
      const line = setLines[pick];
      const glyph = line?.glyphs[0];
      if (!line || !glyph) return;
      const advance = setAdvance[pick] ?? slot.width;
      scaled.scaleX = Math.min(1.6, Math.max(0.55, slot.width / advance));
      g.text(line, {
        fill: muted,
        x: slot.center - (advance * scaled.scaleX) / 2 - line.x - glyph.x,
        y: slot.baseline - line.baseline,
        glyph: scaledGlyph,
      });
    };

    const drawAll = (g: Draw) => {
      if (meta && metaTo > metaFrom) g.text(meta, { fill: muted, x: mx, y: my, glyph: metaGlyph });
      g.text(block, { fill: fg, x: bx, y: by, glyph: lockedGlyph });
      for (let i = 0; i < n; i++) if (state[i] === 1) drawScramble(g, i);
      if (cursorOn) {
        g.rect({ x: cursorX, y: cursorY - cap, w: cellWidth, h: cap }, { fill: accent });
      }
    };

    return {
      render: ({ t, g }) => {
        g.fill(bg, { background: true });
        const now = stepped(t, 24);
        tick = Math.round(stepped(t, rate) * rate);

        // Slot states: hidden, scrambling (arriving, glitching or leaving) or locked.
        let frontier = -1;
        let visible = 0;
        for (let i = 0; i < n; i++) {
          const slot = slots[i] as Slot;
          const lockAt = lock[i] ?? 0;
          let s = 0;
          let level = 1;
          if (now >= (arrive[i] ?? 0) && now < (vanish[i] ?? 0)) {
            s = now < lockAt || now >= (leave[i] ?? 0) ? 1 : 2;
            frontier = i;
            visible++;
          }
          if (s === 2) {
            const since = t - lockAt;
            if (since >= 0 && since < FLASH) level = since / FLASH;
            for (let k = 0; k < slot.glitches.length; k += 2) {
              const start = slot.glitches[k] ?? 0;
              const end = slot.glitches[k + 1] ?? 0;
              if (now >= start && now < end) s = 1;
              else if (t >= end && t < end + FLASH) level = 0.4 + (0.6 * (t - end)) / FLASH;
            }
          }
          state[i] = s;
          flash[i] = props.flash ? level : 1;
        }

        // Cursor: after the rightmost visible character.
        cursorOn = false;
        const first = slots[0];
        if (first) {
          const edge = slots[frontier];
          cursorX = edge ? edge.x + edge.glyph.advance : first.x;
          cursorY = edge ? edge.baseline : first.baseline;
          if (now < preroll) {
            const phase = Math.floor(now / blinkStep + 1e-6);
            cursorOn = phase === 1 || phase === 3;
          } else if (now < settled || (now >= outStart && now < cursorOff)) {
            cursorOn = true;
          } else if (now < outStart) {
            cursorOn = Math.floor((now - settled) * 2 + 1e-6) % 2 === 0;
          }
        }

        // Meta line: typed glyphs [metaFrom, metaTo).
        metaFrom = 0;
        metaTo = 0;
        for (let j = 0; j < metaGlyphs; j++) {
          if (now >= (metaIn[j] ?? 0) && now < (metaOut[j] ?? 0)) metaTo = j + 1;
          else if (now >= (metaOut[j] ?? 0)) break;
        }

        if (visible === 0 && !cursorOn && metaTo === 0) return;
        g.movable('lockup', lockup, (g) => {
          if (props.scanlines) {
            g.group({ opacity: SCAN_DIM }, drawAll);
            g.clip(scanClip(g.pixel), drawAll);
          } else {
            drawAll(g);
          }
          g.editable('text', textBounds);
          if (metaBounds) g.editable('meta', metaBounds);
        });
      },
    };
  },
});
