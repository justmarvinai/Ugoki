/**
 * Blinds — strip slices (docs/templates/08-transitions.md §8.4).
 *
 * The expensive detail: at full coverage every strip edge sits on a device pixel and each strip
 * reaches a pixel into its neighbour, so the cut frame has no hairline seams at any resolution
 * or render scale (diagonal strips, which can't sit on pixels, rely on the overlap alone: each
 * antialiased edge lies over its neighbour's solid interior).
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
} from '@/engine';

/** Half of the full-coverage plateau around the cut, in seconds (motion language §10). */
const PLATEAU = 0.03;

const distinct = (a: Color, b: Color) =>
  contrastRatio(a, b) >= 1.25 || Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.35;

/**
 * Strip colors, alternating across the frame: the palette's foreground and background (Ink +
 * Paper), then its accents. Brand palettes lead with the brand color.
 */
function stripColors(palette: Palette, count: number): Color[] {
  const { roles } = palette;
  const order: readonly PaletteRole[] =
    palette.id === 'brand-bold'
      ? ['bg', 'fg', 'accent2', 'surface']
      : palette.id.startsWith('brand-')
        ? ['accent', 'fg', 'bg', 'accent2']
        : ['fg', 'bg', 'accent', 'accent2', 'muted', 'surface'];
  const colors: Color[] = [];
  for (const role of order) {
    const color = roles[role];
    if (colors.every((other) => distinct(other, color))) colors.push(color);
    if (colors.length === count) return colors;
  }
  const base = colors[0] ?? roles.fg;
  for (let i = 0; colors.length < count; i++) {
    colors.push(adjustLightness(base, palette.dark ? -0.2 * (i + 1) : 0.2 * (i + 1)));
  }
  return colors;
}

type Point = readonly [number, number];

/** The part of a convex polygon where a·x + b·y ≥ c (one Sutherland–Hodgman pass). */
function clipHalfPlane(polygon: readonly Point[], a: number, b: number, c: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const dp = a * p[0] + b * p[1] - c;
    const dq = a * q[0] + b * q[1] - c;
    if (dp >= 0) out.push(p);
    if (dp >= 0 !== dq >= 0) {
      const k = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
    }
  }
  return out;
}

export default defineTemplate({
  id: 'blinds',
  version: 1,
  meta: {
    name: 'Blinds',
    tagline: 'Strip slices',
    category: 'transitions',
    tags: ['transition', 'strips', 'blinds', 'graphic', 'overlay'],
    useCases: ['Corporate', 'Fashion', 'Editorial', 'Architecture'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'transition',
  duration: { default: 1, min: 0.6, max: 2 },
  alpha: 'default',
  poster: 0.28,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'swiss' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'mono-light' },
  ],
  pairings: ['grotesk'],
  controls: {
    strips: c.number({ label: 'Strips', group: 'style', default: 8, min: 4, max: 24, step: 1 }),
    orientation: c.choice({
      label: 'Orientation',
      default: 'vertical',
      options: [
        { value: 'vertical', label: 'Vertical' },
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'diagonal', label: 'Diagonal' },
      ],
    }),
    colors: c.number({ label: 'Colors', group: 'style', default: 2, min: 1, max: 3, step: 1 }),
    pattern: c.choice({
      label: 'Pattern',
      group: 'motion',
      default: 'linear',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'center', label: 'Center' },
        { value: 'random', label: 'Random' },
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
      id: 'ink-paper',
      name: 'Ink/Paper',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'grotesk',
    },
    {
      id: 'swiss',
      name: 'Swiss',
      palette: { kind: 'library', id: 'swiss' },
      pairing: 'grotesk',
      values: { colors: 3, strips: 12, pattern: 'center' },
    },
    {
      id: 'brand-bold',
      name: 'Brand Bold',
      palette: { kind: 'brand', color: '#5A2BE8', variant: 'bold' },
      pairing: 'grotesk',
      values: { orientation: 'diagonal', strips: 10 },
    },
  ],
  timing: () => ({ in: 0, out: 0, cut: 0.5, tail: CLEAN_END }),
  build: (ctx) => {
    const { frame, props, palette, energy, timeline } = ctx;
    const { width, height, u } = frame;
    const cut = timeline.cut ?? timeline.duration / 2;
    const n = Math.round(props.strips);
    const colors = stripColors(palette, Math.round(props.colors));
    const orientation = props.orientation;

    // --- geometry: strips across p, each growing along s ------------------------------------
    // Vertical strips grow down, horizontal ones right, diagonal ones ("\") down-right; strips
    // are laid out across that direction (diagonals from the bottom-left corner to the top-right).
    const S = Math.SQRT1_2;
    const [dx, dy]: Point =
      orientation === 'vertical' ? [0, 1] : orientation === 'horizontal' ? [1, 0] : [S, S];
    const [nx, ny]: Point =
      orientation === 'vertical' ? [1, 0] : orientation === 'horizontal' ? [0, 1] : [S, -S];
    const corners: Point[] = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ];
    const across = corners.map(([x, y]) => x * nx + y * ny);
    const pMin = Math.min(...across);
    const pMax = Math.max(...across);
    const pitch = (pMax - pMin) / n;
    // Each strip's own extent along s (its part of the frame), so short corner strips of the
    // diagonal grow in step with the long ones. A bleed keeps the ends off the frame's edges.
    const bleed = 2 * u;
    const extent = Array.from({ length: n }, (_, i) => {
      const a = pMin + i * pitch;
      const slab = clipHalfPlane(clipHalfPlane(corners, nx, ny, a), -nx, -ny, -(a + pitch));
      const along = slab.map(([x, y]) => x * dx + y * dy);
      return [Math.min(...along) - bleed, Math.max(...along) + bleed] as const;
    });

    // --- timing: a stagger pattern, everything compressed around the cut by Speed -----------
    const speed = props.speed;
    const inSpan = cut / speed - PLATEAU;
    const outSpan = (timeline.sections.out.end - cut) / speed - PLATEAU;
    const inStart = cut - PLATEAU - inSpan;
    // Calm is one soft overlapping wave, Balanced a clear stagger, Punchy rapid-fire slams.
    const share = energy.id === 'calm' ? 0.3 : energy.id === 'punchy' ? 0.62 : 0.45;
    const curve: EaseName = energy.id === 'calm' ? 'drift' : 'snap';
    const shape = ease[curve];
    const center = (n - 1) / 2;
    const shuffled = ctx.rng('pattern').shuffle(Array.from({ length: n }, (_, i) => i));
    const rank = new Float64Array(n);
    shuffled.forEach((strip, r) => {
      rank[strip] = r;
    });
    /** 0..1 position of strip `i` in the pattern's order. */
    const order = Array.from({ length: n }, (_, i) =>
      n <= 1
        ? 0
        : props.pattern === 'center'
          ? Math.abs(i - center) / center
          : props.pattern === 'random'
            ? (rank[i] ?? 0) / (n - 1)
            : i / (n - 1),
    );
    const window = (span: number, i: number) => {
      const spread = span * share;
      return { delay: (order[i] ?? 0) * spread, dur: span - spread };
    };
    const progress = (t: number, start: number, dur: number) =>
      shape(Math.min(1, Math.max(0, (t - start) / dur)));

    // Strip boundaries across p, recomputed for the render scale (device pixels) when it changes.
    const edges = new Float64Array(n + 1);
    let snappedFor = -1;
    const snapEdges = (px: number) => {
      if (px === snappedFor) return;
      snappedFor = px;
      for (let i = 0; i <= n; i++) {
        const p = pMin + i * pitch;
        // Axis-aligned strips put their edges on device pixels; the frame's own edges bleed.
        edges[i] =
          i === 0
            ? pMin - bleed
            : i === n
              ? pMax + bleed
              : orientation === 'diagonal'
                ? p
                : Math.round(p / px) * px;
      }
    };

    return {
      // An overlay: no background of its own, ever (opaque exports bake Scene A/B underneath).
      render: ({ t, g }) => {
        const px = g.pixel;
        snapEdges(px);
        const entering = t < cut;
        for (let i = 0; i < n; i++) {
          const [s0, s1] = extent[i]!;
          const length = s1 - s0;
          let a = s0;
          let b = s1;
          if (entering) {
            const w = window(inSpan, i);
            const q = progress(t, inStart + w.delay, w.dur);
            if (q <= 0) continue;
            b = s0 + length * q;
          } else {
            const w = window(outSpan, i);
            const q = progress(t, cut + PLATEAU + w.delay, w.dur);
            if (q >= 1) continue;
            a = s0 + length * q;
          }
          // Each strip reaches a pixel into both neighbours: no seam where they meet.
          const p0 = edges[i]! - px;
          const p1 = edges[i + 1]! + px;
          const fill = colors[i % colors.length]!;
          if (orientation === 'vertical') g.rect({ x: p0, y: a, w: p1 - p0, h: b - a }, { fill });
          else if (orientation === 'horizontal') {
            g.rect({ x: a, y: p0, w: b - a, h: p1 - p0 }, { fill });
          } else {
            g.path(
              [
                ['M', a * dx + p0 * nx, a * dy + p0 * ny],
                ['L', b * dx + p0 * nx, b * dy + p0 * ny],
                ['L', b * dx + p1 * nx, b * dy + p1 * ny],
                ['L', a * dx + p1 * nx, a * dy + p1 * ny],
                ['Z'],
              ],
              { fill },
            );
          }
        }
      },
    };
  },
});
