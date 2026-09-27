/**
 * Bounce — playful drop (docs/templates/09-logo-branding.md §9.4).
 *
 * The expensive detail: real physics. One gravity for the fall and every bounce, each bounce
 * rising to 0.55× the previous height (restitution √0.55), so the rhythm of the bounces follows
 * from the drop itself. Squash & stretch preserve volume (scaleX = scaleY^−0.6: 0.82 → 1.12),
 * pivot on the logo's base and stretch with speed on the way down; every impact's squash is
 * released by a named spring whose overshoot becomes the stretch of the rebound. The contact
 * shadow grows, darkens and sharpens as the logo nears the ground.
 */

import {
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  ease,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type Gradient,
  mixOklab,
  type Rect,
  rgb,
  type SpringName,
  springProgress,
  type TextBlock,
  withAlpha,
} from '@/engine';
import { dropPhysics } from './physics';

/** Logo size: height = K / √aspect (in u), so marks and wide lockups carry similar weight. */
const LOGO_K: Record<FormatId, number> = { '16:9': 28, '9:16': 33, '1:1': 30, '4:5': 31 };
/** Widest the logo may get, as a share of the layout area's width. */
const LOGO_MAX_W: Record<FormatId, number> = {
  '16:9': 0.52,
  '9:16': 0.84,
  '1:1': 0.72,
  '4:5': 0.76,
};
const TAGLINE_SIZE: Record<FormatId, number> = { '16:9': 3.7, '9:16': 4.5, '1:1': 4, '4:5': 4.1 };

/** Height of each bounce relative to the previous one (motion language §3: ≈ 0.55). */
const BOUNCINESS = { low: 0.36, medium: 0.55, high: 0.7 } as const;

type Feel = {
  /** Seconds from rest at the top of the frame to the first impact. */
  fall: number;
  /** Squash depth at the first impact (scaleY 1 − squash). */
  squash: number;
  /** Stretch at impact speed (scaleY 1 + stretch). */
  stretch: number;
  /** Releases each impact's squash; its overshoot is the rebound's stretch. */
  spring: SpringName;
  /** Bounce heights relative to the chosen bounciness. */
  lift: number;
  /** Seconds the last squash gets to settle before the hold. */
  settle: number;
};

/** Calm lands softly (low bounces, a spring without wobble); Punchy drops hard and jiggles. */
const FEEL: Record<'calm' | 'balanced' | 'punchy', Feel> = {
  calm: { fall: 0.5, squash: 0.1, stretch: 0.04, spring: 'snappy', lift: 0.72, settle: 0.22 },
  balanced: { fall: 0.45, squash: 0.18, stretch: 0.08, spring: 'bouncy', lift: 1, settle: 0.26 },
  punchy: { fall: 0.36, squash: 0.24, stretch: 0.1, spring: 'bouncy', lift: 1.08, settle: 0.26 },
};

/** Ground contact per impact: the base sits on the ground while the logo squashes. */
const CONTACT = 0.05;
/** One tagline letter's drop-in. */
const LETTER = 0.36;
/** The tagline starts during the last bounce: this long before its landing, or sooner. */
const LETTERS_LEAD = 0.45;

/** When the tagline starts: in the last bounce, never later than just after the one before. */
const lettersStart = (physics: { landed: number; impacts: readonly { at: number }[] }) =>
  Math.min(
    physics.landed - LETTERS_LEAD,
    (physics.impacts[physics.impacts.length - 2]?.at ?? physics.landed) + 0.1,
  );
/** Out: letters drop away, the logo crouches and jumps out of the top of the frame. */
const OUT = 0.5;
/** The gallery's hero frame: the finished lockup, before the idle hop. */
const POSTER = 2.9;

const feelOf = (energy: string): Feel => FEEL[energy as keyof typeof FEEL] ?? FEEL.balanced;

/** Letter gap: 30 ms, tightening for long taglines so the stagger never crawls. */
const letterGap = (count: number) => (count > 1 ? Math.min(0.03, 0.42 / (count - 1)) : 0);

export default defineTemplate({
  id: 'bounce',
  version: 1,
  meta: {
    name: 'Bounce',
    tagline: 'Playful drop',
    category: 'logo-branding',
    tags: ['logo', 'bounce', 'playful', 'physics'],
    useCases: ["Kids' brands", 'Apps', 'Food & drink', 'Friendly startups'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 4, min: 3, max: 8 },
  alpha: 'optional',
  poster: POSTER,
  palettes: [
    { kind: 'library', id: 'acid' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'cobalt' },
  ],
  pairings: ['wide', 'grotesk', 'soft', 'quirky', 'poster'],
  controls: {
    logo: c.image({ label: 'Logo', accept: 'logo', default: { kind: 'placeholder', id: 'aero' } }),
    tagline: c.text({
      label: 'Tagline',
      default: 'Good things, daily',
      maxLength: 40,
      optional: true,
    }),
    shadow: c.toggle({ label: 'Shadow', default: true }),
    burst: c.toggle({ label: 'Burst', default: true, hint: 'Impact lines at the first landing' }),
    color: c.choice({
      label: 'Logo color',
      default: 'original',
      options: [
        { value: 'original', label: 'Original' },
        { value: 'mono', label: 'Mono' },
        { value: 'accent', label: 'Accent' },
      ],
    }),
    bounciness: c.choice({
      label: 'Bounciness',
      group: 'motion',
      default: 'medium',
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
    }),
    out: c.toggle({ label: 'Out', group: 'motion', default: false, hint: 'Adds an exit' }),
  },
  looks: [
    { id: 'acid', name: 'Acid', palette: { kind: 'library', id: 'acid' }, pairing: 'wide' },
    { id: 'candy', name: 'Candy', palette: { kind: 'library', id: 'candy' }, pairing: 'wide' },
    {
      id: 'paper',
      name: 'Paper',
      palette: { kind: 'library', id: 'paper' },
      pairing: 'grotesk',
      values: { color: 'accent' },
    },
  ],
  // The entrance is the drop, its bounces and the last squash settling, with the tagline
  // bouncing in from the last bounce on. Without Out the last frame is the finished logo (an
  // end card); with it, the exit ends a touch early. Energy's timing lives in the physics, so
  // the sections are given in real seconds (the engine multiplies them by energy.time).
  timing: ({ props, energy }) => {
    const feel = feelOf(energy.id);
    const physics = dropPhysics({
      fall: feel.fall,
      ratio: BOUNCINESS[props.bounciness] * feel.lift,
      contact: CONTACT,
    });
    const letters = [...props.tagline.trim()].length;
    const tagline =
      letters > 0 ? lettersStart(physics) + letterGap(letters) * (letters - 1) + LETTER : 0;
    const entrance = Math.max(physics.landed + feel.settle, tagline);
    return {
      in: entrance / energy.time,
      out: props.out ? OUT / energy.time : 0,
      tail: props.out ? CLEAN_END : 0,
    };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, accent } = palette.roles;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const logo = ctx.graphic('logo');
    const feel = feelOf(energy.id);

    // --- tagline ------------------------------------------------------------------------
    const taglineText = props.tagline.trim();
    const taglineW = area.w * 0.92;
    const tagline: TextBlock | null = taglineText
      ? text.layout(taglineText, {
          style: {
            font: pairing.text.font,
            size: TAGLINE_SIZE[frame.format] * u,
            weight: 600,
            width: pairing.text.width,
            tracking: 0.01,
            features: pairing.text.features,
          },
          maxWidth: taglineW,
          maxLines: 2,
          lineHeight: 1.25,
          align: 'center',
          fit: { minSize: 2.6 * u },
        })
      : null;

    // --- layout: the logo rests on a ground line, the tagline hangs below its shadow ------
    const aspect = logo && logo.ink.w > 0 && logo.ink.h > 0 ? logo.ink.w / logo.ink.h : 1;
    let logoH = (LOGO_K[frame.format] * u) / Math.sqrt(aspect);
    let logoW = logoH * aspect;
    const maxW = area.w * LOGO_MAX_W[frame.format];
    if (logoW > maxW) {
      logoW = maxW;
      logoH = maxW / aspect;
    }
    const gap = 6.5 * u;
    const blockH = logoH + (tagline ? gap + tagline.height : 0);
    // Optically centered: a touch above the geometric center.
    const top = area.y + (area.h - blockH) * 0.46;
    const ground = top + logoH;
    const cx = frame.cx;
    const logoRect: Rect = { x: cx - logoW / 2, y: top, w: logoW, h: logoH };
    const taglineX = cx - taglineW / 2;
    const taglineY = ground + gap;
    const taglineBounds: Rect | null = tagline
      ? {
          x: taglineX + tagline.ink.x,
          y: taglineY + tagline.ink.y,
          w: tagline.ink.w,
          h: tagline.ink.h,
        }
      : null;

    // --- physics: dropped from rest just above the frame onto the ground line -------------
    // At t = 0 the base touches the top edge from above: the logo is out of sight and still.
    const drop = ground;
    // The first bounce may not carry the logo out of the frame: tall marks bounce a little
    // lower (timing() can't see the logo, so its sections are a touch conservative then).
    const headroom = 1 - (logoH * (1 + feel.stretch) + 1.5 * u) / drop;
    const physics = dropPhysics({
      fall: feel.fall,
      ratio: Math.min(BOUNCINESS[props.bounciness] * feel.lift, headroom),
      contact: CONTACT,
      distance: drop,
    });
    const squashes = physics.impacts.map((impact) => ({
      at: impact.at,
      depth: feel.squash * impact.speed,
    }));
    /** Squash (positive) or stretch (negative) from the springs of every impact so far. */
    const deformation = (t: number) => {
      let d = 0;
      for (const { at, depth } of squashes) {
        const tau = t - at;
        if (tau < 0) break;
        // Contact: the squash builds while the base sits on the ground; then the spring lets
        // go, and its overshoot stretches the rebound.
        d +=
          tau < CONTACT
            ? depth * Math.sin((Math.PI / 2) * (tau / CONTACT))
            : depth * (1 - springProgress(tau - CONTACT, feel.spring));
      }
      return d;
    };

    const tint = props.color === 'mono' ? fg : props.color === 'accent' ? accent : null;
    // A contact shadow darker than the ground (on dark grounds: black).
    const shade: Color = palette.dark ? rgb(0, 0, 0) : mixOklab(fg, rgb(0, 0, 0), 0.35);
    const shadowPeak = palette.dark ? 0.5 : 0.26;
    const shadowR = logoW * 0.52;

    // --- burst: impact lines fanning out from the base corners at the first landing -------
    const rng = ctx.rng('burst');
    const burst = [-1, 1].flatMap((side) =>
      [10, 34, 58].map((deg) => {
        const a = ((deg + rng.range(-6, 6)) * Math.PI) / 180;
        const length = 7 * u * rng.range(0.85, 1.15) * (0.8 + 0.2 * energy.travel);
        return { dx: side * Math.cos(a), dy: -Math.sin(a), length, side };
      }),
    );
    const burstAt = physics.impacts[0]?.at ?? feel.fall;
    const burstWidth = 0.6 * u;
    const burstReach = (logoW / 2) * (1 + feel.squash * 0.7) + 1.2 * u;

    // --- tagline letters -----------------------------------------------------------------
    const letters = tagline ? tagline.glyphCount : 0;
    const lgap = letterGap(letters);
    const letterStart = lettersStart(physics);
    const hop = 3.2 * u * energy.travel ** 0.5;
    const motion: GlyphTransform = { dy: 0, opacity: 1, scaleY: 1 };
    let lettersT = 0;
    let lettersOut = 0;
    const animateLetter = (glyph: Glyph): GlyphTransform | null => {
      const local = lettersT - letterStart - glyph.index * lgap;
      if (local <= 0) return null;
      const p = Math.min(1, local / LETTER);
      // Each letter drops in and lands with the `pop` overshoot, stretched while it falls.
      const pop = ease.pop(p);
      motion.dy = -(1 - pop) * hop + lettersOut * 2.5 * u;
      motion.opacity = Math.min(1, local / 0.08) * (1 - lettersOut);
      motion.scaleY = 1 + 0.14 * (1 - p) * (1 - p);
      return motion;
    };

    // --- out: letters drop away, the logo crouches and jumps out of the top of the frame --
    const outStart = timeline.sections.out.start;
    const crouch = 0.14;
    const leave = OUT - crouch - 0.08;
    const exitHeight = ground + logoH * 1.3 + 4 * u;
    const exitSpeed = (exitHeight + 0.5 * physics.gravity * leave * leave) / leave;

    // --- hold: one small idle hop (a slow breath in Calm) when the hold has room for it ---
    const hold = timeline.sections.hold;
    const holdLength = hold.end - hold.start;
    // After the gallery's poster frame, and settled well before the end card.
    const idleStart = Math.max(hold.start + Math.max(0.85, holdLength * 0.42), POSTER + 0.08);
    const hopHeight = 3.4 * u * (BOUNCINESS[props.bounciness] / 0.55) ** 0.7 * energy.travel ** 0.5;
    const hopSpeed = Math.sqrt(2 * physics.gravity * hopHeight);
    const hopAir = (2 * hopSpeed) / physics.gravity;
    const hopCrouch = 0.1;
    const hopDepth = feel.squash * (hopSpeed / physics.impactSpeed);
    const idle = holdLength >= 1.5 && idleStart + hopCrouch + hopAir + 0.55 <= hold.end;
    /** Adds the idle hop to a pose (height, speed, squash) at time t. */
    const idlePose = (t: number, pose: { height: number; speed: number; d: number }) => {
      const tau = t - idleStart;
      if (!idle || tau <= 0) return;
      if (energy.id === 'calm') {
        // One slow breath: the logo swells 1.2% from its base and settles.
        pose.d -= 0.012 * Math.sin(Math.PI * ease.drift(Math.min(1, tau / 1.3)));
        return;
      }
      if (tau < hopCrouch) {
        pose.d += 0.06 * Math.sin(Math.PI * (tau / hopCrouch));
      } else if (tau < hopCrouch + hopAir) {
        const air = tau - hopCrouch;
        pose.height = hopSpeed * air - 0.5 * physics.gravity * air * air;
        pose.speed = hopSpeed - physics.gravity * air;
      } else {
        const land = tau - hopCrouch - hopAir;
        pose.d +=
          land < CONTACT
            ? hopDepth * Math.sin((Math.PI / 2) * (land / CONTACT))
            : hopDepth * (1 - springProgress(land - CONTACT, feel.spring));
      }
    };
    const pose = { height: 0, speed: 0, d: 0 };

    const drawLogo = (g: Draw) => {
      if (logo) g.graphic(logo, logoRect, { tint, current: fg });
    };

    return {
      render: ({ t, g }) => {
        g.fill(bg, { background: true });
        if (!logo && !tagline) return;

        // Height of the base above the ground, its speed (for the stretch) and its squash.
        const fall = physics.at(t);
        pose.height = fall.height;
        pose.speed = fall.speed;
        pose.d = deformation(t);
        idlePose(t, pose);
        let { height, speed, d } = pose;
        let stretch = feel.stretch * Math.min(1, Math.abs(speed) / physics.impactSpeed);

        if (props.out && t > outStart) {
          const exitT = t - outStart;
          if (exitT < crouch) {
            d += feel.squash * 0.7 * Math.sin((Math.PI / 2) * (exitT / crouch));
          } else {
            const tau = exitT - crouch;
            d += feel.squash * 0.7 * (1 - springProgress(tau, 'snappy'));
            height = exitSpeed * tau - 0.5 * physics.gravity * tau * tau;
            speed = exitSpeed - physics.gravity * tau;
            stretch = feel.stretch * 1.5 * Math.min(1, Math.abs(speed) / physics.impactSpeed);
          }
        }

        const scaleY = (1 + stretch) * (1 - d);
        const scaleX = scaleY ** -0.6;
        // Out of sight at t = 0 wherever the user moved the logo.
        const presence = Math.min(1, t / 0.04);

        g.movable('logo', logoRect, (g) => {
          // Contact shadow: grows, darkens and sharpens as the logo comes down.
          const near = Math.max(0, 1 - height / drop);
          const strength = near * near * near * presence;
          if (props.shadow && strength > 0.002) {
            const r = shadowR * (0.55 + 0.45 * near) * scaleX ** 0.5;
            const fill: Gradient = {
              kind: 'radial',
              cx,
              cy: ground,
              r,
              stops: [
                { offset: 0, color: withAlpha(shade, shadowPeak * strength) },
                { offset: 0.2 + 0.45 * near, color: withAlpha(shade, shadowPeak * strength * 0.7) },
                { offset: 1, color: withAlpha(shade, 0) },
              ],
            };
            g.group({ scaleY: 0.11, originX: cx, originY: ground }, (g) =>
              g.circle(cx, ground, r, { fill }),
            );
          }

          // Impact lines at the first landing, from the squashed base corners outward.
          const b = t - burstAt;
          if (props.burst && b > 0 && b < 0.42) {
            const head = ease.glide(Math.min(1, b / 0.26));
            const tail = ease.glide(Math.max(0, Math.min(1, (b - 0.08) / 0.32)));
            if (tail < 1) {
              for (const line of burst) {
                const x0 = cx + line.side * burstReach;
                const y0 = ground - 0.6 * u;
                g.line(
                  x0 + line.dx * line.length * tail,
                  y0 + line.dy * line.length * tail,
                  x0 + line.dx * line.length * head,
                  y0 + line.dy * line.length * head,
                  { color: accent, width: burstWidth * (1 - 0.5 * tail), cap: 'round' },
                );
              }
            }
          }

          if (presence > 0) {
            g.group(
              { y: -height, scaleX, scaleY, originX: cx, originY: ground, opacity: presence },
              drawLogo,
            );
          }
          g.editable('logo', logoRect);
        });

        if (tagline && taglineBounds && t > letterStart) {
          lettersT = t;
          lettersOut = props.out ? ease.exit(Math.min(1, Math.max(0, (t - outStart) / 0.28))) : 0;
          if (lettersOut < 1) {
            g.movable('tagline', taglineBounds, (g) => {
              g.text(tagline, { fill: fg, x: taglineX, y: taglineY, glyph: animateLetter });
              g.editable('tagline', taglineBounds);
            });
          }
        }
      },
    };
  },
});
