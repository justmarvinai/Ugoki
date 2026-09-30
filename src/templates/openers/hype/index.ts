/**
 * Hype — fast-cut channel intro (docs/templates/07-openers.md §7.2).
 *
 * The expensive detail: it is edited to a beat. The BPM sets a grid of beats and half-beats;
 * words get a beat each (a half-beat when time is short), flashes fill the gaps, the lockup
 * lands on a beat 1.5 s from the end — and every cut is moved between frames (never inside a
 * frame's shutter at 60 and 30 fps, within 17 ms of its beat), so the new shot appears exactly
 * on its beat's frame, ready for music. Whip pans travel a whole frame on `snap` and are drawn
 * as a heavy directional smear (averaged copies along the motion), so they read as whips even
 * in a one-sample preview; the export's motion blur adds to it. Each shot has its own micro-move
 * (punch, marquee rows, split panels, stuttering letters, crash zooms, ring bursts, stripe
 * sweeps) and hits shake the camera with seeded simplex noise.
 */

import {
  type Color,
  c,
  clamp01,
  contrastRatio,
  createNoise,
  type Draw,
  defineTemplate,
  type EnergyId,
  ease,
  type Rect,
  type SpringName,
  type TextStyle,
} from '@/engine';
import { distinct, inksFor, paletteColors, schemes } from './colors';
import { createLockup } from './lockup';
import { beatCut, FIRST, parseWords, planShots, SHUTTER, TAIL } from './plan';
import {
  burst,
  type Feel,
  fill,
  type Kit,
  type Picture,
  porthole,
  repeat,
  type ShotSpec,
  type Stage,
  shapes,
  slam,
  split,
  stripes,
  stutter,
  zoom,
} from './shots';
import { smear } from './smear';

const IMAGE_KEYS = ['image1', 'image2', 'image3', 'image4', 'image5', 'image6'] as const;
/** Artworks that sit well in the Candy default, in slot order. */
const ARTWORKS = ['artwork-7', 'artwork-4', 'artwork-2', 'artwork-6', 'artwork-8', 'artwork-1'];

const image = (n: number) =>
  c.image({
    label: `Image ${n}`,
    accept: 'artwork',
    optional: true,
    default: { kind: 'placeholder', id: ARTWORKS[n - 1] ?? 'artwork-1' },
    ...(n > 4 ? { advanced: true } : {}),
  });

/**
 * Energy changes how shots land, not the edit (the BPM owns the cuts): Calm glides in without
 * tilt or shake and whips are long pushes; Balanced snaps from 1.22× with a ±2° tilt; Punchy
 * pops from 1.34× (overshooting), shakes harder and pulses on every beat of the lockup.
 */
const FEELS: Record<EnergyId, Feel & { spring: SpringName; pulse: number }> = {
  calm: {
    from: 1.08,
    dur: 0.24,
    curve: 'glide',
    tilt: 0,
    shake: 0,
    push: 0.025,
    whip: 0.15,
    travel: 0.6,
    spring: 'gentle',
    pulse: 0,
  },
  balanced: {
    from: 1.22,
    dur: 0.14,
    curve: 'snap',
    tilt: 2,
    shake: 0.9,
    push: 0.04,
    whip: 0.11,
    travel: 1,
    spring: 'snappy',
    pulse: 0.008,
  },
  punchy: {
    from: 1.34,
    dur: 0.13,
    curve: 'pop',
    tilt: 3,
    shake: 1.4,
    push: 0.05,
    whip: 0.085,
    travel: 1.35,
    spring: 'lively',
    pulse: 0.02,
  },
};

/** How far a whip's smear reaches: the distance travelled in this long (a 360° shutter at 30 fps). */
const SMEAR_TIME = 1 / 30;
/** Camera shake: noise frequency (Hz) and decay (seconds). */
const SHAKE_HZ = 30;
const SHAKE_DECAY = 0.07;

export default defineTemplate({
  id: 'hype',
  version: 1,
  meta: {
    name: 'Hype',
    tagline: 'Fast-cut channel intro',
    category: 'openers',
    tags: ['opener', 'intro', 'channel', 'fast cuts', 'beat', 'energetic'],
    useCases: ['YouTube intros', 'Sports edits', 'Event openers', 'Product teasers'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'sequence',
  duration: { default: 5, min: 3, max: 10 },
  alpha: 'none',
  poster: 4.45,
  shutter: SHUTTER,
  palettes: [
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'hazard' },
    { kind: 'library', id: 'bauhaus' },
  ],
  pairings: ['poster', 'sport', 'grotesk', 'wide', 'quirky'],
  controls: {
    words: c.text({
      label: 'Words',
      default: 'NEW\nVIDEO\nEVERY\nFRIDAY',
      maxLength: 80,
      multiline: true,
      maxLines: 8,
      hint: 'One per line — each line gets its own shot, on the beat',
    }),
    name: c.text({ label: 'Channel name', default: 'MAYA MAKES', maxLength: 24, primary: true }),
    logo: c.image({
      label: 'Logo',
      accept: 'logo',
      optional: true,
      default: { kind: 'placeholder', id: 'halden' },
    }),
    image1: image(1),
    image2: image(2),
    image3: image(3),
    image4: image(4),
    image5: image(5),
    image6: image(6),
    colors: c.choice({
      label: 'Colors',
      default: '4',
      options: [
        { value: '4', label: '4 colors' },
        { value: '3', label: '3 colors' },
      ],
      hint: 'How many palette colors the cuts swap between',
    }),
    bpm: c.number({
      label: 'BPM',
      group: 'motion',
      default: 120,
      min: 90,
      max: 150,
      step: 1,
      unit: 'bpm',
      hint: 'Cuts land on beats and half-beats',
    }),
    intensity: c.choice({
      label: 'Intensity',
      group: 'motion',
      default: 'clean',
      options: [
        { value: 'clean', label: 'Clean' },
        { value: 'wild', label: 'Wild' },
      ],
      hint: 'Wild cuts on half-beats, whips more and swaps colors mid-word',
    }),
  },
  looks: [
    { id: 'candy', name: 'Candy', palette: { kind: 'library', id: 'candy' }, pairing: 'poster' },
    { id: 'acid', name: 'Acid', palette: { kind: 'library', id: 'acid' }, pairing: 'sport' },
    {
      id: 'ink',
      name: 'Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'poster',
      values: { intensity: 'wild' },
    },
  ],
  // The edit is absolute (the BPM owns it): the whole sequence is the hold.
  timing: () => ({ lead: FIRST, in: 0, out: 0, tail: TAIL }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const wild = props.intensity === 'wild';
    const base = FEELS[energy.id];
    const feel: Feel = {
      ...base,
      tilt: base.tilt * (wild ? 1.4 : 0.8),
      shake: base.shake * (wild ? 1.5 : 0.7),
    };
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    // Type is centered on the frame's axis, even where the social zone isn't symmetric.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const display = pairing.display;
    const style: TextStyle = {
      font: display.font,
      italicFont: display.italic,
      size: 100,
      weight: display.weight,
      width: display.width,
      tracking: display.tracking + 0.01,
      features: display.features,
      case: 'upper',
    };
    const capRatio = text.line('H', style).capHeight / 100;
    const kit: Kit = {
      frame,
      area,
      cy: area.y + area.h * 0.5,
      width: half * 2 * 0.96,
      text,
      style,
      capRatio,
      feel,
    };

    // --- images, the plan and its colors ------------------------------------------------------
    const pictures: Picture[] = [];
    for (const key of IMAGE_KEYS) {
      const graphic = ctx.graphic(key);
      if (graphic) pictures.push({ graphic, focal: ctx.focal(key), key });
    }
    const plan = planShots({
      words: parseWords(props.words),
      images: pictures.length,
      duration: timeline.duration,
      bpm: props.bpm,
      wild,
      rng: ctx.rng('plan'),
    });
    const { roles } = palette;
    const home = roles.bg;
    const pool = paletteColors(roles);
    const swatches = pool.slice(0, Math.max(2, props.colors === '3' ? 3 : 4));
    const shotSchemes = schemes(plan.shots.length, swatches, pool, home, ctx.rng('colors'));

    // --- shots ----------------------------------------------------------------------------------
    const seeded = ctx.rng('shots');
    const vertical = frame.vertical;
    const stages: Stage[] = plan.shots.map((shot, i) => {
      const scheme = shotSchemes[i] ?? { bg: home, ink: roles.fg, alt: roles.accent };
      const spec: ShotSpec = {
        card: shot.card,
        scheme,
        // Wild's color swap is a cut too: on the next half-beat, between frames.
        flipAt: shot.flip ? beatCut((shot.at + 1) * plan.half) - shot.start : null,
        whipped: shot.whip,
        tilt: seeded.range(-1, 1),
        dir: seeded.sign(),
        len: shot.end - shot.start,
        picture: pictures[shot.image] ?? null,
      };
      const key = spec.picture?.key ?? 'image1';
      switch (shot.kind) {
        case 'slam':
          return slam(kit, spec);
        case 'repeat':
          return repeat(kit, spec);
        case 'split':
          return split(kit, spec);
        case 'fill':
          return fill(kit, spec);
        case 'type':
          return stutter(kit, spec);
        case 'zoom':
          return zoom(kit, spec, key);
        case 'frame':
          return porthole(kit, spec, key);
        case 'burst':
          return burst(kit, spec);
        case 'shapes':
          return shapes(kit, spec);
        default:
          return stripes(kit, spec);
      }
    });
    const starts = plan.shots.map((shot) => shot.start);
    // Whips: half-window, axis and direction (vertical formats may whip up or down).
    const whips = plan.shots.map((shot, i) => {
      const before = plan.shots[i - 1];
      if (!shot.whip || !before) return null;
      const w = Math.min(
        feel.whip,
        0.4 * (shot.end - shot.start),
        0.4 * (shot.start - before.start),
      );
      const alongY = vertical && seeded.chance(0.5);
      const sign = seeded.sign();
      return { w, dx: alongY ? 0 : sign, dy: alongY ? sign : 0 };
    });

    // --- lockup ---------------------------------------------------------------------------------
    // The name in the palette's ink; a disc of another palette color pops behind it (the name
    // takes the disc's own ink where it crosses it), the logo on the disc, rings off its edge.
    const legible = (bg: Color) => inksFor(bg, [roles.fg, ...pool]);
    const nameInk = legible(home)[0] ?? roles.fg;
    const discColor =
      [roles.accent2, roles.accent, roles.accent3].find(
        (color) => distinct(color, home) && distinct(color, roles.fg),
      ) ?? (distinct(roles.fg, home) ? roles.fg : roles.accent);
    const onDisc = legible(discColor);
    const nameOnDisc = onDisc.includes(nameInk) ? nameInk : (onDisc[0] ?? nameInk);
    const logoColor =
      [roles.accent, roles.fg, roles.bg, roles.accent2, roles.accent3].find(
        (color) => contrastRatio(color, discColor) >= 3,
      ) ?? nameOnDisc;
    const ringA =
      [roles.accent, roles.accent2, roles.fg, roles.accent3].find(
        (color) =>
          distinct(color, home) && distinct(color, discColor) && contrastRatio(color, home) >= 1.6,
      ) ?? nameInk;
    const lockLen = plan.clear - plan.lockup;
    const lockup = createLockup(kit, {
      name: props.name.trim(),
      logo: ctx.graphic('logo'),
      colors: {
        bg: home,
        name: nameInk,
        nameOnDisc,
        logo: logoColor,
        disc: discColor,
        ring: ringA,
        ring2: discColor,
      },
      pop: plan.half,
      spring: base.spring,
      tilt: seeded.range(-1, 1),
      len: lockLen,
    });

    // --- camera shake ---------------------------------------------------------------------------
    const noise = createNoise(ctx.rng('shake'));
    const amplitude = feel.shake * u;
    const shake = { x: 0, y: 0 };
    const shakeAt = (t: number, since: number) => {
      shake.x = 0;
      shake.y = 0;
      if (amplitude <= 0 || since < 0 || since > 5 * SHAKE_DECAY) return;
      const a = amplitude * Math.exp(-since / SHAKE_DECAY);
      shake.x = a * noise.noise2(t * SHAKE_HZ, 0.5);
      shake.y = a * noise.noise2(t * SHAKE_HZ, 40.5);
    };

    const whole: Rect = { x: 0, y: 0, w: frame.width, h: frame.height };
    const shotAt = (t: number): number => {
      let lo = 0;
      let hi = starts.length - 1;
      if (hi < 0 || t < (starts[0] ?? 0)) return -1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((starts[mid] ?? 0) <= t) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    /** Slope of `snap` at x (numerical), for the whip's speed. */
    const snapSlope = (x: number) => {
      const e = 1e-3;
      return (ease.snap(Math.min(1, x + e)) - ease.snap(Math.max(0, x - e))) / (2 * e);
    };

    const drawShot = (g: Draw, i: number, t: number) => {
      const stage = stages[i];
      const shot = plan.shots[i];
      if (!stage || !shot) return;
      stage.draw(g, t - shot.start);
    };

    /** A whip pan from shot i − 1 to shot i around shot i's cut. */
    const drawWhip = (g: Draw, i: number, t: number, w: number, dx: number, dy: number) => {
      const cut = starts[i] ?? 0;
      const x = clamp01((t - (cut - w)) / (2 * w));
      const p = ease.snap(x);
      const dist = dx !== 0 ? frame.width : frame.height;
      const speed = (dist * snapSlope(x)) / (2 * w);
      const length = Math.min(0.45 * dist, speed * SMEAR_TIME);
      // The two shots sit side by side on a strip moving along (dx, dy); each is cut to its own
      // frame, and the strip's outer ends reach past the smear so no copy uncovers an edge.
      const sign = dx + dy;
      const reach = length / 2 + u;
      const onAxis = (start: number, before: number, after: number): Rect =>
        dx !== 0
          ? { x: start - before, y: 0, w: dist + before + after, h: frame.height }
          : { x: 0, y: start - before, w: frame.width, h: dist + before + after };
      const a = -p * dist * sign;
      const b = (1 - p) * dist * sign;
      const trailing = sign > 0 ? [reach, 0] : [0, reach];
      const leading = sign > 0 ? [0, reach] : [reach, 0];
      const clipA = onAxis(a, trailing[0] ?? 0, trailing[1] ?? 0);
      const clipB = onAxis(b, leading[0] ?? 0, leading[1] ?? 0);
      smear(g, length, dx, dy, 6 * u, whole, (g) => {
        g.clip(clipA, (g) =>
          g.group({ x: dx !== 0 ? a : 0, y: dy !== 0 ? a : 0 }, (g) => drawShot(g, i - 1, t)),
        );
        g.clip(clipB, (g) =>
          g.group({ x: dx !== 0 ? b : 0, y: dy !== 0 ? b : 0 }, (g) => drawShot(g, i, t)),
        );
      });
    };

    return {
      render: ({ t, g }) => {
        // Clean edit points: the background alone before the first cut and after the last.
        if (t < FIRST || t >= plan.clear) {
          g.fill(home);
          return;
        }

        if (t >= plan.lockup) {
          g.fill(home);
          const local = t - plan.lockup;
          // Two hits: the name slams on the cut, the logo pops on the next half-beat.
          shakeAt(t, local >= plan.half && lockup.logo ? local - plan.half : local);
          // Punchy (and a touch of Balanced) pulses on every beat once the shockwave is out.
          let pulse = 0;
          if (base.pulse > 0 && local > plan.half + 0.3) {
            const phase = local % plan.beat;
            pulse = base.pulse * (1 - ease.glide(clamp01(phase / 0.3)));
          }
          g.movable('lockup', lockup.bounds, (g) => {
            g.group({ x: shake.x, y: shake.y }, (g) => lockup.draw(g, local, pulse));
            g.editable('name', lockup.name.bounds);
            if (lockup.logo) g.editable('logo', lockup.logo);
          });
          return;
        }

        const i = shotAt(t);
        if (i < 0) {
          g.fill(home);
          return;
        }
        const next = whips[i + 1];
        const nextStart = starts[i + 1];
        if (next && nextStart !== undefined && t >= nextStart - next.w) {
          drawWhip(g, i + 1, t, next.w, next.dx, next.dy);
          return;
        }
        const own = whips[i];
        const start = starts[i] ?? 0;
        if (own && t < start + own.w) {
          drawWhip(g, i, t, own.w, own.dx, own.dy);
          return;
        }
        const stage = stages[i];
        if (!stage) {
          g.fill(home);
          return;
        }
        shakeAt(t, stage.hit && !own ? t - start : -1);
        // Shots fill the whole frame whatever the offset, so a shaken frame never shows edges.
        if (shake.x !== 0 || shake.y !== 0) {
          g.group({ x: shake.x, y: shake.y }, (g) => drawShot(g, i, t));
        } else {
          drawShot(g, i, t);
        }
        if (stage.region) g.editable(stage.region.key, stage.region.bounds);
      },
    };
  },
});
