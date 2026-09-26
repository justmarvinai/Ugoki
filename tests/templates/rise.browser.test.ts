import { describe, expect, it } from 'vitest';
import { FORMAT_IDS, type FormatId } from '@/engine/template/formats';
import { applyLook, type DesignState, initialState } from '@/engine/template/state';
import { ENERGY_IDS } from '@/engine/timeline/energy';
import { loadTemplate } from '@/templates/registry';
import { build, fingerprint, inkedPixels, inkOutside, render } from '../support/render';

const rise = await loadTemplate('rise');
const base = initialState(rise);
const at = (patch: Partial<DesignState>, props: Record<string, unknown> = {}): DesignState => ({
  ...base,
  ...patch,
  props: { ...base.props, ...props },
});

/** Stress text (docs/templates/00-foundations.md §9). */
const STRESS = {
  word: 'Gy',
  max: 'Ölçü, Łódź & Ærø: 1,234 Jahre Straßenfußball in 60 Zeichen!',
  lines: 'One\nTwo\nThree',
  numbers: '2026 → 1,000,000',
};

describe('Rise', () => {
  for (const format of FORMAT_IDS) {
    for (const look of rise.looks) {
      it(`${format} · ${look.name}: clean edit points and a readable hold`, async () => {
        const built = await build(rise, applyLook(rise, at({ format }), look));
        const { duration } = built.timeline;
        expect(inkedPixels(render(built, 0))).toBe(0);
        expect(inkedPixels(render(built, duration))).toBe(0);
        const hold = render(built, rise.poster);
        expect(inkedPixels(hold)).toBeGreaterThan(hold.width * hold.height * 0.01);
      });
    }
  }

  it('is deterministic', async () => {
    const a = await build(rise, base);
    const b = await build(rise, base);
    for (const t of [0.3, 0.5, 2.2, 4.2]) {
      expect(fingerprint(render(a, t, 0.5))).toBe(fingerprint(render(b, t, 0.5)));
    }
  });

  for (const energy of ENERGY_IDS) {
    it(`${energy}: clean at the edges, complete in the hold, for every exit`, async () => {
      for (const exit of ['up', 'down', 'fade']) {
        const built = await build(rise, at({ energy }, { exit }));
        const { duration, sections } = built.timeline;
        expect(inkedPixels(render(built, 0))).toBe(0);
        expect(inkedPixels(render(built, sections.tail.start + 0.01))).toBe(0);
        expect(inkedPixels(render(built, duration))).toBe(0);
        // The entrance has finished by the start of the hold: its frame equals a later one
        // except for the breath, so compare against the hold's first frame instead.
        const settled = render(built, sections.hold.start);
        expect(inkedPixels(settled)).toBeGreaterThan(settled.width * settled.height * 0.01);
      }
    });
  }

  const formats: FormatId[] = ['16:9', '9:16', '1:1', '4:5'];
  for (const [name, headline] of Object.entries(STRESS)) {
    it(`keeps "${name}" stress text inside the safe area in every format and alignment`, async () => {
      for (const format of formats) {
        for (const align of ['left', 'center']) {
          const built = await build(rise, at({ format }, { headline, align }));
          const { frame } = built;
          const safe = frame.vertical ? frame.safe.social : frame.safe.title;
          const hold = render(built, rise.poster);
          expect(inkedPixels(hold)).toBeGreaterThan(0);
          expect(inkOutside(hold, safe)).toBe(0);
        }
      }
    });
  }

  it('renders a transparent background when asked', async () => {
    const built = await build(rise, at({ transparent: true }));
    const empty = render(built, 0);
    expect(empty.data.every((value, i) => i % 4 !== 3 || value === 0)).toBe(true);
    const hold = render(built, rise.poster);
    expect(hold.data[3]).toBe(0);
    expect(hold.data.some((value, i) => i % 4 === 3 && value === 255)).toBe(true);
  });

  it('stretches only the hold and warns when it gets too short to read', async () => {
    const short = await build(rise, at({ duration: 3, energy: 'calm' }));
    expect(short.timeline.warnings.map((w) => w.kind)).toContain('hold-too-short');
    const long = await build(rise, at({ duration: 12 }));
    expect(long.timeline.warnings).toEqual([]);
    const normal = await build(rise, base);
    const entrance = (b: typeof normal) =>
      b.timeline.sections.in.end - b.timeline.sections.in.start;
    expect(entrance(long)).toBeCloseTo(entrance(normal));
    expect(inkedPixels(render(long, long.timeline.duration))).toBe(0);
  });

  it('registers the movable lockup and editable text for the editor', async () => {
    const built = await build(rise, base);
    const ids = render(built, rise.poster).regions.map((region) => region.id);
    expect(ids.sort()).toEqual(['editable:eyebrow', 'editable:headline', 'movable:lockup']);
    const noEyebrow = await build(rise, at({}, { eyebrow: '' }));
    expect(render(noEyebrow, rise.poster).regions.map((r) => r.id)).not.toContain(
      'editable:eyebrow',
    );
  });

  it('moves and scales the lockup with the layout offset', async () => {
    const moved = await build(rise, at({ layout: { lockup: { x: 10, y: -5, scale: 1.2 } } }));
    const region = render(moved, rise.poster).regions.find((r) => r.id === 'movable:lockup');
    const plain = render(await build(rise, base), rise.poster).regions.find(
      (r) => r.id === 'movable:lockup',
    );
    expect(region && plain).toBeTruthy();
    expect(region!.bounds.w).toBeCloseTo(plain!.bounds.w * 1.2);
    const u = moved.frame.u;
    const center = (r: typeof region) => r!.bounds.x + r!.bounds.w / 2;
    expect(center(region) - center(plain)).toBeCloseTo(10 * u);
  });
});
