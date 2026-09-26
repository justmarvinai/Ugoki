/** Stress-text presets for the Lab (docs/templates/00-foundations.md §9, quality bar item 2). */

export const STRESS_PRESETS = [
  { id: 'word', label: '1 word', text: 'Begin' },
  { id: 'max', label: 'Max length', text: null },
  { id: 'diacritics', label: 'Diacritics', text: 'Ærøskøbing, Łódź\nÖlçü & Straße' },
  { id: 'numbers', label: 'Numbers', text: '2026 → 1,234,567\n+89.5%' },
  { id: 'lines', label: 'Hard lines', text: 'One\nTwo\nThree' },
] as const;

const FILLER =
  'The quick brown fox jumps over the lazy dog while seven bold zebras quietly watch the scene unfold';

/** Text of exactly `maxLength` graphemes, breaking only at spaces where possible. */
export function maxLengthText(maxLength: number): string {
  let text = '';
  while (text.length < maxLength) text += (text ? ' ' : '') + FILLER;
  return text.slice(0, maxLength).trimEnd().padEnd(maxLength, '.');
}
