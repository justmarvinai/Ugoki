/**
 * Shards — assemble from fragments (docs/templates/09-logo-branding.md §9.3).
 *
 * The expensive detail: the logo is cut into Delaunay shards of seeded points inside its own
 * ink, and the shards arrive with rhythm — sparse, then a dense clatter, then the last three
 * click in one by one. Each shard is pulled into place (accelerating, so it lands with speed),
 * presses into its slot and springs back while it glints; the final click fires a flash and a
 * shockwave ring. Landed shards fuse into one clip, so the assembled logo has no seams, and the
 * engine's temporal sampling (a 270° shutter) streaks every shard in flight.
 */

import {
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  ease,
  ensureContrast,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type GroupOptions,
  type PathData,
  type Rect,
  rgb,
  type SpringName,
  springProgress,
  type TextBlock,
  type TextLine,
} from '@/engine';
import { cutShards, type Shard } from './fragments';
import { type Part, vectorPieces } from './pieces';
import { logoDrawer, sprite } from './raster';

/** Logo size: height = K / √aspect (in u), so marks and wide lockups carry similar weight. */
const LOGO_K: Record<FormatId, number> = { '16:9': 26, '9:16': 30, '1:1': 28, '4:5': 29 };
/** Widest the logo may get, as a share of the layout area's width. */
const LOGO_MAX_W: Record<FormatId, number> = { '16:9': 0.5, '9:16': 0.8, '1:1': 0.7, '4:5': 0.72 };
const TAGLINE_SIZE: Record<FormatId, number> = { '16:9': 3.2, '9:16': 3.8, '1:1': 3.4, '4:5': 3.5 };

const COUNT = { low: 24, medium: 44, high: 72 } as const;

/** Arrivals (Balanced seconds into `in`): sparse, a dense clatter, then three last clicks. */
const FIRST = 0.45;
const BULK_END = 0.98;
const CLICKS = [1.05, 1.12, 1.2] as const;
const FINAL = 1.2;
const TAGLINE_AT = 1.3;
/** Entrance length with and without a tagline. */
const IN_TAGLINE = 2;
const IN_LOGO = 1.7;
const OUT = 0.7;
/** A shard presses into its slot for this long before its spring releases it. */
const CONTACT = 0.035;
/** Shards fade in over the first moment of their flight. */
const APPEAR = 0.12;
/** Sprite resolution (pixels per design unit): sharp up to 1620p, soft only in flight at 4K. */
const SPRITE = 1.5;

const WHITE: Color = rgb(1, 1, 1);
const ADD: GroupOptions = { blend: 'lighter' };

type Feel = {
  /** Approach curve: how a shard is pulled into place. */
  approach: (x: number) => number;
  /** Press depth on landing (share of the shard's size) and the spring that releases it. */
  press: number;
  spring: SpringName;
  /** Glint on landing, the final flash and the ring (0..1). */
  glint: number;
  flash: number;
  ring: number;
  /** Frame shake on the final click (u). */
  shake: number;
};

/**
 * Calm floats the shards in and lets them merge (no press, soft light); Balanced pulls them in
 * under a constant force (a parabola, like gravity) so each lands with a click; Punchy yanks
 * them in exponentially, presses harder, springs livelier and shakes on the last click.
 */
const FEEL: Record<'calm' | 'balanced' | 'punchy', Feel> = {
  calm: {
    approach: ease.drift,
    press: 0,
    spring: 'gentle',
    glint: 0.3,
    flash: 0.5,
    ring: 0.55,
    shake: 0,
  },
  balanced: {
    approach: (x) => x * x,
    press: 0.05,
    spring: 'snappy',
    glint: 0.6,
    flash: 0.85,
    ring: 0.85,
    shake: 0,
  },
  punchy: {
    approach: ease.exit,
    press: 0.08,
    spring: 'lively',
    glint: 0.8,
    flash: 1,
    ring: 1,
    shake: 0.35,
  },
};

const feelOf = (energy: string): Feel => FEEL[energy as keyof typeof FEEL] ?? FEEL.balanced;

/** One shard's flight: when, from where, and how it turns on the way. */
type Flight = {
  shard: Shard;
  clip: { path: PathData };
  /** Absolute seconds: leaves, and lands (fusing with the shards already in place). */
  start: number;
  land: number;
  /** Start offset (explode/fall) in design units, or the swirl's orbit. */
  dx: number;
  dy: number;
  /** Swirl: orbit angle (degrees) and extra radius at the start. */
  orbit: number;
  reach: number;
  /** Depth scale at the start (> 1: nearer the camera). */
  depth: number;
  /** Spin and tumble (degrees) at the start; the tumble tilts around `axis`. */
  spin: number;
  tilt: number;
  axis: number;
  /** Out: the shard's escape (offset, depth, spin, tumble) and its timing. */
  outX: number;
  outY: number;
  outDepth: number;
  outSpin: number;
  outTilt: number;
  outStart: number;
  outEnd: number;
  /** Draws the logo through this shard's triangle (and tinted, for the glint). */
  draw: (g: Draw) => void;
  glow: (g: Draw) => void;
};

/**
 * Sets `out` to the transform of a shard pivoting on (px, py): moved by (x, y), turned by
 * `spin`, scaled by `scale`, and tumbled — foreshortened by cos(tilt) across `axis` — as one
 * group (rotate · skew · scale), so a shard costs a single transform.
 */
function pose(
  out: GroupOptions,
  x: number,
  y: number,
  px: number,
  py: number,
  spin: number,
  scale: number,
  tilt: number,
  axis: number,
): boolean {
  const DEG = Math.PI / 180;
  const f = Math.cos(tilt * DEG);
  const ca = Math.cos(axis * DEG);
  const sa = Math.sin(axis * DEG);
  const psi = (spin + axis) * DEG;
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  // M = R(spin + axis) · S(scale, scale·f) · R(−axis)
  const a11 = scale * ca;
  const a12 = scale * sa;
  const a21 = -scale * f * sa;
  const a22 = scale * f * ca;
  const m11 = cp * a11 - sp * a21;
  const m12 = cp * a12 - sp * a22;
  const m21 = sp * a11 + cp * a21;
  const m22 = sp * a12 + cp * a22;
  const sx = Math.hypot(m11, m21);
  if (sx < 1e-6) return false;
  const alpha = Math.atan2(m21, m11);
  const cr = Math.cos(alpha);
  const sr = Math.sin(alpha);
  const sy = -sr * m12 + cr * m22;
  // Edge-on shards are invisible.
  if (Math.abs(sy) < 0.02 * sx) return false;
  out.x = x;
  out.y = y;
  out.originX = px;
  out.originY = py;
  out.rotate = alpha / DEG;
  out.skewX = Math.atan((cr * m12 + sr * m22) / sy) / DEG;
  out.scaleX = sx;
  out.scaleY = sy;
  return true;
}

/** Arrival order positions 0..1 → seconds: sparse at the ends, dense in the middle. */
const bulkTime = (u: number) =>
  FIRST + (BULK_END - FIRST) * (u + (0.6 / (2 * Math.PI)) * Math.sin(2 * Math.PI * u));

export default defineTemplate({
  id: 'shards',
  version: 1,
  meta: {
    name: 'Shards',
    tagline: 'Assemble from fragments',
    category: 'logo-branding',
    tags: ['logo', 'reveal', 'shatter', 'gaming', 'tech'],
    useCases: ['Gaming intros', 'Tech launches', 'Sports brands', 'Product launches'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 4, min: 3, max: 8 },
  alpha: 'optional',
  poster: 2.5,
  // Flying shards are streaked by the engine's temporal sampling: a wide genre shutter.
  shutter: 270,
  palettes: [
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'mono-dark' },
    { kind: 'library', id: 'paper' },
  ],
  pairings: ['technical', 'grotesk', 'sport', 'wide', 'mono'],
  controls: {
    logo: c.image({ label: 'Logo', accept: 'logo', default: { kind: 'placeholder', id: 'nova' } }),
    tagline: c.text({
      label: 'Tagline',
      default: 'Play without limits',
      maxLength: 44,
      optional: true,
    }),
    shards: c.choice({
      label: 'Shards',
      default: 'medium',
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
    }),
    flash: c.choice({
      label: 'Flash color',
      default: 'accent',
      options: [
        { value: 'accent', label: 'Accent' },
        { value: 'white', label: 'White' },
      ],
    }),
    color: c.choice({
      label: 'Logo color',
      default: 'original',
      options: [
        { value: 'original', label: 'Original' },
        { value: 'mono', label: 'Mono' },
        { value: 'accent', label: 'Accent' },
      ],
    }),
    direction: c.choice({
      label: 'Direction',
      group: 'motion',
      default: 'explode',
      options: [
        { value: 'explode', label: 'Explode-in' },
        { value: 'fall', label: 'Fall' },
        { value: 'swirl', label: 'Swirl' },
      ],
    }),
    out: c.toggle({ label: 'Out', group: 'motion', default: false, hint: 'Shards explode away' }),
  },
  looks: [
    {
      id: 'midnight',
      name: 'Midnight',
      palette: { kind: 'library', id: 'midnight' },
      pairing: 'technical',
    },
    {
      id: 'ink',
      name: 'Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'technical',
      values: { direction: 'fall' },
    },
    {
      id: 'cobalt',
      name: 'Cobalt',
      palette: { kind: 'library', id: 'cobalt' },
      pairing: 'grotesk',
      values: { direction: 'swirl', flash: 'white' },
    },
  ],
  // Without Out, the last frame is the finished logo (an end card); with it, the exit ends a
  // touch early so the last frame is clean.
  timing: ({ props }) => ({
    in: props.tagline.trim() ? IN_TAGLINE : IN_LOGO,
    out: props.out ? OUT : 0,
    tail: props.out ? CLEAN_END : 0,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, accent } = palette.roles;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const logo = ctx.graphic('logo');
    const feel = feelOf(energy.id);
    const at = (offset: number) => timeline.at('in', offset);
    const atOut = (offset: number) => timeline.at('out', offset);

    // --- tagline ------------------------------------------------------------------------
    const taglineText = props.tagline.trim();
    const taglineW = area.w * 0.9;
    const tagline: TextBlock | null = taglineText
      ? text.layout(taglineText, {
          style: {
            font: pairing.text.font,
            size: TAGLINE_SIZE[frame.format] * u,
            weight: 500,
            width: pairing.text.width,
            tracking: 0.04,
            features: pairing.text.features,
          },
          maxWidth: taglineW,
          maxLines: 2,
          lineHeight: 1.3,
          align: 'center',
          fit: { minSize: 2.4 * u },
        })
      : null;

    // --- layout: the logo centered, the tagline hanging below ----------------------------
    const aspect = logo && logo.ink.w > 0 && logo.ink.h > 0 ? logo.ink.w / logo.ink.h : 1;
    let logoH = (LOGO_K[frame.format] * u) / Math.sqrt(aspect);
    let logoW = logoH * aspect;
    const maxW = area.w * LOGO_MAX_W[frame.format];
    if (logoW > maxW) {
      logoW = maxW;
      logoH = maxW / aspect;
    }
    const gap = 5 * u;
    const blockH = logoH + (tagline ? gap + tagline.height : 0);
    // Optically centered: a touch above the geometric center.
    const top = area.y + (area.h - blockH) * 0.48;
    const logoRect: Rect = { x: frame.cx - logoW / 2, y: top, w: logoW, h: logoH };
    const lcx = frame.cx;
    const lcy = top + logoH / 2;
    const taglineX = frame.cx - taglineW / 2;
    const taglineY = top + logoH + gap;
    const taglineBounds: Rect | null = tagline
      ? {
          x: taglineX + tagline.ink.x,
          y: taglineY + tagline.ink.y,
          w: tagline.ink.w,
          h: tagline.ink.h,
        }
      : null;
    // The hold's slow push pivots on the whole lockup.
    const pivotY = top + blockH / 2;

    const tint = props.color === 'mono' ? fg : props.color === 'accent' ? accent : null;
    const flashColor = props.flash === 'white' ? WHITE : accent;
    // The ring must read on light grounds too.
    const ringColor = ensureContrast(flashColor, bg, 1.8);
    const bloom = palette.dark;

    const paint = { tint, current: fg };
    const litPaint = { tint: flashColor, current: fg };
    const drawLogo = logoDrawer(logo, logoRect, paint);
    const drawLit = logoDrawer(logo, logoRect, litPaint);
    // Covers the logo and its popping shards (the bloom adds its own reach).
    const logoArea: Rect = {
      x: logoRect.x - 2 * u,
      y: logoRect.y - 2 * u,
      w: logoW + 4 * u,
      h: logoH + 4 * u,
    };

    // --- the cut ------------------------------------------------------------------------
    const shards = logo
      ? cutShards({
          graphic: logo,
          rect: logoRect,
          target: COUNT[props.shards],
          rng: ctx.rng('cut'),
        })
      : [];
    const n = shards.length;
    const maxInk = shards.reduce((m, s) => Math.max(m, s.ink), 0) || 1;

    // Arrival order: seeded, shaped by the direction (a sweep for Fall and Swirl).
    const order = ctx.rng('order');
    const keyed = shards.map((shard, i) => {
      let key: number;
      if (props.direction === 'fall') {
        key = (shard.x - logoRect.x) / logoW + order.range(-0.3, 0.3);
      } else if (props.direction === 'swirl') {
        const angle = Math.atan2(shard.y - lcy, (shard.x - lcx) * (logoH / logoW) * 1.4);
        key = (angle / (2 * Math.PI) + 1.25) % 1;
        key += order.range(-0.05, 0.05);
      } else {
        // Seeded, bigger shards tending to land first.
        key = order.next() - 0.35 * (shard.ink / maxInk);
      }
      return { i, key };
    });
    keyed.sort((a, b) => a.key - b.key || a.i - b.i);
    // The last clicks must be seen: three of the largest pieces, far apart, land one by one
    // after the clatter (for Fall and Swirl, the sweep's last pieces among the large ones).
    const large = [...shards.keys()].sort((a, b) => (shards[b]?.ink ?? 0) - (shards[a]?.ink ?? 0));
    const pool = large.slice(0, Math.max(CLICKS.length, Math.ceil(n * 0.3)));
    const finals: number[] = [];
    if (n > 0 && props.direction === 'explode') {
      finals.push(pool[Math.floor(order.next() * pool.length)] ?? 0);
    } else if (n > 0) {
      finals.push(
        keyed
          .map((k) => k.i)
          .filter((i) => pool.includes(i))
          .pop() ?? 0,
      );
    }
    while (finals.length > 0 && finals.length < Math.min(CLICKS.length, n)) {
      let best = -1;
      let bestD = -1;
      for (const i of pool) {
        if (finals.includes(i)) continue;
        const s = shards[i] as Shard;
        let d = Number.POSITIVE_INFINITY;
        for (const j of finals) {
          const f = shards[j] as Shard;
          d = Math.min(d, Math.hypot(s.x - f.x, s.y - f.y));
        }
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0) break;
      finals.push(best);
    }
    // The first chosen lands last: the final click.
    const ranked = [
      ...keyed.map((k) => k.i).filter((i) => !finals.includes(i)),
      ...finals.reverse(),
    ];

    // --- pieces: vector cuts of the logo's outlines where possible -------------------------
    const corners = shards.map((shard) =>
      shard.path.flatMap((command) => (command[0] === 'Z' ? [] : [command[1], command[2]])),
    );
    const cut =
      logo?.kind === 'vector' ? vectorPieces(logo, logoRect, corners, paint, flashColor) : null;
    const drawParts = (g: Draw, parts: readonly Part[]) => {
      for (const part of parts) g.path(part.path, part.paint);
    };

    // --- flights ------------------------------------------------------------------------
    const rng = ctx.rng('flight');
    const outRng = ctx.rng('out');
    const bulk = Math.max(1, n - CLICKS.length);
    // How long a landed shard pops: until its spring is within 0.2% of rest.
    let popTime = 0;
    if (feel.press > 0) {
      for (let t = 0; t < 1.5; t += 1 / 240) {
        if (Math.abs(1 - springProgress(t, feel.spring)) * feel.press > 2e-3) popTime = t;
      }
      popTime += CONTACT;
    }
    const outReach = Math.hypot(logoW, logoH) / 2 || 1;
    const flights: Flight[] = ranked.map((index, rank) => {
      const shard = shards[index] as Shard;
      // Arrival (Balanced seconds into `in`): the bulk with ±30% jitter, then the clicks.
      const click = rank - bulk;
      let arrive: number;
      if (click >= 0) {
        arrive = CLICKS[click] ?? FINAL;
      } else {
        const gapBulk = (BULK_END - FIRST) / bulk;
        arrive = bulkTime((rank + 0.5) / bulk) + rng.range(-0.3, 0.3) * gapBulk;
      }
      // The last clicks fly a little longer, so their approach is seen.
      const long = click >= 0 ? 0.1 : 0;
      const dur =
        long + (props.direction === 'swirl' ? rng.range(0.5, 0.66) : rng.range(0.42, 0.62));
      const leave = Math.max(0.04, arrive - dur);

      let dx = 0;
      let dy = 0;
      let orbit = 0;
      let reach = 0;
      let depth = 1;
      let spin = 0;
      let tilt = 0;
      let axis = 0;
      const rx = shard.x - lcx;
      const ry = shard.y - lcy;
      if (props.direction === 'fall') {
        // From above the frame, tumbling like cards.
        dy = -ctx.travel(rng.range(24, 64) * u);
        dx = ctx.travel(rng.range(-5, 5) * u);
        depth = 1 + rng.range(0, 0.3);
        spin = rng.sign() * rng.range(15, 75);
        tilt = rng.sign() * rng.range(25, 80);
        axis = rng.range(-25, 25);
      } else if (props.direction === 'swirl') {
        // From far away, orbiting the logo's center and tightening.
        orbit = ctx.travel(rng.range(150, 260));
        reach = ctx.travel(rng.range(12, 24) * u);
        dx = rx * rng.range(0.5, 1.4);
        dy = ry * rng.range(0.5, 1.4);
        depth = rng.range(0.45, 0.75);
        spin = orbit + rng.range(-40, 40);
        tilt = rng.sign() * rng.range(20, 60);
        axis = rng.range(0, 180);
      } else {
        // A reversed explosion: out along the radius, nearer the camera, tumbling.
        const len = Math.hypot(rx, ry * 2);
        const base = len > 0.08 * logoW ? Math.atan2(ry * 2, rx) : rng.range(0, 2 * Math.PI);
        const angle = base + rng.range(-0.5, 0.5);
        const distance = ctx.travel(rng.range(22, 48) * u);
        depth = 1 + rng.range(0.6, 1.8) * Math.sqrt(energy.travel);
        dx = Math.cos(angle) * distance + rx * (depth - 1) * 0.35;
        dy = Math.sin(angle) * distance + ry * (depth - 1) * 0.35;
        spin = rng.sign() * rng.range(50, 170) * Math.sqrt(energy.travel);
        tilt = rng.sign() * rng.range(35, 95);
        axis = rng.range(0, 180);
      }

      // Out: from the center outward, nearer pieces first, flying at the camera.
      const away = Math.hypot(rx, ry) / outReach;
      const outAngle = Math.atan2(ry, rx) + outRng.range(-0.45, 0.45);
      const outDistance = ctx.travel(outRng.range(30, 60) * u) * (0.6 + 0.6 * away);
      const outDelay = 0.1 + Math.min(1, away) * 0.1 + outRng.range(0, 0.06);

      // A shard is its own cut of the logo's outlines (vector logos), or else pre-drawn once
      // (the logo through its triangle, and lit for its glint); without OffscreenCanvas it is
      // clipped from the logo every frame.
      const clip = { path: shard.path };
      const parts = cut?.parts[index];
      const litParts = cut?.lit[index];
      const piece = parts ? null : sprite(logo, logoRect, shard.path, SPRITE, paint);
      const lit = litParts ? null : sprite(logo, logoRect, shard.path, SPRITE, litPaint);
      return {
        shard,
        clip,
        start: at(leave),
        land: at(arrive),
        dx,
        dy,
        orbit,
        reach,
        depth,
        spin,
        tilt,
        axis,
        outX: Math.cos(outAngle) * outDistance,
        outY: Math.sin(outAngle) * outDistance,
        outDepth: outRng.range(1.6, 3),
        outSpin: outRng.sign() * outRng.range(60, 200),
        outTilt: outRng.sign() * outRng.range(40, 110),
        outStart: atOut(outDelay),
        outEnd: atOut(outDelay + 0.42),
        draw: parts
          ? (g) => drawParts(g, parts)
          : piece
            ? (g) => g.image(piece.image, piece.rect, { fit: 'contain' })
            : (g) => g.clip(clip, drawLogo),
        glow: litParts
          ? (g) => drawParts(g, litParts)
          : lit
            ? (g) => g.image(lit.image, lit.rect, { fit: 'contain' })
            : (g) => g.clip(clip, drawLit),
      };
    });

    // Landed shards fuse: one clip per number of landed shards, in landing order — one path
    // is filled as a whole, so the assembled part has no seams between its triangles.
    const byLanding = [...flights].sort((a, b) => a.land - b.land);
    const landings = byLanding.map((f) => f.land);
    const fused: { path: PathData }[] = [];
    {
      const commands: PathData[number][] = [];
      for (const flight of byLanding) {
        commands.push(...flight.shard.path);
        fused.push({ path: commands.slice() });
      }
    }
    // The flash and the ring fire on the final click; the ring spreads from that shard over
    // the whole logo.
    const finalAt = landings[landings.length - 1] ?? at(FINAL);
    const last = byLanding[byLanding.length - 1]?.shard;
    const ringX = last?.x ?? lcx;
    const ringY = last?.y ?? lcy;
    const ringFrom = 1.5 * u;
    const ringTo =
      Math.max(
        Math.hypot(logoRect.x - ringX, logoRect.y - ringY),
        Math.hypot(logoRect.x + logoW - ringX, logoRect.y - ringY),
        Math.hypot(logoRect.x - ringX, logoRect.y + logoH - ringY),
        Math.hypot(logoRect.x + logoW - ringX, logoRect.y + logoH - ringY),
      ) +
      8 * u;
    const outStart = timeline.sections.out.start;
    const breakAt = atOut(0.1);

    // --- tagline: glyphs rise into their line mask, center-out -----------------------------
    const lines = tagline?.lines ?? [];
    const firstGlyph = lines.map((line) => line.glyphs[0]?.index ?? 0);
    const centers = lines.map((line) => (line.glyphs.length - 1) / 2);
    // 22 ms per glyph from the center, tightening so long taglines finish with the entrance.
    const widest = Math.max(1, ...centers);
    const glyphGap = ctx.stagger(Math.min(0.022, 0.2 / widest));
    const glyphMotion: GlyphTransform = { dy: 0, opacity: 1 };
    let glyphT = 0;
    const animateGlyph = (glyph: Glyph, line: TextLine): GlyphTransform | null => {
      const k = Math.abs(glyph.index - (firstGlyph[line.index] ?? 0) - (centers[line.index] ?? 0));
      const delay = TAGLINE_AT + k * glyphGap;
      const p = timeline.p(glyphT, 'in', { delay, dur: 0.5 }, energy.enter);
      if (p <= 0) return null;
      const shown = timeline.p(glyphT, 'in', { delay, dur: 0.22 });
      const gone = timeline.p(glyphT, 'out', { delay: k * 0.012, dur: 0.24 }, 'exit');
      glyphMotion.dy = (1 - p) * 0.9 * (tagline?.size ?? 0) + gone * 0.5 * (tagline?.size ?? 0);
      glyphMotion.opacity = shown * (1 - gone);
      return glyphMotion.opacity > 0 ? glyphMotion : null;
    };

    // Each line rises inside its own mask.
    const lineDraws = lines.map((line) => {
      const options = { fill: fg, x: taglineX, y: taglineY, glyph: animateGlyph };
      const mask: Rect = {
        x: taglineX + line.mask.x,
        y: taglineY + line.mask.y,
        w: line.mask.w,
        h: line.mask.h,
      };
      return { mask, draw: (g: Draw) => g.text(line, options) };
    });

    // --- frame state (reused, no allocation per shard) ------------------------------------
    const transform: GroupOptions = { opacity: 1 };
    /** A landed shard's pop: it swells for a moment, and its spring settles it. */
    const pop = (since: number) =>
      since < CONTACT
        ? feel.press * Math.sin((Math.PI / 2) * (since / CONTACT))
        : feel.press * (1 - springProgress(since - CONTACT, feel.spring));
    /** Places a landed shard at time t (at rest, swelling with its pop). */
    const landed = (f: Flight, t: number): boolean => {
      transform.opacity = 1;
      const since = t - f.land;
      const scale = feel.press > 0 && since < popTime ? 1 + pop(since) : 1;
      return pose(transform, 0, 0, f.shard.x, f.shard.y, 0, scale, 0, 0);
    };

    /** Places a shard in flight at time t; false when it isn't visible. */
    const inFlight = (f: Flight, t: number): boolean => {
      const span = f.land - f.start;
      const x = span > 0 ? Math.min(1, Math.max(0, (t - f.start) / span)) : 1;
      const q = feel.approach(x);
      const rest = 1 - q;
      let tx = f.dx * rest;
      let ty = f.dy * rest;
      if (f.orbit !== 0) {
        // Swirl: the offset and a reach outward, turned around the logo's center.
        const rx = f.shard.x - lcx + f.dx * rest;
        const ry = f.shard.y - lcy + f.dy * rest;
        const len = Math.hypot(f.shard.x - lcx, f.shard.y - lcy) || 1;
        const ox = rx + ((f.shard.x - lcx) / len) * f.reach * rest;
        const oy = ry + ((f.shard.y - lcy) / len) * f.reach * rest;
        const a = ((f.orbit * rest) / 180) * Math.PI;
        tx = lcx + ox * Math.cos(a) - oy * Math.sin(a) - f.shard.x;
        ty = lcy + ox * Math.sin(a) + oy * Math.cos(a) - f.shard.y;
      }
      const scale = 1 + (f.depth - 1) * rest;
      // Fades in, dims with distance, and darkens as its face tumbles away from the light.
      const facing = Math.abs(Math.cos((f.tilt * rest * Math.PI) / 180));
      transform.opacity =
        Math.min(1, (t - f.start) / APPEAR) *
        (f.depth < 1 ? 0.55 + 0.45 * q : 1) *
        (0.5 + 0.5 * facing);
      return pose(
        transform,
        tx,
        ty,
        f.shard.x,
        f.shard.y,
        f.spin * rest,
        scale,
        f.tilt * rest,
        f.axis,
      );
    };

    /** Places a shard escaping in the out at time t. */
    const escaping = (f: Flight, t: number): boolean => {
      const span = f.outEnd - f.outStart;
      const x = Math.min(1, Math.max(0, (t - f.outStart) / span));
      const p = ease.exit(x);
      transform.opacity = 1 - ease.drift(Math.min(1, Math.max(0, (x - 0.5) / 0.5)));
      if (transform.opacity <= 0) return false;
      const scale = 1 + (f.outDepth - 1) * p;
      return pose(
        transform,
        f.outX * p,
        f.outY * p,
        f.shard.x,
        f.shard.y,
        f.outSpin * p,
        scale,
        f.outTilt * p,
        f.axis,
      );
    };

    // Glints and the final flash, lit additively (and blooming on dark grounds).
    let litT = 0;
    const flashLevel: GroupOptions = { opacity: 0 };
    const drawGlints = (g: Draw) => {
      for (const f of flights) {
        const s = litT - f.land;
        if (s <= 0 || s > 0.25 || !landed(f, litT)) continue;
        transform.opacity = feel.glint * Math.exp(-s / 0.06);
        g.group(transform, f.glow);
      }
      const s = litT - finalAt;
      if (s > 0) {
        flashLevel.opacity = feel.flash * (s < 0.025 ? s / 0.025 : Math.exp(-(s - 0.025) / 0.07));
        if ((flashLevel.opacity ?? 0) > 0.004) g.group(flashLevel, drawLit);
      }
    };
    const glowFx = {
      blend: 'lighter' as const,
      bloom: { radius: 2.2, intensity: 1.1, threshold: 0.35 },
      bounds: logoArea,
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        if (!logo && !tagline) return;

        // Hold: a slow 1.2% push on the whole lockup.
        const push = 1 + 0.012 * tl.p(t, 'hold', {}, 'drift');
        // Punchy: the logo jolts on the final click (a quick, decaying 11 Hz shake).
        const since = t - finalAt;
        const jolt =
          feel.shake > 0 && since > 0 && since < 0.3 ? feel.shake * u * Math.exp(-since / 0.06) : 0;
        const shakeX = jolt * Math.sin(since * 2 * Math.PI * 11);
        const shakeY = 0.6 * jolt * Math.sin(since * 2 * Math.PI * 11 + 1.3);

        g.movable('logo', logoRect, (g) => {
          g.group({ x: shakeX, y: shakeY, scale: push, originX: lcx, originY: pivotY }, (g) => {
            if (!logo) return;
            const breaking = props.out && t >= breakAt;
            if (breaking) {
              for (const f of flights) if (escaping(f, t)) g.group(transform, f.draw);
            } else {
              // The landed shards as one clip (or the whole logo), then every shard in flight,
              // and on top the shards that just landed, swelling with their pop.
              let count = 0;
              while (count < landings.length && (landings[count] ?? 0) <= t) count++;
              if (count === landings.length) drawLogo(g);
              else if (count > 0) g.clip(fused[count - 1] as { path: PathData }, drawLogo);
              if (t < finalAt + popTime) {
                for (const f of flights) {
                  if (t <= f.start) continue;
                  if (t < f.land) {
                    if (inFlight(f, t)) g.group(transform, f.draw);
                  } else if (feel.press > 0 && t - f.land < popTime && landed(f, t)) {
                    g.group(transform, f.draw);
                  }
                }
              }
            }

            // Glints: each landing shard lights up briefly; then the final flash.
            if (!breaking && t > (landings[0] ?? 0) && t < finalAt + 0.4) {
              litT = t;
              if (bloom) g.fx(glowFx, drawGlints);
              else g.group(ADD, drawGlints);
            }

            // The out cracks with a brief flash.
            if (props.out && t > outStart && t < breakAt + 0.12) {
              const s = t - outStart;
              const level =
                0.45 *
                feel.flash *
                Math.sin(Math.PI * Math.min(1, s / (breakAt - outStart + 0.12)));
              if (level > 0.004) g.group({ blend: 'lighter', opacity: level }, drawLit);
            }

            // The shockwave: a thin ring from where the final shard clicked in.
            const r = (t - finalAt) / (0.6 * energy.time);
            if (r > 0 && r < 1) {
              g.circle(ringX, ringY, ringFrom + (ringTo - ringFrom) * ease.glide(r), {
                stroke: { color: ringColor, width: (0.45 * (1 - r) + 0.12) * u },
                opacity: feel.ring * (1 - r) ** 1.6,
              });
            }
          });
          g.editable('logo', logoRect);
        });

        if (tagline && taglineBounds && t > timeline.at('in', TAGLINE_AT)) {
          glyphT = t;
          g.movable('tagline', taglineBounds, (g) => {
            g.group({ scale: push, originX: lcx, originY: pivotY }, (g) => {
              for (const line of lineDraws) g.clip(line.mask, line.draw);
            });
            g.editable('tagline', taglineBounds);
          });
        }
      },
    };
  },
});
