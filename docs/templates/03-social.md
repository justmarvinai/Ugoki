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

**Art direction.** One beat (a word or short phrase) at a time — huge, centered, filling ~80% of the safe width. Emphasized words (`*word*`) get an `accent` highlight block. The background switches palette colors on emphasis beats. *Captions* mode drops the background and adds a legibility stroke/shadow for use over footage.

**Choreography**
- Each script line is a beat. Beat length = clamp(0.28 s + 0.045 s × characters, 0.3 s, 1.2 s) × pace factor — reading rhythm, not a metronome.
- Beat entrance (0.12 s): scale 1.25 → 1.00 (`snap`) with motion blur and a seeded ±2° rotation.
- Emphasis beat: highlight block wipes in behind the word (0.1 s) and the background hard-cuts to the next palette color on the same frame.
- Every 4th beat: a 2-frame micro camera shake (0.4u, seeded).
- Final beat holds ≥ 1.2 s with a slow scale 1 → 1.04.

**Controls**
- Content: Script (multi-line; one beat per line; `*emphasis*`) · Final CTA (optional)
- Style: Case · Highlight (Block · Underline · Color) · Background switching (on/off) · Mode (Full · Captions)
- Motion: Pace (Chill · Normal · Hyper) · Shake (on/off) · Duration (Auto · Fixed)

**Defaults.** `Stop` / `scrolling.` / `This is` / `how you` / `make them` / `*watch.*`

**Looks.** Acid ↔ Ink · Hazard ↔ Ink · Candy ↔ Mono Dark

**The expensive detail.** Beat lengths scale with word length, so it feels *edited*, not mechanical; every cut lands exactly on a frame boundary at any fps.

**Engine needs.** Sequence builder (auto duration) · emphasis markup parser · seeded shake · hard cuts on frame boundaries.

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
| `listicle` | 9:16 · 1:1 · 4:5 · 16:9 | Auto (≈ 8–20 s) | sequence | no | `grotesk` · Paper |

**Art direction.** A title card, then one item at a time: a **giant numeral** (solid, outline, or cropped by the frame edge), a bold item title and an optional one-line detail. Story-style progress segments at the top. A closing CTA card ("Save this for later" + bookmark icon).

**Choreography**
- `0.00–1.40` Title words rise (Rise-style masks); progress segments appear.
- Item transition (0.5 s): previous content slides up and out (`exit`); the numeral **rolls odometer-style** from n−1 to n with motion blur; the item title reveals through line masks; detail fades in 0.1 s later.
- Item hold = 1.2 s + 0.06 s/char.
- The current progress segment fills linearly during its item (progress is the one place linear is right).
- CTA: bookmark icon bounces (`pop`), text rises.

**Controls**
- Content: Title · Items (2–7: title + optional detail) · CTA (optional)
- Style: Numeral (Solid · Outline · Giant crop) · Progress bar (on/off)
- Motion: Pace · Duration (Auto · Fixed)

**Defaults.** Title `3 rules for motion that feels expensive` · Items `Ease out. Never linear.` / `Overlap everything.` / `Hold long enough to read.` · CTA `Save this for later`

**Looks.** Paper · Ink · Lilac

**The expensive detail.** The odometer numeral and the progress bar stitch the sequence into one continuous piece; giant numerals are optically cropped so the digit still reads.

**Engine needs.** Odometer digits · sequence builder · line masks · trim-path icon.

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
| `countdown` | 9:16 · 1:1 · 4:5 · 16:9 | Auto (start + 2 s) | in · hold · out | optional | `grotesk` · Ink |

**Art direction.** Huge centered numerals, a label above ("The drop starts in"), a date line below, and a circular progress ring that depletes per tick. At zero, the reveal message.

**Choreography**
- `0.00–0.60` Label fades in; the ring draws on (trim 0 → 1).
- Each second: the current digit rolls up and out as the next rolls in (slot-machine, 0.35 s, `snap`, motion blur); the ring segment depletes smoothly. The roll starts 3 frames *before* the second boundary (anticipation) so the new digit is legible exactly on the beat.
- Last 3 seconds: numeral pulses (1.06 → 1) and the background flashes subtly.
- Zero: the numeral scales up and bursts into radial lines; the final message rises (0.6 s); date line fades in.
- Hold: the message breathes.

**Controls**
- Content: Label · Count from (3–10) · Final message · Date line
- Style: Ring (on/off)
- Motion: Mode (Live seconds · Days-to-go reveal)

**Defaults.** `The drop starts in` · 5 → `It's live.` · `FRI 10.10 · 18:00 CET`

**Looks.** Ink (yellow ring) · Acid · Midnight

**The expensive detail.** Ticks land on exact second boundaries (frame-accurate at 24/25/30/50/60 fps) with the 3-frame anticipation.

**Engine needs.** Odometer digits · trim path ring · radial burst · frame-exact scheduling.
