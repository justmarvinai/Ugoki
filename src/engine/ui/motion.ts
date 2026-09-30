/**
 * Motion of real interfaces, closed-form or tabulated in `build` so `render` stays random-access:
 *
 * - `InertialScroll` — a person scrolling: the finger drags, lets go, the page glides on an
 *   exponential decay (v = v₀·e^(−t/τ), τ ≈ 0.325 s, docs/04-motion-language.md §3) and, thrown
 *   past an end, rubber-bands back.
 * - `SpringChain` — coupled springs: a leader steps, each follower is sprung to the one before
 *   it, so a push travels down a stack a beat later per link.
 * - `springRange` — a range whose leading edge runs on a stiffer spring than its trailing edge:
 *   it stretches along its travel and settles (a selection highlight gliding between rows).
 */

import { resolveSpring, type SpringConfig, type SpringName, springProgress } from '../core/spring';

// --- inertial scroll ------------------------------------------------------------------------

/** iOS-like decay (motion language §3). */
const TAU = 0.325;
/** Finger contact before release. */
const DRAG = 0.12;
/** Share of the travel left when a glide counts as settled (for choreography). */
const SETTLED = 0.01;

export type FlickOptions = {
  /** When the finger touches (seconds). */
  at: number;
  /**
   * Where the page comes to rest. Beyond the scroll range the throw carries the page past the
   * end, which it rubber-bands back to.
   */
  to: number;
  /** Finger contact before release (s, default 0.12). */
  drag?: number;
  /** Decay time constant after release (s, default 0.325). */
  tau?: number;
  /** Length of the glide after release (s, default 6τ); it lands exactly at its end. */
  glide?: number;
};

type Flick = {
  start: number;
  release: number;
  end: number;
  from: number;
  /** Where the page rests (within bounds). */
  rest: number;
  /** Where an unbounded glide would come to rest. */
  target: number;
  drag: number;
  tau: number;
  glide: number;
  /** Velocity at release (units/s). */
  v0: number;
  /** Distance covered while dragging. */
  dragDistance: number;
  /** Distance covered by the (normalized) glide. */
  glideDistance: number;
  /** Glide shape: f(u) = 1 − e^(−u/τ) − u·e^(−T/τ)/τ, normalized by f(T). */
  fT: number;
  tail: number;
  /** Rubber band: the time (from start) the glide crosses the bound, its velocity, the bound. */
  cross: { at: number; v: number; bound: number } | null;
  settled: number;
};

/** A flick's public timing (seconds, absolute). */
export type FlickTiming = {
  readonly start: number;
  readonly release: number;
  /** When the page looks settled (99% of the way). */
  readonly settled: number;
  readonly end: number;
  readonly from: number;
  readonly rest: number;
  /** The flick ran into an end and rubber-banded. */
  readonly bounced: boolean;
};

/**
 * A scroll position driven by flicks (all random access): each flick starts from wherever the
 * page is when the finger lands — catching a glide stops it, as a real finger does — drags with
 * rising speed, and glides out exponentially to its rest. A glide that would run past `min` or
 * `max` hits the end with its velocity and springs back from a rubber-banded overscroll.
 */
export class InertialScroll {
  readonly min: number;
  readonly max: number;
  private readonly flicks: Flick[] = [];
  private readonly start: number;
  /** Stiffness of the rubber band's return (ω, rad/s) and its softness limit (units). */
  private readonly omega: number;
  private readonly limit: number;

  constructor(options: {
    max: number;
    min?: number;
    /** Resting position before the first flick (default `min`). */
    start?: number;
    /** Largest overscroll the rubber band allows (units, default 12% of the range or 80). */
    limit?: number;
    /** Return speed of the rubber band (ω of a critically damped spring, default 13). */
    stiffness?: number;
  }) {
    this.min = options.min ?? 0;
    this.max = Math.max(this.min, options.max);
    this.start = options.start ?? this.min;
    this.limit = options.limit ?? Math.max(24, Math.min(160, (this.max - this.min) * 0.12 || 80));
    this.omega = options.stiffness ?? 13;
  }

  /** Where the page rests after every flick so far. */
  get position(): number {
    return this.flicks[this.flicks.length - 1]?.rest ?? this.start;
  }

  /** When the last flick ends. */
  get time(): number {
    return this.flicks[this.flicks.length - 1]?.end ?? 0;
  }

  /** Timing of every flick. */
  get timings(): readonly FlickTiming[] {
    return this.flicks.map((f) => ({
      start: f.start,
      release: f.release,
      settled: f.settled,
      end: f.end,
      from: f.from,
      rest: f.rest,
      bounced: f.cross !== null,
    }));
  }

  /** Adds a flick (flicks must be added in time order). */
  flick(options: FlickOptions): this {
    const start = options.at;
    const from = this.at(start);
    const drag = Math.max(0.02, options.drag ?? DRAG);
    const tau = Math.max(0.05, options.tau ?? TAU);
    const glide = Math.max(tau * 2, options.glide ?? tau * 6);
    const target = options.to;
    const rest = Math.max(this.min, Math.min(this.max, target));
    const e = Math.exp(-glide / tau);
    const fT = 1 - e - (glide * e) / tau;
    // Glide velocity per unit of glide distance at u = 0.
    const c = (1 - e) / (tau * fT);
    const distance = target - from;
    const glideDistance = distance / (1 + 0.5 * c * drag);
    const v0 = c * glideDistance;
    const flick: Flick = {
      start,
      release: start + drag,
      end: start + drag + glide,
      from,
      rest,
      target,
      drag,
      tau,
      glide,
      v0,
      dragDistance: 0.5 * v0 * drag,
      glideDistance,
      fT,
      tail: e / tau,
      cross: null,
      settled: start + drag + glide,
    };
    if (target !== rest) {
      // Find where the free glide crosses the bound, and its velocity there.
      const bound = rest;
      let lo = 0;
      let hi = drag + glide;
      const past = (s: number) => (this.free(flick, s) - bound) * Math.sign(distance) >= 0;
      if (past(hi)) {
        for (let i = 0; i < 48; i++) {
          const mid = (lo + hi) / 2;
          if (past(mid)) hi = mid;
          else lo = mid;
        }
        const at = hi;
        flick.cross = { at, v: this.freeVelocity(flick, at), bound };
        // Critically damped return: settled once within 1% of the peak (≈ 6.6 / ω).
        flick.end = start + at + 7 / this.omega;
        flick.settled = start + at + 5 / this.omega;
      }
    }
    if (!flick.cross) {
      // Settled at 99% of the glide: solve f(u)/f(T) = 1 − SETTLED.
      let lo = 0;
      let hi = glide;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (this.glideShape(flick, mid) >= 1 - SETTLED) hi = mid;
        else lo = mid;
      }
      flick.settled = start + drag + hi;
    }
    this.flicks.push(flick);
    return this;
  }

  /** Position at `t`. */
  at(t: number): number {
    const flick = this.flickAt(t);
    if (!flick) return this.start;
    const s = t - flick.start;
    if (flick.cross && s >= flick.cross.at) {
      const u = s - flick.cross.at;
      const { v, bound } = flick.cross;
      // Overscroll of a critically damped spring launched from the bound, softened by a
      // rubber band so hard throws don't pull the page too far.
      const raw = v * u * Math.exp(-this.omega * u);
      const sign = Math.sign(raw);
      const x = Math.abs(raw);
      return bound + sign * this.limit * (1 - 1 / (1 + x / this.limit));
    }
    return this.free(flick, Math.min(s, flick.drag + flick.glide));
  }

  /** Velocity at `t` (units/s), by central difference. */
  velocity(t: number): number {
    const h = 1 / 960;
    return (this.at(t + h) - this.at(t - h)) / (2 * h);
  }

  /** The flick that governs `t` (the last one started by then). */
  private flickAt(t: number): Flick | null {
    for (let i = this.flicks.length - 1; i >= 0; i--) {
      const flick = this.flicks[i] as Flick;
      if (t >= flick.start) return flick;
    }
    return null;
  }

  /** f(u)/f(T): 0 → 1 over the glide, zero velocity at its end. */
  private glideShape(flick: Flick, u: number): number {
    const x = Math.max(0, Math.min(flick.glide, u));
    return (1 - Math.exp(-x / flick.tau) - x * flick.tail) / flick.fT;
  }

  /** Unbounded position `s` seconds after the finger landed. */
  private free(flick: Flick, s: number): number {
    if (s <= 0) return flick.from;
    if (s < flick.drag) {
      // Constant acceleration up to the release velocity: the finger speeding up.
      return flick.from + (0.5 * flick.v0 * s * s) / flick.drag;
    }
    return (
      flick.from + flick.dragDistance + flick.glideDistance * this.glideShape(flick, s - flick.drag)
    );
  }

  private freeVelocity(flick: Flick, s: number): number {
    if (s < flick.drag) return (flick.v0 * s) / flick.drag;
    const u = Math.min(flick.glide, s - flick.drag);
    return (flick.glideDistance * (Math.exp(-u / flick.tau) / flick.tau - flick.tail)) / flick.fT;
  }
}

// --- coupled springs ------------------------------------------------------------------------

export type SpringChainOptions = {
  /** Links in the chain, the leader included (≥ 1). */
  links: number;
  /** The leader's spring: it steps from 0 to 1 (default `snappy`). */
  lead?: SpringName | SpringConfig;
  /** Each follower's spring to the link before it (default: the leader's). */
  follow?: SpringName | SpringConfig;
  /** An extra pure delay per link (seconds, default 0). */
  delay?: number;
};

/** Samples per second of the tabulated responses. */
const RATE = 480;
/** Integration steps per sample. */
const SUBSTEPS = 4;
/** Longest simulated response (seconds). */
const LONGEST = 4;

/**
 * Coupled springs, tabulated once: link 0 is a spring stepping from 0 to 1; link n is a spring
 * pulled toward link n − 1. A push travels down the chain — each link starts later, softer and
 * a little behind — like cards in a stack reacting a beat after the one that lands on them.
 * The system is linear, so a template adds responses (one per event, scaled by that event's
 * distance) to move things through several pushes. Random access: `at(link, τ)`.
 */
export class SpringChain {
  readonly links: number;
  /** Seconds until every link stays within 0.1% of 1. */
  readonly settle: number;
  private readonly delay: number;
  private readonly samples: number;
  private readonly table: Float64Array;

  constructor(options: SpringChainOptions) {
    this.links = Math.max(1, Math.floor(options.links));
    this.delay = Math.max(0, options.delay ?? 0);
    const lead = resolveSpring(options.lead ?? 'snappy');
    const follow = resolveSpring(options.follow ?? lead);
    const n = this.links;
    this.samples = Math.ceil(LONGEST * RATE) + 1;
    const table = new Float64Array(n * this.samples);
    const k = follow.stiffness / follow.mass;
    const c = follow.damping / follow.mass;
    const dt = 1 / (RATE * SUBSTEPS);
    // Followers' state, RK4 stage state, stage derivatives and their weighted sums.
    const x = new Float64Array(n);
    const v = new Float64Array(n);
    const sx = new Float64Array(n);
    const sv = new Float64Array(n);
    const dx = new Float64Array(n);
    const dv = new Float64Array(n);
    const ax = new Float64Array(n);
    const av = new Float64Array(n);
    /** Derivatives at `time` for the state (px, pv); the leader follows its closed form. */
    const derive = (time: number, px: Float64Array, pv: Float64Array) => {
      const leader = springProgress(time, lead);
      for (let i = 1; i < n; i++) {
        const pull = (i === 1 ? leader : (px[i - 1] as number)) - (px[i] as number);
        dx[i] = pv[i] as number;
        dv[i] = k * pull - c * (pv[i] as number);
      }
    };
    /** Accumulates a stage (weight w) and prepares the next stage's state `h` ahead. */
    const stage = (w: number, h: number) => {
      for (let i = 1; i < n; i++) {
        ax[i] = (ax[i] as number) + w * (dx[i] as number);
        av[i] = (av[i] as number) + w * (dv[i] as number);
        sx[i] = (x[i] as number) + h * (dx[i] as number);
        sv[i] = (v[i] as number) + h * (dv[i] as number);
      }
    };
    let settled = 0;
    for (let s = 0; s < this.samples; s++) {
      const time = s / RATE;
      x[0] = springProgress(time, lead);
      for (let i = 0; i < n; i++) {
        const value = x[i] as number;
        table[i * this.samples + s] = value;
        if (Math.abs(value - 1) > 0.001) settled = time;
      }
      for (let step = 0; step < SUBSTEPS; step++) {
        const t0 = time + step * dt;
        ax.fill(0);
        av.fill(0);
        derive(t0, x, v);
        stage(1, dt / 2);
        derive(t0 + dt / 2, sx, sv);
        stage(2, dt / 2);
        derive(t0 + dt / 2, sx, sv);
        stage(2, dt);
        derive(t0 + dt, sx, sv);
        stage(1, 0);
        for (let i = 1; i < n; i++) {
          x[i] = (x[i] as number) + (dt / 6) * (ax[i] as number);
          v[i] = (v[i] as number) + (dt / 6) * (av[i] as number);
        }
      }
    }
    this.table = table;
    this.settle = settled + this.delay * (n - 1);
  }

  /** Progress of `link` (0 = leader) `tau` seconds after the step: 0 → 1, may overshoot. */
  at(link: number, tau: number): number {
    const i = Math.max(0, Math.min(this.links - 1, Math.floor(link)));
    const local = tau - this.delay * i;
    if (local <= 0) return 0;
    const f = local * RATE;
    const s = Math.floor(f);
    if (s >= this.samples - 1) return 1;
    const row = i * this.samples;
    const a = this.table[row + s] as number;
    const b = this.table[row + s + 1] as number;
    return a + (b - a) * (f - s);
  }
}

// --- stretching range -----------------------------------------------------------------------

export type SpringRange = { start: number; end: number };

/**
 * A range [start, end] moving from one place to another on two springs: the edge leading the
 * travel runs on `lead`, the trailing edge on the softer `trail`, so the range stretches in
 * the direction it moves and settles back to its size — the gliding selection of a real list.
 * `t` is seconds since the move began; `out` is reused.
 */
export function springRange(
  t: number,
  from: SpringRange,
  to: SpringRange,
  options: { lead?: SpringName | SpringConfig; trail?: SpringName | SpringConfig } = {},
  out: SpringRange = { start: 0, end: 0 },
): SpringRange {
  const lead = options.lead ?? { stiffness: 520, damping: 36, mass: 1 };
  const trail = options.trail ?? { stiffness: 260, damping: 28, mass: 1 };
  const down = to.start + to.end >= from.start + from.end;
  const pl = t <= 0 ? 0 : springProgress(t, lead);
  const pt = t <= 0 ? 0 : springProgress(t, trail);
  const startP = down ? pt : pl;
  const endP = down ? pl : pt;
  out.start = from.start + (to.start - from.start) * startP;
  out.end = from.end + (to.end - from.end) * endP;
  if (out.end < out.start) {
    const mid = (out.start + out.end) / 2;
    out.start = mid;
    out.end = mid;
  }
  return out;
}

/**
 * A range that moves several times on stretching springs (see `springRange`): moves superpose,
 * so a second move can start before the first has settled and nothing jumps. Build it in
 * `build` — `new StretchTrack(first).move(second, t1).move(third, t2)` — and read it in `render`.
 */
export class StretchTrack {
  private readonly moves: { at: number; start: number; end: number; down: boolean }[] = [];
  private last: SpringRange;

  constructor(
    private readonly first: SpringRange,
    private readonly options: {
      lead?: SpringName | SpringConfig;
      trail?: SpringName | SpringConfig;
    } = {},
  ) {
    this.last = { ...first };
  }

  /** Moves to `to` at time `at` (moves must be added in time order). */
  move(to: SpringRange, at: number): this {
    const down = to.start + to.end >= this.last.start + this.last.end;
    this.moves.push({ at, start: to.start - this.last.start, end: to.end - this.last.end, down });
    this.last = { ...to };
    return this;
  }

  /** Where the range ends up. */
  get target(): SpringRange {
    return this.last;
  }

  at(t: number, out: SpringRange = { start: 0, end: 0 }): SpringRange {
    const lead = this.options.lead ?? { stiffness: 520, damping: 36, mass: 1 };
    const trail = this.options.trail ?? { stiffness: 260, damping: 28, mass: 1 };
    let start = this.first.start;
    let end = this.first.end;
    for (const m of this.moves) {
      const local = t - m.at;
      if (local <= 0) break;
      const pl = springProgress(local, lead);
      const pt = springProgress(local, trail);
      start += m.start * (m.down ? pt : pl);
      end += m.end * (m.down ? pl : pt);
    }
    if (end < start) {
      const mid = (start + end) / 2;
      start = mid;
      end = mid;
    }
    out.start = start;
    out.end = end;
    return out;
  }
}
