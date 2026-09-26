# 08 — Decision Log

> Lightweight ADRs. Each records context, the decision, alternatives considered, consequences and when to revisit. New architectural decisions are appended here (next number), never silently changed.

Status legend: **Accepted** — technical decisions delegated to us by the brief ("most modern and best tech stack"), made during planning · **Proposed** — needs your confirmation in [`USER_QUESTIONS.md`](../USER_QUESTIONS.md).

---

### ADR-001 — On-device, static-first architecture
**Status**: Accepted · 2026-09-26
**Context**: Must run on Vercel Hobby with no database; exports must match previews; privacy is a differentiator.
**Decision**: No backend in the product path. All pages are prerendered; rendering and encoding happen in the browser; drafts live in IndexedDB; sharing uses the URL hash.
**Alternatives**: Serverless rendering (Hobby limits: 300 s functions, 1 vCPU; cost at scale); headless-Chromium render farms (not possible on Hobby).
**Consequences**: ~€0 running cost; no accounts or cloud sync; browser capability differences must be handled client-side.
**Revisit when**: accounts, team features or AI features are planned.

### ADR-002 — Next.js 16 App Router on Vercel, all routes prerendered
**Status**: Accepted · 2026-09-26
**Decision**: Next.js 16.3 with Turbopack and React 19.3; default output (not `output: 'export'`) so `headers()` works; every route prerendered (`dynamic = 'error'` guards); the editor is a client feature inside a static shell.
**Alternatives**: Vite SPA (weaker SEO/landing story), Astro + islands (split mental model), TanStack Start (less Vercel-native).
**Consequences**: CI asserts the build emits no serverless functions.

### ADR-003 — Custom deterministic engine: Canvas 2D drawing + WebGL2 compositor
**Status**: Accepted · 2026-09-26
**Context**: Templates need pro typography, hairlines, masks, blur, bloom, 3D planes and true motion blur, identical in preview and export, in every browser.
**Decision**: Templates are pure functions of `(props, format, t)`. Drawing uses Canvas 2D (analytic anti-aliasing for type and hairlines); a small WebGL2 compositor handles effects, 3D planes and motion-blur accumulation.
**Alternatives**:
- *Remotion* — company license for teams > 3 (web rendering counted as "automation", $100/month minimum), mandatory telemetry on client renders, and its web renderer supports only a CSS subset (no perspective, blend modes, backdrop filters).
- *PixiJS 8* — strong GPU engine, but MSAA edges and texture text are a quality step down for type-heavy motion; kept as a fallback if our compositor effort balloons.
- *Motion Canvas / Revideo* — dormant / uncertain.
- *DOM + GSAP* — GSAP license prohibits visual animation builders (ADR-007); DOM can't be captured frame-accurately.
- *Lottie / Rive* — require external authoring tools; can't express our text engine.
- *CanvasKit (Skia WASM)* — excellent quality but a multi-MB download and verbose API.
**Consequences**: We own ~1–1.5k lines of compositor code; Safari's missing Canvas `filter` is irrelevant because all effects run in WebGL2.

### ADR-004 — HarfBuzz text engine
**Status**: Accepted · 2026-09-26
**Decision**: Shape all template text with harfbuzzjs and draw glyph outlines as paths; native `fillText` only as a fallback for glyphs the font lacks (emoji, CJK).
**Why**: Identical output across browsers, kerning-safe per-glyph animation, OpenType features, continuous variable axes (Safari lacks `fontStretch`/`fontKerning`; `letterSpacing` needs 18.4+).
**Consequences**: ~174 KB gz WASM (lazy, cached); fonts must be available as sfnt bytes (TTF) — WOFF2 handling is a Phase 1 spike.

### ADR-005 — Engine runs in Web Workers
**Status**: Accepted · 2026-09-26
**Decision**: A render worker (stage + gallery tiles, one shared WebGL2 context, tiles fed via `bitmaprenderer`) and a per-job export worker, both on OffscreenCanvas.
**Why**: Smooth UI while rendering; exports survive hidden tabs (workers aren't timer-throttled; a Web Lock prevents Energy Saver freezing); avoids the ~16 WebGL-context limit in the gallery.
**Consequences**: Requires Safari 17+ (OffscreenCanvas WebGL); message protocol and asset transfer to design carefully.

### ADR-006 — Export via WebCodecs + Mediabunny
**Status**: Accepted · 2026-09-26
**Decision**: MP4 (H.264), WebM (VP9 + alpha), PNG sequence (ZIP), GIF, PNG still; runtime capability probing; streaming saves on Chromium.
**Alternatives**: ffmpeg.wasm (dormant, 31 MB, 0.04–0.08× native, GPL build) — excluded from v1; MediaRecorder (real-time, non-deterministic) — excluded.
**Consequences**: ProRes 4444 is not available at launch; PNG sequences serve Premiere/Final Cut alpha workflows. Mediabunny is MPL-2.0 (file-level copyleft — fine as an unmodified dependency).

### ADR-007 — No GSAP; Motion for interface animation
**Status**: Accepted · 2026-09-26
**Decision**: Don't use GSAP anywhere. Interface animation uses Motion (MIT); template animation uses the engine's own helpers.
**Why**: GSAP's standard license lists as a *Prohibited Use* "tools that allow users to build visual animations without code" competing with Webflow; Webflow may terminate the license at its discretion.

### ADR-008 — Templates as code with a declarative control schema
**Status**: Accepted · 2026-09-26
**Decision**: Each template is a TypeScript module exporting `defineTemplate()` with a typed control schema; the inspector, validation, share links, migrations and Looks are all generated from that schema.
**Why**: Motion craft needs code-level control; the schema keeps the UI consistent and makes adding a template a one-folder change.

### ADR-009 — Macro controls instead of keyframes
**Status**: Accepted · 2026-09-26
**Decision**: Users control Energy (Calm/Balanced/Punchy), Duration (hold stretches), Looks, palettes, pairings and layout — never curves or keyframes.
**Why**: The brief's core philosophy ("complexity underneath the interface").
**Revisit when**: a "Pro" mode is requested repeatedly — even then, prefer more macros over a timeline.

### ADR-010 — Local-first persistence + URL-hash sharing
**Status**: Accepted · 2026-09-26
**Decision**: Dexie/IndexedDB for drafts, assets and preferences; share links carry deflated state in `#d=`; images are never shared or uploaded.

### ADR-011 — OFL-only, self-hosted fonts
**Status**: Accepted · 2026-09-26
**Decision**: SIL OFL families only, subsetted and self-hosted. Fontshare/ITF Free Font License fonts are excluded (forbids modification/subsetting and "making available"; terminable).

### ADR-012 — TypeScript 7 + Biome, no ESLint (for now)
**Status**: Accepted · 2026-09-26
**Decision**: TypeScript 7.0 (native compiler) with Biome 2.5 for lint + format.
**Why**: typescript-eslint (pulled in by `eslint-config-next`) supports TypeScript < 6.1 only. Trade-off: Biome has no React Compiler lint rules yet.
**Revisit when**: typescript-eslint supports TS 7 — then consider adding `eslint-plugin-react-hooks` compiler rules.

### ADR-013 — pnpm 10 and Node 24
**Status**: Accepted · 2026-09-26
**Decision**: Pin `pnpm@10.34.5` and Node 24.x.
**Why**: Vercel doesn't auto-detect pnpm 11/12 yet (Corepack workaround exists); Node 20 is EOL and deprecated on Vercel from 2026-10-01; Vitest 5 needs Node ≥ 22.12.
**Revisit when**: Vercel detects pnpm 12, or Node 26 becomes available on Vercel (26 becomes LTS in October 2026).

### ADR-014 — Live engine previews in the gallery (no preview videos)
**Status**: Accepted · 2026-09-26
**Decision**: Gallery tiles render live from the engine (poster frames idle, playback on hover/focus/ambient when capable).
**Why**: Personalization ("type your headline everywhere") and format switching need live rendering; saves Hobby bandwidth (100 GB/month) compared with 50+ preview videos.

### ADR-015 — Monochrome brand: "color belongs to the work"
**Status**: Proposed · needs your decision (USER_QUESTIONS B2)
**Decision**: Ugoki's interface is black/white; the only color comes from templates (the playhead Dot borrows the playing template's accent). Brand typeface: Mona Sans v2 (Expanded display).
**Why**: The product is the hero; avoids documented AI-site clichés (near-black + single vermilion/acid accent; cream + serif + terracotta).
**Alternatives**: a signature hue held back for CTAs (Revolut-style); a different typeface (Archivo; Funnel Display + Funnel Sans).
