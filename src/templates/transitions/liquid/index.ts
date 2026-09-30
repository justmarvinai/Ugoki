/**
 * Liquid — organic wipe (docs/templates/08-transitions.md §8.3).
 *
 * The expensive detail: the edge is alive. Each layer's edge is a wave whose phase and shape
 * are displaced by seeded simplex noise that evolves in time — never a static wave — sampled
 * across the frame and joined by a Catmull-Rom spline, so it stays smooth at any resolution.
 * Droplets detach from the crests of the leading edge on ballistic arcs (air drag and one
 * gravity that always points down, whatever the direction), and as the liquid recedes it
 * leaves drips behind that fall and fade.
 */

import {
  adjustLightness,
  CLEAN_END,
  type Color,
  c,
  contrastRatio,
  createNoise,
  type Draw,
  defineTemplate,
  type EaseName,
  ease,
  type Palette,
  type PathCommand,
  type Rect,
} from '@/engine';
import { huePartner, toLch } from './hue';

/** Half of the full-coverage plateau around the cut, in seconds (motion language §10). */
const PLATEAU = 0.03;

const DIRECTIONS = {
  right: [1, 0],
  left: [-1, 0],
  down: [0, 1],
  up: [0, -1],
  'down-right': [Math.SQRT1_2, Math.SQRT1_2],
  'down-left': [-Math.SQRT1_2, Math.SQRT1_2],
  'up-right': [Math.SQRT1_2, -Math.SQRT1_2],
  'up-left': [-Math.SQRT1_2, -Math.SQRT1_2],
} as const;

/** Edge displacement (u) and the length of one wave along the edge (u), by Wobble. */
const WOBBLE = {
  low: { amp: 4, wavelength: 62 },
  medium: { amp: 7.5, wavelength: 50 },
  high: { amp: 12, wavelength: 40 },
} as const;

type Feel = {
  curve: EaseName;
  /** Wobble amplitude factor. */
  amp: number;
  /** How fast the edge evolves (noise time scale). */
  flow: number;
  /** Droplets flung ahead of each leading edge, and drips left by each trailing edge. */
  spray: number;
  drips: number;
  /** How hard droplets are flung ahead of the edge. */
  fling: number;
};

/**
 * Calm is one lazy pour (sine in-out, slow edges, a few drips, no spray); Balanced surges in and
 * settles, then drains away; Punchy whooshes through (snap), its edges churn and it splashes.
 */
const FEEL: Record<'calm' | 'balanced' | 'punchy', Feel> = {
  calm: { curve: 'drift', amp: 0.85, flow: 0.6, spray: 0, drips: 4, fling: 0.8 },
  balanced: { curve: 'swift', amp: 1, flow: 1, spray: 5, drips: 6, fling: 1 },
  punchy: { curve: 'snap', amp: 1.15, flow: 1.5, spray: 8, drips: 8, fling: 1.25 },
};

/** Gravity in u/s²: a drop falls the frame's short side in ≈ 0.7 s from rest. */
const GRAVITY = 400;
/**
 * Air drag time constant (s) of the fling a drop leaves with: fast drops lose their speed
 * quickly (drag grows with speed), while the slow fall that follows is left to gravity.
 */
const DRAG = 0.24;

const distinct = (a: Color, b: Color) =>
  contrastRatio(a, b) >= 1.3 || Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.3;

type ColorMode = 'duo' | 'accent' | 'contrast' | 'tonal';

/**
 * The two liquids, back (leading band) and front (the cut frame). The front is the palette's
 * signature color — its background, or the brand color; the back is its partner: a second hue
 * at the same lightness (Blush → Lilac), the accent, the foreground, or a deeper tone.
 */
function liquidColors(palette: Palette, mode: ColorMode): [back: Color, front: Color] {
  const { roles } = palette;
  const brand = palette.id.startsWith('brand-');
  const front = brand ? (palette.id === 'brand-bold' ? roles.bg : roles.accent) : roles.bg;
  const lch = toLch(front);
  const tonal = adjustLightness(front, lch.L > 0.6 ? -0.16 : 0.14);
  const accent = [roles.accent, roles.accent2, roles.fg].find((color) => distinct(color, front));
  let back: Color;
  switch (mode) {
    case 'duo':
      // Pale and mid colors get a partner hue; near-neutral or very dark ones read better
      // with their accent (a partner hue of black is still black).
      back =
        !brand && lch.C >= 0.02 && lch.L >= 0.4
          ? huePartner(front, -100, 0.06)
          : brand
            ? adjustLightness(front, lch.L > 0.6 ? -0.18 : 0.2)
            : (accent ?? tonal);
      break;
    case 'accent':
      back = accent ?? tonal;
      break;
    case 'contrast':
      back = distinct(roles.fg, front) ? roles.fg : (accent ?? tonal);
      break;
    default:
      back = tonal;
  }
  return [back, front];
}

type Drop = {
  layer: 0 | 1;
  /** Emission time and lifetime (s). */
  born: number;
  life: number;
  /** Emission point, velocity (units, units/s) and radius (units). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Across-edge position it detached from (for the neck) and whether it leads the edge. */
  p: number;
  ahead: boolean;
};

export default defineTemplate({
  id: 'liquid',
  version: 1,
  meta: {
    name: 'Liquid',
    tagline: 'Organic wipe',
    category: 'transitions',
    tags: ['transition', 'liquid', 'organic', 'wipe', 'overlay'],
    useCases: ['Lifestyle', 'Beauty', 'Food', 'Music videos'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'transition',
  duration: { default: 1.4, min: 0.8, max: 2.4 },
  alpha: 'default',
  poster: 0.28,
  palettes: [
    { kind: 'library', id: 'blush' },
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'forest' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'sand' },
  ],
  pairings: ['grotesk'],
  controls: {
    colors: c.choice({
      label: 'Colors',
      default: 'duo',
      display: 'select',
      options: [
        { value: 'duo', label: 'Two hues' },
        { value: 'accent', label: 'Accent' },
        { value: 'contrast', label: 'Contrast' },
        { value: 'tonal', label: 'Tone on tone' },
      ],
      hint: 'The leading liquid: a second hue, the accent, the foreground or a deeper tone',
    }),
    wobble: c.choice({
      label: 'Wobble',
      default: 'medium',
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
    }),
    droplets: c.toggle({ label: 'Droplets', default: true }),
    direction: c.choice({
      label: 'Direction',
      group: 'motion',
      default: 'right',
      display: 'select',
      options: [
        { value: 'right', label: '→ Right' },
        { value: 'left', label: '← Left' },
        { value: 'up', label: '↑ Up' },
        { value: 'down', label: '↓ Down' },
        { value: 'up-right', label: '↗ Up right' },
        { value: 'down-right', label: '↘ Down right' },
        { value: 'down-left', label: '↙ Down left' },
        { value: 'up-left', label: '↖ Up left' },
      ],
    }),
    speed: c.number({
      label: 'Speed',
      default: 1,
      min: 1,
      max: 2,
      step: 0.25,
      unit: '×',
      hint: 'Compresses the transition around the cut point',
    }),
  },
  looks: [
    {
      id: 'blush-lilac',
      name: 'Blush/Lilac',
      palette: { kind: 'library', id: 'blush' },
      pairing: 'grotesk',
      values: { colors: 'duo' },
    },
    {
      id: 'forest-mint',
      name: 'Forest/Mint',
      palette: { kind: 'library', id: 'forest' },
      pairing: 'grotesk',
      values: { colors: 'contrast' },
    },
    {
      id: 'ink-graphite',
      name: 'Ink/Graphite',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'grotesk',
      values: { colors: 'tonal' },
    },
  ],
  timing: () => ({ in: 0, out: 0, cut: 0.5, tail: CLEAN_END }),
  build: (ctx) => {
    const { frame, props, palette, energy, timeline } = ctx;
    const { width, height, u } = frame;
    const cut = timeline.cut ?? timeline.duration / 2;
    const feel = FEEL[energy.id];
    const colors = liquidColors(palette, props.colors);

    // --- geometry: s along the direction of travel, p across it -----------------------------
    const [dx, dy] = DIRECTIONS[props.direction];
    const nx = -dy;
    const ny = dx;
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ] as const;
    const along = corners.map(([x, y]) => x * dx + y * dy);
    const across = corners.map(([x, y]) => x * nx + y * ny);
    const sMin = Math.min(...along);
    const sMax = Math.max(...along);
    const pMin = Math.min(...across);
    const pMax = Math.max(...across);
    const wobble = WOBBLE[props.wobble];
    const amp = wobble.amp * feel.amp * u;
    const wavelength = wobble.wavelength * u;
    const margin = 1.5 * u;
    // The edge's mean line runs from wholly before the frame to wholly past it.
    const sFrom = sMin - amp - margin;
    const sTo = sMax + amp + margin;
    const travel = sTo - sFrom;
    // Region closers, well outside the frame.
    const sBack = sFrom - amp - 4 * u;
    const sFront = sTo + amp + 4 * u;
    // Edge samples across the frame (plus a bleed), ~4u apart: smooth after the spline.
    const p0 = pMin - 4 * u;
    const p1 = pMax + 4 * u;
    const samples = Math.max(16, Math.min(72, Math.ceil((p1 - p0) / (4 * u))));
    const step = (p1 - p0) / samples;

    // --- the living edge ----------------------------------------------------------------
    const noise = createNoise(ctx.rng('edge'));
    const shape = ctx.rng('layers');
    const phases = [shape.range(0, Math.PI * 2), shape.range(0, Math.PI * 2)];
    const depths = [shape.range(0, 50), shape.range(60, 110)];
    const drifts = [shape.range(0.8, 1.2), -shape.range(0.8, 1.2)];
    // The two liquids have their own rhythm: the leading one in longer, lazier waves.
    const lengths = [wavelength * 1.3, wavelength];
    /**
     * Edge displacement of a layer at an across position and time, in [-1, 1]: a wave whose
     * phase is warped by slow noise, plus finer detail, both evolving in time; its crests are
     * rounded and its troughs pinched (surface tension), and the lobes vary in size along the
     * edge. `lead` rounds the crests that point in the direction of travel (the liquid's
     * front); a trailing edge rounds the other side (the liquid's tail).
     */
    const offset = (layer: 0 | 1, p: number, t: number, lead: boolean): number => {
      const k = p / (lengths[layer] ?? wavelength);
      const z = depths[layer] ?? 0;
      const tt = t * feel.flow;
      const warp = noise.noise3(k * 0.5, tt * 0.5, z) * 1.9;
      const wave = Math.sin(
        Math.PI * 2 * k + warp + tt * 2.4 * (drifts[layer] ?? 1) + (phases[layer] ?? 0),
      );
      const raw = 0.72 * wave + 0.28 * noise.noise3(k * 1.8, tt * 0.9, z + 17.3);
      // Round crests, pinched troughs: x ↦ 1 − (1 − x)^1.7 on the wave's 0..1 range.
      const x = Math.min(1, Math.max(0, ((lead ? raw : -raw) + 1) / 2));
      const lobe = (1 - (1 - x) ** 1.7) * 2 - 1;
      const size = 0.74 + 0.26 * noise.noise3(k * 0.3, tt * 0.3, z + 41.7);
      const v = (lead ? lobe : -lobe) * size;
      return v < -1 ? -1 : v > 1 ? 1 : v;
    };

    // --- timing: everything compresses around the cut with Speed ---------------------------
    const speed = props.speed;
    const inSpan = cut / speed;
    const outSpan = (timeline.sections.out.end - cut) / speed;
    const gap = (0.08 * energy.stagger) / speed;
    const gapIn = Math.min(gap, (inSpan - PLATEAU) * 0.3);
    const gapOut = Math.min(gap, (outSpan - PLATEAU) * 0.3);
    const moveIn = inSpan - PLATEAU - gapIn;
    const moveOut = outSpan - PLATEAU - gapOut;
    const inStart = cut - inSpan;
    // Back leads by a gap on the way in; the front leaves first on the way out.
    const enterAt = [inStart, inStart + gapIn];
    const leaveAt = [cut + PLATEAU + gapOut, cut + PLATEAU];
    const curve = ease[feel.curve];
    const progress = (t: number, start: number, dur: number) =>
      curve(Math.min(1, Math.max(0, (t - start) / dur)));
    /** Mean line of a layer's edge: its leading edge before the cut, trailing edge after. */
    const baseAt = (layer: 0 | 1, t: number) =>
      t < cut
        ? sFrom + travel * progress(t, enterAt[layer] ?? 0, moveIn)
        : sFrom + travel * progress(t, leaveAt[layer] ?? 0, moveOut);

    // --- droplets: flung from the leading crests, dripping from the trailing tails --------
    const drops: Drop[] = [];
    if (props.droplets) {
      const rng = ctx.rng('drops');
      const perLayerIn = feel.spray;
      const perLayerOut = feel.drips;
      const velocity = (layer: 0 | 1, t: number) =>
        (baseAt(layer, t + 0.004) - baseAt(layer, t - 0.004)) / 0.008;
      const emit = (layer: 0 | 1, born: number, ahead: boolean) => {
        // Crests shed spray ahead of the liquid; its tails are where drips are left behind.
        let p = 0;
        let best = ahead ? -2 : 2;
        for (let k = 0; k < 6; k++) {
          const candidate = pMin + (pMax - pMin) * rng.range(0.04, 0.96);
          const o = offset(layer, candidate, born, ahead);
          if (ahead ? o > best : o < best) {
            best = o;
            p = candidate;
          }
        }
        // Mostly small drops, a few big ones.
        const size = rng.next() ** 2;
        const r = (ahead ? 1.3 + 2.2 * size : 1.2 + 1.8 * size) * u;
        const s = baseAt(layer, born) + amp * best + (ahead ? -0.3 : 0.3) * r;
        const v = velocity(layer, born);
        const along = ahead ? v * rng.range(1.12, 1.5) * feel.fling : v * rng.range(0.04, 0.18);
        const side = v * rng.range(-0.12, 0.12);
        // Spray from a sideways sweep is thrown slightly upwards before gravity takes over.
        const lift = ahead ? Math.abs(dx) * Math.abs(v) * rng.range(0.04, 0.16) : 0;
        drops.push({
          layer,
          born,
          life: ahead ? rng.range(0.2, 0.34) : rng.range(0.36, 0.6),
          x: s * dx + p * nx,
          y: s * dy + p * ny,
          vx: along * dx + side * nx,
          vy: along * dy + side * ny - lift,
          r,
          p,
          ahead,
        });
      };
      for (const layer of [0, 1] as const) {
        for (let i = 0; i < perLayerIn; i++) {
          emit(layer, (enterAt[layer] ?? 0) + moveIn * rng.range(0.34, 0.7), true);
        }
        for (let i = 0; i < perLayerOut; i++) {
          emit(layer, (leaveAt[layer] ?? 0) + moveOut * rng.range(0.12, 0.6), false);
        }
      }
      // Spray lives until its layer covers the frame; drips are gone before the last frame.
      const coveredAt = [enterAt[0]! + moveIn, enterAt[1]! + moveIn];
      const gone = cut + outSpan - 0.02;
      for (const drop of drops) {
        const limit = drop.ahead ? (coveredAt[drop.layer] ?? cut) : gone;
        drop.life = Math.max(0, Math.min(drop.life, limit - drop.born));
      }
    }

    // --- drawing ------------------------------------------------------------------------
    const xs = new Float64Array(samples + 1);
    const ys = new Float64Array(samples + 1);
    const bleed: Rect = { x: -2 * u, y: -2 * u, w: width + 4 * u, h: height + 4 * u };
    const point = (s: number, p: number): [number, number] => [s * dx + p * nx, s * dy + p * ny];

    /** The liquid behind (entering) or ahead of (leaving) the layer's edge at time t. */
    const region = (layer: 0 | 1, base: number, t: number, entering: boolean): PathCommand[] => {
      for (let i = 0; i <= samples; i++) {
        const p = p0 + i * step;
        const s = base + amp * offset(layer, p, t, entering);
        xs[i] = s * dx + p * nx;
        ys[i] = s * dy + p * ny;
      }
      const path: PathCommand[] = [['M', xs[0]!, ys[0]!]];
      // Catmull-Rom through the samples, as cubic Béziers: smooth, no corners, no jaggies.
      for (let i = 0; i < samples; i++) {
        const a = Math.max(0, i - 1);
        const d = Math.min(samples, i + 2);
        path.push([
          'C',
          xs[i]! + (xs[i + 1]! - xs[a]!) / 6,
          ys[i]! + (ys[i + 1]! - ys[a]!) / 6,
          xs[i + 1]! - (xs[d]! - xs[i]!) / 6,
          ys[i + 1]! - (ys[d]! - ys[i]!) / 6,
          xs[i + 1]!,
          ys[i + 1]!,
        ]);
      }
      const far = entering ? sBack : sFront;
      path.push(['L', ...point(far, p1)], ['L', ...point(far, p0)], ['Z']);
      return path;
    };

    const drawDrops = (g: Draw, layer: 0 | 1, t: number, color: Color) => {
      for (const drop of drops) {
        if (drop.layer !== layer) continue;
        const tau = t - drop.born;
        if (tau <= 0 || tau >= drop.life) continue;
        const e = 1 - Math.exp(-tau / DRAG);
        const x = drop.x + drop.vx * DRAG * e;
        const y = drop.y + drop.vy * DRAG * e + 0.5 * GRAVITY * u * tau * tau;
        const left = drop.life - tau;
        let r = drop.r;
        let opacity = 1;
        if (drop.ahead) {
          // Pinches off the crest, then thins away as the liquid swallows it or it flies off.
          r *= Math.min(1, 0.55 + tau / 0.05) * Math.min(1, left / 0.08);
        } else {
          const fade = Math.min(1, Math.max(0, 1 - left / (drop.life * 0.55)));
          r *= 1 - 0.4 * fade;
          opacity = 1 - fade;
        }
        if (r <= 0.05 * u || opacity <= 0.01) continue;
        // The neck: a drop is still tied to the liquid it left until it's a few radii away.
        if (tau < 0.12) {
          const s = baseAt(layer, t) + amp * offset(layer, drop.p, t, drop.ahead);
          const [ex, ey] = point(s, drop.p);
          const reach = Math.hypot(ex - x, ey - y) / (3.2 * r);
          if (reach < 1) {
            g.line(x, y, ex, ey, { color, width: 1.5 * r * (1 - reach) ** 0.7, cap: 'round' });
          }
        }
        // Stretched along its flight, volume kept: round at rest, a teardrop at speed.
        const decay = 1 - e;
        const vx = drop.vx * decay;
        const vy = drop.vy * decay + GRAVITY * u * tau;
        const stretch = 1 + 0.45 * Math.min(1, Math.hypot(vx, vy) / (140 * u));
        g.group(
          {
            x,
            y,
            rotate: (Math.atan2(vy, vx) * 180) / Math.PI,
            scaleX: stretch,
            scaleY: 1 / Math.sqrt(stretch),
          },
          (g) => g.circle(0, 0, r, { fill: color, opacity }),
        );
      }
    };

    return {
      // An overlay: no background of its own, ever (opaque exports bake Scene A/B underneath).
      render: ({ t, g }) => {
        const entering = t < cut;
        for (const layer of [0, 1] as const) {
          const color = colors[layer];
          const start = entering ? enterAt[layer]! : leaveAt[layer]!;
          const q = progress(t, start, entering ? moveIn : moveOut);
          if (entering ? q > 0 : q < 1) {
            const full = entering ? q >= 1 : q <= 0;
            if (full) g.rect(bleed, { fill: color });
            else g.path(region(layer, sFrom + travel * q, t, entering), { fill: color });
          }
          drawDrops(g, layer, t, color);
        }
      },
    };
  },
});
