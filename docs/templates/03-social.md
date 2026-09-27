# 03 — Social

> Vertical-first posts for Reels, TikTok, Shorts, Stories and feeds. Five formats that perform: **hook captions** (Punch), **chat stories** (Chat), **listicles** (Listicle), **polls** (Versus), **countdowns** (Countdown).

Category slug: `social` · Conventions: [`00-foundations.md`](00-foundations.md)

### Shared behaviour

- **9:16 is the default format**; 1:1 and 4:5 always supported; 16:9 where it makes sense.
- Layouts respect the **social UI zone** (top 12%, bottom 22%, right 12%); the editor can show generic guides.
- Sequence templates default to **Auto duration** (fit to content) — the video is exactly as long as the content needs.
- Loop-friendly templates offer **Loop** for GIF export.

---

## 3.1 Punch — *kinetic hook captions*

**Use it for** reel hooks, TikTok openers, quotes-as-video, bold announcements; also as a caption overlay on footage.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `punch` | 9:16 · 1:1 · 4:5 · 16:9 | Auto (≈ 4–15 s) | sequence | optional (*Captions* mode) | `poster` · Acid ↔ Ink |

**Art direction.** One beat (a word or short phrase) at a time — huge, centered, filling ~80% of the safe width. Emphasized words (`*word*`) get an `accent` highlight block. The background switches palette colors on emphasis beats — between the palette's `bg` and `fg` (Acid ↔ Ink). *Captions* mode drops the background and adds a legibility stroke/shadow for use over footage.

**Choreography**
- Each script line is a beat. Beat length = clamp(0.28 s + 0.045 s × characters, 0.3 s, 1.2 s) × pace factor — reading rhythm, not a metronome.
- Beat entrance (0.12 s): scale 1.25 → 1.00 (`snap`) with motion blur and a seeded ±2° rotation (settling to 0°). *Calm*: 1.1 → 1 (`glide`, 0.18 s) with a short fade and no tilt. *Punchy*: 1.34 → 1 (`pop`, ±2.7°), and every beat keeps pushing in (+3.5%) until the next cut.
- Emphasis beat: highlight block wipes in behind the word (0.1 s) and the background hard-cuts to the next palette color on the same frame.
- Every 4th beat: a 2-frame micro camera shake (0.4u × Energy travel, seeded; two 1/30 s steps). *Punchy* also shakes on emphasized beats.
- Final beat holds ≥ 1.2 s (plus reading time for the CTA) with a slow scale 1 → 1.04 (*Calm* 1.025; *Punchy* 1.03 plus a thump every 0.5 s). The CTA rises under it 0.2 s after it lands.
- The last 0.17 s cut back to the plain background, so the video ends — and loops — on a clean frame.

**Controls**
- Content: Script (multi-line; one beat per line, up to 12; `*emphasis*`) · Final CTA (optional)
- Style: Case (UPPER · As typed) · Highlight (Block · Underline · Color) · Background switching (on/off) · Mode (Full · Captions)
- Motion: Pace (Chill · Normal · Hyper) · Shake (on/off) · Duration (Auto · Fixed)

**Defaults.** `Stop` / `scrolling.` / `This is` / `how you` / `make them` / `*watch.*`

**Looks.** Acid ↔ Ink · Hazard ↔ Ink · Candy ↔ Mono Dark

**The expensive detail.** Beat lengths scale with word length, so it feels *edited*, not mechanical; every cut lands exactly on a frame boundary at any fps.

**Engine needs.** Sequence builder (auto duration) · emphasis markup parser · seeded shake · hard cuts on frame boundaries.

**Implementation notes (Phase 3, `src/templates/social/punch`).**
- *Hard cuts at any fps*: templates are functions of time, and motion blur averages sub-frames around each frame, so a cut that falls inside a frame's shutter would dissolve two beats into one frame. Every cut (beat, background flip, final clear) therefore moves by ≤ 17 ms to a time that lies between frames at 60 and 30 fps — always — and at 50, 25 and 24 fps wherever such a time is within reach, and Punch holds its shutter at 180° whatever the Energy (Punchy would open it to 270°). A frame shows one beat or the other, never both. (Blending across a declared cut could be prevented in the frame renderer itself — an engine candidate.)
- *Sizing*: each beat is set as large as its box allows — ~80% of the safe width (symmetric about the frame's axis) and at most 44% (9:16) to 52% (16:9) of the safe height — on one line, or stacked into up to 3 lines (2 in 16:9) when each extra line makes it ≥ 12% bigger. Stacked lines keep at least 0.1 em of clear space between their ink, so accents and descenders never touch.
- *Colors* (roles only): the highlight block is `accent` where it stands out (≥ 3:1) from the beat's background, otherwise the other color of the pair, with the words on it in the background color; *Underline* and *Color* use the first of `accent`/`accent2`/`accent3` that differs from both text and background, raised to 4.5:1 (colored words are still words).
- *Captions*: beats sit low (centered at 78–80% of the safe height) at caption size (at most 17u in 9:16, 11u in 16:9), in the palette's lighter tone with an outline in its darker tone, plus a soft shadow when exported transparent; opaque exports stand on the darker tone. Full beats exported transparent get the outline too (no shadow — at that size it would cost more than a frame's budget).
- *Duration*: Auto = the beats + the final hold + the clean ending (bounds 4–15 s). A fixed duration scales the beats within 0.3–1.2 s × Pace (`sequence`'s fit) and gives the rest to the final beat. Pace: Chill ×1.35 · Normal ×1 · Hyper ×0.72.

---

## 3.2 Chat — *message thread story*

**Use it for** story-time content, product "conversations", testimonials, relatable skits, app promos.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `chat` | 9:16 · 4:5 · 1:1 | Auto (≈ 6–20 s) | sequence | no | UI kit Light · accent Cobalt |

**Art direction.** A clean, **unbranded** messenger: header with contact name and avatar, grouped bubbles with tails only on the last bubble of a group, sent bubbles in `accent`, received in `surface`, a typing indicator, a subtle read receipt. Big readable type (≥ 4.2u).

**Choreography**
- `0.00–0.40` Header slides down (`glide`).
- Received message: typing indicator pops (0.15 s) and bounces (staggered sine dots) for 0.5 s + 0.02 s/char (max 1.6 s), then **morphs into the bubble** (width/height spring) as the text fades in.
- Sent message: bubble rises from the input bar (y +3u, scale 0.9 → 1, spring) with a short vertical blur.
- The thread auto-scrolls on a spring so the latest bubble stays above the bottom safe zone.
- Optional reaction on the last message: a vector badge (heart/thumbs/laugh) pops (`pop`, 1.2 → 1).
- End: 1.5 s hold.

**Controls**
- Content: Messages (list: sender Me/Them, text) · Contact name · Avatar
- Style: Theme (Light · Dark) · Timestamps (on/off) · Reaction (None · Heart · Thumbs · Laugh)
- Motion: Pace · Duration (Auto · Fixed)

**Defaults.**
- Them: `Did you see the launch video?`
- Me: `Watching it right now`
- Me: `Wait. Who made this??`
- Them: `We did. In ten minutes.` (+ heart reaction)

**Looks.** Light/Cobalt · Dark/Tangerine · Light/Mint

**The expensive detail.** Bubble grouping (shared tails, tighter spacing), the typing indicator *becoming* the bubble (continuity), and a springy scroll that feels like a real phone.

**Engine needs.** UI kit (bubbles, header, indicator) · sequence builder · spring scroll · morphing rounded rects. User emoji render with the system emoji font (documented; defaults contain none).

---

## 3.3 Listicle — *numbered tips*

**Use it for** educational content, tips, "top 3" posts, carousel-to-video, how-tos.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `listicle` | 9:16 · 1:1 · 4:5 · 16:9 | Auto (≈ 8–20 s; 6–24 s) | sequence | no | `grotesk` · Paper |

**Art direction.** A title card, then one item at a time: a **giant numeral** (solid, outline, or cropped by the frame edge), a bold item title and an optional one-line detail. Story-style progress segments at the top. A closing CTA card ("Save this for later" + bookmark icon).

**Choreography**
- `0.00–1.40` Title words rise (Rise-style masks); progress segments appear.
- Item transition (0.5 s): previous content slides up and out (`exit`, as one block, gone by 0.24 s); the numeral **rolls odometer-style** from n−1 to n with motion blur (0.05–0.47 s; the first numeral rolls in from nothing once the title card has cleared); the item title reveals through line masks (from 0.22 s, line stagger 0.08 s, word trail 0.03 s); detail fades in 0.1 s later.
- Item hold = 1.2 s + 0.06 s/char (title and detail); the item drifts up 0.6u while it holds.
- The current progress segment fills linearly during its item (progress is the one place linear is right).
- CTA: bookmark icon draws on (trim path) and bounces (`pop`; Calm settles with `glide`), fills with `accent`, text rises; the card drifts while it holds.
- Out (0.45 s): everything leaves upwards and the progress bar fades — the last frame is the plain background.

**Controls**
- Content: Title · Items (2–7, one per line: title, then an optional detail after a `|` bar) · CTA (optional)
- Style: Numeral (Solid · Outline · Giant crop) · Progress bar (on/off)
- Motion: Pace · Duration (Auto · Fixed)

**Defaults.** Title `3 rules for motion that feels expensive` · Items `Ease out. Never linear.` / `Overlap everything.` / `Hold long enough to read.` · CTA `Save this for later`

**Looks.** Paper (Solid) · Ink (Giant crop) · Lilac (Outline)

**The expensive detail.** The odometer numeral and the progress bar stitch the sequence into one continuous piece; giant numerals are optically cropped so the digit still reads.

**Engine needs.** Odometer digits · sequence builder · line masks · trim-path icon.

**Implementation notes (Phase 3, `src/templates/social/listicle`).**
- *Layout*: vertical formats and 1:1 stack the numeral (cap height 40u in 9:16, 30u in 4:5 and 1:1) above the item text; 16:9 sets it beside a text block half the safe width wide. The numeral never moves between items; the stack is centered for the tallest item, and long items shrink to fit the room below it. Progress segments (one per item) run along the top of the safe area (the social-safe zone in 9:16 and 4:5).
- *Numeral*: rolls inside the engine odometer's window, confined to its own region so a turning digit never crosses the progress bar or the text. It is set in proportional lining figures — a lone numeral needs no tabular widths, and Mona Sans's tabular set has a footed 1 and a slashed 0. *Solid* is `accent`, *Outline* an `accent` outline; *Giant crop* is an `accent` tint (mixed into `bg` in OKLab, kept at ≥ 7:1 behind `fg` text) that bleeds off the bottom-right corner: each digit keeps 80% of its own ink width in view (7% of its height below the frame), and the numeral slides while it turns so every digit lands on its own crop.
- *Timing*: Pace scales the holds (Chill ×1.3 · Normal ×1 · Hyper ×0.75), Energy the transitions. A fixed duration stretches or shrinks the holds; only one too short for readable holds (under 35%) speeds the transitions up as well. Bounds 6–24 s: a two-tip list stays tight, and seven tips with details get room to be read.

---

## 3.4 Versus — *this or that*

**Use it for** polls, debates, comparisons, engagement bait (the good kind).

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `versus` | 9:16 · 1:1 · 4:5 · 16:9 | 6 s (4–12) | in · hold · out | no | `poster` · Tangerine vs Cobalt |

**Art direction.** The frame splits into two color fields (top/bottom in 9:16, diagonal in 1:1/4:5, left/right in 16:9). Each side carries an option label and an optional image cutout. A round **VS** badge sits on the seam; the question sits on top; results appear as bars with percentages.

**Choreography**
- `0.00–0.50` Fields slide in from opposite edges (`snap`); the seam lands with a 2-frame shake.
- `0.40–0.80` VS badge slams (scale 2.2 → 1.0, `pop`) with a ring shockwave.
- `0.60–1.30` Option labels reveal (mask rise); question drops in.
- `1.60–2.60` Optional "Tap to vote" hint pulses.
- `2.80–4.00` Result bars fill as percentages count up (`glide`); the winner's seam pushes 6% into the loser's side (spring) and gets a check badge; the loser dims 30%.
- `5.50–6.00` Seam wipes across to a solid background.

**Controls**
- Content: Question · Option A (label, image) · Option B · Result A % (B = 100 − A) · Show results (on/off)
- Style: Split (Straight · Diagonal) · A/B colors (from palette)

**Defaults.** `Morning person or night owl?` · `SUNRISE` 41% · `MIDNIGHT` 59%

**Looks.** Tangerine vs Cobalt · Ink vs Paper · Candy vs Acid

**The expensive detail.** The winner push is a spring, so the layout feels physical; percentages count in tabular figures and land on their final value on the same frame the bars stop.

**Engine needs.** Polygon splits · springs on layout · number formatting.

---

## 3.5 Countdown — *launch timer*

**Use it for** product drops, launches, events, New Year's, live-stream starts.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `countdown` | 9:16 · 1:1 · 4:5 · 16:9 | Auto (start + 2 s; 4–20 s) | in · hold · out | optional | `grotesk` · Ink |

**Art direction.** Huge centered numerals, a label above ("The drop starts in"), a date line below, and a circular progress ring that depletes per tick. At zero, the reveal message.

**Choreography**
- `0.00–0.60` Label fades in; the ring draws on (trim 0 → 1); the first number rolls in from below.
- Each second: the current digit rolls up and out as the next rolls in (slot-machine, 0.35 s, `snap`, motion blur; Calm 0.45 s `glide`, Punchy 0.26 s); the ring — one segment per second — depletes smoothly and continuously, clockwise from 12 o'clock. The roll starts *before* the second boundary (anticipation): it crosses over 3 frames (0.1 s at 30 fps) before the boundary, so the new digit is legible exactly on the beat (≈ 97% landed).
- Last 3 seconds: numeral pulses (1.06 → 1; Calm 1.04, Punchy 1.08) and the background flashes subtly (toward `accent`, ≤ 13%; never with a transparent background).
- The label bows out with the last tick. Zero: the numeral scales up and bursts into radial lines (seeded; 14 · 20 · 26 by Energy) while the empty ring swells and fades; the final message rises (0.6 s) once the zero has cleared; date line fades in.
- Hold: the message breathes (its tracking opens 1.2%). Out (0.5 s): the message leaves upwards through its masks, the date line fades.
- *Days-to-go reveal*: the reel spins two turns and lands on the count (`glide`) as the ring closes; on landing the numeral pulses and the background flashes, the unit (e.g. `DAYS`) rises under the number inside the ring and the date line fades in; the numeral breathes through the hold. Auto duration 5 s.

**Controls**
- Content: Label · Count from (3–10) · Final message · Date line · Unit (Days-to-go mode, default `days`)
- Style: Ring (on/off)
- Motion: Mode (Live seconds · Days-to-go reveal)

**Defaults.** `The drop starts in` · 5 → `It's live.` · `FRI 10.10 · 18:00 CET`

**Looks.** Ink (yellow ring) · Acid · Midnight (`technical`)

**The expensive detail.** Ticks land on exact second boundaries (frame-accurate at 24/25/30/50/60 fps) with the 3-frame anticipation.

**Engine needs.** Odometer digits · trim path ring · radial burst · frame-exact scheduling.

**Implementation notes (Phase 3, `src/templates/social/countdown`).**
- *Real seconds*: the count starts at t = 0 and every tick lands on a whole second (t = 1, 2, … N) — a frame boundary at every export frame rate. The timeline's entrance section *is* the count plus the reveal (0.9 s), in real seconds whatever the Energy, which also makes it the duration's floor: a fixed duration can lengthen the final hold but never cut the count short. Auto = count + 2 s.
- *Anticipation*: "starts 3 frames before" would leave the new digit barely begun on the beat with a 0.35 s `snap`, so the three frames are measured to the roll's crossover instead — which is what makes the digit legible exactly on the beat.
- *Numeral*: the live count turns on a drum printed in descending order (the old number rolls up, the next one comes from below — an odometer's wheels would roll the other way when counting down), inside the engine odometer's window, in proportional lining figures (Mona Sans's tabular set has a slashed 0 and a footed 1). 10 → 9 re-centers as it turns. The days reel is the engine odometer itself (`counterWheels`), tabular.
- *Layout*: label · ring · date line, optically centered in the safe area (the social-safe zone in 9:16 and 4:5), symmetric about the frame's axis. The ring is 80% (9:16) to 40% (16:9) of the symmetric safe width, at most 50–60% of the safe height; the numeral fills up to 44% of it (38% with the unit below).
