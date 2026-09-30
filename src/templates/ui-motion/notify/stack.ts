/**
 * Notify's stack (docs/templates/10-ui-motion.md §10.2): the newest notification lands at the top
 * and the older ones move down one place each — through a chain of coupled springs, so the card
 * right under the new one reacts a beat after it lands and each older card a beat after that.
 * Past the first three, older cards tuck under the third (95% and 70%, then 90% and 40%).
 *
 * Every arrival moves each older card from its place before to its place after; the springs are
 * linear, so a card's state is its landing state plus each later arrival's move weighted by that
 * arrival's spring response at the card's depth. Random access, no simulation in `render`.
 */

import { clamp01, type SpringChain } from '@/engine';

/** A card's placement: horizontal center, top edge, scale (around its top-center), opacity. */
export type CardState = { cx: number; top: number; scale: number; opacity: number };

/** Seconds a landing card takes to become opaque. */
export const LANDING = 0.09;

/** How many cards show in full before older ones tuck in. */
const FULL = 3;
/** Tucked levels (behind the third card): scale, opacity and how far each peeks (share of gap). */
const TUCKED = [
  { scale: 0.95, opacity: 0.7, peek: 1.2 },
  { scale: 0.9, opacity: 0.4, peek: 2.2 },
];

type Place = { top: number; scale: number; opacity: number };

export class Stack {
  private readonly moves: Place[][];
  private readonly landing: Place[];

  constructor(
    private readonly options: {
      /** Card heights in arrival order (design units). */
      heights: readonly number[];
      /** When each card lands (seconds). */
      arrivals: readonly number[];
      cx: number;
      /** Top of the newest card's place. */
      top: number;
      gap: number;
      /** How far a card drops in from (above its place). */
      drop: number;
      chain: SpringChain;
    },
  ) {
    const n = options.heights.length;
    // The places of cards 0..k after card k has arrived.
    const configs: Place[][] = [];
    for (let k = 0; k < n; k++) configs.push(this.layout(k));
    this.landing = configs.map((config, k) => config[k] as Place);
    // moves[k][j]: how card j moves when card k arrives (j < k).
    this.moves = configs.map((config, k) =>
      config.slice(0, k).map((after, j) => {
        const before = (configs[k - 1] as Place[])[j] as Place;
        return {
          top: after.top - before.top,
          scale: after.scale - before.scale,
          opacity: after.opacity - before.opacity,
        };
      }),
    );
  }

  /** Places of cards 0..k once card k is the newest. */
  private layout(k: number): Place[] {
    const { heights, top, gap } = this.options;
    const places: Place[] = new Array(k + 1);
    let y = top;
    let bottom = top;
    for (let level = 0; level <= k; level++) {
      const j = k - level;
      const h = heights[j] as number;
      if (level < FULL) {
        places[j] = { top: y, scale: 1, opacity: 1 };
        bottom = y + h;
        y = bottom + gap;
      } else {
        const tuck = TUCKED[Math.min(level - FULL, TUCKED.length - 1)] as (typeof TUCKED)[number];
        const hidden = level - FULL >= TUCKED.length;
        // Its bottom edge peeks below the third card's.
        places[j] = {
          top: bottom + gap * tuck.peek - h * tuck.scale,
          scale: tuck.scale,
          opacity: hidden ? 0 : tuck.opacity,
        };
      }
    }
    return places;
  }

  /** Card `j`'s state at `t` (null before it arrives). */
  state(j: number, t: number, out: CardState): CardState | null {
    const { arrivals, chain, drop, cx } = this.options;
    const arrival = arrivals[j] as number;
    if (t < arrival) return null;
    const land = this.landing[j] as Place;
    const lead = chain.at(0, t - arrival);
    let top = land.top - drop * (1 - lead);
    let scale = land.scale * (0.95 + 0.05 * lead);
    // Glass doesn't fade in so much as arrive: the card is solid within a few frames.
    const shown = clamp01((t - arrival) / LANDING);
    let opacity = land.opacity * (1 - (1 - shown) * (1 - shown));
    for (let k = j + 1; k < arrivals.length; k++) {
      const at = arrivals[k] as number;
      if (t < at) break;
      const move = (this.moves[k] as Place[])[j] as Place;
      const r = chain.at(k - j, t - at);
      top += move.top * r;
      scale += move.scale * r;
      opacity += move.opacity * r;
    }
    out.cx = cx;
    out.top = top;
    out.scale = scale;
    out.opacity = Math.max(0, Math.min(1, opacity));
    return out;
  }

  /** Where the stack's lowest visible edge will be once every card is in. */
  get bottom(): number {
    const n = this.options.heights.length;
    if (n === 0) return this.options.top;
    const last = this.layout(n - 1);
    let bottom = this.options.top;
    last.forEach((place, j) => {
      if (place.opacity > 0) {
        bottom = Math.max(bottom, place.top + (this.options.heights[j] as number) * place.scale);
      }
    });
    return bottom;
  }
}

/** Height the stack takes once `heights` (arrival order) are all in, before it is placed. */
export function stackHeight(heights: readonly number[], gap: number): number {
  const n = heights.length;
  let h = 0;
  for (let level = 0; level < Math.min(n, FULL); level++) {
    h += (heights[n - 1 - level] as number) + (level > 0 ? gap : 0);
  }
  const tucked = Math.min(Math.max(0, n - FULL), TUCKED.length);
  if (tucked > 0) h += gap * (TUCKED[tucked - 1] as (typeof TUCKED)[number]).peek;
  return h;
}
