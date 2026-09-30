/**
 * Hype's shot library (docs/templates/07-openers.md §7.2): word treatments — slam, repeat grid,
 * split colors, image-filled type, letter stutter — and flashes — image zoom, porthole, ring
 * burst, stripe sweep. Each shot is laid out once in `build` and draws the whole frame from its
 * own local time, so the edit can cut, whip and flip colors between them freely.
 */

import {
  type BuildContext,
  type Color,
  type ControlSchema,
  clamp01,
  type Draw,
  type EaseName,
  ease,
  type FocalPoint,
  type FrameSpec,
  type Glyph,
  type GlyphTransform,
  type Graphic,
  type PathData,
  type Rect,
  rgb,
  type TextBlock,
  type TextStyle,
} from '@/engine';
import { flipped, type Scheme } from './colors';

type Text = BuildContext<ControlSchema>['text'];

/** Energy: how a shot lands. Calm glides in, Balanced snaps with a tilt, Punchy pops harder. */
export type Feel = {
  /** Entrance scale punch (from → 1) and its length (seconds) and curve. */
  readonly from: number;
  readonly dur: number;
  readonly curve: EaseName;
  /** Seeded tilt at the punch (degrees). */
  readonly tilt: number;
  /** Camera shake on hits (× 1u). */
  readonly shake: number;
  /** Push-in while a shot holds (share of its scale). */
  readonly push: number;
  /** Half the length of a whip pan (seconds). */
  readonly whip: number;
  /** Travel multiplier (row drift, stripe speed). */
  readonly travel: number;
};

export type Picture = {
  readonly graphic: Graphic;
  readonly focal: FocalPoint;
  readonly key: string;
};

export type Kit = {
  readonly frame: FrameSpec;
  /** Where type may go: title-safe, or the social zone in vertical formats. */
  readonly area: Rect;
  /** Type is centered on the frame's axis at this height. */
  readonly cy: number;
  /** Widest type measure, centered on the frame's axis. */
  readonly width: number;
  readonly text: Text;
  /** Display face, caps. */
  readonly style: TextStyle;
  /** Cap height per unit of size. */
  readonly capRatio: number;
  readonly feel: Feel;
};

export type ShotSpec = {
  readonly card: string;
  readonly scheme: Scheme;
  /** Local time of Wild's half-beat color swap (null: none). */
  readonly flipAt: number | null;
  /** Entered with a whip pan: the pan is the entrance, no punch. */
  readonly whipped: boolean;
  /** Seeded tilt (−1…1) and direction (±1). */
  readonly tilt: number;
  readonly dir: number;
  /** Seconds on screen. */
  readonly len: number;
  readonly picture: Picture | null;
};

export type Stage = {
  /** Draws the whole frame at shot-local time (negative while it whips in). */
  draw(g: Draw, local: number): void;
  /** The editor region while the shot is on screen. */
  readonly region: { readonly key: string; readonly bounds: Rect } | null;
  /** Whether the cut into this shot hits (shakes the camera). */
  readonly hit: boolean;
};

const WHITE = rgb(1, 1, 1);
/** Least clear space between stacked lines' ink, in em (accents open the gap). */
const LINE_GAP = 0.1;

const schemeAt = (spec: ShotSpec, local: number): Scheme =>
  spec.flipAt !== null && local >= spec.flipAt ? flipped(spec.scheme) : spec.scheme;

const pad = (r: Rect, by: number): Rect => ({
  x: r.x - by,
  y: r.y - by,
  w: r.w + 2 * by,
  h: r.h + 2 * by,
});

/** The narrowest vertical gap between the ink of consecutive lines (infinite for one line). */
function inkGap(block: TextBlock): number {
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < block.lines.length; i++) {
    const above = block.lines[i - 1];
    const below = block.lines[i];
    if (above && below) gap = Math.min(gap, below.ink.y - (above.ink.y + above.ink.h));
  }
  return gap;
}

export type Placed = {
  readonly block: TextBlock;
  /** Block origin. */
  readonly x: number;
  readonly y: number;
  /** Ink bounds (frame coordinates) and their center. */
  readonly bounds: Rect;
  readonly cx: number;
  readonly cy: number;
};

/**
 * Sets a card as large as a `width` × `height` box allows — on one line, or stacked when that
 * makes it markedly bigger (a card's own line breaks always stack) — centered on the frame's
 * axis at `cy`.
 */
export function fitCard(
  kit: Kit,
  card: string,
  width: number,
  height: number,
  maxLines: number,
  cy = kit.cy,
  grow = 0,
): Placed {
  const { text, style, frame } = kit;
  const hard = card.split('\n').length;
  const words = card.split(/\s+/).filter(Boolean).length;
  const most = Math.max(hard, Math.min(maxLines, words));
  const minSize = 2.4 * frame.u;
  const lineHeight = kit.capRatio + 0.16;
  const set = (size: number, lines: number, leading: number) =>
    text.layout(card, {
      style: { ...style, size },
      maxWidth: width,
      maxLines: lines,
      lineHeight: leading,
      align: 'center',
      fit: { minSize: Math.min(minSize, size * 0.999) },
    });
  const at = (size: number, lines: number) => {
    const block = set(size, lines, lineHeight);
    const gap = inkGap(block);
    const want = LINE_GAP * block.size;
    return gap >= want ? block : set(block.size, lines, lineHeight + (want - gap) / block.size);
  };
  let best: TextBlock | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let lines = hard; lines <= most; lines++) {
    // Stacked lines may take a little more height (`grow` per extra line).
    const room = height * (1 + grow * (lines - 1));
    let block = at(room / kit.capRatio, lines);
    if (block.ink.h > room) {
      block = at(Math.max(minSize, (block.size * room) / block.ink.h), lines);
    }
    const score = block.size / (1 + 0.14 * (block.lines.length - 1)) - (block.overflow ? 1e6 : 0);
    if (score > bestScore) {
      best = block;
      bestScore = score;
    }
    if (block.lines.length < lines) break;
  }
  const block = best ?? at(minSize, most);
  const x = frame.cx - width / 2;
  const y = cy - (block.ink.y + block.ink.h / 2);
  const bounds = { x: x + block.ink.x, y: y + block.ink.y, w: block.ink.w, h: block.ink.h };
  return { block, x, y, bounds, cx: bounds.x + bounds.w / 2, cy: bounds.y + bounds.h / 2 };
}

/** The entrance punch: scale and tilt at local time (settled when the shot whipped in). */
function punch(kit: Kit, spec: ShotSpec, local: number): { scale: number; rotate: number } {
  const { feel } = kit;
  const p = spec.whipped ? 1 : ease[feel.curve](clamp01(local / feel.dur));
  const settled = clamp01((local - feel.dur) / Math.max(0.05, spec.len - feel.dur));
  const push = 1 + feel.push * ease.drift(settled);
  return {
    scale: (feel.from + (1 - feel.from) * p) * push,
    rotate: spec.tilt * feel.tilt * (1 - p),
  };
}

// --- word treatments -------------------------------------------------------------------------

/** One word (or a stacked card) as large as the frame allows, punched in on the cut. */
export function slam(kit: Kit, spec: ShotSpec): Stage {
  const { area } = kit;
  const placed = fitCard(kit, spec.card, kit.width, area.h * (kit.frame.vertical ? 0.4 : 0.58), 2);
  return {
    region: { key: 'words', bounds: placed.bounds },
    hit: true,
    draw(g, local) {
      const s = schemeAt(spec, local);
      g.fill(s.bg);
      const { scale, rotate } = punch(kit, spec, local);
      g.group({ scale, rotate, originX: placed.cx, originY: placed.cy }, (g) =>
        g.text(placed.block, { x: placed.x, y: placed.y, fill: s.ink }),
      );
    },
  };
}

/** Rows per format for the repeat grid (odd, so one row sits on the center line). */
const ROWS: Record<FrameSpec['format'], number> = { '16:9': 5, '1:1': 5, '4:5': 7, '9:16': 9 };

/**
 * The word repeated in rows across the whole frame: the center row solid, the others outlined,
 * rows sliding in from alternating sides and drifting on like marquees.
 */
export function repeat(kit: Kit, spec: ShotSpec): Stage {
  const { frame, text, style, feel } = kit;
  const u = frame.u;
  const rows = ROWS[frame.format];
  const pitch = frame.height / rows;
  const line = spec.card.replace(/\n/g, ' ');
  let size = (pitch * 0.7) / kit.capRatio;
  let word = text.line(line, { ...style, size });
  if (word.width > kit.width) {
    size *= kit.width / word.width;
    word = text.line(line, { ...style, size });
  }
  const capH = word.capHeight;
  const unit = word.width + 0.3 * size;
  const center = (rows - 1) / 2;
  const x0 = frame.cx - word.width / 2;
  const rowY = (r: number) => r * pitch + (pitch - capH) / 2;
  const cy = rowY(center);
  const bounds = { x: x0 + word.ink.x, y: cy + word.ink.y, w: word.ink.w, h: word.ink.h };
  const outline = { color: WHITE, width: Math.max(0.2 * u, 0.022 * size), join: 'round' as const };
  const speed = 10 * u * feel.travel;
  const reach = frame.width * 0.7;
  return {
    region: { key: 'words', bounds },
    hit: true,
    draw(g, local) {
      const s = schemeAt(spec, local);
      g.fill(s.bg);
      const paint = { ...outline, color: s.ink };
      for (let r = 0; r < rows; r++) {
        const away = Math.abs(r - center);
        const dir = (r % 2 === 0 ? 1 : -1) * spec.dir;
        const p = spec.whipped
          ? 1
          : ease[feel.curve](clamp01((local - away * 0.03) / (feel.dur * 1.4)));
        const drift = speed * Math.max(0, local);
        const offset = dir * (drift - (1 - p) * reach) + (away % 2 === 1 ? unit / 2 : 0);
        const start = x0 + offset;
        const kFrom = Math.floor((-unit - start) / unit);
        const kTo = Math.ceil((frame.width - start) / unit);
        const y = rowY(r);
        for (let k = kFrom; k <= kTo; k++) {
          const x = start + k * unit;
          if (r === center) g.text(word, { x, y, fill: s.ink });
          else g.text(word, { x, y, outline: paint });
        }
      }
    },
  };
}

/**
 * Split colors: the frame splits across the word's middle; the lower panel (and the word's
 * lower half, in the other color) slides in against the upper half and locks into one word.
 */
export function split(kit: Kit, spec: ShotSpec): Stage {
  const { frame, area, feel } = kit;
  const placed = fitCard(kit, spec.card, kit.width, area.h * (frame.vertical ? 0.36 : 0.5), 2);
  const splitY = placed.cy;
  const bleed = 2 * frame.u;
  const upper: Rect = { x: -bleed, y: -bleed, w: frame.width + 2 * bleed, h: splitY + bleed };
  const lower: Rect = {
    x: -bleed,
    y: splitY,
    w: frame.width + 2 * bleed,
    h: frame.height - splitY + bleed,
  };
  return {
    region: { key: 'words', bounds: placed.bounds },
    hit: true,
    draw(g, local) {
      const s = schemeAt(spec, local);
      const p = spec.whipped ? 1 : ease[feel.curve](clamp01(local / (feel.dur * 1.5)));
      const shift = (1 - p) * frame.width * 0.9;
      const { scale } = punch(kit, { ...spec, whipped: true }, local);
      g.fill(s.bg);
      g.group({ scale, originX: frame.cx, originY: splitY }, (g) => {
        g.clip(upper, (g) =>
          g.text(placed.block, { x: placed.x - spec.dir * shift, y: placed.y, fill: s.ink }),
        );
        g.group({ x: spec.dir * shift }, (g) => {
          g.rect(lower, { fill: s.ink });
          g.clip(lower, (g) => g.text(placed.block, { x: placed.x, y: placed.y, fill: s.bg }));
        });
      });
    },
  };
}

/** The picture seen through the letters, over an offset copy of the word in the ink color. */
export function fill(kit: Kit, spec: ShotSpec): Stage {
  const { frame, area } = kit;
  const u = frame.u;
  const placed = fitCard(kit, spec.card, kit.width, area.h * (frame.vertical ? 0.42 : 0.62), 2);
  const { block } = placed;
  const offset = Math.max(0.8 * u, 0.03 * block.size);
  const picture = spec.picture;
  const inside = pad(placed.bounds, u);
  const outline = {
    color: WHITE,
    width: Math.max(0.15 * u, 0.012 * block.size),
    join: 'round' as const,
  };
  return {
    region: { key: 'words', bounds: placed.bounds },
    hit: true,
    draw(g, local) {
      const s = schemeAt(spec, local);
      g.fill(s.bg);
      const { scale, rotate } = punch(kit, spec, local);
      const zoom = 1.18 - 0.18 * ease.glide(clamp01(local / Math.max(0.2, spec.len)));
      g.group({ scale, rotate, originX: placed.cx, originY: placed.cy }, (g) => {
        g.text(block, { x: placed.x + offset, y: placed.y + offset, fill: s.ink });
        if (picture) {
          g.mask(
            (g) => g.text(block, { x: placed.x, y: placed.y, fill: WHITE }),
            (g) =>
              g.group({ scale: zoom, originX: placed.cx, originY: placed.cy }, (g) =>
                g.graphic(picture.graphic, inside, { fit: 'cover', focal: picture.focal }),
              ),
            { bounds: pad(placed.bounds, 2 * u) },
          );
        } else {
          g.text(block, { x: placed.x, y: placed.y, fill: s.alt });
        }
        g.text(block, { x: placed.x, y: placed.y, outline: { ...outline, color: s.ink } });
      });
    },
  };
}

/** Letters stutter in one after another (each popping from 1.6×); a bar underlines the word. */
export function stutter(kit: Kit, spec: ShotSpec): Stage {
  const { frame, area, feel } = kit;
  const u = frame.u;
  const placed = fitCard(kit, spec.card, kit.width, area.h * (frame.vertical ? 0.34 : 0.46), 2);
  const { block } = placed;
  const count = Math.max(1, block.glyphCount);
  const gap = Math.min(0.045, (0.35 * spec.len) / count);
  const pop = feel.from > 1.1 ? 1.7 : 1.25;
  const lastLine = block.lines[block.lines.length - 1];
  const barH = Math.max(0.5 * u, 0.06 * block.size);
  const bar: Rect = lastLine
    ? {
        x: placed.x + lastLine.x + lastLine.ink.x,
        y: placed.y + lastLine.baseline + 0.12 * block.size,
        w: lastLine.ink.w,
        h: barH,
      }
    : { x: 0, y: 0, w: 0, h: 0 };
  const barAt = count * gap + 0.05;
  const transform: GlyphTransform = { scale: 1, originY: -0.36 * block.size };
  let now = 0;
  const glyph = (g: Glyph): GlyphTransform | null => {
    if (spec.whipped) {
      transform.scale = 1;
      return transform;
    }
    const since = now - g.index * gap;
    if (since < 0) return null;
    transform.scale = 1 + (pop - 1) * (1 - ease[feel.curve](clamp01(since / 0.1)));
    return transform;
  };
  return {
    region: { key: 'words', bounds: placed.bounds },
    hit: false,
    draw(g, local) {
      const s = schemeAt(spec, local);
      g.fill(s.bg);
      now = local;
      const settled = clamp01((local - barAt) / Math.max(0.05, spec.len - barAt));
      const push = 1 + kit.feel.push * ease.drift(settled);
      g.group({ scale: push, originX: placed.cx, originY: placed.cy }, (g) => {
        g.text(block, { x: placed.x, y: placed.y, fill: s.ink, glyph });
        const wipe = spec.whipped ? 1 : ease.snap(clamp01((local - barAt) / 0.14));
        if (wipe > 0 && bar.w > 0) {
          const w = bar.w * wipe;
          const x = spec.dir > 0 ? bar.x : bar.x + bar.w - w;
          g.rect({ x, y: bar.y, w, h: bar.h }, { fill: s.alt });
        }
      });
    },
  };
}

// --- flashes --------------------------------------------------------------------------------

/** A full-bleed picture punching in from 1.22× and pushing on. */
export function zoom(kit: Kit, spec: ShotSpec, key: string): Stage {
  const { frame, feel } = kit;
  const whole: Rect = { x: 0, y: 0, w: frame.width, h: frame.height };
  const picture = spec.picture;
  return {
    region: picture ? { key, bounds: whole } : null,
    hit: false,
    draw(g, local) {
      g.fill(spec.scheme.bg);
      if (!picture) return;
      const p = spec.whipped ? 1 : ease[feel.curve](clamp01(local / (feel.dur * 1.3)));
      const push = 0.06 * ease.drift(clamp01(local / Math.max(0.2, spec.len)));
      const scale = 1 + 0.22 * (1 - p) + push;
      g.group({ scale, originX: frame.cx, originY: frame.cy }, (g) =>
        g.graphic(picture.graphic, whole, { fit: 'cover', focal: picture.focal }),
      );
    },
  };
}

/** The picture in a round porthole that pops open, ringed by a stroke that sweeps around it. */
export function porthole(kit: Kit, spec: ShotSpec, key: string): Stage {
  const { frame, feel } = kit;
  const u = frame.u;
  const radius = Math.min(frame.width * 0.42, frame.height * 0.4);
  const cx = frame.cx;
  const cy = frame.cy;
  const picture = spec.picture;
  const disc: Rect = { x: cx - radius, y: cy - radius, w: 2 * radius, h: 2 * radius };
  const offset = 2.2 * u;
  return {
    region: picture ? { key, bounds: disc } : null,
    hit: false,
    draw(g, local) {
      const s = spec.scheme;
      g.fill(s.bg);
      const p = spec.whipped ? 1 : ease.pop(clamp01(local / (feel.dur * 1.6)));
      const r = radius * (0.35 + 0.65 * p);
      if (r <= 0) return;
      const push = 1 + 0.04 * ease.drift(clamp01(local / Math.max(0.2, spec.len)));
      g.group({ scale: push, originX: cx, originY: cy }, (g) => {
        g.circle(cx + offset * p, cy + offset * p, r, { fill: s.alt });
        g.clip({ rect: { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, radius: r }, (g) => {
          if (picture) {
            const inner = 1.2 - 0.2 * p;
            g.group({ scale: inner, originX: cx, originY: cy }, (g) =>
              g.graphic(picture.graphic, disc, { fit: 'cover', focal: picture.focal }),
            );
          } else {
            g.rect(disc, { fill: s.ink });
          }
        });
        const sweep = spec.whipped ? 1 : ease.snap(clamp01((local - 0.02) / 0.22));
        if (sweep > 0) {
          g.circle(cx, cy, r + 1.6 * u, {
            stroke: { color: s.ink, width: 0.7 * u, trim: [0, sweep] },
          });
        }
      });
    },
  };
}

/**
 * A bullseye bursts from the center: concentric bands in the shot's colors race outwards
 * behind a front that expands on `glide`, new bands welling up from the middle.
 */
export function burst(kit: Kit, spec: ShotSpec): Stage {
  const { frame, feel } = kit;
  const reach = Math.hypot(frame.width, frame.height) / 2 + 2 * frame.u;
  const spacing = reach / 5.5;
  const bands = Math.ceil(reach / spacing) + 2;
  const speed = 7 * feel.travel;
  return {
    region: null,
    hit: false,
    draw(g, local) {
      const s = spec.scheme;
      const colors: readonly Color[] = s.alt === s.ink ? [s.ink, s.bg] : [s.ink, s.alt, s.bg];
      const n = colors.length;
      const since = spec.whipped ? local + 0.3 : local;
      const front = reach * ease.glide(clamp01(since / 0.3));
      g.fill(s.bg);
      if (front <= 0) return;
      const phase = Math.max(0, since) * speed;
      const whole = Math.floor(phase);
      const f = phase - whole;
      // Discs from the outside in: disc k reaches (k + 1 − f) bands out.
      let drawn = false;
      for (let k = bands; k >= 0; k--) {
        const r = (k + 1 - f) * spacing;
        const color = colors[(((k + whole) % n) + n) % n] ?? s.ink;
        if (r >= front) {
          if (drawn) continue;
          drawn = true;
          g.circle(frame.cx, frame.cy, front, { fill: color });
          continue;
        }
        drawn = true;
        g.circle(frame.cx, frame.cy, r, { fill: color });
      }
    },
  };
}

/** Diagonal stripes sweep in behind a slanted edge and keep running. */
export function stripes(kit: Kit, spec: ShotSpec): Stage {
  const { frame, feel } = kit;
  const u = frame.u;
  const span = Math.hypot(frame.width, frame.height) + 8 * u;
  const period = 16 * u;
  const band = period * 0.5;
  const count = Math.ceil(span / period) + 2;
  const left = frame.cx - span / 2;
  const top = frame.cy - span / 2;
  const speed = 60 * u * feel.travel;
  return {
    region: null,
    hit: false,
    draw(g, local) {
      const s = spec.scheme;
      g.fill(s.bg);
      const p = spec.whipped ? 1 : ease.snap(clamp01(local / 0.12));
      if (p <= 0) return;
      const phase = (((speed * Math.max(0, local)) % period) + period) % period;
      g.group({ rotate: 30 * spec.dir, originX: frame.cx, originY: frame.cy }, (g) => {
        const visible: Rect =
          spec.dir > 0
            ? { x: left, y: top, w: span * p, h: span }
            : { x: left + span * (1 - p), y: top, w: span * p, h: span };
        g.clip(visible, (g) => {
          for (let k = -1; k < count; k++) {
            g.rect(
              { x: left + k * period + spec.dir * phase, y: top, w: band, h: span },
              { fill: s.ink },
            );
          }
        });
        // A band of the third color crosses the stripes.
        if (s.alt !== s.ink) {
          const w = span * ease.snap(clamp01((local - 0.06) / 0.22));
          const h = frame.height * 0.16;
          const x = spec.dir > 0 ? left + span - w : left;
          g.rect({ x, y: frame.cy - h / 2, w, h }, { fill: s.alt });
        }
      });
    },
  };
}

/** An upper half-disc (flat side down on y) as cubic arcs. */
function halfDisc(cx: number, cy: number, r: number): PathData {
  const k = r * 0.5522847498;
  return [
    ['M', cx - r, cy],
    ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ['Z'],
  ];
}

/**
 * Bauhaus shapes: a big disc pops, a bar wipes across from the frame's edge and a half-disc
 * rises from the bottom edge — the flash for edits without pictures.
 */
export function shapes(kit: Kit, spec: ShotSpec): Stage {
  const { frame, feel } = kit;
  const { width: W, height: H } = frame;
  const size = Math.min(W, H);
  const side = spec.dir;
  const disc = { x: frame.cx + side * 0.2 * W, y: frame.cy + 0.08 * H, r: 0.4 * size };
  const bar = { y: frame.cy - 0.27 * size, h: 0.075 * size, len: 0.74 * W };
  const half = { x: frame.cx - side * 0.24 * W, y: H, r: 0.3 * size };
  const halfPath = halfDisc(half.x, half.y, half.r);
  const pop: EaseName = feel.curve === 'glide' ? 'glide' : 'pop';
  return {
    region: null,
    hit: false,
    draw(g, local) {
      const s = spec.scheme;
      g.fill(s.bg);
      const at = (delay: number, dur: number, curve: EaseName) =>
        spec.whipped ? 1 : ease[curve](clamp01((local - delay) / dur));
      const drift = kit.feel.push * ease.drift(clamp01(local / Math.max(0.2, spec.len)));
      const p0 = at(0, 0.22, pop);
      if (p0 > 0) g.circle(disc.x, disc.y - drift * size, disc.r * p0, { fill: s.alt });
      const p1 = at(0.04, 0.18, 'snap');
      if (p1 > 0) {
        const w = bar.len * p1;
        g.rect({ x: side > 0 ? 0 : W - w, y: bar.y, w, h: bar.h }, { fill: s.ink });
      }
      const p2 = at(0.08, 0.2, pop);
      if (p2 > 0) g.group({ y: (1 - p2) * half.r }, (g) => g.path(halfPath, { fill: s.ink }));
    },
  };
}
