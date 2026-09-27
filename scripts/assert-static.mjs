// Fails the build if any route would need a serverless function (docs/05-architecture.md §3):
// Ugoki must be fully prerendered to run on Vercel Hobby with no server compute.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = '.next';
const read = (file) => JSON.parse(readFileSync(join(dist, file), 'utf8'));

if (!existsSync(join(dist, 'prerender-manifest.json'))) {
  console.error('assert-static: .next/prerender-manifest.json not found — run `next build` first.');
  process.exit(1);
}

const prerender = read('prerender-manifest.json');
const staticRoutes = new Set(Object.keys(prerender.routes ?? {}));
const appRoutes = existsSync(join(dist, 'app-path-routes-manifest.json'))
  ? Object.values(read('app-path-routes-manifest.json'))
  : [];

// Metadata files (favicon, icons, robots, sitemap) are emitted as static assets.
const isMetadataFile = (route) => /\.(ico|png|svg|jpg|txt|xml|webmanifest)$/.test(route);

// Dynamic segments are fine when every page is prerendered and anything else is a 404
// (`dynamicParams = false`, i.e. `fallback: false`) — as long as some page was prerendered.
const closed = new Set();
for (const [route, entry] of Object.entries(prerender.dynamicRoutes ?? {})) {
  if (entry.fallback !== false) continue;
  const pattern = new RegExp(entry.routeRegex);
  const pages = [...staticRoutes].filter((page) => pattern.test(page));
  if (pages.length > 0) closed.add(route);
}

const dynamic = appRoutes.filter(
  (route) =>
    !staticRoutes.has(route) &&
    !closed.has(route) &&
    !isMetadataFile(route) &&
    route !== '/_not-found',
);

if (dynamic.length > 0) {
  console.error('assert-static: these routes are not prerendered (they would become functions):');
  for (const route of dynamic) console.error(`  - ${route}`);
  process.exit(1);
}

console.log(
  `assert-static: OK — ${staticRoutes.size} prerendered routes${closed.size > 0 ? ` (${[...closed].join(', ')}: every page prerendered)` : ''}, no functions.`,
);
