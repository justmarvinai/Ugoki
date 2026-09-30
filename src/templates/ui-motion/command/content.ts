/**
 * Command's content: results written one per line, each with an icon picked from what it says.
 */

import type { IconName } from '@/engine';

export const MAX_RESULTS = 6;

/** Results: one per non-empty line (at most six). */
export function parseResults(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_RESULTS);
}

const ICONS: readonly [RegExp, IconName][] = [
  [/\b(template|layout|design|theme)/i, 'layout'],
  [/\b(colou?r|brand|palette|style)/i, 'droplet'],
  [/\b(export|render|mp4|4k|download|save)/i, 'download'],
  [/\b(video|film|clip|record|movie)/i, 'film'],
  [/\b(share|send|publish|post)/i, 'share'],
  [/\b(image|photo|picture|thumbnail)/i, 'image'],
  [/\b(music|audio|sound|voice|podcast)/i, 'play'],
  [/\b(search|find|look)/i, 'search'],
  [/\b(setting|preference|option)/i, 'sliders'],
  [/\b(doc|write|text|note|summar|draft)/i, 'doc'],
  [/\b(schedule|calendar|meeting|remind)/i, 'calendar'],
  [/\b(team|invite|member|people|user)/i, 'users'],
  [/\b(chart|report|analytic|stat|data)/i, 'bars'],
  [/\b(mail|email|inbox)/i, 'mail'],
  [/\b(lock|secure|password|private)/i, 'lock'],
  [/\b(ask|ai|generate|magic|idea|suggest)/i, 'sparkle'],
];

/** An icon for a result, by keyword; results without one cycle through a neutral set. */
export function resultIcon(label: string, index: number): IconName {
  for (const [pattern, icon] of ICONS) if (pattern.test(label)) return icon;
  const neutral: IconName[] = ['sparkle', 'arrowRight', 'doc', 'grid'];
  return neutral[index % neutral.length] as IconName;
}
