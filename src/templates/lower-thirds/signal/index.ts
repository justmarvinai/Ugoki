/**
 * Signal — tech HUD (docs/templates/02-lower-thirds.md §2.5).
 *
 * The expensive detail: nothing jitters and every edge is crisp. The name decodes in slots fixed
 * to its final glyphs; the live timecode runs on tabular mono slots, so digits change in place;
 * and once the brackets have landed their corners sit on the output pixel grid — whole-pixel arms,
 * razor sharp at any export size — and even their breath moves in whole pixels.
 */

import {
  CLEAN_END,
  type Color,
  c,
  createOdometer,
  type Draw,
  defineTemplate,
  type FormatId,
  type Glyph,
  type GlyphTransform,
  type PathCommand,
  type Rect,
  rgb,
  stepped,
  type TextBlock,
  type TextStyle,
} from '@/engine';
import { createScramble } from './scramble';

const ANCHORS = [
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'middle-left', label: 'Middle left' },
  { value: 'center', label: 'Center' },
  { value: 'middle-right', label: 'Middle right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
] as const;

type Anchor = (typeof ANCHORS)[number]['value'];

/** The grid unit per format (in u): vertical feeds are watched on phones, so a touch larger. */
const GRID: Record<FormatId, number> = { '16:9': 1, '9:16': 1.18, '1:1': 1.08, '4:5': 1.12 };
/** Share of the layout width the HUD may use. */
const MEASURE: Record<FormatId, number> = { '16:9': 0.56, '9:16': 1, '1:1': 0.86, '4:5': 0.9 };
const SIZES = { s: 0.82, m: 1, l: 1.2 } as const;
/** The data line and the status label are always mono (tabular digits). */
const MONO = 'jetbrains-mono';
/** Scanlines: pitch in u (never finer than 3 output pixels) and opacity. */
const SCAN_PITCH = 0.5;
const SCAN_OPACITY = 0.06;
/** The timecode's frame rate (EBU). */
const TC_FPS = 25;

function placement(anchor: Anchor): {
  v: 'top' | 'middle' | 'bottom';
  h: 'left' | 'center' | 'right';
} {
  if (anchor === 'center') return { v: 'middle', h: 'center' };
  const [v, h] = anchor.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right'];
  return { v, h };
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
/** HH:MM:SS:FF at 25 fps. */
function timecode(seconds: number): string {
  const frames = Math.floor(seconds * TC_FPS + 1e-6);
  const ff = frames % TC_FPS;
  const total = Math.floor(frames / TC_FPS);
  return `${pad2(Math.floor(total / 3600) % 100)}:${pad2(Math.floor(total / 60) % 60)}:${pad2(total % 60)}:${pad2(ff)}`;
}

/** Channel copies of a color, for the RGB split. */
const channels = (color: Color): [Color, Color, Color] => [
  rgb(color.r, 0, 0, color.a),
  rgb(0, color.g, 0, color.a),
  rgb(0, 0, color.b, color.a),
];

export default defineTemplate({
  id: 'signal',
  version: 1,
  meta: {
    name: 'Signal',
    tagline: 'Tech HUD',
    category: 'lower-thirds',
    tags: ['lower third', 'name', 'tech', 'hud', 'gaming'],
    useCases: ['Tech talks', 'Gaming and esports', 'Hackathons', 'Product demos', 'Conferences'],
  },
  formats: ['16:9', '9:16', '1:1', '4:5'],
  structure: 'in-hold-out',
  duration: { default: 6, min: 3, max: 20 },
  alpha: 'default',
  poster: 2.6,
  palettes: [
    { kind: 'library', id: 'graphite' },
    { kind: 'library', id: 'ink' },
    { kind: 'library', id: 'midnight' },
    { kind: 'library', id: 'amber' },
    { kind: 'library', id: 'mono-dark' },
    { kind: 'library', id: 'forest' },
  ],
  pairings: ['technical', 'mono', 'grotesk', 'sport', 'wide'],
  fonts: [MONO],
  controls: {
    name: c.text({ label: 'Name', default: 'KAI MORGAN', maxLength: 28, primary: true }),
    role: c.text({ label: 'Role', default: 'LEAD ENGINEER', maxLength: 36, optional: true }),
    data: c.text({
      label: 'Data line',
      default: 'BERLIN · 52.5200° N, 13.4050° E',
      maxLength: 44,
      optional: true,
    }),
    dataMode: c.choice({
      label: 'Data',
      group: 'content',
      default: 'text',
      options: [
        { value: 'text', label: 'Text' },
        { value: 'timecode', label: 'Live timecode' },
      ],
    }),
    status: c.text({ label: 'Status label', default: 'REC', maxLength: 8, optional: true }),
    scanlines: c.toggle({ label: 'Scanlines', default: true }),
    size: c.choice({
      label: 'Size',
      default: 'm',
      options: [
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
        { value: 'l', label: 'L' },
      ],
    }),
    anchor: c.choice({
      label: 'Anchor',
      group: 'layout',
      default: 'bottom-left',
      options: ANCHORS,
      display: 'select',
    }),
  },
  looks: [
    {
      id: 'graphite',
      name: 'Graphite',
      palette: { kind: 'library', id: 'graphite' },
      pairing: 'technical',
    },
    { id: 'ink', name: 'Ink', palette: { kind: 'library', id: 'ink' }, pairing: 'technical' },
    {
      id: 'midnight',
      name: 'Midnight',
      palette: { kind: 'library', id: 'midnight' },
      pairing: 'mono',
      values: { dataMode: 'timecode', status: 'LIVE' },
    },
  ],
  timing: ({ props }) => ({
    in: 1.3,
    out: 0.42,
    tail: CLEAN_END,
    readable: `${props.name} ${props.role}`,
  }),
  build: (ctx) => {
    const { frame, props, pairing, palette, energy, text, timeline } = ctx;
    const { u } = frame;
    const { bg, fg, accent } = palette.roles;
    const area = frame.vertical ? frame.safe.social : frame.safe.title;
    const { v, h } = placement(props.anchor);
    const k = u * GRID[frame.format] * SIZES[props.size];
    const padX = 3.1 * k;
    const padY = 2.7 * k;

    // --- type -------------------------------------------------------------------------------
    const display = pairing.display;
    const room = area.w * MEASURE[frame.format] - 2 * padX;
    const statusText = props.status.trim().toLocaleUpperCase('en');
    const statusStyle: TextStyle = {
      font: MONO,
      size: 1.8 * k,
      weight: 600,
      tracking: 0.12,
      case: 'upper',
    };
    const status: TextBlock | null = statusText
      ? text.layout(statusText, {
          style: statusStyle,
          maxWidth: room,
          maxLines: 1,
          lineHeight: 1,
          align: 'left',
        })
      : null;
    const dotR = 0.42 * k;
    const statusW = status ? 2 * dotR + 0.9 * k + status.ink.x + status.ink.w : 0;
    const statusGap = status ? 2.4 * k : 0;

    const nameStyle: TextStyle = {
      font: display.font,
      italicFont: display.italic,
      size: 4.6 * k,
      weight: Math.max(display.weight, 700),
      width: display.width !== undefined ? 108 : undefined,
      tracking: display.tracking + 0.04,
      features: display.features,
      case: 'upper',
    };
    const nameText = props.name.trim() || ' ';
    const layoutName = (maxLines: number, fit: number) =>
      text.layout(nameText, {
        style: nameStyle,
        maxWidth: room - statusW - statusGap,
        maxLines,
        lineHeight: 1.02,
        align: 'left',
        fit: { minSize: nameStyle.size * fit },
      });
    let name = layoutName(1, 0.7);
    if (name.overflow) name = layoutName(2, 0.6);

    const roleText = props.role.trim();
    const role: TextBlock | null = roleText
      ? (() => {
          const style: TextStyle = {
            font: display.font,
            size: 2.3 * k,
            weight: 500,
            width: display.width,
            tracking: 0.12,
            features: display.features,
            case: 'upper',
          };
          const one = text.layout(roleText, {
            style,
            maxWidth: room,
            maxLines: 1,
            lineHeight: 1.3,
            align: 'left',
            fit: { minSize: Math.max(2.4 * u, style.size * 0.84) },
          });
          return one.overflow
            ? text.layout(roleText, { style, maxWidth: room, maxLines: 2, lineHeight: 1.3 })
            : one;
        })()
      : null;

    const dataSize = 2.1 * k;
    const timecodeMode = props.dataMode === 'timecode';
    const dataText = props.data.trim();
    const dataStyle: TextStyle = { font: MONO, size: dataSize, weight: 450, tracking: 0.02 };
    const data: TextBlock | null =
      !timecodeMode && dataText
        ? text.layout(dataText, {
            style: dataStyle,
            maxWidth: room,
            maxLines: 1,
            lineHeight: 1.2,
            align: 'left',
            fit: { minSize: Math.max(1.8 * u, dataSize * 0.7) },
          })
        : null;
    const odometer = timecodeMode ? createOdometer(text, { ...dataStyle, tracking: 0 }) : null;
    const tcSample = '00:00:00:00';
    const dataW = odometer ? odometer.width(tcSample) : data ? data.ink.x + data.ink.w : 0;
    const dataCap = odometer ? odometer.capHeight : (data?.capHeight ?? 0);
    const hasData = odometer !== null || data !== null;

    // --- block (local: y = 0 is the name's cap height) --------------------------------------
    const nameBase = name.height;
    const roleY = nameBase + 1.5 * k;
    const lastBase = role ? roleY + role.height : nameBase;
    const dataY = lastBase + 1.7 * k;
    const dataBase = dataY + dataCap;
    const contentH = (hasData ? dataBase : lastBase) + 0.3 * (hasData ? dataSize : 2.3 * k);
    const nameRight = name.ink.x + name.ink.w;
    const blockW = Math.max(
      nameRight + (status ? statusGap + statusW : 0),
      role ? role.ink.x + role.ink.w : 0,
      dataW,
    );
    const frameW = blockW + 2 * padX;
    const frameH = contentH + 2 * padY;
    const frameX =
      h === 'left' ? area.x : h === 'right' ? area.x + area.w - frameW : frame.cx - frameW / 2;
    const frameY =
      v === 'top'
        ? area.y + u
        : v === 'bottom'
          ? area.y + area.h - u - frameH
          : area.y + (area.h - frameH) / 2;
    const box: Rect = { x: frameX, y: frameY, w: frameW, h: frameH };
    const ox = frameX + padX;
    const oy = frameY + padY;

    const shift = (r: Rect, x: number, y: number): Rect => ({
      x: r.x + x,
      y: r.y + y,
      w: r.w,
      h: r.h,
    });
    const nameBounds = shift(name.ink, ox, oy);
    const roleBounds = role ? shift(role.ink, ox, oy + roleY) : null;
    const dataBounds: Rect | null = hasData ? { x: ox, y: oy + dataY, w: dataW, h: dataCap } : null;
    const statusX = ox + blockW - statusW;
    const statusCy = oy + name.capHeight / 2;
    const statusLabelX = statusX + 2 * dotR + 0.9 * k - (status?.ink.x ?? 0);
    const statusLabelY = statusCy - (status?.capHeight ?? 0) / 2;
    const statusBounds = status ? shift(status.ink, statusLabelX, statusLabelY) : null;
    const armLength = Math.min(2.6 * k, frameH * 0.3);

    // --- choreography (Balanced seconds into `in`; the 24 fps grid for mechanical steps) -----
    const grid = (time: number) => Math.ceil(time * 24 - 1e-6) / 24;
    const at = (offset: number) => timeline.at('in', offset);
    const scramble = createScramble(text, name, nameStyle, ctx.rng('scramble'));
    const count = scramble.count;
    const lockRng = ctx.rng('locks');
    const arriveGap = Math.min(0.045, 0.45 / Math.max(1, count - 1));
    const arrive = new Float64Array(count);
    const lock = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      arrive[i] = grid(at(0.2 + i * arriveGap));
      lock[i] = grid(at(0.2 + i * arriveGap + lockRng.range(0.15, 0.3)));
    }
    const dataChars = odometer ? tcSample.length : (data?.glyphCount ?? 0);
    const perChar = Math.min(0.03, 0.9 / Math.max(1, dataChars));
    const dataStart = grid(at(0.62));
    const typed = (t: number) =>
      t < dataStart ? 0 : Math.min(dataChars, Math.floor((t - dataStart) / perChar + 1e-6) + 1);
    const typingEnd = dataStart + dataChars * perChar;
    const outStart = timeline.sections.out.start;
    const holdStart = timeline.sections.hold.start;
    const glitchEnd = outStart + 2 / 24;
    const flyIn = ctx.travel(2 * u);
    // Calm glides the brackets in and flickers at 12 fps; Punchy lands them with a pop.
    const landing = energy.overshoot === 2 ? 'pop' : energy.id === 'calm' ? 'glide' : 'snap';
    const rate = energy.id === 'calm' ? 12 : 24;
    const cornerGap = ctx.stagger(0.03);
    const breath = 0.2 * u;

    // Locked glyphs of the name, and the revealed glyphs of the data line.
    const locked = new Uint8Array(Math.max(1, count));
    const plain: GlyphTransform = {};
    const lockedGlyph = (glyph: Glyph): GlyphTransform | null =>
      locked[glyph.index] ? plain : null;
    let revealed = 0;
    const revealGlyph = (glyph: Glyph): GlyphTransform | null =>
      glyph.index < revealed ? plain : null;

    // Scanlines: bands through the bracket area, built once per output pixel size.
    const bands = new Map<number, { path: PathCommand[] }>();
    const scanPath = (pixel: number) => {
      const pitch = Math.max(SCAN_PITCH * u, 3 * pixel);
      const key = Math.round(pitch * 100);
      let path = bands.get(key);
      if (!path) {
        const commands: PathCommand[] = [];
        const lit = Math.max(pixel, pitch * 0.45);
        for (let y = box.y + pitch * 0.5; y + lit < box.y + box.h; y += pitch) {
          commands.push(
            ['M', box.x, y],
            ['L', box.x + box.w, y],
            ['L', box.x + box.w, y + lit],
            ['L', box.x, y + lit],
            ['Z'],
          );
        }
        path = { path: commands };
        bands.set(key, path);
      }
      return path.path;
    };

    /** Right edge of the first `n` glyphs of the data line (block coordinates). */
    const dataGlyphRight = (n: number): number => {
      const line = data?.lines[0];
      const glyph = line?.glyphs[Math.min(n, line.glyphs.length) - 1];
      return line && glyph ? line.x + glyph.x + glyph.advance : 0;
    };

    // Everything the HUD's text draws, in given colors (the RGB split draws it three times).
    const [inkRed, inkGreen, inkBlue] = channels(fg);
    const [signalRed, signalGreen, signalBlue] = channels(accent);
    let roleShown = 0;
    const drawText = (g: Draw, ink: Color, signal: Color, dx: number, t: number) => {
      g.text(name, { fill: ink, x: ox + dx, y: oy, glyph: lockedGlyph });
      if (role && roleShown > 0) {
        g.text(role, { fill: ink, x: ox + dx, y: oy + roleY, opacity: 0.74 * roleShown });
      }
      if (data) g.text(data, { fill: signal, x: ox + dx, y: oy + dataY, glyph: revealGlyph });
      if (odometer && revealed > 0) {
        const elapsed = Math.max(0, stepped(t - dataStart, TC_FPS));
        odometer.draw(g, timecode(elapsed).slice(0, revealed), {
          x: ox + dx,
          y: oy + dataBase,
          fill: signal,
        });
      }
    };

    return {
      render: ({ t, g, tl }) => {
        g.fill(bg, { background: true });
        const px = g.pixel;
        const now = stepped(t, 24);
        const tick = Math.round(stepped(t, rate) * rate);

        // Brackets: fly in from 2u outside, breathe 0.2u every 2 s, collapse to the center.
        const collapse = tl.p(t, 'out', { delay: 0.06, dur: 0.32 }, 'exit');
        const held = t - holdStart;
        // The breath runs on into the exit, fading as the brackets collapse (no jump).
        const pulse =
          held > 0
            ? Math.sin(Math.PI * Math.min(1, (held % 2) / 0.9)) ** 2 * breath * (1 - collapse)
            : 0;
        const thickness = Math.max(1, Math.round((0.3 * k) / px)) * px;
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;

        g.movable('lockup', box, (g) => {
          // Scanlines (6%) fill the bracket area once the brackets are in.
          const scan = tl.p(t, 'in', { delay: 0.15, dur: 0.3 }) * (1 - collapse);
          if (props.scanlines && scan > 0) {
            g.path(scanPath(px), { fill: fg, opacity: SCAN_OPACITY * scan });
          }

          for (let corner = 0; corner < 4; corner++) {
            const sx = corner % 2 === 0 ? -1 : 1;
            const sy = corner < 2 ? -1 : 1;
            const p = tl.p(t, 'in', { delay: corner * cornerGap, dur: 0.3 }, landing);
            if (p <= 0) continue;
            const out = flyIn * (1 - p) + pulse;
            let x = (sx < 0 ? box.x : box.x + box.w) + sx * out;
            let y = (sy < 0 ? box.y : box.y + box.h) + sy * out;
            x += (cx - x) * collapse;
            y += (cy - y) * collapse;
            // At rest the corner sits on the pixel grid; the breath moves in whole pixels.
            if (p >= 1 && collapse <= 0) {
              x = Math.round(x / px) * px;
              y = Math.round(y / px) * px;
            }
            const length = Math.round((armLength * (1 - 0.7 * collapse)) / px) * px;
            const opacity = Math.min(1, p * 4) * (1 - collapse);
            if (opacity <= 0 || length <= 0) continue;
            const hx = sx < 0 ? x : x - length;
            const hy = sy < 0 ? y : y - thickness;
            const vx = sx < 0 ? x : x - thickness;
            const vy = sy < 0 ? y : y - length;
            g.rect({ x: hx, y: hy, w: length, h: thickness }, { fill: accent, opacity });
            g.rect({ x: vx, y: vy, w: thickness, h: length }, { fill: accent, opacity });
          }

          // Text: decodes in, types in; gone after the exit's two-frame glitch.
          if (now < glitchEnd) {
            for (let i = 0; i < count; i++) locked[i] = now >= (lock[i] ?? 0) ? 1 : 0;
            revealed = typed(now);
            roleShown = tl.p(t, 'in', { delay: 0.6, dur: 0.5 }, 'drift');
            if (now >= outStart) {
              // Two frames of RGB split: channel copies pulled apart, added back together.
              const first = now < outStart + 1 / 24;
              const d = (first ? 0.9 : -0.6) * u;
              g.layer({ bounds: { x: box.x - 2 * u, y: box.y, w: box.w + 4 * u, h: box.h } }, (g) =>
                g.group({ blend: 'lighter', x: first ? 0 : 0.4 * u }, (g) => {
                  drawText(g, inkRed, signalRed, -d, t);
                  drawText(g, inkGreen, signalGreen, 0, t);
                  drawText(g, inkBlue, signalBlue, d, t);
                }),
              );
            } else {
              drawText(g, fg, accent, 0, t);
              // Scrambling characters, in the signal color.
              for (let i = 0; i < count; i++) {
                if (now >= (arrive[i] ?? 0) && !locked[i]) {
                  scramble.draw(g, i, tick, accent, ox, oy);
                }
              }
              // The typing cursor rides the data line until it is complete.
              if (revealed > 0 && now < typingEnd + 0.15) {
                const x = odometer
                  ? ox + odometer.width(tcSample.slice(0, revealed))
                  : ox + dataGlyphRight(revealed);
                g.rect(
                  { x: x + 0.25 * dataSize, y: oy + dataY, w: 0.55 * dataSize, h: dataCap },
                  { fill: accent, opacity: 0.85 },
                );
              }
              // Status: a dot blinking at 1 Hz (stepped) and its label.
              if (status) {
                const shown = tl.p(t, 'in', { delay: 0.35, dur: 0.2 });
                if (shown > 0) {
                  const on = held <= 0 || Math.floor(stepped(held, 24) * 2) % 2 === 0;
                  if (on) {
                    g.circle(statusX + dotR, statusCy, dotR, { fill: accent, opacity: shown });
                  }
                  g.text(status, {
                    fill: fg,
                    x: statusLabelX,
                    y: statusLabelY,
                    opacity: 0.9 * shown,
                  });
                }
              }
            }
          }

          g.editable('name', nameBounds);
          if (roleBounds) g.editable('role', roleBounds);
          if (data && dataBounds) g.editable('data', dataBounds);
          if (statusBounds) g.editable('status', statusBounds);
        });
      },
    };
  },
});
