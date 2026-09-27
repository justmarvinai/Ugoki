# Changelog

All notable changes to Ugoki are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions map to roadmap phases (see [`ROADMAP.md`](ROADMAP.md)).

## [Unreleased]

### Added

- **Line** — a lower third (*minimal accent bar*): name and title slide out of the bar as if from a slot, the bar runs from the name's cap height to the title's baseline; four formats, Ink · Paper · Brand Bold, nine anchors, three sizes, an optional soft shadow; transparent by default.
- **Sheen** — a logo reveal (*light sweep*): the logo emerges from darkness and a specular band, masked to the logo's own shape, lights it on its way across, blooming on dark grounds; tagline tracking in; optional second sweep and exit; white, warm or accent light; original, mono or accent logo colors.
- **Layers** — a transition (*stacked panel wipe*): 2–5 skewed panels sweep across in any of 8 directions with slightly different speeds, cover the whole frame around the cut point and leave in reverse order; Speed compresses it around the cut; colors from the palette's roles or brand tints.
- **Logos and images**: add your own SVG, PNG, JPG or WebP — read and hashed on your device, never uploaded; SVGs become vector artwork (or a safe raster when they use what we don't support). The placeholder brands Halden, Nova and Aero are built in.
- **Preview backdrops** for transparent designs: moving, defocused footage, or Scene A → B swapping at a transition's cut point, or your own still ("Preview on my footage") — preview only, never exported unless you bake it in.
- **Compositor**: isolated layers, masks and effects (blur, bloom, soft shadow) on WebGL2 with a Canvas 2D fallback; motion blur on paused previews; Grain and Soft glow finishes.
- **Export** — rendered on your device in a worker, with the same engine as the preview: MP4 (H.264), transparent WebM (VP9 with alpha), PNG sequences (a ZIP with straight alpha and a README), looping GIFs and PNG stills; 720p to 4K, 24–60 fps, three qualities; transitions can bake Scene A → B underneath and name their cut frame. Where the browser allows it the file is written as it renders; progress, a live preview of the frame being exported, cancel, and *Copy details* when something fails.
- **Adaptive motion blur**: fast motion gets more sub-frames, so fast edges smear smoothly instead of in steps.
- The Lab: image controls, select-style choices, the Layout group, the backdrop picker, a cut marker on the transport and an export panel.

### Fixed

- The Lab's playhead no longer jumps back when frames rendered for an earlier seek arrive late (e.g. End, then Shift+← twice gave 4.00 s instead of 3.00 s).
- GPU blur and bloom were slightly too strong or too weak on odd-sized layers (the downsample pyramid skipped part of its averaging).
- The last frame of an export is clean: exits now finish 1/15 s before the end.
- Where Canvas has no `filter` (Safari without WebGL2 in workers), blur and bloom use three box blurs — a close Gaussian — instead of a blocky downsample chain.

## [0.1.0] — 2026-09-26 — Foundations & engine core

The engine renders its first template. Nothing is public yet: the home page is a placeholder and the Lab is a review tool for preview deployments.

### Added

- **Rise** — the first template (*masked line reveal*): four formats, three Looks (Paper, Ink, Brand Bold), three energies, three exits, 3–12 s durations, left/center alignment, eyebrow and accent rule, the grotesk and editorial pairings. Lines rise inside their own masks, straighten from a skew while their words trail, and the hold breathes.
- **The Lab** (`/lab`, local and preview deployments only): every format side by side with one transport, Looks, palettes incl. random brand colors, pairings, energies, durations, the template's controls, stress text, safe areas, transparent preview, render-cost meter, PNG stills, a JSON state editor and a readout of what the device can do.
- **Engine**: a deterministic motion engine — named easings and closed-form springs (new `lively` spring for Punchy), staggers, seeded randomness, OKLCH color with contrast-safe palettes (21 library palettes, brand palettes from one color), timelines with energy profiles and reading-time warnings, sequences; a Canvas 2D renderer with per-glyph animation, trim paths, clips, gradients and images; HarfBuzz typography with balanced line breaking, auto-fit, optical margins and line masks; a render worker hosting many views with adaptive quality and atomic scene swaps.
- **Fonts**: Mona Sans (served as Ugoki Sans), Inter and Instrument Serif, self-hosted, subsetted and built reproducibly.
- Interface primitives: Button, SegmentedControl, Slider and Switch; icons; the `ugoki` wordmark; app icon.
- Quality gates: 76 unit tests, 48 browser tests (Chromium, Firefox and WebKit in CI), 11 golden frames, end-to-end smoke tests, and a CI workflow that also fails the build if any route would need a server function.

### Changed

- Tagline is now **"Motion, made yours."** (owner decision; replaces "Motion, make yours.").
- `main` is the default branch, and the repo is on Vercel with a preview deployment for every branch and PR.
- Decisions ADR-018 – ADR-025 and the Phase 1 spike results (worker rendering, font delivery, transparent WebM, GIF encoder) are in `docs/08-decisions.md`.

## [0.0.2] — 2026-09-26 — Owner decisions recorded

Still no application code — waiting for the explicit go-ahead.

### Added

- ADR-016 (no analytics or telemetry) and ADR-017 (German private operator: Impressum, Datenschutzerklärung, minimal data footprint).
- Open items for the owner: go-ahead, `main` as default branch, Vercel import, Impressum details, tagline spelling, optional real-Safari checks.
- Large-screen specifications for the owner's 2560 × 1440 reference display: breakpoints up to 2560, gallery up to 6 columns (16:9), 400 px inspector from 1920 px.
- Voluntary *Copy details* error reports (instead of telemetry).

### Changed

- `USER_QUESTIONS.md` is now a decision record (owner answers + defaults).
- Tagline is **"Motion, make yours."**; the landing hero is rebuilt around it (headline + a live stage where visitors type anything and see it animated in five styles).
- ADR-015 accepted: Mona Sans, monochrome "color belongs to the work", `ugoki` wordmark with the Dot, 動き as a quiet signature.
- Success metrics became pre-release success criteria (QA, lab benchmarks, hands-on tests) because Ugoki collects no analytics.
- Performance budgets now reference the owner's desktop PC with a 2560 × 1440 monitor.
- Legal pages: Impressum and Datenschutz, German with English versions.

### Removed

- Vercel Web Analytics and Speed Insights from the plan.
- AI features from the v2 roadmap (not planned for now); custom domain deferred (€0 budget — free Vercel domain for now).

## [0.0.1] — 2026-09-26 — Planning baseline

No application code yet — per the brief, coding starts after the plan is approved.

### Added

- Product plan: vision, positioning ("art-directed motion, rendered on your device"), competitive landscape, personas, principles, scope (v1 / v1.x / v2 / non-goals), success metrics, risks (`docs/01-product.md`).
- Experience spec: routes, key flows, landing, gallery, editor (desktop/tablet/phone), export sheet, shortcuts, states, onboarding, accessibility (`docs/02-experience.md`).
- Design system proposal: monochrome "color belongs to the work" brand, the Dot playhead, Mona Sans type system, Daylight/Cinema themes with verified contrast, components, UI motion, anti-pattern list (`docs/03-design-system.md`).
- Motion language: named easings, closed-form springs, Energy macro-control, reading-time rules, 20 choreography rules, typography-in-motion rules, motion blur and finish (`docs/04-motion-language.md`).
- Architecture with verified 2026 stack (Next.js 16.3, React 19.3, TypeScript 7, Tailwind 4.3, Biome 2.5, Mediabunny, HarfBuzz), structure, state, persistence, security, testing, CI (`docs/05-architecture.md`).
- Engine design: deterministic template contract, Draw API, HarfBuzz text engine, WebGL2 compositor, worker runtime (`docs/06-engine.md`).
- Export design: formats, per-browser codec matrix, worker pipeline, transparency, GIF/PNG sequence, saving, reliability, QA matrix (`docs/07-export.md`).
- Decision log with 15 ADRs (`docs/08-decisions.md`).
- Template library: foundations (spec format, global controls, 21 contrast-checked palettes, OFL font pairings, procedural placeholder system, quality bar) and detailed specs for all 50 launch templates across 10 categories, with build waves and an engine capability matrix (`docs/templates/`).
- `CLAUDE.md`, `ROADMAP.md`, `USER_QUESTIONS.md`, `README.md`.
