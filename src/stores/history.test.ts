import { describe, expect, it } from 'vitest';
import { History } from './history';

function clock() {
  let now = 0;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('history', () => {
  it('undoes and redoes steps in order, and a new edit drops the redo steps', () => {
    const history = new History<number>();
    history.record(1);
    history.record(2);
    expect(history.undo(3)).toBe(2);
    expect(history.undo(2)).toBe(1);
    expect(history.undo(1)).toBeNull();
    expect(history.redo(1)).toBe(2);
    expect(history.canRedo).toBe(true);
    history.record(2);
    expect(history.canRedo).toBe(false);
    expect(history.redo(5)).toBeNull();
  });

  it('coalesces edits of one thing until they pause', () => {
    const time = clock();
    const history = new History<string>({ now: time.now, coalesceMs: 500 });
    // Typing "abc" into one field, a keystroke every 200 ms: one step.
    history.record('', 'title');
    time.advance(200);
    history.record('a', 'title');
    time.advance(200);
    history.record('ab', 'title');
    // A pause, then more typing: a new step.
    time.advance(800);
    history.record('abc', 'title');
    expect(history.undo('abcd')).toBe('abc');
    expect(history.undo('abc')).toBe('');
    expect(history.canUndo).toBe(false);
  });

  it('never joins edits of different things, or an edit after an undo', () => {
    const time = clock();
    const history = new History<string>({ now: time.now });
    history.record('a', 'title');
    time.advance(10);
    history.record('b', 'subtitle');
    expect(history.undo('c')).toBe('b');
    time.advance(10);
    history.record('b', 'subtitle');
    expect(history.undo('d')).toBe('b');
    expect(history.undo('b')).toBe('a');
  });

  it('keeps at most `limit` steps', () => {
    const history = new History<number>({ limit: 3 });
    for (let i = 0; i < 10; i++) history.record(i);
    expect(history.undo(10)).toBe(9);
    expect(history.undo(9)).toBe(8);
    expect(history.undo(8)).toBe(7);
    expect(history.undo(7)).toBeNull();
  });
});
