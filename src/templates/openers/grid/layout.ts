/**
 * Grid's layout generator (docs/templates/07-openers.md §7.3): a rule-based composer on a 6 × 6
 * module grid. It samples candidate posters from the seed — one dominant color block, a few
 * secondary blocks, the title, the big number and the small type — rejects every candidate that
 * breaks a rule, scores the rest for asymmetric balance, shared alignment axes and whitespace,
 * and keeps the best. The rules:
 *
 * - One dominant block: at least twice the area of any other block, never centered.
 * - Asymmetric balance: the composition's visual weight sits off-center, but not lopsided.
 * - Text never overlaps a block unless the contrast passes: display type (title, number) may
 *   cross a block whose own ink reaches 3:1 (it is recolored there); small type only sits wholly
 *   on one block whose ink reaches 4.5:1, never across an edge.
 * - Text never overlaps text; type stays inside the type area (the social zone in vertical
 *   formats); blocks never overlap each other.
 * - The poster can breathe: at least one block has a neighboring module it may slide to in the
 *   hold without breaking a rule.
 *
 * A hand-made fallback that always satisfies the rules guarantees a valid poster for any seed.
 */

import type { Rng } from '@/engine';

export const COLS = 6;
export const ROWS = 6;

/** A rectangle of modules. */
export type Span = { c: number; r: number; w: number; h: number };

export type UnitId = 'title' | 'number' | 'subtitle' | 'meta';

/** A text unit's possible shapes (in modules), from the largest type down. */
export type UnitOptions = {
  readonly id: UnitId;
  /** Small type (4.5:1 on a block, never across a block edge) or display type (3:1). */
  readonly small: boolean;
  readonly shapes: readonly { readonly w: number; readonly h: number }[];
  /** Ink density: how heavy the unit reads (for balance). */
  readonly weight: number;
};

export type BlockTone = {
  /** Display type (3:1) and small type (4.5:1) can sit on it. */
  readonly display: boolean;
  readonly small: boolean;
  /** Visual weight per module (for balance). */
  readonly weight: number;
};

export type Block = Span & {
  /** Index into the tones: 0 is the dominant block's. */
  readonly tone: number;
  readonly dominant: boolean;
};

export type Placed = Span & { readonly id: UnitId; readonly shape: number };

export type Move = { readonly block: number; readonly dc: number; readonly dr: number };

export type Layout = {
  readonly blocks: readonly Block[];
  readonly units: readonly Placed[];
  /** The hold's breathing moves (the first is always there; later ones may be absent). */
  readonly moves: readonly Move[];
  readonly score: number;
};

export type Rules = {
  /** Modules type may occupy. */
  readonly area: Span;
  readonly units: readonly UnitOptions[];
  /** Tone 0 is the dominant block's; the rest are secondary tones. */
  readonly tones: readonly BlockTone[];
};

const overlaps = (a: Span, b: Span) =>
  a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h;
const contains = (outer: Span, inner: Span) =>
  inner.c >= outer.c &&
  inner.r >= outer.r &&
  inner.c + inner.w <= outer.c + outer.w &&
  inner.r + inner.h <= outer.r + outer.h;
const inGrid = (s: Span) => s.c >= 0 && s.r >= 0 && s.c + s.w <= COLS && s.r + s.h <= ROWS;
const area = (s: Span) => s.w * s.h;

/**
 * Whether type in `unit` may sit where the blocks are (the contrast rule). Secondary blocks are
 * accents and never lie under type; display type may cross the dominant block where its own ink
 * reaches 3:1; small type only sits wholly on it, where its ink reaches 4.5:1.
 */
function readable(
  unit: Placed,
  small: boolean,
  blocks: readonly Block[],
  tones: readonly BlockTone[],
) {
  for (const block of blocks) {
    if (!overlaps(unit, block)) continue;
    if (!block.dominant) return false;
    const tone = tones[block.tone];
    if (!tone) return false;
    if (small ? !tone.small || !contains(block, unit) : !tone.display) return false;
  }
  return true;
}

function valid(layout: { blocks: readonly Block[]; units: readonly Placed[] }, rules: Rules) {
  const { blocks, units } = layout;
  for (let i = 0; i < blocks.length; i++) {
    const a = blocks[i] as Block;
    if (!inGrid(a)) return false;
    for (let j = i + 1; j < blocks.length; j++) if (overlaps(a, blocks[j] as Block)) return false;
  }
  for (let i = 0; i < units.length; i++) {
    const a = units[i] as Placed;
    if (!contains(rules.area, a)) return false;
    for (let j = i + 1; j < units.length; j++) if (overlaps(a, units[j] as Placed)) return false;
    const small = rules.units.find((u) => u.id === a.id)?.small ?? true;
    if (!readable(a, small, blocks, rules.tones)) return false;
  }
  return true;
}

/** Every rule-keeping one-module slide of a block (secondary blocks first). */
function movesOf(blocks: readonly Block[], units: readonly Placed[], rules: Rules): Move[] {
  const out: Move[] = [];
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  blocks.forEach((block, i) => {
    for (const [dc, dr] of steps) {
      const moved = { ...block, c: block.c + dc, r: block.r + dr };
      const next = blocks.map((b, j) => (j === i ? moved : b));
      if (valid({ blocks: next, units }, rules)) out.push({ block: i, dc, dr });
    }
  });
  return out;
}

/** How the visual weight sits: distance of its centroid from the center, in modules. */
function balance(blocks: readonly Block[], units: readonly Placed[], rules: Rules) {
  let mass = 0;
  let mx = 0;
  let my = 0;
  const add = (s: Span, weight: number) => {
    const m = area(s) * weight;
    mass += m;
    mx += (s.c + s.w / 2) * m;
    my += (s.r + s.h / 2) * m;
  };
  for (const block of blocks) add(block, rules.tones[block.tone]?.weight ?? 0.5);
  for (const unit of units) add(unit, rules.units.find((u) => u.id === unit.id)?.weight ?? 0.2);
  if (mass <= 0) return 0;
  return Math.hypot(mx / mass - COLS / 2, my / mass - ROWS / 2);
}

function score(layout: { blocks: readonly Block[]; units: readonly Placed[] }, rules: Rules) {
  const { blocks, units } = layout;
  let s = 0;
  // Asymmetric balance: the centroid a little off-center (0.35–0.85 modules is ideal).
  const d = balance(blocks, units, rules);
  s -= Math.abs(d - 0.6) * 2.2;
  // Shared flush-left axes: fewer distinct left edges, and type hanging from the same row.
  const lefts = new Set(units.map((u) => u.c));
  s -= 0.45 * (lefts.size - 1);
  const tops = new Set(units.map((u) => u.r));
  s -= 0.15 * (tops.size - 1);
  const find = (id: UnitId) => units.find((u) => u.id === id);
  const title = find('title');
  const number = find('number');
  const dominant = blocks[0];
  if (dominant && number) {
    // The number on the dominant block (or right against it) reads as one gesture.
    if (contains(dominant, number)) s += 0.9;
    else if (overlaps(dominant, number)) s += 0.2;
    else {
      const touches =
        number.c === dominant.c + dominant.w ||
        number.c + number.w === dominant.c ||
        number.r === dominant.r + dominant.h ||
        number.r + number.h === dominant.r;
      if (touches) s += 0.35;
    }
  }
  if (title) {
    // The title anchored to the grid's top or bottom edge, and clear of the blocks.
    if (title.r === rules.area.r || title.r + title.h === rules.area.r + rules.area.h) s += 0.35;
    if (!blocks.some((b) => overlaps(b, title))) s += 0.25;
  }
  // Reading order: title, then subtitle, then meta — top to bottom (or left to right).
  const order = ['title', 'subtitle', 'meta'].map((id) => find(id as UnitId)).filter(Boolean);
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1] as Placed;
    const b = order[i] as Placed;
    if (b.r > a.r || (b.r === a.r && b.c > a.c)) s += 0.25;
    else s -= 0.4;
  }
  // Secondary blocks spread out, at least one across from the dominant one.
  if (dominant) {
    const cx = dominant.c + dominant.w / 2;
    const cy = dominant.r + dominant.h / 2;
    const across = blocks
      .slice(1)
      .some(
        (b) =>
          (b.c + b.w / 2 - COLS / 2) * (cx - COLS / 2) < 0 ||
          (b.r + b.h / 2 - ROWS / 2) * (cy - ROWS / 2) < 0,
      );
    if (across) s += 0.45;
  }
  for (let i = 1; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i] as Block;
      const b = blocks[j] as Block;
      const gap = Math.max(
        b.c - (a.c + a.w),
        a.c - (b.c + b.w),
        b.r - (a.r + a.h),
        a.r - (b.r + b.h),
      );
      if (gap <= 0) s -= 0.35;
    }
  }
  // Secondary blocks anchored to the system: against the grid's edge, or on the dominant
  // block's lines.
  if (dominant) {
    for (const b of blocks.slice(1)) {
      if (b.c === 0 || b.r === 0 || b.c + b.w === COLS || b.r + b.h === ROWS) s += 0.15;
      const lines =
        b.c === dominant.c ||
        b.c + b.w === dominant.c + dominant.w ||
        b.r === dominant.r ||
        b.r + b.h === dominant.r + dominant.h;
      if (lines) s += 0.15;
    }
  }
  // Type that crosses the dominant block's edge is a statement: the numeral may, the title
  // rarely should.
  if (dominant && title && overlaps(dominant, title) && !contains(dominant, title)) s -= 0.3;
  // The biggest shapes make the strongest posters.
  for (const unit of units) {
    if (unit.id === 'number' && unit.shape === 0) s += 0.25;
    if (unit.id === 'title' && unit.shape <= 1) s += 0.2;
  }
  // Whitespace: a Swiss poster breathes.
  let empty = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const m = { c, r, w: 1, h: 1 };
      if (!blocks.some((b) => overlaps(b, m)) && !units.some((u) => overlaps(u, m))) empty++;
    }
  }
  s += Math.min(empty, 14) * 0.04;
  return s;
}

/** Dominant block shapes: large, never the whole width or height. */
const DOMINANT = [
  { w: 2, h: 3 },
  { w: 3, h: 2 },
  { w: 3, h: 3 },
  { w: 2, h: 4 },
  { w: 4, h: 2 },
  { w: 3, h: 4 },
  { w: 4, h: 3 },
  { w: 2, h: 5 },
];
const SECONDARY = [
  { w: 1, h: 1 },
  { w: 1, h: 1 },
  { w: 1, h: 2 },
  { w: 2, h: 1 },
];

/** Picks an index with probability proportional to its weight. */
function weighted(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let x = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i] ?? 0;
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/**
 * One candidate, built constructively: the dominant block first, then the type (the numeral and
 * the title first), each unit placed among the positions that still keep the rules — favoring
 * the alignment axes already on the poster — and last the secondary blocks in the space left.
 */
function construct(rules: Rules, rng: Rng): { blocks: Block[]; units: Placed[] } | null {
  const { area: a, tones } = rules;
  const shape = rng.pick(DOMINANT);
  const edgeC = rng.chance(0.75);
  const c = edgeC ? (rng.chance(0.5) ? 0 : COLS - shape.w) : rng.int(0, COLS - shape.w);
  const r = rng.chance(0.6) ? (rng.chance(0.5) ? 0 : ROWS - shape.h) : rng.int(0, ROWS - shape.h);
  if (Math.abs(c + shape.w / 2 - COLS / 2) < 0.75) return null;
  const blocks: Block[] = [{ c, r, ...shape, tone: 0, dominant: true }];

  const units: Placed[] = [];
  const order = [...rules.units].sort((x, y) => rank(x.id) - rank(y.id));
  for (const unit of order) {
    // Larger shapes first in the draw, smaller ones as the grid fills up.
    const shapeOrder = unit.shapes.map((_, i) => i);
    const first = weighted(
      rng,
      shapeOrder.map((i) => (i === 0 ? 3 : i === 1 ? 2 : 1)),
    );
    const tries = [first, ...shapeOrder.filter((i) => i !== first).reverse()];
    let done = false;
    for (const index of tries) {
      const s = unit.shapes[index];
      if (!s || s.w > a.w || s.h > a.h) continue;
      const spots: Placed[] = [];
      const weights: number[] = [];
      for (let cc = a.c; cc + s.w <= a.c + a.w; cc++) {
        for (let rr = a.r; rr + s.h <= a.r + a.h; rr++) {
          const spot: Placed = { id: unit.id, shape: index, c: cc, r: rr, w: s.w, h: s.h };
          if (units.some((other) => overlaps(other, spot))) continue;
          if (!readable(spot, unit.small, blocks, tones)) continue;
          spots.push(spot);
          // Shared flush-left axes and hanging lines make the grid visible in the type.
          let w = 1;
          if (units.some((other) => other.c === cc)) w *= 3;
          if (units.some((other) => other.r === rr || other.r + other.h === rr)) w *= 1.5;
          if (cc === a.c || rr === a.r || rr + s.h === a.r + a.h) w *= 1.4;
          weights.push(w);
        }
      }
      if (spots.length === 0) continue;
      units.push(spots[weighted(rng, weights)] as Placed);
      done = true;
      break;
    }
    if (!done) return null;
  }

  const count = tones.length > 1 ? rng.int(1, 2) : 0;
  for (let k = 0; k < count; k++) {
    const s = rng.pick(SECONDARY);
    const spots: Block[] = [];
    const weights: number[] = [];
    for (let cc = 0; cc + s.w <= COLS; cc++) {
      for (let rr = 0; rr + s.h <= ROWS; rr++) {
        const spot: Block = {
          c: cc,
          r: rr,
          ...s,
          tone: 1 + ((k + rng.int(0, tones.length)) % (tones.length - 1)),
          dominant: false,
        };
        if (blocks.some((b) => overlaps(b, spot)) || units.some((u) => overlaps(u, spot))) continue;
        spots.push(spot);
        const edge = cc === 0 || rr === 0 || cc + s.w === COLS || rr + s.h === ROWS;
        weights.push(edge ? 2 : 1);
      }
    }
    if (spots.length > 0) blocks.push(spots[weighted(rng, weights)] as Block);
  }
  return { blocks, units };
}

const rank = (id: UnitId) => (id === 'number' ? 0 : id === 'title' ? 1 : id === 'subtitle' ? 2 : 3);

export function compose(rules: Rules, rng: Rng, attempts = 160): Layout {
  let best: Layout | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = construct(rules, rng);
    if (!candidate || !valid(candidate, rules)) continue;
    const { blocks, units } = candidate;
    const moves = movesOf(blocks, units, rules);
    if (moves.length === 0) continue;
    const value = score(candidate, rules) + rng.next() * 0.25;
    if (best && value <= best.score) continue;
    // Breathing: prefer sliding a secondary block, then the dominant one.
    const secondary = moves.filter((m) => m.block > 0);
    const first = rng.pick(secondary.length > 0 ? secondary : moves);
    best = { blocks, units, moves: [first], score: value };
  }
  return best ?? fallback(rules);
}

/**
 * When no candidate keeps the rules (content that barely fits the grid): each unit in its
 * smallest shape, placed at the first free spot scanning the columns from the left, and the
 * dominant block in the largest free corner that keeps the rules — or none.
 */
function fallback(rules: Rules): Layout {
  const { area: a } = rules;
  const units: Placed[] = [];
  for (const unit of [...rules.units].sort((x, y) => rank(x.id) - rank(y.id))) {
    const index = unit.shapes.length - 1;
    const s = unit.shapes[index] ?? { w: 1, h: 1 };
    const w = Math.min(s.w, a.w);
    const h = Math.min(s.h, a.h);
    let spot: Placed | null = null;
    for (let cc = a.c; cc + w <= a.c + a.w && !spot; cc++) {
      for (let rr = a.r; rr + h <= a.r + a.h && !spot; rr++) {
        const candidate: Placed = { id: unit.id, shape: index, c: cc, r: rr, w, h };
        if (!units.some((other) => overlaps(other, candidate))) spot = candidate;
      }
    }
    units.push(spot ?? { id: unit.id, shape: index, c: a.c, r: a.r, w, h });
  }
  for (const shape of [...DOMINANT].reverse().concat([
    { w: 1, h: 2 },
    { w: 1, h: 1 },
  ])) {
    for (const [c, r] of [
      [COLS - shape.w, 0],
      [COLS - shape.w, ROWS - shape.h],
      [0, ROWS - shape.h],
      [0, 0],
    ] as const) {
      const blocks: Block[] = [{ c, r, ...shape, tone: 0, dominant: true }];
      if (!valid({ blocks, units }, rules)) continue;
      return { blocks, units, moves: movesOf(blocks, units, rules).slice(0, 1), score: -1e9 };
    }
  }
  return { blocks: [], units, moves: [], score: -1e9 };
}

export { movesOf, valid };
