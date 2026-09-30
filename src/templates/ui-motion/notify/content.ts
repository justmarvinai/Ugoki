/**
 * Notify's content: notifications written one per line ("App | Title | Message | Time") and
 * the glyph each app's icon gets from what it's called.
 */

import { type IconName, initials } from '@/engine';

export type Note = { app: string; title: string; message: string; time: string };

export const DEFAULT_NOTES = [
  'Halden Pay | Payment received | €1,200.00 from Studio North',
  'Orders | New order #4096 | 2 items · ships today',
  'Insights | Milestone | You just passed 10k followers',
].join('\n');

/** Most notifications a stack shows. */
export const MAX_NOTES = 6;

/**
 * One notification per non-empty line: "App | Title | Message | Time" (the time is optional,
 * "now" by default). Two fields are an app and a title; one field is a title.
 */
export function parseNotes(value: string): Note[] {
  const notes: Note[] = [];
  for (const line of value.split('\n')) {
    const fields = line.split('|').map((f) => f.trim());
    if (fields.every((f) => f === '')) continue;
    const [a = '', b = '', c = '', d = ''] = fields;
    const note =
      fields.length === 1
        ? { app: '', title: a, message: '', time: '' }
        : fields.length === 2
          ? { app: a, title: b, message: '', time: '' }
          : { app: a, title: b, message: c, time: d };
    notes.push({ ...note, time: note.time || 'now' });
    if (notes.length === MAX_NOTES) break;
  }
  return notes;
}

/** Keywords → the glyph an app's icon carries (checked against its name, then its title). */
const GLYPHS: readonly [RegExp, IconName][] = [
  [/\b(pay|bank|wallet|money|cash|finance|card|invoice|payment)/i, 'wallet'],
  [/\b(order|shop|store|cart|deliver|ship|package|parcel)/i, 'bag'],
  [/\b(milestone|award|achiev|trophy|badge|record)/i, 'award'],
  [/\b(insight|analytic|stat|report|growth|metric|trend)/i, 'trendUp'],
  [/\b(mail|inbox|newsletter)/i, 'mail'],
  [/\b(message|chat|dm|reply|comment)/i, 'chat'],
  [/\b(calendar|meeting|event|remind|schedule|booking)/i, 'calendar'],
  [/\b(photo|camera|gallery|image)/i, 'image'],
  [/\b(music|podcast|play|listen|radio)/i, 'play'],
  [/\b(video|stream|live|film|cinema)/i, 'film'],
  [/\b(weather|sun|forecast)/i, 'sun'],
  [/\b(fit|health|run|workout|sleep|heart)/i, 'heart'],
  [/\b(travel|flight|trip|ride|map|taxi|hotel)/i, 'pin'],
  [/\b(security|login|sign.?in|code|password|verify)/i, 'lock'],
  [/\b(follow|friend|social|team|community)/i, 'users'],
  [/\b(alarm|clock|timer)/i, 'clock'],
  [/\b(review|rating|star)/i, 'star'],
  [/\b(news|article|read|doc)/i, 'doc'],
  [/\b(update|download|install)/i, 'download'],
  [/\b(ai|assistant|smart|magic)/i, 'sparkle'],
];

/** A glyph for an app (by its name, then its notification's title), or null for initials. */
export function glyphFor(note: Note): IconName | null {
  for (const text of [note.app, note.title]) {
    for (const [pattern, glyph] of GLYPHS) if (pattern.test(text)) return glyph;
  }
  return null;
}

/** Initials for an app without a glyph (one letter for one word). */
export function appInitials(note: Note): string {
  return initials(note.app || note.title) || '·';
}
