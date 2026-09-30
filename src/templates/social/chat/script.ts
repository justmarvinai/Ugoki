/**
 * Chat's script and timing (docs/templates/03-social.md §3.2).
 *
 * Messages come from one multiline text control, one message per line. A line starting with
 * `Me:` is sent by you, `Them:` (or the contact's name, e.g. `Maya:`) by the other person; a line
 * without a prefix keeps the previous line's sender, so a burst of messages needs only one
 * prefix. The first message defaults to Them.
 *
 * Timing: received messages type (the indicator bounces 0.5 s + 0.02 s per character, at most
 * 1.6 s) and then morph into their bubble; sent messages type into the composer and are sent. The
 * next message starts after a reading gap that grows with the message's length. Pace scales the
 * typing and the reading; Energy the transitions.
 */

import { clamp } from '@/engine';

export type Sender = 'me' | 'them';
export type Message = { readonly sender: Sender; readonly text: string };

export const PACES = { chill: 1.3, normal: 1, hyper: 0.75 } as const;
export type Pace = keyof typeof PACES;

/** Clean frames before the panel enters (seconds). */
export const LEAD = 0.1;
/** Panel entrance and exit (Balanced seconds, scaled by Energy). */
export const IN = 0.6;
export const OUT = 0.45;
/** From the panel's arrival to the first message (Balanced seconds). */
export const PRE = 0.15;
/** The typing indicator pops in this long before its dots start (Balanced seconds). */
export const POP = 0.15;
/** A beat between the last keystroke and pressing send. */
const SEND = 0.14;
/** The end: at least this long on the finished thread (spec: 1.5 s hold). */
const END_HOLD = 1.5;
/** When the reaction pops, after the last message lands. */
export const REACTION_AT = 0.5;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const characters = (text: string) => [...text].length;

/** The script's messages, with senders resolved (see the module comment). */
export function parseMessages(script: string, contact: string): Message[] {
  const name = contact.trim().replace(/\s+/g, ' ');
  const first = name.split(' ')[0] ?? '';
  const aliases = [...new Set([name, first])]
    .filter((alias) => alias.length > 0)
    .map(escapeRegExp)
    .join('|');
  const prefix = new RegExp(`^(me|them${aliases ? `|${aliases}` : ''})\\s*:\\s*`, 'iu');
  const messages: Message[] = [];
  let sender: Sender = 'them';
  for (const raw of script.split('\n')) {
    let line = raw.trim();
    const match = prefix.exec(line);
    if (match) {
      sender = (match[1] ?? '').toLowerCase() === 'me' ? 'me' : 'them';
      line = line.slice(match[0].length).trim();
    }
    if (line) messages.push({ sender, text: line });
  }
  return messages;
}

/** One message on the clock (seconds from the conversation's start). */
export type Step = {
  readonly sender: Sender;
  /** The typing indicator appears (them) or the composer starts typing (me). */
  readonly start: number;
  /** The indicator morphs into the bubble (them) or the bubble is sent (me). */
  readonly land: number;
  /** Composer: seconds from `start` to the last keystroke (me). */
  readonly typing: number;
};

export type Plan = {
  readonly steps: readonly Step[];
  /** From the first message's start to the end of the final hold. */
  readonly length: number;
};

type Natural = {
  /** Typing (and the indicator's pop, the send beat) of each message. */
  activity: number[];
  /** Keystrokes' share of a sent message's activity (the rest is the send beat). */
  typing: number[];
  /** Reading gap after each message (the last one's is the final hold). */
  gaps: number[];
};

function natural(messages: readonly Message[], pace: number, time: number): Natural {
  const activity: number[] = [];
  const typing: number[] = [];
  const gaps: number[] = [];
  messages.forEach((message, i) => {
    const n = characters(message.text);
    if (message.sender === 'them') {
      activity.push(POP * time + Math.min(0.5 + 0.02 * n, 1.6) * pace);
      typing.push(0);
    } else {
      const keys = clamp(0.2 + 0.024 * n, 0.35, 1.1) * pace;
      activity.push(keys + SEND);
      typing.push(keys);
    }
    const next = messages[i + 1];
    if (next) {
      // Read while the next message is typed; a burst from one sender follows quicker.
      const gap = clamp(0.15 + 0.016 * n, 0.35, 1) * pace;
      gaps.push(next.sender === message.sender ? gap * 0.6 : gap);
    } else {
      gaps.push(Math.max(END_HOLD, 0.6 + 0.035 * n) * pace);
    }
  });
  return { activity, typing, gaps };
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** The conversation's natural length (Auto duration), from its start to the end of the hold. */
export function conversationLength(
  messages: readonly Message[],
  pace: number,
  time: number,
): number {
  if (messages.length === 0) return END_HOLD;
  const { activity, gaps } = natural(messages, pace, time);
  return sum(activity) + sum(gaps);
}

/** Auto duration: the entrance, the conversation at its natural pace, the exit. */
export function autoDuration(
  messages: readonly Message[],
  pace: number,
  time: number,
  tail: number,
): number {
  return LEAD + (IN + PRE) * time + conversationLength(messages, pace, time) + OUT * time + tail;
}

/**
 * The conversation fitted into `length` seconds. At Auto it keeps its natural pace. A longer
 * fixed duration slows the reading between messages (up to 3×) and the typing (up to 1.5×) and
 * gives the rest to the final hold; a shorter one shortens the gaps first (down to 40%), then the
 * typing (down to 30%), then the final hold (down to 0.8 s), and only then everything together.
 */
export function planConversation(
  messages: readonly Message[],
  pace: number,
  time: number,
  length: number,
): Plan {
  if (messages.length === 0) return { steps: [], length };
  const { activity, typing, gaps } = natural(messages, pace, time);
  // The stretchable part of each activity: the dots bouncing, the keys typed.
  const typed = messages.map((message, i) =>
    message.sender === 'them' ? (activity[i] ?? 0) - POP * time : (typing[i] ?? 0),
  );
  const active = sum(activity);
  const reading = sum(gaps);
  const extra = length - active - reading;
  let lengths = activity;
  let holds = gaps;
  let keys = 1;
  if (extra > 1e-9) {
    const between = sum(gaps.slice(0, -1));
    const r = between > 0 ? Math.min(3, 1 + (extra * 0.6) / between) : 1;
    const left = extra - (r - 1) * between;
    const slowed = sum(typed);
    keys = slowed > 0 ? Math.min(1.5, 1 + (left * 0.25) / slowed) : 1;
    lengths = activity.map((value, i) => value + (typed[i] ?? 0) * (keys - 1));
    holds = gaps.map((value, i) => (i < gaps.length - 1 ? value * r : value));
    const last = holds.length - 1;
    holds[last] = (holds[last] ?? 0) + Math.max(0, length - sum(lengths) - sum(holds));
  } else if (extra < -1e-9) {
    // Shorter: the reading between messages goes first, then the typing, then the final hold.
    const between = sum(gaps.slice(0, -1));
    const final = gaps[gaps.length - 1] ?? 0;
    const r = between > 0 ? clamp((length - active - final) / between, 0.4, 1) : 1;
    keys = clamp((length - r * between - final) / active, 0.3, 1);
    const hold = clamp(length - keys * active - r * between, Math.min(final, 0.8), final);
    lengths = activity.map((value) => value * keys);
    holds = gaps.map((value, i) => (i < gaps.length - 1 ? value * r : hold));
  }
  // Whatever still doesn't fit is scaled as one.
  const planned = sum(lengths) + sum(holds);
  const k = planned > length ? length / planned : 1;
  const steps: Step[] = [];
  let cursor = 0;
  messages.forEach((message, i) => {
    const start = cursor;
    const land = start + (lengths[i] ?? 0) * k;
    steps.push({ sender: message.sender, start, land, typing: (typing[i] ?? 0) * keys * k });
    cursor = land + (holds[i] ?? 0) * k;
  });
  return { steps, length: Math.max(length, cursor) };
}
