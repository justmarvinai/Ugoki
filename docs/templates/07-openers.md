# 07 — Openers

> Intros that set the tone in the first seconds. Five genres: **film** (Cinematic), **channel** (Hype), **design/tech event** (Grid), **travel/vlog** (Departures), **series/podcast** (Episode).

Category slug: `openers` · Conventions: [`00-foundations.md`](00-foundations.md)

---

## 7.1 Cinematic — *film title*

**Use it for** short films, documentaries, trailers, wedding films, brand stories.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `cinematic` | 16:9 · 9:16 · 1:1 · 4:5 | 8 s (6–15) | in · hold · out | no | `editorial` (caps, wide tracking) · Film |

**Art direction.** Letterbox bars (2.39:1 inside the frame), a dark graded backdrop (or the user's image with a slow Ken Burns), a small pre-title credit, a large widely tracked title, and a subtitle/date. Film grain, subtle gate weave, one light leak.

**Choreography**
- `0.00–1.00` Letterbox bars slide in from top and bottom (`glide`); grain fades in.
- `1.00–2.60` Pre-title credit fades in (`drift`), holds, fades out.
- `3.00–5.00` Title fades in from blur while tracking tightens +40% → +18% (long `drift`); a warm light leak sweeps diagonally once (additive, 1.5 s).
- `5.30–6.00` Subtitle/date fades in.
- `hold` Grain and weave continue. Out: fade to black (1.0 s).

**Controls**
- Content: Credit line · Title · Subtitle/date · Background image (optional)
- Style: Grain (Off · Subtle · Heavy) · Light leak (on/off) · Letterbox (on/off) · Gate weave (on/off)

**Defaults.** `A HALDEN PICTURE` · `THE LONG LIGHT` · `IN CINEMAS 2027`

**Looks.** Film · Ink · Midnight

**The expensive detail.** Grain animates at a fixed **24 fps cadence** regardless of export fps (film feel), gate weave is ±0.08u seeded, and the image beneath the bars is subtly vignetted.

**Engine needs.** Grain & weave (post FX) · light leak (additive gradient) · Ken Burns helper · stepped time.

---

## 7.2 Hype — *fast-cut channel intro*

**Use it for** YouTube intros, sports edits, event openers, product teasers with energy.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `hype` | 16:9 · 9:16 · 1:1 · 4:5 | 5 s (3–10) | sequence (beat grid) | no | `poster` · Candy (multi-color) |

**Art direction.** Rapid cuts on a BPM grid: slammed words, image flashes with zoom, graphic bursts (circles, stripes), color swaps — ending on the channel name and logo lockup.

**Choreography**
- Beat grid: 120 BPM → 0.5 s beats; cuts on beats and half-beats.
- Shot pattern (seeded variation): word slam → image zoom → shape burst → word repeat grid → split colors → image → word → **final lockup** (last 1.5 s).
- Each shot has its own micro-move: scale punch 1.2 → 1, whip pans with strong directional motion blur (shutter 360°), stripe sweeps.
- Lockup: name slams, logo pops, a ring shockwave expands, everything settles.

**Controls**
- Content: Words (3–8) · Images (0–6) · Channel name · Logo
- Style: Colors (3–4 from palette)
- Motion: BPM (90–150) · Intensity (Clean · Wild)

**Defaults.** Words `NEW` / `VIDEO` / `EVERY` / `FRIDAY` · Name `MAYA MAKES` · 4 *Artworks*

**Looks.** Candy · Acid · Ink

**The expensive detail.** Every cut lands on the beat grid at the frame level (ready for music later), and whip pans use heavy directional blur for the "edited" look.

**Engine needs.** Beat grid scheduler · shot library · directional motion blur · camera shake.

---

## 7.3 Grid — *Swiss grid poster*

**Use it for** design conferences, tech events, exhibitions, architecture, agencies.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `grid` | 16:9 · 9:16 · 1:1 · 4:5 | 6 s (4–12) | in · hold · out | no | `grotesk` · Swiss |

**Art direction.** International Typographic Style. A visible 6×6 modular grid (hairlines); color blocks occupy modules; flush-left typography at several sizes aligned to the grid; one big numeral. A poster that assembles itself — and keeps breathing.

**Choreography**
- `0.00–0.80` Grid lines draw (horizontals, then verticals; stagger 0.03 s; `snap`).
- `0.60–2.00` Color blocks slide into their modules from grid-aligned directions (`snap`, seeded order).
- `1.20–2.60` Text blocks reveal through line masks; the big number rolls (odometer).
- `hold` At the hold's midpoint, one block slides to a neighboring module — the poster breathes.
- `5.40–6.00` Blocks slide out; lines retract.

**Controls**
- Content: Title (≤ 3 lines) · Subtitle · Date · Location · Big number
- Style: Grid lines (on/off) · Layout seed (Shuffle)

**Defaults.** `Form` / `follows` / `motion` · `International Design Days` · `14—16 OCT 2026` · `ZÜRICH` · `26`

**Looks.** Swiss · Ink · Bauhaus

**The expensive detail.** A rule-based layout generator (asymmetric balance, one dominant block, text never overlaps a block unless contrast passes) — every seed is a valid Swiss poster.

**Engine needs.** Grid system · seeded constraint layout · odometer digits · line trims.

---

## 7.4 Departures — *split-flap board*

**Use it for** travel vlogs, tour announcements, relocations, event line-ups, "what's next".

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `departures` | 16:9 · 1:1 · 4:5 · 9:16 | 7 s (5–15) | in · hold · out | no | `mono` · Amber |

**Art direction.** A split-flap departure board: rows of character cells (dark flaps, center gap line, subtle bevel), destinations on the left, times/status on the right, and a larger title row.

**Choreography**
- `0.00–0.50` Board fades in with blank cells.
- Rows flip sequentially (row stagger 0.25 s): each cell cycles through 4–12 intermediate characters (seeded) at 0.05 s per flip; each flip folds the top half down (scaleY 1 → 0, darkening) and unfolds the bottom half.
- The title row flips last and slower.
- `hold` Every 2 s a status cell flips (`BOARDING` ↔ `ON TIME`).
- Out (0.6 s): all cells flip to blank, fast.

**Controls**
- Content: Title row · Rows (2–5: destination, time/status)
- Style: Board (Classic · Amber · Light)
- Motion: Flip speed

**Defaults.** Title `NEXT STOP: EVERYWHERE` · `TOKYO 09:40` · `LISBON 11:15` · `REYKJAVIK 13:05` · `MEXICO CITY 16:50`

**Looks.** Amber · Mono Dark (white) · Paper (light board)

**The expensive detail.** Flip shading (the top flap darkens as it falls), the 1-px gap line, and a tiny seeded latency per cell like real mechanics.

**Engine needs.** Flap cell renderer · seeded character cycling · stepped time.

---

## 7.5 Episode — *series opener*

**Use it for** podcasts, YouTube series, webinars, courses, newsletters-as-video.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `episode` | 16:9 · 9:16 · 1:1 · 4:5 | 5 s (4–10) | in · hold · out | no | `grotesk` · Tangerine |

**Art direction.** A diagonal cascade of color blocks, the show name huge, an outline episode number rolling like an odometer, the episode title and a guest line. Every element shares one diagonal angle.

**Choreography**
- `0.00–0.60` Three color blocks wipe in diagonally (`snap`, stagger 0.08 s); the last becomes the background.
- `0.40–1.20` Show name punches in (mask rise + scale 1.06 → 1).
- `0.90–1.80` `EP` label; the number rolls 00 → 07 with vertical motion blur and a slight overshoot settle.
- `1.60–2.40` Episode title reveals; guest line follows.
- `hold` Blocks drift subtly along the diagonal.
- `4.50–5.00` Blocks wipe out, covering; cut to background.

**Controls**
- Content: Show name · Episode number · Episode title · Guest (optional) · Cover image (optional)
- Style: Number style (Outline · Solid) · Colors (3 from palette)

**Defaults.** `THE MOTION ROOM` · `EP 07` · `Why timing is everything` · `with Aiko Tanaka`

**Looks.** Tangerine · Cobalt · Forest

**The expensive detail.** One shared diagonal angle across blocks, wipes and motion paths makes the whole opener feel like a system.

**Engine needs.** Odometer digits · angled wipes · motion blur.
