/**
 * Font pairings (docs/templates/00-foundations.md §6). Users pick pairings, never raw families.
 * A pairing is only offered when all its fonts exist in the generated font manifest
 * (scripts/fonts.py); since 0.3.0 every pairing's fonts are built.
 */

import manifest from '../text/font-manifest.json';

export type FontId = string;

export type FontRole = {
  /** Font manifest id for the upright style. */
  font: FontId;
  /** Font manifest id used for italic spans, if the family has one. */
  italic?: FontId;
  /** Default `wght` (or the static weight). */
  weight: number;
  /** Default `wdth` for variable-width families. */
  width?: number;
  /** Tracking in em (e.g. -0.03 = −3%). */
  tracking: number;
  /** Default line height as a multiple of font size. */
  lineHeight: number;
  /** Extra OpenType features, e.g. ['ss01']. */
  features?: readonly string[];
};

export type Pairing = {
  id: PairingId;
  name: string;
  personality: string;
  display: FontRole;
  text: FontRole;
};

const PAIRING_DEFS = {
  grotesk: {
    name: 'Grotesk',
    personality: 'Confident, neutral, bold — the house style',
    display: { font: 'mona-sans', weight: 700, width: 100, tracking: -0.03, lineHeight: 0.92 },
    text: { font: 'mona-sans', weight: 450, width: 100, tracking: 0, lineHeight: 1.3 },
  },
  editorial: {
    name: 'Editorial',
    personality: 'Magazine, documentary, luxury',
    display: {
      font: 'instrument-serif',
      italic: 'instrument-serif-italic',
      weight: 400,
      tracking: -0.01,
      lineHeight: 0.98,
    },
    text: { font: 'inter', weight: 450, tracking: 0, lineHeight: 1.35 },
  },
  poster: {
    name: 'Poster',
    personality: 'Loud, condensed, social',
    display: { font: 'anton', weight: 400, tracking: 0.01, lineHeight: 0.9 },
    text: { font: 'archivo', weight: 500, width: 100, tracking: 0, lineHeight: 1.3 },
  },
  technical: {
    name: 'Technical',
    personality: 'Tech, product, data',
    display: { font: 'hubot-sans', weight: 700, width: 100, tracking: -0.02, lineHeight: 0.95 },
    text: { font: 'jetbrains-mono', weight: 450, tracking: 0, lineHeight: 1.4 },
  },
  soft: {
    name: 'Soft',
    personality: 'Warm, friendly, lifestyle',
    display: {
      font: 'fraunces',
      italic: 'fraunces-italic',
      weight: 600,
      tracking: -0.02,
      lineHeight: 0.95,
    },
    text: { font: 'instrument-sans', weight: 450, tracking: 0, lineHeight: 1.35 },
  },
  wide: {
    name: 'Wide',
    personality: 'Playful, modern, youth',
    display: { font: 'unbounded', weight: 700, tracking: -0.02, lineHeight: 0.95 },
    text: { font: 'inter', weight: 450, tracking: 0, lineHeight: 1.35 },
  },
  classic: {
    name: 'Classic',
    personality: 'Timeless, corporate-elegant',
    display: {
      font: 'dm-serif-display',
      italic: 'dm-serif-display-italic',
      weight: 400,
      tracking: -0.01,
      lineHeight: 1,
    },
    text: { font: 'inter', weight: 450, tracking: 0, lineHeight: 1.35 },
  },
  sport: {
    name: 'Sport',
    personality: 'Athletic, industrial, news',
    display: { font: 'big-shoulders', weight: 800, tracking: 0.01, lineHeight: 0.9 },
    text: { font: 'archivo', weight: 500, width: 100, tracking: 0, lineHeight: 1.3 },
  },
  studio: {
    name: 'Studio',
    personality: 'Creative studio, art',
    display: { font: 'syne', weight: 700, tracking: -0.02, lineHeight: 0.95 },
    text: { font: 'instrument-sans', weight: 450, tracking: 0, lineHeight: 1.35 },
  },
  quirky: {
    name: 'Quirky',
    personality: 'Indie, characterful',
    display: { font: 'bricolage-grotesque', weight: 700, tracking: -0.03, lineHeight: 0.92 },
    text: { font: 'bricolage-grotesque', weight: 450, tracking: 0, lineHeight: 1.3 },
  },
  mono: {
    name: 'Mono',
    personality: 'Terminal, code, minimal',
    display: { font: 'jetbrains-mono', weight: 700, tracking: -0.01, lineHeight: 1 },
    text: { font: 'jetbrains-mono', weight: 450, tracking: 0, lineHeight: 1.4 },
  },
} as const satisfies Record<string, Omit<Pairing, 'id'>>;

export type PairingId = keyof typeof PAIRING_DEFS;
export const PAIRING_IDS = Object.keys(PAIRING_DEFS) as PairingId[];

export const PAIRINGS: Readonly<Record<PairingId, Pairing>> = Object.fromEntries(
  PAIRING_IDS.map((id) => [id, { id, ...PAIRING_DEFS[id] }]),
) as Record<PairingId, Pairing>;

const AVAILABLE_FONTS = new Set(Object.keys(manifest.fonts));

export function isFontAvailable(font: FontId): boolean {
  return AVAILABLE_FONTS.has(font);
}

/** True when every font the pairing needs is built into the manifest. */
export function isPairingAvailable(id: PairingId): boolean {
  const { display, text } = PAIRINGS[id];
  return [display.font, display.italic, text.font, text.italic]
    .filter((font): font is string => font !== undefined)
    .every(isFontAvailable);
}

export function isPairingId(value: unknown): value is PairingId {
  return typeof value === 'string' && value in PAIRING_DEFS;
}

/** Font ids a pairing needs (for preloading before a scene is built). */
export function pairingFonts(id: PairingId): FontId[] {
  const { display, text } = PAIRINGS[id];
  return [...new Set([display.font, display.italic, text.font, text.italic])].filter(
    (font): font is string => font !== undefined,
  );
}
