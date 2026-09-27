/**
 * Sheen — light sweep (docs/templates/09-logo-branding.md §9.1).
 *
 * The expensive detail: the light is masked to the logo's own alpha, with a sharp core and a
 * soft falloff, and it *lights* the material — the logo waits slightly in shadow until the band
 * has passed, and only the band's highlight blooms. It reads as light on a surface, not a
 * white stripe on top of one.
 */

import {
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  type FormatId,
  type GlyphTransform,
  type Gradient,
  type Rect,
  rgb,
  type TextBlock,
  withAlpha,
} from '@/engine';

/** Logo size: height = K / √aspect (in u), so marks and wide lockups carry similar weight. */
const LOGO_K: Record<FormatId, number> = { '16:9': 26, '9:16': 30, '1:1': 28, '4:5': 29 };
/** Widest the logo may get, as a share of the layout area's width. */
const LOGO_MAX_W: Record<FormatId, number> = { '16:9': 0.5, '9:16': 0.8, '1:1': 0.7, '4:5': 0.72 };
const TAGLINE_SIZE: Record<FormatId, number> = { '16:9': 2.8, '9:16': 3.4, '1:1': 3, '4:5': 3.1 };

/** Band direction: 25° below horizontal, so the band itself leans like "/". */
const ANGLE = (25 * Math.PI) / 180;
const AXIS = { x: Math.cos(ANGLE), y: Math.sin(ANGLE) };

const WHITE: Color = rgb(1, 1, 1);
/** Tungsten-ish warm white. */
const WARM: Color = rgb(1, 0.9, 0.76);
/** The tagline tracks in from +20% to its resting +4%. */
const TRACK_FROM = 0.2;
const TRACK_REST = 0.04;

export default defineTemplate({
  id: 'sheen',
  version: 1,
  meta: {
    name: 'Sheen',
    tagline: 'Light sweep',
    category: 'logo-branding',
    tags: ['logo', 'reveal', 'light', 'premium'],
    useCases: ['Corporate intros', 'Premium brands', 'End cards', 'Event sponsors'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 4, min: 3, max: 8 },
  alpha: 'optional',
  poster: 2.6,
  palettes: [
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'mono-dark' },
  ],
  pairings: ['grotesk', 'editorial', 'technical', 'classic'],
  controls: {
    logo: c.image({ label: 'Logo', accept: 'logo', default: { kind: 'placeholder', id: 'nova' } }),
    tagline: c.text({
      label: 'Tagline',
      default: 'Built for what’s next',
      maxLength: 48,
      optional: true,
    }),
    light: c.choice({
      label: 'Light',
      default: 'white',
      options: [
        { value: 'white', label: 'White' },
        { value: 'warm', label: 'Warm' },
        { value: 'accent', label: 'Accent' },
      ],
    }),
    glow: c.choice({
      label: 'Glow',
      default: 'soft',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'soft', label: 'Soft' },
        { value: 'strong', label: 'Strong' },
      ],
    }),
    color: c.choice({
      label: 'Logo color',
      default: 'original',
      options: [
        { value: 'original', label: 'Original' },
        { value: 'mono', label: 'Mono' },
        { value: 'accent', label: 'Accent' },
      ],
    }),
    second: c.toggle({ label: 'Second sweep', group: 'motion', default: true }),
    out: c.toggle({ label: 'Out', group: 'motion', default: false, hint: 'Adds an exit' }),
  },
  looks: [
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'grotesk' },
    {
      id: 'midnight',
      name: 'Midnight',
      palette: { kind: 'library', id: 'midnight' },
      pairing: 'editorial',
      values: { light: 'warm' },
    },
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
  ],
  // Without Out, the last frame is the finished logo; with it, the exit ends a touch early.
  timing: ({ props }) => ({ in: 2.4, out: props.out ? 0.6 : 0, tail: props.out ? CLEAN_END : 0 }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, accent } = palette.roles;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const logo = ctx.graphic('logo');

    // --- tagline ------------------------------------------------------------------------
    const taglineText = props.tagline.trim();
    const tagline: TextBlock | null = taglineText
      ? text.layout(taglineText, {
          style: {
            font: pairing.text.font,
            size: TAGLINE_SIZE[frame.format] * u,
            weight: 500,
            width: pairing.text.width,
            tracking: TRACK_REST,
            features: pairing.text.features,
          },
          maxWidth: area.w * 0.9,
          maxLines: 2,
          lineHeight: 1.3,
          align: 'center',
          fit: { minSize: 2.4 * u },
        })
      : null;

    // --- logo box: centered, the tagline hanging below ----------------------------------
    const aspect = logo && logo.ink.w > 0 && logo.ink.h > 0 ? logo.ink.w / logo.ink.h : 1;
    let logoH = (LOGO_K[frame.format] * u) / Math.sqrt(aspect);
    let logoW = logoH * aspect;
    const maxW = area.w * LOGO_MAX_W[frame.format];
    if (logoW > maxW) {
      logoW = maxW;
      logoH = maxW / aspect;
    }
    const gap = 5 * u;
    const blockH = logoH + (tagline ? gap + tagline.height : 0);
    // Optically centered: a touch above the geometric center.
    const top = area.y + (area.h - blockH) * 0.48;
    const logoRect: Rect = { x: frame.cx - logoW / 2, y: top, w: logoW, h: logoH };
    const taglineX = frame.cx - (area.w * 0.9) / 2;
    const taglineY = top + logoH + gap;
    const taglineBounds: Rect | null = tagline
      ? {
          x: taglineX + tagline.ink.x,
          y: taglineY + tagline.ink.y,
          w: tagline.ink.w,
          h: tagline.ink.h,
        }
      : null;
    const lcx = frame.cx;
    const lcy = top + logoH / 2;

    const tint = props.color === 'mono' ? fg : props.color === 'accent' ? accent : null;
    const lightColor = props.light === 'warm' ? WARM : props.light === 'accent' ? accent : WHITE;
    // Light on a dark material shows strongly; on a light background the sweep stays subtle.
    const intensity = palette.dark ? 0.95 : 0.5;
    const shade = palette.dark ? 0.46 : 0.24;
    // Only a highlight on a dark ground blooms (on light grounds the shade itself would glow).
    const glowLevel = props.glow === 'strong' ? 1.8 : props.glow === 'soft' ? 1 : 0;
    const glow = palette.dark ? glowLevel : 0;

    // The band's path along its axis: from before the logo's first corner past its last.
    const corners = [
      [logoRect.x, logoRect.y],
      [logoRect.x + logoW, logoRect.y],
      [logoRect.x, logoRect.y + logoH],
      [logoRect.x + logoW, logoRect.y + logoH],
    ].map(([x = 0, y = 0]) => x * AXIS.x + y * AXIS.y);
    const s0 = Math.min(...corners);
    const s1 = Math.max(...corners);
    const falloff = Math.max(logoH * 0.9, 8 * u);
    // Covers the logo, its blur and its bloom wherever the band is.
    const bandArea: Rect = {
      x: logoRect.x - 12 * u,
      y: logoRect.y - 12 * u,
      w: logoW + 24 * u,
      h: logoH + 24 * u,
    };
    // The logo itself (the sweep is masked to it; effects add their own reach).
    const logoArea: Rect = {
      x: logoRect.x - u,
      y: logoRect.y - u,
      w: logoW + 2 * u,
      h: logoH + 2 * u,
    };

    /**
     * Light along the band axis around `s` (in units of `falloff`, from 3 behind to 1 ahead):
     * the logo waits in shade ahead of the band, the band has a sharp core and a soft falloff,
     * and behind it the shade lifts more slowly than the band moves.
     */
    const band = (s: number, peak: number, ahead: number, behind: number): Gradient => {
      const light = (a: number) => withAlpha(lightColor, a * peak);
      const dark = (a: number) => withAlpha(bg, a);
      const at = (d: number) => (d + 3) / 4;
      const x0 = (s - 3 * falloff) * AXIS.x;
      const y0 = (s - 3 * falloff) * AXIS.y;
      return {
        kind: 'linear',
        x0,
        y0,
        x1: x0 + 4 * falloff * AXIS.x,
        y1: y0 + 4 * falloff * AXIS.y,
        stops: [
          { offset: 0, color: dark(0) },
          { offset: at(-1), color: dark(behind) },
          { offset: at(-0.45), color: light(0.16) },
          { offset: at(-0.1), color: light(0.7) },
          { offset: at(0), color: light(1) },
          { offset: at(0.1), color: light(0.7) },
          { offset: at(0.45), color: light(0.16) },
          { offset: 1, color: dark(ahead) },
        ],
      };
    };

    const drawLogo = (g: Draw) => {
      if (logo) g.graphic(logo, logoRect, { tint, current: fg });
    };
    const drawMatte = (g: Draw) => {
      if (logo) g.graphic(logo, logoRect, { tint: WHITE });
    };

    // --- motion (Balanced seconds; energy scales the in/out windows) ----------------------
    const settle = energy.id === 'punchy' ? 'snap' : 'glide';
    const sweepCurve = energy.id === 'punchy' ? 'swift' : 'drift';
    const scaleFrom = 1 - 0.04 * energy.travel;
    const blurFrom = 0.95 * energy.blur;
    const hold = timeline.sections.hold;
    const secondStart = hold.end - 0.9;
    const second = props.second && hold.end - hold.start >= 1.3;

    const glyphPivot = tagline?.lines.map((line) => (line.glyphs.length - 1) / 2) ?? [];
    const firstGlyph = tagline?.lines.map((line) => line.glyphs[0]?.index ?? 0) ?? [];
    const motion: GlyphTransform = { dx: 0 };
    let tracking = 0;
    const trackGlyph = (glyph: { index: number }, line: { index: number }): GlyphTransform => {
      const k = glyph.index - (firstGlyph[line.index] ?? 0) - (glyphPivot[line.index] ?? 0);
      motion.dx = tracking * k;
      return motion;
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        if (!logo && !tagline) return;

        const shown = tl.p(t, 'in', { dur: 1 }, settle);
        const gone = tl.p(t, 'out', { dur: 0.6 }, 'exit');
        const opacity = tl.p(t, 'in', { dur: 0.8 }, 'drift') * (1 - gone);
        if (opacity <= 0) return;
        const scale = (scaleFrom + (1 - scaleFrom) * shown) * (1 - 0.02 * gone);
        const blur = blurFrom * (1 - shown) + 0.8 * gone;

        // The first sweep: the core crosses the logo, then the light and the shade behind it
        // fade out, leaving the clean logo. The second, fainter sweep lights without shade.
        const first = tl.p(t, 'in', { delay: 1.1, dur: 0.8 }, sweepCurve);
        const settled = tl.p(t, 'in', { delay: 1.8, dur: 0.5 }, 'drift');
        const pulse = Math.sin(Math.PI * tl.p(t, 'in', { delay: 1.7, dur: 0.5 }));
        const late = second
          ? tl.p(t, 'hold', { delay: secondStart - hold.start, dur: 0.8 }, sweepCurve)
          : 0;
        const travel = (p: number) => s0 - 0.5 * falloff + (s1 - s0 + falloff) * p;

        const lit = (g: Draw, fill: Gradient, bloom: number) => {
          const sweep = (g: Draw) =>
            g.mask(drawMatte, (g) => g.rect(bandArea, { fill }), { bounds: logoArea });
          if (bloom > 0) {
            const glow = { radius: 3, intensity: bloom, threshold: 0.5 };
            g.fx({ bloom: glow, bounds: logoArea }, sweep);
          } else {
            sweep(g);
          }
        };

        const logoLayer = (g: Draw) => {
          drawLogo(g);
          if (settled < 1) {
            const fade = 1 - settled;
            const fill = band(travel(first), intensity * fade, shade * fade, shade * 0.55 * fade);
            lit(g, fill, first > 0 ? glow * (0.4 + 0.6 * pulse) * fade : 0);
          } else if (late > 0 && late < 1) {
            lit(g, band(travel(late), intensity * 0.5, 0, 0), glow * 0.35);
          }
        };

        g.movable('logo', logoRect, (g) => {
          g.group({ scale, originX: lcx, originY: lcy }, (g) => {
            if (blur > 0.02) g.fx({ blur, opacity, bounds: bandArea }, logoLayer);
            else if (opacity < 1) g.layer({ opacity, bounds: bandArea }, logoLayer);
            else logoLayer(g);
          });
          g.editable('logo', logoRect);
        });

        if (tagline && taglineBounds) {
          const p = tl.p(t, 'in', { delay: 1.6, dur: 0.8 }, 'glide');
          const alpha = tl.p(t, 'in', { delay: 1.6, dur: 0.6 }, 'drift') * (1 - gone);
          if (alpha > 0) {
            tracking = (TRACK_FROM - TRACK_REST) * (1 - p) * tagline.size;
            g.movable('tagline', taglineBounds, (g) => {
              g.text(tagline, {
                fill: fg,
                x: taglineX,
                y: taglineY,
                opacity: alpha,
                glyph: trackGlyph,
              });
              g.editable('tagline', taglineBounds);
            });
          }
        }
      },
    };
  },
});
