/**
 * Click's scenarios: each is a small, believable product task — its card copy, the kind of
 * value typed (a live-formatted amount or plain text) and the detail row's leading visual.
 * The Send money copy is the controls' defaults; for another scenario, every text the user
 * hasn't edited shows that scenario's copy instead (edits always win).
 */

import type { IconName } from '@/engine';

export const SCENARIO_OPTIONS = [
  { value: 'send', label: 'Send money' },
  { value: 'signup', label: 'Sign up' },
  { value: 'generate', label: 'Generate' },
  { value: 'book', label: 'Book' },
  { value: 'custom', label: 'Custom' },
] as const;

export type ScenarioId = (typeof SCENARIO_OPTIONS)[number]['value'];

export type Copy = {
  headline: string;
  title: string;
  label: string;
  value: string;
  detail: string;
  button: string;
  done: string;
  success: string;
};

export type Scenario = {
  copy: Copy;
  /** The value is a written number, typed digit by digit and formatted live. */
  figure: boolean;
  /** Leading visual of the detail row: an initials avatar of the detail text, or an icon. */
  lead: 'avatar' | IconName | null;
  /** Trailing mark of the detail row. */
  trailing: 'chevron' | 'check';
};

/** The Send money copy: the controls' defaults (docs/templates/10-ui-motion.md §10.1). */
export const DEFAULT_COPY: Copy = {
  headline: 'Payments in one tap.',
  title: 'Send money',
  label: 'Amount',
  value: '€250.00',
  detail: 'Alex Novak',
  button: 'Send',
  done: 'Sent',
  success: 'Sent. Instantly.',
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  send: { copy: DEFAULT_COPY, figure: true, lead: 'avatar', trailing: 'chevron' },
  signup: {
    copy: {
      headline: 'Sign up in seconds.',
      title: 'Create your account',
      label: 'Work email',
      value: 'maya@halden.studio',
      detail: 'Remember this device',
      button: 'Create account',
      done: 'Account created',
      success: 'Welcome aboard, Maya.',
    },
    figure: false,
    lead: 'lock',
    trailing: 'check',
  },
  generate: {
    copy: {
      headline: 'Ideas, rendered.',
      title: 'New image',
      label: 'Prompt',
      value: 'A poster for a summer jazz night',
      detail: 'Style · Editorial',
      button: 'Generate',
      done: 'Ready',
      success: 'Four images ready.',
    },
    figure: false,
    lead: 'sparkle',
    trailing: 'chevron',
  },
  book: {
    copy: {
      headline: 'Booked before the coffee cools.',
      title: 'Book a table',
      label: 'Name',
      value: 'Jordan Ellis',
      detail: 'Fri 14 Nov · 19:30 · 2 guests',
      button: 'Book now',
      done: 'Booked',
      success: 'You’re booked. See you Friday.',
    },
    figure: false,
    lead: 'calendar',
    trailing: 'chevron',
  },
  custom: { copy: DEFAULT_COPY, figure: false, lead: null, trailing: 'chevron' },
};

/** The copy to show: the user's text where they edited it, else the scenario's. */
export function resolveCopy(scenario: ScenarioId, props: Copy): Copy {
  const preset = SCENARIOS[scenario].copy;
  const pick = (key: keyof Copy) => (props[key] !== DEFAULT_COPY[key] ? props[key] : preset[key]);
  return {
    headline: pick('headline'),
    title: pick('title'),
    label: pick('label'),
    value: pick('value'),
    detail: pick('detail'),
    button: pick('button'),
    done: pick('done'),
    success: pick('success'),
  };
}
