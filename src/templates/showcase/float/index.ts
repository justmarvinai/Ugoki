/**
 * Float — device showcase in 3D (docs/templates/05-showcase.md §5.2).
 *
 * The expensive detail: the display is mapped perspective-correct onto a real 3D device (the
 * engine's `space` planes) — the device is a slab whose metal band is shaded facet by facet by a
 * key light — and the glass reflection lives in screen space: a band that stays with the room,
 * so the screen slides under it as the device turns (and a slow sweep crosses it in the hold).
 * The contact shadow is computed from the device's footprint and its height above the floor:
 * it widens and pales as the device lifts.
 *
 * Screens: three image slots. A slot left on its default shows a procedural app screen (a
 * fictional finance app, UI Kit); a file shows as-is — a tall screenshot scrolls, several
 * crossfade every 1.8 s.
 */

import {
  Camera,
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  drawContactShadow,
  drawPlanes,
  type FormatId,
  type Gradient,
  type Graphic,
  mixOklab,
  type Plane,
  type RasterGraphic,
  type Rect,
  resolveEase,
  type SpringName,
  springProgress,
  type TextBlock,
  Transform3D,
  UI_FONT,
  unionRect,
  withAlpha,
} from '@/engine';
import {
  type DeviceKind,
  type DeviceModel,
  deviceModel,
  drawSlab,
  FINISHES,
  type Light,
  type Outline,
  scaleModel,
  slabOutline,
} from './device';
import { defaultScreen } from './screens';

const SCREEN_KEYS = ['screen1', 'screen2', 'screen3'] as const;
/** A screen slot on this placeholder shows the procedural app screen. */
const APP_SCREEN = 'object-phone';

const screenSlot = (n: number) =>
  c.image({
    label: `Screen ${n}`,
    accept: 'object',
    default: { kind: 'placeholder', id: APP_SCREEN },
    hint: 'Your screenshot. The default is an app screen.',
    ...(n > 1 ? { optional: true } : {}),
  });

type Arrangement = 'side' | 'stack';

type Composition = {
  /** Headline and subline sizes in u; the side-by-side text column's share of the width. */
  headline: number;
  subline: number;
  column: number;
  /** Tall devices (phones) and wide ones side by side, or text above the device. */
  tall: Arrangement;
  wide: Arrangement;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { headline: 7.6, subline: 3, column: 0.42, tall: 'side', wide: 'side' },
  '1:1': { headline: 7.4, subline: 3.1, column: 0.5, tall: 'side', wide: 'stack' },
  '4:5': { headline: 7.6, subline: 3.2, column: 0.5, tall: 'side', wide: 'stack' },
  '9:16': { headline: 8.6, subline: 3.6, column: 1, tall: 'stack', wide: 'stack' },
};

/** Hero angles per Tilt (rx, ry for the Left layout); entrances start 20° / 10° further. */
const TILTS = {
  flat: { rx: 3, ry: -6 },
  subtle: { rx: 8, ry: -14 },
  dramatic: { rx: 14, ry: -26 },
} as const;

/** The rise per energy: a named spring on a slower clock (devices move with weight). */
const RISE: Record<'calm' | 'balanced' | 'punchy', { spring: SpringName; clock: number }> = {
  calm: { spring: 'heavy', clock: 0.95 },
  balanced: { spring: 'gentle', clock: 0.42 },
  punchy: { spring: 'snappy', clock: 0.5 },
};

type Screen = {
  readonly key: (typeof SCREEN_KEYS)[number];
  readonly graphic: Graphic | null;
  readonly focal: { x: number; y: number };
  /** A tall screenshot scrolls: its height when fitted to the display's width. */
  readonly scroll: number;
};

export default defineTemplate({
  id: 'float',
  version: 1,
  meta: {
    name: 'Float',
    tagline: 'Device showcase in 3D',
    category: 'showcase',
    tags: ['device', 'app', 'mockup', '3d', 'launch', 'product'],
    useCases: ['App launches', 'Website showcases', 'SaaS features', 'App Store previews'],
  },
  formats: ['16:9', '1:1', '4:5', '9:16'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 4, max: 15 },
  alpha: 'optional',
  poster: 2.6,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'lilac' },
  ],
  pairings: ['grotesk', 'technical', 'soft', 'editorial', 'wide'],
  fonts: [UI_FONT],
  controls: {
    screen1: screenSlot(1),
    screen2: screenSlot(2),
    screen3: screenSlot(3),
    headline: c.text({
      label: 'Headline',
      default: 'Your money, in motion.',
      maxLength: 48,
      multiline: true,
      maxLines: 3,
      primary: true,
    }),
    subline: c.text({
      label: 'Subline',
      default: 'The new Halden app. Out now.',
      maxLength: 60,
      optional: true,
    }),
    device: c.choice({
      label: 'Device',
      default: 'phone',
      options: [
        { value: 'phone', label: 'Phone' },
        { value: 'tablet', label: 'Tablet' },
        { value: 'laptop', label: 'Laptop' },
        { value: 'browser', label: 'Browser' },
      ],
    }),
    finish: c.choice({
      label: 'Finish',
      default: 'graphite',
      options: [
        { value: 'graphite', label: 'Graphite' },
        { value: 'silver', label: 'Silver' },
        { value: 'white', label: 'White' },
      ],
    }),
    layout: c.choice({
      label: 'Layout',
      default: 'left',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
        { value: 'center', label: 'Center' },
      ],
    }),
    tilt: c.choice({
      label: 'Tilt',
      group: 'motion',
      default: 'subtle',
      options: [
        { value: 'flat', label: 'Flat' },
        { value: 'subtle', label: 'Subtle' },
        { value: 'dramatic', label: 'Dramatic' },
      ],
    }),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    {
      id: 'midnight',
      name: 'Midnight',
      palette: { kind: 'library', id: 'midnight' },
      pairing: 'technical',
      values: { finish: 'silver' },
    },
    {
      id: 'mint',
      name: 'Mint',
      palette: { kind: 'library', id: 'mint' },
      pairing: 'soft',
      values: { finish: 'white' },
    },
  ],
  timing: ({ props }) => ({
    in: 1.45,
    out: 0.7,
    tail: CLEAN_END,
    readable: props.headline,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u, width: W, height: H } = frame;
    const { bg, fg, muted } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const safe = frame.safe.title;
    const area = frame.vertical ? frame.safe.social : safe;
    const kind = props.device as DeviceKind;
    const base = deviceModel(kind);
    const finish = FINISHES[props.finish];
    const tallDevice = kind === 'phone';
    const center = props.layout === 'center';
    const arrangement: Arrangement = center ? 'stack' : tallDevice ? comp.tall : comp.wide;
    // Right: text on the right, the device on the left, turned the other way.
    const flip = props.layout === 'right' ? -1 : 1;

    // --- type ------------------------------------------------------------------------------
    const display = pairing.display;
    const align =
      center || (arrangement === 'stack' && frame.format === '9:16' && center)
        ? 'center'
        : props.layout === 'right'
          ? 'right'
          : 'left';
    const measure = arrangement === 'side' ? area.w * comp.column : area.w * (center ? 0.9 : 0.94);
    const headline: TextBlock = text.layout(props.headline.trim() || ' ', {
      style: {
        font: display.font,
        italicFont: display.italic,
        size: comp.headline * u,
        weight: display.weight,
        width: display.width,
        tracking: display.tracking,
        features: display.features,
      },
      maxWidth: measure,
      maxLines: 3,
      lineHeight: display.lineHeight,
      align,
      fit: { minSize: comp.headline * u * 0.45 },
    });
    const sublineText = props.subline.trim();
    const subline: TextBlock | null = sublineText
      ? text.layout(sublineText, {
          style: {
            font: pairing.text.font,
            size: comp.subline * u,
            weight: 460,
            width: pairing.text.width,
            tracking: 0,
            features: pairing.text.features,
          },
          maxWidth: measure,
          maxLines: 2,
          lineHeight: 1.3,
          align,
          fit: { minSize: 2.4 * u },
        })
      : null;
    const between = subline ? Math.max(2.4 * u, headline.size * 0.34) : 0;
    const lockH = headline.height + (subline ? between + subline.height : 0);

    // --- composition -------------------------------------------------------------------------
    let textX: number;
    let textY: number;
    let deviceBox: Rect;
    if (arrangement === 'side') {
      const gap = 5 * u;
      const column = area.w * comp.column;
      textX = flip > 0 ? area.x : area.x + area.w - measure;
      textY = area.y + (area.h - lockH) * 0.46;
      deviceBox =
        flip > 0
          ? { x: area.x + column + gap, y: safe.y, w: area.w - column - gap, h: safe.h }
          : { x: area.x, y: safe.y, w: area.w - column - gap, h: safe.h };
    } else {
      textX =
        area.x +
        (align === 'center' ? (area.w - measure) / 2 : align === 'right' ? area.w - measure : 0);
      textY = area.y + (subline ? 0 : 0.5 * u);
      const top = textY + lockH + 6 * u;
      // The device may reach into the lower platform zone of vertical formats (it's not text).
      const bottom = safe.y + safe.h;
      deviceBox = { x: safe.x, y: top, w: safe.w, h: Math.max(10 * u, bottom - top) };
    }
    // Fit the body into its box, leaving the floor below it: the device hovers `floorGap` above
    // the floor at rest (it rises that far in, less a little), and its shadow spreads below.
    const floorGap = base.deck ? 5 * u : 7 * u;
    const shadowRoom = 5 * u;
    const room = arrangement === 'side' ? 0.9 : 0.94;
    const bodyH = base.body.h + (base.deck ? base.deck.h * 0.45 : 0);
    const k = Math.min(
      ((deviceBox.h - floorGap - shadowRoom) * room) / bodyH,
      (deviceBox.w * room * 0.92) / (base.deck?.w ?? base.body.w),
    );
    const model: DeviceModel = scaleModel(base, k);
    const deviceX = deviceBox.x + deviceBox.w / 2 + (center ? 0 : flip * deviceBox.w * 0.02);
    const fitted = bodyH * k;
    const deviceY =
      deviceBox.y +
      (deviceBox.h - floorGap - shadowRoom - fitted) / 2 +
      fitted / 2 -
      (model.deck ? model.deck.h * 0.2 : 0);

    // Camera: level, the eye at the device's height; close enough for real perspective.
    const size = Math.max(model.body.w, model.body.h);
    const perspective = size * 2;
    const camera = new Camera({ perspective, x: deviceX, y: deviceY - model.body.h * 0.1 });

    // --- screens --------------------------------------------------------------------------
    const mode = palette.dark ? 'dark' : 'light';
    const screenW = model.screen.w;
    const screenH = model.screen.h;
    const textures = new Map<number, RasterGraphic | null>();
    const screens: Screen[] = SCREEN_KEYS.flatMap((key, index) => {
      const ref = props[key];
      if (!ref) return [];
      if (ref.kind === 'placeholder' && ref.id === APP_SCREEN) {
        let texture = textures.get(index);
        if (texture === undefined) {
          texture = defaultScreen({
            model,
            index,
            width: screenW,
            height: screenH,
            scale: 2,
            frame,
            text,
            palette,
            mode,
          });
          textures.set(index, texture);
        }
        return [{ key, graphic: texture, focal: { x: 0.5, y: 0 }, scroll: 0 }];
      }
      const graphic = ctx.graphic(key);
      const ink = graphic?.ink;
      // Taller than the display (at its width): scroll through it.
      const fitted = ink && ink.w > 0 ? (ink.h / ink.w) * screenW : screenH;
      const scroll = fitted > screenH * 1.15 ? fitted - screenH : 0;
      return [{ key, graphic, focal: scroll > 0 ? { x: 0.5, y: 0 } : ctx.focal(key), scroll }];
    });
    const screenBg: Color = mixOklab(palette.roles.surface, palette.dark ? bg : fg, 0.04);

    // --- the device in 3D ------------------------------------------------------------------
    const bodyOutline: Outline = slabOutline(model.body, 10);
    const deckOutline: Outline | null = model.deck ? slabOutline(model.deck, 8) : null;
    const tilt = TILTS[props.tilt];
    // A laptop is seen from above (its keyboard shows); the others lean back like a phone on
    // a stand.
    const heroRx = model.deck ? -(tilt.rx * 1.6 + 6) : tilt.rx;
    const heroRy = tilt.ry * flip * (center ? 0.55 : 1);
    const rise = RISE[energy.id];
    const lift = ctx.travel(20 * u);
    // Key light from the upper left, a little in front.
    const lightDir = normalize({ x: -0.45 * flip, y: -0.75, z: 0.5 });
    const light: Light = { dir: lightDir, ambient: 0.38 };
    // The device's frame: the lid's hinge for laptops, the body's center otherwise.
    const transform = new Transform3D();
    const lidTransform = new Transform3D();
    const deckTransform = new Transform3D();
    const screenPlane: Plane & { transform: Transform3D } = {
      rect: model.screen,
      radius: model.screenRadius,
      transform: new Transform3D(),
      front: { fill: screenBg },
    };
    const face = screenPlane.front as NonNullable<Plane['front']>;
    const keyboard: Plane & { transform: Transform3D } = {
      rect: model.deck
        ? { x: -model.deck.w / 2, y: -model.deck.h / 2, w: model.deck.w, h: model.deck.h }
        : { x: 0, y: 0, w: 1, h: 1 },
      transform: new Transform3D(),
      front: {
        draw: (g) => {
          const deck = model.deck;
          if (!deck) return;
          // Keyboard well near the hinge, trackpad toward the front.
          g.roundRect(
            { x: -deck.w * 0.4, y: -deck.h * 0.44, w: deck.w * 0.8, h: deck.h * 0.42 },
            deck.w * 0.012,
            { fill: finish.keys },
          );
          g.roundRect(
            { x: -deck.w * 0.15, y: deck.h * 0.07, w: deck.w * 0.3, h: deck.h * 0.33 },
            deck.w * 0.012,
            { fill: finish.pad },
          );
        },
      },
    };

    const lowest = { y: 0 };
    const corners: [number, number, number][] = [];
    const collectCorners = (t3: Transform3D, w: number, h: number, d: number) => {
      for (const sx of [-1, 1])
        for (const sy of [-1, 1])
          for (const sz of [-1, 1]) {
            const p = t3.applyXYZ((sx * w) / 2, (sy * h) / 2, (sz * d) / 2);
            corners.push([p.x, p.y, p.z]);
          }
    };

    /** Places the device for a pose; fills `corners` with its bounding points. */
    const pose = (rx: number, ry: number, x: number, y: number) => {
      transform.reset().translate(x, y, 0).rotateX(rx).rotateY(ry);
      corners.length = 0;
      if (model.deck) {
        // Laptop: origin at the hinge; the lid leans back, the deck lies flat toward us.
        const hingeY = model.body.h * 0.34;
        transform.translate(0, hingeY, 0);
        lidTransform
          .copy(transform)
          .rotateX(model.lidLean)
          .translate(0, -model.body.h / 2, 0);
        deckTransform
          .copy(transform)
          .translate(0, model.deck.depth / 2, model.deck.h / 2)
          .rotateX(90);
        collectCorners(lidTransform, model.body.w, model.body.h, model.body.depth);
        collectCorners(deckTransform, model.deck.w, model.deck.h, model.deck.depth);
        keyboard.transform.copy(deckTransform).translate(0, 0, model.deck.depth / 2 + 0.1);
      } else {
        lidTransform.copy(transform);
        collectCorners(lidTransform, model.body.w, model.body.h, model.body.depth);
      }
      screenPlane.transform.copy(lidTransform).translate(0, 0, model.body.depth / 2 + 0.05);
      lowest.y = Math.max(...corners.map((p) => p[1]));
    };

    // The floor: below the device's resting pose, far enough that it floats.
    pose(heroRx, heroRy, deviceX, deviceY);
    const floorY = lowest.y + floorGap;
    const heroBounds = projectedBounds(camera, corners);
    const deviceBounds: Rect = {
      x: heroBounds.x - 2 * u,
      y: heroBounds.y - 2 * u,
      w: heroBounds.w + 4 * u,
      h: heroBounds.h + 4 * u,
    };

    // --- backdrop ------------------------------------------------------------------------------
    const transparent = ctx.transparent;
    const horizon = camera.y;
    const floorShade = mixOklab(
      bg,
      palette.dark ? fg : { r: 0, g: 0, b: 0, a: 1 },
      palette.dark ? 0.05 : 0.045,
    );
    const floorFill: Gradient = {
      kind: 'linear',
      x0: 0,
      y0: horizon,
      x1: 0,
      y1: H,
      stops: [
        { offset: 0, color: withAlpha(floorShade, 0) },
        { offset: 0.35, color: withAlpha(floorShade, 0.6) },
        { offset: 1, color: floorShade },
      ],
    };
    const glow = mixOklab(
      bg,
      palette.dark ? fg : { r: 1, g: 1, b: 1, a: 1 },
      palette.dark ? 0.07 : 0.55,
    );
    const spot: Gradient = {
      kind: 'radial',
      cx: deviceX,
      cy: deviceY - model.body.h * 0.1,
      r: Math.max(model.body.w, model.body.h) * 0.85,
      stops: [
        { offset: 0, color: withAlpha(glow, 0.9) },
        { offset: 1, color: withAlpha(glow, 0) },
      ],
    };
    const shadowColor = mixOklab(bg, { r: 0, g: 0, b: 0, a: 1 }, palette.dark ? 0.8 : 0.72);

    // --- the glass reflection (screen space) ---------------------------------------------------
    const white: Color = { r: 1, g: 1, b: 1, a: 1 };
    const reflection = (offset: number): Gradient => {
      // A band leaning 28° from vertical, placed along the frame's diagonal by `offset`.
      const span = Math.max(deviceBounds.w, deviceBounds.h) * 1.4;
      const angle = (28 * Math.PI) / 180;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const cx = deviceX + offset * span * dx;
      const cy = deviceY + offset * span * dy;
      return {
        kind: 'linear',
        x0: cx - dx * span * 0.5,
        y0: cy - dy * span * 0.5,
        x1: cx + dx * span * 0.5,
        y1: cy + dy * span * 0.5,
        stops: [
          { offset: 0, color: withAlpha(white, 0) },
          { offset: 0.4, color: withAlpha(white, 0.02) },
          { offset: 0.47, color: withAlpha(white, 0.1) },
          { offset: 0.5, color: withAlpha(white, 0.13) },
          { offset: 0.56, color: withAlpha(white, 0.04) },
          { offset: 0.62, color: withAlpha(white, 0) },
          { offset: 1, color: withAlpha(white, 0) },
        ],
      };
    };

    // --- motion ------------------------------------------------------------------------------
    const holdStart = timeline.sections.hold.start;
    const holdEnd = timeline.sections.hold.end;
    const crossfade = 0.45;
    const exitEase = resolveEase('exit');
    const textX0 = textX;
    const headlineBounds: Rect = {
      x: textX0 + headline.ink.x,
      y: textY + headline.ink.y,
      w: headline.ink.w,
      h: headline.ink.h,
    };
    const sublineY = textY + headline.height + between;
    const sublineBounds: Rect | null = subline
      ? {
          x: textX0 + subline.ink.x,
          y: sublineY + subline.ink.y,
          w: subline.ink.w,
          h: subline.ink.h,
        }
      : null;
    const lockup = sublineBounds ? unionRect(headlineBounds, sublineBounds) : headlineBounds;

    const drawDevice = (g: Draw, opacity: number, t: number) => {
      const drawLid = () =>
        drawSlab(g, camera, lidTransform, model.body, bodyOutline, finish, light, opacity);
      const faceDrawn = drawLid();
      if (faceDrawn && screens.length > 0) {
        // Which screen shows: one at a time, crossfading every 1.8 s through the hold.
        const local = Math.max(0, t - holdStart);
        const count = screens.length;
        const slot = count > 1 ? Math.floor(local / 1.8) : 0;
        const into = count > 1 && t > holdStart ? Math.min(1, (local - slot * 1.8) / crossfade) : 1;
        const current = screens[slot % count] as Screen;
        const previous = screens[(slot - 1 + count) % count] as Screen;
        const scrollP =
          current.scroll > 0
            ? resolveEase('drift')(Math.min(1, local / Math.max(0.5, holdEnd - holdStart)))
            : 0;
        face.graphic = null;
        face.draw = (g) => {
          if (slot > 0 && into < 1) paintScreen(g, previous, 0, 1);
          paintScreen(g, current, scrollP, slot > 0 ? into : 1);
        };
        const drawn = drawPlanes(g, camera, [screenPlane], { tolerance: 0.6 });
        const plane = drawn[0];
        if (plane) {
          // Glass: a reflection band fixed to the room, so the screen turns beneath it, and a
          // slow sweep across it in the hold.
          const sweep = resolveEase('drift')(Math.min(1, local / Math.max(1, holdEnd - holdStart)));
          const turn = (transformYaw - heroRy) / 40;
          g.clip({ path: plane.path }, (g) =>
            g.rect(plane.bounds, {
              fill: reflection(-0.55 + 0.9 * sweep + turn * flip),
              opacity,
            }),
          );
          g.editable(current.key, plane.bounds);
        }
      }
      if (model.deck && deckOutline) {
        drawSlab(
          g,
          camera,
          deckTransform,
          model.deck,
          deckOutline,
          finish,
          light,
          opacity,
          mixOklab(finish.mid, finish.light, 0.35),
        );
        drawPlanes(g, camera, [keyboard], { tolerance: 1.5 });
      }
    };

    const paintScreen = (g: Draw, screen: Screen, scrollP: number, opacity: number) => {
      const r = model.screen;
      const graphic = screen.graphic;
      if (!graphic) return;
      if (screen.scroll > 0) {
        const fittedH = r.h + screen.scroll;
        const y = r.y - screen.scroll * scrollP;
        const dest = { x: r.x - r.w * 0.005, y, w: r.w * 1.01, h: fittedH };
        if (graphic.kind === 'raster') g.image(graphic.image, dest, { fit: 'cover', opacity });
        else g.graphic(graphic, dest, { fit: 'cover', opacity });
        return;
      }
      const grown = { x: r.x - r.w * 0.005, y: r.y - r.h * 0.005, w: r.w * 1.01, h: r.h * 1.01 };
      if (graphic.kind === 'raster') {
        g.image(graphic.image, grown, { fit: 'cover', focal: screen.focal, opacity });
      } else {
        g.graphic(graphic, grown, { fit: 'cover', focal: screen.focal, opacity });
      }
    };

    let transformYaw = heroRy;

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        // --- device pose ---
        const local = t - tl.at('in', 0);
        const p = local > 0 ? springProgress(local * rise.clock * 2.2, rise.spring) : 0;
        const shown = Math.min(1, Math.max(0, local) / 0.35);
        const hold = tl.p(t, 'hold', {}, 'drift');
        const away = tl.p(t, 'out', { delay: 0.05, dur: 0.65 }, 'exit');
        const float = Math.sin((2 * Math.PI * Math.max(0, t - holdStart)) / 3.2) * 0.5 * u;
        const rx = heroRx + (1 - p) * 20;
        const ry =
          heroRy - flip * (1 - p) * 10 + flip * 4 * hold * (center ? 0.55 : 1) - flip * 26 * away;
        transformYaw = ry;
        const y = deviceY + (1 - p) * lift + float * Math.min(1, hold * 6);
        const opacity = shown * (1 - exitEase(Math.min(1, away * 1.15)));
        pose(rx, ry, deviceX, y);

        if (!transparent) {
          g.rect({ x: 0, y: horizon, w: W, h: H - horizon }, { fill: floorFill });
          g.circle(spot.cx, spot.cy, spot.r, { fill: spot, opacity: shown * (1 - away) });
        }

        if (opacity > 0.002) {
          // Contact shadow: the footprint straight down; it widens and pales as the device lifts.
          const foot = footprint(corners, ry);
          drawContactShadow(g, camera, {
            x: foot.x,
            z: foot.z,
            floor: floorY,
            width: foot.w * 0.94,
            depth: foot.d,
            yaw: ry,
            height: Math.max(0, floorY - lowest.y),
            color: shadowColor,
            opacity: (palette.dark ? 0.8 : 0.62) * opacity,
            blur: 0.8 * u,
            spread: 0.55,
            fade: 14 * u,
          });
          g.movable('device', deviceBounds, (g) => drawDevice(g, opacity, t));
        }

        // --- copy ---
        const textOut = tl.p(t, 'out', { dur: 0.45 }, 'exit');
        g.movable('copy', lockup, (g) => {
          headline.lines.forEach((line, i) => {
            const reveal = tl.p(
              t,
              'in',
              { delay: 0.6 + i * ctx.stagger(0.08), dur: 0.8 },
              energy.enter,
            );
            if (reveal <= 0 || textOut >= 1) return;
            const mask = {
              x: textX0 + line.mask.x,
              y: textY + line.mask.y,
              w: line.mask.w,
              h: line.mask.h,
            };
            const dy = (1 - reveal - textOut) * mask.h * 1.05;
            g.clip(mask, (g) => g.text(line, { fill: fg, x: textX0, y: textY + dy }));
          });
          if (subline && sublineBounds) {
            const reveal = tl.p(
              t,
              'in',
              { delay: 0.6 + 0.15 + (headline.lines.length - 1) * ctx.stagger(0.08), dur: 0.6 },
              energy.enter,
            );
            const alpha = reveal * (1 - textOut);
            if (alpha > 0) {
              g.text(subline, {
                fill: muted,
                x: textX0,
                y: sublineY + (1 - reveal) * 1.2 * u,
                opacity: alpha,
              });
            }
            g.editable('subline', sublineBounds);
          }
          g.editable('headline', headlineBounds);
        });
      },
    };
  },
});

function normalize(v: { x: number; y: number; z: number }) {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** Screen bounds of world points. */
function projectedBounds(
  camera: Camera,
  points: readonly (readonly [number, number, number])[],
): Rect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y, z] of points) {
    const p = camera.projectXYZ(x, y, z);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** The device's footprint on the floor, in axes turned by its yaw: center, width and depth. */
function footprint(points: readonly (readonly [number, number, number])[], yaw: number) {
  const a = (yaw * Math.PI) / 180;
  const ux = Math.cos(a);
  const uz = -Math.sin(a);
  const vx = Math.sin(a);
  const vz = Math.cos(a);
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const [x, , z] of points) {
    const s = x * ux + z * uz;
    const t = x * vx + z * vz;
    minU = Math.min(minU, s);
    maxU = Math.max(maxU, s);
    minV = Math.min(minV, t);
    maxV = Math.max(maxV, t);
  }
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  return {
    x: cu * ux + cv * vx,
    z: cu * uz + cv * vz,
    w: maxU - minU,
    d: Math.max(1, maxV - minV),
  };
}
