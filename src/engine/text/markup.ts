/**
 * Emphasis markup: `*word*` marks emphasized spans (docs/templates, e.g. Punch, Quote).
 * `\*` is a literal asterisk; an unmatched `*` stays literal.
 */

export type Span = { text: string; emphasis: boolean };

export function parseEmphasis(input: string): Span[] {
  const spans: Span[] = [];
  let current = '';
  let emphasis = false;
  let openIndex = -1;
  const openText: string[] = [];

  const flush = () => {
    if (current) spans.push({ text: current, emphasis });
    current = '';
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string;
    if (ch === '\\' && input[i + 1] === '*') {
      current += '*';
      i++;
      continue;
    }
    if (ch === '*') {
      if (!emphasis) {
        // Only open when a closing star exists later in the same paragraph.
        const close = input.indexOf('*', i + 1);
        const newline = input.indexOf('\n', i + 1);
        if (close === -1 || (newline !== -1 && newline < close)) {
          current += '*';
          continue;
        }
        flush();
        emphasis = true;
        openIndex = spans.length;
        openText.push('*');
      } else {
        flush();
        emphasis = false;
        openIndex = -1;
      }
      continue;
    }
    current += ch;
  }
  flush();
  if (emphasis && openIndex >= 0) {
    // Unterminated emphasis: restore the star and treat the rest as plain text.
    for (let k = openIndex; k < spans.length; k++) {
      const span = spans[k];
      if (span) spans[k] = { text: (k === openIndex ? '*' : '') + span.text, emphasis: false };
    }
  }
  return mergeSpans(spans);
}

function mergeSpans(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && last.emphasis === span.emphasis) last.text += span.text;
    else if (span.text) out.push({ ...span });
  }
  return out;
}

/** Text without markup. */
export function stripEmphasis(input: string): string {
  return parseEmphasis(input)
    .map((span) => span.text)
    .join('');
}
