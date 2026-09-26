# 01 — Text & Titles

> Pure typography. Headlines, title cards, statements. Five distinct typographic personalities: **editorial** (Rise), **expressive** (Stretch), **kinetic poster** (Echo), **premium minimal** (Focus), **technical** (Decode).

Category slug: `text-titles` · Conventions: [`00-foundations.md`](00-foundations.md) · Easing & timing vocabulary: [`../04-motion-language.md`](../04-motion-language.md)

---

## 1.1 Rise — *masked line reveal*

**Use it for** chapter titles, keynote headlines, documentary title cards, YouTube section breaks.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `rise` | 16:9 · 9:16 · 1:1 · 4:5 | 5 s (3–12) | in · hold · out | optional | `grotesk` · Paper |

**Art direction.** One to three lines of large grotesk (wght 700, tracking −3%, line height 0.92), flush-left from the title-safe edge or centered. Optional eyebrow above in the text face (wght 500, sentence case, +2% tracking) and a short accent rule (6u × 0.35u) between eyebrow and headline. Generous negative space — the type *is* the composition.

**Choreography**
- `0.00–0.15` Clean background (a clean in-point for editors).
- `0.15–0.55` Accent rule draws left→right (`snap`); eyebrow fades in and rises 1u (`glide`).
- `0.25–1.15` Headline lines rise from 105% below their baseline inside **per-line masks**, line stagger 0.08 s. Each line starts skewed 6° and straightens; words inside a line trail by 0.025 s. Motion blur on.
- `1.15–3.95` Hold: the lockup drifts up 0.6u and tracking opens by +1% — a barely perceptible breath.
- `3.95–4.55` Lines exit upward into the same masks (`exit`, stagger 0.05 s, top line first); rule retracts right→left; eyebrow fades.
- `4.55–5.00` Clean background.

**Controls**
- Content: Headline (multi-line, ≤ 60 chars, 1–3 lines) · Eyebrow (optional, ≤ 24)
- Style: Alignment (Left · Center) · Accent rule (on/off)
- Motion: Exit (Up · Down · Fade)
- Layout: lockup is `movable`

**Defaults.** Eyebrow `Chapter 01` · Headline `Where it` / `all began`

**Looks.** Paper (ink on warm white) · Ink (white on black, yellow rule) · Brand Bold

**The expensive detail.** The skew-straighten during the rise plus the word trail reads as hand-timed. Masks are per *line* (not per block) and sized from font ascent/descent + 8% padding, so descenders never clip at rest.

**Format notes.** 9:16 → centered, +20% size, up to 4 lines. 1:1/4:5 → lower-left third composition.

**Engine needs.** `text.block` (balanced wrap, auto-fit) · per-line clip · word/line stagger · motion blur · hold breath helper.

---

## 1.2 Stretch — *variable-width poster type*

**Use it for** music drops, event posters, bold social hooks, campaign slogans.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `stretch` | 9:16 · 1:1 · 4:5 · 16:9 | 4 s (3–10) | in · hold · out (hold loops) | optional | `grotesk` (Mona Sans variable) · Tangerine |

**Art direction.** One to three short words in heavy uppercase. Each line is **justified edge-to-edge** across the safe width by solving for the width axis (`wdth` 75–125) and size — like a hand-set wood-type poster. Flat, loud background. The letters themselves are the motion.

**Choreography**
- `0.00–0.35` Letters appear as condensed hairlines (wdth 75, wght 200) clustered at center; scaleY 0.6 → 1 (`pop`).
- `0.20–1.10` Each line expands: `wdth` and `wght` spring to target (snappy, ~3% overshoot) while letters spread center-out (stagger 0.035 s). Lines stagger 0.1 s.
- `1.10–3.40` Hold: a **breathing wave** — per-letter width modulates ±12 `wdth` units with a traveling sine (period 1.6 s) while each line's total width stays locked to the frame (widths are redistributed every frame).
- `3.40–4.00` Letters compress to wdth 75, drop weight and slide up out of line masks (`exit`).

**Controls**
- Content: Words (1–3 lines, ≤ 10 chars per line recommended)
- Style: Font (variable families only: Mona Sans · Archivo · Anybody) · Weight range (Light→Black · Regular→Black) · Case (Upper · As typed)
- Motion: Wave (Off · Subtle · Wild)

**Defaults.** `SAY IT` / `LOUD`

**Looks.** Tangerine · Ink · Swiss

**The expensive detail.** Justified-width solving: every line fills the frame exactly, whatever the letters, and the breathing wave *conserves* total line width, so edges never jitter.

**Format notes.** 9:16 → up to 4 lines and larger. 16:9 → 1–2 lines.

**Engine needs.** Path text via HarfBuzz with variation axes (glyph outlines cached per quantized axis value) · width solver (binary search on `wdth`) · traveling-wave helper.

---

## 1.3 Echo — *stacked outline repeats*

**Use it for** kinetic posters, music/culture content, reels hooks, event teasers.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `echo` | 9:16 · 4:5 · 1:1 · 16:9 | 5 s (3–10) | in · hold · out | optional | `poster` · Ink |

**Art direction.** A single-line phrase in bold condensed caps. The solid copy sits dead center; 4–14 **outlined copies** (stroke only) stack above and below at 0.85× line height, fading with distance. Rhythmic, graphic — rave flyer meets Swiss poster.

**Choreography**
- `0.00–0.90` Copies cascade from the top edge into their stacked slots (`snap`, stagger 0.045 s, slight y overshoot).
- `0.70–1.10` The solid main copy punches in (scale 1.08 → 1, blur 6 → 0 px@1080).
- `1.10–4.40` Hold: an **accordion wave** — copy spacing modulates with a traveling sine (amplitude 0.25 line), alternate copies shift ±1u horizontally. The main copy stays steady.
- `4.40–5.00` Copies collapse into the main copy (spacing → 0), then the main copy wipes out horizontally through a mask.

**Controls**
- Content: Phrase (≤ 18 chars)
- Style: Copies (4–14) · Stroke weight (Thin · Regular · Bold) · Direction (Vertical · Horizontal) · Distance fade (on/off)
- Motion: Wave amount (0–100%)

**Defaults.** `ON REPEAT`

**Looks.** Ink · Cobalt · Candy

**The expensive detail.** True glyph outlines (miter joins) with stroke width tied to the *frame*, not the text size, so it looks consistent across formats; the wave is phase-continuous, so the stack reads as one living object.

**Engine needs.** `strokeText`/`fillText` with per-copy transforms · traveling-wave helper · horizontal mask wipe.

---

## 1.4 Focus — *blur-to-sharp headline*

**Use it for** announcements, product teasers, keynote-style statements, premium intros.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `focus` | 16:9 · 9:16 · 1:1 · 4:5 | 5 s (3–12) | in · hold · out | optional (glow off when transparent) | `grotesk` · Midnight |

**Art direction.** Keynote restraint. A centered semibold headline (wght 600, tracking −2%) with a smaller muted subline. Behind the text, a very soft, low-contrast light bloom derived from the palette — used as *light*, never as decoration.

**Choreography**
- `0.00–1.40` Words resolve from blur (28 px@1080 → 0), scale 1.10 → 1.00 and tracking +14% → −2%, word stagger 0.12 s (`glide`, long tail).
- `0.30–1.60` Light bloom fades in, expanding 0.8 → 1.0.
- `1.00–1.80` Subline rises 1u and fades in.
- `1.80–4.30` Hold: slow push-in (scale 1.00 → 1.03, `drift`); bloom breathes ±6% intensity.
- `4.30–5.00` Everything blurs out (0 → 16 px), scales to 0.98 and fades; bloom fades last.

**Controls**
- Content: Headline (≤ 50) · Subline (optional, ≤ 60)
- Style: Glow (Off · Soft · Strong)
- Layout: lockup is `movable`

**Defaults.** Headline `Say hello to` / `something new.` · Subline `Coming this fall`

**Looks.** Midnight · Paper (no glow) · Ink

**The expensive detail.** Blur, scale and tracking converge at the same moment — it reads as a lens pulling focus. Blur radius is expressed in `u`, so a 4K export looks identical to the preview.

**Engine needs.** Per-word blur (Canvas filter or compositor fallback) · animated letter-spacing via per-glyph layout · radial bloom.

---

## 1.5 Decode — *character scramble*

**Use it for** tech launches, teasers, gaming, hackathons, podcast/tech intros.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `decode` | 16:9 · 9:16 · 1:1 · 4:5 | 4 s (3–10) | in · hold · out | optional | `technical` · Graphite |

**Art direction.** Monospace (or technical grotesk) caps, left-aligned in a terminal-like composition with a block cursor. Resolved characters in `fg`, scrambling characters in `muted`, a brief `accent` flash on lock. Optional meta line (e.g. `// TEASER 01`). Optional subtle scanlines.

**Choreography**
- `0.00–0.40` Block cursor blinks twice (stepped, not eased).
- `0.40–1.90` Characters populate left→right. Each scrambles (new seeded glyph every 1/24 s) for 0.25–0.55 s (seeded jitter), then locks; the locked character flashes `accent` for 0.12 s and settles to `fg`. The cursor rides the frontier.
- `1.90–3.40` Hold: every ~1.2 s, 1–2 seeded characters re-scramble for 0.2 s; cursor blinks at 1 Hz.
- `3.40–4.00` Characters scramble and vanish right→left; cursor last.

**Controls**
- Content: Text (1–2 lines, ≤ 32 chars) · Meta line (optional)
- Style: Glyph set (Letters · Numbers · Symbols · Binary · Blocks) · Accent flash (on/off) · Scanlines (on/off)
- Motion: Energy maps to scramble length and rate

**Defaults.** Meta `// TEASER 01` · Text `LOADING` / `SOMETHING BIG_`

**Looks.** Graphite · Ink (yellow flash) · Paper (terminal on paper)

**The expensive detail.** Layout never jitters: glyph slots are fixed to the *final* glyph's advance (proportional fonts scale scrambled glyphs to fit the slot). Scramble runs on a stepped 24 fps clock independent of export fps, so 60 fps exports don't look frantic.

**Engine needs.** Seeded RNG per character · stepped-time helper · per-glyph slot layout.
