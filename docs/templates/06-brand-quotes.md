# 06 — Brand & Quotes

> The voice of a brand: quotes, social proof, beliefs, results, identity. Five formats: **quote** (Quote), **testimonial** (Review), **brand film** (Manifesto), **results** (Numbers), **identity system** (Pattern).

Category slug: `brand-quotes` · Conventions: [`00-foundations.md`](00-foundations.md)

---

## 6.1 Quote — *big quote*

**Use it for** quotes, speaker highlights, podcast clips, thought leadership posts.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `quote` | 1:1 · 4:5 · 9:16 · 16:9 | Auto (≈ 5–12 s) | in · hold · out | optional | `editorial` · Paper |

**Art direction.** An oversized opening quotation mark in `accent` (serif, ~30u), the quote large and auto-fitted, a key phrase highlighted (marker block, italic or color), and the attribution (name, role, optional round portrait).

**Choreography**
- `0.00–0.50` Quote mark drops in (`pop`, rotate −8° → 0).
- `0.35–…` Words reveal at reading pace (opacity + y 0.8u, `glide`, ≈ 0.05 s/word).
- After the key phrase's words appear, the highlight sweeps behind them (`snap`, 0.35 s) left→right, **line by line** following the real line breaks.
- `+0.40` Attribution: a short rule draws, name slides in, role fades in (it waits for the highlight to finish, so the two never compete).
- `hold` Gentle drift (the mark drifts a little further than the text).
- Out (0.6 s): fade + blur.

Long quotes compress the word stagger so the cascade never takes more than 1.5 s.

**Controls**
- Content: Quote (≤ 220 chars; `*highlight*`) · Name · Role · Portrait (optional)
- Style: Highlight (Marker · Italic · Color) · Alignment (Left · Center)
- Motion: Duration (Auto · Fixed) — the global Duration control; Auto = entrance + reading time of the quote and name + exit.

Highlight styles: *Marker* sweeps an `accent` block behind each line of the phrase, and the phrase switches to whichever of `bg`/`fg` contrasts more with it; *Color* sweeps the phrase to `accent`; *Italic* sets the phrase in the pairing's italic (an oblique slant where the pairing has none) and sweeps it to `accent`.

**Defaults.** `*Good motion is invisible.* You only notice it when it's missing.` — `Noa Lindqvist`, `Motion Director`

**Looks.** Paper (Marker) · Ink (Italic) · Blush (`soft`, Color, centered)

**The expensive detail.** Hanging punctuation — the opening quote mark hangs outside the text block so the text edge stays optically straight — and a multi-line highlight that follows actual line breaks.

**Format notes.** Left-aligned quotes hang the mark in a gutter beside the column in 1:1, 4:5 and 16:9; in 9:16 the mark sits above the column (its ball overhanging the text edge slightly) so the text keeps the full width. Centered quotes carry the mark above. Short quotes grow (up to 1.8×; the mark 1.4×). The mark is the display face's own “ in the serif pairings (`editorial`, `classic`, `soft`); other pairings get a drawn serif mark, since only the pairing's fonts are loaded.

**Engine needs.** Emphasis markup · per-line highlight rects · hanging punctuation · auto duration from length.

---

## 6.2 Review — *testimonial with rating*

**Use it for** reviews, app store ratings, customer love, case-study teasers.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `review` | 1:1 · 4:5 · 9:16 · 16:9 | 6 s (4–12) | in · hold · out | optional | `grotesk` · Paper |

**Art direction.** A row of five rounded vector stars, the rating number and label, the quote in medium weight, and the reviewer row (avatar, name, role/company, optional *Verified* check). Card-less by default; a card variant exists as a Look for busy feeds.

**Choreography**
- `0.00–0.60` Stars pop in sequence (stagger 0.07 s, scale 0 → 1.15 → 1, `pop`); fractional ratings fill the last star through a mask.
- `0.20–0.90` Rating counts 0.0 → 4.9, landing on the same frame the last star settles: the counting value itself drives the fill across the row, and the star holding the last fraction settles with a small pop as the number lands.
- `0.72–1.55` Quote lines rise through masks.
- `1.30–2.10` Reviewer row slides in; the verified check draws.
- `hold` Subtle drift. Out (0.5 s): fade/slide.

(The quote and reviewer arrive a little earlier than first planned, so the default 6 s holds the quote for its full reading time.)

**Controls**
- Content: Rating (0–5, step 0.1) · Rating label · Quote · Name · Role/Company · Avatar · Verified (on/off)
- Style: Layout (Centered · Left) · Card (on/off)

The quote is set in typographic quotation marks (marks the user typed are replaced); in the Left layout the opening mark hangs outside the column. Without an avatar photo, the avatar shows the name's initials on `fg`. The card is `surface` with a soft layered shadow.

**Defaults.** `4.9` · `from 2,300+ reviews` · `Honestly the fastest way we've ever made a launch video.` · `Sam Rivera` · `Head of Marketing, Halden`

**Looks.** Paper · Ink · Mint (card, Left layout)

**The expensive detail.** Precise fractional star fill (4.9 → 90% of the fifth star) synchronized with the count-up.

**Engine needs.** Vector stars · masked fill · number count helper.

---

## 6.3 Manifesto — *statement sequence*

**Use it for** brand films, values, mission statements, campaign launches, recruiting.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `manifesto` | 16:9 · 9:16 · 1:1 · 4:5 | Auto (≈ 8–20 s) | sequence | no | `editorial` + `grotesk` · Ink ↔ Paper |

**Art direction.** Three to eight short statements, each a full-frame "slide" with alternating typographic treatments (bold sans · italic serif · outline) and color inversions. Ends on a logo lockup and a final line.

**Choreography**
- Statement duration = 1.2 s + 0.05 s/char (auto).
- Entrances cycle deterministically through three types: mask rise, horizontal push, focus-from-blur. Emphasis words (`*word*`) take `accent`.
- Between statements: hard cut with color inversion, or a wipe (alternating).
- Rhythm: a slight *accelerando* through the middle, then a long final hold.
- Finale: logo scales in from 0.9 with blur; final line fades in.

**Controls**
- Content: Statements (3–8, `*emphasis*`) · Logo · Final line
- Style: Treatments (Mixed · Sans only · Serif only) · Palette pair
- Motion: Pace · Duration (Auto · Fixed)

**Defaults.** `We believe in less.` / `Less noise.` / `Less waiting.` / `More *making*.` → Halden logo · `Studio for moving images`

**Looks.** Ink ↔ Paper · Forest ↔ Sand · Midnight ↔ Lilac

**The expensive detail.** The accelerando-then-hold rhythm makes it feel like an edited brand film rather than a slideshow.

**Engine needs.** Sequence builder · three reusable entrance treatments · logo slot.

---

## 6.4 Numbers — *by the numbers*

**Use it for** year-in-review, investor updates, impact reports, milestones, case studies.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `numbers` | 16:9 · 1:1 · 4:5 · 9:16 | 6 s (4–12) | in · hold · out | optional | `grotesk` · Ink |

**Art direction.** A headline plus 2–4 big stats in a grid (2×2) or row, each a big tabular number with a label; hairline dividers; optional mini-visual per stat: a ring (donut) for percentages, before/after bars for multipliers (`×`), a small trend line for everything else — above the number in multi-column grids, beside it in a single column.

**Choreography**
- `0.00–0.70` Headline rises.
- `0.40–0.90` Dividers draw (`snap`, staggered).
- `0.60–2.20` Each number counts from 0 (fast, then decelerating — `glide` applied to the value), formatted live (`12M+`, `98%`, `3.2×`), stagger 0.2 s; labels fade up. *Punchy*: each number lands with a small kick.
- `hold` Subtle drift; mini-visuals complete. Out (0.5 s).

**Controls**
- Content: Headline · Stat 1–4 (3 and 4 optional). Each stat is one line written as people write it — the number, then its label (`12M+ views`, `€48.2k raised`, `+12.4% retention`): prefix, suffix, decimals and grouping all come from the written number, so a count-up keeps its format. Text that doesn't start with a number shows its first word, uncounted.
- Style: Layout (Auto · Row · Grid) · Mini visuals (on/off)

Layouts: *Row* runs along the frame's long side — across in 16:9 and 1:1, a single column in 4:5 and 9:16; *Grid* is two columns. *Auto*: 16:9 a row; 1:1 a 2×2 grid for four stats (a row otherwise); 4:5 a grid for four, a column for three, a row for two; 9:16 a column.

**Defaults.** `2026 in numbers` · `12M+` views · `98%` happy clients · `140` countries · `3.2×` faster launches

**Looks.** Ink · Paper · Cobalt (`technical`)

**The expensive detail.** Number boxes reserve their final width (tabular figures + max width), so the layout never shifts while counting.

**Engine needs.** Number count/format helper · tabular figures · divider trims.

---

## 6.5 Pattern — *brand pattern lockup*

**Use it for** brand intros, event identities, social headers, sign-offs.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `pattern` | 16:9 · 9:16 · 1:1 · 4:5 | 5 s (3–12) | in · hold (loops) · out | no | `grotesk` · Bauhaus |

**Art direction.** A grid of tiles with geometric primitives (quarter/half circles, squares, triangles, stripes) in brand colors, flipping and rotating in waves; the center clears to present the logo and tagline.

**Choreography**
- `0.00–1.40` Tiles flip in (scaleX flip illusion, `pop`) along a diagonal wave; shapes rotate in 90° steps.
- `1.40–2.10` Center tiles scale away radially; the logo reveals (0.92 → 1, blur 6 → 0); tagline rises.
- `hold` Peripheral tiles keep flipping in slow seeded waves; the center stays calm.
- `4.40–5.00` Tiles flood back to cover (reverse wave).

**Controls**
- Content: Logo · Tagline
- Style: Shape set (Bauhaus · Circles · Lines · Mixed) · Density · Colors (2–5 from palette) · Seed (Shuffle)

**Defaults.** Halden logo · `Studio for moving images`

**Looks.** Bauhaus · Swiss · Candy

**The expensive detail.** Shapes and colors are assigned by rules (no identical neighbors, balanced color distribution) so *every* seed looks designed, not random.

**Engine needs.** Seeded constraint-based tiling · logo slot · wave stagger.
