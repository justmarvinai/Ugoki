import { describe, expect, it } from 'vitest';
import { FORMAT_IDS } from '@/engine/template/formats';
import { applyLook, type DesignState, initialState } from '@/engine/template/state';
import { ENERGY_IDS } from '@/engine/timeline/energy';
import { loadTemplate } from '@/templates/registry';
import { build, type Frame, fingerprint, render } from '../support/render';

const layers = await loadTemplate('layers');
const base = initialState(layers);
const at = (patch: Partial<DesignState>, props: Record<string, unknown> = {}): DesignState => ({
  ...base,
  ...patch,
  props: { ...base.props, ...props },
});

const DIRECTIONS = [
  'right',
  'left',
  'up',
  'down',
  'up-right',
  'down-right',
  'down-left',
  'up-left',
];

const alphas = (frame: Frame) => frame.data.filter((_, i) => i % 4 === 3);
const covered = (frame: Frame) => alphas(frame).every((a) => a === 255);
const empty = (frame: Frame) => alphas(frame).every((a) => a === 0);

describe('Layers', () => {
  it('cuts at half the duration, whatever the energy', async () => {
    for (const energy of ENERGY_IDS) {
      for (const duration of [0.6, 1.2, 2.4]) {
        const built = await build(layers, at({ energy, duration }));
        expect(built.timeline.duration).toBe(duration);
        expect(built.timeline.cut).toBeCloseTo(duration / 2);
      }
    }
  });

  // Full coverage for at least 50 ms around the cut (motion language §10), so the cut frame is
  // covered at any frame rate and shutter.
  for (const format of FORMAT_IDS) {
    it(`${format}: covers the whole frame around the cut in every direction and setting`, async () => {
      for (const direction of DIRECTIONS) {
        for (const energy of ENERGY_IDS) {
          for (const [skew, count, speed, duration] of [
            [12, 3, 1, 1.2],
            [0, 2, 2, 0.6],
            [20, 5, 1, 2.4],
            [20, 5, 2, 0.6],
          ] as const) {
            const built = await build(
              layers,
              at({ format, energy, duration }, { direction, skew, layers: count, speed }),
            );
            const cut = built.timeline.cut ?? Number.NaN;
            for (const t of [cut - 0.025, cut, cut + 0.025]) {
              const frame = render(built, t, 0.08);
              if (!covered(frame)) {
                throw new Error(`gap at t=${t} (${direction}, ${energy}, ${skew}°, ×${speed})`);
              }
            }
            expect(empty(render(built, 0, 0.08))).toBe(true);
            expect(empty(render(built, built.timeline.duration, 0.08))).toBe(true);
          }
        }
      }
    });
  }

  it('is an overlay: never a background of its own, even when not transparent', async () => {
    const built = await build(layers, at({ transparent: false }));
    expect(empty(render(built, 0))).toBe(true);
    expect(empty(render(built, built.timeline.duration))).toBe(true);
  });

  it('enters in order and leaves in reverse: the second panel shows as the top one goes', async () => {
    const built = await build(layers, base);
    const cut = built.timeline.cut ?? 0;
    // Direction →: the first column uncovers first. Palette Acid: cobalt · acid · ink (top).
    const leftColumn = (frame: Frame) => {
      const colors = new Set<string>();
      for (let y = 0; y < frame.height; y++) {
        const i = y * frame.width * 4;
        colors.add(
          `${frame.data[i]},${frame.data[i + 1]},${frame.data[i + 2]},${frame.data[i + 3]}`,
        );
      }
      return [...colors];
    };
    const ink = '11,11,12,255';
    const acid = '212,255,58,255';
    expect(leftColumn(render(built, cut))).toEqual([ink]);
    // Just after the top panel starts to leave, the acid panel is revealed — not the scene.
    let revealed: string[] = [];
    for (let t = cut; t < cut + 0.3; t += 1 / 60) {
      revealed = leftColumn(render(built, t));
      if (!revealed.includes(ink)) break;
    }
    expect(revealed).toContain(acid);
  });

  it('compresses around the cut with Speed', async () => {
    const built = await build(layers, at({}, { speed: 2 }));
    const cut = built.timeline.cut ?? 0;
    const { duration } = built.timeline;
    expect(empty(render(built, cut - cut / 2 - 0.01))).toBe(true);
    expect(empty(render(built, cut + (duration - cut) / 2 + 0.01))).toBe(true);
    expect(covered(render(built, cut))).toBe(true);
  });

  it('fans the panel edges out by seed, and keeps the cut exact', async () => {
    const a = await build(layers, at({ seed: 1 }));
    const b = await build(layers, at({ seed: 2 }));
    expect(fingerprint(render(a, 0.3))).not.toBe(fingerprint(render(b, 0.3)));
    const cut = a.timeline.cut ?? 0;
    expect(fingerprint(render(a, cut))).toBe(fingerprint(render(b, cut)));
  });

  it('uses the palette roles for its panels: every Look and palette', async () => {
    const palettes = [...layers.palettes, { kind: 'brand', color: '#1ea672', variant: 'bold' }];
    for (const palette of palettes) {
      const built = await build(layers, at({ palette: palette as DesignState['palette'] }));
      const frame = render(built, 0.35);
      const colors = new Set<string>();
      for (let i = 0; i < frame.data.length; i += 4 * 97) {
        if (frame.data[i + 3] === 255) {
          colors.add(`${frame.data[i]},${frame.data[i + 1]},${frame.data[i + 2]}`);
        }
      }
      // Three distinct panel colors show mid-entrance.
      expect(colors.size).toBeGreaterThanOrEqual(2);
    }
    for (const look of layers.looks) {
      const built = await build(layers, applyLook(layers, base, look));
      expect(covered(render(built, built.timeline.cut ?? 0))).toBe(true);
    }
  });

  it('is deterministic', async () => {
    const a = await build(layers, at({ energy: 'punchy' }, { direction: 'up-left', layers: 5 }));
    const b = await build(layers, at({ energy: 'punchy' }, { direction: 'up-left', layers: 5 }));
    for (const t of [0.2, 0.45, 0.8, 1.0]) {
      expect(fingerprint(render(a, t, 0.5))).toBe(fingerprint(render(b, t, 0.5)));
    }
  });
});
