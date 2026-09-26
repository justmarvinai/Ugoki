/**
 * Adaptive render scale (docs/06-engine.md §10). While playing, a view steps its render scale
 * between full and half resolution to hold ~60 fps; paused frames always render at full scale,
 * so what you see when paused is what exports.
 *
 * Two signals drive it: the recorded cost of `render` (CPU) and the achieved frame interval,
 * which also catches rasterization falling behind on the GPU. Stepping back up needs sustained
 * headroom and a cooldown that doubles after every drop, so the scale doesn't oscillate.
 */

export const QUALITY_LEVELS = [1, 0.75, 0.5] as const;

/** Frame interval (ms) above which playback counts as struggling (~45 fps). */
const SLOW_INTERVAL = 22;
/** Frame interval (ms) below which playback is comfortably at 60 fps. */
const SMOOTH_INTERVAL = 18;
const MIN_SAMPLES = 12;
/** Minimum time between two drops (ms), so a single hiccup can't cascade. */
const DROP_INTERVAL = 500;
const INITIAL_COOLDOWN = 2000;
const MAX_COOLDOWN = 16000;

export class AdaptiveQuality {
  private level = 0;
  private cost = 0;
  private interval = 0;
  private samples = 0;
  private lastChange = Number.NEGATIVE_INFINITY;
  private cooldown = INITIAL_COOLDOWN;

  /** @param budget CPU milliseconds per frame this view may spend recording. */
  constructor(private budget = 8) {}

  get scale(): number {
    return QUALITY_LEVELS[this.level] ?? 1;
  }

  setBudget(ms: number): void {
    this.budget = ms;
  }

  /**
   * Records a frame rendered during playback: `cost` = ms spent in render, `interval` = ms since
   * the previous frame. Returns true when the scale changed.
   */
  record(cost: number, interval: number, now: number): boolean {
    const k = this.samples === 0 ? 1 : 0.1;
    this.cost += (cost - this.cost) * k;
    this.interval += (Math.min(interval, 100) - this.interval) * k;
    this.samples++;
    if (this.samples < MIN_SAMPLES) return false;

    const struggling = this.interval > SLOW_INTERVAL || this.cost > this.budget;
    if (
      struggling &&
      this.level < QUALITY_LEVELS.length - 1 &&
      now - this.lastChange >= DROP_INTERVAL
    ) {
      this.level++;
      this.changed(now);
      this.cooldown = Math.min(MAX_COOLDOWN, this.cooldown * 2);
      return true;
    }
    const upper = QUALITY_LEVELS[this.level - 1];
    if (upper !== undefined && now - this.lastChange > this.cooldown) {
      // Recording cost grows roughly with the pixel count.
      const projected = this.cost * (upper / this.scale) ** 2;
      if (this.interval < SMOOTH_INTERVAL && projected < this.budget * 0.6) {
        this.level--;
        this.changed(now);
        return true;
      }
    }
    return false;
  }

  /** Playback stopped: keep the level but forget the averages and relax the cooldown. */
  pause(): void {
    this.samples = 0;
    this.cooldown = INITIAL_COOLDOWN;
  }

  private changed(now: number): void {
    this.samples = 0;
    this.lastChange = now;
  }
}
