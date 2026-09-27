/**
 * Gravity and bounce (docs/04-motion-language.md §3, "Gravity + bounce"): a parabolic fall from
 * rest, then bounces under the same gravity, each rising to `ratio` × the previous height
 * (restitution e = √ratio, so each flight lasts e × the previous one). Closed form, so any `t`
 * is exact for scrubbing, motion-blur sub-frames and export.
 *
 * Engine candidate: a `gravityBounce` helper (docs/06-engine.md §5 lists it as planned).
 */

export type Impact = {
  /** Seconds. */
  readonly at: number;
  /** Impact speed relative to the first impact (1, e, e², …). */
  readonly speed: number;
};

export type Physics = {
  /** Design units per second² (1 when no distance was given). */
  readonly gravity: number;
  /** Speed at the first impact, design units per second. */
  readonly impactSpeed: number;
  /** The first landing and the landings of each bounce, in order. */
  readonly impacts: readonly Impact[];
  /** The last landing: from here on the base rests on the ground. */
  readonly landed: number;
  /** Height of the base above the ground and its vertical speed (positive = rising). */
  at(t: number): { height: number; speed: number };
};

export function dropPhysics(options: {
  /** Seconds from rest to the first impact. */
  fall: number;
  /** Height of each bounce relative to the previous one (0.55 in the motion language). */
  ratio: number;
  /** Seconds the base sits on the ground at each impact while the logo squashes. */
  contact: number;
  /** Drop height in design units (defaults to 1 for timing-only use). */
  distance?: number;
  /** Visible bounces before the last landing. */
  bounces?: number;
}): Physics {
  const { fall, contact } = options;
  const distance = options.distance ?? 1;
  const bounces = options.bounces ?? 2;
  const e = Math.sqrt(Math.min(0.95, Math.max(0, options.ratio)));
  const gravity = (2 * distance) / (fall * fall);
  const impactSpeed = gravity * fall;

  const impacts: Impact[] = [{ at: fall, speed: 1 }];
  const flights: { start: number; speed: number; length: number }[] = [];
  let t = fall;
  let speed = 1;
  for (let k = 0; k < bounces; k++) {
    speed *= e;
    // Launch speed e^k·v₀ → airtime 2·v/g = 2·e^k·fall.
    const length = 2 * speed * fall;
    flights.push({ start: t + contact, speed: speed * impactSpeed, length });
    t += contact + length;
    impacts.push({ at: t, speed });
  }

  return {
    gravity,
    impactSpeed,
    impacts,
    landed: t,
    at(time) {
      if (time <= 0) return { height: distance, speed: 0 };
      if (time < fall) {
        return { height: distance - 0.5 * gravity * time * time, speed: -gravity * time };
      }
      for (const flight of flights) {
        const tau = time - flight.start;
        if (tau < 0) break;
        if (tau < flight.length) {
          return {
            height: flight.speed * tau - 0.5 * gravity * tau * tau,
            speed: flight.speed - gravity * tau,
          };
        }
      }
      return { height: 0, speed: 0 };
    },
  };
}
