import { describe, expect, it } from 'vitest';
import { FORMAT_IDS } from '@/engine/template/formats';
import { applyLook, type DesignState, initialState } from '@/engine/template/state';
import { ENERGY_IDS } from '@/engine/timeline/energy';
import { loadTemplate } from '@/templates/registry';
import { build, fingerprint, inkedPixels, inkOutside, render } from '../support/render';

const line = await loadTemplate('line');
const base = initialState(line);
const at = (patch: Partial<DesignState>, props: Record<string, unknown> = {}): DesignState => ({
  ...base,
  ...patch,
  props: { ...base.props, ...props },
});

const ANCHORS = [
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'middle-left',
  'center',
  'middle-right',
  'top-left',
  'top-center',
  'top-right',
];

/** Stress text (docs/templates/00-foundations.md §9). */
const STRESS: Record<string, { name: string; title: string }> = {
  word: { name: 'Gy', title: '' },
  max: {
    name: 'Ölçü Łódź Ærø-Straßenfußball Jahrhundert',
    title: 'Head of Research & Development, Nordic Region — 1,234 Days in a Row',
  },
  diacritics: { name: 'Élodie Marchand', title: 'Directrice artistique, Ångström & Søn' },
  numbers: { name: '2026', title: '1,000,000 views · 24/7' },
};

describe('Line', () => {
  it('is transparent by default: an overlay for footage', () => {
    expect(base.transparent).toBe(true);
  });

  for (const format of FORMAT_IDS) {
    for (const look of line.looks) {
      it(`${format} · ${look.name}: clean edit points and a steady hold`, async () => {
        const built = await build(line, applyLook(line, at({ format }), look));
        const { duration, sections } = built.timeline;
        expect(inkedPixels(render(built, 0))).toBe(0);
        expect(inkedPixels(render(built, duration))).toBe(0);
        const hold = render(built, line.poster);
        expect(inkedPixels(hold)).toBeGreaterThan(hold.width * hold.height * 0.002);
        // Overlays that wobble look amateur: the hold doesn't move at all.
        expect(fingerprint(render(built, sections.hold.start))).toBe(fingerprint(hold));
        expect(fingerprint(render(built, sections.hold.end))).toBe(fingerprint(hold));
      });
    }
  }

  for (const energy of ENERGY_IDS) {
    it(`${energy}: clean at the edges and complete by the hold, at min and max duration`, async () => {
      for (const duration of [3, 20]) {
        const built = await build(line, at({ energy, duration }));
        const { sections } = built.timeline;
        expect(inkedPixels(render(built, 0))).toBe(0);
        expect(inkedPixels(render(built, built.timeline.duration))).toBe(0);
        const settled = render(built, sections.hold.start);
        expect(inkedPixels(settled)).toBeGreaterThan(settled.width * settled.height * 0.002);
      }
    });
  }

  it('slides the text out of the bar: nothing shows beyond the slot while it emerges', async () => {
    for (const anchor of ['bottom-left', 'bottom-right']) {
      const built = await build(line, at({}, { anchor }));
      const hold = render(built, line.poster);
      const lockup = hold.regions.find((r) => r.id === 'movable:lockup')?.bounds;
      if (!lockup) throw new Error('no lockup region');
      const { width, height } = built.frame;
      // The bar is the lockup's left edge (right edge when mirrored); text lives beyond it.
      const slot =
        anchor === 'bottom-left'
          ? { x: lockup.x, y: 0, w: width - lockup.x, h: height }
          : { x: 0, y: 0, w: lockup.x + lockup.w, h: height };
      for (const t of [0.2, 0.3, 0.45, 5.6, 5.7]) {
        expect(inkOutside(render(built, t), slot)).toBe(0);
      }
      // …and the text did travel: mid-entrance it hasn't reached its resting place yet.
      const entering = render(built, 0.3);
      expect(inkedPixels(entering)).toBeLessThan(inkedPixels(hold));
    }
  });

  for (const [name, text] of Object.entries(STRESS)) {
    it(`keeps "${name}" stress text inside the safe area for every format and anchor`, async () => {
      for (const format of FORMAT_IDS) {
        for (const anchor of ANCHORS) {
          for (const size of ['s', 'l']) {
            const built = await build(line, at({ format }, { ...text, anchor, size }));
            const { frame } = built;
            const safe = frame.vertical ? frame.safe.social : frame.safe.title;
            const hold = render(built, line.poster);
            expect(inkedPixels(hold)).toBeGreaterThan(0);
            expect(inkOutside(hold, safe)).toBe(0);
          }
        }
      }
    });
  }

  it('renders a transparent background, and the palette background when asked', async () => {
    const clear = await build(line, base);
    const hold = render(clear, line.poster);
    expect(hold.data[3]).toBe(0);
    expect(hold.data.some((value, i) => i % 4 === 3 && value === 255)).toBe(true);
    const opaque = render(await build(line, at({ transparent: false })), 0);
    expect(opaque.data[3]).toBe(255);
  });

  it('adds a soft shadow only when asked', async () => {
    const plain = render(await build(line, base), line.poster);
    const shadowed = render(await build(line, at({}, { shadow: true })), line.poster);
    expect(inkedPixels(shadowed)).toBeGreaterThan(inkedPixels(plain) * 1.5);
  });

  it('registers the movable lockup and editable name and title', async () => {
    const built = await build(line, base);
    const ids = render(built, line.poster).regions.map((region) => region.id);
    expect(ids.sort()).toEqual(['editable:name', 'editable:title', 'movable:lockup']);
    const noTitle = await build(line, at({}, { title: '' }));
    expect(render(noTitle, line.poster).regions.map((r) => r.id)).not.toContain('editable:title');
  });

  it('is deterministic', async () => {
    const a = await build(line, at({ energy: 'punchy' }, { shadow: true }));
    const b = await build(line, at({ energy: 'punchy' }, { shadow: true }));
    for (const t of [0.2, 0.4, 2.5, 5.7]) {
      expect(fingerprint(render(a, t, 0.5))).toBe(fingerprint(render(b, t, 0.5)));
    }
  });
});
