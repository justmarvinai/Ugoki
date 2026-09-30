/**
 * Notify — notification stack (docs/templates/10-ui-motion.md §10.2).
 *
 * The expensive detail: physically coupled springs and true backdrop blur. Each notification
 * drops onto the stack on a spring; the card under it reacts a beat later, the next one a beat
 * after that — a chain of springs, each pulled by the one above — and past the first three,
 * older cards tuck behind in a stacked group. Every card is frosted glass over the wallpaper:
 * Ugoki draws the wallpaper itself, so the glass is the wallpaper drawn again inside the cards,
 * blurred by the compositor (one blur for the whole stack, one for a card still landing).
 *
 * A sequence with Auto duration: the cards arrive 0.6–0.9 s apart (by how much there is to
 * read, times the Pace), then the headline rises and holds 1.5 s. Frame 0 and the last frame are
 * the wallpaper alone (it settles in from 104% and returns there).
 */

import {
  CLEAN_END,
  type Color,
  c,
  clamp,
  createUiKit,
  type Draw,
  defineTemplate,
  type EaseName,
  ease,
  type FormatId,
  FrostedPanel,
  frostBackdrop,
  iconColors,
  type PathCommand,
  parseHex,
  type Rect,
  roundRectPath,
  roundRectPathReverse,
  SpringChain,
  type SpringConfig,
  type TextBlock,
  UI_FONT,
  type UiNotification,
  unionRect,
  withAlpha,
} from '@/engine';
import { appInitials, DEFAULT_NOTES, glyphFor, MAX_NOTES, type Note, parseNotes } from './content';
import { type CardState, LANDING, Stack, stackHeight } from './stack';
import { Wallpaper } from './wallpaper';

type Composition = {
  /** Clock and headline in a column left of the cards (else stacked: clock, cards, headline). */
  side: boolean;
  /** Card width: a share of the area's width (stacked) or of the right column (side). */
  width: number;
  /** Time and headline sizes (u), headline lines. */
  time: number;
  headline: number;
  lines: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '9:16': { side: false, width: 1, time: 17, headline: 8.2, lines: 2 },
  '4:5': { side: false, width: 0.8, time: 11.5, headline: 5.6, lines: 2 },
  '1:1': { side: false, width: 0.74, time: 11, headline: 5, lines: 2 },
  '16:9': { side: true, width: 0.86, time: 16, headline: 6.4, lines: 3 },
};

/** Card width in UI px (a phone's notification). */
const CARD = 360;
/** Pace: multiplies the gaps between arrivals. */
const PACES = { slow: 1.3, normal: 1, fast: 0.75 } as const;
/** After the last card lands, the headline rises, then everything holds to be read. */
const LAND = 0.5;
const HEADLINE = 0.75;
const READ = 1.5;

const win = (t: number, start: number, dur: number, curve: EaseName) =>
  ease[curve](dur <= 0 ? (t >= start ? 1 : 0) : Math.max(0, Math.min(1, (t - start) / dur)));

/** Seconds from one arrival to the next: time to read the card that just landed. */
function gaps(notes: readonly Note[], pace: number): number[] {
  return notes
    .slice(0, -1)
    .map((n) => clamp(0.5 + 0.008 * (n.title.length + n.message.length), 0.6, 0.9) * pace);
}

/** The springs per energy: the landing card's, and each lower card's pull toward the one above. */
const SPRINGS: Record<
  'calm' | 'balanced' | 'punchy',
  { lead: SpringConfig; follow: SpringConfig; delay: number }
> = {
  calm: {
    lead: { stiffness: 170, damping: 24, mass: 1 },
    follow: { stiffness: 150, damping: 23, mass: 1 },
    delay: 0.05,
  },
  balanced: {
    lead: { stiffness: 400, damping: 28, mass: 1 },
    follow: { stiffness: 300, damping: 26, mass: 1 },
    delay: 0.035,
  },
  punchy: {
    lead: { stiffness: 500, damping: 25, mass: 1 },
    follow: { stiffness: 420, damping: 25, mass: 1 },
    delay: 0.025,
  },
};

export default defineTemplate({
  id: 'notify',
  version: 1,
  meta: {
    name: 'Notify',
    tagline: 'Notification stack',
    category: 'ui-motion',
    tags: ['ui', 'notifications', 'lock screen', 'app', 'fintech'],
    useCases: ['App launches', 'Fintech', 'E-commerce', 'Creator milestones'],
  },
  formats: ['9:16', '4:5', '1:1', '16:9'],
  structure: 'sequence',
  duration: { default: 'auto', min: 4, max: 12 },
  alpha: 'none',
  poster: 3.6,
  palettes: [
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'blush' },
    { kind: 'library', id: 'forest' },
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'sand' },
    { kind: 'library', id: 'ink' },
  ],
  pairings: ['grotesk', 'editorial', 'soft', 'technical', 'wide'],
  // Notifications and the clock are set in the UI Kit's Inter, whatever the pairing.
  fonts: [UI_FONT],
  controls: {
    notifications: c.text({
      label: 'Notifications',
      default: DEFAULT_NOTES,
      maxLength: 360,
      multiline: true,
      maxLines: MAX_NOTES,
      hint: 'One per line: App | Title | Message | Time (the time is optional)',
    }),
    headline: c.text({
      label: 'Headline',
      default: 'Everything, as it happens.',
      maxLength: 48,
      multiline: true,
      maxLines: 2,
      optional: true,
      primary: true,
    }),
    time: c.text({ label: 'Clock time', default: '9:30', maxLength: 8 }),
    date: c.text({
      label: 'Date',
      default: 'Wednesday, 14 October',
      maxLength: 32,
      optional: true,
    }),
    icon: c.image({
      label: 'App icon',
      accept: 'logo',
      optional: true,
      default: { kind: 'placeholder', id: 'halden' },
      hint: 'Shown on the first app’s notifications; the others get a generated icon',
    }),
    wallpaper: c.choice({
      label: 'Wallpaper',
      default: 'gradient',
      options: [
        { value: 'gradient', label: 'Gradient' },
        { value: 'image', label: 'Image' },
        { value: 'solid', label: 'Solid' },
      ],
    }),
    wallpaperImage: c.image({
      label: 'Wallpaper image',
      accept: 'scene',
      default: { kind: 'placeholder', id: 'scene-night' },
      hint: 'Shown when Wallpaper is Image — adding your own picture switches to it',
    }),
    clock: c.toggle({ label: 'Clock', default: true }),
    theme: c.choice({
      label: 'Theme',
      default: 'dark',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
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
      id: 'dark-midnight',
      name: 'Dark · Midnight',
      palette: { kind: 'library', id: 'midnight' },
      pairing: 'grotesk',
      values: { theme: 'dark', wallpaper: 'gradient' },
    },
    {
      id: 'light-blush',
      name: 'Light · Blush',
      palette: { kind: 'library', id: 'blush' },
      pairing: 'grotesk',
      values: { theme: 'light', wallpaper: 'gradient' },
    },
    {
      id: 'dark-forest',
      name: 'Dark · Forest',
      palette: { kind: 'library', id: 'forest' },
      pairing: 'grotesk',
      values: { theme: 'dark', wallpaper: 'gradient' },
    },
  ],
  timing: ({ props, energy }) => {
    const notes = parseNotes(props.notifications);
    const pace = PACES[props.pace];
    const content =
      gaps(notes, pace).reduce((s, g) => s + g, 0) +
      (notes.length > 0 ? LAND : 0) +
      (props.headline.trim() ? HEADLINE : 0) +
      READ;
    return {
      lead: 0,
      in: 0.6,
      out: 0.6,
      tail: CLEAN_END,
      auto: 1.2 * energy.time + content + CLEAN_END,
    };
  },
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const comp = COMPOSITIONS[frame.format];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const dark = props.theme === 'dark';
    const notes = parseNotes(props.notifications);

    // --- columns --------------------------------------------------------------------------
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const split = frame.format === '16:9' ? 0.47 : 0.44;
    const right = comp.side
      ? { x: area.x + area.w * split + 3 * u, w: area.w * (1 - split) - 3 * u }
      : { x: frame.cx - half, w: half * 2 };
    const cardW = right.w * comp.width;
    const cardX = right.x + (right.w - cardW) / 2;
    const unit = cardW / CARD;
    const ui = createUiKit({
      text,
      palette,
      mode: props.theme,
      unit,
      fallbackFont: pairing.text.font,
    });
    const theme = ui.theme;

    // --- wallpaper ----------------------------------------------------------------------------
    const userWallpaper = props.wallpaperImage?.kind === 'user';
    const wallpaperKind = userWallpaper ? 'image' : props.wallpaper;
    const wallpaper = new Wallpaper({
      kind: wallpaperKind,
      palette,
      width: frame.width,
      height: frame.height,
      rng: ctx.rng('wallpaper'),
      graphic: wallpaperKind === 'image' ? ctx.graphic('wallpaperImage') : null,
      focal: ctx.focal('wallpaperImage'),
      darkUi: dark,
    });
    const ink: Color =
      wallpaperKind === 'image'
        ? dark
          ? parseHex('#FFFFFF')
          : parseHex('#0B0B0C')
        : palette.roles.fg;

    // --- clock --------------------------------------------------------------------------------
    const clock =
      props.clock && props.time.trim()
        ? ui.lockClock({
            time: props.time,
            date: props.date,
            size: (comp.time * u) / unit,
            align: comp.side ? 'left' : 'center',
          })
        : null;
    const clockX = comp.side ? area.x : frame.cx;
    const clockY = area.y + (comp.side ? 0 : 2 * u);

    // --- headline -----------------------------------------------------------------------------
    const display = pairing.display;
    const headlineText = props.headline.trim();
    const leftW = comp.side ? right.x - area.x - 6 * u : half * 2;
    const headline: TextBlock | null = headlineText
      ? text.layout(headlineText, {
          style: {
            font: display.font,
            italicFont: display.italic,
            size: comp.headline * u,
            weight: display.weight,
            width: display.width,
            tracking: display.tracking,
            features: display.features,
          },
          maxWidth: leftW,
          maxLines: comp.lines,
          lineHeight: Math.max(display.lineHeight, 1),
          align: comp.side ? 'left' : 'center',
          fit: { minSize: comp.headline * u * 0.55 },
        })
      : null;
    const headlineX = comp.side ? area.x : frame.cx - half;
    const headlineY = headline ? area.y + area.h - headline.height - 0.22 * headline.size : 0;

    // --- notifications ------------------------------------------------------------------------
    const apps: string[] = [];
    for (const note of notes) if (!apps.includes(note.app)) apps.push(note.app);
    const colors = iconColors(palette, apps.length);
    const logo = ctx.graphic('icon');
    const cards: UiNotification[] = notes.map((note) => {
      const index = apps.indexOf(note.app);
      const glyph = glyphFor(note);
      return ui.notification({
        app: note.app,
        title: note.title,
        message: note.message,
        time: note.time,
        width: CARD,
        icon: {
          color: colors[index] as Color,
          graphic: index === 0 && logo ? logo : null,
          glyph: glyph ?? undefined,
          initials: glyph ? undefined : appInitials(note),
        },
      });
    });
    const tint = dark ? withAlpha(theme.surface, 0.56) : withAlpha(theme.raised, 0.6);
    const panels = cards.map(
      (card) =>
        new FrostedPanel(card.w, card.h, card.radius, {
          tint,
          blur: 3,
          saturation: 1.5,
          brightness: dark ? 0.82 : 1.06,
          rim: dark ? 0.55 : 0.8,
        }),
    );
    const gap = 10 * unit;
    const heights = cards.map((card) => card.h);
    const clockBottom = clock ? clockY + clock.bounds.h : area.y;
    const total = stackHeight(heights, gap);
    const stackTop = comp.side
      ? area.y + Math.max(0, (area.h - total) / 2)
      : clock
        ? clockBottom + (frame.format === '9:16' ? 6.5 : 4.5) * u
        : area.y + 2 * u;

    // --- timing -------------------------------------------------------------------------------
    const hold = timeline.sections.hold;
    const natural = gaps(notes, PACES[props.pace]);
    const naturalSum = natural.reduce((s, g) => s + g, 0);
    const tailNeed = (notes.length > 0 ? LAND : 0) + (headline ? HEADLINE : 0);
    const available = hold.end - hold.start;
    // A fixed duration scales the gaps (0.5–1.4×) and the final read (≥ 0.8 s).
    let scale = 1;
    const spare = available - naturalSum - tailNeed - READ;
    if (spare > 0) scale = Math.min(1.4, 1 + (spare * 0.5) / Math.max(0.01, naturalSum));
    else scale = clamp((available - tailNeed - 0.8) / Math.max(0.01, naturalSum), 0.5, 1);
    const arrivals: number[] = [];
    let at = hold.start;
    notes.forEach((_, i) => {
      arrivals.push(at);
      at += (natural[i] ?? 0) * scale;
    });
    const lastArrival = arrivals[arrivals.length - 1] ?? hold.start;
    const headlineAt = notes.length > 0 ? lastArrival + LAND * 0.5 : hold.start;

    const springs = SPRINGS[energy.id];
    const chain = new SpringChain({
      links: Math.max(1, notes.length),
      lead: springs.lead,
      follow: springs.follow,
      delay: springs.delay,
    });
    const stack = new Stack({
      heights,
      arrivals,
      cx: cardX + cardW / 2,
      top: stackTop,
      gap,
      drop: ctx.travel(4 * u),
      chain,
    });

    // --- per-frame scratch --------------------------------------------------------------------
    const states: (CardState | null)[] = cards.map(() => null);
    const pool: CardState[] = cards.map(() => ({ cx: 0, top: 0, scale: 1, opacity: 0 }));
    const rects: Rect[] = cards.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
    const full: Rect = { x: 0, y: 0, w: frame.width, h: frame.height };
    const fullPath = roundRectPath(full, 0);
    let wallScale = 1;
    const backdrop = (g: Draw) => wallpaper.draw(g, wallScale);
    const lines = headline?.lines ?? [];
    const rise = (lines[0]?.mask.h ?? u) * 1.05;
    const headlineBounds = headline
      ? {
          x: headlineX + headline.ink.x,
          y: headlineY + headline.ink.y,
          w: headline.ink.w,
          h: headline.ink.h,
        }
      : null;
    const lineGap = ctx.stagger(0.08);
    const iconIndex = logo ? 0 : -1;

    /** Draws card j's glass and content, cut away where newer settled cards cover it. */
    const drawCard = (
      g: Draw,
      j: number,
      glass: false | ((g: Draw) => void),
      blockers: number[],
    ) => {
      const state = states[j] as CardState;
      const card = cards[j] as UiNotification;
      const panel = panels[j] as FrostedPanel;
      const x = state.cx - card.w / 2;
      const y = state.top - (card.h * (1 - state.scale)) / 2;
      const paint = (g: Draw) =>
        panel.draw(g, x, y, glass, {
          scale: state.scale,
          opacity: state.opacity,
          content: (g) => card.draw(g, state.opacity),
        });
      const nest = (g: Draw, i: number) => {
        const k = blockers[i];
        if (k === undefined) {
          paint(g);
          return;
        }
        const r = rects[k] as Rect;
        const cut: PathCommand[] = [
          ...fullPath,
          ...roundRectPathReverse(
            r,
            (cards[k] as UiNotification).radius * (states[k] as CardState).scale,
          ),
        ];
        g.clip({ path: cut }, (g) => nest(g, i + 1));
      };
      nest(g, 0);
    };

    return {
      render: ({ t, g, tl }) => {
        // Wallpaper: settles in from 104%, returns there at the end (clean first/last frames).
        const settle = tl.p(t, 'in', {}, 'glide');
        const unsettle = tl.p(t, 'out', { delay: 0.1 }, 'drift');
        wallScale = 1 + 0.04 * (1 - settle) + 0.04 * unsettle;
        wallpaper.draw(g, wallScale);

        const exit = tl.p(t, 'out', { dur: 0.45 }, 'exit');
        const exitFade = tl.p(t, 'out', { dur: 0.4 }, 'swift');

        // Clock: fades up into place, leaves with the rest.
        if (clock) {
          const shown = tl.p(t, 'in', { delay: 0.1, dur: 0.55 }, 'glide');
          const opacity = shown * (1 - exitFade);
          if (opacity > 0) {
            clock.draw(g, clockX, clockY + (1 - shown) * 1.2 * u - exit * 2 * u, {
              color: ink,
              opacity,
              dateOpacity: 0.85,
            });
          }
          const b = clock.bounds;
          if (clock.dateBlock) {
            g.editable('date', {
              x: clockX + (comp.side ? 0 : -clock.dateBlock.ink.w / 2),
              y: clockY,
              w: clock.dateBlock.ink.w,
              h: clock.dateBlock.capHeight,
            });
          }
          g.editable('time', {
            x: clockX + b.x,
            y: clockY + b.h - clock.timeBlock.capHeight,
            w: clock.timeBlock.ink.w,
            h: clock.timeBlock.capHeight,
          });
        }
        if (wallpaperKind === 'image') g.editable('wallpaperImage', full);

        // Cards: states from the spring chain; settled cards share one backdrop blur.
        let union: Rect | null = null;
        const shared: number[] = [];
        const landing: number[] = [];
        for (let j = 0; j < cards.length; j++) {
          const state = stack.state(j, t, pool[j] as CardState);
          states[j] = state;
          if (!state || state.opacity <= 0.002) continue;
          const card = cards[j] as UiNotification;
          const r = rects[j] as Rect;
          r.w = card.w * state.scale;
          r.h = card.h * state.scale;
          r.x = state.cx - r.w / 2;
          r.y = state.top;
          const arrived = t - (arrivals[j] as number) >= LANDING;
          if (arrived) {
            shared.push(j);
            union = union ? unionRect(union, r) : { ...r };
          } else landing.push(j);
        }
        const drawStack = (g: Draw) => {
          if (union && shared.length > 0) {
            const outline: PathCommand[] = [];
            for (const j of shared) {
              outline.push(
                ...roundRectPath(
                  rects[j] as Rect,
                  (cards[j] as UiNotification).radius * (states[j] as CardState).scale,
                ),
              );
            }
            frostBackdrop(g, { path: outline }, union, backdrop, {
              blur: 3,
              saturation: 1.5,
              brightness: dark ? 0.82 : 1.06,
            });
          }
          for (let s = 0; s < shared.length; s++) {
            const j = shared[s] as number;
            const r = rects[j] as Rect;
            const blockers: number[] = [];
            for (let q = s + 1; q < shared.length; q++) {
              const k = shared[q] as number;
              const o = rects[k] as Rect;
              if (o.x < r.x + r.w && o.x + o.w > r.x && o.y < r.y + r.h && o.y + o.h > r.y)
                blockers.push(k);
            }
            drawCard(g, j, false, blockers);
          }
          // A landing card frosts everything behind it — the wallpaper and the cards it covers.
          for (const j of landing) {
            const r = rects[j] as Rect;
            const under = shared.filter((k) => {
              const o = rects[k] as Rect;
              return (
                k < j && o.x < r.x + r.w && o.x + o.w > r.x && o.y < r.y + r.h && o.y + o.h > r.y
              );
            });
            drawCard(
              g,
              j,
              under.length === 0
                ? backdrop
                : (g) => {
                    backdrop(g);
                    for (const k of under) drawCard(g, k, false, []);
                  },
              [],
            );
          }
        };
        if (exitFade > 0 && union) {
          const bounds = {
            x: union.x - 6 * u,
            y: union.y - 6 * u,
            w: union.w + 12 * u,
            h: union.h + 12 * u,
          };
          if (exitFade < 1) {
            g.layer({ opacity: 1 - exitFade, bounds }, (g) =>
              g.group({ y: -exit * 3 * u }, drawStack),
            );
          }
        } else {
          drawStack(g);
        }
        for (let j = 0; j < cards.length; j++) {
          const state = states[j];
          if (!state || state.opacity < 0.5 || exitFade >= 1) continue;
          const r = rects[j] as Rect;
          g.editable('notifications', r);
          if (j >= 0 && apps.indexOf((notes[j] as Note).app) === iconIndex) {
            const icon = (cards[j] as UiNotification).iconRect;
            g.editable('icon', {
              x: r.x + icon.x * state.scale,
              y: r.y + icon.y * state.scale,
              w: icon.w * state.scale,
              h: icon.h * state.scale,
            });
          }
        }

        // Headline: rises line by line at the bottom once the stack has landed.
        if (headline && headlineBounds) {
          g.movable('headline', headlineBounds, (g) => {
            lines.forEach((line, i) => {
              const p = win(t, headlineAt + i * lineGap, HEADLINE * energy.time, energy.enter);
              if (p <= 0 || exitFade >= 1) return;
              g.clip(
                {
                  x: headlineX + line.mask.x,
                  y: headlineY + line.mask.y,
                  w: line.mask.w,
                  h: line.mask.h,
                },
                (g) =>
                  g.text(line, {
                    fill: ink,
                    x: headlineX,
                    y: headlineY + (1 - p) * rise - exit * rise * 0.8,
                    opacity: 1 - exitFade,
                  }),
              );
            });
            g.editable('headline', headlineBounds);
          });
        }
      },
    };
  },
});
