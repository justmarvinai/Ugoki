/**
 * Departures — split-flap board (docs/templates/07-openers.md §7.4).
 *
 * The expensive detail: the flaps behave like mechanics. Every module turns forward along its
 * character wheel on a stepped clock (… R S T), each with a tiny seeded latency and rate of
 * its own; the upper flap falls with a parabolic fall, foreshortening and darkening as it turns
 * away from the light, the next flap comes down over the old character and lands with a small
 * bounce; a one-pixel hinge gap (with its pivot notches) splits every module, crisp at any
 * resolution.
 */

import {
  adjustLightness,
  CLEAN_END,
  type Color,
  c,
  contrastRatio,
  type Draw,
  defineTemplate,
  type EnergyId,
  ease,
  ensureContrast,
  type FormatId,
  mixOklab,
  type Palette,
  type Rect,
  rgb,
  type TextBlock,
  type TextStyle,
} from '@/engine';
import {
  cycle,
  type FlapState,
  finalChar,
  flapAt,
  type Module,
  parseRows,
  settledAt,
  WHEEL,
} from './board';
import { drawFlap, type FlapColors, type FlapGlyph, flapGeometry, type GlyphSet } from './flap';
import { type Area, BOARDING, type Board, type Kind, layoutBoard } from './layout';

type Composition = {
  /** Board layouts to choose from (the one with the largest modules wins). */
  kinds: readonly Kind[];
  /** Largest title module, as a multiple of a row module; most title lines. */
  titleMax: number;
  titleLines: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { kinds: ['wide'], titleMax: 1.45, titleLines: 2 },
  '1:1': { kinds: ['row', 'stack'], titleMax: 2, titleLines: 2 },
  '4:5': { kinds: ['row', 'stack'], titleMax: 2, titleLines: 3 },
  '9:16': { kinds: ['row', 'stack'], titleMax: 2, titleLines: 3 },
};

/** Stacking (destination over time) must make the modules at least this much bigger. */
const STACK_GAIN = 1.15;

/** Seconds per flip at Balanced energy and Normal speed: rows, the (slower) title, the out. */
const FLIP = 0.05;
const TITLE_FLIP = 0.075;
const OUT_FLIP = 0.032;
/** The board fades in with blank modules before the first row flips. */
const FADE_IN = 0.5;
/** Row stagger, module ripple along a row and along the title (Balanced seconds). */
const ROW_GAP = 0.25;
const RIPPLE = 0.012;
const TITLE_RIPPLE = 0.02;
/** The title starts this long after the last row. */
const TITLE_AFTER = 0.35;
/** A module's seeded latency, and the spread of its rate. */
const LATENCY = 0.045;
const RATE = 0.08;
const OUT = 0.6;
/** Hold: every EVERY seconds a status field flips; the first one this long into the hold. */
const EVERY = 2;
const FIRST_EVENT = 0.9;

const SPEEDS = { slow: 1.4, normal: 1, fast: 0.7 } as const;

/** How far a landing flap bounces back off its stop, by energy (Calm lands dead). */
const BOUNCE: Record<EnergyId, number> = { calm: 0, balanced: 0.07, punchy: 0.12 };

/** Intermediate characters per module (seeded), by energy. */
const TURNS: Record<EnergyId, [number, number]> = {
  calm: [4, 8],
  balanced: [4, 12],
  punchy: [6, 12],
};

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const luminance = (color: Color) => contrastRatio(color, BLACK) * 0.05 - 0.05;
const chroma = (color: Color) =>
  Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);

/**
 * The board's colors from the palette's roles: Classic (dark flaps, the palette's lightest
 * neutral), Amber (dark flaps, the accent) or Light (light flaps, the darkest neutral).
 */
function boardColors(roles: Palette['roles'], board: 'classic' | 'amber' | 'light'): FlapColors {
  const all = [roles.bg, roles.fg, roles.accent2, roles.surface, roles.muted, roles.accent];
  const quiet = all.filter((color) => chroma(color) < 0.14);
  const pool = quiet.length > 0 ? quiet : all;
  const byLight = [...pool].sort((a, b) => luminance(b) - luminance(a));
  let light = byLight[0] ?? WHITE;
  let dark = byLight[byLight.length - 1] ?? BLACK;
  if (luminance(light) < 0.45) light = mixOklab(light, WHITE, 0.9);
  if (luminance(dark) > 0.05) dark = mixOklab(dark, BLACK, 0.85);

  if (board === 'light') {
    const flap = mixOklab(light, dark, 0.07);
    return {
      top: adjustLightness(flap, 0.012),
      bottom: adjustLightness(flap, -0.018),
      ink: ensureContrast(dark, flap, 7),
      gap: mixOklab(flap, dark, 0.38),
      shade: BLACK,
    };
  }
  // Dark flaps stay visibly lighter than the page, even on pure black.
  let flap = mixOklab(dark, WHITE, 0.085);
  if (contrastRatio(flap, roles.bg) < 1.22 && luminance(roles.bg) < 0.1) {
    flap = mixOklab(dark, WHITE, 0.12);
  }
  const ink = board === 'amber' ? ensureContrast(roles.accent, flap, 6) : light;
  return {
    top: adjustLightness(flap, 0.028),
    bottom: adjustLightness(flap, -0.004),
    ink: ensureContrast(ink, flap, 4.5),
    gap: mixOklab(dark, BLACK, 0.6),
    shade: BLACK,
  };
}

/** Where the board is laid out: the title-safe area, symmetric around the frame's axis. */
function boardArea(frame: { vertical: boolean; cx: number; safe: { title: Rect; social: Rect } }) {
  const area = frame.vertical ? frame.safe.social : frame.safe.title;
  const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
  return { x: frame.cx - half, y: area.y, w: half * 2, h: area.h };
}

/** The board's layout for a format: the kind with the largest modules. */
function planBoard(format: FormatId, area: Area, rowsText: string, title: string): Board {
  const comp = COMPOSITIONS[format];
  const rows = parseRows(rowsText);
  const heading = title.trim().toLocaleUpperCase('en');
  let best: Board | null = null;
  for (const kind of comp.kinds) {
    const board = layoutBoard(kind, rows, heading, area, {
      titleMax: comp.titleMax,
      titleLines: comp.titleLines,
      place: 0.46,
    });
    const gain = kind === 'stack' ? STACK_GAIN : 1;
    if (!best || board.pitch > best.pitch * gain) best = board;
  }
  return best as Board;
}

/** When the flip-in is over (seconds from the start, real time): a bound for `timing`. */
function flipInEnd(board: Board, energy: { time: number; stagger: number }, speed: number) {
  const rows = board.entries.length - 1;
  let cols = 0;
  for (let i = board.titleCells; i < board.cells.length; i++) {
    const cell = board.cells[i];
    if (cell) cols = Math.max(cols, (cell.x - board.bounds.x) / board.pitch);
  }
  const e = energy.time;
  const lastRow = FADE_IN * e + Math.max(0, rows - 1) * ROW_GAP * energy.stagger;
  const rowsEnd = lastRow + cols * RIPPLE * energy.stagger + LATENCY + 14 * FLIP * e * speed * 1.1;
  const titleEnd =
    lastRow +
    TITLE_AFTER * e +
    (board.titleCells / 2) * TITLE_RIPPLE * energy.stagger +
    LATENCY +
    14 * TITLE_FLIP * e * speed * 1.1;
  return Math.max(rowsEnd, board.titleCells > 0 ? titleEnd : 0);
}

export default defineTemplate({
  id: 'departures',
  version: 1,
  meta: {
    name: 'Departures',
    tagline: 'Split-flap board',
    category: 'openers',
    tags: ['opener', 'travel', 'split-flap', 'board', 'tour'],
    useCases: [
      'Travel vlogs',
      'Tour announcements',
      'Relocations',
      'Event line-ups',
      'What’s next',
    ],
  },
  formats: ['16:9', '1:1', '4:5', '9:16'],
  structure: 'in-hold-out',
  duration: { default: 7, min: 5, max: 15 },
  alpha: 'none',
  poster: 3.5,
  palettes: [
    { kind: 'library', id: 'amber' },
    { kind: 'library', id: 'mono-dark' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'midnight' },
  ],
  pairings: ['mono', 'technical', 'grotesk', 'sport'],
  controls: {
    title: c.text({
      label: 'Title row',
      default: 'NEXT STOP: EVERYWHERE',
      maxLength: 28,
      primary: true,
    }),
    rows: c.text({
      label: 'Rows',
      default: 'TOKYO 09:40\nLISBON 11:15\nREYKJAVIK 13:05\nMEXICO CITY 16:50',
      maxLength: 100,
      multiline: true,
      maxLines: 5,
      hint: 'One row per line (2–5): destination, then a time. Separate fields with | for a status.',
    }),
    board: c.choice({
      label: 'Board',
      default: 'amber',
      options: [
        { value: 'classic', label: 'Classic' },
        { value: 'amber', label: 'Amber' },
        { value: 'light', label: 'Light' },
      ],
    }),
    speed: c.choice({
      label: 'Flip speed',
      group: 'motion',
      default: 'normal',
      options: [
        { value: 'slow', label: 'Slow' },
        { value: 'normal', label: 'Normal' },
        { value: 'fast', label: 'Fast' },
      ],
    }),
  },
  looks: [
    { id: 'amber', name: 'Amber', palette: { kind: 'library', id: 'amber' }, pairing: 'mono' },
    {
      id: 'mono-dark',
      name: 'Mono Dark',
      palette: { kind: 'library', id: 'mono-dark' },
      pairing: 'mono',
      values: { board: 'classic' },
    },
    {
      id: 'paper',
      name: 'Paper',
      palette: { kind: 'library', id: 'paper' },
      pairing: 'mono',
      values: { board: 'light' },
    },
  ],
  timing: ({ props, frame, energy }) => {
    const board = planBoard(frame.format, boardArea(frame), props.rows, props.title);
    const end = flipInEnd(board, energy, SPEEDS[props.speed]);
    return { in: end / energy.time, out: OUT, tail: CLEAN_END, readable: props.title };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const e = energy.time;
    const s = energy.stagger;
    const speed = SPEEDS[props.speed];
    const board = planBoard(frame.format, boardArea(frame), props.rows, props.title);
    const colors = boardColors(palette.roles, props.board);
    const rowGeo = flapGeometry(board.w, board.h);
    const titleGeo = flapGeometry(board.titleW, board.titleH);

    // --- glyphs: every character a module may show, centered on its module ------------------
    const display = pairing.display;
    const baseStyle: TextStyle = {
      font: display.font,
      italicFont: display.italic,
      size: 100,
      weight: display.weight,
      width: display.width,
      features: display.features,
    };
    const chars = new Set<string>(WHEEL);
    for (const cell of board.cells) chars.add(cell.char);
    for (const field of board.status) for (const char of field.alternate) chars.add(char);
    const glyphSet = (geo: { w: number; h: number; hinge: number }): GlyphSet =>
      makeGlyphs(text, baseStyle, geo, chars);
    const rowGlyphs = glyphSet(rowGeo);
    const titleGlyphs = glyphSet(titleGeo);

    // --- schedule -----------------------------------------------------------------------------
    const turns = TURNS[energy.id];
    const inStart = timeline.sections.in.start;
    const outStart = timeline.sections.out.start;
    const holdStart = timeline.sections.hold.start;
    const rng = ctx.rng('flaps');
    const modules: Module[] = board.cells.map((cell) => ({
      x: cell.x,
      y: cell.y,
      title: cell.title,
      initial: ' ',
      segments: [],
    }));
    const rows = board.entries.length - 1;
    const rowStart = (r: number) => inStart + FADE_IN * e + r * ROW_GAP * s;
    const lastRow = rowStart(Math.max(0, rows - 1));
    const rateOf = (period: number) => period * (1 + rng.range(-RATE, RATE));
    for (let r = 0; r < rows; r++) {
      const from = board.entries[r] ?? 0;
      const to = board.entries[r + 1] ?? from;
      for (let i = from; i < to; i++) {
        const cell = board.cells[i];
        const module = modules[i];
        if (!cell || !module || cell.char === ' ') continue;
        const col = Math.round((cell.x - board.bounds.x) / board.pitch);
        module.segments.push({
          start: rowStart(r) + col * RIPPLE * s + rng.range(0, LATENCY),
          period: rateOf(FLIP * e * speed),
          chars: cycle(' ', cell.char, rng.int(turns[0], turns[1]), rng),
        });
      }
    }
    for (let i = 0; i < board.titleCells; i++) {
      const cell = board.cells[i];
      const module = modules[i];
      if (!cell || !module || cell.char === ' ') continue;
      const col = Math.round((cell.x - board.bounds.x) / board.titlePitch);
      const line = Math.round((cell.y - board.bounds.y) / (board.titleH * 1.16));
      module.segments.push({
        start:
          lastRow + TITLE_AFTER * e + (col + line * 3) * TITLE_RIPPLE * s + rng.range(0, LATENCY),
        period: rateOf(TITLE_FLIP * e * speed),
        chars: cycle(' ', cell.char, rng.int(Math.max(6, turns[0]), turns[1]), rng),
      });
    }

    // Hold: every EVERY seconds a status field flips (BOARDING ↔ ON TIME, or time ↔ BOARDING),
    // working down the board like a real one (the first row already boards on a wide board).
    const events = ctx.rng('events');
    const showing = board.status.map((field) => field.rest);
    const settled = Math.max(holdStart, ...modules.map(settledAt));
    let pick = board.status[0]?.rest === BOARDING ? 1 : 0;
    for (
      let when = Math.max(holdStart + FIRST_EVENT, settled + 0.3);
      when + 0.8 < outStart;
      when += EVERY, pick++
    ) {
      if (board.status.length === 0) break;
      pick %= board.status.length;
      const field = board.status[pick];
      if (!field) continue;
      const next = showing[pick] === field.rest ? field.alternate : field.rest;
      showing[pick] = next;
      const width = field.cells.length;
      const glyphs = [...next].slice(0, width);
      const padded =
        field.align === 'left'
          ? [...glyphs, ...Array.from({ length: width - glyphs.length }, () => ' ')]
          : [...Array.from({ length: width - glyphs.length }, () => ' '), ...glyphs];
      field.cells.forEach((index, k) => {
        const module = modules[index];
        if (!module) return;
        const current = finalChar(module);
        const target = padded[k] ?? ' ';
        if (current === target) return;
        module.segments.push({
          start: when + k * 0.03 * s + events.range(0, LATENCY),
          period: rateOf(FLIP * e * speed),
          chars: cycle(current, target, events.int(2, 6), events, true),
        });
      });
    }

    // Out: every module flips to blank, fast, in a ripple from the left; then the board fades.
    const outRng = ctx.rng('out');
    modules.forEach((module) => {
      const current = finalChar(module);
      if (current === ' ') return;
      const across = (module.x - board.bounds.x) / Math.max(1, board.bounds.w);
      module.segments.push({
        start: outStart + across * 0.16 * e + outRng.range(0, 0.06 * e),
        period: OUT_FLIP * e * (0.9 + 0.2 * outRng.next()),
        chars: cycle(current, ' ', outRng.int(1, 3), outRng),
      });
    });
    for (const module of modules) module.segments.sort((a, b) => a.start - b.start);

    const fadeIn = (t: number) => ease.drift((t - inStart) / (FADE_IN * e * 0.9));
    const fadeOut = (t: number) => 1 - ease.drift((t - outStart - 0.38 * e) / (0.2 * e));

    const bounce = BOUNCE[energy.id];
    const state: FlapState = { from: ' ', to: ' ', phase: 0, landed: Number.POSITIVE_INFINITY };
    const pad = 2 * frame.u;
    const layerBounds: Rect = {
      x: board.bounds.x - pad,
      y: board.bounds.y - pad,
      w: board.bounds.w + 2 * pad,
      h: board.bounds.h + 2 * pad,
    };

    return {
      render: ({ t, g }) => {
        g.fill(palette.roles.bg, { background: true });
        const opacity = fadeIn(t) * fadeOut(t);
        if (opacity <= 0) return;
        const px = g.pixel;
        const snap = (v: number) => Math.round(v / px) * px;
        const drawBoard = (g: Draw) => {
          for (let i = 0; i < modules.length; i++) {
            const module = modules[i] as Module;
            flapAt(module, t, state);
            drawFlap(
              g,
              snap(module.x),
              snap(module.y),
              module.title ? titleGeo : rowGeo,
              module.title ? titleGlyphs : rowGlyphs,
              colors,
              state,
              px,
              bounce,
            );
          }
        };
        g.movable('board', board.bounds, (g) => {
          if (opacity < 1) g.layer({ opacity, bounds: layerBounds }, drawBoard);
          else drawBoard(g);
          if (board.titleCells > 0) g.editable('title', board.titleBounds);
          if (rows > 0) g.editable('rows', board.rowsBounds);
        });
      },
    };
  },
});

/** Shapes every character once at the module's size: cap height ~56% of the module. */
function makeGlyphs(
  text: { line(text: string, style: TextStyle): TextBlock },
  base: TextStyle,
  geo: { w: number; h: number; hinge: number },
  chars: ReadonlySet<string>,
): GlyphSet {
  const probe = text.line('H', base);
  const capRatio = probe.capHeight / 100;
  const size = (0.56 * geo.h) / capRatio;
  const style = { ...base, size };
  const cap = capRatio * size;
  const glyphs = new Map<string, FlapGlyph>();
  for (const char of chars) {
    if (char === ' ') continue;
    const block = text.line(char, style);
    const line = block.lines[0];
    if (!line) continue;
    const ink = block.ink;
    // Wide letters of proportional faces (W, M) are condensed to keep a margin in the module.
    const scaleX = Math.min(1, (0.82 * geo.w) / Math.max(1e-6, ink.w));
    glyphs.set(char, {
      block,
      x: (geo.w - ink.w) / 2 - ink.x,
      y: geo.hinge + cap / 2 - line.baseline,
      scaleX,
    });
  }
  return glyphs;
}
