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

**Implementation notes (Phase 1, `src/templates/text-titles/rise`).**
- *Sizes*: headline 16u (16:9), 19.2u (9:16, the +20%), 13u (1:1), 13.5u (4:5); auto-fit shrinks to 40% before flagging overflow. 16:9 lines use up to 72% of the title-safe width, so headlines stay a lockup rather than a banner. Eyebrow 3.4u (4u in 9:16) in the text face, `muted` color; gaps 2.4u eyebrow → rule and 3.6u rule → cap height (3.2u without a rule).
- *Placement*: "9:16 → centered" is read as *vertically centered in the social-safe zone*; horizontal alignment still follows the Alignment control. 1:1/4:5 seat the lockup on the bottom of the safe area (with room for descenders); choosing Center centers the composition in every format. Center alignment is symmetric around the frame's center even where the social zone isn't.
- *Energy*: skew angle and hold drift scale with Energy's travel (skew 3.6° Calm · 6° Balanced · 8.1° Punchy; drift 0.36u · 0.6u · 0.81u); the rise uses Energy's entrance curve (`glide`, or `snap` for Punchy).
- *Skew pivot*: the line's left ink edge, so the skew only ever lowers glyphs and nothing peeks out of a mask before the rise (frame 0 stays clean in every alignment).
- *Exits*: Up (top line first) · Down (bottom line first, into the masks) · Fade (1u upward drift while fading).
- *Motion blur*: arrives with the compositor (Phase 2) for every template at once; Rise needs no change.

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

**Implementation notes (Phase 5, `src/templates/text-titles/stretch`).**
- *Font* (changed while building it): the Font control picks the family — Mona Sans (`wdth` 75–125), Archivo (62–125) or Anybody (50–150), declared as template fonts — and the template lists only the `grotesk` pairing, so the editor shows no pairing picker that would do nothing. Lines hold at wght 900; Anybody holds at 800, because its condensed Black closes its counters.
- *Width model*: each line is shaped once per master and weight (`wdth` at the axis ends and 100, × `wght` every 100 units, plus five widths at the hold weight); advances (kerning included) and ink edges interpolate bilinearly, which is exact because masters interpolate linearly, so nothing is shaped per frame.
- *Justified block*: every line's ink spans the layout width exactly (title-safe; the social zone's symmetric width in 9:16/4:5). Lines share one size where their resting widths — kept 12% inside the axis, room for the wave — can absorb their different lengths; a preferred cap height (36 · 34 · 30 · 30% of the layout height in 16:9 · 9:16 · 1:1 · 4:5) sets that size; lines whose widths run out change size instead. The block fills at most 92 · 86 · 88 · 88% of the height; beyond that the lines may use the whole axis, and only then does the block shrink (no longer filling — e.g. two 2-letter lines in 16:9).
- *Lines*: user line breaks win, except that 16:9 merges down to 2 lines (shortest neighbours first) and 9:16 (up to 4) and 1:1/4:5 (up to 3) split long multi-word lines at the space nearest the middle.
- *Hold*: one wavelength per line width (0.7 for Wild), each line 0.12 cycle behind the one above. Every frame the widths are redistributed (a solved offset, clamped to the axis), quantized to 0.5 `wdth` for cached outlines, and the rounding spread over the gaps (sub-pixel), so the ink edges don't move at all. Subtle is ±24% of the axis range (±12 on Mona Sans), Wild ±40% and faster; Calm ×0.8 at 2.2 s, Balanced 1.6 s, Punchy ×1.1 at 1.2 s with a squarer, pulsing wave. It eases in over the hold's first 0.9 s and runs on into the exit.
- *Entrance and exit*: as specified; the letters start 30% closer than their natural spacing, spring on Energy's spring (Punchy's overshoots the frame edges a touch before settling), and letters in motion use coarser axis steps (fast motion — every letter of a line walks the same few cached instances).

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

**Implementation notes (Phase 5, `src/templates/text-titles/echo`).**
- *Stack* (changed while building it): copies sit 1.12× the cap height (plus their outline) apart instead of 0.85× the line height — the same thing for a face whose caps are 0.7 em, but Anton's caps are 0.86 em, and at 0.85× its 0.9 line height every copy overlapped the next. The first echo clears the solid copy, whose letters no outline ever crosses.
- *Outlines of the union* (changed while building it): variable fonts keep overlapping contours, which a stroke draws as lines inside the letters. Each echo is a double-width miter stroke with everything inside the letters erased — a second pass in the background color over the flat background, an inverted alpha matte when transparent — so the echoes are clean outlines, and neighbours that touch merge into one. Visible widths: Thin 0.18u · Regular 0.32u · Bold 0.5u.
- *Color*: the solid copy is `accent`, the echoes `fg`.
- *Accordion*: every gap rides one traveling wave (0.13 cycle per rank outward; the gap next to the solid copy at half amplitude), 0.2× the cap height at 100% — at the default 70% the tightest gap just closes; alternate copies sway ±1u across. It eases in over the hold's first 0.8 s and runs on into the collapse. Calm 2.4 s at ×0.75, Balanced 1.6 s, Punchy 1.1 s with a squarer pulse; landings glide in Calm, snap otherwise with a 1.2u overshoot.
- *Sizes*: the solid copy spans up to 100 · 94 · 84 · 62% of the layout width (9:16 · 4:5 · 1:1 · 16:9), at most 24 · 21 · 19 · 21u; variable-width faces run at `wdth` 84. Copies 4–14 (an odd count puts the extra copy above); the distance fade goes from 1 to 0.22.
- *Horizontal*: the phrase repeats along its baseline, a band of copies a word space apart (the solid copy 40–62% of the width), cascading in from the left edge.

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

**Implementation notes (Phase 3, `src/templates/text-titles/focus`).**
- *Sizes*: headline 11u (16:9, up to 70% of the title-safe width), 10.5u (9:16, the social zone's symmetric width), 9.6u (1:1), 10u (4:5); the user's lines shrink to 72% before they may wrap (3 lines, down to 40%). Subline 3.3u / 4.2u / 3.5u / 3.7u in the text face, `muted`, half a headline size below the last baseline. The lockup is optically centered (47%) and always centered on the frame.
- *Resolve*: each word is its own bounded compositor layer (at most 8 at once — longer headlines resolve in phrases); its blur, scale and tracking share one curve and one window (0.9 s, stagger 0.12 s compressed to a 0.6 s span for many words). Opening tracking and scale push the neighbouring words apart instead of into each other, and centered lines open symmetrically.
- *Energy*: blur-in ×1.2 / ×1 / ×0.8, scale from 1.06 / 1.10 / 1.135, tracking from +12.8% / +16% / +18.8% above rest, push-in 1.8% / 3% / 4%. Punchy resolves on `snap` (an autofocus locking), the others on `glide`.
- *Bloom*: a Gaussian radial gradient behind the headline — `accent` mixed 35% toward `fg` on dark palettes; on light palettes (where white light can't show) a faint `accent` tint. Soft 0.2 / Strong 0.35 peak opacity; off when transparent. Exit: one layer for the whole lockup (blur to 16 px, 98%, fade on `exit`); the bloom fades last.
- *Looks*: Paper uses the `editorial` pairing (a magazine title card) with Glow off.

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

**Implementation notes (Phase 3, `src/templates/text-titles/decode`).**
- *Type*: the pairing's display face in caps (forced upper case), +4% tracking; variable-width faces run at `wdth` 108 and condense to 96 → 86 for long lines before the size shrinks (to 75%, then 2 lines down to 45%). Sizes 10.5u (16:9) · 9u (9:16) · 8.4u (1:1) · 8.8u (4:5), left on the safe edge, optically centered; a cursor cell is reserved after the text. The meta line is the text face (`muted`, +6%).
- *Slots*: every glyph keeps its final advance; each slot scrambles among the set's glyphs within ±30% of its width (at least four candidates), scaled to fit exactly, so nothing jitters in proportional faces either. Scramble glyphs are precomputed per slot and step (seeded, never the same twice in a row).
- *Timing*: characters arrive ~20 a second (0.95 s span; 14–33 a second by length), all moments on the 24 fps grid; Calm scrambles at 12 fps, Balanced and Punchy at 24 fps; hold glitches every 1.6 / 1.2 / 0.95 s. The lock flash decays from `accent` to `fg` over 0.12 s (a phosphor afterglow; re-locks after a glitch flash softer). The meta line types in 0.15 s after the text starts and leaves first. The cursor is the `accent` color and starts its 1 Hz blink once every character has locked. The entrance section ends 0.2 s after the last character *arrives* — the text reads while the last few lock — so the default 4 s passes the editor's readable-hold check (hold 1.78 s ≥ 1.74 s).
- *Blocks*: the engine's fonts are subset to Latin, so block elements (█ ▀ ▄ ▌ ▐ ░ ▒ ▓ ▚ ▞ ▖ ▝) are drawn as shapes in a cap-height cell.
- *Scanlines* (on by default): lit bands through the type only — the text between them at 66% — so nothing depends on the background; the pitch is 0.5u, never finer than 3 output pixels (no moiré in small previews).
- *Looks*: Ink scrambles with Symbols; Paper uses the `mono` pairing without scanlines.
