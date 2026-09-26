/**
 * Control schemas (docs/06-engine.md §4, ADR-008). A template declares its controls once; the
 * inspector UI, validation, defaults, share links and Looks are all derived from the schema.
 * Every value that reaches a template has passed `sanitizeValue`, so templates never see
 * malformed input (e.g. from an edited share link).
 */

export type ControlGroup = 'content' | 'style' | 'motion' | 'layout';

type BaseControl = {
  label: string;
  group: ControlGroup;
  hint?: string;
  /** Hidden behind "More" in the inspector. */
  advanced?: boolean;
};

export type TextControl = BaseControl & {
  kind: 'text';
  default: string;
  maxLength: number;
  multiline?: boolean;
  maxLines?: number;
  /** Shown as optional in the inspector; may be empty. */
  optional?: boolean;
  /** The template's main text: gallery personalization writes into it. */
  primary?: boolean;
  placeholder?: string;
  /** Supports `*emphasis*` markup. */
  emphasis?: boolean;
};

export type ChoiceControl<V extends string = string> = BaseControl & {
  kind: 'choice';
  default: V;
  options: readonly { value: V; label: string }[];
  display?: 'segmented' | 'select';
};

export type ToggleControl = BaseControl & {
  kind: 'toggle';
  default: boolean;
};

export type NumberControl = BaseControl & {
  kind: 'number';
  default: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

export type Control = TextControl | ChoiceControl | ToggleControl | NumberControl;
export type ControlSchema = Record<string, Control>;

export type ControlValue<C> = C extends TextControl
  ? string
  : C extends ChoiceControl<infer V>
    ? V
    : C extends ToggleControl
      ? boolean
      : C extends NumberControl
        ? number
        : never;

export type Props<S extends ControlSchema> = { readonly [K in keyof S]: ControlValue<S[K]> };

type WithOptionalGroup<T extends BaseControl> = Omit<T, 'kind' | 'group'> & {
  group?: ControlGroup;
};

/** Control builders used in template definitions. */
export const c = {
  text: (options: WithOptionalGroup<TextControl>): TextControl => ({
    kind: 'text',
    group: 'content',
    ...options,
  }),
  choice: <const V extends string>(
    options: WithOptionalGroup<ChoiceControl<V>>,
  ): ChoiceControl<V> => ({
    kind: 'choice',
    group: 'style',
    ...options,
  }),
  toggle: (options: WithOptionalGroup<ToggleControl>): ToggleControl => ({
    kind: 'toggle',
    group: 'style',
    ...options,
  }),
  number: (options: WithOptionalGroup<NumberControl>): NumberControl => ({
    kind: 'number',
    group: 'motion',
    ...options,
  }),
};

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function truncateGraphemes(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = '';
  let count = 0;
  for (const { segment } of graphemes.segment(text)) {
    if (count >= max) break;
    out += segment;
    count++;
  }
  return out;
}

/**
 * Removes C0/C1 control characters (except line feed) and bidi overrides/isolates, which could
 * reorder or hide text in exported videos.
 */
function stripUnsafe(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const control = (code < 0x20 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f);
    const bidi = (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
    if (!control && !bidi) out += text[i];
  }
  return out;
}

export function sanitizeText(control: TextControl, value: unknown): string {
  if (typeof value !== 'string') return control.default;
  let text = stripUnsafe(value.replace(/\r\n?/g, '\n'));
  if (!control.multiline) {
    text = text.replace(/\n+/g, ' ');
  } else if (control.maxLines !== undefined) {
    text = text.split('\n').slice(0, control.maxLines).join('\n');
  }
  return truncateGraphemes(text, control.maxLength);
}

export function sanitizeValue(control: Control, value: unknown): unknown {
  switch (control.kind) {
    case 'text':
      return sanitizeText(control, value);
    case 'choice':
      return control.options.some((option) => option.value === value) ? value : control.default;
    case 'toggle':
      return typeof value === 'boolean' ? value : control.default;
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return control.default;
      const clamped = Math.min(control.max, Math.max(control.min, value));
      const steps = Math.round((clamped - control.min) / control.step);
      return Number((control.min + steps * control.step).toFixed(6));
    }
  }
}

export function defaultProps<S extends ControlSchema>(schema: S): Props<S> {
  const props: Record<string, unknown> = {};
  for (const [key, control] of Object.entries(schema)) props[key] = control.default;
  return props as Props<S>;
}

/** Validates arbitrary input against a schema; unknown keys are dropped, invalid values reset. */
export function resolveProps<S extends ControlSchema>(
  schema: S,
  input: Readonly<Record<string, unknown>> | undefined,
): Props<S> {
  const props: Record<string, unknown> = {};
  for (const [key, control] of Object.entries(schema)) {
    props[key] = input && key in input ? sanitizeValue(control, input[key]) : control.default;
  }
  return props as Props<S>;
}

/** Key of the schema's primary text control, if any (gallery personalization target). */
export function primaryTextKey(schema: ControlSchema): string | null {
  for (const [key, control] of Object.entries(schema)) {
    if (control.kind === 'text' && control.primary) return key;
  }
  return null;
}
