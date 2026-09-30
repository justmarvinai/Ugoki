/**
 * The automatable parts of the quality bar (docs/templates/00-foundations.md §9), for every
 * registered template: it renders in every format, Look, energy and at its shortest and longest
 * duration; it is deterministic; edit points are clean (transparent where alpha is supported,
 * background-only otherwise); loops are seamless; transitions cover the frame at the cut; and
 * editable text stays inside the title-safe area — also with stress text. Templates with a test
 * file of their own get deeper checks there; the rest is judged on contact sheets (`pnpm sheet`).
 */

import { describe, expect, it } from 'vitest';
import type { Rect } from '@/engine/core/math';
import type { ControlSchema } from '@/engine/template/controls';
import type { AnyTemplate } from '@/engine/template/define';
import type { FormatId } from '@/engine/template/formats';
import { applyLook, type DesignState, initialState } from '@/engine/template/state';
import { ENERGY_IDS } from '@/engine/timeline/energy';
import { loadTemplate, TEMPLATES } from '@/templates/registry';
import { build, type Frame, fingerprint, render } from '../support/render';

const SCALE = 0.2;

/** Templates whose background legitimately moves on its own, with the reason. */
const MOVING_BACKGROUND: Readonly<Record<string, string>> = {};

/** Templates that end on a finished card by design (their exit is optional), with the reason. */
const END_CARD: Readonly<Record<string, string>> = {
  sheen: 'ends on the lit logo unless Out is on',
  bounce: 'ends on the landed logo unless Out is on',
  draw: 'ends on the inked logo unless Out is on',
  shards: 'ends on the assembled logo unless Out is on',
  resolve: 'ends on the resolved logo unless Out is on',
};

const alphaIs = (frame: Frame, test: (alpha: number) => boolean) => {
  for (let i = 3; i < frame.data.length; i += 4) if (!test(frame.data[i] ?? 0)) return false;
  return true;
};
const empty = (frame: Frame) => alphaIs(frame, (a) => a === 0);
const covered = (frame: Frame) => alphaIs(frame, (a) => a === 255);

/** Text that fills a control to its limits with long real words, diacritics and numbers. */
function stressText(maxLength: number, lines: number): string {
  const words = ['Extraordinary', 'Øresund', 'Łódź', 'announcements', '1,234,567', 'Straße'];
  let text = '';
  for (let i = 0; text.length < maxLength; i++) text += `${text ? ' ' : ''}${words[i % 6]}`;
  const parts = text.slice(0, maxLength).trim().split(' ');
  if (lines <= 1) return parts.join(' ');
  const per = Math.ceil(parts.length / lines);
  return Array.from({ length: lines }, (_, l) => parts.slice(l * per, (l + 1) * per).join(' '))
    .filter(Boolean)
    .join('\n');
}

function stressed(template: AnyTemplate, state: DesignState): DesignState {
  const props: Record<string, unknown> = { ...state.props };
  for (const [key, control] of Object.entries(template.controls as ControlSchema)) {
    if (control.kind !== 'text' || !props[key]) continue;
    props[key] = stressText(control.maxLength, control.multiline ? (control.maxLines ?? 1) : 1);
  }
  return { ...state, props };
}

const inside = (inner: Rect, outer: Rect, slack: number) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.w <= outer.x + outer.w + slack &&
  inner.y + inner.h <= outer.y + outer.h + slack;

const posterOf = (template: AnyTemplate, duration: number) =>
  Math.min(template.poster, duration - 1 / 60);

for (const entry of TEMPLATES) {
  const template = await loadTemplate(entry.id);
  const base = initialState(template);
  const formats = template.formats as readonly FormatId[];
  const alpha = template.alpha !== 'none';
  const endsEmpty = !(template.id in END_CARD);

  describe(entry.name, () => {
    it('is deterministic', async () => {
      const a = await build(template, base);
      const b = await build(template, base);
      const { duration } = a.timeline;
      for (const t of [duration * 0.2, posterOf(template, duration), duration * 0.8]) {
        expect(fingerprint(render(a, t, SCALE))).toBe(fingerprint(render(b, t, SCALE)));
      }
    });

    for (const format of formats) {
      it(`${format}: every Look has clean edit points and a built poster frame`, async () => {
        for (const look of template.looks) {
          const state = { ...applyLook(template, base, look), format };
          const built = await build(template, state);
          const { duration } = built.timeline;
          const poster = render(built, posterOf(template, duration), SCALE);
          expect(fingerprint(poster)).not.toBe(fingerprint(render(built, 0, SCALE)));
          if (template.structure === 'loop') {
            expect(fingerprint(render(built, duration, SCALE))).toBe(
              fingerprint(render(built, 0, SCALE)),
            );
          } else if (!alpha && endsEmpty && !(template.id in MOVING_BACKGROUND)) {
            expect(fingerprint(render(built, duration, SCALE))).toBe(
              fingerprint(render(built, 0, SCALE)),
            );
          }
          if (alpha) {
            const clear = await build(template, { ...state, transparent: true });
            expect(empty(render(clear, 0, SCALE))).toBe(true);
            if (endsEmpty) expect(empty(render(clear, clear.timeline.duration, SCALE))).toBe(true);
            if (template.structure === 'transition') {
              const cut = clear.timeline.cut ?? Number.NaN;
              for (const t of [cut - 0.025, cut, cut + 0.025]) {
                expect(covered(render(clear, t, SCALE)), `covered at ${t.toFixed(3)}s`).toBe(true);
              }
            }
          }
        }
      });

      it(`${format}: editable text stays inside the title-safe area, also with stress text`, async () => {
        for (const state of [base, stressed(template, base)]) {
          const built = await build(template, { ...state, format });
          const frame = render(built, posterOf(template, built.timeline.duration), SCALE);
          const safe = built.frame.safe.title;
          const controls = template.controls as ControlSchema;
          const text = frame.regions.filter(
            (r) => r.kind === 'editable' && controls[r.target]?.kind === 'text',
          );
          for (const region of text) {
            expect(
              inside(region.bounds, safe, built.frame.u * 0.5),
              `${region.id} ${JSON.stringify(region.bounds)} outside ${JSON.stringify(safe)}`,
            ).toBe(true);
          }
        }
      });
    }

    it('renders every energy and its shortest and longest duration', async () => {
      for (const energy of ENERGY_IDS) {
        const built = await build(template, { ...base, energy });
        render(built, posterOf(template, built.timeline.duration), SCALE);
      }
      for (const duration of [template.duration.min, template.duration.max]) {
        const built = await build(template, { ...base, duration, transparent: alpha });
        const total = built.timeline.duration;
        for (const t of [0.1, 0.35, 0.65, 0.9]) render(built, total * t, SCALE);
        if (alpha) {
          expect(empty(render(built, 0, SCALE))).toBe(true);
          if (endsEmpty) expect(empty(render(built, total, SCALE))).toBe(true);
        }
      }
    });
  });
}
