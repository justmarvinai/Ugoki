/**
 * Scroll — phone scroll tour (docs/templates/10-ui-motion.md §10.3).
 *
 * The expensive detail: the page moves under real inertial scroll physics, as if a person used
 * the app. A finger lands, drags with rising speed and lets go; the page glides out on an
 * exponential decay (τ ≈ 0.325 s) and settles; thrown against the end of the page it runs past
 * it and rubber-bands back. At each stop a caption reveals line by line beside the phone and a
 * thin connector draws from it to the part of the screen it describes — the connector's dot
 * rides the page while the glide finishes. Optional touches show the finger (a soft disc that
 * travels with the drag and lifts off) and a tap ripple at each stop.
 *
 * The phone is a generic device around a procedural UI Kit screen (or the user's tall
 * screenshot); "3D" tilts it with an axonometric turn-and-lean.
 */

import {
  CLEAN_END,
  type Color,
  c,
  clamp01,
  createPhone,
  createScreen,
  type Draw,
  defineTemplate,
  type EaseName,
  ease,
  ensureContrast,
  type FormatId,
  type Graphic,
  mixOklab,
  type PathCommand,
  type Phone,
  type Rect,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  type Screen,
  type TextBlock,
  UI_FONT,
  type Vec2,
  withAlpha,
} from '@/engine';
import { HIDE, parseCaptions, planTour, type Stop, TOURS } from './plan';

type Composition = {
  /** Headline across the top (else at the top of the text column, left of the phone). */
  stack: boolean;
  /** Phone body height as a share of the space it gets. */
  phone: number;
  /** Phone center as a share of the frame width (it never crosses the safe area's right edge). */
  phoneX: number;
  /** Headline size (u) and lines. */
  headline: number;
  headlineLines: number;
  /** Caption size (u). */
  caption: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { stack: false, phone: 0.97, phoneX: 0.64, headline: 7.8, headlineLines: 3, caption: 5 },
  '9:16': { stack: true, phone: 0.97, phoneX: 0.66, headline: 7.6, headlineLines: 2, caption: 4.6 },
  '1:1': { stack: false, phone: 0.95, phoneX: 0.745, headline: 5.8, headlineLines: 3, caption: 4 },
  '4:5': { stack: false, phone: 0.95, phoneX: 0.7, headline: 5.4, headlineLines: 3, caption: 4 },
};

/** Body height per display width of the kit's phone (bezel and band included). */
const BODY_PER_WIDTH = (SCREEN_HEIGHT + 31) / SCREEN_WIDTH;
/** The 3D look: an axonometric turn (deg), lean back (deg) and roll (deg). */
const TILT = { turn: 22, lean: 11, roll: -2.5 };

const win = (t: number, start: number, dur: number, curve: EaseName) =>
  ease[curve](dur <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / dur));

/** An affine transform like `g.group`'s: `x' = x + ox + a(px − ox) + c(py − oy)`. */
type Affine = {
  a: number;
  b: number;
  c: number;
  d: number;
  x: number;
  y: number;
  ox: number;
  oy: number;
};

function affine(
  out: Affine,
  x: number,
  y: number,
  sx: number,
  sy: number,
  rotate: number,
  skewY: number,
  ox: number,
  oy: number,
): Affine {
  const r = (rotate * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const ky = Math.tan((skewY * Math.PI) / 180);
  out.a = sx * (cos - sin * ky);
  out.b = sx * (sin + cos * ky);
  out.c = sy * -sin;
  out.d = sy * cos;
  out.x = x;
  out.y = y;
  out.ox = ox;
  out.oy = oy;
  return out;
}

function apply(m: Affine, px: number, py: number, out: Vec2): Vec2 {
  const dx = px - m.ox;
  const dy = py - m.oy;
  out.x = m.x + m.ox + m.a * dx + m.c * dy;
  out.y = m.y + m.oy + m.b * dx + m.d * dy;
  return out;
}

/** The turn-and-lean of the 3D tilt as group scales and skew (orthographic). */
function tilt(turn: number) {
  const t = (turn * Math.PI) / 180;
  const l = (TILT.lean * Math.PI) / 180;
  return {
    scaleX: Math.cos(t),
    scaleY: Math.cos(l),
    skewY: (Math.atan(Math.tan(t) * Math.sin(l)) * 180) / Math.PI,
  };
}

export default defineTemplate({
  id: 'scroll',
  version: 1,
  meta: {
    name: 'Scroll',
    tagline: 'Phone scroll tour',
    category: 'ui-motion',
    tags: ['ui', 'phone', 'app', 'scroll', 'mockup', 'walkthrough'],
    useCases: ['App store previews', 'Website tours', 'Case studies', 'Product walkthroughs'],
  },
  formats: ['16:9', '1:1', '4:5', '9:16'],
  structure: 'in-hold-out',
  duration: { default: 8, min: 5, max: 15 },
  alpha: 'optional',
  poster: 4.6,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'graphite' },
  ],
  pairings: ['grotesk', 'editorial', 'technical', 'soft', 'wide'],
  // The phone's screen is set in the UI Kit's Inter, whatever the pairing.
  fonts: [UI_FONT],
  controls: {
    headline: c.text({
      label: 'Headline',
      default: 'Your whole week, in one app.',
      maxLength: 48,
      multiline: true,
      maxLines: 3,
      optional: true,
      primary: true,
    }),
    captions: c.text({
      label: 'Captions',
      default: 'Your week at a glance\nSmart insights\nShare in one tap',
      maxLength: 128,
      multiline: true,
      maxLines: 4,
      hint: 'One per line, up to 4 — each is a stop on the page. End one with “@ 60%” to set where it stops.',
    }),
    screen: c.choice({
      label: 'Screen',
      default: 'feed',
      display: 'select',
      options: [
        { value: 'feed', label: 'Feed' },
        { value: 'finance', label: 'Finance' },
        { value: 'analytics', label: 'Analytics' },
        { value: 'chat', label: 'Chat' },
        { value: 'settings', label: 'Settings' },
        { value: 'image', label: 'Image' },
      ],
      hint: 'A built-in app screen, or Image to show the picture below',
    }),
    screenshot: c.image({
      label: 'Screenshot',
      accept: 'artwork',
      optional: true,
      default: { kind: 'placeholder', id: 'artwork-2' },
      hint: 'Your tall screenshot replaces the built-in screen. Built-in images show when Screen is Image.',
    }),
    theme: c.choice({
      label: 'Theme',
      default: 'light',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    }),
    finish: c.choice({
      label: 'Device finish',
      default: 'graphite',
      options: [
        { value: 'graphite', label: 'Graphite' },
        { value: 'silver', label: 'Silver' },
        { value: 'sand', label: 'Sand' },
        { value: 'none', label: 'None' },
      ],
    }),
    tilt: c.choice({
      label: 'Tilt',
      default: 'flat',
      options: [
        { value: 'flat', label: 'Flat' },
        { value: '3d', label: '3D' },
      ],
    }),
    touches: c.toggle({
      label: 'Tap ripples',
      default: true,
      hint: 'Shows the finger on each flick and a ripple at each stop',
    }),
  },
  looks: [
    {
      id: 'paper',
      name: 'Paper',
      palette: { kind: 'library', id: 'paper' },
      pairing: 'grotesk',
      values: { theme: 'light', finish: 'graphite', tilt: 'flat' },
    },
    {
      id: 'ink',
      name: 'Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'grotesk',
      values: { theme: 'dark', finish: 'silver', tilt: 'flat' },
    },
    {
      id: 'lilac',
      name: 'Lilac',
      palette: { kind: 'library', id: 'lilac' },
      pairing: 'grotesk',
      values: { theme: 'light', finish: 'silver', tilt: '3d' },
    },
  ],
  timing: ({ props }) => ({
    lead: 0.1,
    in: 0.85,
    out: 0.6,
    tail: CLEAN_END,
    readable: parseCaptions(props.captions)
      .map((caption) => caption.text)
      .join(' '),
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, surface } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const accent = ensureContrast(palette.roles.accent, bg, 3);
    const captions = parseCaptions(props.captions);

    // --- headline ----------------------------------------------------------------------
    const display = pairing.display;
    const headlineText = props.headline.trim();
    const setHeadline = (width: number) =>
      text.layout(headlineText, {
        style: {
          font: display.font,
          italicFont: display.italic,
          size: comp.headline * u,
          weight: display.weight,
          width: display.width,
          tracking: display.tracking,
          features: display.features,
        },
        maxWidth: width,
        maxLines: comp.headlineLines,
        lineHeight: Math.max(display.lineHeight, 1),
        align: 'left',
        fit: { minSize: comp.headline * u * 0.6 },
      });
    const stackHeadline = comp.stack && headlineText ? setHeadline(area.w) : null;
    const stackH = stackHeadline ? stackHeadline.height + 0.3 * stackHeadline.size + 5 * u : 0;

    // --- phone ---------------------------------------------------------------------------
    const bodyH = (area.h - stackH) * comp.phone;
    const screenW = bodyH / BODY_PER_WIDTH;
    const bodyW = screenW * ((SCREEN_WIDTH + 31) / SCREEN_WIDTH);
    const phoneCx = Math.min(frame.width * comp.phoneX, area.x + area.w - bodyW / 2);
    const phoneCy = area.y + stackH + (area.h - stackH) / 2;
    const screenRect: Rect = {
      x: phoneCx - screenW / 2,
      y: phoneCy - (screenW * SCREEN_HEIGHT) / SCREEN_WIDTH / 2,
      w: screenW,
      h: (screenW * SCREEN_HEIGHT) / SCREEN_WIDTH,
    };
    const bare = props.finish === 'none';
    const phone: Phone = createPhone({
      screen: screenRect,
      finish: props.finish === 'none' ? 'graphite' : props.finish,
      bare,
      stageDark: palette.dark,
    });
    const body = phone.body;

    // --- screen: built-in, or the user's picture ------------------------------------------
    const userImage = props.screenshot?.kind === 'user';
    const picture: Graphic | null =
      userImage || props.screen === 'image' ? ctx.graphic('screenshot') : null;
    const kind = props.screen === 'image' ? 'feed' : props.screen;
    const screen: Screen | null = picture
      ? null
      : createScreen({
          text,
          palette,
          mode: props.theme,
          kind,
          rect: screenRect,
          radius: phone.screenRadius,
          tall: true,
          fallbackFont: pairing.text.font,
        });
    const k = screenRect.w / SCREEN_WIDTH;
    const viewport = SCREEN_HEIGHT;
    // A picture fills the display's width and scrolls when it is taller than the display.
    const pictureBox = picture
      ? picture.kind === 'vector'
        ? picture.box
        : { x: 0, y: 0, w: picture.image.width, h: picture.image.height }
      : null;
    const pictureH = pictureBox
      ? Math.max(viewport, (SCREEN_WIDTH * pictureBox.h) / Math.max(1, pictureBox.w))
      : 0;
    const maxScroll = screen ? screen.maxScroll : Math.max(0, pictureH - viewport);
    const insets = screen ? screen.insets : { top: 0, bottom: 0 };
    const background: Color = screen ? screen.background : fg;

    // --- stops ---------------------------------------------------------------------------
    const tour = TOURS[kind];
    const stops: Stop[] = captions.map((caption, i) => {
      const anchor = screen?.anchor(tour[i] ?? '') ?? null;
      const fallback = captions.length > 1 ? i / (captions.length - 1) : 0.5;
      if (anchor && caption.at === null && screen) {
        const scroll = screen.scrollTo(anchor);
        return { scroll, x: anchor.rect.x, y: anchor.rect.y + anchor.rect.h / 2 };
      }
      const scroll = (caption.at ?? fallback) * maxScroll;
      const visible = viewport - insets.top - insets.bottom;
      return { scroll, x: SCREEN_WIDTH * 0.08, y: scroll + insets.top + visible * 0.42 };
    });
    const hold = timeline.sections.hold;
    const { scroll: scroller, beats } = planTour(stops, captions, {
      start: hold.start,
      end: hold.end,
      maxScroll,
      energy: energy.id,
      overscroll: viewport * 0.5,
    });

    // --- text column and captions -------------------------------------------------------------
    const gap = (frame.format === '16:9' ? 7 : 4.5) * u;
    const columnX = area.x;
    const columnW = Math.max(20 * u, body.x - gap - columnX);
    const columnHeadline = !comp.stack && headlineText ? setHeadline(columnW) : null;
    const headline = stackHeadline ?? columnHeadline;
    const headlineY = area.y;
    const zoneTop = headline ? headlineY + headline.height + 0.3 * headline.size + 6 * u : area.y;
    const zoneBottom = area.y + area.h;
    const captionStyle = {
      font: display.font,
      italicFont: display.italic,
      size: comp.caption * u,
      weight: display.weight,
      width: display.width,
      tracking: display.tracking,
      features: display.features,
    };
    const indexStyle = {
      font: pairing.text.font,
      size: Math.max(2.4 * u, comp.caption * u * 0.52),
      weight: 650,
      width: pairing.text.width,
      tracking: 0.08,
      features: ['tnum'],
    };
    type Placed = { block: TextBlock; index: TextBlock; x: number; indexY: number; textY: number };
    const placed: Placed[] = captions.map((caption, i) => {
      const block = text.layout(caption.text, {
        style: captionStyle,
        maxWidth: columnW - 2 * u,
        maxLines: 3,
        lineHeight: Math.max(display.lineHeight, 1.02),
        align: 'left',
        fit: { minSize: comp.caption * u * 0.62 },
      });
      const index = text.line(String(i + 1).padStart(2, '0'), indexStyle);
      return { block, index, x: columnX, indexY: 0, textY: 0 };
    });
    const flat = props.tilt === 'flat';
    const rest = affine(
      { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0, ox: 0, oy: 0 },
      0,
      0,
      flat ? 1 : tilt(TILT.turn).scaleX,
      flat ? 1 : tilt(TILT.turn).scaleY,
      flat ? 0 : TILT.roll,
      flat ? 0 : tilt(TILT.turn).skewY,
      phoneCx,
      phoneCy,
    );
    const scratch: Vec2 = { x: 0, y: 0 };
    // Place each caption level with where its connector lands at rest.
    placed.forEach((p, i) => {
      const stop = stops[i] as Stop;
      const target = apply(
        rest,
        screenRect.x + stop.x * k,
        screenRect.y + (stop.y - stop.scroll) * k,
        scratch,
      );
      const h = p.index.capHeight + 2.2 * u + p.block.height + 0.28 * p.block.size;
      const top = Math.min(Math.max(target.y - p.index.capHeight / 2, zoneTop), zoneBottom - h);
      p.indexY = top;
      p.textY = top + p.index.capHeight + 2.2 * u;
    });

    // --- motion ------------------------------------------------------------------------------
    const travel = ctx.travel(16 * u);
    const lineGap = ctx.stagger(0.08);
    const exitGap = ctx.stagger(0.05);
    const breathe = 0.5 * u;
    const lineWidth = Math.max(1.6, 0.2 * u);
    const dotR = 0.75 * u;
    const glow = mixOklab(surface, bg, 0.35);
    const backGlow = {
      kind: 'radial' as const,
      cx: phoneCx,
      cy: phoneCy + body.h * 0.08,
      r: Math.max(body.w, body.h) * 0.75,
      stops: [
        { offset: 0, color: glow },
        { offset: 1, color: withAlpha(glow, 0) },
      ],
    };
    const touch = {
      fill: withAlpha(props.theme === 'dark' ? surface : fg, 0.2),
      ring: withAlpha(props.theme === 'dark' ? fg : bg, 0.7),
    };
    const m: Affine = { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0, ox: 0, oy: 0 };
    const group = {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotate: 0,
      skewY: 0,
      originX: phoneCx,
      originY: phoneCy,
      opacity: 1,
    };
    const pictureDest: Rect = {
      x: screenRect.x,
      y: screenRect.y,
      w: screenRect.w,
      h: pictureH * k,
    };
    const tourBounds: Rect = {
      x: columnX,
      y: Math.min(body.y, zoneTop),
      w: body.x + body.w - columnX,
      h: Math.max(body.y + body.h, zoneBottom) - Math.min(body.y, zoneTop),
    };
    const headlineLines = headline?.lines ?? [];
    const headlineRise = (headlineLines[0]?.mask.h ?? u) * 1.05;
    const headlineBounds = headline
      ? {
          x: area.x + headline.ink.x,
          y: headlineY + headline.ink.y,
          w: headline.ink.w,
          h: headline.ink.h,
        }
      : null;

    /** Draws the phone's display: the screen or picture at a scroll offset, and touches. */
    const drawDisplay = (g: Draw, t: number, scroll: number) => {
      if (screen) screen.draw(g, { scroll });
      else if (picture) {
        g.clip(phone.display, (g) => {
          g.rect(screenRect, { fill: background });
          pictureDest.y = screenRect.y - scroll * k;
          g.graphic(picture, pictureDest, { fit: 'cover', by: 'box' });
        });
      }
      if (!props.touches) return;
      g.clip(phone.display, (g) => {
        for (let i = 0; i < beats.length; i++) {
          const beat = beats[i];
          const stop = stops[i];
          if (!beat || !stop) continue;
          // The finger: lands, drags with the page, lifts at the release.
          if (beat.flick) {
            const { start, release } = beat.flick;
            const shown = win(t, start - 0.07, 0.07, 'swift') * (1 - win(t, release, 0.2, 'swift'));
            if (shown > 0) {
              const moved = (scroller.at(Math.min(t, release)) - scroller.at(start)) * k;
              const lift = 1 + 0.25 * win(t, release, 0.2, 'glide');
              const x = screenRect.x + SCREEN_WIDTH * 0.62 * k;
              const y = screenRect.y + viewport * 0.74 * k - moved;
              const r = 23 * k * lift;
              g.circle(x, y, r, { fill: touch.fill, opacity: shown });
              g.circle(x, y, r, { stroke: { color: touch.ring, width: 2 * k }, opacity: shown });
            }
          }
          // A tap where the stop's connector will land.
          const tap = t - (beat.reveal - 0.12);
          if (tap > 0 && tap < 0.6) {
            const x = screenRect.x + (stop.x + 26) * k;
            const y = screenRect.y + (stop.y - scroll) * k;
            const press = win(tap, 0, 0.08, 'swift') * (1 - win(tap, 0.12, 0.2, 'swift'));
            g.circle(x, y, 20 * k, { fill: touch.fill, opacity: press });
            const ring = ease.glide(clamp01(tap / 0.6));
            g.circle(x, y, (14 + 30 * ring) * k, {
              stroke: { color: touch.ring, width: 2.2 * k },
              opacity: (1 - ring) * 0.9,
            });
          }
        }
      });
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        if (!ctx.transparent)
          g.rect({ x: 0, y: 0, w: frame.width, h: frame.height }, { fill: backGlow });

        // Phone: rises into place (turning in, in 3D), breathes, and drops away.
        const shown = tl.p(t, 'in', { dur: 0.85 }, energy.enter);
        const appear = tl.p(t, 'in', { dur: 0.3 }, 'drift');
        const gone = tl.p(t, 'out', { delay: 0.05, dur: 0.5 }, 'exit');
        const fade = tl.p(t, 'out', { delay: 0.25, dur: 0.3 }, 'swift');
        const breath = tl.p(t, 'hold', {}, 'drift');
        const dy = (1 - shown) * travel - breathe * breath + gone * travel * 1.3;
        const turn = TILT.turn + (1 - shown) * 16 - breath * 3;
        const tl3 = tilt(turn);
        group.y = dy;
        group.scaleX = flat ? 1 : tl3.scaleX;
        group.scaleY = flat ? 1 : tl3.scaleY;
        group.skewY = flat ? 0 : tl3.skewY;
        group.rotate = flat ? 0 : TILT.roll * (0.6 + 0.4 * shown);
        group.opacity = appear * (1 - fade);
        affine(m, 0, dy, group.scaleX, group.scaleY, group.rotate, group.skewY, phoneCx, phoneCy);
        const scroll = scroller.at(t);

        g.movable('tour', tourBounds, (g) => {
          if (group.opacity > 0) {
            g.group(group, (g) => {
              phone.back(g);
              drawDisplay(g, t, scroll);
              phone.front(g);
            });
            g.editable(picture ? 'screenshot' : 'screen', phone.screen);
          }
          drawCaptions(g, t, tl.p(t, 'out', { dur: 0.3 }, 'exit'), scroll);
        });

        // Headline: lines rise out of their masks, and leave upwards.
        if (headline && headlineBounds) {
          g.movable('headline', headlineBounds, (g) => {
            headlineLines.forEach((line, i) => {
              const p = tl.p(t, 'in', { delay: 0.1 + i * lineGap, dur: 0.75 }, energy.enter);
              const out = tl.p(t, 'out', { delay: i * exitGap, dur: 0.42 }, 'exit');
              if (p <= 0 || out >= 1) return;
              g.clip(
                {
                  x: area.x + line.mask.x,
                  y: headlineY + line.mask.y,
                  w: line.mask.w,
                  h: line.mask.h,
                },
                (g) =>
                  g.text(line, {
                    fill: fg,
                    x: area.x,
                    y: headlineY + (1 - p) * headlineRise - out * headlineRise,
                  }),
              );
            });
            g.editable('headline', headlineBounds);
          });
        }
      },
    };

    /** Captions: one at a time, beside the part of the screen they describe. */
    function drawCaptions(g: Draw, t: number, exit: number, scroll: number) {
      placed.forEach((p, i) => {
        const beat = beats[i];
        const stop = stops[i];
        if (!beat || !stop) return;
        const local = t - beat.reveal;
        if (local < 0) return;
        const hiding = beat.hide === null ? exit : win(t, beat.hide, HIDE, 'exit');
        if (hiding >= 1) return;
        // Connector: from the index, level to near the phone, then onto the target.
        const target = apply(
          m,
          screenRect.x + stop.x * k,
          screenRect.y + (stop.y - scroll) * k,
          scratch,
        );
        const startX = p.x + p.index.ink.x + p.index.ink.w + 1.6 * u;
        const startY = p.indexY + p.index.capHeight / 2;
        const elbowX = Math.max(startX + u, Math.min(target.x - 3 * u, body.x - 2 * u));
        // A new path each frame: the drawer caches paths by identity.
        const connector: PathCommand[] = [
          ['M', startX, startY],
          ['L', elbowX, startY],
          ['L', target.x, target.y],
        ];
        const drawn = win(local, 0.08, 0.5, energy.id === 'calm' ? 'glide' : 'snap');
        const retract = hiding;
        if (drawn > 0 && retract < 1) {
          g.path(connector, {
            stroke: {
              color: fg,
              width: lineWidth,
              cap: 'round',
              join: 'round',
              trim: [retract, Math.max(retract, drawn)],
            },
            opacity: 0.55,
          });
        }
        const dot = win(local, 0.42, 0.3, energy.overshoot > 0 ? 'pop' : 'glide') * (1 - retract);
        if (dot > 0) {
          g.circle(target.x, target.y, dotR * 2 * dot, { fill: withAlpha(bg, 0.85) });
          g.circle(target.x, target.y, dotR * dot, { fill: accent });
        }
        // Index and caption lines: masked rises, a fade and lift away.
        const idx = win(local, 0, 0.35, 'glide') * (1 - hiding);
        if (idx > 0)
          g.text(p.index, {
            fill: accent,
            x: p.x,
            y: p.indexY + (1 - idx) * 0.8 * u,
            opacity: idx,
          });
        const rise = (p.block.lines[0]?.mask.h ?? u) * 1.05;
        p.block.lines.forEach((line, j) => {
          const q = win(local, 0.1 + j * 0.07 * energy.stagger, 0.6 * energy.time, energy.enter);
          if (q <= 0) return;
          const out = hiding;
          g.clip(
            { x: p.x + line.mask.x, y: p.textY + line.mask.y, w: line.mask.w, h: line.mask.h },
            (g) =>
              g.text(line, {
                fill: fg,
                x: p.x,
                y: p.textY + (1 - q) * rise - out * rise * 0.6,
                opacity: 1 - out * 0.6,
              }),
          );
        });
        if (local > 0.2 && hiding < 0.5) {
          g.editable('captions', {
            x: p.x + p.block.ink.x,
            y: p.indexY,
            w: Math.max(p.block.ink.w, p.index.ink.w),
            h: p.textY + p.block.ink.y + p.block.ink.h - p.indexY,
          });
        }
      });
    }
  },
});
