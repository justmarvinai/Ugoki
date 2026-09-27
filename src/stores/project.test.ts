import { describe, expect, it } from 'vitest';
import type { DesignState } from '@/engine/host';
import { createProjectStore } from './project';

const design: DesignState = {
  templateId: 'rise',
  templateVersion: 1,
  props: { headline: 'Hello' },
  format: '16:9',
  duration: 5,
  energy: 'balanced',
  palette: { kind: 'library', id: 'ink' },
  pairing: 'grotesk',
  transparent: false,
  finish: 'clean',
  seed: 1,
  layout: {},
};

function store() {
  let now = 0;
  const project = createProjectStore({ now: () => now });
  project.getState().load(design, { name: 'Rise', draftId: null });
  return { project, advance: (ms: number) => (now += ms) };
}

describe('project store', () => {
  it('changes the design and undoes every change', () => {
    const { project } = store();
    const { change } = project.getState();
    change({ energy: 'punchy' });
    change((d) => ({ ...d, props: { ...d.props, headline: 'Hi' } }));
    expect(project.getState().design?.props.headline).toBe('Hi');
    expect(project.getState().canUndo).toBe(true);
    project.getState().undo();
    expect(project.getState().design?.props.headline).toBe('Hello');
    expect(project.getState().design?.energy).toBe('punchy');
    project.getState().undo();
    expect(project.getState().design).toEqual(design);
    expect(project.getState().canUndo).toBe(false);
    project.getState().redo();
    expect(project.getState().design?.energy).toBe('punchy');
    expect(project.getState().canRedo).toBe(true);
  });

  it('ignores changes to the same values', () => {
    const { project } = store();
    project.getState().change({ energy: 'balanced' });
    project.getState().change((d) => ({ ...d }));
    expect(project.getState().canUndo).toBe(false);
  });

  it('undoes typing as one step per pause', () => {
    const { project, advance } = store();
    for (const headline of ['H', 'He', 'Hey']) {
      project.getState().change((d) => ({ ...d, props: { ...d.props, headline } }), {
        coalesce: 'props.headline',
      });
      advance(150);
    }
    advance(600);
    project.getState().change((d) => ({ ...d, props: { ...d.props, headline: 'Hey!' } }), {
      coalesce: 'props.headline',
    });
    project.getState().undo();
    expect(project.getState().design?.props.headline).toBe('Hey');
    project.getState().undo();
    expect(project.getState().design?.props.headline).toBe('Hello');
  });

  it('starts history over when a design loads', () => {
    const { project } = store();
    project.getState().change({ energy: 'calm' });
    project.getState().load({ ...design, templateId: 'line' }, { draftId: 'd1' });
    expect(project.getState().canUndo).toBe(false);
    expect(project.getState().draftId).toBe('d1');
    expect(project.getState().name).toBe('Rise');
  });
});
