/**
 * Hype's final lockup (docs/templates/07-openers.md §7.2): the channel name slams on the beat;
 * on the next half-beat a disc pops open behind it with the logo, a ring shockwave leaves the
 * disc's edge, and everything settles and keeps a pulse until the last beat cuts to the
 * background.
 */

import {
  type Color,
  clamp01,
  type Draw,
  ease,
  type Graphic,
  type Rect,
  type SpringName,
  smoothstep,
  springProgress,
  unionRect,
} from '@/engine';
import { fitCard, type Kit, type Placed } from './shots';

export type LockupColors = {
  readonly bg: Color;
  readonly name: Color;
  /** The name where it crosses the disc. */
  readonly nameOnDisc: Color;
  readonly logo: Color;
  /** The disc behind the lockup. */
  readonly disc: Color;
  /** The shockwave's two rings. */
  readonly ring: Color;
  readonly ring2: Color;
};

export type Lockup = {
  readonly bounds: Rect;
  readonly name: Placed;
  readonly logo: Rect | null;
  /** Draws the lockup at local time (from its cut), without the background. */
  draw(g: Draw, local: number, pulse: number): void;
};

export type LockupOptions = {
  readonly name: string;
  readonly logo: Graphic | null;
  readonly colors: LockupColors;
  /** When the disc and the logo pop (local seconds: the next half-beat). */
  readonly pop: number;
  readonly spring: SpringName;
  /** Seeded tilt (−1…1). */
  readonly tilt: number;
  /** Seconds the lockup holds before the final cut. */
  readonly len: number;
};

/** The name's height (share of the type area) per format. */
const NAME_H = { '16:9': 0.27, '1:1': 0.22, '4:5': 0.2, '9:16': 0.15 } as const;

export function createLockup(kit: Kit, options: LockupOptions): Lockup {
  const { frame, area, feel } = kit;
  const u = frame.u;
  const logo = options.logo;
  const { colors } = options;

  // --- layout: the logo above the name, the pair optically centered on the disc ---------------
  const probe = fitCard(
    kit,
    options.name || ' ',
    kit.width * 0.9,
    area.h * NAME_H[frame.format],
    2,
    0,
  );
  const capH = probe.block.capHeight;
  const aspect = logo && logo.ink.w > 0 && logo.ink.h > 0 ? logo.ink.w / logo.ink.h : 1;
  let logoH = logo ? (capH * 1.3) / Math.sqrt(aspect) : 0;
  let logoW = logoH * aspect;
  const maxW = kit.width * 0.5;
  if (logoW > maxW) {
    logoW = maxW;
    logoH = maxW / aspect;
  }
  const gap = logo ? Math.max(3 * u, 0.42 * capH) : 0;
  const total = logoH + gap + probe.bounds.h;
  const top = kit.cy - total / 2;
  const logoRect: Rect | null = logo
    ? { x: frame.cx - logoW / 2, y: top, w: logoW, h: logoH }
    : null;
  const shift = top + logoH + gap - probe.bounds.y;
  const name: Placed = {
    block: probe.block,
    x: probe.x,
    y: probe.y + shift,
    bounds: { ...probe.bounds, y: probe.bounds.y + shift },
    cx: probe.cx,
    cy: probe.cy + shift,
  };
  const bounds = logoRect ? unionRect(name.bounds, logoRect) : name.bounds;
  // The disc sits behind the pair: big enough to hold the logo and the name's middle.
  const cx = frame.cx;
  const cy = top + total / 2;
  const disc = Math.max(total * 0.62, Math.min(frame.width, frame.height) * 0.36);
  // The shockwave leaves the disc's edge and runs past the frame's corners.
  const reach =
    Math.max(
      Math.hypot(cx, cy),
      Math.hypot(frame.width - cx, cy),
      Math.hypot(cx, frame.height - cy),
      Math.hypot(frame.width - cx, frame.height - cy),
    ) +
    4 * u;
  const width0 = 3 * u;

  const ring = (g: Draw, since: number, color: Color, width: number, dur: number) => {
    if (since <= 0) return;
    const q = clamp01(since / dur);
    if (q >= 1) return;
    const r = disc + (reach - disc) * ease.glide(q);
    const w = width * (1 - 0.8 * q);
    const opacity = 1 - smoothstep(0.5, 1, q);
    g.circle(cx, cy, r, { stroke: { color, width: w }, opacity });
  };

  return {
    bounds,
    name,
    logo: logoRect,
    draw(g, local, pulse) {
      const p = ease[feel.curve](clamp01(local / feel.dur));
      const hold = clamp01((local - feel.dur) / Math.max(0.1, options.len - feel.dur));
      const breathe = (1 + 0.025 * ease.drift(hold)) * (1 + pulse);
      const since = local - options.pop;
      const popped = since > 0 ? springProgress(since, options.spring) : 0;

      // Shockwave: two rings off the disc's edge, the second thinner and a touch later.
      ring(g, since, colors.ring, width0, 0.6);
      ring(g, since - 0.08, colors.ring2, width0 * 0.45, 0.66);

      g.group({ scale: breathe, originX: cx, originY: cy }, (g) => {
        const r = disc * popped;
        if (r > 0) g.circle(cx, cy, r, { fill: colors.disc });
        const scale = feel.from + (1 - feel.from) * p;
        const rotate = options.tilt * feel.tilt * (1 - p);
        const type = { scale, rotate, originX: name.cx, originY: name.cy };
        g.group(type, (g) => g.text(name.block, { x: name.x, y: name.y, fill: colors.name }));
        // Where the name crosses the disc it takes the disc's own ink.
        if (r > 0 && colors.nameOnDisc !== colors.name) {
          g.clip({ rect: { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, radius: r }, (g) =>
            g.group(type, (g) =>
              g.text(name.block, { x: name.x, y: name.y, fill: colors.nameOnDisc }),
            ),
          );
        }
        if (logo && logoRect) {
          const s = since > 0.04 ? springProgress(since - 0.04, options.spring) : 0;
          if (s > 0) {
            const lx = logoRect.x + logoRect.w / 2;
            const ly = logoRect.y + logoRect.h / 2;
            g.group({ scale: s, rotate: -14 * (1 - s), originX: lx, originY: ly }, (g) =>
              g.graphic(logo, logoRect, { current: colors.logo }),
            );
          }
        }
      });
    },
  };
}
