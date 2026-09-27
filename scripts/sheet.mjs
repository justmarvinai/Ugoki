#!/usr/bin/env node
/**
 * `pnpm sheet <template-id> [mode…]` — renders contact sheets of a template into `.sheets/`
 * (see tests/sheets/sheet.sheet.ts). Modes: timeline · looks · energy · duration · stress ·
 * transparent (default: timeline).
 */
import { spawnSync } from 'node:child_process';

const [id, ...modes] = process.argv.slice(2);
if (!id) {
  console.error(
    'usage: pnpm sheet <template-id> [timeline|looks|energy|duration|stress|transparent…]',
  );
  process.exit(1);
}
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--project', 'sheet'], {
  stdio: 'inherit',
  env: { ...process.env, SHEET: id, SHEET_MODE: modes.join(',') || 'timeline' },
});
process.exit(result.status ?? 1);
