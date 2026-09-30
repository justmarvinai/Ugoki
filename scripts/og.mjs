#!/usr/bin/env node
/**
 * `pnpm og [filter…]` — renders the site's pre-rendered images with the engine (see
 * tests/og/og.og.ts): the Open Graph cards in `public/og/` (1200 × 630 JPEG), the landing's hero
 * posters in `public/posters/` (WebP) and `src/app/apple-icon.png`; then lists what it wrote.
 *
 * Without a filter everything renders. A filter names outputs: a key (`home`, `templates`,
 * `hero-16x9`, `apple-icon`), a template id (`rise` → `template-rise`), a category id
 * (`social` → `templates-social`), or a group: `posters`, `cards`, `categories`, `template`,
 * `icon`. Contact sheets of the cards land in `.cache/og/`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';

const filters = process.argv.slice(2);
const started = Date.now();
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--project', 'og'], {
  stdio: 'inherit',
  // `*`: everything. The project renders nothing unless asked (e.g. by a bare `vitest run`).
  env: { ...process.env, OG: filters.join(',') || '*' },
});

const files = (dir) => (existsSync(dir) ? readdirSync(dir).map((name) => `${dir}/${name}`) : []);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const written = [...files('public/posters'), ...files('public/og'), 'src/app/apple-icon.png']
  .filter((path) => existsSync(path) && statSync(path).mtimeMs >= started)
  .map((path) => ({ path, size: statSync(path).size }));
for (const { path, size } of written) console.log(`og: ${path.padEnd(40)} ${kb(size)}`);
const cards = files('public/og').map((path) => statSync(path).size);
if (cards.length > 0) {
  const total = cards.reduce((sum, size) => sum + size, 0);
  console.log(
    `og: ${written.length} files written; public/og holds ${cards.length} cards, ${kb(total)}`,
  );
}
process.exit(result.status ?? 1);
