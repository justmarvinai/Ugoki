/**
 * Countdown — launch timer (docs/templates/03-social.md §3.5).
 *
 * The expensive detail: the ticks are frame-exact. Each second's number lands exactly on its
 * whole-second boundary — a frame at 24, 25, 30, 50 and 60 fps alike — and the roll that brings
 * it crosses over three frames (0.1 s) earlier, so the new number is legible on the beat, not
 * after it. The ring runs continuously in between, one segment per second, so the timer is
 * alive between the ticks; at zero the empty ring bursts into radial lines as the number blows
 * up and the message rises.
 */

import {
  CLEAN_END,
  c,
  clamp01,
  counterWheels,
  createOdometer,
  type Draw,
  defineTemplate,
  type EaseName,
  type EnergyId,
  ease,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  mixOklab,
  type Rect,
  type TextBlock,
  type TextStyle,
  unionRect,
  withAlpha,
} from '@/engine';
import { createDrum } from './drum';

type Composition = {
  /** Ring diameter: share of the (symmetric) safe width, at most a share of the safe height. */
  ringW: number;
  ringH: number;
  /** Text sizes (u): label, date line, unit, and the largest final message. */
  label: number;
  date: number;
  unit: number;
  message: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '9:16': { ringW: 0.8, ringH: 0.5, label: 5.4, date: 4.2, unit: 4.8, message: 17 },
  '4:5': { ringW: 0.72, ringH: 0.56, label: 4.6, date: 3.6, unit: 4.2, message: 14 },
  '1:1': { ringW: 0.62, ringH: 0.58, label: 4, date: 3.2, unit: 3.8, message: 13 },
  '16:9': { ringW: 0.4, ringH: 0.6, label: 3.8, date: 3, unit: 3.6, message: 12 },
};

/** Live mode: after zero, the burst and the rising message (real seconds). */
const REVEAL = 0.9;
/** Days mode: the reel spins and lands, then the unit rises (Balanced seconds). */
const DAYS_IN = 2.4;
const OUT = 0.5;
/** After zero, the message rises once the blown-up zero has cleared (seconds). */
const MESSAGE_AT = 0.2;
/** The roll crosses over this long before its second boundary (3 frames at 30 fps). */
const ANTICIPATION = 0.1;

/**
 * Per Energy: the roll (length and curve), how hard the last three seconds pulse and the zero
 * bursts. Calm glides and never overshoots; Punchy snaps faster and hits harder.
 */
const ENERGY = {
  calm: { roll: 0.45, curve: 'glide', pulse: 0.04, flash: 0.06, lines: 14, blowUp: 0.35 },
  balanced: { roll: 0.35, curve: 'snap', pulse: 0.06, flash: 0.09, lines: 20, blowUp: 0.55 },
  punchy: { roll: 0.26, curve: 'snap', pulse: 0.08, flash: 0.13, lines: 26, blowUp: 0.8 },
} as const satisfies Record<
  EnergyId,
  { roll: number; curve: EaseName; pulse: number; flash: number; lines: number; blowUp: number }
>;

export default defineTemplate({
  id: 'countdown',
  version: 1,
  meta: {
    name: 'Countdown',
    tagline: 'Launch timer',
    category: 'social',
    tags: ['countdown', 'timer', 'launch', 'drop', 'event'],
    useCases: ['Product drops', 'Launches', 'Events', "New Year's", 'Live-stream starts'],
  },
  formats: ['9:16', '1:1', '4:5', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 'auto', min: 4, max: 20 },
  alpha: 'optional',
  poster: 2.45,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'paper' },
  ],
  pairings: ['grotesk', 'technical', 'sport', 'wide', 'mono'],
  controls: {
    label: c.text({ label: 'Label', default: 'The drop starts in', maxLength: 32, optional: true }),
    count: c.number({
      label: 'Count from',
      group: 'content',
      default: 5,
      min: 3,
      max: 10,
      step: 1,
    }),
    message: c.text({
      label: 'Final message',
      default: 'It’s live.',
      maxLength: 24,
      primary: true,
    }),
    date: c.text({
      label: 'Date line',
      default: 'FRI 10.10 · 18:00 CET',
      maxLength: 32,
      optional: true,
    }),
    unit: c.text({
      label: 'Unit',
      default: 'days',
      maxLength: 16,
      optional: true,
      hint: 'Days-to-go mode: shown under the number',
    }),
    ring: c.toggle({ label: 'Ring', default: true }),
    mode: c.choice({
      label: 'Mode',
      group: 'motion',
      default: 'live',
      options: [
        { value: 'live', label: 'Live seconds' },
        { value: 'days', label: 'Days-to-go reveal' },
      ],
      hint: 'Live: counts down in real seconds. Days: the reel lands on the number.',
    }),
  },
  looks: [
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    { id: 'acid', name: 'Acid', palette: { kind: 'library', id: 'acid' }, pairing: 'grotesk' },
    {
      id: 'midnight',
      name: 'Midnight',
      palette: { kind: 'library', id: 'midnight' },
      pairing: 'technical',
    },
  ],
  // Live seconds are real seconds whatever the Energy: the entrance section *is* the count, so
  // it is divided by the Energy's time scale the engine multiplies it by. It also makes the
  // count the timeline's floor — a fixed duration can never cut it short.
  timing: ({ props, energy }) =>
    props.mode === 'days'
      ? { in: DAYS_IN, out: OUT, tail: CLEAN_END, auto: 5 }
      : {
          in: (Math.round(props.count) + REVEAL) / energy.time,
          out: OUT,
          tail: CLEAN_END,
          auto: Math.round(props.count) + 2,
        },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text } = ctx;
    const { u } = frame;
    const { bg, fg, muted, accent } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const feel = ENERGY[energy.id];
    const live = props.mode === 'live';
    const count = Math.round(props.count);
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    // Centered on the frame's axis, even where the social zone isn't symmetric.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const measure = half * 2;
    const x0 = frame.cx - half;

    // --- ring and numeral size ---------------------------------------------------------------
    const diameter = Math.min(comp.ringW * measure, comp.ringH * area.h);
    const radius = diameter / 2;
    const stroke = Math.max(0.9 * u, diameter * 0.026);

    const display = pairing.display;
    const displayStyle = (size: number): TextStyle => ({
      font: display.font,
      italicFont: display.italic,
      size,
      weight: display.weight,
      width: display.width,
      tracking: 0,
      features: display.features,
    });
    const textStyle = (size: number, weight: number, tracking: number): TextStyle => ({
      font: pairing.text.font,
      size,
      weight,
      width: pairing.text.width,
      tracking,
      features: pairing.text.features,
    });

    const unitText = props.unit.trim();
    const unit: TextBlock | null =
      !live && unitText
        ? text.layout(unitText, {
            style: { ...textStyle(comp.unit * u, 600, 0.14), case: 'upper' },
            maxWidth: diameter * 0.62,
            maxLines: 1,
            lineHeight: 1.2,
            align: 'center',
            fit: { minSize: 2.4 * u },
          })
        : null;
    const unitGap = unit ? 0.05 * diameter : 0;
    const digits = String(count).length;
    const probe = createOdometer(text, displayStyle(100));
    const capShare = unit ? 0.38 : 0.44;
    const numeralSize = Math.min(
      (capShare * diameter) / (probe.capHeight / 100),
      (0.64 * diameter) / (digits * (probe.digitWidth / 100)),
    );
    const odometer = createOdometer(text, displayStyle(numeralSize));
    const cap = odometer.capHeight;

    // --- text --------------------------------------------------------------------------------
    const labelText = props.label.trim();
    const label: TextBlock | null = labelText
      ? text.layout(labelText, {
          style: textStyle(comp.label * u, 500, 0.01),
          maxWidth: measure,
          maxLines: 2,
          lineHeight: 1.25,
          align: 'center',
          fit: { minSize: 2.4 * u },
        })
      : null;
    const dateText = props.date.trim();
    const date: TextBlock | null = dateText
      ? text.layout(dateText, {
          style: { ...textStyle(comp.date * u, 500, 0.08), case: 'upper' },
          maxWidth: measure,
          maxLines: 1,
          lineHeight: 1.2,
          align: 'center',
          fit: { minSize: 2.4 * u },
        })
      : null;
    const message = text.layout(props.message.trim() || ' ', {
      style: { ...displayStyle(comp.message * u), tracking: display.tracking },
      maxWidth: Math.max(diameter * 1.1, measure * 0.86),
      maxLines: 2,
      lineHeight: Math.max(display.lineHeight, 1),
      align: 'center',
      fit: { minSize: comp.message * u * 0.45 },
    });

    // --- lockup: label · ring · date, optically centered --------------------------------------
    const gap = 5 * u;
    const labelH = label ? label.height + 0.3 * label.size : 0;
    const dateH = date ? date.height + 0.3 * date.size : 0;
    const total = (label ? labelH + gap : 0) + diameter + (date ? gap + dateH : 0);
    const top = area.y + (area.h - total) * 0.46;
    const cy = top + (label ? labelH + gap : 0) + radius;
    const cx = frame.cx;
    const labelY = top;
    const dateY = cy + radius + gap;
    // The numeral's cap height is centered in the ring (with the unit under it in days mode).
    const lock = cap + (unit ? unitGap + unit.height : 0);
    const baseline = cy - lock / 2 + cap;
    const unitY = baseline + unitGap;
    const drum = createDrum(
      text.line.bind(text),
      odometer,
      displayStyle(numeralSize),
      frame.cx,
      baseline,
    );
    const messageY = cy - message.height / 2;

    const labelBounds = label ? offset(label.ink, x0, labelY) : null;
    const dateBounds = date ? offset(date.ink, x0, dateY) : null;
    const unitBounds = unit ? offset(unit.ink, cx - diameter * 0.31, unitY) : null;
    const messageX = cx - Math.max(diameter * 1.1, measure * 0.86) / 2;
    const messageRect = offset(message.ink, messageX, messageY);
    const numeralBounds: Rect = {
      x: cx - odometer.width(String(count)) / 2,
      y: baseline - cap,
      w: odometer.width(String(count)),
      h: cap,
    };
    let lockup: Rect = {
      x: cx - radius - stroke,
      y: cy - radius - stroke,
      w: diameter + 2 * stroke,
      h: diameter + 2 * stroke,
    };
    if (labelBounds) lockup = unionRect(lockup, labelBounds);
    if (dateBounds) lockup = unionRect(lockup, dateBounds);
    lockup = unionRect(lockup, messageRect);

    // --- schedule ----------------------------------------------------------------------------
    const e = energy.time;
    const roll = feel.roll;
    const rollCurve = ease[feel.curve];
    /** When the roll to the number shown after tick `j` (1..count) starts. */
    const rollStart = (j: number) => j - ANTICIPATION - roll / 2;
    const zero = count;
    const ringIn = ease[energy.id === 'calm' ? 'glide' : 'snap'];

    // Days mode: the reel spins two turns and lands on the count, the ring closing with it.
    const spinStart = 0.2 * e;
    const spinEnd = (DAYS_IN - 0.5) * e;
    const landed = spinEnd;
    const wheels = 10 ** digits;

    // --- burst (seeded) ----------------------------------------------------------------------
    const rng = ctx.rng('burst');
    const burst = Array.from({ length: feel.lines }, (_, i) => {
      const step = (Math.PI * 2) / feel.lines;
      return {
        angle: (i + 0.5) * step + rng.range(-0.35, 0.35) * step - Math.PI / 2,
        from: radius * rng.range(1.06, 1.12),
        length: radius * rng.range(0.32, 0.62),
        delay: rng.range(0, 0.06),
      };
    });

    // The message breathes: its tracking opens by 1.2% of its size through the hold.
    const glyphPivot = message.lines.map((line) => (line.glyphs.length - 1) / 2);
    const firstGlyph = message.lines.map((line) => line.glyphs[0]?.index ?? 0);
    const wordRise = new Float64Array(Math.max(1, message.wordCount));
    const motion: GlyphTransform = { dx: 0, dy: 0 };
    let tracking = 0;
    const animateGlyph = (glyph: Glyph, line: (typeof message.lines)[number]): GlyphTransform => {
      const k = glyph.index - (firstGlyph[line.index] ?? 0) - (glyphPivot[line.index] ?? 0);
      motion.dx = tracking * k;
      motion.dy = wordRise[glyph.word] ?? 0;
      return motion;
    };

    const drawRing = (g: Draw, head: number, front: number, alpha: number) => {
      if (!props.ring || head <= 0 || alpha <= 0) return;
      // The track: the whole ring, faint.
      g.circle(cx, cy, radius, {
        stroke: { color: withAlpha(fg, 0.14 * alpha), width: stroke, trim: [0, head] },
      });
      if (!live) {
        g.circle(cx, cy, radius, {
          stroke: { color: accent, width: stroke, trim: [0, head] },
          opacity: alpha,
        });
        return;
      }
      // One segment per second, emptying clockwise from 12 o'clock.
      const gapTurn = Math.min(0.012, 0.3 / count);
      for (let s = 0; s < count; s++) {
        const a = Math.max(s / count + gapTurn / 2, front);
        const b = Math.min((s + 1) / count - gapTurn / 2, head);
        if (b > a) {
          g.circle(cx, cy, radius, {
            stroke: { color: accent, width: stroke, trim: [a, b] },
            opacity: alpha,
          });
        }
      }
    };

    return {
      render: ({ t, g, tl }) => {
        // The last three seconds flash the background subtly (never with a transparent one).
        let flash = 0;
        let pulse = 1;
        if (live) {
          for (let n = 1; n <= 3; n++) {
            const j = count - n; // the tick that lands on `n`
            if (j < 1) continue;
            const since = t - j;
            if (since > -0.05 && since < 0.5) {
              flash = Math.max(flash, 1 - ease.drift(clamp01((since + 0.05) / 0.45)));
              pulse = Math.max(
                pulse,
                1 + feel.pulse * (1 - ease.glide(clamp01((since + 0.02) / 0.45))),
              );
            }
          }
        } else {
          const since = t - landed;
          if (since > -0.05 && since < 0.5) {
            flash = 1 - ease.drift(clamp01((since + 0.05) / 0.45));
            pulse = 1 + feel.pulse * (1 - ease.glide(clamp01((since + 0.02) / 0.45)));
          }
        }
        g.fill(flash > 0 ? mixOklab(bg, accent, feel.flash * flash) : bg, { background: true });

        const gone = ease.exit(tl.p(t, 'out', { dur: 0.4 }));
        g.movable('countdown', lockup, (g) => {
          // Label: fades in with the ring; in live mode it bows out at zero.
          if (label && labelBounds) {
            const shown = ease.glide(clamp01(t / 0.5));
            // Live: it bows out with the last tick, before the zero bursts.
            const out = live ? ease.swift(clamp01((t - zero + 0.2) / 0.3)) : gone;
            const opacity = shown * (1 - out);
            if (opacity > 0) {
              g.text(label, { fill: fg, x: x0, y: labelY + (1 - shown) * u, opacity });
              g.editable('label', labelBounds);
            }
          }

          if (live) {
            // Ring: draws on, then runs down continuously, one segment per second.
            const head = ringIn(clamp01(t / 0.6));
            const front = clamp01(t / count);
            const burstP = clamp01((t - zero) / 0.3);
            if (burstP < 1) {
              g.group({ scale: 1 + 0.08 * ease.glide(burstP), originX: cx, originY: cy }, (g) =>
                drawRing(g, head, front, 1 - burstP),
              );
            }

            // Numeral: rolls in, turns on every second, blows up at zero.
            let from = '';
            let to = String(count);
            let p = rollCurve(clamp01((t - 0.05) / roll));
            for (let j = 1; j <= count; j++) {
              if (t < rollStart(j)) break;
              from = String(count - j + 1);
              to = String(count - j);
              p = rollCurve(clamp01((t - rollStart(j)) / roll));
            }
            // The zero blows up and clears before the message rises in its place.
            const blow = clamp01((t - zero - 0.02) / 0.3);
            const opacity = 1 - ease.swift(clamp01((t - zero - 0.02) / 0.2));
            if (opacity > 0) {
              const scale = pulse * (1 + feel.blowUp * ease.glide(blow));
              g.group({ scale, originX: cx, originY: baseline - cap / 2, opacity }, (g) =>
                drum.draw(g, from, to, p, fg),
              );
              if (blow <= 0) g.editable('count', drum.bounds(p < 0.5 ? from || to : to || from));
            }
            for (const line of burst) {
              const q = (t - zero - 0.02 - line.delay) / 0.55;
              if (q <= 0 || q >= 1) continue;
              const headR = line.from + line.length * ease.glide(q);
              const tailR = line.from + line.length * ease.swift(clamp01((q - 0.2) / 0.8));
              if (headR - tailR < 0.2 * u) continue;
              const dx = Math.cos(line.angle);
              const dy = Math.sin(line.angle);
              g.line(cx + dx * tailR, cy + dy * tailR, cx + dx * headR, cy + dy * headR, {
                color: accent,
                width: stroke * 0.8,
                cap: 'round',
              });
            }

            // Message: rises in its line masks after zero, breathes, leaves up.
            const rise = (message.lines[0]?.mask.h ?? message.size) * 1.05;
            const breath = ease.drift(tl.sectionProgress(t, 'hold'));
            tracking = 0.012 * message.size * breath;
            message.lines.forEach((line, i) => {
              let shown = false;
              for (const word of line.words) {
                const w = word.index - (line.words[0]?.index ?? 0);
                const q = ease[energy.enter](
                  clamp01((t - zero - MESSAGE_AT - i * 0.08 - w * 0.03) / 0.6),
                );
                wordRise[word.index] = (1 - q) * rise;
                shown ||= q > 0;
              }
              if (!shown || gone >= 1) return;
              const mask = offset(line.mask, messageX, messageY);
              g.clip(mask, (g) =>
                g.text(line, {
                  fill: fg,
                  x: messageX,
                  y: messageY - gone * rise,
                  glyph: animateGlyph,
                }),
              );
            });
            if (t >= zero + MESSAGE_AT && gone < 1) g.editable('message', messageRect);
          } else {
            // Days: the reel spins two turns and lands on the count as the ring closes.
            const spun = ease.glide(clamp01((t - spinStart) / (spinEnd - spinStart)));
            const head = spun;
            const alpha = 1 - gone;
            if (alpha > 0) drawRing(g, head, 0, alpha);
            const value = (wheels * 3 + count - 20 * (1 - spun)) % wheels;
            const shown = clamp01((t - spinStart) / 0.25);
            const opacity = shown * (1 - gone);
            if (opacity > 0) {
              const breath = 1 + 0.02 * ease.drift(tl.sectionProgress(t, 'hold'));
              g.group(
                { scale: pulse * breath, originX: cx, originY: baseline - cap / 2, opacity },
                (g) =>
                  odometer.draw(g, counterWheels(value, { digits }), {
                    x: cx,
                    y: baseline,
                    fill: fg,
                    align: 'center',
                  }),
              );
              g.editable('count', numeralBounds);
            }
            if (unit && unitBounds) {
              const q = ease[energy.enter](clamp01((t - landed - 0.1) / 0.5));
              const opacity = q * (1 - gone);
              if (opacity > 0) {
                g.text(unit, {
                  fill: accent,
                  x: cx - diameter * 0.31,
                  y: unitY + (1 - q) * 1.5 * u,
                  opacity,
                });
                g.editable('unit', unitBounds);
              }
            }
          }

          // Date line: fades in at the reveal (zero, or when the reel lands).
          if (date && dateBounds) {
            const at = live ? zero + MESSAGE_AT + 0.3 : landed + 0.25;
            const q = ease.glide(clamp01((t - at) / 0.4));
            const opacity = q * (1 - gone);
            if (opacity > 0) {
              g.text(date, { fill: muted, x: x0, y: dateY + (1 - q) * u, opacity });
              g.editable('date', dateBounds);
            }
          }
        });
      },
    };
  },
});

function offset(r: Rect, x: number, y: number): Rect {
  return { x: r.x + x, y: r.y + y, w: r.w, h: r.h };
}
