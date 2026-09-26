# Questions for you

> Everything I'd like you to decide before (or while) we build Ugoki. Every question has a **recommendation** — if you agree, you don't need to write anything for it.

**How to answer**: reply in chat or fill in the *Your answer* lines here. The fastest reply is: **"Go with all recommendations, except: …"**.

Priority: 🔴 needed before coding starts · 🟡 needed before the phase noted · ⚪ can wait.

---

## A. Business & legal

### 🔴 A1. Is Ugoki commercial?
Vercel's free **Hobby plan is for non-commercial, personal use only**. Vercel defines commercial use as any deployment used "for the purpose of financial gain of anyone involved in any part of the production of the project" — e.g. charging users, ads, promoting a paid product or service, or paid client work.
- (a) Personal / non-commercial for now
- (b) Commercial from day one → Vercel Pro ($20/month) or another host
- (c) Not sure yet

**Recommendation**: (a). Everything is static and on-device, so moving to Vercel Pro (or any static host) later takes minutes.
*Your answer:*

### 🔴 A2. Business model at launch
**Recommendation**: completely free, **no watermark, no sign-up**. On-device rendering costs nothing per export; "free, private, no strings" is the marketing.
*Your answer:*

### 🔴 A3. Who is the operator, and where are you based?
If you're in Germany/the EU, the site needs an **Impressum** and a **privacy policy** (Datenschutzerklärung). Ugoki uses no cookies and cookieless analytics, so **no cookie banner** is needed.
**Recommendation**: I build the legal pages as templates; you provide name, postal address and contact email (and VAT ID if applicable).
*Your answer:*

### 🟡 A4. Domain (before Phase 6)
**Recommendation**: a short `.app` or `.studio` (e.g. `ugoki.app`, `ugoki.studio`) if available; until then `ugoki.vercel.app`.
*Your answer:*

### ⚪ A5. Repository visibility & code license
**Recommendation**: private repository, proprietary ("all rights reserved"). Note: private repos get 2,000 free GitHub Actions minutes/month, enough for our CI.
*Your answer:*

---

## B. Brand

### 🔴 B1. Brand typeface
All options are free for commercial use and self-hostable unless noted.
- (a) **Mona Sans v2** — one variable superfamily from text to Expanded Black; its width axis lets the logo literally *move*. Caveat: it's also GitHub's typeface (offset by Expanded widths, a custom-kerned wordmark and stylistic alternates).
- (b) **Archivo** — widest free grotesk (62–125 width), no strong brand association, more "poster".
- (c) **Funnel Display + Funnel Sans** — distinctive 2024 pair, not overused; weight axis only.
- (d) A commercial typeface (e.g. Aeonik — Revolut's face, Söhne, PP Neue Montreal) — license costs vary (typically hundreds to low thousands of euros for web/app use).

**Recommendation**: (a) Mona Sans.
*Your answer:*

### 🔴 B2. Color stance
Research finding: current design commentary lists *"near-black with one acid-green or vermilion accent"* and *"cream + serif + terracotta"* as tell-tale signs of AI-generated sites — so I dropped my own first idea (a vermilion accent).
- (a) **Monochrome — "color belongs to the work."** The UI is black/white; the only color comes from the templates (the playhead Dot borrows the playing template's accent).
- (b) Monochrome + **one signature hue** held back for key moments (Revolut-style). If so, which hue?
- (c) Something else you have in mind.

**Recommendation**: (a).
*Your answer:*

### 🔴 B3. Logo / wordmark
Do you already have a logo? If not: lowercase **`ugoki`** in Mona Sans Expanded, with **the Dot** (the i's tittle) as the playhead — used for loading, progress and the favicon.
**Recommendation**: the Dot wordmark as proposed in [`docs/03-design-system.md`](docs/03-design-system.md) §2.
*Your answer:*

### 🟡 B4. The Japanese word 動き (before Phase 6)
- (a) Quiet secondary signature — footer and "About" line only
- (b) Part of the logo lockup
- (c) Not at all

**Recommendation**: (a).
*Your answer:*

### 🟡 B5. Tagline (before Phase 6)
**Recommendation**: **"Make it move."** Alternatives: "Motion, made yours." · "Movement, by design." · yours.
*Your answer:*

### 🟡 B6. Themes (before Phase 2)
**Recommendation**: landing page light ("Daylight") with black showcase bands; gallery, editor and export dark ("Cinema") so the work pops. A light editor theme can come later (v1.x) if people ask.
*Your answer:*

---

## C. Audience & scope

### 🔴 C1. Who matters most first?
Personas in [`docs/01-product.md`](docs/01-product.md) §5: social media managers, YouTubers/video editors, founders/PMs, designers who don't animate, educators/speakers.
**Recommendation**: social creators + video editors first (Social, Text & Titles, Lower Thirds, Transitions), then founders (UI motion, Showcase).
*Your answer:*

### 🔴 C2. Language(s)
Your reference links were German (revolut.com/de-DE, wise.com/de).
- (a) English UI at launch, built i18n-ready; German in v1.x
- (b) English + German at launch
- (c) German first

**Recommendation**: (a). Template default copy in English; users type their own language (German umlauts, French accents, etc. are fully supported by the font subsets).
*Your answer:*

### 🔴 C3. Phones
**Recommendation**: the full editor works on phones (bottom-sheet controls, tap-to-edit, pinch/drag) — Social templates are often made on phones; desktop gets the most polish.
*Your answer:*

### 🔴 C4. Browser support
**Recommendation**: modern browsers only — Chrome/Edge (last 2 years), Safari 17+, Firefox 130+. Firefox on Android can edit but can only export GIF/PNG (it has no video encoder).
*Your answer:*

### 🟡 C5. The 50 templates (before Phase 3)
Please skim [`docs/templates/README.md`](docs/templates/README.md) (one-line index) and any category files you care about.
- Anything you'd swap, drop or rename?
- Any use case you consider essential that's missing (e.g. weddings, real estate, sports scores, podcasts, events, captions, crypto/finance tickers)?

**Recommendation**: keep as planned; add requests to the post-launch drops.
*Your answer:*

### 🟡 C6. Build order (before Phase 3)
**Recommendation**: wave 1 as listed in [`docs/templates/README.md`](docs/templates/README.md) (2–3 per category so the gallery is complete early, starting with Rise, Line, Sheen, Layers, Punch, Deal, Click).
*Your answer:*

---

## D. Features

### 🟡 D1. Export formats at launch (before Phase 2)
Planned: **MP4** (H.264), **WebM with transparency** (VP9), **PNG sequence** (ZIP, transparency), **GIF**, **PNG still**.
Not planned at launch: **ProRes 4444 (.mov)** — no browser can encode it natively; the only path is a very slow, GPL/LGPL-encumbered ffmpeg.wasm build. PNG sequences cover Premiere Pro/Final Cut transparency workflows.
**Recommendation**: as planned. Tell me if ProRes is essential for your audience.
*Your answer:*

### 🟡 D2. Resolution & frame rate (before Phase 2)
**Recommendation**: up to **4K** and **60 fps**; default **1080p at 30 fps**.
*Your answer:*

### 🟡 D3. Audio / music
**Recommendation**: not at launch; v2 adds a royalty-free music & SFX library with beat-synced templates. Is audio essential for you at launch?
*Your answer:*

### 🟡 D4. Default imagery (before Phase 3)
Templates must look finished before editing — without stock photos.
- (a) **Original procedural placeholders** rendered by the engine (abstract "product renders", stylized landscapes, generative artworks, app screens) — zero bandwidth, fully consistent
- (b) Your own product photos/brand assets
- (c) Curated CC0 photography

**Recommendation**: (a), optionally combined with (b) if you have assets you'd like to feature.
*Your answer:*

### 🟡 D5. Brand Kit & custom font upload
**Recommendation**: v1 has a one-color "Brand" palette generator and logo uploads per template; the full Brand Kit (saved colors, logo, fonts applied everywhere) and local custom font upload come in v1.1.
*Your answer:*

### 🟡 D6. Editing text directly on the canvas
**Recommendation**: v1 — clicking text on the stage selects it and focuses its field in the inspector (with drag/scale for positioning); true inline typing on the canvas in v1.1.
*Your answer:*

### 🟡 D7. Share links
**Recommendation**: yes in v1 — the design is encoded in the link itself (no server); uploaded images aren't included.
*Your answer:*

### 🟡 D8. Analytics (before Phase 6)
On Hobby, Vercel Web Analytics counts **page views only** (custom events like "export completed" need Pro).
- (a) Vercel Web Analytics + Speed Insights only (free, cookieless)
- (b) (a) + Umami (cookieless, has a free tier) for export funnel events
- (c) No analytics

**Recommendation**: (a) at launch; (b) if you want funnel numbers.
*Your answer:*

### ⚪ D9. Error monitoring
**Recommendation**: none at launch (privacy-first, nothing to leak); consider Sentry's free tier later.
*Your answer:*

### ⚪ D10. Attribution on exports
**Recommendation**: no watermark, no end card — only the `ugoki-` filename prefix. Want an optional "Made with Ugoki" end card?
*Your answer:*

### ⚪ D11. AI features
**Recommendation**: none in v1 (would need API keys, serverless functions and running costs). Candidate for v2: copy suggestions, "brand from website".
*Your answer:*

---

## E. Process

### ⚪ E1. Timeline
Do you have a target launch date or any deadline (event, pitch)?
*Your answer:*

### ⚪ E2. Reviews
**Recommendation**: one pull request per phase/milestone with a Vercel preview link and a short written walkthrough; you review in the browser.
*Your answer:*

### ⚪ E3. Budget
**Recommendation**: €0 path (everything planned is free); optional costs: domain (~€15–40/year), a commercial typeface (B1d), Vercel Pro if commercial (A1).
*Your answer:*

### ⚪ E4. Reference devices
Performance budgets assume an Apple M1/M2 MacBook Air (60 fps) and a mid-range Windows laptop (30 fps). Which devices do *you* use daily (so I test there first)?
*Your answer:*

### ⚪ E5. Interpretation check
I read **"barely"** (landing page) as *barely-there*: minimal chrome, very few elements, huge type, lots of space, with motion doing the talking. Correct?
*Your answer:*

---

## Quick reply template

```
A1: a   A2: ok   A3: <name, address, email>   A4: <domain or later>   A5: ok
B1: a   B2: a    B3: ok   B4: a   B5: ok   B6: ok
C1: ok  C2: a    C3: ok   C4: ok  C5: ok   C6: ok
D1: ok  D2: ok   D3: ok   D4: a   D5: ok   D6: ok   D7: ok   D8: a   D9: ok   D10: ok   D11: ok
E1: …   E2: ok   E3: ok   E4: …   E5: ok
Go: yes / not yet
```
