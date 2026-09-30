#!/usr/bin/env node
/**
 * Licenses data for /legal/licenses. Run with `pnpm run licenses` after dependencies or fonts change
 * (plain `pnpm licenses` is pnpm's own license lister, which shadows the script).
 *
 * Collects Ugoki's production dependencies (package.json `dependencies`) and everything they
 * depend on at runtime, from node_modules — name, version, license, repository and the full
 * license text — plus the fonts (the engine's font manifest, the interface fonts and their OFL
 * texts in public/fonts/licenses/), and writes:
 *
 *   public/legal/third-party-notices.txt   every package with its full license (and NOTICE) text
 *   src/features/legal/licenses.json       what the licenses page lists (fonts and packages)
 *
 * Dependencies are resolved the way Node resolves them, so pnpm's symlinked layout works.
 * Optional and peer dependencies are not followed (Next.js' optional `sharp` and SWC binaries
 * are build tools and never ship); `@types/*` packages hold type declarations only.
 *
 * The output is deterministic (sorted, no timestamps): re-running without changes gives no diff.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTICES = join(ROOT, 'public', 'legal', 'third-party-notices.txt');
const DATA = join(ROOT, 'src', 'features', 'legal', 'licenses.json');
const FONT_MANIFEST = join(ROOT, 'src', 'engine', 'text', 'font-manifest.json');
const FONT_LICENSES = join(ROOT, 'public', 'fonts', 'licenses');

/**
 * Interface fonts (next/font, src/app/fonts.ts), built by scripts/fonts.py (UI_FONTS). Engine
 * fonts come from the manifest; `source` names the license file.
 */
const INTERFACE_FONTS = [
  {
    family: 'Ugoki Sans',
    source: 'mona-sans',
    credit: 'Mona Sans v2.0.27 by GitHub',
    use: 'interface',
  },
  {
    family: 'Ugoki Mono',
    source: 'mona-sans-mono',
    credit: 'Mona Sans Mono v2.0.27 by GitHub',
    use: 'interface',
  },
  {
    family: 'M PLUS 1',
    source: 'm-plus-1',
    credit: 'M PLUS 1 by the M+ FONTS Project Authors (Coji Morishita)',
    use: 'signature',
  },
];

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** Normalizes line endings and trailing whitespace; one final newline. */
const clean = (text) =>
  `${text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()}\n`;

// ——— Packages ———

/** The directory a dependency of the package in `from` resolves to (Node's lookup), or null. */
function resolvePackage(from, name) {
  const lookup = createRequire(join(from, 'package.json')).resolve.paths(name) ?? [];
  for (const directory of lookup) {
    const candidate = join(directory, name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
  }
  return null;
}

/** SPDX expression from `license` (string or legacy object) or the legacy `licenses` array. */
function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    const types = pkg.licenses.map((entry) => entry?.type ?? entry).filter(Boolean);
    if (types.length > 0) return types.length === 1 ? types[0] : `(${types.join(' OR ')})`;
  }
  return 'UNKNOWN';
}

/** A browsable https URL for the package's source. */
function repositoryOf(pkg) {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (raw) {
    let url = raw.trim();
    const shorthand = /^(github|gitlab|bitbucket):(.+)$/.exec(url);
    if (shorthand) {
      const host = { github: 'github.com', gitlab: 'gitlab.com', bitbucket: 'bitbucket.org' };
      url = `https://${host[shorthand[1]]}/${shorthand[2]}`;
    } else if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
      url = `https://github.com/${url}`;
    }
    url = url
      .replace(/^git\+/, '')
      .replace(/^git:\/\//, 'https://')
      .replace(/^ssh:\/\/git@/, 'https://')
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/#.*$/, '')
      .replace(/\/+$/, '')
      .replace(/\.git$/, '');
    if (url.startsWith('http://')) url = `https://${url.slice('http://'.length)}`;
    if (url.startsWith('https://')) return url;
  }
  if (typeof pkg.homepage === 'string' && pkg.homepage.startsWith('http')) return pkg.homepage;
  return `https://www.npmjs.com/package/${pkg.name}`;
}

/** The package's license and notice files (LICENSE, LICENCE, COPYING, NOTICE, …), in order. */
function licenseFilesOf(directory) {
  const rank = (name) => (/^notice/i.test(name) ? 1 : 0);
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && /^(licen[cs]e|copying|notice)([.\-_].*)?$/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((a, b) => rank(a) - rank(b) || byText(a.toLowerCase(), b.toLowerCase()));
}

function collectPackages() {
  const root = readJson(join(ROOT, 'package.json'));
  const direct = new Set(Object.keys(root.dependencies ?? {}));
  const found = new Map();
  const queue = [...direct].map((name) => ({ name, from: ROOT }));
  while (queue.length > 0) {
    const { name, from } = queue.shift();
    if (name.startsWith('@types/')) continue;
    const directory = resolvePackage(from, name);
    if (!directory) {
      throw new Error(
        `${name} (needed by ${relative(ROOT, from) || 'package.json'}) is not installed — run pnpm install.`,
      );
    }
    const pkg = readJson(join(directory, 'package.json'));
    const key = `${pkg.name}@${pkg.version}`;
    if (found.has(key)) continue;
    const files = licenseFilesOf(directory);
    found.set(key, {
      name: pkg.name,
      version: pkg.version,
      license: licenseOf(pkg),
      repository: repositoryOf(pkg),
      direct: direct.has(pkg.name) && from === ROOT,
      texts: files.map((file) => ({
        file,
        text: clean(readFileSync(join(directory, file), 'utf8')),
      })),
    });
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      queue.push({ name: dependency, from: directory });
    }
  }
  return [...found.values()].sort((a, b) => byText(a.name, b.name) || byText(a.version, b.version));
}

function noticesText(packages) {
  const rule = '='.repeat(80);
  const parts = [
    'Third-party notices',
    '===================',
    '',
    'Ugoki is built with the open-source packages below: its production dependencies and the',
    'packages they depend on, each with its license. The fonts and their licenses (SIL Open Font',
    'License 1.1) are listed on /legal/licenses; their license texts are in /fonts/licenses/.',
    '',
    'Generated by scripts/licenses.mjs (pnpm run licenses) from the installed packages.',
    '',
    `${packages.length} packages:`,
    '',
    ...packages.map((entry) => `  ${entry.name} ${entry.version} (${entry.license})`),
    '',
  ];
  for (const entry of packages) {
    parts.push(
      rule,
      `${entry.name} ${entry.version}`,
      `License: ${entry.license}`,
      `Repository: ${entry.repository}`,
      rule,
      '',
    );
    let texts = entry.texts;
    if (texts.length === 0) {
      // Packages from a monorepo sometimes ship without the repository's license file.
      const sibling = packages.find(
        (other) =>
          other.texts.length > 0 &&
          other.repository === entry.repository &&
          other.license === entry.license,
      );
      if (sibling) {
        parts.push(
          `The package ships no license file; this is the license of ${sibling.name} ${sibling.version},`,
          'published from the same repository under the same license.',
          '',
        );
        texts = sibling.texts;
      } else {
        parts.push(
          `The package ships no license file. It is published under the ${entry.license} license;`,
          `see ${entry.repository}.`,
          '',
        );
      }
    }
    for (const { file, text } of texts) {
      if (texts.length > 1) parts.push(`--- ${file} ---`, '');
      parts.push(text);
    }
  }
  return clean(parts.join('\n'));
}

// ——— Fonts ———

/** The copyright notice at the top of an OFL text (everything before the license statement). */
function copyrightOf(source) {
  const path = join(FONT_LICENSES, `${source}.txt`);
  if (!existsSync(path))
    throw new Error(`Missing font license ${relative(ROOT, path)} — run pnpm fonts.`);
  const [head] = readFileSync(path, 'utf8').split('This Font Software is licensed');
  const notice = head.replace(/\s+/g, ' ').trim();
  if (!notice) throw new Error(`No copyright notice in ${relative(ROOT, path)}.`);
  return notice;
}

function collectFonts() {
  const manifest = readJson(FONT_MANIFEST);
  /** Families in order: interface fonts first, then the templates' fonts by name. */
  const families = new Map();
  const add = ({ family, source, credit, use, italic }) => {
    const existing = families.get(family);
    if (existing) {
      if (!existing.use.includes(use)) existing.use.push(use);
      if (italic) existing.italic = true;
      return;
    }
    families.set(family, {
      family,
      credit,
      // Our builds are subsets (modified versions under the OFL); families with a Reserved Font
      // Name are renamed, so their credit names another family.
      renamed: !credit.startsWith(family),
      copyright: copyrightOf(source),
      license: 'OFL-1.1',
      licenseFile: `/fonts/licenses/${source}.txt`,
      use: [use],
      italic: Boolean(italic),
    });
  };
  for (const font of INTERFACE_FONTS) add(font);
  const engine = Object.entries(manifest.fonts)
    .map(([id, font]) => ({
      family: font.family,
      source: id,
      credit: font.credit.replace(/ Italic(?= by )/, ''),
      use: 'templates',
      italic: /-italic$/.test(id),
    }))
    // Upright styles first, so a family's credit and license link come from its roman.
    .sort((a, b) => byText(a.family, b.family) || Number(a.italic) - Number(b.italic));
  for (const font of engine) add(font);
  const interfaceCount = new Set(INTERFACE_FONTS.map((font) => font.family)).size;
  const list = [...families.values()];
  return [
    ...list.slice(0, interfaceCount),
    ...list
      .slice(interfaceCount)
      .sort((a, b) => byText(a.family.toLowerCase(), b.family.toLowerCase())),
  ];
}

// ——— Write ———

/**
 * JSON laid out the way Biome formats it (so `pnpm lint` passes on a fresh output): two-space
 * indents, and arrays of plain values on one line when that line fits in 100 columns.
 */
function toJson(value) {
  return `${JSON.stringify(value, null, 2).replace(
    /^( *)(.*)\[\n((?: *(?:"(?:[^"\\\n]|\\.)*"|[\d.eE+-]+|true|false|null),?\n)+) *\]/gm,
    (match, indent, head, body) => {
      const items = body
        .trim()
        .split(/,\n */)
        .map((item) => item.trim());
      const line = `${indent}${head}[${items.join(', ')}]`;
      return line.length <= 100 ? line : match;
    },
  )}\n`;
}

const packages = collectPackages();
const fonts = collectFonts();

mkdirSync(dirname(NOTICES), { recursive: true });
mkdirSync(dirname(DATA), { recursive: true });
writeFileSync(NOTICES, noticesText(packages));
writeFileSync(
  DATA,
  toJson({
    $comment: 'Generated by scripts/licenses.mjs (pnpm run licenses) — do not edit by hand.',
    fonts,
    packages: packages.map(({ texts: _texts, ...entry }) => entry),
  }),
);

const unlicensed = packages.filter((entry) => entry.texts.length === 0).map((entry) => entry.name);
console.log(`  ${packages.length} packages → ${relative(ROOT, NOTICES)}`);
console.log(`  ${fonts.length} font families + packages → ${relative(ROOT, DATA)}`);
if (unlicensed.length > 0) console.log(`  no license file in: ${unlicensed.join(', ')}`);
