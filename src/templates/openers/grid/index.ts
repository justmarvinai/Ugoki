/**
 * Grid — Swiss grid poster (docs/templates/07-openers.md §7.3).
 *
 * The expensive detail: a rule-based layout generator (layout.ts). Every seed composes a new
 * poster on a 6 × 6 modular grid — one dominant color block, a few secondary blocks, the title,
 * one big numeral and the small type, flush-left on module lines — and every candidate that
 * breaks a rule (asymmetric balance, one dominant block, text never over a block unless its
 * contrast passes) is rejected, so every seed is a valid Swiss poster. Where display type
 * crosses the dominant block it takes the block's own ink. The poster assembles itself —
 * hairlines draw on, blocks slide into their modules, type rises through line masks, the
 * numeral rolls up — and keeps breathing: in the hold a block slides to a neighboring module
 * (and back again on long holds).
 */

import {
  bestContrast,
  CLEAN_END,
  type Color,
  c,
  clamp01,
  contrastRatio,
  type Draw,
  defineTemplate,
  type EaseName,
  type EnergyId,
  ease,
  type FormatId,
  type Rect,
  staticWheels,
  type Timeline,
  type Wheel,
  withAlpha,
} from '@/engine';
import {
  type BlockTone,
  COLS,
  compose,
  type Layout,
  ROWS,
  type Rules,
  type Span,
  type UnitId,
  type UnitOptions,
} from './layout';
import { measure, type Shape } from './type';

/** Type sizes in u per format. */
const SIZES: Record<FormatId, { title: number; subtitle: number; meta: number }> = {
  '16:9': { title: 13, subtitle: 3.3, meta: 2.6 },
  '1:1': { title: 10, subtitle: 3.2, meta: 2.6 },
  '4:5': { title: 10.5, subtitle: 3.2, meta: 2.6 },
  '9:16': { title: 12, subtitle: 3.6, meta: 2.9 },
};

type Feel = { lines: EaseName; blocks: EaseName; text: EaseName; roll: EaseName; turns: number };

/**
 * Energy: Calm draws and slides on `drift`/`glide` and the numeral settles without overshoot;
 * Balanced snaps; Punchy snaps, rolls the numeral two turns and lets its wheels overshoot.
 */
const FEEL: Record<EnergyId, Feel> = {
  calm: { lines: 'drift', blocks: 'glide', text: 'glide', roll: 'glide', turns: 1 },
  balanced: { lines: 'snap', blocks: 'snap', text: 'glide', roll: 'snap', turns: 1 },
  punchy: { lines: 'snap', blocks: 'snap', text: 'snap', roll: 'pop', turns: 2 },
};

/** Entrance and exit at Balanced (the numeral finishes rolling just after `IN`). */
const IN = 2.1;
const OUT = 0.6;
/** Padding of type inside its modules, in u. */
const PAD = 1.2;
/** When each unit starts to reveal (Balanced seconds into the entrance). */
const DELAYS: Record<UnitId, number> = { title: 1.2, number: 1.25, subtitle: 1.45, meta: 1.55 };

type Side = 'left' | 'right' | 'top' | 'bottom';

export default defineTemplate({
  id: 'grid',
  version: 1,
  meta: {
    name: 'Grid',
    tagline: 'Swiss grid poster',
    category: 'openers',
    tags: ['opener', 'swiss', 'grid', 'poster', 'event', 'typography'],
    useCases: ['Design conferences', 'Tech events', 'Exhibitions', 'Architecture', 'Agencies'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 4, max: 12 },
  alpha: 'none',
  poster: 3,
  palettes: [
    { kind: 'library', id: 'swiss' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'bauhaus' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'mono-light' },
    { kind: 'library', id: 'sand' },
  ],
  pairings: ['grotesk', 'technical', 'studio', 'wide', 'mono'],
  controls: {
    title: c.text({
      label: 'Title',
      default: 'Form\nfollows\nmotion',
      maxLength: 40,
      multiline: true,
      maxLines: 3,
      primary: true,
    }),
    subtitle: c.text({
      label: 'Subtitle',
      default: 'International Design Days',
      maxLength: 48,
      optional: true,
    }),
    date: c.text({ label: 'Date', default: '14—16 OCT 2026', maxLength: 24, optional: true }),
    location: c.text({ label: 'Location', default: 'ZÜRICH', maxLength: 24, optional: true }),
    number: c.text({ label: 'Big number', default: '26', maxLength: 4, optional: true }),
    lines: c.toggle({ label: 'Grid lines', default: true }),
    layout: c.number({
      label: 'Layout',
      group: 'layout',
      default: 1,
      min: 1,
      max: 99,
      step: 1,
      hint: 'Every number composes a different poster on the grid',
    }),
  },
  looks: [
    { id: 'swiss', name: 'Swiss', palette: { kind: 'library', id: 'swiss' }, pairing: 'grotesk' },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'technical' },
    {
      id: 'bauhaus',
      name: 'Bauhaus',
      palette: { kind: 'library', id: 'bauhaus' },
      pairing: 'grotesk',
    },
  ],
  timing: ({ props }) => ({ in: IN, out: OUT, tail: CLEAN_END, readable: props.title }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, accent, accent2, accent3, surface } = palette.roles;
    const feel = FEEL[energy.id];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const mw = area.w / COLS;
    const mh = area.h / ROWS;
    const pad = PAD * u;
    const moduleRect = (s: Span): Rect => ({
      x: area.x + s.c * mw,
      y: area.y + s.r * mh,
      w: s.w * mw,
      h: s.h * mh,
    });

    // --- type: the shapes each unit can take on the grid ---------------------------------------
    const metaLines = [props.date.trim(), props.location.trim()].filter(Boolean);
    const numberText = props.number.trim();
    const shapes = measure(
      { text, pairing, mw, mh, pad, u, sizes: SIZES[frame.format] },
      {
        title: props.title.trim(),
        subtitle: props.subtitle.trim(),
        meta: metaLines,
        number: numberText,
      },
    );

    // --- colors: the dominant block in the accent, secondary blocks in the other roles ---------
    const distinct = (a: Color, b: Color) =>
      contrastRatio(a, b) >= 1.25 || Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.3;
    const toneColors: Color[] = [accent];
    for (const color of [fg, accent2, accent3, surface]) {
      if (distinct(color, bg) && toneColors.every((other) => distinct(other, color))) {
        toneColors.push(color);
      }
    }
    const inkOn = (color: Color) => bestContrast(color, [fg, bg]);
    const tones: BlockTone[] = toneColors.map((color) => {
      const ink = contrastRatio(inkOn(color), color);
      return {
        display: ink >= 3,
        small: ink >= 4.5,
        weight: 0.25 + 0.3 * Math.log2(Math.max(1, contrastRatio(color, bg))),
      };
    });

    // --- rules ----------------------------------------------------------------------------------
    const units: UnitOptions[] = [];
    const unit = (id: UnitId, small: boolean, weight: number) => {
      const list = shapes[id];
      if (list && list.length > 0) units.push({ id, small, weight, shapes: list });
    };
    unit('title', false, 0.5);
    unit('number', false, 0.6);
    unit('subtitle', true, 0.14);
    unit('meta', true, 0.12);
    const rules: Rules = { area: { c: 0, r: 0, w: COLS, h: ROWS }, units, tones };

    // --- motion constants -----------------------------------------------------------------------
    const lineColor = withAlpha(fg, palette.dark ? 0.3 : 0.24);
    const hair = Math.max(0.12 * u, 1);
    const hold = timeline.sections.hold;
    const holdLen = Math.max(0, hold.end - hold.start);
    // Short durations compress the entrance, so the poster still reads for a while.
    const k = Math.max(
      0.72,
      Math.min(
        1,
        (timeline.duration - OUT * energy.time - CLEAN_END - 1.3) / (IN * energy.time + 0.5),
      ),
    );
    const moves = Math.max(1, Math.floor(holdLen / 2.4));
    const moveDur = Math.min(0.7, holdLen * 0.4);
    const horizontal = Array.from({ length: ROWS + 1 }, (_, i) => area.y + i * mh);
    const vertical = Array.from({ length: COLS + 1 }, (_, i) => area.x + i * mw);
    const lineCount = horizontal.length + vertical.length;
    const lineGap = ctx.stagger(0.08);
    const settled = staticWheels(numberText);

    /** A block's visible part: wiped in from its side, and on out the same way. */
    const wiped = (r: Rect, from: Side, pin: number, pout: number): Rect | null => {
      if (pin <= pout) return null;
      const span = pin - pout;
      switch (from) {
        case 'left':
          return { x: r.x + r.w * pout, y: r.y, w: r.w * span, h: r.h };
        case 'right':
          return { x: r.x + r.w * (1 - pin), y: r.y, w: r.w * span, h: r.h };
        case 'top':
          return { x: r.x, y: r.y + r.h * pout, w: r.w, h: r.h * span };
        default:
          return { x: r.x, y: r.y + r.h * (1 - pin), w: r.w, h: r.h * span };
      }
    };

    /** A poster for one layout: everything placed once, drawn per frame. */
    const scene = (layout: Layout, key: string) => {
      const rng = ctx.rng(`motion:${key}`);
      const move = layout.moves[0] ?? null;
      const blocks = layout.blocks.map((block, i) => {
        const moved =
          move && move.block === i
            ? { ...block, c: block.c + move.dc, r: block.r + move.dr }
            : block;
        // Blocks against the grid's edge bleed off the frame (on the sides they keep in the hold).
        const touches = (s: Span, side: Side) =>
          side === 'left'
            ? s.c === 0
            : side === 'right'
              ? s.c + s.w === COLS
              : side === 'top'
                ? s.r === 0
                : s.r + s.h === ROWS;
        const bleeds = (side: Side) => touches(block, side) && touches(moved, side);
        const home = moduleRect(block);
        const left = bleeds('left') ? home.x : 0;
        const right = bleeds('right') ? frame.width - (home.x + home.w) : 0;
        const top = bleeds('top') ? home.y : 0;
        const bottom = bleeds('bottom') ? frame.height - (home.y + home.h) : 0;
        const rect: Rect = {
          x: home.x - left,
          y: home.y - top,
          w: home.w + left + right,
          h: home.h + top + bottom,
        };
        // Blocks slide in from a bleeding edge (from outside the frame), else a seeded side.
        const sides = (['left', 'right', 'top', 'bottom'] as const).filter(bleeds);
        const from: Side =
          sides.length > 0
            ? rng.pick(sides)
            : rng.pick(['left', 'right', 'top', 'bottom'] as const);
        const color = toneColors[block.tone] ?? accent;
        return { rect, from, color, ink: inkOn(color), moving: move?.block === i };
      });
      const rank = rng.shuffle(blocks.map((_, i) => i));
      const order = new Int32Array(blocks.length);
      rank.forEach((b, i) => {
        order[b] = i;
      });
      const current: Rect[] = blocks.map((b) => ({ ...b.rect }));

      type Unit = {
        id: UnitId;
        rect: Rect;
        shape: Shape;
        x: number;
        /** Cap top (type) or baseline (numeral). */
        y: number;
        bounds: Rect;
      };
      const placed: Unit[] = [];
      for (const spot of layout.units) {
        const list = shapes[spot.id] ?? [];
        const shape = list[spot.shape] ?? list[0];
        if (!shape) continue;
        const rect = moduleRect(spot);
        const x = rect.x + pad;
        if (shape.odometer) {
          // The numeral stands on its span's bottom line.
          const y = rect.y + rect.h - pad;
          const w = shape.odometer.width(settled);
          const h = shape.odometer.capHeight;
          placed.push({ id: spot.id, rect, shape, x, y, bounds: { x, y: y - h, w, h } });
        } else if (shape.block) {
          // Type hangs from its span's top line.
          const y = rect.y + pad;
          const ink = shape.block.ink;
          placed.push({
            id: spot.id,
            rect,
            shape,
            x,
            y,
            bounds: { x: x + ink.x, y: y + ink.y, w: ink.w, h: ink.h },
          });
        }
      }
      const wheels: Wheel[] = settled.slice();
      const offset = { x: 0, y: 0 };
      const breathe = (t: number) => {
        offset.x = 0;
        offset.y = 0;
        if (!move || holdLen < 0.6) return;
        let amount = 0;
        for (let m = 0; m < moves; m++) {
          const at = hold.start + (holdLen * (m + 0.5)) / moves - moveDur / 2;
          const p = ease.snap(clamp01((t - at) / moveDur));
          amount += m % 2 === 0 ? p : -p;
        }
        offset.x = amount * move.dc * mw;
        offset.y = amount * move.dr * mh;
      };

      /** Draws a unit's type, recolored wherever a block lies under it. */
      const recolored = (g: Draw, unit: Unit, paint: (g: Draw, fill: Color) => void) => {
        paint(g, fg);
        blocks.forEach((block, i) => {
          const r = current[i];
          if (!r || r.w <= 0 || r.h <= 0 || block.ink === fg) return;
          const under = unit.rect;
          if (r.x >= under.x + under.w || r.x + r.w <= under.x) return;
          if (r.y >= under.y + under.h || r.y + r.h <= under.y) return;
          g.clip(r, (g) => paint(g, block.ink));
        });
      };

      /** Lines of a unit rising through their masks (and on up and out). */
      const rising = (g: Draw, unit: Unit, fill: Color, t: number, tl: Timeline) => {
        const block = unit.shape.block;
        if (!block) return;
        const rise = (block.lines[0]?.mask.h ?? block.size) * 1.06;
        const delay = DELAYS[unit.id];
        block.lines.forEach((line, i) => {
          const p = tl.p(t, 'in', { delay: (delay + i * lineGap) * k, dur: 0.6 * k }, feel.text);
          const q = tl.p(t, 'out', { delay: i * 0.03, dur: 0.35 }, 'exit');
          if (p <= 0 || q >= 1) return;
          const mask = {
            x: unit.x + line.mask.x,
            y: unit.y + line.mask.y,
            w: line.mask.w,
            h: line.mask.h,
          };
          g.clip(mask, (g) => g.text(line, { x: unit.x, y: unit.y + (1 - p - q) * rise, fill }));
        });
      };

      /** The numeral rises into its window while each wheel rolls up to its digit. */
      const numeral = (g: Draw, unit: Unit, t: number, tl: Timeline) => {
        const odometer = unit.shape.odometer;
        if (!odometer) return;
        const delay = DELAYS.number;
        const p = tl.p(t, 'in', { delay: delay * k, dur: 0.5 * k }, feel.text);
        const q = tl.p(t, 'out', { dur: 0.35 }, 'exit');
        if (p <= 0 || q >= 1) return;
        let slot = 0;
        for (let w = 0; w < settled.length; w++) {
          const wheel = settled[w] as Wheel;
          if ('digit' in wheel) {
            const roll = tl.p(
              t,
              'in',
              { delay: (delay + slot * 0.1) * k, dur: 1.1 * k },
              feel.roll,
            );
            wheels[w] = { digit: (wheel.digit + 10 * feel.turns) * roll };
            slot++;
          } else {
            wheels[w] = wheel;
          }
        }
        const size = odometer.style.size;
        const window: Rect = {
          x: unit.x - pad,
          y: unit.y - odometer.capHeight - 0.24 * size,
          w: unit.bounds.w + 2 * pad,
          h: odometer.capHeight + 0.38 * size,
        };
        const y = unit.y + (1 - p - q) * window.h;
        recolored(g, unit, (g, fill) =>
          g.clip(window, (g) => odometer.draw(g, wheels, { x: unit.x, y, fill })),
        );
      };

      return (g: Draw, t: number, tl: Timeline, regions: boolean) => {
        // Hairlines: horizontals, then verticals, draw across; they retract on the way out.
        if (props.lines) {
          for (let i = 0; i < lineCount; i++) {
            const pin = tl.p(t, 'in', { delay: i * 0.03 * k, dur: 0.4 * k }, feel.lines);
            const pout = tl.p(t, 'out', { delay: (lineCount - 1 - i) * 0.012, dur: 0.35 }, 'exit');
            if (pin <= pout) continue;
            const stroke = { color: lineColor, width: hair, trim: [pout, pin] as const };
            if (i < horizontal.length) {
              const y = horizontal[i] ?? 0;
              g.line(0, y, frame.width, y, stroke);
            } else {
              const x = vertical[i - horizontal.length] ?? 0;
              g.line(x, 0, x, frame.height, stroke);
            }
          }
        }

        // Color blocks slide into their modules in a seeded order; one breathes in the hold.
        breathe(t);
        blocks.forEach((block, i) => {
          const n = order[i] ?? 0;
          const pin = tl.p(t, 'in', { delay: (0.6 + n * 0.14) * k, dur: 0.5 * k }, feel.blocks);
          const pout = tl.p(t, 'out', { delay: n * 0.05, dur: 0.4 }, 'exit');
          const home = block.moving
            ? { ...block.rect, x: block.rect.x + offset.x, y: block.rect.y + offset.y }
            : block.rect;
          const r = wiped(home, block.from, pin, pout);
          const slot = current[i] as Rect;
          if (!r) {
            slot.w = 0;
            slot.h = 0;
            return;
          }
          slot.x = r.x;
          slot.y = r.y;
          slot.w = r.w;
          slot.h = r.h;
          g.rect(r, { fill: block.color });
        });

        // Type rises through line masks; the numeral rolls up to its value.
        for (const unit of placed) {
          if (unit.id === 'number') {
            numeral(g, unit, t, tl);
            if (regions) g.editable('number', unit.bounds);
            continue;
          }
          recolored(g, unit, (g, fill) => rising(g, unit, fill, t, tl));
          if (!regions) continue;
          if (unit.id !== 'meta') {
            g.editable(unit.id, unit.bounds);
            continue;
          }
          const keys = [props.date.trim() ? 'date' : '', props.location.trim() ? 'location' : ''];
          const lines = unit.shape.block?.lines ?? [];
          keys.filter(Boolean).forEach((key, i) => {
            const line = lines[i];
            if (!line) return;
            g.editable(key, {
              x: unit.x + line.ink.x,
              y: unit.y + line.ink.y,
              w: line.ink.w,
              h: line.ink.h,
            });
          });
        }
      };
    };

    const draw = scene(compose(rules, ctx.rng(`layout:${props.layout}`)), String(props.layout));

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg);
        draw(g, t, tl, true);
      },
    };
  },
});
