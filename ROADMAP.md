# Ugoki — Roadmap

> From plan to v1.0: eight phases, each ending in a working, reviewable increment on a Vercel preview URL. Checkboxes are updated as work lands. Specs live in [`docs/`](docs/).

**Now**: Phase 2 — editor & export MVP is in progress. Phase 1 shipped as 0.1.0 (merged 2026-09-26; the owner checked the Lab on the preview, O6). Decisions: [`USER_QUESTIONS.md`](USER_QUESTIONS.md).

| Phase | Outcome | Version |
|---|---|---|
| 0 | Plan & decisions signed off | — |
| 1 | Foundations + engine core; *Rise* renders in the Lab | 0.1.0 |
| 2 | Editor + export MVP; 4 reference templates end-to-end | 0.2.0 |
| 3 | Template wave 1 complete (25) | 0.3.0 |
| 4 | Gallery with live, personalized previews | 0.4.0 |
| 5 | Template wave 2 complete (50) | 0.5.0 |
| 6 | Landing page, brand, legal, SEO | 0.6.0 |
| 7 | Polish, QA, launch | 1.0.0 |

---

## Phase 0 — Plan & decide

- [x] Brief analyzed; stack, platform, font, competitor and design-reference research (verified 2026-09-26)
- [x] Planning docs: product, experience, design system, motion language, architecture, engine, export, decision log
- [x] Template library: foundations + 50 detailed specs + build waves
- [x] `CLAUDE.md`, `ROADMAP.md`, `CHANGELOG.md`, `USER_QUESTIONS.md`
- [x] You answer `USER_QUESTIONS.md` (or accept the recommendations)
- [x] Docs updated with your decisions (ADR-015 accepted; ADR-016 no analytics; ADR-017 legal/privacy; new hero; large-screen layouts)
- [x] **Your explicit go-ahead to start coding** (2026-09-26)

**Exit**: signed-off plan.

---

## Phase 1 — Foundations & engine core → `0.1.0`

**Owner setup** (one-time, a few minutes — see USER_QUESTIONS O2/O3)
- [x] `main` exists and is the repository's default branch
- [x] GitHub repo imported into Vercel (Hobby) — done 2026-09-26; every branch and PR gets a preview deployment

**Scaffold**
- [x] Next.js 16.3 · React 19.3 (React Compiler on) · TypeScript 7 · Tailwind 4.3 · Biome 2.5 · Vitest 5 · Playwright 1.63 · pnpm 10 · Node 24
- [x] GitHub Actions CI (typecheck, Biome, tests, build with "no serverless functions" assertion)
- [x] Vercel project with a preview deployment per branch (owner's import, O3)
- [ ] Security headers (CSP etc., set in `next.config.ts`) checked on a deployment
- [x] Design tokens (Daylight/Cinema) in Tailwind `@theme`; Mona Sans self-hosted; first primitives (Button, SegmentedControl, Slider)

**Spikes** (each ends with a short note in `docs/08-decisions.md` if it changes anything)
- [x] Worker `requestAnimationFrame` + OffscreenCanvas WebGL2 — *worker rAF and OffscreenCanvas verified in Chromium, Firefox and WebKit (CI); WebGL2 in workers only in Chromium on CI's GPU-less runners; real Safari via the Lab's device panel (O6)*
- [x] Turbopack worker bundling + dynamic template imports inside workers — *works; harfbuzzjs needs a browser alias for Node's `module`*
- [x] HarfBuzz font loading — *gzip TTF + `DecompressionStream` (ADR-020)*
- [ ] Float accumulation (`EXT_color_buffer_float`) on Safari/iOS; RGBA8 fallback quality — *Chromium ✓; Safari/iOS via O6; fallback quality is judged with the compositor (Phase 2)*
- [ ] Mediabunny WebM-alpha round trip (encode → import in Resolve/After Effects) — *encode → decode keeps alpha (Chromium, regression test); the Resolve/After Effects import needs the exporter (Phase 2)*
- [x] GIF encoder choice (gifenc vs modern-gif): quality, speed, size — *modern-gif (ADR-025)*

**Engine core**
- [x] `core`: easing library, closed-form springs, stagger patterns, seeded RNG, OKLCH color utils
- [x] `template`: `defineTemplate`, control schema, validation, defaults, Looks, migrations — *validation by engine sanitizers; Zod joins for share links in Phase 2 (ADR-018)*
- [x] `timeline`: sections, energy profiles, reading-time rules, sequences, cut points, stepped time
- [x] `draw`: Draw API over Canvas 2D (groups, shapes, trims, clips, images, movable/editable registry)
- [x] `text`: HarfBuzz loader, font registry, shaping, balanced line breaking, auto-fit, glyph path cache, fallback runs
- [x] `host` + `runtime`: render worker, typed protocol, player, adaptive quality, atomic scene swaps
- [x] `/lab` workbench (formats side by side, scrubber, energies, stress text, render-cost meter)
- [x] Golden-frame harness (Vitest browser mode + committed Chromium references)

**Reference template 1**
- [x] **Rise** — all formats, 3 Looks, 3 energies, duration extremes, stress text

**Exit**: Rise plays at 60 fps in the Lab in Chrome, Safari and Firefox; two renders are pixel-identical; golden frames run in CI.
*Status*: done — merged 2026-09-26. 60 fps with four views measured in Chromium (≈ 0.1 ms recording per view per frame); determinism and golden frames are tested; CI plays Rise in the Lab in Chromium, Firefox and WebKit and checks the frames reach the screen; the owner checked the Lab on the preview (O6). The two open spike items continue in Phase 2 (compositor, exporter).

---

## Phase 2 — Editor & export MVP → `0.2.0`

**Compositor**
- [ ] WebGL2 layers (segmented compositing), blend modes, blur, bloom, masks/mattes, color adjust
- [x] Motion-blur accumulation (sub-frames, shutter from Energy), finish (grain, soft glow)

**Editor**
- [x] Stage with checkerboard, guides, preview backdrop (+ "Preview on my footage"), fit/100%
- [x] Editing overlay: select, drag, snap, scale movable groups; click-to-focus controls
- [x] Inspector generated from the control schema (Content · Style · Motion · Layout), Looks, Shuffle, hover previews
- [x] Palettes incl. Brand Light/Dark/Bold with contrast guard; pairing picker; background; finish
- [x] Transport (sections, Dot playhead, loop, duration handle, cut marker); keyboard shortcuts
- [ ] Project store + history (undo/redo with coalescing); Dexie autosave & drafts; share links
- [ ] Image/logo import (raster + sanitized SVG → vector paths), focal points, logo color modes

**Export**
- [x] Export worker pipeline; capability probing; Web Lock + Wake Lock
- [x] MP4 (H.264), WebM (VP9 + alpha), PNG sequence ZIP, GIF, PNG still
- [x] Streaming save (File System Access) + Blob fallback; progress/ETA/cancel; errors with *Copy details* (OPFS spill only if QA needs it)
- [ ] Export QA matrix (see `docs/07-export.md` §9) on Chrome, Safari, Firefox

**Reference templates 2–4**
- [x] **Line** (transparent overlay) · **Sheen** (logo, compositor) · **Layers** (transition, cut point, motion blur) — in the Lab, with preview backdrops (footage, A → B) and logo import

**Exit**: Choose → Customize → Preview → Export works end-to-end for 4 templates in all target browsers; exported frame N equals preview at `t = N / fps`.

---

## Phase 3 — Template wave 1 → `0.3.0`

**Engine additions**: sequence builder & auto duration · odometer digits & number formatting · UI Kit v1 (card, input, button, toast, charts) · cursor & typing helpers · procedural placeholders (Objects, Scenes, Artworks, Screens, avatars, fictional logos).

**Reference templates 5–7 first**
- [ ] Punch · Deal · Click

**Remaining wave-1 templates**
- [ ] Focus · Decode
- [ ] Broadcast · Capsule
- [ ] Listicle · Countdown
- [ ] Sale
- [ ] Columns · Stack
- [ ] Quote · Review · Numbers
- [ ] Cinematic · Episode
- [ ] Iris · Blinds
- [ ] Bounce
- [ ] Dashboard

**Exit**: 25 templates pass the quality bar ([`docs/templates/00-foundations.md`](docs/templates/00-foundations.md) §9) and golden frames.

---

## Phase 4 — Gallery → `0.4.0`

- [ ] Shared renderer for tiles (`bitmaprenderer`), per-frame budget scheduler, poster frames, hover/ambient playback
- [ ] Category navigation, category pages (SEO copy), search (names, tags, use cases)
- [ ] Format control re-laying out all tiles live
- [ ] "Type a headline" personalization carried into the editor
- [ ] Recent drafts row + popover
- [ ] Tile → editor morph (React `<ViewTransition>`)

**Exit**: smooth scrolling (≥ 55 fps) with ambient previews on the reference desktop at 2560 × 1440 (6 columns); flows A and C pass e2e.

---

## Phase 5 — Template wave 2 → `0.5.0`

**Engine additions**: 3D planes (perspective, depth sort, depth blur) · variable-axis text + width solver · SVG vector effects (trim-draw) · Delaunay shards · noise paths & droplets · beat grid · split-flap renderer · backdrop blur for UI panels.

- [ ] Stretch · Echo
- [ ] Editorial · Signal
- [ ] Chat · Versus
- [ ] Callouts · Reveal · Compare
- [ ] Float · Ring · Zoom
- [ ] Manifesto · Pattern
- [ ] Hype · Grid · Departures
- [ ] Liquid · Sweep
- [ ] Draw · Shards · Resolve
- [ ] Notify · Scroll · Command

**Exit**: 50/50 templates pass the quality bar and golden frames.

---

## Phase 6 — Landing, brand & legal → `0.6.0`

- [ ] Wordmark with the Dot (+ width-axis animation), favicon, OG images (pre-rendered)
- [ ] Landing: hero *Motion, made yours.* with the live "type anything" stage · scroll-scrubbed reel · Choose/Customize/Export sequence · categories · statements · finale
- [ ] Legal pages: Impressum + Datenschutzerklärung (German + English, owner's details from O4), licenses (incl. all font licenses), 404
- [ ] Sitemap, robots, JSON-LD — no analytics (ADR-016)

**Exit**: landing Lighthouse ≥ 95 in all categories; LCP < 1.8 s (p75 lab); reduced-motion variant complete.

---

## Phase 7 — Polish, QA & launch → `1.0.0`

- [ ] Phone & tablet editor polish (sheets, gestures, touch targets)
- [ ] Accessibility audit (WCAG 2.2 AA), axe-core clean, screen-reader pass
- [ ] Cross-browser export QA matrix, color/gamma check, 4K60 stress test
- [ ] Performance tuning to budgets; bundle budgets enforced
- [ ] Error states, empty states, first-run hints, copy review (voice & tone)
- [ ] Launch checklist: security headers, zero third-party requests (verified in DevTools), legal texts checked by the owner, OG previews, 404, favicon, social cards, final review on the owner's 2560 × 1440 desktop
- [ ] Tag `v1.0.0`

---

## After launch

| Version | Themes |
|---|---|
| **v1.1** | Brand Kit (colors, logo, fonts saved locally, applied everywhere) · custom font upload · inline on-canvas text editing · `.ugoki` project files |
| **v1.2** | Offline PWA · German localization · animated WebP · more Looks |
| **v2** | Audio (music + SFX, beat-synced) · Sequences (stitch templates) · new categories (Data & Charts, Captions, Maps, Events) · ProRes 4444 if a fast, license-compatible encoder exists · a `.app` domain when the budget allows |

Not planned (owner decisions): AI features (D11), accounts or payments (A2), analytics (D8), end cards or watermarks (D10).
