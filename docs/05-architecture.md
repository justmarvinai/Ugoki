# 05 — Architecture

> Tech stack, system design, repository structure, state, persistence, performance, security, deployment and testing. The rendering engine has its own document ([`06-engine.md`](06-engine.md)), as does export ([`07-export.md`](07-export.md)). Decisions and their alternatives are logged in [`08-decisions.md`](08-decisions.md).

Versions and platform facts below were **verified on 2026-09-26** against npm, official changelogs, browser source/compat data and vendor docs.

---

## 1. Constraints & goals

| Constraint / goal | Consequence |
|---|---|
| Must fully work on **Vercel Hobby** (free) | Static-first; no server compute in the product path; lean assets (100 GB/month transfer) |
| **No database** | Local-first: IndexedDB for drafts/assets, URL hash for sharing |
| **Preview = export** | One deterministic engine renders both, on-device |
| **Most modern stack** | Next.js 16.3, React 19.3, TypeScript 7, Tailwind 4.3, WebCodecs, OffscreenCanvas, WebGL2 |
| **Premium, fast UX** | Engine off the main thread (workers), lazy loading, strict budgets |
| **Hobby is non-commercial only** | Ugoki is a non-commercial private project (decision A1). If that changes, move to Vercel Pro or any static host — nothing ties us to Hobby |
| **€0 budget, no analytics** (decisions E3, D8) | Free services only; no analytics, telemetry or third-party requests at runtime |

---

## 2. Stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | **Next.js** (App Router, Turbopack) | ^16.3.6 | Best-in-class on Vercel; SSG for landing/gallery/SEO; client editor; no newer major exists |
| UI runtime | **React** | ^19.3.0 | `<ViewTransition>` is stable (tile → editor morph); `<Activity>`, `useEffectEvent` |
| React Compiler | `reactCompiler: true` | stable (Babel-based) | Automatic memoization for the editor UI; revisit Turbopack's experimental Rust compiler later |
| Language | **TypeScript** (native Go compiler) | ~7.0.2 | ~10× faster type-checking; Next.js 16.3 runs it via the TS CLI |
| Lint & format | **Biome** | 2.5.14 (exact) | One fast tool; `react`/`next` rule groups. ESLint is incompatible with TS 7 today (typescript-eslint requires TS < 6.1) |
| Styling | **Tailwind CSS** (CSS-first `@theme` tokens) | ^4.3.3 | Tokens from the design system as CSS variables; zero-runtime |
| Headless UI | **Base UI** (`@base-ui/react`) | ^1.8.0 | Stable v1, actively released, unstyled + accessible; our visuals on top |
| UI animation | **Motion** (`motion/react`) | ^13.4.4 | MIT; springs, layout animations, `AnimateView` on top of View Transitions |
| State | **Zustand** | ^5.0.15 | Tiny, selector-based, usable outside React (engine host) |
| Undo/redo | Own history middleware | — | `zundo` is dormant; snapshot history with coalescing is ~80 lines |
| Validation | Engine sanitizers + **Zod** (`zod/mini`, Phase 2) | ^4.6.5 | The engine repairs untrusted input itself (ADR-018); Zod parses the share-link/draft envelope on the main thread |
| Persistence | **Dexie** (IndexedDB) | ^4.4.6 | Versioned schema, indexes, reactive queries for drafts |
| Color | Engine's own OKLab/OKLCH (`core/color.ts`) | — | Conversion, gamut mapping, contrast, palette derivation, premultiplied OKLab gradients (ADR-018); culori only if the UI color picker needs it |
| Text shaping | **harfbuzzjs** (HarfBuzz 14.5) | ^1.6.2 | Identical shaping/glyphs in every browser; variable axes; glyph outlines (MIT) |
| Video muxing/encoding | **Mediabunny** (WebCodecs) | ^1.60.0 | MP4/WebM muxing, CanvasSource, WebM alpha, backpressure (MPL-2.0) |
| GIF | **modern-gif** | ^2.1.0 (Phase 2) | MIT; 10× smaller than gifenc on gradients, higher fidelity (ADR-025); gifski is AGPL and excluded |
| ZIP | **fflate** | ~0.8.3 | Streaming ZIP for PNG sequences, deflate for share links (MIT) |
| Geometry | **delaunator** | latest | Shard triangulation (ISC), tiny |
| Worker RPC | Typed custom protocol (`engine/host`) | — | Views, transport, snapshots, capability probing; transferables for canvases/bitmaps (ADR-022) |
| Unit & browser tests | **Vitest** (+ `@vitest/browser-playwright`) | ^5.0.2 | Browser Mode is stable; engine tests in real Chromium |
| E2E & golden frames | **Playwright** · Vitest `toMatchScreenshot` | ^1.63.0 | Flows against the production build; golden frames of template renders |
| Package manager | **pnpm** | 10.34.5 (pinned via `packageManager`) | Vercel does not auto-detect pnpm 11/12 yet |
| Runtime | **Node.js** | 24.x (Active LTS, Vercel default) | Node 20 is EOL; Vitest 5 needs ≥ 22.12 |
| Hosting | **Vercel Hobby** | — | Static pages on the CDN; free Vercel domain; no analytics products |

Dependencies are added with the feature that uses them: Phase 1 installs the framework, Base UI, Motion, harfbuzzjs and Mediabunny (for the export spike); Zustand, Zod, Dexie, fflate, delaunator and modern-gif arrive in Phase 2+.

### Deliberately not used

| Not used | Why |
|---|---|
| GSAP | Its standard license prohibits use "in tools that allow users to build visual animations without code" competing with Webflow — that is Ugoki |
| Remotion | Company license required above 3 people (renders count as "automation", $100/month minimum), telemetry on client renders, and its web renderer's CSS subset lacks perspective, blend modes and backdrop filters |
| PixiJS | Excellent, but MSAA vector edges and texture-based text are a step down from Canvas 2D's analytic anti-aliasing for type and hairlines; our needs fit a small custom compositor (fallback option if that effort balloons) |
| Motion Canvas / Revideo | Dormant / uncertain maintenance |
| ffmpeg.wasm | Dormant, ~31 MB, 0.04–0.08× native speed, GPL build |
| Lottie/Rive runtimes | Require authoring in external tools; can't express our text engine or effects |
| Canvas `filter`, `fontStretch`, `fontKerning` | Not supported in Safari — effects go through the WebGL2 compositor, text through HarfBuzz |
| HTML-in-Canvas | Chromium origin trial only, API still changing |
| `output: 'export'` | Would lose `headers()` in `next.config`; we get the same static result with default output (all routes prerendered) |
| `next/image` optimization | Hobby allows 5,000 transformations/month; our imagery is live renders or pre-optimized static files |
| shadcn/ui styling, CSS-in-JS | Generic look / runtime cost; we use Base UI primitives + our tokens |

---

## 3. System overview

```
                         Vercel CDN (static)
   ┌──────────────────────────────────────────────────────────────┐
   │ HTML (SSG) · JS chunks · fonts · harfbuzz.wasm · OG images   │
   └──────────────────────────────────────────────────────────────┘
                               │
   Browser ────────────────────┼─────────────────────────────────────────────
   Main thread (React)         │            Workers
   ┌───────────────────────┐   │   ┌────────────────────────────────────────┐
   │ Landing / Gallery /   │◄──┼──►│ Render worker                          │
   │ Editor UI (React 19)  │ postMessage  engine: templates, text (HarfBuzz),│
   │ Zustand stores        │ + transfer   draw (Canvas 2D), compositor      │
   │ Stage overlay (DOM)   │   │   │ (WebGL2), OffscreenCanvas → stage/tiles │
   └──────────┬────────────┘   │   └────────────────────────────────────────┘
              │                │   ┌────────────────────────────────────────┐
              │  export job    └──►│ Export worker                          │
              │                    │ same engine at export resolution →     │
              ▼                    │ WebCodecs + Mediabunny / GIF / PNG ZIP │
   ┌───────────────────────┐       │ → stream to file or Blob               │
   │ IndexedDB (Dexie):    │       └────────────────────────────────────────┘
   │ drafts, assets, prefs │
   └───────────────────────┘      Share link: #d=<deflate+base64url state>
```

- **Nothing leaves the device.** No API routes, no uploads, no analytics. The only network traffic is fetching Ugoki's own static assets from its own origin.
- **All routes are prerendered.** Route segments that must stay static declare `export const dynamic = 'error'` so an accidental dynamic API fails the build instead of silently creating serverless functions.

---

## 4. Repository structure

```
.
├── CLAUDE.md · AGENTS.md · README.md · ROADMAP.md · CHANGELOG.md · USER_QUESTIONS.md
├── docs/                          # planning & specifications (this folder)
├── .github/workflows/ci.yml       # CI (§18)
├── public/
│   ├── fonts/engine/              # gzip TTFs for the engine (content-hashed)
│   ├── fonts/licenses/            # OFL texts
│   └── og/                        # pre-rendered Open Graph images (Phase 6)
├── scripts/                       # fonts.py (reproducible font builds), assert-static.mjs
├── src/
│   ├── app/                       # Next.js routes — thin; compose features
│   │   ├── page.tsx               # landing (placeholder until Phase 6)
│   │   ├── templates/page.tsx · templates/[category]/page.tsx      (Phase 4)
│   │   ├── editor/[templateId]/page.tsx                            (Phase 2)
│   │   ├── legal/{imprint,privacy,licenses}/page.tsx               (Phase 6)
│   │   ├── lab/page.tsx           # template workbench (404 in production, ADR-024)
│   │   ├── layout.tsx · globals.css · fonts.ts · icon.svg
│   │   ├── not-found.tsx · sitemap.ts · robots.ts                   (Phase 6)
│   ├── engine/                    # framework-agnostic, DOM-free, worker-safe (see 06-engine.md)
│   │   ├── core/ template/ timeline/ draw/ text/ runtime/ host/   (Phase 1)
│   │   ├── assets/ compositor/ ui-kit/ export/                    (Phase 2+)
│   │   └── index.ts               # the public engine API templates may import
│   ├── templates/                 # the 50 templates
│   │   ├── registry.ts            # metadata (tiny, server-safe) + lazy loaders
│   │   └── <category>/<id>/index.ts (+ looks.ts, layout.ts as needed)
│   ├── workers/                   # composition root: render.worker.ts, createRenderEndpoint()
│   ├── features/                  # React feature modules
│   │   └── lab/ · landing/ gallery/ editor/ inspector/ stage/ transport/ export/ drafts/ share/
│   ├── components/                # design-system primitives (Button, Slider, SegmentedControl, Switch…)
│   ├── design/                    # motion tokens, icons (color/type tokens live in app/globals.css @theme)
│   ├── fonts/                     # UI WOFF2 (Ugoki Sans, Ugoki Mono) for next/font/local
│   ├── stores/                    # Zustand stores + history middleware (Phase 2)
│   └── lib/                       # small utilities (cn, …); db, share codec later
├── tests/
│   ├── support/                   # render harness + test worker
│   ├── templates/                 # per-template browser checks
│   ├── integration/               # real-worker end-to-end render path
│   ├── golden/                    # golden frames + __screenshots__ references
│   ├── spikes/                    # platform spikes kept as regression tests
│   └── e2e/                       # Playwright against the production build
└── biome.json · next.config.ts · tsconfig.json · vitest.config.ts · playwright.config.ts · package.json
```

**Import boundaries** (enforced by Biome `noRestrictedImports` rules + review):
- `engine/**` imports nothing from `app`, `features`, `components`, `stores` or React. It must run inside a worker.
- `templates/**` import only from `@/engine` (the public API).
- `features/**` talk to the engine only through `engine/host` (the worker client plus the engine's pure data), and create workers through `src/workers`.
- `workers/**` is the only place that joins the engine and the template registry.

---

## 5. Routes & rendering

| Route | Strategy | Notes |
|---|---|---|
| `/` | SSG | Server-rendered headline for LCP; engine chunk + fonts + HarfBuzz load after first paint |
| `/templates`, `/templates/[category]` | SSG (10 category params) | Tile shells rendered statically; live previews hydrate |
| `/editor/[templateId]` | SSG (50 params) + client editor | Editor feature is a client component; state from `#d=` or `?draft=` |
| `/legal/*` | SSG | Content in MDX or TSX |
| `/lab` | SSG; 404 on the production deployment | Built for local and preview deployments so templates can be reviewed there; `VERCEL_ENV === 'production'` → `notFound()`, `noindex` (ADR-024) |

**Code splitting**: the engine, each template, HarfBuzz WASM, and each export encoder are separate lazy chunks. The landing loads only what the hero needs; the export modules load when the export sheet opens.

---

## 6. State

Three Zustand stores (all outside React where the engine host needs them):

| Store | Holds | Notes |
|---|---|---|
| `project` | `templateId`, `templateVersion`, `props`, `format`, `duration`, `energy`, `palette` (id or custom roles), `pairing`, `finish`, `background`, `seed`, `layout` (per movable group `{x, y, scale}`), `name`, `draftId` | The single source of truth for a design; serializable; wrapped by the history middleware |
| `playback` | `playing`, `loop`, `duration` (current time lives in the engine host and a lightweight external subscription — never a 60 fps React re-render) | Timecode UI subscribes via `requestAnimationFrame` |
| `ui` | selection, hovered element, inspector focus, guides, backdrop, export sheet state, hover-previews | Hover previews are *transient overrides* sent to the engine without touching history |

**History**: snapshot-based undo/redo of `project` (JSON is small), coalescing rapid edits (typing, slider drags) into one step after 500 ms of inactivity; max 200 steps.

**Engine sync**: the engine host subscribes to `project` (+ transient overrides) and posts the resolved state to the render worker once per animation frame at most.

---

## 7. Persistence (local-first)

Dexie schema v1:

| Table | Key | Fields | Notes |
|---|---|---|---|
| `projects` | `id` (nanoid) | `templateId`, `templateVersion`, `state`, `name`, `createdAt`, `updatedAt`, `thumbnail` (WebP Blob, 320 px) | Index on `updatedAt` for "Recent" |
| `assets` | `hash` (SHA-256 of bytes) | `blob`, `mime`, `width`, `height`, `createdAt` | Deduplicated; unreferenced assets garbage-collected on startup |
| `prefs` | `key` | `value` | Last format, dismissed hints, gallery personalization text |

- Autosave debounced 500 ms. After the first saved draft, request persistent storage (`navigator.storage.persist()`); show usage via `navigator.storage.estimate()`.
- Uploaded images/logos are stored **only** here, never uploaded.
- Schema changes go through Dexie versioning + tested migrations.

## 8. Share links

- Payload `{ v: 1, t: templateId, tv: templateVersion, s: projectState }` minus asset references → JSON → `deflate-raw` (fflate) → base64url → `/editor/<id>#d=<payload>`.
- The hash never reaches a server. Typical size < 2 KB; warn above 8 KB.
- On open: decode → validate against the template's control schema (Zod) → run template migrations → drop unknown keys → replace missing assets with defaults and show a notice.

---

## 9. Templates: registry & loading

- `templates/registry.ts` exports **metadata only** (id, name, tagline, category, formats, duration, structure, alpha, tags, use cases) — tiny and server-safe, used by SSG pages, search, sitemap and OG generation.
- Template code is imported lazily **inside the workers** (`import('./<category>/<id>/index.ts')`), so the main thread never loads template code. The worker answers with a plain-data `TemplateDescriptor` (controls, Looks, formats, palettes, available pairings, duration) and sanitized states (ADR-022). A unit test keeps registry metadata and template definitions in sync.
- `src/workers/` is the composition root: `render.worker.ts` binds the engine's runtime to the registry; `createRenderEndpoint()` returns the module worker (or the in-thread fallback).
- Each template exports one `defineTemplate({...})` (contract in [`06-engine.md`](06-engine.md) §4).

---

## 10. Fonts pipeline

- **Sources**: OFL families only (see [`templates/00-foundations.md`](templates/00-foundations.md) §6), downloaded from pinned URLs and verified by SHA-256. Mona Sans from the GitHub repository build (v2.0.27: includes `opsz` and Mona Sans Mono); others from `google/fonts`. Every family's license text ships in `public/fonts/licenses/` and on `/legal/licenses`.
- **Build** (`pnpm fonts` → `scripts/fonts.py`, fontTools 4.60.1, outputs committed, byte-for-byte reproducible): instancing to the axis ranges we use, then subsetting to Latin, Latin-1 Supplement, Latin Extended-A, Romanian, general punctuation, currency (€ £ ¥ ₹), arrows and UI symbols (⌘ ↵ ↑ ↓ ← →) and math (× − ÷), keeping variation axes and OpenType features (`kern`, `liga`, `calt`, `tnum`, `ss0x`). Modified Mona Sans builds are renamed "Ugoki Sans"/"Ugoki Mono" (Reserved Font Name, ADR-019).
- **Formats**: gzip-compressed TTF for the engine (`public/fonts/engine/<id>.<hash>.ttf.gz`, inflated with `DecompressionStream`, ADR-020) and WOFF2 for the interface (`src/fonts/`, loaded with `next/font/local`). `src/engine/text/font-manifest.json` lists URLs, hashes, axes and metrics.
- Fonts load on demand per pairing; the hero preloads only what it needs. Phase 1 builds Mona Sans, Inter and Instrument Serif (the `grotesk` and `editorial` pairings); a pairing is offered only when all its fonts are built.

---

## 11. Performance budgets

| Budget | Target |
|---|---|
| Landing initial JS (gz, excl. lazy engine) | ≤ 90 KB |
| Engine core chunk (gz) | ≤ 120 KB (+ HarfBuzz WASM ~174 KB gz, cached, lazy) |
| Gallery route JS (gz, excl. engine) | ≤ 160 KB |
| Editor route JS (gz, excl. engine) | ≤ 250 KB |
| One template module (gz) | ≤ 15 KB |
| Export modules (gz, lazy) | Mediabunny ~40–55 KB · GIF ~10 KB · fflate ~10 KB |
| Landing LCP / INP / CLS (p75) | < 1.8 s / < 150 ms / < 0.05 |
| Render cost per frame @ 1080p-equivalent | ≤ 8 ms on the reference desktop (owner's PC, 2560 × 1440 display); ≤ 16 ms on a mid-range laptop |
| Editor stage on the reference display | A 16:9 stage fills ≈ 2000 × 1126 px on 2560 × 1440 (≈ 2.3 MP at 100% scaling, ≈ 3.5 MP at 125%). Target: 60 fps at full resolution for most templates; adaptive render scale covers heavy ones while playing; paused frames always render at full resolution |
| Editor memory (typical) | ≤ 400 MB |

Budgets are checked in CI (bundle analyzer output + engine benchmark in `/lab`).

---

## 12. Browser support

| Browser | Editor & preview | Export |
|---|---|---|
| Chrome / Edge (desktop, last 2 years) | Full | MP4 (H.264), WebM (VP9, alpha), GIF, PNG seq, still |
| Safari 17+ (macOS, iPadOS, iOS) | Full (needs OffscreenCanvas WebGL in workers → 17+) | MP4 (H.264), WebM (VP9; alpha encodes, Safari *playback* of VP9 alpha unverified), GIF, PNG seq, still |
| Firefox 130+ desktop | Full | WebM (VP9, alpha), MP4 where OS H.264 encoder exists, GIF, PNG seq, still |
| Firefox Android | Full | No WebCodecs video encoder → GIF, PNG seq, still |
| Chrome Android | Full | MP4, WebM, GIF, PNG seq, still |

Everything is **feature-detected at runtime** (`VideoEncoder.isConfigSupported`, Mediabunny `canEncodeVideo`, OffscreenCanvas/WebGL2 probes) — never user-agent sniffed. Unsupported options are shown disabled with the reason.

---

## 13. Security & privacy

- **No cookies. No accounts. No uploads. No analytics.** User files are processed in the browser and stored only in IndexedDB.
- **No third-party requests at runtime**: fonts, scripts, WASM and images are all served from Ugoki's own origin (never Google Fonts or other CDNs) — the simplest GDPR posture for a German operator (ADR-017).
- **Headers** (via `next.config.ts` `headers()`):
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
    - `'unsafe-inline'` scripts are needed for Next.js's inline bootstrap on static pages (nonces would force dynamic rendering); acceptable because we never render user-supplied HTML. Revisit when hash-based CSP works for static App Router output.
    - `'wasm-unsafe-eval'` for HarfBuzz; `worker-src blob:` for Mediabunny's alpha worker.
  - `Referrer-Policy: strict-origin-when-cross-origin` · `X-Content-Type-Options: nosniff` · `Permissions-Policy: camera=(), microphone=(), geolocation=()` · `Cross-Origin-Opener-Policy: same-origin`.
- **SVG uploads are sanitized** (scripts, `foreignObject`, event handlers and external references stripped) and never inserted into the DOM as markup.
- COOP/COEP cross-origin isolation is **not** needed (no SharedArrayBuffer).

## 14. SEO & metadata

- Static metadata per route (default title `Ugoki — Motion, made yours.`); `sitemap.ts`, `robots.ts`; JSON-LD `SoftwareApplication` (free) on the landing page.
- **Open Graph images** are pre-rendered by `scripts/og.ts` (Playwright + the engine: poster frame + title) into `public/og/` — `next/og` can't run our canvas engine.
- Category pages carry short, human-written intros (use cases) for search.

## 15. Analytics & monitoring — none, by decision

- **No analytics, no Speed Insights, no error monitoring, no telemetry** (decisions D8, D9 — ADR-016). `@vercel/analytics` and `@vercel/speed-insights` are not installed.
- Quality is ensured *before* release instead: golden frames, the export QA matrix, `/lab` render benchmarks, Lighthouse runs and hands-on tests.
- Errors: a client error boundary with a friendly recovery path; export/render errors offer **Copy details** (browser, codec config, template, pipeline step) so users can report problems voluntarily.

## 16. Deployment

- Vercel project linked to the GitHub repo; production = `main`; preview deployments for every branch/PR.
- `packageManager: "pnpm@10.34.5"`, `engines.node: "24.x"`.
- Build: `next build` (Turbopack). The build output must show **no serverless functions** — CI fails otherwise.
- Domain: the free Vercel domain (`<project>.vercel.app`) for now; a `.app` domain later (decision A4 — outside the €0 budget today).
- One-time owner setup: import the GitHub repo into Vercel (Hobby); make `main` the default branch (see USER_QUESTIONS O2/O3).

## 17. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest (node) | Easing/springs/stagger/rng math, timeline & sequences, control schemas & migrations, share codec, palette derivation & contrast, text layout (HarfBuzz runs in Node), adaptive quality, registry ↔ template metadata |
| Engine in browser | Vitest Browser Mode (Playwright; Chromium, Firefox, WebKit in CI) | Draw API, runtime & protocol, a real module worker end to end, compositor effects, template checks (`tests/templates/`: clean edit points for every format × Look × energy × exit, stress text inside safe areas, transparency, determinism — render twice → identical pixels) |
| Golden frames | Vitest `toMatchScreenshot` (`tests/golden/`) | Key frames per template (hold, entrance, exit, each format, each Look, stress text, transparency) at 0.4× scale, Chromium references with a small pixelmatch tolerance; `pnpm test:golden --update` accepts intentional changes |
| E2E | Playwright | Flows A–D from the experience doc; export smoke test (WebM in Chromium) verified by decoding the file (duration, size, frame count) |
| Accessibility | Playwright + axe-core | Landing, gallery, editor, export sheet |
| Performance | `/lab` benchmark | Per-template render cost vs. budget |
| Cross-browser | Playwright (Chromium, Firefox, WebKit) + manual matrix | CI runs e2e in all three engines (WebKit as the Safari proxy); before each release a manual pass on the owner's desktop (2560 × 1440) plus real Safari/iOS when a device is available (USER_QUESTIONS O6) |

## 18. CI (GitHub Actions)

`.github/workflows/ci.yml`, on every PR and on pushes to `main`:
- **check**: install → `pnpm typecheck` (TS 7) → `pnpm lint` (Biome) → `pnpm test` (unit) → `pnpm build` (fails if any route isn't prerendered — no serverless functions).
- **browser** (matrix: Chromium, Firefox, WebKit): `pnpm test:browser`.
- **e2e**: golden frames (Chromium) → `pnpm build` → `pnpm test:e2e` (Playwright, three engines); test output and diff images are uploaded as artifacts on failure.

Bundle budgets join the check job with the landing page (Phase 6). Vercel posts the preview URL once the repo is imported (USER_QUESTIONS O3).

## 19. Conventions

- TypeScript `strict`; no `any`; prefer `satisfies`; discriminated unions for control types.
- Files `kebab-case.ts`; components `PascalCase`; hooks `useX`; one template per folder named by its ID.
- Conventional Commits (`feat(engine): …`, `feat(template/rise): …`, `fix(export): …`, `docs: …`).
- Every user-visible change updates `CHANGELOG.md`; every milestone updates `ROADMAP.md`; every architectural change adds an entry to `docs/08-decisions.md`.
