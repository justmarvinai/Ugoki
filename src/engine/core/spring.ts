/**
 * Closed-form damped harmonic oscillator (docs/04-motion-language.md §3). Evaluating a spring
 * at any time `t` is O(1) and exact, so scrubbing, motion-blur sub-frames and exports agree.
 */

export type SpringConfig = {
  stiffness: number;
  damping: number;
  mass: number;
};

export const SPRINGS = {
  /** ζ≈0.91 — large, calm moves (devices, cameras). */
  gentle: { stiffness: 120, damping: 20, mass: 1 },
  /** ζ=0.70, ~4.6% overshoot — UI, pills, bubbles, layout pushes. */
  snappy: { stiffness: 400, damping: 28, mass: 1 },
  /** ζ≈0.56, ~12% overshoot — Punchy energy's entrances (motion language §4: ≤ 15%). */
  lively: { stiffness: 500, damping: 25, mass: 1 },
  /** ζ≈0.35, ~31% overshoot — playful templates only. */
  bouncy: { stiffness: 300, damping: 12, mass: 1 },
  /** ζ≈1.03, no overshoot — slow, weighty settles. */
  heavy: { stiffness: 40, damping: 13, mass: 1 },
} as const satisfies Record<string, SpringConfig>;

export type SpringName = keyof typeof SPRINGS;

export function resolveSpring(spring: SpringName | SpringConfig): SpringConfig {
  return typeof spring === 'string' ? SPRINGS[spring] : spring;
}

export function dampingRatio(spring: SpringConfig): number {
  return spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
}

/**
 * Normalized step response: 0 at t=0, settling at 1. `velocity` is the initial velocity in
 * "distances per second" (e.g. 2 = moving two full distances per second at t=0).
 */
export function springProgress(t: number, spring: SpringName | SpringConfig, velocity = 0): number {
  if (t <= 0) return 0;
  const { stiffness, damping, mass } = resolveSpring(spring);
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * w0 * t);
    return 1 - envelope * (Math.cos(wd * t) + ((zeta * w0 - velocity) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) {
    return 1 + (-1 + (velocity - w0) * t) * Math.exp(-w0 * t);
  }
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - root);
  const r2 = -w0 * (zeta + root);
  const c1 = (velocity + r2) / (r1 - r2);
  const c2 = -1 - c1;
  return 1 + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
}

/** Spring from `from` to `to`, `t` seconds after it started. */
export function spring(
  t: number,
  from: number,
  to: number,
  config: SpringName | SpringConfig = 'snappy',
  velocity = 0,
): number {
  return from + (to - from) * springProgress(t, config, velocity);
}

const settleCache = new Map<string, number>();

/**
 * Time after which the spring stays within `tolerance` of its target (default 0.1% of the
 * distance). Used to size timeline sections that end with a spring.
 */
export function springSettleTime(spring: SpringName | SpringConfig, tolerance = 0.001): number {
  const config = resolveSpring(spring);
  const key = `${config.stiffness}/${config.damping}/${config.mass}/${tolerance}`;
  const cached = settleCache.get(key);
  if (cached !== undefined) return cached;

  const step = 1 / 600;
  let lastOutside = 0;
  for (let t = 0; t < 10; t += step) {
    if (Math.abs(springProgress(t, config) - 1) > tolerance) lastOutside = t;
  }
  const settle = Math.min(10, lastOutside + step);
  settleCache.set(key, settle);
  return settle;
}
