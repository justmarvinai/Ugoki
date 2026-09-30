/**
 * The lines Stretch sets: the user's lines, re-flowed to what the format holds. Landscape takes
 * one or two lines (adjacent lines merge, shortest pair first); tall formats give long lines of
 * several words a line of their own (split at the space nearest the middle), up to 4 in 9:16.
 */

const length = (text: string) => [...text].length;

export function planLines(source: string, maxLines: number, splitAbove: number): string[] {
  const lines = source
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  while (lines.length > maxLines) {
    let best = 0;
    let shortest = Number.POSITIVE_INFINITY;
    for (let i = 0; i + 1 < lines.length; i++) {
      const combined = length(lines[i] ?? '') + length(lines[i + 1] ?? '');
      if (combined < shortest) {
        shortest = combined;
        best = i;
      }
    }
    lines.splice(best, 2, `${lines[best]} ${lines[best + 1]}`);
  }

  while (lines.length < maxLines) {
    let pick = -1;
    let longest = splitAbove;
    lines.forEach((line, i) => {
      if (line.includes(' ') && length(line) > longest) {
        pick = i;
        longest = length(line);
      }
    });
    if (pick < 0) break;
    const line = lines[pick] ?? '';
    const middle = line.length / 2;
    let at = -1;
    for (let k = 0; k < line.length; k++) {
      if (line[k] === ' ' && (at < 0 || Math.abs(k - middle) < Math.abs(at - middle))) at = k;
    }
    lines.splice(pick, 1, line.slice(0, at), line.slice(at + 1));
  }
  return lines;
}
