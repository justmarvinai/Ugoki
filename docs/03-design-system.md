# 03 — Design System

> Ugoki's visual identity and interface system: brand, voice, color, type, layout, components, UI motion and the rules that keep it from looking generic.

Status: **decided** (2026-09-26) — typeface Mona Sans, monochrome color stance, `ugoki` wordmark with the Dot, 動き as a quiet signature, tagline *Motion, made yours.* (see [`USER_QUESTIONS.md`](../USER_QUESTIONS.md), ADR-015).

---

## 1. Brand idea

**The interface is a stage. Color belongs to the work.**

Ugoki's own interface is strictly **monochrome** — white and black, type and space. Every color on screen comes from the user's work: live templates, palettes, their brand. Personality comes from two things only:

1. **Typography** — one bold, variable-width typeface whose width axis literally *moves* (動き = movement).
2. **Motion** — the interface moves with the same motion language as the templates ([`04-motion-language.md`](04-motion-language.md)).

References, not templates: Apple (the product is the hero, the interface recedes), Revolut (confident large type, black/white bands, brand color held back), Wise (one loud display voice, motion as a token system).

**Why monochrome** (a deliberate stance, validated in research): current design commentary identifies "near-black background with one acid-green or vermilion accent" and "cream background + high-contrast serif + terracotta accent" as tell-tale signs of AI-generated sites. A tool that showcases *other people's* colors should not compete with them.

---

## 2. Name, wordmark and the Dot

- **Name**: Ugoki (sentence case in text). Pronounced *oo-GOH-kee*.
- **Wordmark**: `ugoki` — lowercase, Mona Sans at **Expanded width (wdth 125), weight 800**, tracking −4%, custom-kerned. Short, round letterforms read friendly *and* bold.
- **The Dot**: the tittle of the `i` is replaced by a perfect circle — **the playhead**. It is Ugoki's only brand device and appears everywhere motion happens:
  - the i-dot in the wordmark,
  - the playhead on every timeline,
  - the export progress indicator (it travels the timeline),
  - the loading indicator (a pulse),
  - the favicon (the Dot inside a rounded square).
- **The Dot's color**: ink/white by default; when a template plays, it **takes that template's accent** — the only color the interface ever shows is borrowed from the work.
- **Wordmark motion**: on first paint the letters expand from condensed (wdth 75) to expanded (wdth 125) on a `snappy` spring while the Dot drops in and settles. On hover (footer), the letters breathe along the width axis.
- **動き** (the Japanese word) is a quiet secondary signature: footer and About line only ("Ugoki — 動き — movement"), set in M PLUS 1 or Noto Sans JP (subset to two glyphs). Not part of the logo.
- **Tagline**: *Motion, made yours.* — the landing headline; the hero stage makes it literal (visitors type their own words and watch them animate).

---

## 3. Voice & tone

**Short. Confident. Warm. Precise.** Verbs first, sentence case, numerals for numbers, American English.

| Do | Don't |
|---|---|
| "Motion, made yours." | "Unleash your creativity with AI-powered motion!" |
| "Pick a starting point." | "Browse our extensive library of stunning templates" |
| "Done. 6.2 MB, ready to post." | "Your export has completed successfully!" |
| "Your browser can't make MP4s. Try WebM, or open Ugoki in Chrome or Safari." | "Error: codec not supported" |
| "Stays on your device." | "We take your privacy seriously." |

Banned words: *revolutionary, unleash, supercharge, seamless, effortless, magic, next-level, AI-powered, stunning*. No exclamation marks.

---

## 4. Color

### Themes

Two themes, each monochrome. Marketing pages use **Daylight** with full-bleed **Cinema** bands for showcase moments; the gallery, editor and export use **Cinema** so colorful work pops.

**Daylight** (landing, legal)

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--bg` | `#FFFFFF` | Page | — |
| `--bg-2` | `#F2F2F2` | Alternate bands, input fills | — |
| `--fg` | `#0A0A0A` | Primary text, primary buttons | 19.8:1 |
| `--fg-2` | `#4A4A4F` | Secondary text | 8.8:1 |
| `--fg-3` | `#737378` | Tertiary text (on `--bg` only) | 4.7:1 |
| `--line` | `rgb(10 10 10 / 0.10)` | Hairlines | — |

**Cinema** (gallery, editor, export, dark bands)

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--bg` | `#0A0A0B` | App background, stage surround | — |
| `--bg-2` | `#111113` | Panels (inspector, bars) | — |
| `--bg-3` | `#18181B` | Controls, inputs | — |
| `--bg-4` | `#222226` | Hover / pressed | — |
| `--fg` | `#F5F5F4` | Primary text | 18.1:1 |
| `--fg-2` | `#A1A1A6` | Secondary text | 7.3:1 (on `--bg-2`) |
| `--fg-3` | `#7C7C82` | Tertiary text (on `--bg`/`--bg-2` only) | 4.55:1 (on `--bg-2`) |
| `--line` | `rgb(255 255 255 / 0.08)` | Hairlines | — |
| `--line-strong` | `rgb(255 255 255 / 0.16)` | Control borders, dividers | — |

### Functional colors (never decorative)

| Token | Daylight | Cinema | Use |
|---|---|---|---|
| `--focus` | `#0A5CFF` (5.3:1) | `#4D8DFF` (6.2:1) | Focus rings only |
| `--select` | `#2F6BFF` + 1 px white outline | same | On-stage selection handles (visible over any content) |
| `--danger` | `#D93036` (4.7:1) | `#E5484D` (4.8:1) | Destructive actions, errors |
| `--warning` | `#A35F00` (5.0:1) | `#FFB224` (10.5:1) | Readability/contrast warnings |
| `--success` | `#1E7F4F` (5.0:1) | `#30A46C` (6.0:1) | Export complete |
| `--dot` | `--fg` | `--fg` → current template `accent` | The playhead Dot |

The dark-footage **checkerboard** (transparent stage) uses `#141416`/`#1B1B1E` squares at 16 px.

---

## 5. Typography

**One family: Mona Sans v2** (SIL OFL, self-hosted from the GitHub build for `opsz` and the Mono), plus **Mona Sans Mono** for timecodes and numeric readouts. The width axis is the brand's voice: Expanded for display, Normal for text and UI.

To keep a distinct voice (Mona Sans is also GitHub's typeface): Expanded widths for display, custom-kerned wordmark, and a brand spike in Phase 1 to choose stylistic alternates.

### Marketing scale (Daylight)

| Token | Size | Line height | Tracking | Weight · Width |
|---|---|---|---|---|
| `display-xxl` | `clamp(64px, 11vw, 184px)` | 0.90 | −0.04em | 800 · 125 |
| `display-xl` | `clamp(48px, 7vw, 112px)` | 0.92 | −0.035em | 750 · 118 |
| `display-l` | `clamp(36px, 4.5vw, 72px)` | 0.95 | −0.03em | 700 · 112 |
| `title` | `clamp(26px, 2.6vw, 40px)` | 1.05 | −0.02em | 650 · 100 |
| `body-l` | 20px | 1.45 | −0.005em | 450 · 100 |
| `body` | 17px | 1.5 | 0 | 420 · 100 |
| `small` | 14px | 1.4 | 0 | 450 · 100 |
| `micro` | 12px | 1.3 | +0.01em | 550 · 100 (sentence case) |

### App scale (Cinema)

`11 · 12 · 13 (base) · 14 · 16 · 20 · 24` px; weights 450 (text), 550 (labels), 650 (titles); `tnum` for every changing number; timecode in Mona Sans Mono 13 px.

### Rules

- Headlines ≤ 2 lines on marketing pages; one display voice per view.
- Display type: negative tracking; small text: neutral tracking.
- **Never**: an italic serif "statement word" in a headline, ALL-CAPS monospace eyebrow labels, Inter/Geist/Satoshi/Space Grotesk as the brand face.
- Line length 45–75 characters for body copy.

---

## 6. Layout

- **Grid**: 12 columns; max content width 1440 px (marketing), full-bleed bands; gutters 24 px (≥ 1024 px) / **16 px on phones**; no horizontal scroll at any width.
- **Spacing** (4 px base): `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96 · 128 · 160 · 200`.
- **Section rhythm** (marketing): alternating full-bleed Daylight/Cinema bands; 128–200 px vertical padding desktop, 80–120 px mobile. The color change *is* the divider — no rules, no cards.
- **Radii**: 6 (small controls) · 10 (buttons/inputs in app) · 14 (popovers, sheets) · 20 (media tiles, stage) · pill (primary CTAs, chips).
- **Elevation**: tone steps and hairlines, not shadows. Only popovers/menus/sheets get a soft shadow in Cinema (`0 12px 32px rgb(0 0 0 / 0.4)`).
- **Breakpoints**: 480 · 768 · 1024 · 1280 · 1536 · 1920 · 2560.
- **Large screens are first-class**: the owner's reference display is 2560 × 1440, so every screen is designed and reviewed at 2560 as well as 1440, 1280 and 375 px wide. Extra width goes to *more work on screen* (more gallery columns, a bigger stage, a 400 px inspector from 1920 px), never to longer text lines — marketing copy keeps its 1440 px content width inside full-bleed bands.

---

## 7. Iconography

A small custom set (~32 icons): 24 px grid, 1.75 px stroke, round caps and joins, geometric construction matching Mona Sans; filled variants for active states. Phosphor (MIT) may serve as a construction reference. No emoji as icons, no sparkles, no "magic wand".

Core set: play, pause, loop, undo, redo, export, download, back, chevrons, close, plus, minus, trash, duplicate, link, image, text, palette, font, shuffle, energy, clock, aspect (4 variants), guides, eye, lock, keyboard, drag handle, check, warning, info.

---

## 8. Components

| Component | Spec highlights |
|---|---|
| **Button** | Primary: pill, `--fg` fill, `--bg` text, 56 px (marketing) / 36 px (app). Secondary: pill, `--line-strong` border. Ghost. Icon button 36 × 36, radius 10. Pressed: scale 0.97 + tone step. Focus: 2 px `--focus` ring, 2 px offset. |
| **Segmented control** | Formats, Energy, themes. Pill track; indicator slides on `snappy` spring. Signature control. |
| **Slider** | 4 px track, 20 px thumb, value bubble while dragging, detents (e.g. whole seconds), arrow-key steps, Shift = ×10. |
| **Text field / area** | Auto-grow, live apply, character counter near the limit, inline hint for `*emphasis*`. |
| **Palette row** | Palettes as 6-role swatch strips; hover previews live on stage, click commits. |
| **Color picker** | OKLCH-based picker, HEX input, EyeDropper where supported (Chromium desktop), brand colors row, contrast warning inline. |
| **Pairing picker** | List of pairings rendered in their own fonts ("Ag" + name). |
| **Image drop** | Drag & drop, paste, click; thumbnail, Fit (Cover · Contain), focal-point picker, replace, remove; "Stays on your device." |
| **List editor** | For messages, callouts, stats: drag to reorder, add/remove within min/max. |
| **Point picker** | Crosshair mode on the stage (Iris origin, callout anchors). |
| **Toggle · Select · Menu · Popover · Tooltip** | Tooltips show shortcuts (`Kbd`). |
| **Sheet / Dialog** | Export sheet (side sheet on desktop, full-height sheet on phones). |
| **Toast** | Bottom-center, 4 s, one at a time, optional Undo. |
| **Stage** | Canvas container: checkerboard for alpha, safe-area guides toggle, fit/100% zoom, drop-zone overlay. |
| **Transport** | Play/pause, timecode (Mono, `tnum`), scrubber with In/Hold/Out bands, **the Dot as playhead**, loop, duration handle, cut marker (transitions). |
| **Template tile** | Media only (radius 20) with the name beneath; hover plays from the start and shows Look dots; no card chrome. |
| **Category nav** | Large text tabs (20–24 px) with a 2 px sliding underline on a spring; subtle counts. |

Headless primitives (focus management, a11y) come from Base UI; all visuals are Ugoki's own.

---

## 9. UI motion

The interface uses the template easing names ([`04-motion-language.md`](04-motion-language.md) §3):

| Token | Duration | Curve | Use |
|---|---|---|---|
| `micro` | 120 ms | `swift` | Hover, press, toggles |
| `small` | 200 ms | `swift` / `glide` | Popovers, tooltips, tabs |
| `medium` | 320 ms | `glide` in / `exit` out | Sheets, panels, toasts |
| `large` | 500 ms | `glide` | Page-level transitions, stage format morph |
| `hero` | 800–1200 ms | per choreography | Landing hero, wordmark |
| springs | — | `snappy` | Drag, segmented indicators, sheet drag, tile morphs |

**Signature interactions**

1. **Tile → Editor morph** — the gallery tile's canvas expands into the editor stage (React `<ViewTransition>`), no blank page in between.
2. **The Dot** — playhead, progress, loading pulse; takes the playing template's accent.
3. **Hover-to-preview** — palettes, Looks and pairings preview live on the stage; click commits.
4. **Format morph** — switching 16:9 → 9:16 springs the stage frame while the template re-lays out live.
5. **Export fast-forward** — the stage plays the frames being encoded while the Dot travels the timeline.
6. **Scroll is the playhead** — on the landing page, scrolling scrubs real templates.

`prefers-reduced-motion`: UI transitions become fades or instant; gallery previews stop autoplaying (poster + play on hover/focus); the landing hero shows a static frame with a play button.

---

## 10. Imagery

No stock photography, no 3D blobs, no illustrations of people. Every image in Ugoki's own UI and marketing is a **live Ugoki render** or a real screenshot of the product.

---

## 11. Anti-patterns — the "no AI-slop" list

- Gradient blobs, mesh backgrounds, glassmorphism, neon glows in the UI.
- Purple-blue gradients; one acid-green or vermilion accent on near-black; cream + serif + terracotta.
- Identical rounded card grids (icon + title + two lines of text).
- ALL-CAPS monospace eyebrow labels; an italic serif statement word in headlines.
- Inter, Geist, Satoshi, Space Grotesk, Manrope as the brand face.
- Emoji or ✨ as icons; "AI-powered" badges.
- Testimonial carousels, fake logo walls, "Trusted by" rows.
- Shadows on everything, borders around everything.
- Lorem ipsum, stock imagery, centered-everything layouts with tiny text, more than one primary CTA per view.

---

## 12. Accessibility requirements

- WCAG 2.2 AA for all interface text and controls (contrast values above).
- Visible focus on every interactive element; logical tab order; all actions available by keyboard.
- Target size ≥ 24 × 24 px (app controls are 32–36 px).
- Color is never the only signal (sections, states, warnings also use shape/text).
- The stage exposes a text alternative (template name + current content).
- Export progress announced politely (`aria-live`) at 10% steps; errors announced assertively.
- Reduced motion respected as described in §9.
