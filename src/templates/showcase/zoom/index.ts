/**
 * Zoom — grid zoom (docs/templates/05-showcase.md §5.4).
 *
 * The expensive detail: the camera zooms with logarithmic interpolation — the scale moves at a
 * constant rate in log space, so the push reads as one steady move instead of a slow start and
 * an explosive end — about the one point that stays put on screen while the hero glides to the
 * center. Everything is drawn at each frame's scale (gaps and corners are world sizes that grow
 * with the zoom), so seams stay crisp at 6× and at 4K. Tiles blur by their distance from the
 * hero as the camera closes in, and the hero's corners straighten as it fills the frame.
 *
 * Images: a Hero slot plus eight grid slots (the last three optional); the grid cycles through
 * the filled slots, and repeats get their own seeded crop so the wall never looks tiled.
 */

import {
  CLEAN_END,
  type Color,
  c,
  type Draw,
  defineTemplate,
  type EaseName,
  type FocalPoint,
  type FormatId,
  type Graphic,
  mixOklab,
  type Rect,
  resolveEase,
  smoothstep,
  type TextBlock,
  unionRect,
  withAlpha,
} from '@/engine';

const GRID_KEYS = [
  'image1',
  'image2',
  'image3',
  'image4',
  'image5',
  'image6',
  'image7',
  'image8',
] as const;

/** Grid defaults: the scenes other than the hero's, then repeats (optional slots). */
const GRID_SCENES = [
  'scene-coast',
  'scene-alpine',
  'scene-night',
  'scene-meadow',
  'scene-dunes',
  'scene-alpine',
  'scene-coast',
  'scene-meadow',
];

const gridImage = (n: number) =>
  c.image({
    label: `Image ${n}`,
    accept: 'scene',
    default: { kind: 'placeholder', id: GRID_SCENES[n - 1] ?? 'scene-coast' },
    ...(n > 5 ? { optional: true, advanced: true } : {}),
  });

type Composition = {
  /** Title and subtitle sizes in u, and the title's measure (share of the layout width). */
  title: number;
  subtitle: number;
  measure: number;
  maxLines: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { title: 9, subtitle: 2.8, measure: 0.64, maxLines: 2 },
  '9:16': { title: 10.5, subtitle: 3.4, measure: 1, maxLines: 3 },
  '1:1': { title: 9, subtitle: 3, measure: 0.9, maxLines: 3 },
  '4:5': { title: 9.5, subtitle: 3.2, measure: 0.94, maxLines: 3 },
};

type EnergyKey = 'calm' | 'balanced' | 'punchy';

/** Per energy: the pop-in curve, the zoom's curve (on the log parameter) and its tilt. */
const CHARACTER: Record<EnergyKey, { pop: EaseName; zoom: EaseName; tilt: number }> = {
  calm: { pop: 'glide', zoom: 'drift', tilt: 1.2 },
  balanced: { pop: 'pop', zoom: 'drift', tilt: 2 },
  punchy: { pop: 'pop', zoom: 'snap', tilt: 3 },
};

type Tile = {
  readonly col: number;
  readonly row: number;
  /** World rect (design units at the final zoom). */
  readonly rect: Rect;
  readonly key: (typeof GRID_KEYS)[number] | 'hero';
  readonly graphic: Graphic | null;
  readonly focal: FocalPoint;
  /** Extra crop for repeated images: zoom about `focal` (1 = none), and a mirror. */
  readonly zoom: number;
  readonly mirror: boolean;
  /** Chebyshev distance from the hero (0 = the hero). */
  readonly ring: number;
  /** Pop-in delay (seconds, Balanced). */
  readonly delay: number;
};

export default defineTemplate({
  id: 'zoom',
  version: 1,
  meta: {
    name: 'Zoom',
    tagline: 'Grid zoom',
    category: 'showcase',
    tags: ['grid', 'zoom', 'portfolio', 'photos', 'collection'],
    useCases: ['Portfolio highlights', 'Photo series', 'One-of-many stories', 'Collection heroes'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 4, max: 12 },
  alpha: 'none',
  poster: 3.4,
  palettes: [
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'film' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'forest' },
  ],
  pairings: ['grotesk', 'editorial', 'classic', 'studio', 'wide'],
  controls: {
    hero: c.image({
      label: 'Hero image',
      accept: 'scene',
      default: { kind: 'placeholder', id: 'scene-dusk' },
      hint: 'The image the camera zooms into',
    }),
    image1: gridImage(1),
    image2: gridImage(2),
    image3: gridImage(3),
    image4: gridImage(4),
    image5: gridImage(5),
    image6: gridImage(6),
    image7: gridImage(7),
    image8: gridImage(8),
    title: c.text({
      label: 'Title',
      default: 'Everything starts somewhere.',
      maxLength: 48,
      multiline: true,
      maxLines: 3,
      primary: true,
    }),
    subtitle: c.text({
      label: 'Subtitle',
      default: 'Portfolio 2026',
      maxLength: 36,
      optional: true,
    }),
    grid: c.choice({
      label: 'Grid size',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: '4', label: '4 × 4' },
        { value: '5', label: '5 × 5' },
        { value: '6', label: '6 × 6' },
      ],
    }),
    gap: c.number({
      label: 'Gap',
      group: 'style',
      default: 0.8,
      min: 0,
      max: 3,
      step: 0.2,
      unit: 'u',
    }),
    radius: c.number({
      label: 'Radius',
      group: 'style',
      default: 0.6,
      min: 0,
      max: 3,
      step: 0.2,
      unit: 'u',
    }),
    exit: c.choice({
      label: 'Exit',
      group: 'motion',
      default: 'through',
      options: [
        { value: 'through', label: 'Through' },
        { value: 'back', label: 'Back' },
      ],
    }),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'editorial' },
    {
      id: 'sand',
      name: 'Sand',
      palette: { kind: 'library', id: 'sand' },
      pairing: 'classic',
      values: { exit: 'back' },
    },
  ],
  timing: ({ props }) => ({
    in: 3.2,
    out: props.exit === 'back' ? 1.5 : 0.8,
    tail: CLEAN_END,
    readable: props.title,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text } = ctx;
    const { u, width: W, height: H } = frame;
    const { bg, fg } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const character = CHARACTER[energy.id];
    const rng = ctx.rng('zoom');

    // --- the grid (world units = design units once a tile fills the frame) -----------------
    const n = props.grid === 'auto' ? 4 : Number(props.grid);
    // The hero sits off center, a third in, so the camera travels as it pushes in.
    const heroCol = Math.floor(n / 3);
    const heroRow = Math.floor(n / 3);
    // Gap and radius are specified as seen in the wide shot; the wide shot covers the frame.
    const overfill = 1.05;
    const covering = (size: number) => (overfill * size - (n - 1) * props.gap * u) / (n * size);
    const s0 = Math.max(0.05, Math.max(covering(W), covering(H)));
    const s1 = 1;
    const gap = (props.gap * u) / s0;
    const radius = (props.radius * u) / s0;
    const pitchX = W + gap;
    const pitchY = H + gap;

    const slots = GRID_KEYS.flatMap((key) => {
      const graphic = ctx.graphic(key);
      return graphic ? [{ key, graphic, focal: ctx.focal(key) }] : [];
    });
    const heroGraphic = ctx.graphic('hero');
    const heroFocal = ctx.focal('hero');
    const tiles: Tile[] = [];
    let used = 0;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const rect: Rect = {
          x: (col - (n - 1) / 2) * pitchX - W / 2,
          y: (row - (n - 1) / 2) * pitchY - H / 2,
          w: W,
          h: H,
        };
        const ring = Math.max(Math.abs(col - heroCol), Math.abs(row - heroRow));
        // Seeded pop-in order across the whole wall (0–0.4 s).
        const delay = rng.next() * 0.4;
        if (ring === 0) {
          tiles.push({
            col,
            row,
            rect,
            key: 'hero',
            graphic: heroGraphic,
            focal: heroFocal,
            zoom: 1,
            mirror: false,
            ring,
            delay,
          });
          continue;
        }
        const slot = slots.length > 0 ? slots[used % slots.length] : undefined;
        const repeat = slots.length > 0 && used >= slots.length;
        used++;
        tiles.push({
          col,
          row,
          rect,
          key: slot?.key ?? 'image1',
          graphic: slot?.graphic ?? null,
          // A repeated image shows another part of itself.
          focal: repeat
            ? { x: 0.2 + rng.next() * 0.6, y: 0.25 + rng.next() * 0.5 }
            : (slot?.focal ?? { x: 0.5, y: 0.5 }),
          zoom: repeat ? 1.3 + rng.next() * 0.5 : 1,
          // Every other repeat is mirrored: landscapes read as new places.
          mirror: repeat && Math.floor(used / Math.max(1, slots.length)) % 2 === 1,
          ring,
          delay,
        });
      }
    }
    const hero = tiles.find((tile) => tile.ring === 0) as Tile;
    const heroCenter = { x: hero.rect.x + W / 2, y: hero.rect.y + H / 2 };
    const gridCenter = { x: 0, y: 0 };
    const maxRing = tiles.reduce((m, tile) => Math.max(m, tile.ring), 0);

    // --- type over the hero -------------------------------------------------------------------
    // Light type over a scrim of the palette's dark color, whichever of bg / fg that is.
    const light: Color = palette.dark ? fg : bg;
    const dark: Color = palette.dark ? bg : fg;
    const scrimColor = mixOklab(dark, { r: 0, g: 0, b: 0, a: 1 }, 0.25);
    const display = pairing.display;
    const measure = area.w * comp.measure;
    const title: TextBlock = text.layout(props.title.trim() || ' ', {
      style: {
        font: display.font,
        italicFont: display.italic,
        size: comp.title * u,
        weight: display.weight,
        width: display.width,
        tracking: display.tracking,
        features: display.features,
      },
      maxWidth: measure,
      maxLines: comp.maxLines,
      lineHeight: display.lineHeight,
      align: 'left',
      fit: { minSize: comp.title * u * 0.45 },
    });
    const subtitleText = props.subtitle.trim();
    const subtitle: TextBlock | null = subtitleText
      ? text.layout(subtitleText, {
          style: {
            font: pairing.text.font,
            size: comp.subtitle * u,
            weight: 550,
            width: pairing.text.width,
            tracking: 0.06,
            features: pairing.text.features,
            case: 'upper',
          },
          maxWidth: measure,
          maxLines: 1,
          lineHeight: 1.2,
          align: 'left',
          fit: { minSize: 2.4 * u },
        })
      : null;
    const between = subtitle ? Math.max(2.2 * u, title.size * 0.36) : 0;
    const lockH = title.height + (subtitle ? between + subtitle.capHeight : 0);
    // Seated on the bottom of the layout area, leaving room for descenders.
    const lockBottom = area.y + area.h - (subtitle ? 0.25 : 0.22) * (subtitle?.size ?? title.size);
    const titleX = area.x;
    const titleY = lockBottom - lockH;
    const subtitleY = titleY + title.height + between;
    const titleBounds: Rect = {
      x: titleX + title.ink.x,
      y: titleY + title.ink.y,
      w: title.ink.w,
      h: title.ink.h,
    };
    const subtitleBounds: Rect | null = subtitle
      ? {
          x: titleX + subtitle.ink.x,
          y: subtitleY + subtitle.ink.y,
          w: subtitle.ink.w,
          h: subtitle.ink.h,
        }
      : null;
    const lockup = subtitleBounds ? unionRect(titleBounds, subtitleBounds) : titleBounds;
    // The scrim darkens the lower part of the frame behind the type.
    const scrimTop = Math.max(0, titleY - Math.max(18 * u, lockH * 0.9));
    const scrim = {
      kind: 'linear' as const,
      x0: 0,
      y0: scrimTop,
      x1: 0,
      y1: H,
      stops: [
        { offset: 0, color: withAlpha(scrimColor, 0) },
        { offset: 0.45, color: withAlpha(scrimColor, 0.32) },
        { offset: 1, color: withAlpha(scrimColor, 0.72) },
      ],
    };

    // --- motion ------------------------------------------------------------------------------
    const pop = resolveEase(character.pop);
    const away = resolveEase('exit');
    const zoomEase = resolveEase(character.zoom);
    const tilt = character.tilt;
    const back = props.exit === 'back';
    const holdPush = 1.04;

    /**
     * The camera: world → screen = frame center + R(tilt) · s · (world − focus). While zooming
     * from s_a to s_b, the focus moves so one point stays put on screen: the log zoom about it
     * brings the hero from where it was to the center.
     */
    const cam = { s: s0, fx: 0, fy: 0, tilt };
    const zoomBetween = (
      sa: number,
      sb: number,
      fa: { x: number; y: number },
      fb: { x: number; y: number },
      p: number,
    ) => {
      const s = Math.exp(Math.log(sa) + (Math.log(sb) - Math.log(sa)) * p);
      const inv = 1 / sa - 1 / sb;
      if (Math.abs(inv) < 1e-9) {
        cam.fx = fa.x + (fb.x - fa.x) * p;
        cam.fy = fa.y + (fb.y - fa.y) * p;
      } else {
        // The invariant point Z and the screen offset K: focus = Z − K / s.
        const kx = (fb.x - fa.x) / inv;
        const ky = (fb.y - fa.y) / inv;
        cam.fx = fa.x + kx / sa - kx / s;
        cam.fy = fa.y + ky / sa - ky / s;
      }
      cam.s = s;
    };

    const drawTile = (g: Draw, tile: Tile, rect: Rect, cornerRadius: number) => {
      const graphic = tile.graphic;
      if (!graphic) {
        g.roundRect(rect, cornerRadius, { fill: palette.roles.surface });
        return;
      }
      // Repeats show a zoomed crop: a larger rect around the focal point, cut by the tile.
      const dest =
        tile.zoom === 1
          ? rect
          : {
              x: rect.x - rect.w * (tile.zoom - 1) * tile.focal.x,
              y: rect.y - rect.h * (tile.zoom - 1) * tile.focal.y,
              w: rect.w * tile.zoom,
              h: rect.h * tile.zoom,
            };
      // Rasters crop through the source rect (no clip of their own); vectors clip themselves.
      const paint = (g: Draw) => {
        if (graphic.kind === 'raster') {
          g.image(graphic.image, dest, { fit: 'cover', focal: tile.focal });
        } else {
          g.graphic(graphic, dest, { fit: 'cover', focal: tile.focal });
        }
      };
      const flipped = (g: Draw) =>
        tile.mirror ? g.group({ scaleX: -1, originX: rect.x + rect.w / 2 }, paint) : paint(g);
      if (cornerRadius > 0.01) g.clip({ rect, radius: cornerRadius }, flipped);
      else if (tile.zoom !== 1) g.clip(rect, flipped);
      else flipped(g);
    };

    const visible = new Uint8Array(tiles.length);
    const popScale = new Float64Array(tiles.length);
    const popOpacity = new Float64Array(tiles.length);

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        // --- camera ---
        const zoom = tl.p(t, 'in', { delay: 1, dur: 1.6 }, zoomEase);
        const push = tl.p(t, 'hold', {}, 'drift');
        const leave = tl.p(t, 'out', {}, back ? 'snap' : 'exit');
        const sHold = s1 * (1 + (holdPush - 1) * push);
        let fade = 1;
        if (t < tl.sections.hold.start || leave <= 0) {
          zoomBetween(s0, s1, gridCenter, heroCenter, zoom);
          if (push > 0) cam.s = sHold;
          cam.tilt = tilt * (1 - zoom);
        } else if (back) {
          // Back out to the wall (the tiles then pop away).
          const outZoom = Math.min(1, leave / 0.62);
          zoomBetween(sHold, s0, heroCenter, gridCenter, zoomEase(outZoom));
          cam.tilt = tilt * zoomEase(outZoom);
        } else {
          // Through: keep pushing (log) and fade to the page.
          zoomBetween(sHold, sHold * 1.3, heroCenter, heroCenter, leave);
          cam.tilt = 0;
          fade = 1 - smoothstep(0.1, 1, leave);
        }
        const blurIn = smoothstep(0.05, 0.65, zoom) * (1 - (back ? smoothstep(0, 0.5, leave) : 0));
        // Corners straighten as the hero fills the frame (and come back on the way out).
        const heroCorner =
          radius * (1 - smoothstep(0.35, 0.95, zoom) * (back ? 1 - smoothstep(0, 0.5, leave) : 1));

        // Visible tiles: the frame taken into world space (a box turned by the tilt).
        const cos = Math.abs(Math.cos((cam.tilt * Math.PI) / 180));
        const sin = Math.abs(Math.sin((cam.tilt * Math.PI) / 180));
        const turn = (cam.tilt * Math.PI) / 180;
        const reachX = W / 2 / cam.s + (W / 2) * cos + (H / 2) * sin;
        const reachY = H / 2 / cam.s + (W / 2) * sin + (H / 2) * cos;
        for (let k = 0; k < tiles.length; k++) {
          const tile = tiles[k] as Tile;
          const dx = tile.rect.x + W / 2 - cam.fx;
          const dy = tile.rect.y + H / 2 - cam.fy;
          const sx = dx * Math.cos(turn) + dy * Math.sin(turn);
          const sy = -dx * Math.sin(turn) + dy * Math.cos(turn);
          let state = 0;
          if (Math.abs(sx) <= reachX && Math.abs(sy) <= reachY) {
            // Pop in (and, backing out, pop away in reverse order).
            const inP = tl.p(t, 'in', { delay: tile.delay, dur: 0.4 }, 'linear');
            const outP = back
              ? tl.p(t, 'out', { delay: 0.62 + (0.4 - tile.delay) * 0.55, dur: 0.3 }, 'linear')
              : 0;
            if (inP > 0 && outP < 1) {
              popScale[k] = (0.85 + 0.15 * pop(inP)) * (1 - 0.15 * away(outP));
              popOpacity[k] = Math.min(1, inP / 0.6) * (1 - outP);
              state = 1;
            }
          }
          visible[k] = state;
        }

        g.group(
          {
            x: frame.cx - cam.fx,
            y: frame.cy - cam.fy,
            rotate: cam.tilt,
            scale: cam.s,
            originX: cam.fx,
            originY: cam.fy,
            opacity: fade,
          },
          (g) => {
            for (let ring = maxRing; ring >= 0; ring--) {
              // Bounds of this ring's visible tiles (the blur layer covers only those).
              let bounds: Rect | null = null;
              for (let k = 0; k < tiles.length; k++) {
                const tile = tiles[k] as Tile;
                if (tile.ring !== ring || !visible[k]) continue;
                bounds = bounds ? unionRect(bounds, tile.rect) : tile.rect;
              }
              if (!bounds) continue;
              const drawRing = (g: Draw) => {
                for (let k = 0; k < tiles.length; k++) {
                  const tile = tiles[k] as Tile;
                  if (tile.ring !== ring || !visible[k]) continue;
                  const corner = tile.ring === 0 ? heroCorner : radius;
                  g.group(
                    {
                      scale: popScale[k] ?? 1,
                      originX: tile.rect.x + W / 2,
                      originY: tile.rect.y + H / 2,
                      opacity: popOpacity[k] ?? 1,
                    },
                    (g) => drawTile(g, tile, tile.rect, corner),
                  );
                  // Drop targets: the hero and each slot's first (uncropped) tile.
                  if (tile.ring === 0 || (tile.graphic && tile.zoom === 1)) {
                    g.editable(tile.key, tile.rect);
                  }
                }
              };
              const blur = ring === 0 ? 0 : (0.7 + 0.45 * (ring - 1)) * energy.blur * blurIn;
              if (blur > 0.05) g.fx({ blur, bounds }, drawRing);
              else drawRing(g);
            }
          },
        );

        // --- title over the hero ---
        const scrimIn = tl.p(t, 'in', { delay: 2.2, dur: 0.8 }, 'drift');
        const typeOut = tl.p(t, 'out', { dur: 0.4 }, 'exit');
        const scrimOpacity = scrimIn * (1 - typeOut) * fade;
        if (scrimOpacity > 0)
          g.rect(
            { x: 0, y: scrimTop, w: W, h: H - scrimTop },
            { fill: scrim, opacity: scrimOpacity },
          );
        g.movable('title', lockup, (g) => {
          title.lines.forEach((line, i) => {
            const p = tl.p(t, 'in', { delay: 2.4 + i * ctx.stagger(0.08), dur: 0.7 }, energy.enter);
            if (p <= 0 || typeOut >= 1) return;
            const mask = {
              x: titleX + line.mask.x,
              y: titleY + line.mask.y,
              w: line.mask.w,
              h: line.mask.h,
            };
            const y = titleY + (1 - p - typeOut) * mask.h * 1.05;
            g.clip(mask, (g) => g.text(line, { fill: light, x: titleX, y, opacity: fade }));
          });
          if (subtitle && subtitleBounds) {
            const p = tl.p(t, 'in', { delay: 2.4 + 0.25, dur: 0.6 }, energy.enter);
            const opacity = p * (1 - typeOut) * fade;
            if (opacity > 0) {
              g.text(subtitle, {
                fill: light,
                x: titleX,
                y: subtitleY + (1 - p) * 1.2 * u,
                opacity,
              });
            }
            g.editable('subtitle', subtitleBounds);
          }
          g.editable('title', titleBounds);
        });
      },
    };
  },
});
