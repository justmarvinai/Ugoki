/**
 * Click — cursor demo (docs/templates/10-ui-motion.md §10.1).
 *
 * The expensive detail: the cursor moves like a hand — minimum-jerk speed along gently curved
 * paths, a small overshoot past the button that is corrected by a second, shorter movement, and
 * a human pause before the click — and the button's loading morph keeps its center and radius
 * continuous: the pill narrows into a circle around the same center, the spinner closes onto
 * the spot where the check begins, and the circle widens back into the pill.
 *
 * Timing: the card rises in `in`; the interaction plays at the start of the hold with human
 * speeds, compressed a little when the duration is short (never below ~0.62×) so the success
 * state always gets time to be read; the rest of the hold breathes.
 */

import {
  type ButtonOptions,
  CLEAN_END,
  CursorPath,
  c,
  caretOpacity,
  clamp,
  clamp01,
  createUiKit,
  type Draw,
  defineTemplate,
  drawCursor,
  type EaseName,
  ease,
  type FormatId,
  type Rect,
  springProgress,
  type TextBlock,
  type Typed,
  typedCount,
  typedFigure,
  typedText,
  typingSchedule,
  UI_FONT,
  type UiField,
  type UiKit,
  type UiRow,
  type UiToast,
  type Vec2,
} from '@/engine';
import { type Copy, DEFAULT_COPY, resolveCopy, SCENARIO_OPTIONS, SCENARIOS } from './copy';

type Composition = {
  /** Headline above the card (else beside it, on the left). */
  stack: boolean;
  /** Largest card, as shares of the layout area. */
  cardW: number;
  cardH: number;
  /** Headline size in u and lines. */
  headline: number;
  maxLines: number;
};

const COMPOSITIONS: Record<FormatId, Composition> = {
  '16:9': { stack: false, cardW: 0.44, cardH: 0.8, headline: 10.6, maxLines: 3 },
  '9:16': { stack: true, cardW: 1, cardH: 0.58, headline: 10.8, maxLines: 3 },
  '1:1': { stack: true, cardW: 0.72, cardH: 0.62, headline: 7.4, maxLines: 2 },
  '4:5': { stack: true, cardW: 0.86, cardH: 0.62, headline: 7.6, maxLines: 2 },
};

/** Card width in UI px (the kit's unit scales it to the frame). */
const CARD_W = 400;
const PAD = 28;
const TOP = 26;
const BUTTON_H = 52;

/** Rest after the toast lands, before the exit (seconds) — the success state needs reading. */
const REST = 1;

const win = (t: number, start: number, dur: number, curve: EaseName) =>
  ease[curve](dur <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / dur));

type CardParts = {
  height: number;
  title: TextBlock | null;
  titleX: number;
  titleY: number;
  field: UiField;
  row: UiRow | null;
  /** The button is created once the choreography is known (its spinner is phased by it). */
  buttonOptions: ButtonOptions;
  buttonRect: Rect;
};

/** Lays out the card's contents from its top-left (x, y) at the kit's unit. */
function layoutCard(
  ui: UiKit,
  x: number,
  y: number,
  w: number,
  copy: Copy,
  typed: Typed,
  scenario: (typeof SCENARIOS)[keyof typeof SCENARIOS],
): CardParts {
  const px = (v: number) => ui.px(v);
  const x0 = x + px(PAD);
  const inner = w - 2 * px(PAD);
  let cursor = y + px(TOP);
  const titleText = copy.title.trim();
  const title = titleText ? ui.text(titleText, 'heading', { maxWidth: inner, minSize: 14 }) : null;
  const titleY = cursor;
  if (title) cursor += title.height + px(30);
  const field = ui.field({
    x: x0,
    y: cursor,
    w: inner,
    label: copy.label.trim() || undefined,
    typed,
    size: scenario.figure ? 'lg' : 'md',
    tabular: scenario.figure,
  });
  cursor = field.bounds.y + field.bounds.h + px(16);
  const detail = copy.detail.trim();
  const lead = scenario.lead;
  const row = detail
    ? ui.row({
        x: x0,
        y: cursor,
        w: inner,
        leading: lead === 'avatar' ? { avatar: detail } : lead ? { icon: lead } : undefined,
        title: detail,
        trailing: scenario.trailing,
      })
    : null;
  if (row) cursor += row.rect.h + px(26);
  else cursor += px(10);
  const buttonOptions: ButtonOptions = {
    cx: x0 + inner / 2,
    cy: cursor + px(BUTTON_H / 2),
    w: inner,
    height: BUTTON_H,
    label: copy.button.trim() || ' ',
    done: copy.done.trim() || undefined,
  };
  const buttonRect = { x: x0, y: cursor, w: inner, h: px(BUTTON_H) };
  cursor += px(BUTTON_H) + px(PAD);
  return { height: cursor - y, title, titleX: x0, titleY, field, row, buttonOptions, buttonRect };
}

export default defineTemplate({
  id: 'click',
  version: 1,
  meta: {
    name: 'Click',
    tagline: 'Cursor demo',
    category: 'ui-motion',
    tags: ['ui', 'cursor', 'product', 'demo', 'fintech'],
    useCases: ['SaaS feature demos', 'Onboarding clips', 'Fintech and payments', 'How it works'],
  },
  formats: ['16:9', '1:1', '4:5', '9:16'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 5, max: 12 },
  alpha: 'optional',
  poster: 4.75,
  palettes: [
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'graphite' },
  ],
  pairings: ['grotesk', 'technical', 'editorial', 'wide'],
  // The UI Kit sets interface text in Inter, whatever the pairing.
  fonts: [UI_FONT],
  controls: {
    scenario: c.choice({
      label: 'Scenario',
      group: 'content',
      default: 'send',
      options: SCENARIO_OPTIONS,
      display: 'select',
      hint: 'Fills in example copy — text you edit always wins',
    }),
    headline: c.text({
      label: 'Headline',
      default: DEFAULT_COPY.headline,
      maxLength: 44,
      multiline: true,
      maxLines: 2,
      optional: true,
      primary: true,
    }),
    title: c.text({
      label: 'Card title',
      default: DEFAULT_COPY.title,
      maxLength: 28,
      optional: true,
    }),
    label: c.text({ label: 'Field label', default: DEFAULT_COPY.label, maxLength: 24 }),
    value: c.text({ label: 'Field value', default: DEFAULT_COPY.value, maxLength: 36 }),
    detail: c.text({
      label: 'Recipient',
      default: DEFAULT_COPY.detail,
      maxLength: 32,
      optional: true,
      hint: 'The row under the field (a name, a date, an option)',
    }),
    button: c.text({ label: 'Button label', default: DEFAULT_COPY.button, maxLength: 20 }),
    done: c.text({
      label: 'Done label',
      default: DEFAULT_COPY.done,
      maxLength: 20,
      optional: true,
      hint: 'Shown in the button with a check',
    }),
    success: c.text({ label: 'Success message', default: DEFAULT_COPY.success, maxLength: 36 }),
    theme: c.choice({
      label: 'Theme',
      default: 'light',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    }),
    cursor: c.choice({
      label: 'Cursor',
      default: 'arrow',
      options: [
        { value: 'arrow', label: 'Arrow' },
        { value: 'hand', label: 'Hand' },
      ],
    }),
  },
  looks: [
    {
      id: 'light-cobalt',
      name: 'Light · Cobalt',
      palette: { kind: 'library', id: 'cobalt' },
      pairing: 'grotesk',
      values: { theme: 'light' },
    },
    {
      id: 'dark-mint',
      name: 'Dark · Mint',
      palette: { kind: 'library', id: 'mint' },
      pairing: 'grotesk',
      values: { theme: 'dark' },
    },
    {
      id: 'light-ink',
      name: 'Light · Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'grotesk',
      values: { theme: 'light' },
    },
  ],
  timing: ({ props }) => ({
    lead: 0.1,
    in: 0.6,
    out: 0.5,
    tail: CLEAN_END,
    readable: `${props.headline} ${props.success}`,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg } = palette.roles;
    const comp = COMPOSITIONS[frame.format];
    const scenario = SCENARIOS[props.scenario];
    const copy = resolveCopy(props.scenario, props);
    const mode = props.theme;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    // Stacked layouts are symmetric around the frame's center, even where the social zone isn't.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const column = comp.stack ? { x: frame.cx - half, w: half * 2 } : { x: area.x, w: area.w };

    const value = copy.value.trim() || ' ';
    const typed = (scenario.figure ? typedFigure(value) : null) ?? typedText(value);
    const kitOptions = { text, palette, mode, fallbackFont: pairing.text.font } as const;

    // --- headline -------------------------------------------------------------------------
    const headlineText = copy.headline.trim();
    const headlineW = comp.stack ? column.w : area.w * 0.44;
    const headline: TextBlock | null = headlineText
      ? text.layout(headlineText, {
          style: {
            font: pairing.display.font,
            italicFont: pairing.display.italic,
            size: comp.headline * u,
            weight: pairing.display.weight,
            width: pairing.display.width,
            tracking: pairing.display.tracking,
            features: pairing.display.features,
          },
          maxWidth: headlineW,
          maxLines: comp.maxLines,
          lineHeight: Math.max(pairing.display.lineHeight, 0.98),
          align: comp.stack ? 'center' : 'left',
          fit: { minSize: comp.headline * u * 0.55 },
        })
      : null;
    const gap = comp.stack ? 5.5 * u : 0;
    const headlineH = headline ? headline.height + 0.25 * headline.size : 0;

    // --- the card's scale: as large as the composition allows ------------------------------
    const finalState = typed.states[typed.states.length - 1] ?? '';
    const probe = layoutCard(
      createUiKit({ ...kitOptions, unit: 1 }),
      0,
      0,
      CARD_W,
      copy,
      { states: ['', finalState], keys: [finalState], placeholder: typed.placeholder },
      scenario,
    );
    const maxW = comp.stack ? column.w * comp.cardW : area.w * comp.cardW;
    const maxH = comp.stack
      ? Math.min(area.h * comp.cardH, area.h - headlineH - gap)
      : area.h * comp.cardH;
    const unit = Math.min(maxW / CARD_W, maxH / probe.height);
    const cardW = CARD_W * unit;
    const cardH = probe.height * unit;

    let cardX: number;
    let cardY: number;
    let headlineX = area.x;
    let headlineY = 0;
    if (comp.stack) {
      const total = headlineH + (headline ? gap : 0) + cardH;
      const top = area.y + (area.h - total) * 0.46;
      headlineX = column.x;
      headlineY = top;
      cardX = frame.cx - cardW / 2;
      cardY = top + (headline ? headlineH + gap : 0);
    } else if (headline) {
      const right = { x: area.x + area.w * 0.5, w: area.w * 0.5 };
      cardX = right.x + (right.w - cardW) / 2;
      cardY = area.y + (area.h - cardH) * 0.48;
      headlineY = cardY + cardH / 2 - headline.height / 2 - 0.04 * headline.size;
    } else {
      cardX = frame.cx - cardW / 2;
      cardY = area.y + (area.h - cardH) * 0.48;
    }

    // --- choreography (seconds; the interaction starts with the hold) ----------------------
    const hold = timeline.sections.hold;
    // The cursor sets off while the card settles (its first, accelerating stretch is off-frame).
    const t0 = hold.start - 0.2 * energy.time;
    const pace = energy.id === 'calm' ? 1.12 : energy.id === 'punchy' ? 0.9 : 1;
    const overshoot = (energy.id === 'calm' ? 0.6 : energy.id === 'punchy' ? 1.7 : 1.2) * u;
    const rng = ctx.rng('cursor');
    const jitter = { a: rng.range(-1, 1), b: rng.range(-1, 1), c: rng.range(-1, 1) };
    const keyTimes = typingSchedule(typed.keys, ctx.rng('typing'), {
      cps: energy.id === 'calm' ? 9 : energy.id === 'punchy' ? 12 : 10.5,
    });
    const naturalTyping = keyTimes[keyTimes.length - 1] ?? 0;
    // Long values type faster rather than forever.
    const typingCap = 0.75 + 0.035 * typed.keys.length;
    const typingScale = naturalTyping > typingCap ? typingCap / naturalTyping : 1;

    const ui = createUiKit({ ...kitOptions, unit });
    const px = (v: number) => ui.px(v);

    type Beats = {
      path: CursorPath;
      fieldClick: number;
      typingStart: number;
      typingScale: number;
      lastKey: number;
      buttonClick: number;
      hoverStart: number;
      loading: number;
      loadingDur: number;
      resolve: number;
      resolveDur: number;
      success: number;
      successDur: number;
      toast: number;
      settle: number;
    };

    const start: Vec2 = { x: frame.width + 4 * u, y: frame.height + 3 * u };
    const choreograph = (parts: CardParts, f: number): Beats => {
      const s = (seconds: number) => seconds * f;
      const { field, buttonRect } = parts;
      const box = field.box;
      const fieldPoint = {
        x: box.x + box.w * (0.66 + 0.05 * jitter.a),
        y: box.y + box.h * (0.56 + 0.08 * jitter.b),
      };
      const buttonPoint = {
        x: buttonRect.x + buttonRect.w * (0.56 + 0.06 * jitter.c),
        y: buttonRect.y + buttonRect.h * (0.58 + 0.08 * jitter.a),
      };
      const distance = Math.hypot(fieldPoint.x - start.x, fieldPoint.y - start.y);
      const path = new CursorPath(start, t0);
      path.move(fieldPoint, {
        dur: s(pace * (0.42 + distance / 5200)),
        bow: 0.13 + 0.03 * jitter.b,
      });
      path.wait(s(0.06));
      const fieldClick = path.time;
      path.click();
      const typingStart = fieldClick + s(0.16);
      const lastKey = typingStart + naturalTyping * typingScale * f;
      // Out of the way of the text while typing: a small drift down and right.
      path
        .wait(s(0.08))
        .move(
          { x: fieldPoint.x + 2.6 * u, y: fieldPoint.y + 3.4 * u },
          { dur: s(0.55), bow: 0.12 },
        );
      path.until(lastKey + s(0.2));
      path.move(buttonPoint, {
        dur: s(pace * 0.5),
        bow: -0.14 - 0.04 * jitter.c,
        overshoot,
        correct: s(0.16),
      });
      const arrival = path.time;
      path.wait(s(0.12 * pace)); // the human pause before the click
      const buttonClick = path.time;
      path.click();
      // After the click the hand relaxes and drifts off the button.
      path
        .wait(s(0.55))
        .move({ x: buttonPoint.x + 5 * u, y: buttonPoint.y + 4.5 * u }, { dur: 1.5, bow: 0.18 });
      // Hover begins when the cursor first crosses into the button.
      let hoverStart = arrival;
      const r = buttonRect;
      for (let t = lastKey; t <= arrival; t += 1 / 120) {
        const p = path.at(t);
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
          hoverStart = t;
          break;
        }
      }
      const loading = buttonClick + s(0.1);
      const loadingDur = s(0.42 * pace);
      const resolve = loading + s(0.78);
      const resolveDur = s(0.36);
      const success = resolve + s(0.2);
      const successDur = s(0.5 * pace);
      const toast = buttonClick + s(1.2);
      const settle = toast + 0.45;
      return {
        path,
        fieldClick,
        typingStart,
        typingScale,
        lastKey,
        buttonClick,
        hoverStart,
        loading,
        loadingDur,
        resolve,
        resolveDur,
        success,
        successDur,
        toast,
        settle,
      };
    };

    // Fit the interaction between its start and the end of the hold: natural speed when there's
    // room, up to ~40% quicker when the duration is short (the toast keeps at least half a
    // second to be read).
    const available = hold.end - t0;
    const parts = layoutCard(ui, cardX, cardY, cardW, copy, typed, scenario);
    const natural = choreograph(parts, 1);
    const length = natural.settle - t0;
    let f = clamp((available - REST) / length, 0.62, 1.08);
    if (length * f > available - 0.5) f = clamp((available - 0.5) / length, 0.5, f);
    const beats = choreograph(parts, f);
    const { field, row } = parts;
    // The spinner is phased so its head reaches the check's first point as it resolves.
    const button = ui.button({
      ...parts.buttonOptions,
      spinDuration: beats.resolve - beats.loading,
      // The brand stays on the button; the toast's badge says "success" in green.
      successTone: 'accent',
    });
    const clickAt = beats.path.at(beats.buttonClick, { x: 0, y: 0, press: 0 });
    const card = ui.card({ x: cardX, y: cardY, w: cardW, h: parts.height }, { elevation: 3 });
    // The toast lands as a banner across the card's top, over its title.
    const toast: UiToast = ui.toast({
      cx: cardX + cardW / 2,
      y: cardY + px(11),
      maxW: cardW - px(22),
      fill: true,
      height: 48,
      elevation: 1,
      title: copy.success.trim() || ' ',
      icon: 'check',
    });
    const cardRect: Rect = card.rect;
    const cursorScale = px(1.3);

    // --- editor regions --------------------------------------------------------------------
    const offset = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const headlineBounds = headline ? offset(headline.ink, headlineX, headlineY) : null;
    const titleBounds = parts.title ? offset(parts.title.ink, parts.titleX, parts.titleY) : null;

    // --- motion parameters ---------------------------------------------------------------
    const rise = ctx.travel(3 * u);
    const lineRise = (headline?.lines[0]?.mask.h ?? u) * 1.05;
    const lineGap = ctx.stagger(0.08);
    const exitGap = ctx.stagger(0.05);
    const exitDur = (i: number) => Math.max(0.2, Math.min(0.42, 0.48 - i * exitGap));
    const springName = energy.spring;
    const breathe = 0.5 * u;
    const cursorState = { x: 0, y: 0, press: 0 };
    const buttonState = {
      hover: 0,
      press: 0,
      loading: 0,
      spin: 0,
      resolve: 0,
      success: 0,
      ripple: { x: clickAt.x, y: clickAt.y, p: 0 },
      opacity: 1,
    };
    const fieldState = { typed: 0, focus: 0, caret: 0, opacity: 1 };
    const lines = headline?.lines ?? [];
    const masks = lines.map((line) => offset(line.mask, headlineX, headlineY));
    // On long holds the toast dismisses itself after a while, as real toasts do.
    const dismissAt = beats.toast + 3.4;
    const dismisses = hold.end - (dismissAt + 0.35) >= 1.2;
    const toastShown = (t: number) =>
      win(t, beats.toast, 0.16, 'swift') * (dismisses ? 1 - win(t, dismissAt, 0.35, 'exit') : 1);
    const drawCard = (g: Draw, t: number) => {
      card.draw(g);
      // The title gives way while the toast covers it (no double text through the fades).
      const covered = toastShown(t);
      if (parts.title && covered < 1) {
        g.text(parts.title, {
          fill: ui.theme.text,
          x: parts.titleX,
          y: parts.titleY,
          opacity: 1 - covered,
        });
      }

      // Field: focus on the click, value typed key by key, caret solid while typing.
      const typedKeys = typedCount(keyTimes, (t - beats.typingStart) / (beats.typingScale * f));
      const lastActivity =
        typedKeys > 0
          ? beats.typingStart + (keyTimes[typedKeys - 1] ?? 0) * beats.typingScale * f
          : beats.fieldClick;
      const unfocus = win(t, beats.buttonClick, 0.25, 'swift');
      fieldState.focus = win(t, beats.fieldClick, 0.2, 'swift') * (1 - unfocus);
      fieldState.typed = typedKeys;
      fieldState.caret = caretOpacity(t, lastActivity, { idle: 0.45 });
      field.draw(g, fieldState);
      row?.draw(g);

      // Button: hover, press, pill → circle + spinner, check, circle → pill.
      const bs = buttonState;
      bs.hover = win(t, beats.hoverStart, 0.14, 'swift');
      bs.press = beats.path.pressAt(t) * (t >= beats.buttonClick - 0.01 ? 1 : 0);
      bs.loading = win(t, beats.loading, beats.loadingDur, energy.id === 'calm' ? 'drift' : 'snap');
      bs.spin = Math.max(0, t - beats.loading);
      bs.resolve = win(t, beats.resolve, beats.resolveDur, 'glide');
      bs.success = win(t, beats.success, beats.successDur, 'glide');
      const rp = (t - beats.buttonClick) / 0.55;
      bs.ripple.p = rp > 0 && rp < 1 ? rp : 0;
      button.draw(g, bs);

      // Toast: drops in from the card's top edge on the energy's spring; leaves upwards.
      const tt = t - beats.toast;
      const visible = toastShown(t);
      if (tt > 0 && visible > 0) {
        const leaving = dismisses ? win(t, dismissAt, 0.35, 'exit') : 0;
        toast.draw(g, springProgress(tt, springName) * (1 - 0.6 * leaving), visible);
      }
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });

        const shown = tl.p(t, 'in', { dur: 0.6 }, energy.enter);
        const appear = tl.p(t, 'in', { dur: 0.32 }, 'drift');
        const gone = tl.p(t, 'out', { delay: 0.04, dur: 0.46 }, 'exit');
        const fadeOut = tl.p(t, 'out', { delay: 0.08, dur: 0.38 }, 'swift');
        const breath = win(t, beats.settle, Math.max(0.01, hold.end - beats.settle), 'drift');
        const drift = -breathe * breath;

        // Headline: lines rise out of their masks, and leave upwards.
        if (headline && headlineBounds) {
          g.movable('headline', headlineBounds, (g) => {
            g.group({ y: drift }, (g) => {
              lines.forEach((line, i) => {
                const p = tl.p(t, 'in', { delay: 0.12 + i * lineGap, dur: 0.75 }, energy.enter);
                // Staggered, and all out of their masks by the end of the exit.
                const out = tl.p(t, 'out', { delay: i * exitGap, dur: exitDur(i) }, 'exit');
                if (p <= 0 || out >= 1) return;
                g.clip(masks[i] as Rect, (g) =>
                  g.text(line, {
                    fill: fg,
                    x: headlineX,
                    y: headlineY + (1 - p) * lineRise - out * lineRise,
                  }),
                );
              });
            });
            g.editable('headline', headlineBounds);
          });
        }

        const opacity = appear * (1 - fadeOut);
        if (opacity <= 0) return;
        const y = (1 - shown) * rise + drift - gone * rise * 0.8;
        g.movable('card', cardRect, (g) => {
          g.group({ y, opacity }, (g) => {
            drawCard(g, t);
            // The cursor, above everything; it moves with the card.
            beats.path.at(t, cursorState);
            if (cursorState.x < frame.width + 3 * u) {
              drawCursor(g, props.cursor, cursorState.x, cursorState.y, {
                scale: cursorScale,
                press: cursorState.press,
              });
            }
          });
          const covered = toastShown(t);
          if (titleBounds && covered < 0.5) g.editable('title', titleBounds);
          g.editable('label', field.bounds);
          g.editable('value', field.box);
          if (row) g.editable('detail', row.rect);
          g.editable(buttonState.success > 0.5 ? 'done' : 'button', button.rect);
          if (covered >= 0.5) g.editable('success', toast.rect);
        });
      },
    };
  },
});
