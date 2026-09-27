import { describe, expect, it } from 'vitest';
import { importSvg } from '@/engine/assets/svg';
import type { Graphic } from '@/engine/assets/types';
import { buildScene } from '@/engine/runtime/scene';
import { FORMAT_IDS } from '@/engine/template/formats';
import { applyLook, type DesignState, initialState } from '@/engine/template/state';
import { ENERGY_IDS } from '@/engine/timeline/energy';
import { CLEAN_END } from '@/engine/timeline/timeline';
import { loadTemplate } from '@/templates/registry';
import {
  build,
  type Frame,
  fingerprint,
  inkedPixels,
  inkOutside,
  render,
  textEngine,
} from '../support/render';

const sheen = await loadTemplate('sheen');
const base = initialState(sheen);
const at = (patch: Partial<DesignState>, props: Record<string, unknown> = {}): DesignState => ({
  ...base,
  ...patch,
  props: { ...base.props, ...props },
});

/** Pixels painted in `frame` where `reference` shows only background (with 1 px of slack). */
function paintedOutside(frame: Frame, reference: Frame): number {
  const { width, height } = frame;
  const bg = (f: Frame, i: number) =>
    f.data[i] === f.data[0] &&
    f.data[i + 1] === f.data[1] &&
    f.data[i + 2] === f.data[2] &&
    f.data[i + 3] === f.data[3];
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (bg(frame, i)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1 && !near; dx++) {
          if (!bg(reference, ((y + dy) * width + x + dx) * 4)) near = true;
        }
      }
      if (!near) count++;
    }
  }
  return count;
}

describe('Sheen', () => {
  for (const format of FORMAT_IDS) {
    for (const look of sheen.looks) {
      it(`${format} · ${look.name}: from darkness to a clean end card`, async () => {
        const built = await build(sheen, applyLook(sheen, at({ format }), look));
        const { duration, sections } = built.timeline;
        expect(inkedPixels(render(built, 0))).toBe(0);
        const card = render(built, duration);
        expect(inkedPixels(card)).toBeGreaterThan(card.width * card.height * 0.005);
        // Everything has settled once the entrance ends; the second sweep leaves no trace.
        expect(fingerprint(render(built, sections.hold.start + 0.05))).toBe(fingerprint(card));
      });
    }
  }

  for (const energy of ENERGY_IDS) {
    it(`${energy}: an exit that ends empty, at min and max duration`, async () => {
      for (const duration of [3, 8]) {
        const built = await build(sheen, at({ energy, duration }, { out: true }));
        expect(inkedPixels(render(built, 0))).toBe(0);
        expect(inkedPixels(render(built, built.timeline.duration - CLEAN_END))).toBe(0);
        const hold = render(built, built.timeline.sections.hold.start + 0.05);
        expect(inkedPixels(hold)).toBeGreaterThan(hold.width * hold.height * 0.005);
      }
    });
  }

  it('keeps the light on the logo: without glow, the sweep paints nothing outside it', async () => {
    const built = await build(sheen, at({}, { glow: 'off', tagline: '' }));
    const card = render(built, built.timeline.duration, 0.5);
    for (const t of [1.2, 1.4, 1.6, 1.8]) {
      const frame = render(built, t, 0.5);
      expect(paintedOutside(frame, card)).toBe(0);
      expect(fingerprint(frame)).not.toBe(fingerprint(card));
    }
  });

  it('blooms the highlight when glow is on', async () => {
    const plain = await build(sheen, at({}, { glow: 'off', tagline: '' }));
    const glowing = await build(sheen, at({}, { glow: 'strong', tagline: '' }));
    const card = render(plain, plain.timeline.duration, 0.5);
    expect(paintedOutside(render(glowing, 1.6, 0.5), card)).toBeGreaterThan(50);
  });

  it('draws every placeholder logo in every color mode', async () => {
    for (const id of ['nova', 'halden', 'aero']) {
      for (const color of ['original', 'mono', 'accent']) {
        const built = await build(sheen, at({}, { logo: { kind: 'placeholder', id }, color }));
        const card = render(built, built.timeline.duration);
        expect(inkedPixels(card)).toBeGreaterThan(card.width * card.height * 0.005);
        const safe = built.frame.safe.title;
        expect(inkOutside(card, safe)).toBe(0);
      }
    }
  });

  it("draws the user's own vector logo, and its placeholder until the file arrives", async () => {
    const svg = importSvg(
      '<svg viewBox="0 0 200 100"><rect x="0" y="0" width="200" height="100" fill="#e11"/></svg>',
    );
    if (!svg.ok) throw new Error(svg.detail);
    const hash = 'a'.repeat(64);
    const state = at({}, { logo: { kind: 'user', hash, name: 'mark.svg' }, tagline: '' });
    const text = await textEngine();
    const missing = buildScene(sheen, state, text, () => undefined);
    expect(missing.missingAssets).toEqual(['logo']);
    const assets = new Map<string, Graphic>([[hash, svg.graphic]]);
    const built = buildScene(sheen, state, text, (key) => assets.get(key));
    expect(built.missingAssets).toEqual([]);
    const card = render(built, built.timeline.duration);
    // The red rectangle is centered and 2:1.
    const { width, height, data } = card;
    const center = (Math.round(height / 2) * width + Math.round(width / 2)) * 4;
    expect([data[center], data[center + 1], data[center + 2]]).toEqual([238, 17, 17]);
  });

  it('stays inside the safe area with a long tagline in every format', async () => {
    const tagline = 'Designed in Lisbon. Made to last a lifetime of everyday use.';
    for (const format of FORMAT_IDS) {
      const built = await build(sheen, at({ format }, { tagline }));
      const { frame } = built;
      const safe = frame.vertical ? frame.safe.social : frame.safe.title;
      expect(inkOutside(render(built, built.timeline.duration), safe)).toBe(0);
    }
  });

  it('renders a transparent background when asked', async () => {
    const built = await build(sheen, at({ transparent: true }));
    const empty = render(built, 0);
    expect(empty.data.every((value, i) => i % 4 !== 3 || value === 0)).toBe(true);
    const card = render(built, built.timeline.duration);
    expect(card.data[3]).toBe(0);
    expect(card.data.some((value, i) => i % 4 === 3 && value === 255)).toBe(true);
  });

  it('registers the logo and tagline for the editor', async () => {
    const built = await build(sheen, base);
    const ids = render(built, built.timeline.duration).regions.map((region) => region.id);
    expect(ids.sort()).toEqual([
      'editable:logo',
      'editable:tagline',
      'movable:logo',
      'movable:tagline',
    ]);
  });

  it('is deterministic', async () => {
    const a = await build(sheen, at({ energy: 'punchy' }, { light: 'warm' }));
    const b = await build(sheen, at({ energy: 'punchy' }, { light: 'warm' }));
    for (const t of [0.4, 1.3, 1.7, 3.4]) {
      expect(fingerprint(render(a, t, 0.5))).toBe(fingerprint(render(b, t, 0.5)));
    }
  });
});
