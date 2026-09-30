/**
 * Pattern — brand pattern lockup (docs/templates/06-brand-quotes.md §6.5).
 *
 * The expensive detail: the tiling is solved, not rolled. Every tile's ground, shape,
 * orientation and shape color are assigned by rules — no two neighbors share a ground or the
 * same shape in the same orientation, no tile repeats a diagonal neighbor, colors balance by
 * the area they cover and shapes by count — and the ring around the logo never takes the page
 * color, so the window always reads as a clean rectangle. Every seed is a designed pattern;
 * the seed only breaks ties. The faces tiles flip to in the hold obey the same rules against
 * every neighbor state, and the hold's waves return every tile to its first face, so the hold
 * loops seamlessly.
 */

import {
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  type EaseName,
  type EnergyId,
  ease,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type Palette,
  type PathData,
  type Rect,
  rgb,
  type TextBlock,
} from '@/engine';
import { SHAPE_SETS, type ShapeKind, shapePaths } from './shapes';
import { type Face, solveTiling } from './tiling';

/** Tiles across the frame's short side, by density. */
const DENSITY = { low: 5, medium: 7, high: 9 } as const;

/** Logo size: height = K / √aspect (u), so marks and wide lockups carry similar weight. */
const LOGO_K: Record<FormatId, number> = { '16:9': 22, '9:16': 26, '1:1': 24, '4:5': 25 };
const TAGLINE_SIZE: Record<FormatId, number> = { '16:9': 3, '9:16': 3.6, '1:1': 3.2, '4:5': 3.3 };

/** Choreography (Balanced seconds from the start of `in`). */
const FLIP_IN = 0.46;
const WAVE = 0.85;
const CLEAR_AT = 1.4;
const CLEAR_SPREAD = 0.22;
const CLEAR = 0.34;
const LOGO_AT = 1.5;
const TAGLINE_AT = 1.72;
const IN = 2.1;
/**
 * Out: the window's tiles flood back over the lockup (from its edges in), then every tile flips
 * away along the reverse of the entrance wave, down to the page.
 */
const COVER_SPREAD = 0.12;
const COVER = 0.2;
const LEAVE_AT = 0.2;
const LEAVE_SPREAD = 0.24;
const LEAVE = 0.22;
const OUT = 0.7;

/**
 * Energy: Calm flips in without overshoot, turns shapes at most once and breathes slowly;
 * Punchy pops, turns shapes up to twice and flips its hold waves on a beat.
 */
const FEEL: Record<
  EnergyId,
  { flip: EaseName; turns: number; turn: EaseName; every: number; hold: EaseName; holdFlip: number }
> = {
  calm: { flip: 'glide', turns: 1, turn: 'drift', every: 2.2, hold: 'drift', holdFlip: 0.8 },
  balanced: { flip: 'pop', turns: 2, turn: 'snap', every: 1.5, hold: 'snap', holdFlip: 0.55 },
  punchy: { flip: 'pop', turns: 2, turn: 'snap', every: 1, hold: 'snap', holdFlip: 0.4 },
};
/** A hold wave crosses the grid in this long (seconds, before Energy). */
const HOLD_SWEEP = 1.1;

const BLACK = rgb(0, 0, 0);
/** How dark a tile gets edge-on (turned away from the light). */
const SHADE = 0.24;
const distinct = (a: Color, b: Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 0.15;

/** The palette's colors for tiles: the page ground first, then accent, fg, accent2, accent3. */
function tileColors(roles: Palette['roles'], count: number): Color[] {
  const colors: Color[] = [];
  for (const color of [roles.bg, roles.accent, roles.fg, roles.accent2, roles.accent3]) {
    if (colors.every((other) => distinct(other, color))) colors.push(color);
  }
  return colors.slice(0, Math.max(2, count));
}

type Tile = {
  cx: number;
  cy: number;
  col: number;
  row: number;
  a: Face;
  b: Face;
  /** Flip-in start (Balanced seconds into `in`), shape turns after landing. */
  enter: number;
  turns: number;
  /** In the window (cleared for the logo) and its radial order; in the calm ring. */
  window: boolean;
  radial: number;
  calm: boolean;
  /** Out: when a window tile floods back, when every tile flips away (Balanced seconds). */
  cover: number;
  leave: number;
  /** Hold flips: absolute start times (each toggles the face). */
  flips: number[];
};

export default defineTemplate({
  id: 'pattern',
  version: 1,
  meta: {
    name: 'Pattern',
    tagline: 'Brand pattern lockup',
    category: 'brand-quotes',
    tags: ['brand', 'pattern', 'logo', 'bauhaus', 'identity', 'geometric'],
    useCases: ['Brand intros', 'Event identities', 'Social headers', 'Sign-offs'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 5, min: 3, max: 12 },
  alpha: 'none',
  poster: 2.4,
  palettes: [
    { kind: 'library', id: 'bauhaus' },
    { kind: 'library', id: 'swiss' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'forest' },
    { kind: 'library', id: 'ink' },
  ],
  pairings: ['grotesk', 'wide', 'studio', 'quirky', 'editorial'],
  controls: {
    logo: c.image({
      label: 'Logo',
      accept: 'logo',
      default: { kind: 'placeholder', id: 'halden' },
      optional: true,
    }),
    tagline: c.text({
      label: 'Tagline',
      default: 'Studio for moving images',
      maxLength: 40,
      optional: true,
      primary: true,
    }),
    shapes: c.choice({
      label: 'Shape set',
      default: 'bauhaus',
      options: [
        { value: 'bauhaus', label: 'Bauhaus' },
        { value: 'circles', label: 'Circles' },
        { value: 'lines', label: 'Lines' },
        { value: 'mixed', label: 'Mixed' },
      ],
    }),
    density: c.choice({
      label: 'Density',
      default: 'medium',
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
    }),
    colors: c.number({
      label: 'Colors',
      group: 'style',
      default: 5,
      min: 2,
      max: 5,
      step: 1,
      hint: 'How many of the palette’s colors the tiles use',
    }),
  },
  looks: [
    {
      id: 'bauhaus',
      name: 'Bauhaus',
      palette: { kind: 'library', id: 'bauhaus' },
      pairing: 'grotesk',
    },
    {
      id: 'swiss',
      name: 'Swiss',
      palette: { kind: 'library', id: 'swiss' },
      pairing: 'grotesk',
      values: { shapes: 'lines', density: 'high' },
    },
    {
      id: 'candy',
      name: 'Candy',
      palette: { kind: 'library', id: 'candy' },
      pairing: 'wide',
      values: { shapes: 'circles', density: 'low' },
    },
  ],
  timing: ({ props }) => ({
    in: IN,
    out: OUT,
    tail: CLEAN_END,
    readable: props.tagline,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u, width: W, height: H } = frame;
    const feel = FEEL[energy.id];
    const colors = tileColors(palette.roles, props.colors);
    const ground = palette.roles.bg;
    const fg = palette.roles.fg;
    const logo = ctx.graphic('logo');
    const area = frame.vertical ? frame.safe.social : frame.safe.title;

    // --- grid: square tiles, the short side divided evenly, centered on the frame -----------
    const across = DENSITY[props.density];
    const cell = Math.min(W, H) / across;
    const cols = W <= H ? across : Math.ceil(W / cell - 1e-6);
    const rows = W <= H ? Math.ceil(H / cell - 1e-6) : across;
    const x0 = (W - cols * cell) / 2;
    const y0 = (H - rows * cell) / 2;

    // --- the lockup: logo over tagline -------------------------------------------------------
    const taglineText = props.tagline.trim();
    const setTagline = (maxWidth: number): TextBlock | null =>
      taglineText
        ? text.layout(taglineText, {
            style: {
              font: pairing.text.font,
              size: TAGLINE_SIZE[frame.format] * u,
              weight: 500,
              width: pairing.text.width,
              tracking: 0.02,
              features: pairing.text.features,
            },
            maxWidth,
            maxLines: 2,
            lineHeight: 1.25,
            align: 'center',
            fit: { minSize: 2.4 * u },
          })
        : null;
    const aspect = logo && logo.ink.w > 0 && logo.ink.h > 0 ? logo.ink.w / logo.ink.h : 1;
    const nominalH = logo ? (LOGO_K[frame.format] * u) / Math.sqrt(aspect) : 0;
    const gap = logo && taglineText ? 4 * u : 0;
    let taglineMeasure = area.w * 0.8;
    let tagline = setTagline(taglineMeasure);
    const lockupW = Math.max(nominalH * aspect, tagline?.width ?? 0);
    const lockupH = nominalH + gap + (tagline ? tagline.height + 0.3 * tagline.size : 0);
    const hasLockup = Boolean(logo || tagline);

    // The window: the fewest tiles (keeping the grid's symmetry) that frame the lockup, with
    // at least one ring of tiles around it.
    const span = (need: number, total: number) => {
      let n = total % 2;
      if (n === 0) n = 2;
      while (n * cell < need && n + 2 <= total - 2) n += 2;
      return n;
    };
    const winCols = hasLockup ? span(lockupW + 5 * u, cols) : 0;
    const winRows = hasLockup ? span(lockupH + 5 * u, rows) : 0;
    const winCol0 = Math.floor((cols - winCols) / 2);
    const winRow0 = Math.floor((rows - winRows) / 2);
    const windowRect: Rect = {
      x: x0 + winCol0 * cell,
      y: y0 + winRow0 * cell,
      w: winCols * cell,
      h: winRows * cell,
    };

    // Fit the lockup inside the window (leaving a margin of the page around it).
    const room = { w: windowRect.w - 5 * u, h: windowRect.h - 4.5 * u };
    if (tagline && tagline.width > room.w) {
      taglineMeasure = room.w;
      tagline = setTagline(taglineMeasure);
    }
    const taglineH = tagline ? tagline.height + 0.3 * tagline.size : 0;
    let logoH = nominalH;
    let logoW = logoH * aspect;
    if (logo) {
      const maxW = room.w * 0.86;
      const maxH = room.h - gap - taglineH;
      const k = Math.min(1, maxW / logoW, maxH / logoH);
      logoH *= k;
      logoW *= k;
    }
    const blockH = logoH + gap + taglineH;
    const top = windowRect.y + (windowRect.h - blockH) / 2;
    const logoRect: Rect = { x: frame.cx - logoW / 2, y: top, w: logoW, h: logoH };
    const taglineY = top + logoH + gap;
    // Centered lines are aligned within the measure: center the measure on the frame.
    const taglineX = frame.cx - taglineMeasure / 2;
    const taglineBounds: Rect | null = tagline
      ? {
          x: taglineX + tagline.ink.x,
          y: taglineY + tagline.ink.y,
          w: tagline.ink.w,
          h: tagline.ink.h,
        }
      : null;

    // --- tiles --------------------------------------------------------------------------------
    const inWindow = (col: number, row: number) =>
      col >= winCol0 && col < winCol0 + winCols && row >= winRow0 && row < winRow0 + winRows;
    const ringOf = (col: number, row: number) =>
      winCols > 0 &&
      col >= winCol0 - 1 &&
      col <= winCol0 + winCols &&
      row >= winRow0 - 1 &&
      row <= winRow0 + winRows &&
      !inWindow(col, row);
    const ring = new Set<number>();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) if (ringOf(col, row)) ring.add(row * cols + col);
    }
    const tiling = solveTiling(
      cols,
      rows,
      colors.length,
      SHAPE_SETS[props.shapes],
      ctx.rng('tiling'),
      ring,
    );

    const jitter = ctx.rng('timing');
    const wcx = winCol0 + (winCols - 1) / 2;
    const wcy = winRow0 + (winRows - 1) / 2;
    const maxRadial = Math.max(1e-6, Math.hypot(winCols / 2, winRows / 2));
    const diagonal = Math.max(1, cols + rows - 2);
    const tiles: Tile[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        const a = tiling.a[index] as Face;
        const b = tiling.b[index] as Face;
        const along = (col + row) / diagonal;
        const window = inWindow(col, row);
        tiles.push({
          cx: x0 + (col + 0.5) * cell,
          cy: y0 + (row + 0.5) * cell,
          col,
          row,
          a,
          b,
          enter: 0.04 + along * ctx.stagger(WAVE) + jitter.range(0, 0.06),
          turns: window ? 0 : jitter.int(0, feel.turns),
          window,
          radial: Math.hypot(col - wcx, row - wcy) / maxRadial,
          calm: window || ring.has(index),
          cover: 0,
          leave: LEAVE_AT + (1 - along) * ctx.stagger(LEAVE_SPREAD) + jitter.range(0, 0.03),
          flips: [],
        });
      }
    }
    // Window tiles flood back from the window's edges to its center; none leaves before the
    // lockup is fully covered.
    let covered = 0;
    for (const tile of tiles) {
      if (!tile.window) continue;
      tile.cover = (1 - tile.radial) * ctx.stagger(COVER_SPREAD);
      covered = Math.max(covered, tile.cover + COVER);
    }
    for (const tile of tiles) if (tile.window) tile.leave = Math.max(tile.leave, covered + 0.02);

    // Hold: seeded waves flip a third of the outer tiles each, from alternating sides; after
    // six waves every tile has flipped back, so the hold loops seamlessly.
    const hold = timeline.sections.hold;
    const outStart = timeline.sections.out.start;
    const waves = ctx.rng('waves');
    const outer = tiles.filter((tile) => !tile.calm);
    const groups = [0, 1, 2].map(() => [] as Tile[]);
    waves.shuffle(outer).forEach((tile, i) => {
      groups[i % 3]?.push(tile);
    });
    const holdFlip = feel.holdFlip;
    const sweep = HOLD_SWEEP * energy.stagger;
    const directions = waves.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).map((k) => (k * Math.PI) / 4);
    for (let w = 0; ; w++) {
      const start = hold.start + 0.35 + w * feel.every;
      if (start + sweep + holdFlip > outStart - 0.05) break;
      const angle = directions[w % directions.length] ?? 0;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      // Project tiles on the wave's direction, normalized over the grid.
      const corners = [
        [0, 0],
        [cols - 1, 0],
        [0, rows - 1],
        [cols - 1, rows - 1],
      ].map(([cx = 0, cy = 0]) => cx * dx + cy * dy);
      const lo = Math.min(...corners);
      const hi = Math.max(...corners);
      for (const tile of groups[w % 3] ?? []) {
        const along = (tile.col * dx + tile.row * dy - lo) / Math.max(1e-6, hi - lo);
        tile.flips.push(start + along * sweep);
      }
    }

    // --- drawing ------------------------------------------------------------------------------
    const paths = shapePaths(cell);
    const half = cell / 2;
    const flipIn = ease[feel.flip];
    const turnEase = ease[feel.turn];
    const holdEase = ease[feel.hold];
    const inAt = (offset: number) => timeline.at('in', offset);
    const k = energy.time;

    const drawFace = (g: Draw, face: Face, rotate: number, clip: boolean) => {
      g.rect({ x: -half, y: -half, w: cell, h: cell }, { fill: colors[face.ground] ?? ground });
      const shape = (g: Draw) =>
        g.group({ rotate }, (g) =>
          g.path(paths[face.shape as ShapeKind] as PathData, { fill: colors[face.ink] ?? fg }),
        );
      if (clip) g.clip({ x: -half, y: -half, w: cell, h: cell }, shape);
      else shape(g);
    };

    // Tile edges snapped to output pixels on every frame: tiles at rest meet exactly, with no
    // anti-aliased seams between them.
    const xs = new Float64Array(cols + 1);
    const ys = new Float64Array(rows + 1);
    const snapGrid = (px: number) => {
      for (let i = 0; i <= cols; i++) xs[i] = Math.round((x0 + i * cell) / px) * px;
      for (let i = 0; i <= rows; i++) ys[i] = Math.round((y0 + i * cell) / px) * px;
    };

    /** A tile at time t: which face, how wide (the flip), its shape's turn. */
    const drawTile = (g: Draw, tile: Tile, t: number) => {
      // Entrance: flips in from edge-on; the shape then turns into place in 90° steps.
      const p = (t - inAt(tile.enter)) / (FLIP_IN * k);
      if (p <= 0) return;
      let width = flipIn(Math.min(1, p));
      let face = tile.a;
      let turned = 0;
      if (tile.turns > 0) {
        const landed = inAt(tile.enter) + FLIP_IN * k * 0.8;
        for (let s = 0; s < tile.turns; s++) {
          turned += turnEase(Math.min(1, Math.max(0, (t - landed - s * 0.17 * k) / (0.2 * k))));
        }
      }
      let rotate = (face.turn - tile.turns + turned) * 90;
      // Hold flips toggle between the faces: edge-on at the middle of each flip.
      let shade = width < 1 ? (1 - Math.min(1, width)) * SHADE : 0;
      for (const start of tile.flips) {
        if (t < start) break;
        const q = (t - start) / holdFlip;
        if (q >= 1) {
          face = face === tile.a ? tile.b : tile.a;
          continue;
        }
        const angle = holdEase(q) * Math.PI;
        width = Math.abs(Math.cos(angle));
        shade = Math.sin(angle) * SHADE;
        if (angle > Math.PI / 2) face = face === tile.a ? tile.b : tile.a;
        break;
      }
      if (face !== tile.a) rotate = face.turn * 90;
      let scale = 1;
      if (tile.window) {
        // Cleared for the lockup; on the way out, flooding back over it.
        const back = (t - timeline.at('out', tile.cover)) / (COVER * k);
        if (back > 0) {
          width = ease.snap(Math.min(1, back));
          shade = (1 - width) * SHADE;
        } else {
          scale = windowScale(tile, t);
          if (scale <= 0.001) return;
        }
      }
      // Out: flips away along the reverse wave.
      const gone = (t - timeline.at('out', tile.leave)) / (LEAVE * k);
      if (gone >= 1) return;
      if (gone > 0) {
        const q = ease.exit(gone);
        width *= Math.cos((q * Math.PI) / 2);
        shade = Math.max(shade, q * SHADE);
      }
      if (width <= 0.001) return;
      const left = xs[tile.col] ?? 0;
      const right = xs[tile.col + 1] ?? 0;
      const upper = ys[tile.row] ?? 0;
      const lower = ys[tile.row + 1] ?? 0;
      g.group(
        {
          x: (left + right) / 2,
          y: (upper + lower) / 2,
          scaleX: ((right - left) / cell) * width * scale,
          scaleY: ((lower - upper) / cell) * scale,
        },
        (g) => {
          drawFace(g, face, rotate, rotate % 90 !== 0);
          if (shade > 0.005) {
            g.rect({ x: -half, y: -half, w: cell, h: cell }, { fill: BLACK, opacity: shade });
          }
        },
      );
    };

    /** Window tiles scale away radially (center first) to clear the stage. */
    const windowScale = (tile: Tile, t: number) => {
      const start = inAt(CLEAR_AT + tile.radial * CLEAR_SPREAD * energy.stagger);
      return 1 - ease[energy.move]((t - start) / (CLEAR * k));
    };

    // Tagline glyphs rise inside their line masks.
    const rise = (tagline?.lines[0]?.mask.h ?? 0) * 1.05;
    let risen = 0;
    const motion: GlyphTransform = { dy: 0 };
    const riseGlyph = (_glyph: Glyph): GlyphTransform => {
      motion.dy = risen;
      return motion;
    };

    const lockupBounds: Rect = {
      x: Math.min(logoRect.x, taglineBounds?.x ?? logoRect.x) - 3 * u,
      y: logoRect.y - 3 * u,
      w: Math.max(logoRect.w, taglineBounds?.w ?? 0) + 6 * u,
      h: blockH + 6 * u,
    };
    const coveredAt = timeline.at('out', covered);

    return {
      render: ({ t, g, tl }) => {
        g.fill(ground, { background: true });
        snapGrid(g.pixel);

        // The lockup, under the tiles that flood back over it on the way out.
        if (hasLockup && t < coveredAt) {
          const shown = tl.p(t, 'in', { delay: LOGO_AT, dur: 0.65 }, 'glide');
          if (logo && shown > 0) {
            const scale = 0.92 + 0.08 * shown;
            const blur = 1.1 * energy.blur * (1 - shown);
            const draw = (g: Draw) =>
              g.group(
                {
                  scale,
                  originX: frame.cx,
                  originY: logoRect.y + logoRect.h / 2,
                  opacity: Math.min(1, shown * 1.6),
                },
                (g) => g.graphic(logo, logoRect, { current: fg }),
              );
            if (blur > 0.02) g.fx({ blur, bounds: lockupBounds }, draw);
            else draw(g);
            g.editable('logo', logoRect);
          }
          if (tagline && taglineBounds) {
            const p = tl.p(t, 'in', { delay: TAGLINE_AT, dur: 0.6 }, energy.enter);
            if (p > 0) {
              risen = (1 - p) * rise;
              for (const line of tagline.lines) {
                g.clip(
                  {
                    x: taglineX + line.mask.x,
                    y: taglineY + line.mask.y,
                    w: line.mask.w,
                    h: line.mask.h,
                  },
                  (g) => g.text(line, { fill: fg, x: taglineX, y: taglineY, glyph: riseGlyph }),
                );
              }
              g.editable('tagline', taglineBounds);
            }
          }
        }

        for (const tile of tiles) drawTile(g, tile, t);
      },
    };
  },
});
