/**
 * A minimal, DOM-free XML parser for SVG import (docs/06-engine.md §8). It runs in workers and in
 * Node, never executes anything and never expands custom entities (no DTD processing), so a
 * hostile file can't trigger entity bombs. Hard limits bound the work a file can cause.
 */

export type XmlElement = {
  /** Local name, lowercase, without a namespace prefix (`svg:path` → `path`). */
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  /** Concatenated character data of this element (text and CDATA), e.g. `<style>` rules. */
  readonly text: string;
};

export type XmlLimits = {
  /** Characters of input. */
  maxLength: number;
  maxElements: number;
  maxDepth: number;
};

export const DEFAULT_XML_LIMITS: XmlLimits = {
  maxLength: 4_000_000,
  maxElements: 50_000,
  maxDepth: 64,
};

export class XmlError extends Error {}

type MutableElement = {
  name: string;
  attributes: Map<string, string>;
  children: MutableElement[];
  text: string;
};

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decodes the five predefined entities and numeric character references; others stay as-is. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
      if ((code >= 0xd800 && code <= 0xdfff) || code === 0) return '';
      return String.fromCodePoint(code);
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

const localName = (name: string) => {
  const colon = name.indexOf(':');
  return (colon >= 0 ? name.slice(colon + 1) : name).toLowerCase();
};

const NAME_CHAR = /[A-Za-z0-9_:.-]/;
const isSpace = (c: string | undefined) => c === ' ' || c === '\n' || c === '\t' || c === '\r';

/** Parses an XML document and returns its root element. */
export function parseXml(source: string, limits: XmlLimits = DEFAULT_XML_LIMITS): XmlElement {
  if (source.length > limits.maxLength) throw new XmlError('The file is too large');
  const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const stack: MutableElement[] = [];
  let root: MutableElement | null = null;
  let count = 0;
  let i = 0;

  const fail = (message: string): never => {
    throw new XmlError(`${message} (at ${i})`);
  };

  const skipUntil = (terminator: string) => {
    const end = input.indexOf(terminator, i);
    if (end < 0) fail(`Unterminated markup, expected "${terminator}"`);
    i = end + terminator.length;
  };

  const readName = (): string => {
    const start = i;
    while (i < input.length && NAME_CHAR.test(input[i] as string)) i++;
    if (i === start) fail('Expected a name');
    return input.slice(start, i);
  };

  const skipSpace = () => {
    while (isSpace(input[i])) i++;
  };

  while (i < input.length) {
    const lt = input.indexOf('<', i);
    const textEnd = lt < 0 ? input.length : lt;
    if (textEnd > i) {
      const current = stack[stack.length - 1];
      if (current) current.text += decodeEntities(input.slice(i, textEnd));
      i = textEnd;
    }
    if (lt < 0) break;
    i = lt;

    if (input.startsWith('<!--', i)) {
      i += 4;
      skipUntil('-->');
      continue;
    }
    if (input.startsWith('<![CDATA[', i)) {
      const start = i + 9;
      i = start;
      skipUntil(']]>');
      const current = stack[stack.length - 1];
      if (current) current.text += input.slice(start, i - 3);
      continue;
    }
    if (input.startsWith('<?', i)) {
      i += 2;
      skipUntil('?>');
      continue;
    }
    if (input.startsWith('<!', i)) {
      // DOCTYPE (possibly with an internal subset): skipped, never interpreted.
      i += 2;
      let depth = 0;
      while (i < input.length) {
        const c = input[i++];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      continue;
    }
    if (input[i + 1] === '/') {
      i += 2;
      const name = localName(readName());
      skipSpace();
      if (input[i] !== '>') fail('Malformed closing tag');
      i++;
      const open = stack.pop();
      if (!open || open.name !== name) fail(`Mismatched closing tag </${name}>`);
      continue;
    }

    // Start tag.
    i++;
    const element: MutableElement = {
      name: localName(readName()),
      attributes: new Map(),
      children: [],
      text: '',
    };
    if (++count > limits.maxElements) fail('Too many elements');
    let selfClosing = false;
    for (;;) {
      skipSpace();
      const c = input[i];
      if (c === undefined) fail('Unterminated start tag');
      if (c === '>') {
        i++;
        break;
      }
      if (c === '/' && input[i + 1] === '>') {
        i += 2;
        selfClosing = true;
        break;
      }
      const rawName = readName();
      skipSpace();
      let value = '';
      if (input[i] === '=') {
        i++;
        skipSpace();
        const quote = input[i];
        if (quote === '"' || quote === "'") {
          const end = input.indexOf(quote, i + 1);
          if (end < 0) fail('Unterminated attribute value');
          value = input.slice(i + 1, end);
          i = end + 1;
        } else {
          // Unquoted value (HTML-style): up to whitespace or the tag end.
          const start = i;
          while (i < input.length && !isSpace(input[i]) && input[i] !== '>' && input[i] !== '/')
            i++;
          value = input.slice(start, i);
        }
      }
      // Namespaced attributes keep their prefix except `xlink:` (href) — `xml:space` etc. are
      // harmless and unused.
      const lower = rawName.toLowerCase();
      const name = lower.startsWith('xlink:') ? lower.slice(6) : lower;
      if (!element.attributes.has(name)) element.attributes.set(name, decodeEntities(value));
    }

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(element);
    else if (!root) root = element;
    else fail('More than one root element');
    if (!selfClosing) {
      if (stack.length >= limits.maxDepth) fail('Elements are nested too deeply');
      stack.push(element);
    }
  }

  if (stack.length > 0) throw new XmlError(`Unclosed element <${stack[stack.length - 1]?.name}>`);
  if (!root) throw new XmlError('The file has no root element');
  return root;
}
