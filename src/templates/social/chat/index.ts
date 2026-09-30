/**
 * Chat — message thread story (docs/templates/03-social.md §3.2).
 *
 * The expensive detail: it behaves like a real phone. Bubbles group by sender — tighter spacing,
 * joined corners, one tail per group — and when a message joins a group the tail passes down to
 * it (the old tail morphs into a joined corner point by point). A received message is typed
 * first: the indicator pops in, its dots bounce, and it *becomes* the bubble — width and height
 * spring from the indicator to the message while the text fades in, so there is no cut between
 * "typing" and "said". Sent messages are typed into the composer and rise out of it. The thread
 * is anchored to the composer like a real messenger: every new slot opens on a spring and pushes
 * the conversation up, so the scroll overshoots and settles with the Energy's spring.
 */

import {
  CLEAN_END,
  type Color,
  c,
  caretOpacity,
  clamp01,
  createUiKit,
  type Draw,
  defineTemplate,
  type EaseName,
  ease,
  type Gradient,
  mixOklab,
  type PathCommand,
  type Rect,
  type SpringName,
  springProgress,
  type TextBlock,
  typedCount,
  typedText,
  typingSchedule,
  UI_FONT,
  unionRect,
  withAlpha,
} from '@/engine';
import {
  type BubbleShape,
  bubblePath,
  CHEVRON_LEFT,
  type Glyph,
  HEART,
  LAUGH,
  SEND_ARROW,
  THUMBS,
} from './bubble';
import {
  autoDuration,
  conversationLength,
  IN,
  LEAD,
  type Message,
  OUT,
  PACES,
  POP,
  PRE,
  parseMessages,
  planConversation,
  REACTION_AT,
  type Sender,
} from './script';

type ChatFormat = '9:16' | '4:5' | '1:1';

type Composition = {
  /** Message text size in u (spec: ≥ 4.2u). */
  text: number;
  /** Panel width as a share of the layout width (symmetric about the frame's axis). */
  width: number;
  /** Least panel height as a share of the layout height (the panel hugs short threads). */
  minHeight: number;
};

const COMPOSITIONS: Record<ChatFormat, Composition> = {
  '9:16': { text: 4.5, width: 1, minHeight: 0.62 },
  '4:5': { text: 4.3, width: 1, minHeight: 1 },
  '1:1': { text: 4.2, width: 0.86, minHeight: 1 },
};

// --- the messenger, in UI px (the kit's unit scales it so message text is `text` u) ---------
const TEXT = 17;
const LINE = 1.3;
const PANEL_RADIUS = 30;
const HEADER = 62;
const COMPOSER = 60;
/** Thread padding: sides, and above/below the messages. */
const PAD = 12;
const PAD_Y = 12;
/** Bubble: corner radius, joined-corner radius, padding. */
const RADIUS = 18;
const JOINED = 5;
const PAD_X = 13;
const PAD_T = 11.5;
const PAD_B = 12.5;
const TAIL_W = 6;
const TAIL_H = 12;
/** Gaps between groups and inside a group. */
const GROUP_GAP = 14;
const TIGHT_GAP = 3;
/** Widest bubble, as a share of the thread's width. */
const MAX_BUBBLE = 0.8;
/** Most lines one message may take (longer ones end with an ellipsis). */
const MAX_LINES = 7;
const INDICATOR_W = 62;
const INDICATOR_H = 36;
const DOT = 7.4;
const DOT_GAP = 11;
const BADGE = 30;
/** The badge overlaps its bubble's bottom corner: the thread makes this much room below it. */
const BADGE_ROOM = 17;

const REACTIONS: Record<'heart' | 'thumbs' | 'laugh', Glyph> = {
  heart: HEART,
  thumbs: THUMBS,
  laugh: LAUGH,
};

const DEFAULT_SCRIPT =
  'Them: Did you see the launch video?\nMe: Watching it right now\nMe: Wait. Who made this??\nThem: We did. In ten minutes.';
const DEFAULT_CONTACT = 'Maya Chen';

/**
 * The gallery's poster: the default thread with its last reply being typed — grouped bubbles,
 * the read receipt, the typing indicator and "typing…" in the header. Never later than 5.45 s,
 * which even a one-message chat (6 s) still shows before its exit.
 */
const POSTER = (() => {
  const messages = parseMessages(DEFAULT_SCRIPT, DEFAULT_CONTACT);
  const plan = planConversation(messages, 1, 1, conversationLength(messages, 1, 1));
  const last = plan.steps[plan.steps.length - 1];
  const at = LEAD + IN + PRE + (last ? last.start + 0.3 : 1);
  return Number(Math.min(5.45, at).toFixed(2));
})();

const win = (t: number, start: number, dur: number, curve: EaseName) =>
  ease[curve](dur <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / dur));

/** Draws a 24-unit glyph centered on (cx, cy) at `size` design units. */
function drawGlyph(
  g: Draw,
  glyph: Glyph,
  cx: number,
  cy: number,
  size: number,
  color: Color,
  options: { weight?: number; opacity?: number } = {},
): void {
  g.group(
    { x: cx - size / 2, y: cy - size / 2, scale: size / 24, opacity: options.opacity },
    (g) => {
      if (glyph.fill) g.path(glyph.fill, { fill: color, fillRule: 'evenodd' });
      if (glyph.stroke) {
        g.path(glyph.stroke, {
          stroke: { color, width: options.weight ?? 2.4, cap: 'round', join: 'round' },
        });
      }
    },
  );
}

type Bubble = {
  index: number;
  sender: Sender;
  block: TextBlock;
  /** Final size (design units). */
  w: number;
  h: number;
  /** Gap above it (design units). */
  gap: number;
  /** Joined to the bubble above (same sender). */
  joined: boolean;
  /** When its slot opens (indicator appears / sent) and when it lands. */
  start: number;
  land: number;
  /** When the next bubble of its group arrives (its tail passes on), if one does. */
  handover: number;
};

type Item =
  | { kind: 'stamp'; block: TextBlock; h: number; gap: number; insert: number }
  | { kind: 'receipt'; block: TextBlock; h: number; gap: number; insert: number }
  | { kind: 'bubble'; bubble: Bubble };

export default defineTemplate({
  id: 'chat',
  version: 1,
  meta: {
    name: 'Chat',
    tagline: 'Message thread story',
    category: 'social',
    tags: ['chat', 'messages', 'story', 'conversation', 'ui'],
    useCases: ['Story-time posts', 'Product conversations', 'Testimonials', 'App promos'],
  },
  formats: ['9:16', '4:5', '1:1'],
  structure: 'sequence',
  duration: { default: 'auto', min: 6, max: 20 },
  alpha: 'none',
  poster: POSTER,
  palettes: [
    { kind: 'library', id: 'cobalt' },
    { kind: 'library', id: 'tangerine' },
    { kind: 'library', id: 'mint' },
    { kind: 'library', id: 'lilac' },
    { kind: 'library', id: 'candy' },
    { kind: 'library', id: 'paper' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'midnight' },
  ],
  pairings: ['grotesk', 'editorial', 'soft', 'quirky', 'mono'],
  // The messenger is set in its pairing's text face; Inter stands in if that isn't loaded.
  fonts: [UI_FONT],
  controls: {
    messages: c.text({
      label: 'Messages',
      default: DEFAULT_SCRIPT,
      maxLength: 360,
      multiline: true,
      maxLines: 8,
      primary: true,
      hint: 'One message per line. Start with Me: for yours and Them: for theirs — a line without one keeps the last sender.',
    }),
    contact: c.text({ label: 'Contact name', default: DEFAULT_CONTACT, maxLength: 24 }),
    status: c.text({
      label: 'Status',
      default: 'Active now',
      maxLength: 24,
      optional: true,
      hint: 'Under the name; shows “typing…” while they type',
    }),
    avatar: c.image({
      label: 'Avatar',
      accept: 'portrait',
      default: { kind: 'placeholder', id: 'portrait-2' },
      optional: true,
      hint: 'Without a photo, the avatar shows the initials',
    }),
    theme: c.choice({
      label: 'Theme',
      default: 'light',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    }),
    timestamps: c.toggle({ label: 'Timestamps', default: true }),
    reaction: c.choice({
      label: 'Reaction',
      default: 'heart',
      hint: 'On the last message',
      options: [
        { value: 'none', label: 'None' },
        { value: 'heart', label: 'Heart' },
        { value: 'thumbs', label: 'Thumbs' },
        { value: 'laugh', label: 'Laugh' },
      ],
    }),
    pace: c.choice({
      label: 'Pace',
      group: 'motion',
      default: 'normal',
      options: [
        { value: 'chill', label: 'Chill' },
        { value: 'normal', label: 'Normal' },
        { value: 'hyper', label: 'Hyper' },
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
      id: 'dark-tangerine',
      name: 'Dark · Tangerine',
      palette: { kind: 'library', id: 'tangerine' },
      pairing: 'grotesk',
      values: { theme: 'dark' },
    },
    {
      id: 'light-mint',
      name: 'Light · Mint',
      palette: { kind: 'library', id: 'mint' },
      pairing: 'grotesk',
      values: { theme: 'light' },
    },
  ],
  timing: ({ props, energy }) => ({
    lead: LEAD,
    in: IN,
    out: OUT,
    tail: CLEAN_END,
    auto: autoDuration(
      parseMessages(props.messages, props.contact),
      PACES[props.pace],
      energy.time,
      CLEAN_END,
    ),
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const e = energy.time;
    const comp = COMPOSITIONS[frame.format as ChatFormat] ?? COMPOSITIONS['9:16'];
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    // Centered on the frame's axis, even where the social zone isn't symmetric.
    const half = Math.min(frame.cx - area.x, area.x + area.w - frame.cx);
    const panelW = Math.min(half * 2, area.w) * comp.width;
    const unit = (comp.text * u) / TEXT;
    const ui = createUiKit({
      text,
      palette,
      mode: props.theme,
      unit,
      font: pairing.text.font,
      fallbackFont: UI_FONT,
    });
    const { theme } = ui;
    const px = (v: number) => v * unit;
    const messages: Message[] = parseMessages(props.messages, props.contact);
    const spring: SpringName = energy.spring;
    const S = (dt: number) => (dt <= 0 ? 0 : springProgress(dt, spring));

    // --- colors -----------------------------------------------------------------------------
    const received = mixOklab(theme.surface, theme.text, theme.dark ? 0.13 : 0.075);
    const sent = theme.accent;
    const onSent = theme.onAccent;

    // --- thread layout (design units) --------------------------------------------------------
    const innerW = panelW - 2 * px(PAD);
    const bubbleMax = (innerW - px(TAIL_W)) * MAX_BUBBLE;
    const textMax = bubbleMax - 2 * px(PAD_X);
    const blocks = messages.map((message) =>
      ui.text(message.text, 'body', {
        size: TEXT,
        weight: 450,
        tracking: -0.006,
        maxWidth: textMax,
        maxLines: MAX_LINES,
        lineHeight: LINE,
      }),
    );

    // The conversation's clock.
    const threadStart = timeline.sections.in.end + PRE * e;
    const available = Math.max(0.5, timeline.sections.out.start - threadStart);
    const plan = planConversation(messages, PACES[props.pace], e, available);
    const steps = plan.steps.map((step) => ({
      ...step,
      start: threadStart + step.start,
      land: threadStart + step.land,
    }));
    const lastStep = steps[steps.length - 1];
    const reactionOn = props.reaction !== 'none' && lastStep !== undefined;
    const reactionAt = lastStep
      ? Math.max(
          lastStep.land + 0.2,
          Math.min(lastStep.land + REACTION_AT, timeline.sections.out.start - 0.45),
        )
      : Number.POSITIVE_INFINITY;

    const bubbles: Bubble[] = messages.map((message, i) => {
      const block = blocks[i] as TextBlock;
      const step = steps[i] as (typeof steps)[number];
      const previous = messages[i - 1];
      const joined = previous?.sender === message.sender;
      const h = px(PAD_T + PAD_B) + block.height;
      const w = Math.max(block.width + 2 * px(PAD_X), h);
      const next = messages[i + 1];
      const nextStep = steps[i + 1];
      const handover =
        next?.sender === message.sender && nextStep
          ? next.sender === 'them'
            ? nextStep.start
            : nextStep.land
          : Number.POSITIVE_INFINITY;
      return {
        index: i,
        sender: message.sender,
        block,
        w,
        h,
        gap: i === 0 ? 0 : px(joined ? TIGHT_GAP : GROUP_GAP),
        joined,
        start: step.sender === 'them' ? step.start : step.land,
        land: step.land,
        handover,
      };
    });

    const items: Item[] = [];
    const firstStart = bubbles[0]?.start ?? threadStart;
    const stamp = props.timestamps
      ? ui.text('Today 6:24 PM', 'caption', { size: 12, weight: 520, tracking: 0.005 })
      : null;
    if (stamp) {
      items.push({ kind: 'stamp', block: stamp, h: stamp.height, gap: 0, insert: firstStart });
    }
    // The read receipt sits under your last message, once they have read it (when they start
    // typing their answer) — or a moment after it was sent, if it ends the thread.
    let lastMine = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.sender === 'me') {
        lastMine = i;
        break;
      }
    }
    const receipt =
      lastMine >= 0
        ? ui.text(props.timestamps ? 'Read 6:25 PM' : 'Read', 'caption', {
            size: 11.5,
            weight: 500,
          })
        : null;
    bubbles.forEach((bubble, i) => {
      const item: Item = { kind: 'bubble', bubble };
      if (i === 0 && stamp) bubble.gap = px(10);
      items.push(item);
      if (i === lastMine && receipt) {
        const next = bubbles[i + 1];
        items.push({
          kind: 'receipt',
          block: receipt,
          h: receipt.height,
          gap: px(5),
          insert: next ? next.start : bubble.land + 0.8,
        });
      }
    });
    const reactionRoom = reactionOn ? px(BADGE_ROOM) : 0;
    const contentH =
      items.reduce(
        (sum, item) =>
          sum + (item.kind === 'bubble' ? item.bubble.gap + item.bubble.h : item.gap + item.h),
        0,
      ) + reactionRoom;

    // --- the panel: as tall as the thread needs, within the layout area ----------------------
    // In vertical formats the composer may reach below the social zone (platform UI covers only
    // chrome there); the thread — and so the newest bubble — always ends above it.
    const chrome = px(HEADER + COMPOSER + 2 * PAD_Y);
    const title = frame.safe.title;
    const floor = frame.vertical
      ? Math.min(area.y + area.h + px(COMPOSER), title.y + title.h)
      : area.y + area.h;
    const maxH = floor - area.y;
    const panelH = Math.min(maxH, Math.max(maxH * comp.minHeight, chrome + contentH));
    const panel: Rect = {
      x: frame.cx - panelW / 2,
      y: area.y + (maxH - panelH) * 0.5,
      w: panelW,
      h: panelH,
    };
    const card = ui.card(panel, { radius: PANEL_RADIUS, elevation: 2 });
    const header: Rect = { x: panel.x, y: panel.y, w: panel.w, h: px(HEADER) };
    const composerRect: Rect = {
      x: panel.x,
      y: panel.y + panel.h - px(COMPOSER),
      w: panel.w,
      h: px(COMPOSER),
    };
    const viewport: Rect = {
      x: panel.x,
      y: header.y + header.h,
      w: panel.w,
      h: composerRect.y - (header.y + header.h),
    };
    const anchor = composerRect.y - px(PAD_Y);
    const left = panel.x + px(PAD);
    const right = panel.x + panel.w - px(PAD);
    const hair = px(1);

    // --- header -----------------------------------------------------------------------------
    const headerCy = header.y + header.h / 2 + px(1);
    const chevron = { cx: panel.x + px(22), size: px(24) };
    const avatarD = px(38);
    const avatarCx = panel.x + px(40) + avatarD / 2;
    const avatarRect: Rect = {
      x: avatarCx - avatarD / 2,
      y: headerCy - avatarD / 2,
      w: avatarD,
      h: avatarD,
    };
    const photo = ctx.graphic('avatar');
    const focal = ctx.focal('avatar');
    const contactName = props.contact.trim() || ' ';
    const initialsAvatar = photo
      ? null
      : ui.avatar({ cx: avatarCx, cy: headerCy, size: 38, name: contactName });
    const namesX = avatarRect.x + avatarD + px(11);
    const namesMax = right - namesX;
    const name = ui.text(contactName, 'title', {
      size: 16.5,
      weight: 620,
      tracking: -0.012,
      maxWidth: namesMax,
      minSize: 13,
    });
    const statusText = props.status.trim();
    const status = statusText
      ? ui.text(statusText, 'caption', { size: 12.5, weight: 460, maxWidth: namesMax })
      : null;
    const typing = ui.text('typing…', 'caption', { size: 12.5, weight: 460, maxWidth: namesMax });
    const statusGap = px(6);
    const namesH = name.capHeight + (status ? statusGap + status.capHeight : 0);
    const nameY = headerCy - namesH / 2;
    const statusY = nameY + name.capHeight + statusGap;
    const nameBounds: Rect = {
      x: namesX + name.ink.x,
      y: nameY + name.ink.y,
      w: name.ink.w,
      h: name.ink.h,
    };
    const statusBounds: Rect | null = status
      ? { x: namesX + status.ink.x, y: statusY + status.ink.y, w: status.ink.w, h: status.ink.h }
      : null;
    const presence = statusText.length > 0;

    // --- composer ---------------------------------------------------------------------------
    const pill: Rect = {
      x: panel.x + px(PAD),
      y: composerRect.y + (composerRect.h - px(38)) / 2 - px(2),
      w: panel.w - 2 * px(PAD),
      h: px(38),
    };
    const sendD = px(30);
    const sendCx = pill.x + pill.w - px(4) - sendD / 2;
    const sendCy = pill.y + pill.h / 2;
    const placeholder = ui.text('Message', 'body', { size: 16, weight: 430 });
    const fieldX = pill.x + px(14);
    const fieldW = sendCx - sendD / 2 - px(8) - fieldX;
    const fieldClip: Rect = { x: fieldX - px(2), y: pill.y, w: fieldW + px(4), h: pill.h };
    const fieldY = pill.y + pill.h / 2 - placeholder.capHeight / 2;
    const caretH = px(20);
    // Each message you send is typed here first: one line, revealed key by key.
    type Draft = {
      line: TextBlock;
      /** Visible glyphs after k graphemes typed, and the caret's x. */
      glyphs: Int32Array;
      caret: Float64Array;
      keys: Float64Array;
      start: number;
      land: number;
    };
    const drafts: (Draft | null)[] = messages.map((message, i) => {
      const step = steps[i];
      if (message.sender !== 'me' || !step) return null;
      const typed = typedText(message.text);
      const line = ui.text(message.text, 'body', { size: 16, weight: 430 });
      const glyphs = line.lines[0]?.glyphs ?? [];
      const count = typed.keys.length;
      const visible = new Int32Array(count + 1);
      const caret = new Float64Array(count + 1);
      let graphemes = 0;
      let shown = 0;
      let x = 0;
      for (let k = 0; k <= count; k++) {
        // Glyphs whose cluster lies within the first k graphemes.
        while (shown < glyphs.length) {
          const glyph = glyphs[shown];
          if (!glyph) break;
          const size = [...glyph.text].length || 1;
          if (graphemes + size > k) break;
          graphemes += size;
          x = glyph.x + glyph.advance;
          shown++;
        }
        visible[k] = shown;
        caret[k] = x;
      }
      const keys = typingSchedule(typed.keys, ctx.rng(`keys-${i}`), {
        cps: 14,
        fit: Math.max(0.05, step.typing),
      });
      return { line, glyphs: visible, caret, keys, start: step.start, land: step.land };
    });
    const firstDraft = drafts.find((draft) => draft !== null) ?? null;
    let visibleGlyphs = 0;
    const SHOWN = {};
    const revealGlyph = (glyph: { index: number }) => (glyph.index < visibleGlyphs ? SHOWN : null);

    // --- motion parameters --------------------------------------------------------------------
    const rise = ctx.travel(4 * u);
    const lift = ctx.travel(3 * u);
    const drift = ctx.travel(0.5 * u);
    const calm = energy.id === 'calm';
    const punchy = energy.id === 'punchy';
    const dotLift = px(calm ? 2.2 : punchy ? 3.4 : 2.8);
    const dotPeriod = calm ? 1 : punchy ? 0.72 : 0.84;
    const popFrom = calm ? 0.78 : punchy ? 0.35 : 0.55;
    const popCurve: EaseName = calm ? 'glide' : 'pop';
    const badgePeak = calm ? 1 : punchy ? 1.3 : 1.2;
    const springProgressOf = (dt: number) => (dt <= 0 ? 0 : springProgress(dt, 'lively'));
    const tops = new Float64Array(items.length);
    const bottoms = new Float64Array(items.length);
    const clip: Rect = { ...viewport };
    const shape: BubbleShape = {
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      side: 'left',
      radius: px(RADIUS),
      top: 0,
      bottom: px(JOINED),
      tail: 1,
      tailW: px(TAIL_W),
      tailH: px(TAIL_H),
    };

    // Each item's slot (height, and the gap above it) opens on the Energy's spring.
    const slotH = new Float64Array(items.length);
    const slotGap = new Float64Array(items.length);
    const lastBubble = items.findIndex(
      (item) => item.kind === 'bubble' && item.bubble.index === messages.length - 1,
    );
    const layoutSlots = (t: number) => {
      items.forEach((item, k) => {
        if (item.kind !== 'bubble') {
          const p = S(t - item.insert);
          slotH[k] = item.h * p;
          slotGap[k] = item.gap * p;
          return;
        }
        const b = item.bubble;
        // The reaction's room opens below the last bubble as the badge pops.
        const extra = k === lastBubble && reactionOn ? reactionRoom * S(t - reactionAt) : 0;
        if (b.sender === 'me') {
          const p = S(t - b.land);
          slotH[k] = b.h * p + extra;
          slotGap[k] = b.gap * p;
          return;
        }
        const opened = S(t - b.start);
        slotH[k] = px(INDICATOR_H) * opened + (b.h - px(INDICATOR_H)) * S(t - b.land) + extra;
        slotGap[k] = b.gap * opened;
      });
      // Anchored to the composer: walk up from the newest item.
      let y = anchor;
      for (let k = items.length - 1; k >= 0; k--) {
        bottoms[k] = y;
        tops[k] = y - (slotH[k] as number);
        y = (tops[k] as number) - (slotGap[k] as number);
      }
    };

    // Bubble outlines in local coordinates (top-left at 0, 0): the settled shapes are built
    // once (the drawer caches their paths); only a morphing bubble builds its outline per frame.
    const outline = (b: Bubble, w: number, h: number, tail: number): PathCommand[] => {
      shape.side = b.sender === 'them' ? 'left' : 'right';
      shape.top = b.joined ? px(JOINED) : 0;
      shape.w = w;
      shape.h = h;
      shape.tail = tail;
      return bubblePath(shape);
    };
    const settled = bubbles.map((b) => ({
      tailed: outline(b, b.w, b.h, 1),
      joined: outline(b, b.w, b.h, 0),
      indicator: outline(b, px(INDICATOR_W), px(INDICATOR_H), 1),
    }));
    const tailOf = (b: Bubble, t: number) =>
      b.handover === Number.POSITIVE_INFINITY ? 1 : clamp01(1 - S(t - b.handover));
    const pathOf = (b: Bubble, w: number, h: number, tail: number): PathCommand[] => {
      const cached = settled[b.index];
      if (cached && w === b.w && h === b.h && tail >= 1) return cached.tailed;
      if (cached && w === b.w && h === b.h && tail <= 0) return cached.joined;
      if (cached && w === px(INDICATOR_W) && h === px(INDICATOR_H) && tail >= 1) {
        return cached.indicator;
      }
      return outline(b, w, h, tail);
    };

    const drawBubble = (g: Draw, b: Bubble, top: number, t: number) => {
      const tail = tailOf(b, t);
      if (b.sender === 'them') {
        // Typing indicator → bubble: width and height spring from the indicator to the message.
        const x0 = left + px(TAIL_W);
        const morph = t > b.land ? S(t - b.land) : 0;
        const grow = t > b.land + 0.02 ? S(t - b.land - 0.02) : 0;
        const settledNow = morph >= 1 - 1e-4 && grow >= 1 - 1e-4;
        const w = settledNow ? b.w : px(INDICATOR_W) + (b.w - px(INDICATOR_W)) * morph;
        const h = settledNow ? b.h : px(INDICATOR_H) + (b.h - px(INDICATOR_H)) * grow;
        const path = pathOf(b, w, h, tail);
        const popped = win(t, b.start, POP * e, popCurve);
        const scale = popFrom + (1 - popFrom) * popped;
        const appear = win(t, b.start, 0.08, 'swift');
        g.group({ x: x0, y: top, scale, originX: 0, originY: h, opacity: appear }, (g) => {
          g.path(path, { fill: received });
          // The dots bounce while they type, and fade as the bubble takes their place.
          const dots = 1 - win(t, b.land, 0.12, 'swift');
          if (dots > 0) {
            const cx = px(INDICATOR_W) / 2;
            const cy = h - px(INDICATOR_H) / 2;
            for (let i = 0; i < 3; i++) {
              const phase = (t - b.start) / dotPeriod - i * 0.16;
              const wave = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
              g.circle(cx + (i - 1) * px(DOT_GAP), cy - dotLift * wave, px(DOT) / 2, {
                fill: theme.muted,
                opacity: dots * (0.42 + 0.58 * wave),
              });
            }
          }
          const shown = win(t, b.land + 0.05, 0.24, 'swift');
          if (shown > 0) {
            // Set where it will rest; the growing bubble uncovers it.
            const at = { fill: theme.text, x: px(PAD_X), y: h - b.h + px(PAD_T), opacity: shown };
            if (settledNow) g.text(b.block, at);
            else g.clip({ path }, (g) => g.text(b.block, at));
          }
        });
        return;
      }
      // Sent: rises out of the composer (its slot opening) with a small extra lift and scale.
      const x1 = right - px(TAIL_W);
      const p = S(t - b.land);
      const y = top + (1 - p) * lift;
      const scale = 0.92 + 0.08 * p;
      g.group({ x: x1 - b.w, y, scale, originX: b.w, originY: b.h }, (g) => {
        g.path(pathOf(b, b.w, b.h, tail), { fill: sent });
        g.text(b.block, { fill: onSent, x: px(PAD_X), y: px(PAD_T) });
      });
    };

    const drawBadge = (g: Draw, b: Bubble, top: number, t: number) => {
      const glyph = REACTIONS[props.reaction as keyof typeof REACTIONS];
      if (!glyph) return;
      if (t <= reactionAt) return;
      // Pops in, peaks (1.2× at Balanced) and settles.
      const up = win(t, reactionAt, 0.12, 'glide');
      const scale =
        up < 1
          ? badgePeak * up
          : badgePeak + (1 - badgePeak) * win(t, reactionAt + 0.12, 0.3, calm ? 'glide' : 'pop');
      // On the bubble's bottom edge, at the corner away from the tail.
      const them = b.sender === 'them';
      const edge = them ? left + px(TAIL_W) + b.w : right - px(TAIL_W) - b.w;
      const cx = edge + (them ? -px(14) : px(14));
      const cy = top + b.h + px(10);
      const r = px(BADGE) / 2;
      g.group({ scale, originX: cx, originY: cy }, (g) => {
        ui.shadow(r * 2, r * 2, r, 1).draw(g, cx - r, cy - r);
        g.circle(cx, cy, r + px(2.5), { fill: theme.surface });
        g.circle(cx, cy, r, { fill: theme.raised });
        g.circle(cx, cy, r - hair / 2, { stroke: { color: theme.border, width: hair } });
        const color = props.reaction === 'heart' ? theme.danger : theme.accentInk;
        drawGlyph(g, glyph, cx, cy + px(0.5), px(18), color);
      });
    };

    // --- drawing ----------------------------------------------------------------------------------
    const fadeH = px(14);
    const fadeRect: Rect = { x: viewport.x, y: viewport.y, w: viewport.w, h: fadeH };
    const fade: Gradient = {
      kind: 'linear',
      x0: 0,
      y0: viewport.y,
      x1: 0,
      y1: viewport.y + fadeH,
      stops: [
        { offset: 0, color: theme.surface },
        { offset: 1, color: withAlpha(theme.surface, 0) },
      ],
    };
    const drawThread = (g: Draw, t: number) => {
      g.clip(clip, (g) => {
        items.forEach((item, k) => {
          const top = tops[k] as number;
          const bottom = bottoms[k] as number;
          if (bottom <= viewport.y) return;
          if (item.kind === 'stamp') {
            const shown = S(t - item.insert);
            if (shown <= 0) return;
            g.text(item.block, {
              fill: theme.muted,
              x: frame.cx - item.block.width / 2,
              y: top,
              opacity: clamp01(shown),
            });
            return;
          }
          if (item.kind === 'receipt') {
            const shown = win(t, item.insert + 0.04, 0.22, 'swift');
            if (shown <= 0) return;
            g.text(item.block, {
              fill: theme.muted,
              x: right - px(TAIL_W) - px(2) - item.block.width,
              y: top + px(1),
              opacity: shown,
            });
            return;
          }
          const b = item.bubble;
          if (t < b.start) return;
          drawBubble(g, b, top, t);
        });
        // The last message's reaction, above everything in the thread.
        const last = items[lastBubble];
        if (reactionOn && t > reactionAt && last?.kind === 'bubble') {
          drawBadge(g, last.bubble, tops[lastBubble] as number, t);
        }
        // Content scrolling under the header fades out just below it.
        if ((tops[0] ?? anchor) < viewport.y + fadeH) g.rect(fadeRect, { fill: fade });
      });
    };

    const drawHeader = (g: Draw, t: number, slide: number) => {
      const content = (g: Draw) =>
        g.group({ y: -(1 - slide) * header.h * 0.8, opacity: slide }, (g) => {
          drawGlyph(g, CHEVRON_LEFT, chevron.cx, headerCy, chevron.size, theme.accentInk, {
            weight: 2.6,
          });
          if (photo) {
            g.clip({ rect: avatarRect, radius: avatarD / 2 }, (g) =>
              g.graphic(photo, avatarRect, { fit: 'cover', focal }),
            );
          } else {
            initialsAvatar?.draw(g);
          }
          if (presence) {
            const dx = avatarCx + avatarD * 0.36;
            const dy = headerCy + avatarD * 0.36;
            g.circle(dx, dy, px(6.5), { fill: theme.surface });
            g.circle(dx, dy, px(4.5), { fill: theme.success });
          }
          g.text(name, { fill: theme.text, x: namesX, y: nameY });
          if (status) {
            // "typing…" replaces the status while they type.
            let typingNow = 0;
            for (const b of bubbles) {
              if (b.sender !== 'them') continue;
              const on = win(t, b.start, 0.12, 'swift') * (1 - win(t, b.land, 0.12, 'swift'));
              typingNow = Math.max(typingNow, on);
            }
            if (typingNow < 1) {
              g.text(status, { fill: theme.muted, x: namesX, y: statusY, opacity: 1 - typingNow });
            }
            if (typingNow > 0) {
              g.text(typing, { fill: theme.accentInk, x: namesX, y: statusY, opacity: typingNow });
            }
          }
        });
      // Clipped only while it slides in.
      if (slide < 1) g.clip(header, content);
      else content(g);
      g.rect(
        { x: header.x, y: header.y + header.h - hair, w: header.w, h: hair },
        { fill: theme.border, opacity: slide },
      );
    };

    const drawComposer = (g: Draw, t: number, slide: number) => {
      // Which draft is being typed (or was just sent)?
      let draft: Draft | null = null;
      for (const d of drafts) if (d && t >= d.start) draft = d;
      const typedKeys = draft && t < draft.land ? typedCount(draft.keys, t - draft.start) : 0;
      const sentAt = draft && t >= draft.land ? draft.land : Number.NEGATIVE_INFINITY;
      const lastKey =
        draft && typedKeys > 0 ? draft.start + (draft.keys[typedKeys - 1] ?? 0) : sentAt;
      const focused = firstDraft !== null && t >= firstDraft.start;
      g.rect(
        { x: composerRect.x, y: composerRect.y, w: composerRect.w, h: hair },
        { fill: theme.border, opacity: slide },
      );
      const drawField = (g: Draw) => {
        g.roundRect(pill, pill.h / 2, { fill: theme.sunken });
        g.roundRect(
          { x: pill.x + hair / 2, y: pill.y + hair / 2, w: pill.w - hair, h: pill.h - hair },
          (pill.h - hair) / 2,
          { stroke: { color: theme.border, width: hair } },
        );
        const active = draft && typedKeys > 0 ? 1 : 0;
        let caretX = fieldX - px(1.5);
        if (draft && typedKeys > 0) {
          const k = Math.min(typedKeys, draft.glyphs.length - 1);
          visibleGlyphs = draft.glyphs[k] ?? 0;
          const width = draft.caret[k] ?? 0;
          const shift = Math.max(0, width - fieldW + px(4));
          caretX = fieldX + width - shift;
          const lineBlock = draft.line;
          g.clip(fieldClip, (g) =>
            g.text(lineBlock, {
              fill: theme.text,
              x: fieldX - shift,
              y: fieldY,
              glyph: revealGlyph,
            }),
          );
        } else {
          // The placeholder returns a moment after sending.
          const back = Number.isFinite(sentAt) ? win(t, sentAt + 0.05, 0.2, 'swift') : 1;
          g.text(placeholder, { fill: theme.subtle, x: fieldX, y: fieldY, opacity: back });
        }
        if (focused) {
          const blink = caretOpacity(t, Number.isFinite(lastKey) ? lastKey : firstDraft.start, {
            idle: 0.5,
          });
          if (blink > 0) {
            g.rect(
              { x: caretX, y: sendCy - caretH / 2, w: px(1.8), h: caretH },
              { fill: theme.accentInk, opacity: blink },
            );
          }
        }
        // Send: lights up with the first key, presses when the message goes.
        const press = Number.isFinite(sentAt) ? 1 - 0.12 * (1 - win(t, sentAt, 0.28, 'glide')) : 1;
        const lit = Math.max(
          active,
          Number.isFinite(sentAt) ? 1 - win(t, sentAt + 0.1, 0.2, 'swift') : 0,
        );
        g.group({ scale: press, originX: sendCx, originY: sendCy }, (g) => {
          g.circle(sendCx, sendCy, sendD / 2, { fill: theme.borderStrong });
          if (lit > 0) g.circle(sendCx, sendCy, sendD / 2, { fill: theme.accent, opacity: lit });
          drawGlyph(
            g,
            SEND_ARROW,
            sendCx,
            sendCy,
            px(19),
            lit > 0.5 ? theme.onAccent : theme.surface,
            {
              weight: 2.6,
            },
          );
        });
      };
      const content = (g: Draw) =>
        g.group({ y: (1 - slide) * composerRect.h * 0.6, opacity: slide }, drawField);
      // Clipped only while it slides in.
      if (slide < 1) g.clip(composerRect, content);
      else content(g);
    };

    // The panel and its shadow, wherever the entrance and exit move it.
    const layerBounds: Rect = {
      x: panel.x - px(60),
      y: panel.y - px(40) - lift,
      w: panel.w + px(120),
      h: panel.h + px(100) + lift + rise,
    };

    // Editor regions: the messages that are on screen, clipped to the thread.
    const visibleRect = (r: Rect): Rect | null => {
      const y0 = Math.max(r.y, viewport.y);
      const y1 = Math.min(r.y + r.h, viewport.y + viewport.h);
      return y1 - y0 > px(8) ? { x: r.x, y: y0, w: r.w, h: y1 - y0 } : null;
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(palette.roles.bg, { background: true });

        // Punchy pops the phone in on a lively spring; Calm and Balanced glide it up.
        const shown = punchy
          ? springProgressOf(t - tl.sections.in.start)
          : tl.p(t, 'in', { dur: 0.55 }, energy.enter);
        const appear = tl.p(t, 'in', { dur: 0.3 }, 'drift');
        const headerIn = tl.p(t, 'in', { delay: 0.12, dur: 0.48 }, 'glide');
        const composerIn = tl.p(t, 'in', { delay: 0.18, dur: 0.48 }, 'glide');
        const gone = tl.p(t, 'out', { dur: 0.42 }, 'exit');
        const fade = tl.p(t, 'out', { delay: 0.1, dur: 0.32 }, 'swift');
        const opacity = appear * (1 - fade);
        if (opacity <= 0) return;
        const breath = tl.p(t, 'hold', {}, 'drift');
        const y = (1 - shown) * rise - gone * lift - drift * breath;
        const scale = (0.965 + 0.035 * shown) * (1 - 0.025 * gone);

        layoutSlots(t);
        const transform = { y, scale, originX: frame.cx, originY: panel.y + panel.h / 2 };
        const chat = (g: Draw) => {
          card.draw(g);
          drawThread(g, t);
          drawHeader(g, t, headerIn);
          drawComposer(g, t, composerIn);
        };
        g.movable('chat', panel, (g) => {
          // While it fades, the panel fades as one image (no layer once it's opaque).
          if (opacity < 1) {
            g.layer({ opacity, bounds: layerBounds }, (g) => g.group(transform, chat));
          } else {
            g.group(transform, chat);
          }
          g.group(transform, (g) => {
            g.editable('contact', nameBounds);
            if (statusBounds) g.editable('status', statusBounds);
            g.editable('avatar', avatarRect);
            let thread: Rect | null = null;
            for (let k = 0; k < items.length; k++) {
              const item = items[k];
              if (item?.kind !== 'bubble' || t < item.bubble.start) continue;
              const b = item.bubble;
              const top = tops[k] as number;
              const x = b.sender === 'them' ? left + px(TAIL_W) : right - px(TAIL_W) - b.w;
              const r = visibleRect({ x, y: top, w: b.w, h: (bottoms[k] as number) - top });
              if (r) thread = thread ? unionRect(thread, r) : r;
            }
            if (thread) g.editable('messages', thread);
          });
        });
      },
    };
  },
});
