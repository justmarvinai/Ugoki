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

**As built (Phase 3).** The whole choreography (≈ 7 s natural) can't fit the 6 s minimum, so below 8 s the entrance compresses proportionally while the fade-out keeps its length and the title keeps a readable hold (the engine's `in` section is the title's arrival at 6 s). Frame 0 fades up from black with the bars (0.7 s), so the first and last frames are both background. The background image is optional (default *scene-dusk*; emptied → the dark graded field, lit beyond the picture so the bars read as they slide in); its grade and the static gradients are baked in `build`, and a soft "power window" darkens behind the type while it's on screen. Grain steps change half-way between 24 fps frames (motion-blur sub-frames of a 24 fps export never mix two grains); texels are one design unit, pre-softened. Vertical and square formats keep the true 2.39:1 strip, with the type inside it. All three texts are set in caps; the title may take two lines and keeps settling (+18% → +16.5%) through the hold. Energy: Calm is slower with a longer focus pull; Punchy has trailer cadence (cards cut instead of fading, a brighter, quicker leak, a 0.7 s fade-out).

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

**As built (Phase 5).** *Words* is one line per shot (a line may hold a short phrase); *Images* are six optional artwork slots (5–6 under More; all six have artwork defaults, and the 5 s default edit shows four). *Colors* is 4 · 3 palette colors to cut between; *Intensity* Clean (flashes a beat long, one whip) · Wild (half-beat flashes, three whips, a color swap on the half-beat inside word shots). Grid: beats from t = 0; words get a beat each (a half-beat when time is short, merged two to a shot when shorter still, never under 0.3 s), flashes fill the gaps, long durations run the words twice; the lockup lands on the beat about 1.5 s before the end. Every cut is moved just *before* its beat, between frames (never inside a sub-frame at 60/30 fps, within 17 ms), so the new shot appears on the beat's own frame — which needs a 180° template shutter: a 360° shutter would straddle every cut. The whip's "360° blur" is drawn instead: averaged copies spread over the distance travelled in 1/30 s (≤ 45% of the frame), so it reads in the one-sample preview too, and the export's motion blur fills in between. Shot library: word slam, repeat grid (outlined rows as marquees), split colors (the lower panel slides in against the upper half), image-filled type (over an offset copy in the ink), letter stutter with an underline, image crash zoom, porthole, bullseye burst, stripe sweep, Bauhaus shapes (for edits without images). Colors per shot from palette roles only: background never the same twice in a row, type ≥ 4.5:1. Lockup: the name slams, a disc of another palette color pops behind it with the logo on the next half-beat (the name takes the disc's own ink where it crosses it), two rings leave the disc's edge; Balanced/Punchy pulse on the beat; the last beat cuts to the background. Camera shake: seeded simplex noise on hits. Energy changes how shots land, never the edit (the BPM owns it).

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

**As built (Phase 5).** The grid is 6 × 6 modules over the title-safe area (the social zone in vertical formats, so every module may hold type); its hairlines run edge to edge, and blocks against the grid's edge bleed off the frame. *Layout seed* is a *Layout* number (1–99, mixed with the global seed): the generator builds candidates constructively — the dominant block (accent, ≥ 2× any other, never centered), the numeral and the title (two sizes, two measures each), the small type, then one or two secondary blocks in the other roles — rejects any that break a rule and keeps the best by score (off-center visual weight, shared flush-left axes, the numeral on or against the dominant block, reading order, whitespace, blocks anchored to edges or the dominant block's lines). Secondary blocks never lie under type; display type may cross the dominant block where its own ink reaches 3:1 and is recolored there; small type sits wholly on it only at 4.5:1. Type hangs from its module's top line (the numeral stands on its span's bottom line). The hold's block moves one module every ~2.4 s (there and back). Timing: `in` is 2.1 s so Calm fits the 4 s minimum (the numeral finishes rolling just after); durations under ~5 s compress the entrance (to 72%) so the poster reads longer. Punchy rolls the numeral two turns with overshoot.

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

**As built (Phase 5).** Rows are one per line: the destination, then a time (the last word, when it has a digit); `|` separates fields explicitly (`TOKYO | 09:40 | DELAYED`). The board fills the layout width with modules (blank ones pad the fields, as on a real board): 16:9 shows destination · time · status (the first row BOARDING, the others ON TIME, unless a row gives its own); the narrower formats show destination and one time/status field, and stack the destination over it where that makes the modules ≥ 15% bigger (4:5 and 9:16). The title row's modules are at least 1.25× the rows' (up to 1.45× in 16:9, 2× elsewhere) and it may take two (three in 4:5 and 9:16) lines. Modules turn forward along a character wheel (… R S T) on a stepped clock; the upper flap falls with a parabolic fall, foreshortened and darkening, the lower flap lands with a small bounce (none in Calm, stronger in Punchy); intermediate characters are 4–12 per module (Calm 4–8, Punchy 6–12), each module with its own seeded latency and rate. The hold flips a status field every 2 s, working down the board (BOARDING ↔ ON TIME on the wide board; time ↔ BOARDING, or the row's own status, on the narrow ones). The out flips every module to blank in a ripple from the left, then the board fades, so the first and last frames are the page. *Board* derives from palette roles: Classic = dark flaps with the palette's lightest neutral, Amber = dark flaps with its accent, Light = light flaps with its darkest neutral (Looks: Amber · Amber, Mono Dark · Classic, Paper · Light). The flap face is the pairing's display face (mono, technical, grotesk, sport); letters too wide for a module are condensed.

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

**As built (Phase 3).** Landscape: type on the left, the cover panel on the right, blocks sweeping left → right with "/" edges; the other formats turn it a quarter (panel on top, type seated on the bottom of the safe area, blocks sweeping upward). Blocks: panel (A), band (B), background (C) — the out sweeps the same three again, covering, and ends on the background, so the first and last frames match. The stack reads name → number row → title → guest (the order they animate); every line rises along the shared angle. The cover (optional, *artwork* placeholders) is printed into the panel's color — its greys overlaid (screened on very dark panels, multiplied on very light ones), baked once in `build` — so any artwork sits in the palette. Added controls: *Number label* (default `EP`; the row disappears when label and number are both empty) and *Colors* as Accent · Contrast · Tonal (panel/band role pairs; Brand Bold uses a deeper tone of the brand). Digits roll up from zero on a named spring slowed to read as counting (Calm `gentle`, Balanced `snappy`, Punchy `lively`); display digits aren't forced to `tnum` (some faces' tabular zero is slashed) — fixed-width slots keep the layout still. The engine's `in` is 2.2 s (the guest line lands just after), so Calm fits the 4 s minimum.
