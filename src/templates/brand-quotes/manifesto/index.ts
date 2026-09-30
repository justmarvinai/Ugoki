/**
 * Manifesto — statement sequence (docs/templates/06-brand-quotes.md §6.3).
 *
 * The expensive detail: it is cut like an edited brand film, not a slideshow. Every statement
 * is on screen for its reading length (1.2 s + 0.05 s per character), then shaped by rhythm:
 * the opening statement gets its full length, the middle ones tighten progressively — their
 * entrances and wipes quicken along — the last one lands at full length and the finale holds
 * long. Hard cuts sit between frames at every export frame rate (a 180° shutter), so an
 * inversion never smears two statements into one frame. Three typographic treatments (bold
 * sans · italic serif · outline) and three entrances (mask rise · horizontal push · focus from
 * blur) cycle through the statements, sides alternate between the palette and its partner, and
 * emphasized words take the accent — or a marker block where the accent doesn't read.
 */

import {
  type Color,
  c,
  clamp01,
  type Draw,
  defineTemplate,
  type EaseName,
  ease,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type Rect,
  type TextBlock,
  type TextLine,
  type TextStyle,
  unionRect,
} from '@/engine';
import { autoDuration, LEAD, OUT, PACES, parseStatements, planEdit, TAIL } from './plan';
import { type PairId, type Side, sides } from './sides';
import { fitStatement, type Laid } from './statement';

type Treatment = 'sans' | 'serif' | 'roman' | 'outline';
type Entrance = 'rise' | 'push' | 'focus';

const ENTRANCES: readonly Entrance[] = ['rise', 'push', 'focus'];
const TREATMENTS: Record<'mixed' | 'sans' | 'serif', readonly Treatment[]> = {
  mixed: ['sans', 'serif', 'outline'],
  sans: ['sans', 'outline'],
  serif: ['serif', 'roman'],
};

/** Pairings whose display face is a serif (its italic is the serif treatment). */
const SERIF_DISPLAY = new Set(['editorial', 'classic', 'soft']);

type Composition = {
  /** Largest statement size (u), most lines, share of the layout width statements use. */
  maxSize: number;
  maxLines: number;
  measure: number;
  /** Finale: logo size constant (u, see Sheen) and final line size (u). */
  logo: number;
  final: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { maxSize: 22, maxLines: 3, measure: 0.86, logo: 22, final: 3.3 },
  '9:16': { maxSize: 18, maxLines: 5, measure: 1, logo: 26, final: 4 },
  '1:1': { maxSize: 17, maxLines: 4, measure: 0.96, logo: 24, final: 3.5 },
  '4:5': { maxSize: 17.5, maxLines: 4, measure: 0.96, logo: 25, final: 3.6 },
};

/** Entrances (Balanced seconds): mask rise, horizontal push, focus from blur. */
const RISE = { dur: 0.72, line: 0.09, word: 0.035 };
const PUSH = { dur: 0.7, line: 0.07, word: 0.03, travel: 9 };
const FOCUS = { dur: 0.9, blur: 1.4, scale: 0.035 };
/** A wipe's length (Balanced seconds); a marker sweeps in this long after its entrance. */
const WIPE = 0.5;
const SWEEP_AT = 0.42;
const SWEEP = 0.32;
/** Statements breathe: a slow push over their whole time on screen. */
const PUSH_IN = 0.015;
/** Punchy's cut: the incoming statement lands from 5% larger. */
const PUNCH = 0.05;
const PUNCH_TIME = 0.22;
const FINALE_PUSH = 0.02;

type Segment = {
  side: Side;
  /** The cut into it, when its entrance starts, when the next one takes over. */
  start: number;
  enter: number;
  end: number;
  /** How the edit gets here: a hard cut, a wipe, or nothing (the first, on the page). */
  into: 'cut' | 'wipe' | 'none';
  /** Half a wipe's length (seconds) and its tempo (entrances tighten with the rhythm). */
  half: number;
  tempo: number;
  statement: {
    laid: Laid;
    treatment: Treatment;
    entrance: Entrance;
    outline: number;
  } | null;
};

export default defineTemplate({
  id: 'manifesto',
  version: 1,
  meta: {
    name: 'Manifesto',
    tagline: 'Statement sequence',
    category: 'brand-quotes',
    tags: ['brand film', 'values', 'mission', 'statements', 'editorial'],
    useCases: ['Brand films', 'Values', 'Mission statements', 'Campaign launches', 'Recruiting'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'sequence',
  duration: { default: 'auto', min: 8, max: 20 },
  alpha: 'none',
  poster: 6.3,
  // Hard cuts must stay hard: a 180° shutter keeps every cut between frames (see plan.ts).
  shutter: 180,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'forest' },
    { kind: 'library', id: 'cobalt' },
  ],
  pairings: ['editorial', 'classic', 'soft', 'grotesk'],
  controls: {
    statements: c.text({
      label: 'Statements',
      default: 'We believe in less.\nLess noise.\nLess waiting.\nMore *making*.',
      maxLength: 200,
      multiline: true,
      maxLines: 8,
      primary: true,
      emphasis: true,
      hint: 'One statement per line (3–8). *Stars* take the accent.',
    }),
    logo: c.image({
      label: 'Logo',
      accept: 'logo',
      default: { kind: 'placeholder', id: 'halden' },
      optional: true,
    }),
    final: c.text({
      label: 'Final line',
      default: 'Studio for moving images',
      maxLength: 48,
      optional: true,
    }),
    treatments: c.choice({
      label: 'Treatments',
      default: 'mixed',
      options: [
        { value: 'mixed', label: 'Mixed' },
        { value: 'sans', label: 'Sans only' },
        { value: 'serif', label: 'Serif only' },
      ],
    }),
    pair: c.choice({
      label: 'Palette pair',
      default: 'inverse',
      options: [
        { value: 'inverse', label: 'Inverse' },
        { value: 'accent', label: 'Accent' },
        { value: 'second', label: 'Second color' },
      ],
      hint: 'The color every other statement cuts to',
    }),
    pace: c.choice({
      label: 'Pace',
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
    {
      id: 'ink-paper',
      name: 'Ink ↔ Paper',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'editorial',
    },
    {
      id: 'forest-sand',
      name: 'Forest ↔ Sand',
      palette: { kind: 'library', id: 'sand' },
      pairing: 'editorial',
      values: { pair: 'second' },
    },
    {
      id: 'midnight-lilac',
      name: 'Midnight ↔ Lilac',
      palette: { kind: 'library', id: 'lilac' },
      pairing: 'editorial',
    },
  ],
  timing: ({ props, energy }) => {
    const statements = parseStatements(props.statements);
    const finale = finaleText(props.final, props.logo !== null || props.final.trim() !== '');
    return {
      lead: LEAD,
      in: RISE.dur,
      out: OUT,
      tail: TAIL,
      auto: autoDuration(statements, finale, PACES[props.pace], energy.time),
    };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const k = energy.time;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const [sideA, sideB] = sides(palette.roles, props.pair as PairId);
    const logo = ctx.graphic('logo');
    const finalLine = props.final.trim();
    const hasFinale = Boolean(logo || finalLine);
    const texts = parseStatements(props.statements);
    const n = texts.length;
    const plan = planEdit(
      texts,
      finaleText(props.final, hasFinale),
      PACES[props.pace],
      k,
      timeline.duration,
    );

    // --- type: the pairing's sans (bold), its serif (italic), and the outline -----------------
    const display = pairing.display;
    const serifPairing = SERIF_DISPLAY.has(pairing.id);
    const sansRole = serifPairing ? pairing.text : pairing.display;
    const sansStyle: TextStyle = {
      font: sansRole.font,
      size: 100,
      weight: 760,
      width: sansRole.width,
      tracking: -0.03,
      features: sansRole.features,
    };
    const serifStyle: TextStyle = serifPairing
      ? {
          font: display.font,
          italicFont: display.italic,
          italic: true,
          size: 100,
          weight: display.weight,
          tracking: -0.012,
          features: display.features,
        }
      : // Without a serif, the counterpoint is the display face light and wide.
        {
          font: display.font,
          size: 100,
          weight: 300,
          width: display.width !== undefined ? 112 : undefined,
          tracking: -0.02,
          features: display.features,
        };
    const romanStyle: TextStyle = { ...serifStyle, italic: false };
    const styles: Record<Treatment, { style: TextStyle; emphasis: Partial<TextStyle> }> = {
      // Sans statements set their emphasis in the serif italic (the editorial mix).
      sans: { style: sansStyle, emphasis: { ...serifStyle, size: undefined } },
      serif: { style: serifStyle, emphasis: {} },
      roman: { style: romanStyle, emphasis: { italic: serifPairing } },
      outline: { style: { ...sansStyle, weight: 820 }, emphasis: {} },
    };
    const lineHeight = Math.max(1.02, display.lineHeight + 0.06);

    const measure = area.w * comp.measure;
    const box = {
      x: area.x,
      y: area.y + area.h * 0.08,
      w: measure,
      h: area.h * 0.84,
      maxSize: comp.maxSize * u,
      maxLines: comp.maxLines,
      minSize: 3.2 * u,
      place: 0.47,
    };
    const layout = text.layout.bind(text);
    const cycle = TREATMENTS[props.treatments];

    // Sides alternate backwards from the finale, which always stands on the palette itself —
    // the first and last frames are the palette's page.
    const sideOf = (i: number) => ((hasFinale ? n - i : n - 1 - i) % 2 === 0 ? sideA : sideB);

    const segments: Segment[] = texts.map((statement, i) => {
      const treatment = cycle[i % cycle.length] ?? 'sans';
      const { style, emphasis } = styles[treatment];
      const laid = fitStatement(layout, statement, style, emphasis, lineHeight, box);
      return {
        side: sideOf(i),
        start: plan.starts[i] ?? 0,
        enter: 0,
        end: plan.starts[i + 1] ?? timeline.duration,
        into: 'none',
        half: 0,
        tempo: plan.tempo[i] ?? 1,
        statement: {
          laid,
          treatment,
          entrance: ENTRANCES[i % ENTRANCES.length] ?? 'rise',
          outline: Math.max(0.18 * u, 0.024 * laid.block.size),
        },
      };
    });
    if (hasFinale) {
      segments.push({
        side: sideA,
        start: plan.starts[n] ?? plan.fade,
        enter: 0,
        end: plan.fade,
        into: 'none',
        half: 0,
        tempo: 1,
        statement: null,
      });
    }
    // Transitions alternate: a hard cut with the inversion, then a wipe — Calm only wipes,
    // Punchy only cuts. The first statement cuts in only when it stands on the other side.
    const between = (i: number): 'cut' | 'wipe' =>
      energy.id === 'calm' ? 'wipe' : energy.id === 'punchy' || i % 2 === 1 ? 'cut' : 'wipe';
    segments.forEach((segment, i) => {
      segment.into = i === 0 ? (segment.side === sideA ? 'none' : 'cut') : between(i);
      segment.half = (WIPE / 2) * k * segment.tempo;
      segment.enter = segment.into === 'wipe' ? segment.start - segment.half * 0.5 : segment.start;
    });
    const last = segments[segments.length - 1];
    const fadeEnd = plan.fade + OUT * k;

    // --- the finale: logo over the final line ------------------------------------------------
    const aspect = logo && logo.ink.w > 0 && logo.ink.h > 0 ? logo.ink.w / logo.ink.h : 1;
    let logoH = logo ? (comp.logo * u) / Math.sqrt(aspect) : 0;
    let logoW = logoH * aspect;
    if (logoW > area.w * 0.7) {
      logoW = area.w * 0.7;
      logoH = logoW / aspect;
    }
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const finalBlock: TextBlock | null = finalLine
      ? text.layout(finalLine, {
          style: logo
            ? {
                font: pairing.text.font,
                size: comp.final * u,
                weight: 500,
                width: pairing.text.width,
                tracking: 0.01,
                features: pairing.text.features,
              }
            : { ...serifStyle, size: comp.maxSize * u * 0.62 },
          maxWidth: half * 2,
          maxLines: 2,
          lineHeight: logo ? 1.3 : lineHeight,
          align: 'center',
          fit: { minSize: 2.6 * u },
        })
      : null;
    const gap = logo && finalBlock ? 4.6 * u : 0;
    const lockupH = logoH + gap + (finalBlock ? finalBlock.height : 0);
    const lockupTop = area.y + (area.h - lockupH) * 0.47;
    const logoRect: Rect = { x: frame.cx - logoW / 2, y: lockupTop, w: logoW, h: logoH };
    const finalX = frame.cx - half;
    const finalY = lockupTop + logoH + gap;
    const finalBounds: Rect | null = finalBlock
      ? {
          x: finalX + finalBlock.ink.x,
          y: finalY + finalBlock.ink.y,
          w: finalBlock.ink.w,
          h: finalBlock.ink.h,
        }
      : null;
    const lockupBounds =
      finalBounds && logo ? unionRect(logoRect, finalBounds) : (finalBounds ?? logoRect);
    const lockupCx = frame.cx;
    const lockupCy = lockupTop + lockupH / 2;

    // --- motion helpers -----------------------------------------------------------------------
    // Entrances start moving on the cut (never a slow-in): a cut must land on something.
    const enterCurve: EaseName = 'glide';
    const moveCurve: EaseName = energy.move;
    const travel = ctx.travel(PUSH.travel * u);
    const blurFrom = FOCUS.blur * energy.blur;
    const maxWords = Math.max(1, ...segments.map((s) => s.statement?.laid.block.wordCount ?? 0));
    const dx = new Float64Array(maxWords);
    const dy = new Float64Array(maxWords);
    const alpha = new Float64Array(maxWords).fill(1);
    const edges: number[] = [];
    const motion: GlyphTransform = {};
    let plainFill: Color | undefined;
    let markFill: Color | undefined;
    let textFill: Color | undefined;
    let onBlock: Color | undefined;
    let marker = false;
    /** 0: every glyph · 1: plain glyphs only · 2: emphasized glyphs only (outline passes). */
    let pass = 0;
    /** The outline's matte: letters fully opaque while they fade in. */
    let solid = false;
    const animate = (glyph: Glyph, line: TextLine): GlyphTransform | null => {
      if (pass === 1 && glyph.emphasis) return null;
      if (pass === 2 && !glyph.emphasis) return null;
      motion.dx = dx[glyph.word] ?? 0;
      motion.dy = dy[glyph.word] ?? 0;
      motion.opacity = solid ? 1 : (alpha[glyph.word] ?? 1);
      if (!glyph.emphasis) {
        motion.color = solid ? textFill : plainFill;
      } else if (marker) {
        const middle = line.x + glyph.x + glyph.advance / 2;
        motion.color = middle < (edges[line.index] ?? -1e9) ? onBlock : textFill;
      } else {
        motion.color = markFill;
      }
      return motion;
    };

    /** Draws a statement `local` seconds into its entrance, `life` (0..1) through its time. */
    const drawStatement = (g: Draw, segment: Segment, local: number, life: number) => {
      const statement = segment.statement;
      if (!statement || local < 0) return;
      const { laid, treatment, entrance } = statement;
      const { block } = laid;
      const side = segment.side;
      const tempo = k * segment.tempo;
      const outline = treatment === 'outline';
      marker = side.mode === 'marker';
      textFill = side.text;
      onBlock = side.onBlock;
      markFill = side.mark;
      plainFill = outline ? undefined : side.text;

      // Per word: rise (mask), push (from the left) or nothing (focus is whole-statement).
      for (const line of block.lines) {
        const firstWord = line.words[0]?.index ?? 0;
        for (const word of line.words) {
          const w = word.index - firstWord;
          if (entrance === 'rise') {
            const p = ease[enterCurve](
              clamp01(
                (local -
                  (line.index * RISE.line + w * RISE.word) * energy.stagger * segment.tempo) /
                  (RISE.dur * tempo),
              ),
            );
            dx[word.index] = 0;
            dy[word.index] = (1 - p) * (line.mask.h * 1.05);
            alpha[word.index] = 1;
          } else if (entrance === 'push') {
            const q = clamp01(
              (local - (line.index * PUSH.line + w * PUSH.word) * energy.stagger * segment.tempo) /
                (PUSH.dur * tempo),
            );
            const p = ease[energy.id === 'punchy' ? 'snap' : 'glide'](q);
            dx[word.index] = -(1 - p) * travel;
            dy[word.index] = 0;
            alpha[word.index] = Math.min(1, q * 2.4);
          } else {
            dx[word.index] = 0;
            dy[word.index] = 0;
            alpha[word.index] = 1;
          }
        }
      }
      // Marker blocks sweep in behind the emphasized words once they have arrived.
      const sweep = marker
        ? ease[moveCurve](clamp01((local - SWEEP_AT * tempo) / (SWEEP * tempo)))
        : 0;
      for (let i = 0; i < block.lines.length; i++) edges[i] = -1e9;

      const x = laid.x;
      const y = laid.y;
      const lines = (g: Draw) => {
        if (marker && sweep > 0) {
          for (const mark of laid.marks) {
            const w = mark.rect.w * sweep;
            edges[mark.line] = Math.max(edges[mark.line] ?? -1e9, mark.rect.x + w);
            g.rect(
              { x: x + mark.rect.x, y: y + mark.rect.y, w, h: mark.rect.h },
              { fill: side.block },
            );
          }
        }
        const eachLine = (g: Draw, draw: (g: Draw, line: TextLine) => void) => {
          for (const line of block.lines) {
            if (entrance === 'rise') {
              const mask = line.mask;
              g.clip({ x: x + mask.x, y: y + mask.y, w: mask.w, h: mask.h }, (g) => draw(g, line));
            } else {
              draw(g, line);
            }
          }
        };
        if (!outline) {
          eachLine(g, (g, line) => g.text(line, { x, y, fill: side.text, glyph: animate }));
          return;
        }
        // Outline: a double-width stroke shown only outside the letters (a matte of the solid
        // letters knocks out its inner half), so overlapping contours inside a glyph never show.
        pass = 1;
        g.mask(
          (g) => {
            solid = true;
            eachLine(g, (g, line) => g.text(line, { x, y, fill: side.text, glyph: animate }));
            solid = false;
          },
          (g) =>
            eachLine(g, (g, line) =>
              g.text(line, {
                x,
                y,
                outline: { color: side.text, width: 2 * statement.outline, join: 'round' },
                glyph: animate,
              }),
            ),
          { invert: true, bounds: padRect(laid.bounds, 3 * u) },
        );
        pass = 2;
        eachLine(g, (g, line) => g.text(line, { x, y, fill: side.text, glyph: animate }));
        pass = 0;
      };

      // Punchy lands every cut with a punch-in.
      const punch =
        energy.id === 'punchy' && segment.into === 'cut'
          ? PUNCH * (1 - ease.snap(clamp01(local / PUNCH_TIME)))
          : 0;
      const scale = 1 + PUSH_IN * ease.drift(life) + punch;
      g.group({ scale, originX: laid.cx, originY: laid.cy }, (g) => {
        if (entrance === 'focus') {
          const q = clamp01(local / (FOCUS.dur * tempo));
          const p = ease[enterCurve](q);
          const blur = blurFrom * (1 - p);
          const grow = 1 + FOCUS.scale * energy.travel * (1 - p);
          const opacity = Math.min(1, q * 1.8);
          g.group({ scale: grow, originX: laid.cx, originY: laid.cy }, (g) => {
            if (blur > 0.02 || opacity < 1) {
              g.fx({ blur, opacity, bounds: padRect(laid.bounds, 4 * u) }, lines);
            } else {
              lines(g);
            }
          });
        } else {
          lines(g);
        }
      });
    };

    /** The finale: the logo scales in from 0.9 with blur, then the final line rises in. */
    const drawFinale = (g: Draw, segment: Segment, local: number, life: number) => {
      if (local < 0) return;
      const side = segment.side;
      const shown = ease[enterCurve](clamp01(local / (0.85 * k)));
      const lineIn = ease[enterCurve](clamp01((local - 0.45 * k) / (0.65 * k)));
      const scale = 1 + FINALE_PUSH * ease.drift(life);
      g.group({ scale, originX: lockupCx, originY: lockupCy }, (g) => {
        if (logo) {
          const blur = 1.3 * energy.blur * (1 - shown);
          const draw = (g: Draw) =>
            g.group(
              {
                scale: 0.9 + 0.1 * shown,
                originX: lockupCx,
                originY: logoRect.y + logoRect.h / 2,
                opacity: Math.min(1, shown * 1.5),
              },
              (g) => g.graphic(logo, logoRect, { current: side.text }),
            );
          if (blur > 0.02) g.fx({ blur, bounds: padRect(logoRect, 5 * u) }, draw);
          else draw(g);
        }
        if (finalBlock && lineIn > 0) {
          g.text(finalBlock, {
            x: finalX,
            y: finalY + (1 - lineIn) * 1.2 * u,
            fill: logo ? side.muted : side.text,
            opacity: lineIn,
          });
        }
      });
    };

    const W = frame.width;
    const H = frame.height;
    const drawSegment = (g: Draw, index: number, t: number, nudge: number) => {
      const segment = segments[index];
      if (!segment) return;
      g.rect({ x: -2, y: -2, w: W + 4, h: H + 4 }, { fill: segment.side.bg });
      const fading = segment === last && t > plan.fade;
      const fade = fading ? ease.swift(clamp01((t - plan.fade) / (OUT * k))) : 0;
      if (fade >= 1) return;
      const local = t - segment.enter;
      const life = clamp01((t - segment.enter) / Math.max(0.1, segment.end - segment.enter));
      const content = (g: Draw) =>
        segment.statement
          ? drawStatement(g, segment, local, life)
          : drawFinale(g, segment, local, life);
      if (fade > 0) {
        const bounds = segment.statement ? segment.statement.laid.bounds : lockupBounds;
        g.fx(
          { blur: 0.9 * energy.blur * fade, opacity: 1 - fade, bounds: padRect(bounds, 6 * u) },
          content,
        );
      } else if (nudge !== 0) {
        g.group({ x: nudge }, content);
      } else {
        content(g);
      }
    };

    return {
      render: ({ t, g }) => {
        g.fill(sideA.bg, { background: true });
        const first = segments[0];
        if (!first || t < first.start || t >= fadeEnd) return;
        // The segment on screen, and a wipe into the next one if it has begun.
        let index = 0;
        for (let i = 1; i < segments.length; i++) {
          if ((segments[i]?.start ?? Number.POSITIVE_INFINITY) <= t) index = i;
        }
        let from = index;
        let to = -1;
        const next = segments[index + 1];
        const current = segments[index];
        if (next && next.into === 'wipe' && t >= next.start - next.half) {
          to = index + 1;
        } else if (current && current.into === 'wipe' && t < current.start + current.half) {
          from = index - 1;
          to = index;
        }
        if (to < 0 || from < 0) {
          drawSegment(g, index, t, 0);
        } else {
          const target = segments[to] as Segment;
          const p = ease[moveCurve](
            clamp01((t - (target.start - target.half)) / (2 * target.half)),
          );
          const edge = W * p;
          drawSegment(g, from, t, 2 * u * p);
          if (edge > 0)
            g.clip({ x: -2, y: -2, w: edge + 2, h: H + 4 }, (g) => drawSegment(g, to, t, 0));
        }

        // Editor regions: the statement (or the finale) on screen.
        const shown = segments[to >= 0 && t >= (segments[to]?.start ?? 0) ? to : index];
        if (shown?.statement) {
          g.editable('statements', shown.statement.laid.bounds);
        } else if (shown) {
          if (logo) g.editable('logo', logoRect);
          if (finalBounds) g.editable('final', finalBounds);
        }
      },
    };
  },
});

/** The finale's text for timing (the logo alone still holds), or null without a finale. */
function finaleText(final: string, hasFinale: boolean): string | null {
  return hasFinale ? final.trim() : null;
}

function padRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}
