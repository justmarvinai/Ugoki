/**
 * Grid's type, measured against the modules: every text unit gets a few shapes it can take on
 * the grid (in whole modules, padding included) — the title at two sizes and widths, the
 * numeral one, two or three rows tall, the small type at a few measures — and the layout
 * generator picks one per unit.
 */

import {
  type BuildContext,
  type ControlSchema,
  createOdometer,
  type Odometer,
  type Pairing,
  type TextBlock,
  type TextStyle,
} from '@/engine';
import { COLS, ROWS, type UnitId } from './layout';

type Text = BuildContext<ControlSchema>['text'];

export type Shape = {
  readonly w: number;
  readonly h: number;
  /** The laid-out type (null for the numeral, which the odometer draws). */
  readonly block: TextBlock | null;
  readonly odometer: Odometer | null;
};

export type Measure = {
  readonly text: Text;
  readonly pairing: Pairing;
  /** Module size and padding (design units). */
  readonly mw: number;
  readonly mh: number;
  readonly pad: number;
  readonly u: number;
  /** Type sizes in u. */
  readonly sizes: { readonly title: number; readonly subtitle: number; readonly meta: number };
};

export type Content = {
  readonly title: string;
  readonly subtitle: string;
  /** Date and location lines (the empty ones left out). */
  readonly meta: readonly string[];
  readonly number: string;
};

export function numberStyle(pairing: Pairing, size: number): TextStyle {
  const display = pairing.display;
  return {
    font: display.font,
    size,
    weight: Math.max(display.weight, 800),
    width: display.width,
    tracking: -0.02,
    features: display.features,
  };
}

export function measure(m: Measure, content: Content): Partial<Record<UnitId, Shape[]>> {
  const { text, pairing, mw, mh, pad, u, sizes } = m;
  const display = pairing.display;
  const body = pairing.text;
  const colsFor = (width: number) => Math.max(1, Math.ceil((width + 2 * pad - 0.5) / mw));
  const rowsFor = (height: number) => Math.max(1, Math.ceil((height + 2 * pad - 0.5) / mh));
  const out: Partial<Record<UnitId, Shape[]>> = {};

  // --- title: large and regular, at the narrowest measure that holds it (and one wider) --------
  const titleText = content.title || ' ';
  const title = (size: number, width: number, fit: boolean) =>
    text.layout(titleText, {
      style: {
        font: display.font,
        italicFont: display.italic,
        size,
        weight: display.weight,
        width: display.width,
        tracking: display.tracking,
        features: display.features,
      },
      maxWidth: width,
      maxLines: 3,
      lineHeight: display.lineHeight,
      align: 'left',
      fit: { minSize: fit ? 2.4 * u : size * 0.999 },
    });
  const titles: Shape[] = [];
  for (const scale of [1.3, 1]) {
    const size = sizes.title * u * scale;
    for (let w = 1; w <= COLS; w++) {
      const block = title(size, w * mw - 2 * pad, false);
      if (block.overflow) continue;
      const h = rowsFor(block.height + 0.26 * block.size);
      if (h > ROWS - 1) break;
      titles.push({ w, h, block, odometer: null });
      if (w < COLS) titles.push({ w: w + 1, h, block, odometer: null });
      break;
    }
  }
  if (titles.length === 0) {
    const block = title(sizes.title * u, COLS * mw - 2 * pad, true);
    const h = Math.min(ROWS - 1, rowsFor(block.height + 0.26 * block.size));
    titles.push({ w: COLS, h, block, odometer: null });
  }
  out.title = titles;

  // --- the numeral: one, two or three rows tall, the biggest type on the poster ----------------
  if (content.number) {
    const probe = createOdometer(text, numberStyle(pairing, 100));
    const cap = probe.capHeight / 100;
    const width = probe.width(content.number) / 100;
    const numbers: Shape[] = [];
    for (const h of [3, 2, 1]) {
      let size = (h * mh - 2 * pad) / cap;
      let w = colsFor(width * size);
      if (w > 4) {
        w = 4;
        size = Math.min(size, (w * mw - 2 * pad) / width);
      }
      const capH = size * cap;
      // Bigger than the title, never a wall of digits.
      if (capH < sizes.title * u * 1.25 || capH > mh * 2.7 || capH > mw * 2.7) continue;
      numbers.push({
        w,
        h,
        block: null,
        odometer: createOdometer(text, numberStyle(pairing, size)),
      });
    }
    if (numbers.length === 0) {
      const size = Math.min((2 * mh - 2 * pad) / cap, (4 * mw - 2 * pad) / width);
      numbers.push({
        w: colsFor(width * size),
        h: rowsFor(size * cap),
        block: null,
        odometer: createOdometer(text, numberStyle(pairing, size)),
      });
    }
    out.number = numbers;
  }

  // --- subtitle and meta: small type at a few measures -----------------------------------------
  const small = (
    content: string,
    style: TextStyle,
    widths: readonly number[],
    lines: number,
    leading: number,
  ): Shape[] => {
    const shapes: Shape[] = [];
    for (const w of widths) {
      const block = text.layout(content, {
        style,
        maxWidth: w * mw - 2 * pad,
        maxLines: lines,
        lineHeight: leading,
        align: 'left',
        fit: { minSize: style.size * 0.999 },
      });
      if (block.overflow) continue;
      shapes.push({ w, h: rowsFor(block.height + 0.3 * block.size), block, odometer: null });
    }
    if (shapes.length === 0) {
      const w = widths[widths.length - 1] ?? 3;
      const block = text.layout(content, {
        style,
        maxWidth: w * mw - 2 * pad,
        maxLines: lines + 1,
        lineHeight: leading,
        align: 'left',
        fit: { minSize: 2.4 * u },
      });
      shapes.push({ w, h: rowsFor(block.height + 0.3 * block.size), block, odometer: null });
    }
    return shapes;
  };
  if (content.subtitle) {
    out.subtitle = small(
      content.subtitle,
      {
        font: body.font,
        size: sizes.subtitle * u,
        weight: Math.max(500, body.weight),
        width: body.width,
        tracking: body.tracking,
        features: body.features,
      },
      [2, 3, 4],
      3,
      1.18,
    );
  }
  if (content.meta.length > 0) {
    out.meta = small(
      content.meta.join('\n'),
      {
        font: body.font,
        size: sizes.meta * u,
        weight: 650,
        width: body.width,
        tracking: 0.06,
        features: body.features,
        case: 'upper',
      },
      [1, 2, 3],
      content.meta.length,
      1.25,
    );
  }
  return out;
}
