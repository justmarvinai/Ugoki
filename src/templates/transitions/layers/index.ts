/**
 * Layers — stacked panel wipe (docs/templates/08-transitions.md §8.1).
 *
 * The expensive detail: each panel's speed differs by a few percent (seeded), so the leading
 * edges fan out organically instead of moving in robotic parallel; motion blur (temporal
 * supersampling) makes the sweep directional. Coverage is exact: the last panel covers the
 * whole frame — skew included — for a plateau around the cut point, and the panels leave in
 * the same direction in reverse order.
 */

import {
  adjustLightness,
  type Color,
  c,
  defineTemplate,
  type Palette,
  type PaletteRole,
  type PathData,
} from '@/engine';

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

/** Half of the full-coverage plateau around the cut, in seconds (motion language §10). */
const PLATEAU = 0.03;

/** Roles tried for the panels below the top one, in order. */
const ROLES: readonly PaletteRole[] = ['accent2', 'bg', 'accent', 'muted', 'surface', 'accent3'];

const distinct = (a: Color, b: Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.12;

/**
 * Panel colors, bottom to top. The top panel (the one that covers the cut) is the palette's
 * foreground — its strongest color; the others are its other distinct roles. Brand palettes
 * use tints of the brand color, with the brand color itself on top.
 */
function panelColors(palette: Palette, count: number): Color[] {
  const { roles } = palette;
  if (palette.id.startsWith('brand-')) {
    const brand = palette.id === 'brand-bold' ? roles.bg : roles.accent;
    const tints = [
      adjustLightness(brand, 0.16),
      adjustLightness(brand, -0.14),
      adjustLightness(brand, 0.3),
    ];
    return [...tints.slice(0, count - 1), brand];
  }
  const hero = roles.fg;
  const others: Color[] = [];
  for (const role of ROLES) {
    const color = roles[role];
    if (distinct(color, hero) && others.every((other) => distinct(other, color))) {
      others.push(color);
    }
  }
  // Palettes with too few distinct roles fill up with tints of the background.
  for (let i = 0; others.length < count - 1; i++) {
    others.push(adjustLightness(roles.bg, palette.dark ? 0.12 * (i + 1) : -0.12 * (i + 1)));
  }
  return [...others.slice(0, count - 1), hero];
}

export default defineTemplate({
  id: 'layers',
  version: 1,
  meta: {
    name: 'Layers',
    tagline: 'Stacked panel wipe',
    category: 'transitions',
    tags: ['transition', 'wipe', 'panels', 'overlay'],
    useCases: ['Vlogs', 'Promos', 'Social edits', 'Scene changes'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'transition',
  duration: { default: 1.2, min: 0.6, max: 2.4 },
  alpha: 'default',
  poster: 0.42,
  palettes: [
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'mono-light' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'candy' },
  ],
  pairings: ['grotesk'],
  controls: {
    colors: c.number({
      label: 'Colors',
      group: 'style',
      default: 3,
      min: 2,
      max: 4,
      step: 1,
    }),
    skew: c.number({
      label: 'Skew',
      group: 'style',
      default: 12,
      min: 0,
      max: 20,
      step: 1,
      unit: '°',
    }),
    layers: c.number({ label: 'Layers', group: 'style', default: 3, min: 2, max: 5, step: 1 }),
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
      id: 'cobalt-acid-ink',
      name: 'Cobalt · Acid · Ink',
      palette: { kind: 'library', id: 'acid' },
      pairing: 'grotesk',
    },
    {
      id: 'mono',
      name: 'Mono',
      palette: { kind: 'library', id: 'mono-light' },
      pairing: 'grotesk',
    },
    {
      id: 'brand-bold',
      name: 'Brand Bold',
      palette: { kind: 'brand', color: '#5A2BE8', variant: 'bold' },
      pairing: 'grotesk',
    },
  ],
  timing: () => ({ in: 0, out: 0, cut: 0.5 }),
  build: (ctx) => {
    const { frame, props, palette, energy, timeline } = ctx;
    const { width, height, u } = frame;
    const duration = timeline.duration;
    const cut = timeline.cut ?? duration / 2;
    const n = Math.round(props.layers);
    const colors = panelColors(palette, Math.min(Math.round(props.colors), n));
    const color = (i: number) =>
      colors[(((colors.length - n + i) % colors.length) + colors.length) % colors.length];

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
    const s = corners.map(([x, y]) => x * dx + y * dy);
    const p = corners.map(([x, y]) => x * nx + y * ny);
    const sMin = Math.min(...s);
    const sMax = Math.max(...s);
    const pMin = Math.min(...p);
    const pMax = Math.max(...p);
    const pc = (pMin + pMax) / 2;
    const tan = Math.tan((props.skew * Math.PI) / 180);
    // The skewed edge reaches this far ahead of (and behind) its position at the center line.
    const slant = tan * ((pMax - pMin) / 2);
    const over = 1.5 * u;
    const length = sMax - sMin + 2 * slant + 2 * over;
    // Lead edge: fully before the frame → covering it (at the cut) → trailing edge past it.
    const start = sMin - slant - over;
    const p1 = pMin - 4 * u;
    const p2 = pMax + 4 * u;

    const point = (along: number, across: number): [number, number] => [
      along * dx + across * nx,
      along * dy + across * ny,
    ];
    const panel = (lead: number): PathData => {
      const trail = lead - length;
      // The edge leans forward on the p1 side ("/" when travelling right).
      const a = point(lead + tan * (pc - p1), p1);
      const b = point(lead + tan * (pc - p2), p2);
      const c2 = point(trail + tan * (pc - p2), p2);
      const d = point(trail + tan * (pc - p1), p1);
      return [['M', ...a], ['L', ...b], ['L', ...c2], ['L', ...d], ['Z']];
    };

    // --- timing: everything compresses around the cut with Speed ---------------------------
    const speed = props.speed;
    const inSpan = cut / speed;
    const outSpan = (duration - cut) / speed;
    const spread = n > 1 ? n - 1 : 1;
    const gap = (0.07 * energy.stagger) / speed;
    // Gaps never take more than half of a phase, however short the transition.
    const gapIn = Math.min(gap, ((inSpan - PLATEAU) * 0.5) / spread);
    const gapOut = Math.min(gap, ((outSpan - PLATEAU) * 0.5) / spread);
    const moveIn = inSpan - PLATEAU - (n - 1) * gapIn;
    const moveOut = outSpan - PLATEAU - (n - 1) * gapOut;
    const inStart = cut - inSpan;
    const curve = energy.id === 'calm' ? 'drift' : 'snap';
    // Per-panel speed: a few percent apart (the top panel keeps the exact cut).
    const variance = energy.id === 'calm' ? 0.03 : energy.id === 'punchy' ? 0.06 : 0.045;
    const rng = ctx.rng('panel-speeds');
    const rates = Array.from({ length: n }, (_, i) =>
      i === n - 1 ? 1 : 1 + (rng.next() * 2 - 1) * variance,
    );

    return {
      // An overlay: no background of its own, ever (the palette's background is a panel color).
      // Opaque exports bake Scene A/B underneath instead (docs/templates/08-transitions.md).
      render: ({ t, g, tl }) => {
        for (let i = 0; i < n; i++) {
          const rate = rates[i] ?? 1;
          const entered = tl.p(t, 'in', { delay: inStart + i * gapIn, dur: moveIn / rate }, curve);
          const left = tl.p(
            t,
            'out',
            { delay: PLATEAU + (n - 1 - i) * gapOut, dur: moveOut / rate },
            curve,
          );
          if (entered <= 0 || left >= 1) continue;
          const fill = color(i);
          if (fill) g.path(panel(start + length * (entered + left)), { fill });
        }
      },
    };
  },
});
