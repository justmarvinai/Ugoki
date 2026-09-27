/**
 * Cinematic — film title (docs/templates/07-openers.md §7.1).
 *
 * The expensive detail: it behaves like film. Grain changes on a fixed 24 fps cadence whatever
 * the export frame rate (and between frames, so motion blur never averages two grains), the
 * picture weaves in the gate by ±0.08u on the same cadence (seeded), and the image under the
 * 2.39:1 letterbox is graded and vignetted; the bars themselves stay clean, like a matte.
 * The title arrives out of focus while its tracking tightens from +40% to +18% and a warm light
 * leak crosses the frame once.
 */

import {
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  ease,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type Gradient,
  mixOklab,
  type Rect,
  rgb,
  type TextBlock,
  type TextLine,
  unionRect,
  withAlpha,
} from '@/engine';
import { createGrain, createWeave, FILM_FPS, filmFrame } from './film';
import { bakeGrade, bakeGradients } from './grade';

/** Scope: 2.39:1 inside the frame. */
const SCOPE = 2.39;

/** Type sizes in u. */
const TITLE_SIZE: Record<FormatId, number> = { '16:9': 8.2, '9:16': 5.8, '1:1': 6.2, '4:5': 6.2 };
const SMALL_SIZE: Record<FormatId, number> = { '16:9': 2.3, '9:16': 2.7, '1:1': 2.5, '4:5': 2.6 };

/** Tracking: the title tightens from +40% to +18% (and keeps settling, slowly, in the hold). */
const TRACK_FROM = 0.4;
const TRACK_REST = 0.18;
const TRACK_HOLD = 0.165;

/** A warm film light leak. */
const LEAK: Color = rgb(1, 0.46, 0.14);

/**
 * The choreography at Balanced energy (seconds): fade up from black with the bars, the credit
 * card, the title out of focus with the leak, the subtitle. Energy changes its pace and
 * character; short durations compress it (see `schedule`).
 */
const CUES = {
  fade: 0.7,
  bars: 1,
  credit: [1, 1.5, 2.1, 2.6],
  title: [3, 5],
  leak: [3.2, 4.7],
  subtitle: [5.3, 6],
} as const;
const ENTRANCE = CUES.subtitle[1];
/** The shortest hold after the subtitle before the fade to black. */
const HOLD_MIN = 0.9;

const FEEL = {
  // Calm: slower, softer focus pull, a gentler leak.
  calm: { pace: 1.12, out: 1.1, blur: 1.25, leak: 0.75, fades: 1 },
  balanced: { pace: 1, out: 1, blur: 1, leak: 1, fades: 1 },
  // Punchy: trailer cadence — hard cuts in and out of the cards, a brighter, quicker leak.
  punchy: { pace: 0.78, out: 0.7, blur: 0.7, leak: 1.25, fades: 0.3 },
} as const;

/** Real seconds of every cue for a duration (the entrance compresses when time is short). */
function schedule(energy: keyof typeof FEEL, duration: number) {
  const feel = FEEL[energy];
  const out = feel.out;
  const natural = ENTRANCE * feel.pace;
  const room = duration - CLEAN_END - out - HOLD_MIN;
  const k = feel.pace * Math.min(1, room / natural);
  return { k, out, titleIn: CUES.title[1] * k };
}

export default defineTemplate({
  id: 'cinematic',
  version: 1,
  meta: {
    name: 'Cinematic',
    tagline: 'Film title',
    category: 'openers',
    tags: ['opener', 'film', 'title', 'trailer', 'letterbox'],
    useCases: ['Short films', 'Documentaries', 'Trailers', 'Wedding films', 'Brand stories'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 8, min: 6, max: 15 },
  alpha: 'none',
  poster: 6.3,
  palettes: [
    { kind: 'library', id: 'film' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'forest' },
    { kind: 'library', id: 'mono-dark' },
  ],
  pairings: ['editorial', 'classic', 'grotesk', 'studio', 'poster'],
  controls: {
    credit: c.text({
      label: 'Credit line',
      default: 'A HALDEN PICTURE',
      maxLength: 40,
      optional: true,
    }),
    title: c.text({
      label: 'Title',
      default: 'THE LONG LIGHT',
      maxLength: 32,
      multiline: true,
      maxLines: 2,
      primary: true,
    }),
    subtitle: c.text({
      label: 'Subtitle / date',
      default: 'IN CINEMAS 2027',
      maxLength: 40,
      optional: true,
    }),
    image: c.image({
      label: 'Background image',
      accept: 'scene',
      optional: true,
      default: { kind: 'placeholder', id: 'scene-dusk' },
    }),
    grain: c.choice({
      label: 'Grain',
      default: 'subtle',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'subtle', label: 'Subtle' },
        { value: 'heavy', label: 'Heavy' },
      ],
    }),
    leak: c.toggle({ label: 'Light leak', default: true }),
    letterbox: c.toggle({ label: 'Letterbox', default: true }),
    weave: c.toggle({ label: 'Gate weave', default: true }),
  },
  looks: [
    { id: 'film', name: 'Film', palette: { kind: 'library', id: 'film' }, pairing: 'editorial' },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    {
      id: 'midnight',
      name: 'Midnight',
      palette: { kind: 'library', id: 'midnight' },
      pairing: 'classic',
    },
  ],
  // The engine's `in` is the title's arrival at the shortest duration (so the minimum duration
  // always fits); longer durations give the prologue its full pace. Energy lives in the cues,
  // so the sections are real seconds (the engine multiplies them by energy.time).
  timing: ({ props, energy }) => {
    const shortest = schedule(energy.id, 6);
    return {
      in: shortest.titleIn / energy.time,
      out: shortest.out / energy.time,
      tail: CLEAN_END,
      readable: props.title,
    };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u, width, height } = frame;
    const { bg, fg, accent } = palette.roles;
    const feel = FEEL[energy.id];
    const { k, out } = schedule(energy.id, timeline.duration);
    const cue = (seconds: number) => seconds * k;
    const image = ctx.graphic('image');

    // --- picture: the 2.39:1 scope strip (or the whole frame) -----------------------------
    const pictureH = props.letterbox ? Math.min(height, width / SCOPE) : height;
    const picture: Rect = { x: 0, y: (height - pictureH) / 2, w: width, h: pictureH };
    const bar = picture.y;
    const safe = frame.vertical ? frame.safe.social : frame.safe.title;
    // Text lives in the picture, inside the safe area.
    const textArea: Rect = {
      x: safe.x,
      y: Math.max(safe.y, picture.y + 2.5 * u),
      w: safe.w,
      h:
        Math.min(safe.y + safe.h, picture.y + picture.h - 2.5 * u) -
        Math.max(safe.y, picture.y + 2.5 * u),
    };
    const cx = safe.x + safe.w / 2;

    // --- type ---------------------------------------------------------------------------
    const display = pairing.display;
    const titleSize = TITLE_SIZE[frame.format] * u;
    const measure = textArea.w * 0.94;
    const title = text.layout(props.title.trim() || ' ', {
      style: {
        font: display.font,
        italicFont: display.italic,
        size: titleSize,
        weight: display.weight,
        width: display.width,
        tracking: TRACK_REST,
        features: display.features,
        case: 'upper',
      },
      maxWidth: measure,
      maxLines: 2,
      lineHeight: 1.12,
      align: 'center',
      fit: { minSize: titleSize * 0.45 },
    });
    const small = (value: string): TextBlock | null =>
      value.trim()
        ? text.layout(value.trim(), {
            style: {
              font: pairing.text.font,
              size: SMALL_SIZE[frame.format] * u,
              weight: 560,
              width: pairing.text.width,
              tracking: 0.3,
              features: pairing.text.features,
              case: 'upper',
            },
            maxWidth: measure,
            maxLines: 2,
            lineHeight: 1.5,
            align: 'center',
            fit: { minSize: 2.2 * u },
          })
        : null;
    const credit = small(props.credit);
    const subtitle = small(props.subtitle);

    // The title (and its subtitle) sit optically centered in the picture; the credit card
    // takes the title's place before it.
    const gap = 4.2 * u;
    const lockupH = title.height + (subtitle ? gap + subtitle.height : 0);
    const titleY = textArea.y + (textArea.h - lockupH) * 0.5;
    const subtitleY = titleY + title.height + gap;
    const creditY = textArea.y + (textArea.h - (credit?.height ?? 0)) * 0.5;
    const left = cx - measure / 2;
    const place = (block: TextBlock, y: number): Rect => ({
      x: left + block.ink.x,
      y: y + block.ink.y,
      w: block.ink.w,
      h: block.ink.h,
    });
    const titleBounds = place(title, titleY);
    const subtitleBounds = subtitle ? place(subtitle, subtitleY) : null;
    const creditBounds = credit ? place(credit, creditY) : null;
    let lockup = subtitleBounds ? unionRect(titleBounds, subtitleBounds) : titleBounds;
    if (creditBounds) lockup = unionRect(lockup, creditBounds);

    // Tracking from +40%: never wider than the picture allows, however long the title.
    const spread = title.lines.map((line) => {
      const n = line.glyphs.length;
      const room = n > 1 ? (measure * 1.02 - line.width) / (n - 1) : 0;
      return Math.max(0, Math.min((TRACK_FROM - TRACK_REST) * title.size, room));
    });
    const settle = (TRACK_REST - TRACK_HOLD) * title.size;
    const firstGlyph = title.lines.map((line) => line.glyphs[0]?.index ?? 0);
    const pivot = title.lines.map((line) => (line.glyphs.length - 1) / 2);
    const motion: GlyphTransform = { dx: 0 };
    let opening = 0;
    let closing = 0;
    const trackGlyph = (glyph: Glyph, line: TextLine): GlyphTransform => {
      const i = glyph.index - (firstGlyph[line.index] ?? 0) - (pivot[line.index] ?? 0);
      motion.dx = ((spread[line.index] ?? 0) * opening - settle * closing) * i;
      return motion;
    };
    // Out-of-focus and tracked-out type reaches beyond its box: the blur layer covers it.
    const titleArea: Rect = {
      x: picture.x,
      y: titleBounds.y - 6 * u,
      w: picture.w,
      h: titleBounds.h + 12 * u,
    };

    // --- film -----------------------------------------------------------------------------
    const steps = Math.ceil(timeline.duration * FILM_FPS) + 2;
    const grainAmount = props.grain === 'heavy' ? 0.26 : props.grain === 'subtle' ? 0.13 : 0;
    const grain = grainAmount > 0 ? createGrain(ctx.rng('grain'), steps) : null;
    const weave = createWeave(ctx.rng('weave'), steps, 0.08 * u);

    // --- backdrop ---------------------------------------------------------------------------
    // With an image: the picture's width (a slow push toward the focal point), graded and a
    // little darker so type holds; without: a dark graded field with a warm pool of light.
    const focal = ctx.focal('image');
    let dest: Rect = picture;
    if (image) {
      const box =
        image.kind === 'vector' ? image.box : { w: image.image.width, h: image.image.height };
      const aspect = box.w > 0 && box.h > 0 ? box.w / box.h : 1.5;
      // Cover the picture, and the whole frame while the bars are still coming in.
      const w = Math.max(picture.w, picture.h * aspect);
      const h = w / aspect;
      dest = {
        x: picture.x + (picture.w - w) * focal.x,
        y: picture.y + (picture.h - h) * focal.y,
        w,
        h,
      };
    }
    const pushX = dest.x + dest.w * focal.x;
    const pushY = picture.y + picture.h * focal.y;
    const grade = palette.dark
      ? { brightness: 0.8, contrast: 1.06, saturation: 0.82, tint: { color: accent, amount: 0.14 } }
      : { brightness: 1.04, contrast: 0.94, saturation: 0.8, tint: { color: accent, amount: 0.1 } };
    // The grade is baked into the image once (vector artwork is graded per frame instead).
    const graded = bakeGrade(image, grade);
    // Without an image: a graded dark field — cool haze above, a warm pool low in the frame
    // like light off a horizon (on light grounds, only a whisper of it).
    const warm = mixOklab(mixOklab(bg, fg, 0.16), accent, 0.35);
    const cool = mixOklab(mixOklab(bg, fg, 0.1), rgb(0.32, 0.5, 0.62), 0.35);
    const pool: Gradient = {
      kind: 'radial',
      cx: frame.cx,
      cy: picture.y + picture.h * 0.64,
      r: Math.max(picture.w, picture.h) * 0.6,
      stops: [
        { offset: 0, color: withAlpha(warm, palette.dark ? 0.75 : 0.12) },
        { offset: 0.5, color: withAlpha(warm, palette.dark ? 0.22 : 0.04) },
        { offset: 1, color: withAlpha(warm, 0) },
      ],
    };
    const haze: Gradient = {
      kind: 'linear',
      x0: 0,
      y0: picture.y,
      x1: 0,
      y1: picture.y + picture.h * 0.6,
      stops: [
        { offset: 0, color: withAlpha(cool, palette.dark ? 0.55 : 0.08) },
        { offset: 1, color: withAlpha(cool, 0) },
      ],
    };
    const edge = palette.dark ? rgb(0, 0, 0) : bg;
    const vignette: Gradient = {
      kind: 'radial',
      cx: frame.cx,
      cy: picture.y + picture.h / 2,
      r: Math.hypot(picture.w, picture.h) / 2,
      stops: [
        { offset: 0, color: withAlpha(edge, 0) },
        { offset: 0.5, color: withAlpha(edge, 0) },
        { offset: 1, color: withAlpha(edge, palette.dark ? 0.72 : 0.35) },
      ],
    };
    // Legibility over an image: a soft "power window" darkening an ellipse behind the type
    // while it's on screen, as a colorist would.
    const windowY = titleY + lockupH / 2;
    const windowR = Math.min(picture.w, measure * 1.25) * 0.5;
    const windowK = Math.min(1, (lockupH + 18 * u) / (windowR * 2));
    const scrim: Gradient = {
      kind: 'radial',
      cx,
      cy: windowY,
      r: windowR,
      stops: [
        { offset: 0, color: withAlpha(bg, palette.dark ? 0.5 : 0.42) },
        { offset: 0.55, color: withAlpha(bg, palette.dark ? 0.3 : 0.24) },
        { offset: 1, color: withAlpha(bg, 0) },
      ],
    };
    const everything: Rect = { x: -4 * u, y: -u, w: width + 8 * u, h: height + 2 * u };
    const leakPeak = (palette.dark ? 0.42 : 0.2) * feel.leak;
    const leakR = Math.max(picture.w, picture.h) * 0.55;

    // The static gradients are painted once (full-frame gradient fills are costly per frame).
    const sway = (t: number) => (ease.drift(t / timeline.duration) - 0.5) * 6 * u;
    const fieldLayer = image
      ? null
      : bakeGradients(everything, [
          { fill: haze, rect: everything },
          { fill: pool, rect: everything },
          { fill: vignette, rect: picture },
        ]);
    const vignetteLayer = image
      ? bakeGradients(everything, [{ fill: vignette, rect: picture }])
      : null;

    const drawBackdrop = (g: Draw, t: number, typeOn: number) => {
      if (image) {
        // A slow push over the whole shot (log-free: it stays under 10%).
        const push = 1.03 + 0.07 * ease.drift(t / timeline.duration);
        if (graded) {
          g.group({ scale: push, originX: pushX, originY: pushY }, (g) =>
            g.image(graded, dest, { fit: 'cover', focal }),
          );
        } else {
          g.fx({ adjust: grade, bounds: imageArea }, (g) =>
            g.group({ scale: push, originX: pushX, originY: pushY }, (g) =>
              g.graphic(image, dest, { fit: 'cover', focal, by: 'box' }),
            ),
          );
        }
        if (typeOn > 0) {
          g.group({ scaleY: windowK, originX: cx, originY: windowY, opacity: typeOn }, (g) =>
            g.circle(cx, windowY, windowR, { fill: scrim }),
          );
        }
        if (vignetteLayer) g.image(vignetteLayer, everything);
        else g.rect(picture, { fill: vignette });
      } else if (fieldLayer) {
        // The light drifts a little across the shot: the hold is never frozen. It's lit beyond
        // the picture too, so the bars are seen sliding over it.
        g.group({ x: sway(t) }, (g) => g.image(fieldLayer, everything));
      } else {
        g.rect(everything, { fill: haze });
        g.group({ x: sway(t) }, (g) => g.rect(everything, { fill: pool }));
        g.rect(picture, { fill: vignette });
      }
    };

    const drawLeak = (g: Draw, t: number) => {
      const [a, b] = CUES.leak;
      const p = (t - cue(a)) / (cue(b) - cue(a));
      if (p <= 0 || p >= 1) return;
      // Once, diagonally, brightest mid-way: a hot core inside a wide warm glow.
      const e = ease.drift(p);
      const x = picture.x - leakR * 0.4 + (picture.w + leakR * 0.8) * e;
      const y = picture.y - leakR * 0.3 + (picture.h + leakR * 0.4) * e;
      const strength = leakPeak * Math.sin(Math.PI * p);
      const glow = (r: number, alpha: number, color: Color): Gradient => ({
        kind: 'radial',
        cx: x,
        cy: y,
        r,
        stops: [
          { offset: 0, color: withAlpha(color, alpha) },
          { offset: 0.45, color: withAlpha(color, alpha * 0.45) },
          { offset: 1, color: withAlpha(color, 0) },
        ],
      });
      g.group({ blend: 'lighter' }, (g) => {
        g.rect(picture, { fill: glow(leakR, strength, LEAK) });
        g.rect(picture, {
          fill: glow(leakR * 0.4, strength * 0.8, mixOklab(LEAK, rgb(1, 0.9, 0.7), 0.6)),
        });
      });
    };

    // After the title has arrived, its tracking keeps settling until the fade.
    const settleFrom = cue(CUES.title[1]);
    const settleTo = timeline.sections.out.start;
    // The graded image layer covers what the image covers (the bars' slide included).
    const imageArea: Rect = {
      x: -u,
      y: Math.max(-u, dest.y - u),
      w: width + 2 * u,
      h: Math.min(height + u, dest.y + dest.h + u) - Math.max(-u, dest.y - u),
    };

    /** Opacity of the credit card at t: fades in, holds, fades out (Punchy cuts). */
    const creditOpacity = (t: number) => {
      const [a, b, c2, d] = CUES.credit;
      const fadeIn = (cue(b) - cue(a)) * feel.fades;
      const fadeOut = (cue(d) - cue(c2)) * feel.fades;
      const o =
        Math.min(1, Math.max(0, (t - cue(a)) / fadeIn)) *
        (1 - Math.min(1, Math.max(0, (t - (cue(d) - fadeOut)) / fadeOut)));
      return ease.drift(o);
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg);
        // Fade up from black, fade down to it at the end.
        const up = ease.drift(Math.min(1, t / cue(CUES.fade)));
        const down = tl.p(t, 'out', { dur: out / energy.time }, 'drift');
        const shown = up * (1 - down);
        if (shown <= 0) return;

        const step = filmFrame(t);
        const sx = props.weave ? (weave.x[Math.min(steps - 1, step)] ?? 0) : 0;
        const sy = props.weave ? (weave.y[Math.min(steps - 1, step)] ?? 0) : 0;

        // Where the type is at: the credit card, then the title out of focus → sharp.
        const creditOn = credit ? creditOpacity(t) : 0;
        const [ta, tb] = CUES.title;
        const p = Math.min(1, Math.max(0, (t - cue(ta)) / (cue(tb) - cue(ta))));
        const titleOn = ease.drift(Math.min(1, p / 0.6));
        const [sa, sb] = CUES.subtitle;
        const q = Math.min(1, Math.max(0, (t - cue(sa)) / ((cue(sb) - cue(sa)) * feel.fades)));

        g.group({ x: sx, y: sy }, (g) => {
          drawBackdrop(g, t, Math.max(creditOn, titleOn));
          if (image) g.editable('image', picture);
          if (props.leak) drawLeak(g, t);

          g.movable('titles', lockup, (g) => {
            if (credit && creditBounds && creditOn > 0) {
              g.text(credit, { fill: fg, x: left, y: creditY, opacity: 0.88 * creditOn });
              g.editable('credit', creditBounds);
            }

            // Title: out of focus and tracked out → sharp at +18% (a long drift).
            if (p > 0) {
              opening = 1 - ease.glide(p);
              closing =
                settleTo > settleFrom
                  ? ease.drift(Math.min(1, Math.max(0, (t - settleFrom) / (settleTo - settleFrom))))
                  : 0;
              const blur = 2.2 * energy.blur * feel.blur * (1 - ease.drift(p));
              const draw = (g: Draw) =>
                g.text(title, { fill: fg, x: left, y: titleY, glyph: trackGlyph });
              if (blur > 0.02) g.fx({ blur, opacity: titleOn, bounds: titleArea }, draw);
              else if (titleOn < 1) g.layer({ opacity: titleOn, bounds: titleArea }, draw);
              else draw(g);
              g.editable('title', titleBounds);
            }

            if (subtitle && subtitleBounds && q > 0) {
              g.text(subtitle, { fill: accent, x: left, y: subtitleY, opacity: ease.drift(q) });
              g.editable('subtitle', subtitleBounds);
            }
          });
        });

        // Grain, over everything in the picture (it changes every film frame anyway, so it
        // doesn't need the weave — and stays on whole texels).
        if (grain) {
          const growIn = Math.min(1, t / cue(CUES.bars));
          grain.draw(g, picture, step, grainAmount * growIn);
        }

        // Letterbox: a clean matte that slides in from the top and bottom.
        if (props.letterbox && bar > 0) {
          const curve = energy.id === 'punchy' ? 'snap' : 'glide';
          const h = bar * ease[curve](Math.min(1, t / cue(CUES.bars))) + 1;
          g.rect({ x: -u, y: -u, w: width + 2 * u, h: h + u }, { fill: bg });
          g.rect({ x: -u, y: height - h, w: width + 2 * u, h: h + u }, { fill: bg });
        }

        // The fade: everything goes down to black together.
        if (shown < 1) {
          const all = { x: -u, y: -u, w: width + 2 * u, h: height + 2 * u };
          g.rect(all, { fill: withAlpha(bg, 1 - shown) });
        }
      },
    };
  },
});
