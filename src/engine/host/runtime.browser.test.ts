import { describe, expect, it } from 'vitest';
import { c } from '../template/controls';
import { type AnyTemplate, defineTemplate } from '../template/define';
import type { DesignState } from '../template/state';
import { RenderClient } from './client';
import { createInlineEndpoint } from './inline';
import type { WorkerMessage } from './protocol';

const probe = defineTemplate({
  id: 'probe',
  version: 1,
  meta: {
    name: 'Probe',
    tagline: 'Runtime test template',
    category: 'text-titles',
    tags: [],
    useCases: [],
  },
  formats: ['1:1', '16:9'],
  structure: 'in-hold-out',
  duration: { default: 4, min: 2, max: 10 },
  alpha: 'optional',
  poster: 1,
  palettes: [{ kind: 'library', id: 'paper' }],
  pairings: ['grotesk'],
  controls: {
    headline: c.text({ label: 'Headline', default: 'Probe', maxLength: 20, primary: true }),
    explode: c.toggle({ label: 'Throw in build', default: false }),
  },
  looks: [
    { id: 'paper', name: 'Paper', palette: { kind: 'library', id: 'paper' }, pairing: 'grotesk' },
    {
      id: 'ink',
      name: 'Ink',
      palette: { kind: 'library', id: 'ink' },
      pairing: 'grotesk',
      values: { headline: 'Ink' },
    },
  ],
  timing: () => ({ in: 0.5, out: 0.5 }),
  build: ({ props, text, palette, pairing, frame }) => {
    if (props.explode) throw new Error('boom');
    const block = text.layout(props.headline, {
      style: { font: pairing.display.font, size: 120, weight: pairing.display.weight },
      maxWidth: frame.width,
      lineHeight: 1,
    });
    const bounds = { x: 100, y: 100, w: block.width, h: block.height };
    return {
      render: ({ g }) => {
        g.fill(palette.roles.bg, { background: true });
        g.movable('title', bounds, (g) => {
          g.text(block, { fill: palette.roles.fg, x: 100, y: 100 });
          g.editable('headline', bounds);
        });
      },
    };
  },
});

function setup() {
  const endpoint = createInlineEndpoint(async (id) => {
    if (id !== 'probe') throw new Error(`Unknown template ${id}`);
    return probe as AnyTemplate;
  });
  const client = new RenderClient(endpoint);
  const messages: WorkerMessage[] = [];
  const waiters: Array<{
    match: (m: WorkerMessage) => boolean;
    resolve: (m: WorkerMessage) => void;
  }> = [];
  client.subscribe((message) => {
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.match(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });
  const next = <T extends WorkerMessage['type']>(type: T, view = 'a') =>
    new Promise<Extract<WorkerMessage, { type: T }>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 5000);
      waiters.push({
        match: (m) => m.type === type && (!('view' in m) || m.view === view),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<WorkerMessage, { type: T }>);
        },
      });
    });
  const canvas = new OffscreenCanvas(1, 1);
  return { client, messages, next, canvas };
}

describe('RenderRuntime', () => {
  it('loads a template, builds it and renders frames', async () => {
    const { client, next, canvas } = setup();
    client.attach('a', canvas, { width: 270, height: 270, dpr: 2 }, true);
    const loaded = next('loaded');
    const built = next('built');
    const frame = next('frame');
    const regions = next('regions');
    client.load('a', 'probe', { look: 1 });

    const { template, state } = await loaded;
    expect(template.id).toBe('probe');
    expect(template.controls.headline?.kind).toBe('text');
    expect(state.props.headline).toBe('Ink');
    expect(state.palette).toEqual({ kind: 'library', id: 'ink' });

    expect((await built).duration).toBe(4);
    const first = await frame;
    expect(first.playing).toBe(false);
    expect(first.quality).toBe(1);
    // 270 CSS px × DPR 2 = 540 px for a 1080-unit frame.
    expect(canvas.width).toBe(540);

    const { regions: list } = await regions;
    expect(list.map((r) => r.id).sort()).toEqual(['editable:headline', 'movable:title']);
    client.dispose();
  });

  it('seeks, snapshots and keeps the last good scene when a build fails', async () => {
    const { client, next, canvas } = setup();
    client.attach('a', canvas, { width: 200, height: 200, dpr: 1 });
    const loaded = next('loaded');
    client.load('a', 'probe');
    const { state } = await loaded;
    await next('frame');

    const seeked = next('frame');
    client.seek('a', 2.5);
    expect((await seeked).t).toBe(2.5);

    const blob = await client.snapshot('a', 1, 720);
    expect(blob.type).toBe('image/png');
    const bitmap = await createImageBitmap(blob);
    expect([bitmap.width, bitmap.height]).toEqual([720, 720]);

    const failed = next('error');
    const broken: DesignState = { ...state, props: { ...state.props, explode: true } };
    client.setState('a', broken);
    const error = await failed;
    expect(error.phase).toBe('build');
    expect(error.message).toBe('boom');

    // The previous scene still renders.
    const again = next('frame');
    client.seek('a', 1);
    expect((await again).t).toBe(1);
    client.dispose();
  });

  it('plays, loops and pauses', async () => {
    const { client, next, canvas } = setup();
    client.attach('a', canvas, { width: 100, height: 100, dpr: 1 });
    const loaded = next('loaded');
    client.load('a', 'probe', { state: { format: '16:9', duration: 2 } });
    const { state } = await loaded;
    expect(state.format).toBe('16:9');
    expect(state.duration).toBe(2);
    await next('built');

    client.seek('a', 1.9);
    await next('frame');
    client.play('a');
    // Wait for a frame that wrapped around the 2 s loop.
    const wrapped = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no loop')), 3000);
      const unsubscribe = client.subscribe((m) => {
        if (m.type === 'frame' && m.playing && m.t < 1) {
          clearTimeout(timer);
          unsubscribe();
          resolve(m.t);
        }
      });
    });
    expect(wrapped).toBeGreaterThanOrEqual(0);
    const paused = next('frame');
    client.pause('a');
    expect((await paused).playing).toBe(false);
    client.dispose();
  });

  it('answers snapshots requested before the scene is built', async () => {
    const { client, canvas } = setup();
    client.attach('a', canvas, { width: 100, height: 100, dpr: 1 });
    client.load('a', 'probe');
    // Requested in the same task as the load: the template, fonts and scene aren't ready yet.
    const blob = await client.snapshot('a', 1, 360);
    const bitmap = await createImageBitmap(blob);
    expect([bitmap.width, bitmap.height]).toEqual([360, 360]);
    await expect(client.snapshot('nope', 1, 360)).rejects.toThrow('no scene');
    client.dispose();
  });

  it('reports unknown templates', async () => {
    const { client, next, canvas } = setup();
    client.attach('a', canvas, { width: 100, height: 100, dpr: 1 });
    const error = next('error');
    client.load('a', 'nope');
    expect((await error).phase).toBe('load');
    client.dispose();
  });
});
