/**
 * Procedural surfaces the photos land on (docs/templates/05-showcase.md §5.5): paper, linen and
 * concrete, built once per scene from seeded paths — fibres, threads, pores — so a frame costs a
 * few fills and strokes. Every texture is a quiet variation of the palette's background: the
 * photos stay the subject. The surface is static (it's the background of every frame).
 */

import {
  type Color,
  type Draw,
  type Gradient,
  mixOklab,
  type PathCommand,
  type PathData,
  type Rng,
  rgb,
  withAlpha,
} from '@/engine';

export type SurfaceKind = 'paper' | 'linen' | 'concrete' | 'solid';

const BLACK: Color = rgb(0, 0, 0);
const WHITE: Color = rgb(1, 1, 1);

type Stroke = { path: PathData; color: Color; width: number };
type Fill = { path: PathData; color: Color };
type Blob = { x: number; y: number; r: number; light: boolean };

export type Surface = { draw(g: Draw): void };

/** A small circle as four cubic segments. */
function circle(commands: PathCommand[], x: number, y: number, r: number): void {
  const k = 0.5523 * r;
  commands.push(['M', x + r, y]);
  commands.push(['C', x + r, y + k, x + k, y + r, x, y + r]);
  commands.push(['C', x - k, y + r, x - r, y + k, x - r, y]);
  commands.push(['C', x - r, y - k, x - k, y - r, x, y - r]);
  commands.push(['C', x + k, y - r, x + r, y - k, x + r, y]);
  commands.push(['Z']);
}

export function createSurface(
  kind: SurfaceKind,
  size: { width: number; height: number; u: number },
  bg: Color,
  dark: boolean,
  rng: Rng,
): Surface {
  const { width: W, height: H, u } = size;
  const shade = mixOklab(bg, BLACK, dark ? 0.5 : 0.35);
  const light = mixOklab(bg, WHITE, dark ? 0.2 : 0.6);
  const strokes: Stroke[] = [];
  const fills: Fill[] = [];
  const blobs: Blob[] = [];
  const next = () => rng.next();

  if (kind === 'paper') {
    // Fibres: short, slightly curved strokes in two tones; a sprinkle of flecks.
    for (const [tone, count] of [
      [shade, 170],
      [light, 120],
    ] as const) {
      const commands: PathCommand[] = [];
      for (let i = 0; i < count; i++) {
        const x = next() * W;
        const y = next() * H;
        const length = (1.2 + next() * 2.8) * u;
        const angle = next() * Math.PI;
        const bend = (next() - 0.5) * 0.8 * u;
        const dx = Math.cos(angle) * length;
        const dy = Math.sin(angle) * length;
        commands.push(['M', x, y]);
        commands.push(['Q', x + dx / 2 - dy * 0.1 + bend, y + dy / 2 + dx * 0.1, x + dx, y + dy]);
      }
      strokes.push({ path: commands, color: withAlpha(tone, dark ? 0.2 : 0.22), width: 0.09 * u });
    }
    const flecks: PathCommand[] = [];
    for (let i = 0; i < 90; i++) circle(flecks, next() * W, next() * H, (0.05 + next() * 0.1) * u);
    fills.push({ path: flecks, color: withAlpha(shade, 0.28) });
    for (let i = 0; i < 10; i++) {
      blobs.push({ x: next() * W, y: next() * H, r: (14 + next() * 22) * u, light: i % 2 === 0 });
    }
  } else if (kind === 'linen') {
    // A plain weave: warp and weft threads with slubs (thicker, uneven stretches).
    const pitch = 0.46 * u;
    for (const vertical of [false, true]) {
      const across = vertical ? W : H;
      const along = vertical ? H : W;
      const even: PathCommand[] = [];
      const odd: PathCommand[] = [];
      for (let k = 0, p = 0; p < across; k++, p += pitch) {
        const q = p + (next() - 0.5) * pitch * 0.35;
        const list = k % 2 === 0 ? even : odd;
        if (vertical) {
          list.push(['M', q, 0], ['L', q + (next() - 0.5) * u, along]);
        } else {
          list.push(['M', 0, q], ['L', along, q + (next() - 0.5) * u]);
        }
      }
      strokes.push({ path: even, color: withAlpha(shade, dark ? 0.16 : 0.11), width: 0.16 * u });
      strokes.push({ path: odd, color: withAlpha(light, dark ? 0.1 : 0.2), width: 0.14 * u });
    }
    const slubs: PathCommand[] = [];
    for (let i = 0; i < 70; i++) {
      const x = next() * W;
      const y = next() * H;
      const length = (1.5 + next() * 4) * u;
      if (i % 2 === 0) slubs.push(['M', x, y], ['L', x + length, y + (next() - 0.5) * 0.2 * u]);
      else slubs.push(['M', x, y], ['L', x + (next() - 0.5) * 0.2 * u, y + length]);
    }
    strokes.push({ path: slubs, color: withAlpha(shade, 0.16), width: 0.26 * u });
    for (let i = 0; i < 6; i++) {
      blobs.push({ x: next() * W, y: next() * H, r: (20 + next() * 25) * u, light: i % 2 === 0 });
    }
  } else if (kind === 'concrete') {
    // Mottled cement: large soft clouds, aggregate specks and air pores.
    for (let i = 0; i < 26; i++) {
      blobs.push({ x: next() * W, y: next() * H, r: (6 + next() * 20) * u, light: next() > 0.5 });
    }
    const pores: PathCommand[] = [];
    for (let i = 0; i < 160; i++) circle(pores, next() * W, next() * H, (0.06 + next() * 0.22) * u);
    fills.push({ path: pores, color: withAlpha(shade, dark ? 0.5 : 0.36) });
    const grit: PathCommand[] = [];
    for (let i = 0; i < 220; i++) circle(grit, next() * W, next() * H, (0.04 + next() * 0.08) * u);
    fills.push({ path: grit, color: withAlpha(light, dark ? 0.35 : 0.5) });
  }

  const cloud = (tone: Color, alpha: number): Gradient => ({
    kind: 'radial',
    cx: 0,
    cy: 0,
    r: 1,
    stops: [
      { offset: 0, color: withAlpha(tone, alpha) },
      { offset: 0.5, color: withAlpha(tone, alpha * 0.55) },
      { offset: 1, color: withAlpha(tone, 0) },
    ],
  });
  const strength = kind === 'concrete' ? 1.6 : 1;
  const lightCloud = cloud(light, (dark ? 0.05 : 0.1) * strength);
  const darkCloud = cloud(shade, (dark ? 0.12 : 0.06) * strength);
  // Light falls from the upper left; the far corners sink a little.
  const vignette: Gradient = {
    kind: 'radial',
    cx: W * 0.42,
    cy: H * 0.38,
    r: Math.hypot(W, H) * 0.62,
    stops: [
      { offset: 0, color: withAlpha(light, dark ? 0.06 : 0.14) },
      { offset: 0.55, color: withAlpha(bg, 0) },
      { offset: 1, color: withAlpha(shade, dark ? 0.35 : 0.2) },
    ],
  };
  const frameRect = { x: 0, y: 0, w: W, h: H };

  return {
    draw(g) {
      if (kind === 'solid') return;
      for (const blob of blobs) {
        g.group({ x: blob.x, y: blob.y, scale: blob.r }, (g) =>
          g.circle(0, 0, 1, { fill: blob.light ? lightCloud : darkCloud }),
        );
      }
      for (const stroke of strokes) {
        g.path(stroke.path, { stroke: { color: stroke.color, width: stroke.width, cap: 'round' } });
      }
      for (const fill of fills) g.path(fill.path, { fill: fill.color });
      g.rect(frameRect, { fill: vignette });
    },
  };
}
