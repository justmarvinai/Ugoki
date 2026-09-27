/** The keyboard shortcuts (docs/02-experience.md §8), for the `?` sheet. */

const mod = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export function ShortcutList() {
  const m = mod();
  const rows: [string[], string][] = [
    [['Space'], 'Play / pause'],
    [['←', '→'], 'Previous / next frame'],
    [['Shift', '←', '→'], '1 s back / forward'],
    [['Home', 'End'], 'Start / end'],
    [[m, 'Z'], 'Undo'],
    [[m, 'Shift', 'Z'], 'Redo'],
    [[m, 'E'], 'Export'],
    [[m, 'S'], 'Saved on this device (it saves as you go)'],
    [['1', '2', '3', '4'], '16:9 · 9:16 · 1:1 · 4:5'],
    [['G'], 'Safe-area guides'],
    [['L'], 'Loop'],
    [['←', '↑', '→', '↓'], 'Move the selected element (Shift: ×10)'],
    [['R'], 'Reset the selected element’s position'],
    [['Esc'], 'Deselect / close'],
    [['?'], 'This list'],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-3 text-[13px]">
      {rows.map(([keys, action]) => (
        <div key={action} className="contents">
          <dt className="flex gap-1">
            {keys.map((key) => (
              <kbd
                key={key}
                className="min-w-6 rounded-sm border border-line bg-bg-3 px-1.5 py-0.5 text-center font-mono text-[11px] text-fg"
              >
                {key}
              </kbd>
            ))}
          </dt>
          <dd className="text-fg-2">{action}</dd>
        </div>
      ))}
    </dl>
  );
}
