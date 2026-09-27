# CLAUDE.md — Ugoki

Ugoki (動き, "movement") is a browser-based motion design tool: users pick an art-directed template, customize it (text, colors, images, timing, layout), preview it live and export video — **rendered entirely on the user's device**. Flow: **Choose → Customize → Preview → Export.**

## Current phase: 3 — Template wave 1

- The owner gave the go-ahead to code on 2026-09-26. Work phase by phase as laid out in `ROADMAP.md`; don't start a new phase's scope without finishing (or explicitly re-planning) the current one.
- Phases 1 (0.1.0) and 2 (0.2.0) are merged. Phase 3 (scope and exit in `ROADMAP.md`) goes to `main` as one PR. The repo is on Vercel (O3, 2026-09-26): every branch and PR gets a preview deployment (Vercel comments its URL on the PR) — link it in the PR.
- **Pace (owner, 2026-09-27, E6)**: finish phases faster — still working and looking good, but no excessive checking. **Don't watch PRs or CI** (no PR subscriptions, no CI babysitting); the owner tests the preview and reports what's broken. Run the fast local checks listed under Workflow, parallelize independent work, and judge templates on contact sheets (`pnpm sheet`).
- The owner's decisions (2026-09-26) are recorded in `USER_QUESTIONS.md` — a decision table plus open items (O1 = the go-ahead). New product/brand questions go there too; when answered, update the affected docs and ADRs.
- Progress is tracked in `ROADMAP.md` (tick boxes as work lands).

## Where things are

| Doc | Read it when |
|---|---|
| `docs/01-product.md` | Scope questions, personas, principles, non-goals |
| `docs/02-experience.md` | Building any screen or flow (landing, gallery, editor, export) |
| `docs/03-design-system.md` | Any UI: tokens, type, components, UI motion, anti-patterns |
| `docs/04-motion-language.md` | Any animation: easing names, springs, Energy, timing rules |
| `docs/05-architecture.md` | Stack, structure, state, persistence, security, testing, CI |
| `docs/06-engine.md` | Engine work and the template contract |
| `docs/07-export.md` | Encoding, codecs per browser, alpha, file saving |
| `docs/08-decisions.md` | Why something is the way it is (ADRs); append new decisions; Phase 1 spike results |
| `docs/templates/00-foundations.md` | Palettes, fonts, placeholders, quality bar — before any template |
| `docs/templates/NN-*.md` | The spec of the template you are implementing |

## Non-negotiables

1. **Vercel Hobby, no database.** No API routes, no serverless functions, no server rendering of video. Every route is prerendered; CI fails if the build emits functions.
2. **Nothing leaves the device.** No uploads, no cookies, **no analytics, telemetry or error monitoring of any kind** (ADR-016), no third-party requests at runtime (fonts, scripts and WASM are self-hosted). User files live only in IndexedDB.
3. **Preview = export.** One deterministic engine renders both. Templates are pure functions of `(props, format, t)`.
4. **Licenses**: no GSAP (license forbids visual animation builders), no Remotion, no AGPL/GPL code in the bundle (e.g. gifski, ffmpeg.wasm core), fonts are SIL OFL only (no Fontshare/ITF fonts).
5. **No stock imagery.** Defaults use the engine's procedural placeholders; marketing uses live renders.
6. **Design stance** (decided — ADR-015): monochrome interface, "color belongs to the work", Mona Sans, the `ugoki` wordmark with the Dot, tagline **"Motion, made yours."** Respect the anti-pattern list in `docs/03-design-system.md` §11.
7. **Quality bar**: every template meets `docs/templates/00-foundations.md` §9 before it ships.
8. **Free, no strings**: no sign-up, no payments, no watermark, no end card (exports only carry the `ugoki-` filename prefix), no AI features for now. **Budget is €0** — never add paid services, assets or APIs.
9. **German private operator**: Impressum + Datenschutzerklärung pages are required (ADR-017); never add anything that would need a cookie banner.
10. **Large screens matter**: the owner reviews on a 2560 × 1440 desktop — check every screen at 2560 px as well as 1440, 1280 and 375 px.

## Stack (verified 2026-09-26)

Next.js 16.3.6 (App Router, Turbopack) · React 19.3.0 (React Compiler on) · TypeScript 7.0.2 · Tailwind CSS 4.3.3 · Biome 2.5.14 (lint + format; no ESLint — typescript-eslint doesn't support TS 7 yet) · Base UI 1.8.0 · Motion 13.4.4 (`motion/react`) · harfbuzzjs 1.6.2 · Mediabunny 1.60.0 · Vitest 5.0.2 · Playwright 1.63.0 · pnpm 10.34.5 (Vercel doesn't detect pnpm 11/12) · Node 24.x. Versions are pinned exactly in `package.json`.

Added with the features that need them: Zustand ^5.0.15, Zod ^4.6.5 (share-link envelope — the engine sanitizes its own inputs, ADR-018), Dexie ^4.4.6, fflate ~0.8.3, modern-gif ^2.1.0 (ADR-025). The engine has its own OKLCH color code (no culori).

Don't add dependencies casually: check license (MIT/ISC/Apache/BSD/MPL-2.0 OK), size, maintenance; record notable additions in `docs/05-architecture.md` §2.

## Commands

```bash
pnpm dev            # Next.js dev server (Turbopack) — the Lab is at /lab
pnpm build          # production build + scripts/assert-static.mjs (fails if any route isn't prerendered)
pnpm start          # serve the production build
pnpm typecheck      # next typegen (route types like LayoutProps) + tsc --noEmit (TypeScript 7)
pnpm lint           # biome check .   (pnpm lint:fix to apply fixes)
pnpm format         # biome format --write .
pnpm test           # vitest unit tests (Node; HarfBuzz runs in Node too)
pnpm test:browser   # vitest browser mode: engine, runtime, worker, template checks, spikes
pnpm test:golden    # golden frames (Chromium references; add --update to accept intentional changes)
pnpm test:e2e       # playwright against the production build (run pnpm build first)
pnpm sheet <id> [mode…]  # contact sheets of a template → .sheets/<id>-<mode>.png (timeline, looks, energy, duration, stress, transparent, big)
pnpm fonts          # rebuild fonts from pinned sources (python3 + fonttools[woff]==4.60.1)
pnpm check          # typecheck + lint + unit
```

- Browser tests pick browsers with `VITEST_BROWSERS=chromium,firefox,webkit` (default Chromium). Without Playwright's own browsers installed, point `PW_CHROMIUM_PATH` at a Chromium binary (both Vitest and Playwright honour it).
- `pnpm og` (Open Graph renders) arrives with the landing page (Phase 6).

## Structure & boundaries

```
src/app/         routes only (thin); design tokens in globals.css (@theme)
src/engine/      DOM-free, React-free, worker-safe engine — public API in src/engine/index.ts;
                 engine/host = main-thread client + pure data for features
src/templates/   registry.ts (metadata + lazy loaders) + <category>/<id>/index.ts (one defineTemplate each)
src/workers/     composition root: render.worker.ts + createRenderEndpoint()
src/features/    React features: editor, stage (+ overlay), inspector, transport, export, gallery (chooser), assets (file import), lab; drafts, share, landing next
src/components/  design-system primitives (Button, SegmentedControl, Slider, Switch, Wordmark)
src/design/      motion tokens, icons
src/fonts/       UI WOFF2s for next/font/local
src/stores/      Zustand stores: project (+ snapshot history), ui, playhead
src/lib/         small utilities
tests/           support/ (render harness), templates/, integration/, golden/, spikes/, e2e/
scripts/         fonts.py, assert-static.mjs
```

- `engine/**` must never import React, DOM APIs, `app`, `features`, `components`, `stores`, `templates` or `workers`.
- `templates/**` import only from `@/engine`.
- `features/**` reach the engine only through `engine/host` (the worker client) and create workers via `src/workers`.
- Template tests live in `tests/` (they need engine internals such as the renderer, which `templates/**` may not import).

## Engine rules (read `docs/06-engine.md` before engine work)

- `render` is pure and synchronous: no `Math.random`, `Date`, `performance.now`, globals, async or I/O. Use `ctx.rng(key)`.
- Everything that doesn't depend on `t` happens in `build`.
- Sizes, distances and blur radii are in `u` (1% of the frame's short side), never pixels.
- Use the named easings/springs from `docs/04-motion-language.md` — no ad-hoc bezier values.
- Text goes through the HarfBuzz text engine (not `fillText`), except the documented fallback for missing glyphs.
- Safari has **no Canvas `filter`** and **no `fontStretch`/`fontKerning`**: effects go through the WebGL2 compositor.
- Browsers cap live WebGL contexts (~16): one GL context per worker; gallery tiles use `bitmaprenderer`.
- Export: even frame dimensions (H.264), capability probing before offering options, Web Lock during export.

## Implementing a template

1. Read its spec in `docs/templates/` and `00-foundations.md`.
2. Build it against contact sheets (`pnpm sheet <id> timeline looks stress big …`) — all formats, all three energies, min/max duration, stress text (1 word, max length, diacritics, numbers), all its palettes + Brand palettes, transparent background if supported — then register it in `src/templates/registry.ts` (metadata + loader) and try it in `/lab` and the editor.
3. Implement "the expensive detail" from the spec — it is not optional.
4. Check the quality bar (foundations §9), render-cost budget (≤ 8 ms/frame @1080p-eq on the reference desktop), determinism (two renders identical).
5. Registering it is enough for the shared checks: `tests/templates/catalog.browser.test.ts` (clean edit points per format × Look, editable text inside title-safe with stress text, energies, min/max duration, transparency, loops, transition coverage, determinism) and `tests/golden/catalog.test.ts` (poster and entrance frames; accept new references with `pnpm test:golden --update`). Write a template-specific test only for behavior those can't see (see `rise.browser.test.ts`).
6. If you deviate from the spec, update the spec in the same PR and say why.

## Workflow

- Develop on the branch you were given; Conventional Commits (`feat(engine): …`, `feat(template/rise): …`, `fix(export): …`, `docs: …`).
- One PR per roadmap phase (target branch `main`), with a Vercel preview link and a short written walkthrough for the owner (decision E2).
- Before pushing: `pnpm check` (typecheck + lint + unit) and the browser tests for what changed (`tests/templates/catalog.browser.test.ts` covers every template); golden frames when templates/engine changed; `pnpm build && pnpm test:e2e` when routes or the worker path changed. Don't wait on CI after pushing (E6).
- Keep docs alive: `CHANGELOG.md` (Keep a Changelog) for user-visible changes, `ROADMAP.md` checkboxes, new ADRs in `docs/08-decisions.md` for architectural changes.
- Product/brand questions go to the user (add them to `USER_QUESTIONS.md`); technical choices within these docs' constraints can be made and logged as ADRs.
