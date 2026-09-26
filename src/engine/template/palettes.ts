/**
 * Palette library and brand palettes (docs/templates/00-foundations.md §5).
 * Templates reference roles only, never raw colors, so any palette works with any template.
 */

import {
  bestContrast,
  type Color,
  ensureContrast,
  fromOklch,
  mixOklch,
  parseHex,
  relativeLuminance,
  toOklch,
} from '../core/color';
import { clamp } from '../core/math';

export const PALETTE_ROLES = [
  'bg',
  'fg',
  'muted',
  'accent',
  'accent2',
  'accent3',
  'surface',
] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];
export type PaletteRoles = Readonly<Record<PaletteRole, Color>>;

export type Palette = {
  id: string;
  name: string;
  roles: PaletteRoles;
  /** True when the background is dark (luminance below mid-grey). */
  dark: boolean;
};

/** Minimum contrast against `bg` per role (text roles are WCAG AA, accent is AA-large/graphic). */
export const ROLE_MINIMUMS: Partial<Record<PaletteRole, number>> = {
  fg: 4.5,
  muted: 4.5,
  accent: 3,
};

type HexRoles = {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  accent2: string;
  surface: string;
  accent3?: string;
};

const LIBRARY_HEX = {
  paper: {
    name: 'Paper',
    bg: '#F5F4F0',
    fg: '#0B0B0C',
    muted: '#6B6B70',
    accent: '#1F38E8',
    accent2: '#0B0B0C',
    surface: '#E9E7E1',
  },
  ink: {
    name: 'Ink',
    bg: '#0B0B0C',
    fg: '#F5F4F0',
    muted: '#8E8E93',
    accent: '#FFD400',
    accent2: '#F5F4F0',
    surface: '#1C1C1F',
  },
  midnight: {
    name: 'Midnight',
    bg: '#070B1F',
    fg: '#EEF1FF',
    muted: '#8A93B8',
    accent: '#8FA6FF',
    accent2: '#FFB199',
    surface: '#141A36',
  },
  graphite: {
    name: 'Graphite',
    bg: '#121314',
    fg: '#ECEDEE',
    muted: '#7D8084',
    accent: '#3DDC97',
    accent2: '#ECEDEE',
    surface: '#1D1F21',
  },
  cobalt: {
    name: 'Cobalt',
    bg: '#1F38E8',
    fg: '#FFFFFF',
    muted: '#D3DAFF',
    accent: '#FFD23F',
    accent2: '#0B0B0C',
    surface: '#1A2FC4',
  },
  acid: {
    name: 'Acid',
    bg: '#D4FF3A',
    fg: '#0B0B0C',
    muted: '#4A5716',
    accent: '#0B0B0C',
    accent2: '#1F38E8',
    surface: '#C2EE26',
  },
  tangerine: {
    name: 'Tangerine',
    bg: '#FF6A1A',
    fg: '#120800',
    muted: '#4A1C02',
    accent: '#1B1464',
    accent2: '#FFFFFF',
    surface: '#FF8440',
  },
  blush: {
    name: 'Blush',
    bg: '#FFD8CF',
    fg: '#2A0F0A',
    muted: '#7A4A40',
    accent: '#D93A17',
    accent2: '#2A0F0A',
    surface: '#FFC6B9',
  },
  forest: {
    name: 'Forest',
    bg: '#0F2A1D',
    fg: '#EAF4E4',
    muted: '#8FB09C',
    accent: '#B7F36B',
    accent2: '#EAF4E4',
    surface: '#173726',
  },
  sand: {
    name: 'Sand',
    bg: '#EDE4D3',
    fg: '#2A2118',
    muted: '#6E604E',
    accent: '#B84E25',
    accent2: '#2F5D50',
    surface: '#E2D6BF',
  },
  swiss: {
    name: 'Swiss',
    bg: '#F2F0EB',
    fg: '#111111',
    muted: '#666666',
    accent: '#E3241B',
    accent2: '#111111',
    surface: '#E4E1DA',
  },
  bauhaus: {
    name: 'Bauhaus',
    bg: '#F3EEE3',
    fg: '#151515',
    muted: '#66625B',
    accent: '#E0301E',
    accent2: '#1F4FB8',
    surface: '#E7E0D0',
    accent3: '#F2B705',
  },
  candy: {
    name: 'Candy',
    bg: '#FF8FB8',
    fg: '#1C0710',
    muted: '#6B2340',
    accent: '#2A12B8',
    accent2: '#FFF15C',
    surface: '#FF7AA8',
    accent3: '#FFFFFF',
  },
  hazard: {
    name: 'Hazard',
    bg: '#FFD60A',
    fg: '#0B0B0C',
    muted: '#4F4200',
    accent: '#0B0B0C',
    accent2: '#E3241B',
    surface: '#F5C800',
  },
  amber: {
    name: 'Amber',
    bg: '#0A0A0A',
    fg: '#FFB000',
    muted: '#A87800',
    accent: '#FFB000',
    accent2: '#F5F4F0',
    surface: '#161616',
  },
  film: {
    name: 'Film',
    bg: '#0C0B0A',
    fg: '#F1E9DC',
    muted: '#8C8273',
    accent: '#E9B872',
    accent2: '#F1E9DC',
    surface: '#1A1816',
  },
  newsroom: {
    name: 'Newsroom',
    bg: '#0E1116',
    fg: '#FFFFFF',
    muted: '#A5ACB8',
    accent: '#E11D2E',
    accent2: '#FFFFFF',
    surface: '#151A22',
  },
  lilac: {
    name: 'Lilac',
    bg: '#DCD3FF',
    fg: '#160F33',
    muted: '#4F4780',
    accent: '#5B2EFF',
    accent2: '#160F33',
    surface: '#CFC3FF',
  },
  mint: {
    name: 'Mint',
    bg: '#DDF5EA',
    fg: '#0B2A1F',
    muted: '#446C5B',
    accent: '#0B8F58',
    accent2: '#0B2A1F',
    surface: '#CBEEDD',
  },
  'mono-light': {
    name: 'Mono Light',
    bg: '#FFFFFF',
    fg: '#000000',
    muted: '#6E6E6E',
    accent: '#000000',
    accent2: '#000000',
    surface: '#F2F2F2',
  },
  'mono-dark': {
    name: 'Mono Dark',
    bg: '#000000',
    fg: '#FFFFFF',
    muted: '#8A8A8A',
    accent: '#FFFFFF',
    accent2: '#FFFFFF',
    surface: '#151515',
  },
} as const satisfies Record<string, HexRoles & { name: string }>;

export type PaletteId = keyof typeof LIBRARY_HEX;
export const PALETTE_IDS = Object.keys(LIBRARY_HEX) as PaletteId[];

/** Below this luminance, white text contrasts more than black (the black/white crossover). */
const isDark = (bg: Color) => relativeLuminance(bg) < 0.179;

function fromHex(id: string, name: string, hex: HexRoles): Palette {
  const roles: PaletteRoles = {
    bg: parseHex(hex.bg),
    fg: parseHex(hex.fg),
    muted: parseHex(hex.muted),
    accent: parseHex(hex.accent),
    accent2: parseHex(hex.accent2),
    surface: parseHex(hex.surface),
    // accent3 defaults to surface unless the palette defines it (foundations §5).
    accent3: parseHex(hex.accent3 ?? hex.surface),
  };
  return { id, name, roles, dark: isDark(roles.bg) };
}

export const PALETTES: Readonly<Record<PaletteId, Palette>> = Object.fromEntries(
  PALETTE_IDS.map((id) => {
    const { name, ...hex } = LIBRARY_HEX[id];
    return [id, fromHex(id, name, hex)];
  }),
) as Record<PaletteId, Palette>;

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && value in LIBRARY_HEX;
}

// --- brand palettes -----------------------------------------------------------------------

export const BRAND_VARIANTS = ['light', 'dark', 'bold'] as const;
export type BrandVariant = (typeof BRAND_VARIANTS)[number];

const NEAR_BLACK = parseHex('#0B0B0C');
const WHITE = parseHex('#FFFFFF');

/**
 * Derives a palette from one brand color in OKLCH, then nudges lightness until the role
 * minimums pass (unless `exact`, which keeps the brand color untouched as the accent).
 */
export function deriveBrandPalette(brand: Color, variant: BrandVariant, exact = false): Palette {
  const { L, C, h } = toOklch(brand);
  const lch = (l: number, c: number, hue = h) => fromOklch({ L: l, C: c, h: hue });
  let bg: Color;
  let fg: Color;
  let surface: Color;
  let accent: Color;

  if (variant === 'light') {
    bg = lch(0.97, Math.min(C * 0.08, 0.02));
    fg = lch(0.18, Math.min(C * 0.2, 0.03));
    surface = lch(0.93, Math.min(C * 0.1, 0.025));
    accent = exact ? brand : ensureContrast(brand, bg, 3);
  } else if (variant === 'dark') {
    bg = lch(0.16, Math.min(C * 0.15, 0.03));
    fg = lch(0.96, Math.min(C * 0.05, 0.01));
    surface = lch(0.22, Math.min(C * 0.18, 0.035));
    accent = exact ? brand : ensureContrast(brand, bg, 3);
  } else {
    bg = brand;
    fg = bestContrast(bg, [WHITE, NEAR_BLACK]);
    surface = lch(clamp(L + (L > 0.5 ? -0.06 : 0.06), 0, 1), C);
    accent = fg;
  }

  fg = ensureContrast(fg, bg, 7);
  const muted = ensureContrast(mixOklch(fg, bg, 0.45), bg, 4.5);
  const accentLch = toOklch(accent);
  const accent2 = fromOklch({ L: accentLch.L, C: Math.min(C, 0.25) * 0.6, h: (h + 150) % 360 });

  const roles: PaletteRoles = { bg, fg, muted, accent, accent2, accent3: surface, surface };
  const label = variant[0]?.toUpperCase() + variant.slice(1);
  return { id: `brand-${variant}`, name: `Brand ${label}`, roles, dark: isDark(bg) };
}

// --- references (what a design stores) ------------------------------------------------------

export type PaletteRef =
  | { kind: 'library'; id: PaletteId }
  | { kind: 'brand'; color: string; variant: BrandVariant; exact?: boolean };

export function resolvePalette(ref: PaletteRef): Palette {
  if (ref.kind === 'library') return PALETTES[ref.id];
  return deriveBrandPalette(parseHex(ref.color), ref.variant, ref.exact ?? false);
}

/** Validates a stored palette reference, falling back to `fallback`. */
export function sanitizePaletteRef(value: unknown, fallback: PaletteRef): PaletteRef {
  if (typeof value !== 'object' || value === null) return fallback;
  const ref = value as Record<string, unknown>;
  if (ref.kind === 'library' && isPaletteId(ref.id)) return { kind: 'library', id: ref.id };
  if (
    ref.kind === 'brand' &&
    typeof ref.color === 'string' &&
    /^#?[0-9a-f]{6}$/i.test(ref.color) &&
    (BRAND_VARIANTS as readonly unknown[]).includes(ref.variant)
  ) {
    return {
      kind: 'brand',
      color: ref.color.startsWith('#') ? ref.color : `#${ref.color}`,
      variant: ref.variant as BrandVariant,
      exact: ref.exact === true,
    };
  }
  return fallback;
}
