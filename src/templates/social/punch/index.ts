/**
 * Punch — kinetic hook captions (docs/templates/03-social.md §3.1).
 *
 * The expensive detail: it is cut like an editor would cut it. Each beat lasts as long as its
 * words take to read (`sequence` at the chosen Pace), so short words snap past and longer ones
 * breathe; and every cut is a true hard cut. Beats, background flips and the final clear are
 * placed between frames (always at 60 and 30 fps; at 50, 25 and 24 fps wherever a time within
 * 17 ms allows) and the shutter is held at 180°, so motion blur never dissolves one beat into the
 * next — a frame shows one beat or the other, never both. Each beat is set as large as its box
 * allows (stacked when that makes it markedly bigger), punches in from 1.25× with a seeded tilt,
 * and emphasized words get a marker-stroke highlight that wipes in on the cut, while the
 * background cuts to the palette's other color.
 */

import {
  c,
  type Draw,
  defineTemplate,
  type EnergyId,
  ease,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type Rect,
  type TextBlock,
  unionRect,
} from '@/engine';
import { type Beat, fitBeat } from './beat';
import { autoDuration, firstCut, PACES, planBeats, scriptBeats, TAIL } from './plan';
import { type Scheme, scheme, tones } from './scheme';

type Composition = {
  /** Beat box: share of the safe width (centered on the frame) and of the safe height. */
  width: number;
  height: number;
  /** Optical center of the beat, as a share of the safe height. */
  center: number;
  /** Most lines one beat may stack into. */
  lines: number;
  /** Largest font size in u: captions stay caption-sized; full beats fill their box. */
  size?: number;
  /** CTA size in u. */
  cta: number;
};

const FULL: Record<FormatId, Composition> = {
  '9:16': { width: 0.8, height: 0.44, center: 0.47, lines: 3, cta: 6.2 },
  '4:5': { width: 0.8, height: 0.5, center: 0.47, lines: 3, cta: 5.2 },
  '1:1': { width: 0.8, height: 0.5, center: 0.48, lines: 3, cta: 5 },
  '16:9': { width: 0.8, height: 0.52, center: 0.48, lines: 2, cta: 5.6 },
};

/** Captions sit low, over the footage's quiet part — big, but caption-sized. */
const CAPTIONS: Record<FormatId, Composition> = {
  '9:16': { width: 0.8, height: 0.3, center: 0.78, lines: 2, size: 17, cta: 4.6 },
  '4:5': { width: 0.8, height: 0.3, center: 0.78, lines: 2, size: 14, cta: 4.2 },
  '1:1': { width: 0.8, height: 0.3, center: 0.8, lines: 2, size: 13, cta: 4 },
  '16:9': { width: 0.72, height: 0.3, center: 0.8, lines: 2, size: 11, cta: 3.4 },
};

/**
 * Energy changes the cut's character, not just its speed. Calm settles softly (no tilt, a short
 * fade, a slow highlight). Balanced snaps down from 1.25× with a ±2° seeded tilt. Punchy slams
 * from further out and overshoots, keeps pushing into every beat, and the final beat thumps on
 * a half-second grid. `push` is the final beat's slow scale-up while it holds; `drive` a push
 * through every beat; `pulse` the final beat's thump.
 */
const ENTRANCES = {
  calm: {
    from: 1.1,
    dur: 0.18,
    curve: 'glide',
    tilt: 0,
    fade: 0.08,
    wipe: 0.2,
    wipeCurve: 'glide',
    push: 0.025,
    drive: 0,
    pulse: 0,
  },
  balanced: {
    from: 1.25,
    dur: 0.12,
    curve: 'snap',
    tilt: 2,
    fade: 0,
    wipe: 0.1,
    wipeCurve: 'snap',
    push: 0.04,
    drive: 0,
    pulse: 0,
  },
  punchy: {
    from: 1.34,
    dur: 0.12,
    curve: 'pop',
    tilt: 2.7,
    fade: 0,
    wipe: 0.08,
    wipeCurve: 'snap',
    push: 0.03,
    drive: 0.035,
    pulse: 0.025,
  },
} as const satisfies Record<EnergyId, object>;
/** Punchy's final-beat thump: every half second (120 bpm). */
const PULSE = 0.5;

/** The micro camera shake: two 30 fps frames, 0.4u (spec §3.1), scaled by Energy's travel. */
const SHAKE_STEP = 1 / 30;
const SHAKE = 0.4;
/** The highlight wipes in right after the cut (0.1 s at Balanced). */
const WIPE_DELAY = 0.02;

const padded = (r: Rect, by: number): Rect => ({
  x: r.x - by,
  y: r.y - by,
  w: r.w + 2 * by,
  h: r.h + 2 * by,
});

export default defineTemplate({
  id: 'punch',
  version: 1,
  meta: {
    name: 'Punch',
    tagline: 'Kinetic hook captions',
    category: 'social',
    tags: ['hook', 'captions', 'kinetic type', 'reels', 'bold'],
    useCases: ['Reel hooks', 'TikTok openers', 'Quotes as video', 'Captions over footage'],
  },
  formats: ['9:16', '1:1', '4:5', '16:9'],
  structure: 'sequence',
  duration: { default: 'auto', min: 4, max: 15 },
  alpha: 'optional',
  poster: 3.6,
  // Hard cuts must stay hard: a 180° shutter keeps every cut between frames (see plan.ts).
  shutter: 180,
  palettes: [
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'hazard' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'mono-light' },
  ],
  pairings: ['poster', 'grotesk', 'sport', 'wide', 'quirky'],
  controls: {
    script: c.text({
      label: 'Script',
      default: 'Stop\nscrolling.\nThis is\nhow you\nmake them\n*watch.*',
      maxLength: 160,
      multiline: true,
      maxLines: 12,
      primary: true,
      emphasis: true,
      hint: 'One beat per line. *Stars* highlight a word.',
    }),
    cta: c.text({
      label: 'Final CTA',
      default: '',
      maxLength: 32,
      optional: true,
      placeholder: 'Follow for part 2',
    }),
    case: c.choice({
      label: 'Case',
      default: 'upper',
      options: [
        { value: 'upper', label: 'UPPER' },
        { value: 'none', label: 'As typed' },
      ],
    }),
    highlight: c.choice({
      label: 'Highlight',
      default: 'block',
      options: [
        { value: 'block', label: 'Block' },
        { value: 'underline', label: 'Underline' },
        { value: 'color', label: 'Color' },
      ],
    }),
    switching: c.toggle({
      label: 'Background switching',
      default: true,
      hint: 'Emphasized beats cut the background to the other color',
    }),
    mode: c.choice({
      label: 'Mode',
      default: 'full',
      options: [
        { value: 'full', label: 'Full' },
        { value: 'captions', label: 'Captions' },
      ],
      hint: 'Captions: for use over footage — export with a transparent background',
    }),
    pace: c.choice({
      label: 'Pace',
      group: 'motion',
      default: 'normal',
      options: [
        { value: 'chill', label: 'Chill' },
        { value: 'normal', label: 'Normal' },
        { value: 'hyper', label: 'Hyper' },
      ],
    }),
    shake: c.toggle({ label: 'Shake', group: 'motion', default: true }),
  },
  looks: [
    {
      id: 'acid-ink',
      name: 'Acid ↔ Ink',
      palette: { kind: 'library', id: 'acid' },
      pairing: 'poster',
    },
    {
      id: 'hazard-ink',
      name: 'Hazard ↔ Ink',
      palette: { kind: 'library', id: 'hazard' },
      pairing: 'poster',
    },
    {
      id: 'candy-dark',
      name: 'Candy ↔ Mono Dark',
      palette: { kind: 'library', id: 'candy' },
      pairing: 'poster',
    },
  ],
  timing: ({ props }) => ({
    lead: firstCut(),
    in: 0.12,
    out: 0,
    tail: TAIL,
    auto: autoDuration(props.script, props.cta, PACES[props.pace]),
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { roles } = palette;
    const captions = props.mode === 'captions';
    // Over footage (or standing in for it) text takes the lighter tone and a legibility outline.
    const onFootage = captions || ctx.transparent;
    const entrance = ENTRANCES[energy.id];
    const comp = (captions ? CAPTIONS : FULL)[frame.format];
    const cta = props.cta.trim();
    const beats = scriptBeats(props.script);
    const plan = planBeats(props.script, cta, PACES[props.pace], timeline.duration);

    // --- colors ---------------------------------------------------------------------------
    const { dark, light } = tones(roles);
    const base = scheme(roles.bg, roles.fg, roles);
    const inverse = scheme(roles.fg, roles.bg, roles);
    const footage = scheme(dark, light, roles);

    // --- layout ---------------------------------------------------------------------------
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    // Centered on the frame's axis, even where the social zone isn't symmetric.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const boxW = Math.min(area.w * comp.width, half * 2);
    const boxH = area.h * comp.height;
    const centerY = area.y + area.h * comp.center;
    const box: Rect = { x: frame.cx - boxW / 2, y: centerY - boxH / 2, w: boxW, h: boxH };
    const display = pairing.display;
    // Full beats may grow until their box stops them; captions stop at caption size.
    const maxSize = Math.min((comp.size ?? Number.POSITIVE_INFINITY) * u, boxH * 1.25);
    const style = {
      font: display.font,
      italicFont: display.italic,
      size: maxSize,
      weight: display.weight,
      width: display.width,
      tracking: display.tracking,
      features: display.features,
      case: props.case === 'upper' ? ('upper' as const) : ('none' as const),
    };
    const layout = text.layout.bind(text);
    // Stacked lines sit a fixed share of an em apart, whatever the face's cap height (Anton's
    // caps fill 0.86 em; its 0.9 line height would make stacked caps touch).
    const capRatio = text.line('H', { ...style, size: 100 }).capHeight / 100;
    const lineHeight =
      props.case === 'upper' ? capRatio + 0.13 : Math.max(display.lineHeight, capRatio + 0.3);

    const ctaStyle = {
      font: pairing.text.font,
      size: comp.cta * u,
      weight: 700,
      width: pairing.text.width,
      tracking: 0.1,
      features: pairing.text.features,
      case: 'upper' as const,
    };
    const setCta = (lines: number, minSize: number) =>
      text.layout(cta, {
        style: ctaStyle,
        maxWidth: boxW,
        maxLines: lines,
        lineHeight: 1.2,
        align: 'center',
        fit: { minSize },
      });
    // One line, a little smaller if need be; only a long CTA wraps.
    let ctaBlock: TextBlock | null = cta ? setCta(1, ctaStyle.size * 0.75) : null;
    if (ctaBlock?.overflow) ctaBlock = setCta(2, 2.4 * u);
    // The CTA keeps a gap in proportion to the beat above it.
    const ctaGap = (beat: Beat) => Math.max(4 * u, 0.15 * beat.block.size);
    const beatBox = (height: number, cy: number) => ({
      style,
      lineHeight,
      cx: frame.cx,
      width: boxW,
      height,
      cy,
      lines: comp.lines,
      minSize: 2.4 * u,
      maxSize,
    });
    // How far a beat's highlight reaches below its ink (the block's padding, the underline).
    const overhang = (beat: Beat) => {
      let bottom = beat.bounds.y + beat.bounds.h;
      for (const mark of beat.marks) {
        const r =
          props.highlight === 'block'
            ? mark.block
            : props.highlight === 'underline'
              ? mark.bar
              : null;
        if (r) bottom = Math.max(bottom, r.y + r.h);
      }
      return bottom - (beat.bounds.y + beat.bounds.h);
    };

    const laidOut: Beat[] = beats.map((beat, i) => {
      if (i < beats.length - 1 || !ctaBlock) return fitBeat(layout, beat, beatBox(boxH, centerY));
      // The final beat shares the box with the CTA below it: the lockup stays centered.
      const reserve = ctaBlock.ink.h + 4 * u;
      const fitted = fitBeat(layout, beat, beatBox(boxH - reserve, centerY - reserve / 2));
      const extra = overhang(fitted) + ctaGap(fitted) - 4 * u;
      return extra > 0
        ? fitBeat(layout, beat, beatBox(boxH - reserve - extra, centerY - (reserve + extra) / 2))
        : fitted;
    });
    const finalBeat = laidOut[laidOut.length - 1];
    const ctaY =
      ctaBlock && finalBeat
        ? finalBeat.bounds.y +
          finalBeat.bounds.h +
          overhang(finalBeat) +
          ctaGap(finalBeat) -
          ctaBlock.ink.y
        : 0;
    const ctaBounds: Rect | null =
      ctaBlock && finalBeat
        ? {
            x: box.x + ctaBlock.ink.x,
            y: ctaY + ctaBlock.ink.y,
            w: ctaBlock.ink.w,
            h: ctaBlock.ink.h,
          }
        : null;

    // What each beat may paint, with room for the outline and the shadow (layer bounds).
    const areas = laidOut.map((beat, i) =>
      padded(
        i === laidOut.length - 1 && ctaBounds ? unionRect(beat.reach, ctaBounds) : beat.reach,
        4 * u,
      ),
    );

    // Emphasized beats cut the background to the palette's other color (Acid ↔ Ink).
    const schemes: Scheme[] = [];
    let flipped = false;
    laidOut.forEach((beat) => {
      if (props.switching && beat.marks.length > 0) flipped = !flipped;
      schemes.push(onFootage ? footage : flipped ? inverse : base);
    });

    // --- seeded variation -----------------------------------------------------------------
    const tiltRng = ctx.rng('tilt');
    const tilts = laidOut.map(() => tiltRng.range(-1, 1) * entrance.tilt);
    const shakeRng = ctx.rng('shake');
    const amplitude = SHAKE * u * energy.travel;
    const shakes = laidOut.map((beat, i) => {
      const angle = shakeRng.range(0, Math.PI * 2);
      const back = angle + Math.PI + shakeRng.range(-0.6, 0.6);
      const a = amplitude * shakeRng.range(0.75, 1);
      const b = amplitude * shakeRng.range(0.5, 0.8);
      // Every 4th beat shakes (Punchy also shakes on emphasized beats).
      const on =
        props.shake && ((i + 1) % 4 === 0 || (energy.id === 'punchy' && beat.marks.length > 0));
      return on
        ? [Math.cos(angle) * a, Math.sin(angle) * a, Math.cos(back) * b, Math.sin(back) * b]
        : null;
    });

    // --- motion helpers -------------------------------------------------------------------
    const enter = ease[entrance.curve];
    const wipe = ease[entrance.wipeCurve];
    const settle = ease.drift;
    const { starts, clear } = plan;
    const first = starts[0] ?? Number.POSITIVE_INFINITY;
    const beatAt = (t: number): number => {
      if (t < first || t >= clear) return -1;
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((starts[mid] ?? 0) <= t) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    const wiped = (r: Rect, p: number): Rect => ({ x: r.x, y: r.y, w: r.w * p, h: r.h });
    const outlineWidth = (block: TextBlock) => 0.12 * block.size;
    // Captions over footage also get a soft shadow; full-size beats have ink enough in their
    // outline (and a shadow that large would cost more than a frame's budget).
    const shadow =
      ctx.transparent && captions ? { color: dark, blur: 1, opacity: 0.5, y: 0.3 } : undefined;

    // Colored-word highlight: emphasized glyphs take the mark color (no allocation per glyph).
    const colored: GlyphTransform = {};
    const plainGlyph: GlyphTransform = {};
    const colorGlyph = (glyph: Glyph): GlyphTransform => (glyph.emphasis ? colored : plainGlyph);

    const drawBeat = (g: Draw, beat: Beat, s: Scheme, reveal: number) => {
      const at = { x: beat.x, y: beat.y };
      if (onFootage) {
        g.text(beat.block, {
          ...at,
          outline: { color: dark, width: outlineWidth(beat.block), join: 'round' },
        });
      }
      if (props.highlight === 'block' && reveal > 0) {
        for (const mark of beat.marks) g.rect(wiped(mark.block, reveal), { fill: s.block });
      }
      if (props.highlight === 'color') {
        colored.color = s.mark;
        g.text(beat.block, { ...at, fill: s.text, glyph: colorGlyph });
      } else {
        g.text(beat.block, { ...at, fill: s.text });
      }
      if (props.highlight === 'block' && reveal > 0) {
        // The words on the block turn to the block's text color as the block passes them.
        for (const mark of beat.marks) {
          g.clip(wiped(mark.block, reveal), (g) => g.text(mark.line, { ...at, fill: s.onBlock }));
        }
      }
      if (props.highlight === 'underline' && reveal > 0) {
        for (const mark of beat.marks) g.rect(wiped(mark.bar, reveal), { fill: s.mark });
      }
    };

    const drawCta = (g: Draw, s: Scheme, t: number, start: number) => {
      if (!ctaBlock || !ctaBounds) return;
      const shown = ease.glide(Math.min(1, Math.max(0, (t - start) / 0.45)));
      if (shown <= 0) return;
      const y = ctaY + (1 - shown) * 1.6 * u;
      if (!onFootage) {
        g.text(ctaBlock, { x: box.x, y, fill: s.text, opacity: shown });
        return;
      }
      // Outline and fill fade as one image, so the outline never shows through the fill.
      g.layer({ opacity: shown, bounds: padded(ctaBounds, 2 * u) }, (g) => {
        g.text(ctaBlock, {
          x: box.x,
          y,
          outline: { color: dark, width: 0.22 * ctaBlock.size, join: 'round' },
        });
        g.text(ctaBlock, { x: box.x, y, fill: s.text });
      });
    };

    return {
      render: ({ t, g }) => {
        const index = beatAt(t);
        const s = index >= 0 ? (schemes[index] ?? base) : base;
        // Captions exported opaque stand on the dark tone, as they would on footage.
        g.fill(captions ? dark : s.bg, { background: true });
        const beat = index >= 0 ? laidOut[index] : undefined;
        if (!beat) return;

        const start = starts[index] ?? 0;
        const local = t - start;
        const final = index === laidOut.length - 1;
        const p = enter(Math.min(1, local / entrance.dur));
        let scale = entrance.from + (1 - entrance.from) * p;
        const settled = start + entrance.dur;
        if (final) {
          // The final beat holds with a slow push (and, Punchy, a thump on every half second).
          const hold = Math.max(1e-6, clear - settled);
          scale *= 1 + entrance.push * settle(Math.min(1, Math.max(0, (t - settled) / hold)));
          if (entrance.pulse > 0 && t > settled) {
            const phase = ((t - settled) % PULSE) / PULSE;
            scale *= 1 + entrance.pulse * (1 - ease.glide(Math.min(1, phase * 2)));
          }
        } else if (entrance.drive > 0) {
          // Punchy keeps pushing into every beat until the next cut.
          const next = starts[index + 1] ?? clear;
          const span = Math.max(1e-6, next - settled);
          scale *= 1 + entrance.drive * settle(Math.min(1, Math.max(0, (t - settled) / span)));
        }
        const rotate = (tilts[index] ?? 0) * (1 - p);
        const opacity = entrance.fade > 0 ? Math.min(1, local / entrance.fade) : 1;
        const reveal = wipe(Math.min(1, Math.max(0, (local - WIPE_DELAY) / entrance.wipe)));

        let sx = 0;
        let sy = 0;
        const shake = shakes[index];
        if (shake && local < 2 * SHAKE_STEP) {
          const step = local >= SHAKE_STEP ? 2 : 0;
          sx = shake[step] ?? 0;
          sy = shake[step + 1] ?? 0;
        }

        const content = (g: Draw) => {
          drawBeat(g, beat, s, reveal);
          if (final) drawCta(g, s, t, start + entrance.dur + 0.2);
        };
        g.movable('script', box, (g) => {
          g.group({ x: sx, y: sy }, (g) =>
            g.group({ scale, rotate, originX: beat.cx, originY: beat.cy }, (g) => {
              const area = areas[index];
              // Outlined text fades as one image (its outline must not show through the fill).
              if (shadow) g.fx({ shadow, opacity, bounds: area }, content);
              else if (onFootage && opacity < 1) g.layer({ opacity, bounds: area }, content);
              else g.group({ opacity }, content);
            }),
          );
          g.editable('script', beat.bounds);
          if (final && ctaBounds && t >= start + entrance.dur + 0.2) g.editable('cta', ctaBounds);
        });
      },
    };
  },
});
