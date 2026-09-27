# Questions & decisions

> **Status (2026-09-27)**: all planning questions are answered; Phases 1 and 2 are merged (the owner on Phase 2: "Everything works") and Phase 3 is underway. **You** = your explicit answer · **Default** = the recommendation, applied because you asked for defaults on everything you didn't answer. The original questions with all their options are in the git history (commit `31d5c8c`).

---

## Open items

| # | Item | Status |
|---|---|---|
| O1 | Go-ahead to start coding | ✅ Given 2026-09-26 — Phase 1 started |
| O2 | `main` as the default branch | ✅ Created by the owner; phase PRs target `main` |
| O3 | Import the GitHub repo into Vercel (free Hobby account) | ✅ Done 2026-09-26 — every branch and PR gets a preview deployment |
| O4 | **Impressum details**: your full name, a postal street address (a P.O. box is not enough) and an email address. If you'd rather not publish your home address, ask a lawyer about alternatives. *Not legal advice* — before launch, check the final legal texts with a reputable German generator or a lawyer. | ⏳ Later (before launch, Phase 6) |
| O5 | Tagline spelling | ✅ **"Motion, made yours."** |
| O6 | Occasional access to an iPhone, iPad or Mac for real-Safari checks (CI covers WebKit, not Safari's video encoders). **First check, once the Vercel preview exists:** open `/lab` on the preview URL in Safari (Mac and/or iPhone), press play, and send a screenshot of the *This device* panel plus whether *Rise* plays smoothly. | ✅ 2026-09-26 — the owner checked the Lab on the preview: "works". A *This device* readout from Safari still helps Phase 2's export QA |

---

## Decisions

### A. Business & legal

| # | Topic | Decision | Source |
|---|---|---|---|
| A1 | Commercial use | Non-commercial private project → Vercel Hobby fits | You |
| A2 | Business model | Completely free: no watermark, no registration, no payment | You |
| A3 | Operator | You, a private individual based in Germany → Impressum + Datenschutzerklärung pages (German, with English versions); no cookies and no tracking, so no cookie banner (ADR-017) | You |
| A4 | Domain | The free Vercel domain for now; a `.app` domain later (outside the €0 budget) | You |
| A5 | Repository & license | The repo stays public as it is (unlimited free GitHub Actions minutes); no open-source license → all rights reserved | You (no preference) + Default |

### B. Brand

| # | Topic | Decision | Source |
|---|---|---|---|
| B1 | Typeface | **Mona Sans v2** (self-hosted, Expanded widths for display) | You |
| B2 | Color stance | **Monochrome — color belongs to the work** (ADR-015) | You |
| B3 | Logo | No existing logo → lowercase `ugoki` wordmark with **the Dot** as the playhead | You + Default |
| B4 | 動き | Quiet secondary signature (footer, About line) | You |
| B5 | Tagline | **"Motion, made yours."** | You |
| B6 | Themes | Daylight landing with Cinema bands; Cinema (dark) gallery, editor and export | Default |

### C. Audience & scope

| # | Topic | Decision | Source |
|---|---|---|---|
| C1 | Priority audience | Social creators and video editors first, then founders/product teams | Default |
| C2 | Language | English UI at launch, built i18n-ready; German UI in v1.x; legal pages in German (+ English) | Default |
| C3 | Phones | Full editor on phones (bottom sheets, tap-to-edit, drag/pinch); desktop gets the most polish | You |
| C4 | Browsers | Chrome/Edge (last 2 years), Safari 17+, Firefox 130+ | Default |
| C5 | Templates | Keep all 50 as planned | You |
| C6 | Build order | Waves as planned (reference templates Rise, Line, Sheen, Layers, Punch, Deal, Click first) | Default |

### D. Features

| # | Topic | Decision | Source |
|---|---|---|---|
| D1 | Export formats | MP4, WebM with transparency, PNG sequence with transparency, GIF, PNG still; no ProRes at launch | Default |
| D2 | Resolution & fps | Up to 4K and 60 fps; default 1080p at 30 fps | Default |
| D3 | Audio | Not at launch; v2 | Default |
| D4 | Default imagery | Original procedural placeholders rendered by the engine | Default |
| D5 | Brand Kit & custom fonts | v1.1 (v1: one-color Brand palettes + logo uploads) | Default |
| D6 | Inline text editing on canvas | v1.1 (v1: clicking text selects it and focuses its field) | Default |
| D7 | Share links | In v1 (state in the link, images excluded) | Default |
| D8 | Analytics | **None** — no analytics, no Speed Insights, no telemetry of any kind (ADR-016) | You |
| D9 | Error monitoring | None; errors offer a voluntary *Copy details* button for bug reports | Default |
| D10 | Attribution | No watermark, no end card — only the `ugoki-` filename prefix | You |
| D11 | AI features | None for now | You |

### E. Process

| # | Topic | Decision | Source |
|---|---|---|---|
| E1 | Timeline | No deadline — quality over speed | You |
| E2 | Reviews | One pull request per phase with a Vercel preview link and a short written walkthrough | You |
| E3 | Budget | €0 — only free tools, services and assets | You |
| E4 | Reference device | Your desktop PC with a 2560 × 1440 ("2K") monitor — the primary performance and review target; large-screen layouts are specified for it | You |
| E5 | "Barely" | Confirmed: barely-there — minimal chrome, very few elements, huge type, motion does the talking | You |
| E6 | Pace (2026-09-27) | Finish phases faster: still working and looking good, but no excessive checking. Don't watch PRs or CI — the owner tests the preview and reports anything broken, which then gets fixed | You |

---

## What changed in the plan because of these answers

- **Landing hero** is built around the tagline: headline *Motion, made yours.* plus a live stage where visitors type anything and see it animated in five template styles (`docs/02-experience.md` §4).
- **No analytics**: removed Vercel Web Analytics and Speed Insights; success targets are verified through QA, lab benchmarks and hands-on tests (`docs/01-product.md` §9, ADR-016).
- **Legal**: Impressum and Datenschutzerklärung in German with English versions; fonts self-hosted, no third-party requests at runtime (ADR-017).
- **Brand**: ADR-015 accepted — Mona Sans, monochrome, the Dot wordmark, 動き as a quiet signature.
- **Reference device**: budgets and QA target your 2560 × 1440 desktop; gallery columns, editor inspector width and breakpoints now cover large screens (`docs/03-design-system.md` §6, `docs/02-experience.md` §5–6).
- **€0**: Vercel domain, no paid services; the public repo keeps CI free.
