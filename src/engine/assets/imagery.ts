/**
 * Imagery helpers for templates (docs/templates/00-foundations.md §7): generated avatars — never
 * photos of real faces.
 */

/**
 * Initials for an avatar: the first letter of the first and last word ("Élodie Marchand" → "ÉM",
 * "Kai" → "K"), uppercased per locale-neutral rules; empty for blank names.
 */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /\p{L}|\p{N}/u.test(word));
  if (words.length === 0) return '';
  const first = (word: string) => [...word.replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '';
  const letters = words.length === 1 ? first(words[0]!) : first(words[0]!) + first(words.at(-1)!);
  return letters.toUpperCase();
}
