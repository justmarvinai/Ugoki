# Changelog

All notable changes to Ugoki are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions map to roadmap phases (see [`ROADMAP.md`](ROADMAP.md)).

## [Unreleased]

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
