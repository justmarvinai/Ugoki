# Changelog

All notable changes to Ugoki are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions map to roadmap phases (see [`ROADMAP.md`](ROADMAP.md)).

## [Unreleased]

### Changed

- Tagline is now **"Motion, made yours."** (owner decision; replaces "Motion, make yours.").
- Phase 1 (foundations & engine core) started; `main` is the default branch; Vercel import deferred until after Phase 1.

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
