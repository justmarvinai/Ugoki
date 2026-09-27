import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex, toHex } from '../core/color';
import { createRng } from '../core/rng';
import { ENERGIES } from '../timeline/energy';
import { createTimeline, readingTime } from '../timeline/timeline';
import { c, defaultProps, primaryTextKey, resolveProps, sanitizeText } from './controls';
import { defineTemplate } from './define';
import { createFrame, FORMAT_IDS, outputSize } from './formats';
import { isPairingAvailable, PAIRING_IDS, pairingFonts } from './pairings';
import {
  BRAND_VARIANTS,
  deriveBrandPalette,
  PALETTE_IDS,
  PALETTES,
  ROLE_MINIMUMS,
  resolvePalette,
  sanitizePaletteRef,
} from './palettes';
import { initialState, sanitizeState } from './state';

describe('formats', () => {
  it('uses a 1080-unit short side and u = 10.8', () => {
    for (const id of FORMAT_IDS) {
      const frame = createFrame(id);
      expect(Math.min(frame.width, frame.height)).toBe(1080);
      expect(frame.u).toBeCloseTo(10.8);
    }
    expect(createFrame('4:5').height).toBe(1350);
  });

  it('keeps the social zone inside the title-safe area for vertical formats', () => {
    const { safe } = createFrame('9:16');
    expect(safe.social.y).toBeCloseTo(1920 * 0.12);
    expect(safe.social.y + safe.social.h).toBeCloseTo(1920 * 0.78);
    expect(safe.social.x + safe.social.w).toBeCloseTo(1080 * 0.88);
  });

  it('produces even output sizes for every format and resolution', () => {
    for (const id of FORMAT_IDS) {
      for (const short of [720, 1080, 1440, 2160]) {
        const { width, height } = outputSize(id, short);
        expect(width % 2).toBe(0);
        expect(height % 2).toBe(0);
        expect(Math.min(width, height)).toBe(short);
      }
    }
    expect(outputSize('16:9', 2160)).toEqual({ width: 3840, height: 2160 });
  });
});

describe('controls', () => {
  const schema = {
    headline: c.text({
      label: 'Headline',
      default: 'Hello\nWorld',
      maxLength: 12,
      multiline: true,
      maxLines: 2,
      primary: true,
    }),
    eyebrow: c.text({ label: 'Eyebrow', default: 'Chapter 01', maxLength: 24 }),
    align: c.choice({
      label: 'Alignment',
      default: 'left',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
      ],
    }),
    rule: c.toggle({ label: 'Rule', default: true }),
    amount: c.number({ label: 'Amount', default: 0.5, min: 0, max: 1, step: 0.1 }),
  };

  it('derives defaults and the primary text control', () => {
    expect(defaultProps(schema)).toEqual({
      headline: 'Hello\nWorld',
      eyebrow: 'Chapter 01',
      align: 'left',
      rule: true,
      amount: 0.5,
    });
    expect(primaryTextKey(schema)).toBe('headline');
  });

  it('sanitizes hostile or malformed input', () => {
    const props = resolveProps(schema, {
      headline: 'one\r\ntwo\nthree\nfour',
      eyebrow: 42,
      align: 'justify',
      rule: 'yes',
      amount: 7.77,
      extra: 'dropped',
    });
    expect(props).toEqual({
      headline: 'one\ntwo',
      eyebrow: 'Chapter 01',
      align: 'left',
      rule: true,
      amount: 1,
    });
    expect('extra' in props).toBe(false);
  });

  it('truncates by graphemes and strips unsafe characters', () => {
    const control = c.text({ label: 'x', default: '', maxLength: 3 });
    expect(sanitizeText(control, 'a‮b\u0007c\nd')).toBe('abc');
    expect(sanitizeText(control, '👩‍👩‍👧‍👦abcd')).toBe('👩‍👩‍👧‍👦ab');
    expect(resolveProps(schema, { amount: 0.3333 }).amount).toBe(0.3);
  });
});

describe('timeline', () => {
  const spec = { lead: 0.15, in: 1.0, out: 0.6, tail: 0.45, readable: 'Where it all began' };
  const bounds = { min: 3, max: 12 };

  it('gives the remaining duration to the hold (Rise at 5 s)', () => {
    const tl = createTimeline({
      structure: 'in-hold-out',
      spec,
      energy: ENERGIES.balanced,
      duration: 5,
      bounds,
    });
    expect(tl.sections.in).toEqual({ start: 0.15, end: 1.15 });
    expect(tl.sections.hold.start).toBeCloseTo(1.15);
    expect(tl.sections.hold.end).toBeCloseTo(3.95);
    expect(tl.sections.out.end).toBeCloseTo(4.55);
    expect(tl.sections.tail.end).toBe(5);
  });

  it('scales entrances and exits with energy but keeps clean frames fixed', () => {
    const calm = createTimeline({
      structure: 'in-hold-out',
      spec,
      energy: ENERGIES.calm,
      duration: 5,
      bounds,
    });
    const punchy = createTimeline({
      structure: 'in-hold-out',
      spec,
      energy: ENERGIES.punchy,
      duration: 5,
      bounds,
    });
    expect(calm.sections.in.end - calm.sections.in.start).toBeCloseTo(1.35);
    expect(punchy.sections.in.end - punchy.sections.in.start).toBeCloseTo(0.75);
    expect(calm.sections.lead.end).toBe(0.15);
    expect(calm.at('in', 0.2)).toBeCloseTo(0.15 + 0.2 * 1.35);
    expect(calm.at('hold', 0.2)).toBeCloseTo(calm.sections.hold.start + 0.2);
  });

  it('evaluates eased windows inside sections', () => {
    const tl = createTimeline({
      structure: 'in-hold-out',
      spec,
      energy: ENERGIES.balanced,
      duration: 5,
      bounds,
    });
    expect(tl.p(0, 'in', { delay: 0.1, dur: 0.9 })).toBe(0);
    expect(tl.p(0.7, 'in', { delay: 0.1, dur: 0.9 })).toBeCloseTo(0.5);
    expect(tl.p(0.7, 'in', { delay: 0.1, dur: 0.9 }, 'glide')).toBeGreaterThan(0.9);
    expect(tl.p(9, 'in', { delay: 0.1, dur: 0.9 }, 'glide')).toBe(1);
  });

  it('warns when the hold is too short to read and suggests a duration', () => {
    const tl = createTimeline({
      structure: 'in-hold-out',
      spec: { ...spec, readable: 'one two three four five six seven eight nine ten' },
      energy: ENERGIES.balanced,
      duration: 3,
      bounds,
    });
    const warning = tl.warnings.find((w) => w.kind === 'hold-too-short');
    expect(warning).toBeDefined();
    if (warning?.kind === 'hold-too-short') expect(warning.suggestedDuration).toBeGreaterThan(3);
    expect(readingTime('')).toBe(1.5);
    expect(readingTime('a '.repeat(100))).toBe(8);
  });

  it('never lets in and out overlap, even below the minimum', () => {
    const tl = createTimeline({
      structure: 'in-hold-out',
      spec,
      energy: ENERGIES.calm,
      duration: 1,
      bounds: { min: 0.5, max: 12 },
    });
    expect(tl.sections.hold.end).toBeGreaterThanOrEqual(tl.sections.hold.start);
    expect(tl.duration).toBeGreaterThan(1);
    expect(tl.warnings.some((w) => w.kind === 'duration-clamped')).toBe(true);
  });
});

describe('palettes', () => {
  it('every library palette meets its role minimums', () => {
    for (const id of PALETTE_IDS) {
      const { roles } = PALETTES[id];
      for (const [role, min] of Object.entries(ROLE_MINIMUMS)) {
        const ratio = contrastRatio(roles[role as keyof typeof roles], roles.bg);
        expect(ratio, `${id}.${role}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('classifies dark palettes', () => {
    expect(PALETTES.ink.dark).toBe(true);
    expect(PALETTES.paper.dark).toBe(false);
    expect(PALETTES.cobalt.dark).toBe(true);
    expect(PALETTES.acid.dark).toBe(false);
  });

  it('derives brand palettes that pass contrast for any brand color', () => {
    const rng = createRng('brand-colors');
    const colors = ['#1F38E8', '#FF6A1A', '#D4FF3A', '#808080', '#FFFFFF', '#000000', '#9FE870'];
    for (let i = 0; i < 40; i++) {
      colors.push(toHex({ r: rng.next(), g: rng.next(), b: rng.next(), a: 1 }));
    }
    for (const hex of colors) {
      for (const variant of BRAND_VARIANTS) {
        const { roles } = deriveBrandPalette(parseHex(hex), variant);
        expect(contrastRatio(roles.fg, roles.bg), `${hex} ${variant} fg`).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrastRatio(roles.muted, roles.bg),
          `${hex} ${variant} muted`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(roles.accent, roles.bg),
          `${hex} ${variant} accent`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps the brand color exact when asked', () => {
    const brand = parseHex('#9FE870');
    const exact = deriveBrandPalette(brand, 'light', true);
    expect(toHex(exact.roles.accent)).toBe('#9fe870');
    const nudged = deriveBrandPalette(brand, 'light');
    expect(toHex(nudged.roles.accent)).not.toBe('#9fe870');
  });

  it('sanitizes stored palette references', () => {
    const fallback = { kind: 'library', id: 'paper' } as const;
    expect(sanitizePaletteRef({ kind: 'library', id: 'nope' }, fallback)).toBe(fallback);
    expect(
      sanitizePaletteRef({ kind: 'brand', color: 'ff00aa', variant: 'dark' }, fallback),
    ).toEqual({ kind: 'brand', color: '#ff00aa', variant: 'dark', exact: false });
    expect(resolvePalette({ kind: 'brand', color: '#ff00aa', variant: 'bold' }).id).toBe(
      'brand-bold',
    );
  });
});

describe('pairings', () => {
  it("has every pairing's fonts built", () => {
    expect(PAIRING_IDS.filter((id) => !isPairingAvailable(id))).toEqual([]);
    expect(pairingFonts('editorial').sort()).toEqual([
      'instrument-serif',
      'instrument-serif-italic',
      'inter',
    ]);
    expect(PAIRING_IDS).toHaveLength(11);
  });
});

describe('defineTemplate & state', () => {
  const template = defineTemplate({
    id: 'probe',
    version: 2,
    meta: { name: 'Probe', tagline: 'Test', category: 'text-titles', tags: [], useCases: [] },
    formats: ['16:9', '9:16'],
    structure: 'in-hold-out',
    duration: { default: 5, min: 3, max: 12 },
    alpha: 'optional',
    poster: 2,
    palettes: [{ kind: 'library', id: 'paper' }],
    pairings: ['poster', 'grotesk'],
    controls: {
      title: c.text({ label: 'Title', default: 'Hi', maxLength: 20, primary: true }),
      size: c.choice({
        label: 'Size',
        default: 'm',
        options: [
          { value: 's', label: 'S' },
          { value: 'm', label: 'M' },
        ],
      }),
    },
    looks: [
      {
        id: 'ink',
        name: 'Ink',
        palette: { kind: 'library', id: 'ink' },
        pairing: 'poster',
        values: { size: 's' },
      },
    ],
    timing: () => ({ in: 1, out: 0.5 }),
    build: () => ({ render: () => {} }),
    migrate: (props, from) => (from < 2 ? { title: props.heading } : { ...props }),
  });

  it('rejects structurally invalid templates', () => {
    expect(() => defineTemplate({ ...template, id: 'Bad Id' })).toThrow(/slug/);
    expect(() =>
      defineTemplate({ ...template, duration: { default: 20, min: 3, max: 12 } }),
    ).toThrow(/outside/);
  });

  it('builds the initial state from the first Look', () => {
    const state = initialState(template);
    expect(state.palette).toEqual({ kind: 'library', id: 'ink' });
    expect(state.pairing).toBe('poster');
    expect(state.props).toEqual({ title: 'Hi', size: 's' });
    expect(state.format).toBe('16:9');
    expect(state.transparent).toBe(false);
  });

  it('sanitizes untrusted state and migrates old versions', () => {
    const state = sanitizeState(template, {
      templateVersion: 1,
      props: { heading: 'Migrated' },
      format: '1:1',
      duration: 99,
      energy: 'wild',
      palette: { kind: 'library', id: 'cobalt' },
      pairing: 'editorial',
      transparent: true,
      finish: 'grain',
      seed: 12.5,
      layout: { lockup: { x: 500, y: -2, scale: 9 }, 'bad key!': { x: 1 } },
    });
    expect(state.props).toEqual({ title: 'Migrated', size: 'm' });
    expect(state.format).toBe('16:9');
    expect(state.duration).toBe(12);
    expect(state.energy).toBe('balanced');
    expect(state.palette).toEqual({ kind: 'library', id: 'cobalt' });
    expect(state.pairing).toBe('poster');
    expect(state.transparent).toBe(true);
    expect(state.finish).toBe('grain');
    expect(state.seed).toBe(1);
    expect(state.layout).toEqual({ lockup: { x: 100, y: -2, scale: 4 } });
    expect(sanitizeState(template, 'garbage')).toEqual(initialState(template));
  });
});
