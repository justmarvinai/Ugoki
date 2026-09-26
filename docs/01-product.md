# 01 — Product

> **Ugoki** (動き, Japanese for *movement*) is a browser-based motion design tool. Pick a professionally art-directed template, make it yours, preview it live, export it — rendered entirely on your device.

**Tagline:** *Motion, made yours.*
**Positioning:** *Art-directed motion, rendered on your device.*
**Promise to the user:** *"I didn't know I could make something this good this easily."*

---

## 1. Vision

Make professional motion design as easy as choosing a font. Complexity lives underneath the interface, never inside it: users never meet keyframes, easing curves or timelines — they meet great defaults, a few meaningful controls, and instant results.

## 2. The problem

Motion is the most engaging format on every channel — reels, stories, presentations, product pages, video edits — but making *good* motion is still gated:

| Today's options | Why they fail most people |
|---|---|
| **Pro tools** (After Effects, Cavalry, Jitter, Figma Motion, Rive) | Timelines and keyframes must be learned; blank-canvas problem |
| **Template marketplaces** (Motion Array, Envato) | Require After Effects/Premiere to customize |
| **Mass-market editors** (Canva, Adobe Express, CapCut) | Easy, but generic — everyone's posts look the same; weak or no transparent-video export |
| **AI prompt-to-motion** (Hera, Moshion, Fluos) | Uneven, generated-looking results; hard to art-direct |
| **Almost all of the above** | Render in the cloud: uploads, queues, credits, watermarks, privacy concerns |

## 3. Why now

Every major browser can now render and encode professional video on-device: WebCodecs (Chrome/Edge, Safari 16.4+ video / 26+ audio, Firefox 130+ desktop), OffscreenCanvas + WebGL2 in workers, and mature muxing (Mediabunny). That makes three things possible at once:

1. **Instant, private export** — nothing is uploaded, ever.
2. **Zero marginal cost per export** — no render servers, so no watermarks, credits or queues.
3. **Frame-perfect preview = export** — the same deterministic engine draws both.

## 4. Competitive landscape (public information, Sept 2026)

| Tool | Customization | Learning curve | Look | Transparent video export | Rendering |
|---|---|---|---|---|---|
| After Effects + marketplaces | Full pro | Steep | Varies | Yes (ProRes 4444 etc.) | Local desktop |
| Jitter | Timeline, presets | Medium | Clean UI motion | Yes on higher tiers | Browser; alpha/ProRes jobs server-side |
| Figma Motion (beta) | Timeline in Figma | Medium | UI motion | GIF only | — |
| Canva (owns Cavalry since 2026) | Templates, Animate | Low | Generic | GIF only | Server |
| Adobe Express | Templates | Low | Generic | No | Server |
| CapCut | Trend templates | Low | Trendy | No (video) | — |
| Rive / LottieFiles | Editors (state machines / Lottie) | Medium–high | UI/illustration | Yes | Cloud renderer |
| Hera, Moshion, Fluos | AI prompts | Low | Uneven | Some | — |
| **Ugoki** | **Art-directed templates + macro controls** | **Very low** | **Premium, curated** | **Yes (WebM alpha, PNG sequence)** | **100% on-device** |

**Gaps Ugoki fills**

1. **Private, instant export** — no upload, no queue, no account.
2. **Editor-ready overlays** — lower thirds, titles, transitions and logo stings *with alpha*, which mass-market tools don't export.
3. **Taste without a learning curve** — a small, art-directed catalog customized through form-like controls with guardrails.
4. **Economics** — on-device rendering means no watermark and no render credits.

**Threats**: Canva folding Cavalry into its editor, Figma Motion free on all plans, AI tools improving monthly. **Moat**: taste (the template craft), speed (seconds to a great result), privacy (on-device), and focus (we do templates brilliantly, not everything).

## 5. Who it's for

| Persona | Context | Job to be done | Key templates |
|---|---|---|---|
| **Lena** — social media manager, small brand | Posts daily; phone + laptop; brand guidelines | "When I need today's reel/story, I want something on-brand and striking in minutes, so my feed looks premium without a motion designer." | Social, Product & Ads, Brand & Quotes |
| **Sam** — YouTuber / video editor | Premiere, Resolve, Final Cut, CapCut | "When I edit, I want titles, lower thirds and transitions that drop onto my timeline with transparency, so my videos look produced." | Lower Thirds, Transitions, Openers, Text & Titles |
| **Jonas** — startup founder / PM | Launches, changelogs, LinkedIn, pitch decks | "When we ship a feature, I want a crisp product animation today, so the launch doesn't wait for a video agency." | UI / Product Motion, Showcase, Logo |
| **Mika** — designer who doesn't animate | Figma-native, high taste bar | "When a client or my portfolio needs motion, I want results I'm proud of without learning After Effects." | Showcase, Logo & Branding, Text & Titles |
| **Priya** — educator / speaker | Keynote, PowerPoint, courses | "When I present, I want animated titles, quotes and numbers that make my slides feel alive." | Brand & Quotes, Text & Titles, Openers |

**Priority** (decision C1): Lena and Sam first — social creators and video editors — then Jonas; Mika and Priya are served by the same catalog.

## 6. Product principles

1. **Great before you touch it.** Every template, in every format, looks designed before any edit.
2. **Speak designer, not animator.** *Energy*, *Duration*, *Palette* — never curves, keyframes or layers.
3. **Instant by default.** Every change is visible on the next frame. Nothing waits for a server.
4. **Your work stays yours.** On-device rendering, no sign-up, no watermark, no upload.
5. **Constraints are features.** Curated fonts, palettes and layouts; guardrails (auto-fit, contrast, safe areas) make bad results hard to produce.
6. **What you see is what you export.** Preview and export are frame-identical.
7. **The interface moves like the work.** Ugoki's UI uses the same motion language as its templates.

## 7. Core experience — Choose → Customize → Preview → Export

| Step | What the user does | What Ugoki does |
|---|---|---|
| **Choose** | Browses 10 categories of live previews, optionally types their own headline and picks a format to see every template personalized | Renders live, personalized previews; remembers recent drafts |
| **Customize** | Edits text, colors, images/logos, energy, duration, format, position & size | Auto-fits text, guards contrast, re-lays out per format, keeps undo history, autosaves locally |
| **Preview** | Plays, scrubs, loops; sees the exact final result | Deterministic engine, adaptive preview quality, full-quality still when paused |
| **Export** | Picks a preset (Video, Transparent, GIF, PNG sequence, Still) and resolution | Encodes on-device in a worker, streams to disk where possible, names files sensibly |

## 8. Scope

### v1.0 — Launch

- **50 templates** (10 categories × 5), each with 3 Looks, all applicable formats (16:9, 9:16, 1:1, 4:5), Energy, Duration.
- **Landing page** — minimal, bold, live engine in the hero.
- **Gallery** — category navigation, search, format toggle, "type your headline" personalization of all previews, recent drafts.
- **Editor** — stage with on-canvas selection & drag, auto-generated inspector (Content · Style · Motion · Layout), transport with In/Hold/Out sections, Looks, Shuffle, brand-color palettes, image/logo upload (SVG/PNG/JPG/WebP), preview backdrop ("Preview on my footage"), undo/redo, local autosave, keyboard shortcuts.
- **Export** — MP4 (H.264), WebM (VP9, with alpha), PNG sequence ZIP (with alpha), GIF, PNG still; 720p · 1080p · 1440p · 4K; 24 · 25 · 30 · 50 · 60 fps; motion-blur quality; progress, cancel, streaming save where supported.
- **Share links** — design state in the URL hash (no server, images excluded).
- **Responsive** — desktop-first, fully usable on tablet and phone.
- **Accessibility** — WCAG 2.2 AA for the interface.
- **Legal & trust** — Impressum and Datenschutzerklärung (German operator; German with English versions), font/OSS licenses page; no cookies, no analytics, no tracking.

### v1.x — Soon after launch

Brand Kit (colors, logo, fonts saved locally and applied everywhere) · custom font upload (local-only) · inline on-canvas text editing · project files (`.ugoki` export/import) · offline PWA · German localization · animated WebP · more Looks.

### v2 — Later

Audio (music + SFX, beat-synced; Opus/AAC) · Sequences (stitch templates into one video) · new categories (Data & Charts, Captions, Maps, Events) · ProRes 4444 (only if a fast, license-compatible encoder exists) · additional template drops. AI features are **not planned for now** (decision D11).

### Non-goals

A timeline/keyframe editor · general video editing (cutting clips) · accounts, cloud storage or databases · real-time collaboration · stock media libraries · server-side rendering · AI-generated templates at launch.

## 9. Success criteria

Ugoki collects **no analytics or telemetry** (decision D8), so these targets are verified before each release through QA, lab benchmarks and hands-on tests — not tracked from users.

| Criterion | Target | Verified by |
|---|---|---|
| Time to first export (first-time user) | < 3 min | Hands-on tests with first-time users (friends, family) |
| Export reliability | Every format × resolution in the QA matrix completes on all supported browsers | Export QA matrix ([`07-export.md`](07-export.md) §9) |
| Landing LCP / INP / CLS | < 1.8 s / < 150 ms / < 0.05 | Lighthouse + WebPageTest runs (lab) |
| Editor preview | ≥ 60 fps on the reference desktop (owner's PC, 2560 × 1440 monitor); ≥ 30 fps on a mid-range laptop | `/lab` render-cost benchmark |
| Export speed | 1080p30, 5 s, Standard quality in < 10 s on the reference desktop | Timed exports in QA |
| Template quality | 50/50 pass the quality bar and golden-frame tests | Lab review + CI |

Real-world feedback comes from people choosing to share it (errors offer a *Copy details* button for voluntary bug reports).

## 10. Business constraints

- **Non-commercial private project** (decision A1) → Vercel Hobby fits its non-commercial terms. The architecture is static-first, so moving to Vercel Pro or another static host is trivial if that ever changes.
- **Completely free** (A2): no watermark, no registration, no payment — and no end card on exports (D10).
- **Budget €0** (E3): free tools, services and assets only; the free Vercel domain for now, a `.app` domain later (A4).
- **Running cost**: €0/month — static hosting, on-device compute, no database, no analytics.
- **Operator**: a private individual in Germany (A3) → Impressum and Datenschutzerklärung required (ADR-017).

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Browser gaps (Safari: no Canvas `filter`, no `fontStretch`; Firefox Android: no video encoder) | WebGL2 compositor for effects, HarfBuzz text engine, feature detection, graceful fallbacks (GIF/PNG), clear messaging |
| Low-end devices | Adaptive preview resolution, worker rendering, export presets, honest time estimates |
| Keeping 50 templates at a premium bar | Quality bar + golden frames + reference templates + review checklist per template |
| Scope creep toward a timeline editor | Principles and non-goals above; say no by default |
| Font licensing | OFL-only library; no Fontshare/ITF fonts |
| Vercel Hobby limits (100 GB transfer, 5k image optimizations) | Live engine previews instead of preview videos; lean static assets; no `next/image` optimization dependency |
| German legal requirements (Impressum, GDPR) | Legal pages in v1; owner provides details; no cookies, no analytics, no third-party requests (self-hosted fonts) keep the privacy footprint minimal |
| No production data (no analytics) | Broader QA matrix, lab benchmarks, clear in-app errors with voluntary *Copy details* |
| Competitors' reach (Canva, Figma) | Win on taste, alpha overlays, privacy and speed |

## 12. Glossary

| Term | Meaning |
|---|---|
| **Template** | An art-directed, parameterized animation (e.g. *Rise*) |
| **Look** | A curated preset of a template (palette + pairing + a few values) |
| **Palette** | Six color roles: `bg`, `fg`, `muted`, `accent`, `accent2`, `surface` |
| **Pairing** | A display + text font combination (e.g. `editorial`) |
| **Energy** | Calm · Balanced · Punchy — the single motion macro-control |
| **Sections** | In · Hold · Out — shown on the timeline, never edited as keyframes |
| **Cut point** | The fully covered frame of a transition, where an editor cuts |
| **Movable group** | A part of a template the user can drag and scale on the stage |
| **Stage / Inspector / Transport** | Canvas area / controls panel / play-scrub bar in the editor |
| **Golden frame** | A reference render used by tests to catch visual regressions |
| **u** | Layout unit: 1% of the frame's short side |
