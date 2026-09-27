/**
 * Iris — circle burst (docs/templates/08-transitions.md §8.2).
 *
 * The expensive detail: the final radius is solved for the frame corner farthest from the
 * origin, so coverage is exact wherever the origin sits — never early, never late — and every
 * radius is eased by *area* (r ∝ √area), so coverage grows at a perceptually steady rate. After
 * the cut, holes open from the same origin, top ring first (a doughnut reveal whose colored
 * bands mirror the entrance), or the rings collapse back into it.
 */

import {
  adjustLightness,
  CLEAN_END,
  type Color,
  c,
  contrastRatio,
  defineTemplate,
  type EaseName,
  ease,
  type Palette,
  type PaletteRole,
  type PathData,
  type Rect,
} from '@/engine';

/** Half of the full-coverage plateau around the cut, in seconds (motion language §10). */
const PLATEAU = 0.03;

/** Roles tried for the rings below the top one, in order. */
const ROLES: readonly PaletteRole[] = ['accent2', 'accent', 'accent3', 'fg', 'muted', 'surface'];

/** Two colors read as different rings: enough contrast, or clearly apart in hue. */
const distinct = (a: Color, b: Color) =>
  contrastRatio(a, b) >= 1.25 || Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.35;

/**
 * Ring colors, first (outermost band) to last. The last ring — the one that covers the frame
 * at the cut — is the palette's background, its signature color; the rings before it take its
 * other distinct roles. Brand palettes use tints of the brand color with the brand on top.
 */
function ringColors(palette: Palette, count: number): Color[] {
  const { roles } = palette;
  if (palette.id.startsWith('brand-')) {
    const brand = palette.id === 'brand-bold' ? roles.bg : roles.accent;
    const tints = [
      adjustLightness(brand, 0.3),
      adjustLightness(brand, -0.16),
      adjustLightness(brand, 0.16),
    ];
    return [...tints.slice(0, count - 1), brand];
  }
  const hero = roles.bg;
  const others: Color[] = [];
  for (const role of ROLES) {
    const color = roles[role];
    if (distinct(color, hero) && others.every((other) => distinct(other, color))) {
      others.push(color);
    }
  }
  // Palettes with too few distinct roles fill up with tints of the background.
  for (let i = 0; others.length < count - 1; i++) {
    others.push(adjustLightness(hero, palette.dark ? 0.14 * (i + 1) : -0.14 * (i + 1)));
  }
  return [...others.slice(0, count - 1), hero];
}

/** A circle as four cubic arcs (radial error < 0.03%), for even-odd holes. */
const KAPPA = 0.5522847498;
function circle(cx: number, cy: number, r: number): PathData {
  const k = r * KAPPA;
  return [
    ['M', cx + r, cy],
    ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ['Z'],
  ];
}

export default defineTemplate({
  id: 'iris',
  version: 1,
  meta: {
    name: 'Iris',
    tagline: 'Circle burst',
    category: 'transitions',
    tags: ['transition', 'circle', 'iris', 'reveal', 'overlay'],
    useCases: ['Reveals', 'Playful edits', 'Kids & education', 'Portal moments'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'transition',
  duration: { default: 1.2, min: 0.6, max: 2.4 },
  alpha: 'default',
  poster: 0.2,
  palettes: [
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'midnight' },
  ],
  pairings: ['grotesk'],
  controls: {
    rings: c.number({ label: 'Rings', group: 'style', default: 4, min: 3, max: 5, step: 1 }),
    colors: c.number({ label: 'Colors', group: 'style', default: 4, min: 2, max: 4, step: 1 }),
    style: c.choice({
      label: 'Style',
      default: 'ring',
      options: [
        { value: 'ring', label: 'Ring' },
        { value: 'fill', label: 'Fill' },
      ],
      hint: 'Ring: a hole opens from the origin · Fill: the rings collapse back into it',
    }),
    originX: c.number({
      label: 'Origin X',
      group: 'layout',
      default: 50,
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
    }),
    originY: c.number({
      label: 'Origin Y',
      group: 'layout',
      default: 50,
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
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
    { id: 'candy', name: 'Candy', palette: { kind: 'library', id: 'candy' }, pairing: 'grotesk' },
    {
      id: 'ink-paper',
      name: 'Ink/Paper',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'grotesk',
      values: { colors: 2 },
    },
    {
      id: 'tangerine',
      name: 'Tangerine',
      palette: { kind: 'library', id: 'tangerine' },
      pairing: 'grotesk',
      values: { rings: 3, colors: 3 },
    },
  ],
  timing: () => ({ in: 0, out: 0, cut: 0.5, tail: CLEAN_END }),
  build: (ctx) => {
    const { frame, props, palette, energy, timeline } = ctx;
    const { width, height, u } = frame;
    const cut = timeline.cut ?? timeline.duration / 2;
    const n = Math.round(props.rings);
    const colors = ringColors(palette, Math.min(Math.round(props.colors), n));
    // Colors cycle so that the last ring always gets the cut color.
    const fills = Array.from(
      { length: n },
      (_, i) =>
        colors[(((colors.length - n + i) % colors.length) + colors.length) % colors.length]!,
    );

    // --- geometry: the origin and the radius that reaches the farthest corner ----------------
    const ox = (props.originX / 100) * width;
    const oy = (props.originY / 100) * height;
    const farthest = Math.max(
      Math.hypot(ox, oy),
      Math.hypot(width - ox, oy),
      Math.hypot(ox, height - oy),
      Math.hypot(width - ox, height - oy),
    );
    // A little past the corner, so antialiasing never leaves a corner pixel half covered.
    const R = farthest + 2 * u;
    // What's left of a ring once its hole opens: everything outside the hole (the ring's own
    // outer edge is beyond every corner by then, so the frame stands in for it).
    const outside: PathData = [
      ['M', -2 * u, -2 * u],
      ['L', width + 2 * u, -2 * u],
      ['L', width + 2 * u, height + 2 * u],
      ['L', -2 * u, height + 2 * u],
      ['Z'],
    ];

    // --- timing: everything compresses around the cut with Speed -----------------------------
    const speed = props.speed;
    const inSpan = cut / speed;
    const outSpan = (timeline.sections.out.end - cut) / speed;
    const spread = n - 1;
    // Balanced rings follow each other by 50 ms at 1.2 s (× Energy's stagger, growing gently
    // with longer transitions so the bands stay apart); gaps never take more than half of a
    // phase, however short the transition.
    const gap = (0.05 * Math.sqrt(timeline.duration / 1.2) * energy.stagger) / speed;
    const gapIn = Math.min(gap, ((inSpan - PLATEAU) * 0.5) / spread);
    const gapOut = Math.min(gap, ((outSpan - PLATEAU) * 0.5) / spread);
    const moveIn = inSpan - PLATEAU - spread * gapIn;
    const moveOut = outSpan - PLATEAU - spread * gapOut;
    const inStart = cut - inSpan;
    // Calm blooms (sine in-out), Balanced wipes (snap); Punchy bursts out of the origin and
    // hangs on the covered frame, then the hole whooshes open — mirrored around the cut.
    const curves: Record<typeof energy.id, [EaseName, EaseName]> = {
      calm: ['drift', 'drift'],
      balanced: ['snap', 'snap'],
      punchy: ['glide', 'exit'],
    };
    const [enter, leave] = curves[energy.id].map((name) => ease[name]) as [
      (x: number) => number,
      (x: number) => number,
    ];
    const ring = props.style === 'ring';

    /** Eased area share 0..1 of a window starting at `start`. */
    const area = (t: number, start: number, dur: number, shape: (x: number) => number) =>
      shape(Math.min(1, Math.max(0, (t - start) / dur)));

    // A disc this large covers the whole frame: nothing below it needs drawing.
    const covers = (r: number) => r >= farthest + u;
    const radii = new Float64Array(n);
    const holes = new Float64Array(n);
    const bleed: Rect = { x: -2 * u, y: -2 * u, w: width + 4 * u, h: height + 4 * u };

    return {
      // An overlay: no background of its own, ever (opaque exports bake Scene A/B underneath).
      render: ({ t, g }) => {
        let first = 0;
        if (t < cut) {
          // Rings expand one after another; the last covers the frame 30 ms before the cut.
          for (let i = 0; i < n; i++) {
            radii[i] = R * Math.sqrt(area(t, inStart + i * gapIn, moveIn, enter));
            if (covers(radii[i]!)) first = i;
          }
          for (let i = first; i < n; i++) {
            if (radii[i]! > 0) g.circle(ox, oy, radii[i]!, { fill: fills[i]! });
          }
          return;
        }
        // After the cut the top ring goes first — its hole opens (Ring) or it collapses back
        // into the origin (Fill) — and the ring below shows through, until the first ring
        // uncovers the next shot.
        for (let i = 0; i < n; i++) {
          const q = area(t, cut + PLATEAU + (n - 1 - i) * gapOut, moveOut, leave);
          holes[i] = ring ? R * Math.sqrt(q) : 0;
          radii[i] = ring ? (q < 1 ? R : 0) : R * Math.sqrt(1 - q);
          if (ring ? q <= 0 : covers(radii[i]!)) first = i;
        }
        for (let i = first; i < n; i++) {
          const radius = radii[i]!;
          const hole = holes[i]!;
          const fill = fills[i]!;
          if (radius <= 0) continue;
          if (!ring) g.circle(ox, oy, radius, { fill });
          else if (hole <= 0) g.rect(bleed, { fill });
          else g.path([...outside, ...circle(ox, oy, hole)], { fill, fillRule: 'evenodd' });
        }
      },
    };
  },
});
