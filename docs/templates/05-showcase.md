# 05 — Showcase

> Present work beautifully: portfolios, apps, photo sets, collections. Five presentation systems: **parallax columns** (Columns), **device in 3D** (Float), **3D carousel** (Ring), **grid zoom** (Zoom), **photo stack** (Stack).

Category slug: `showcase` · Conventions: [`00-foundations.md`](00-foundations.md)

### Shared behaviour

- **Image lists** (up to 25 images) with per-image focal point; defaults come from the procedural **Artworks**, **Scenes** and **Screens** sets.
- Heavy reliance on depth cues: motion blur, depth-based dimming/blur, soft shadows.
- Float and Ring use the engine's **3D planes** (WebGL2 perspective); everything else is 2D.

---

## 5.1 Columns — *parallax portfolio reel*

**Use it for** studio reels, portfolio intros, collection launches, mood reels.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `columns` | 16:9 · 9:16 · 1:1 · 4:5 | 8 s (5–20) | loop (or in · hold · out) | no | `grotesk` · Ink |

**Art direction.** Three to five columns of images (mixed tall/short tiles, masonry), scrolling vertically in alternating directions at different speeds. A centered title in huge type, rendered with **difference blending** (inverts over images) or on a solid band.

**Choreography**
- `0.00–0.80` Columns slide in from alternating edges (`glide`, stagger 0.08 s).
- Continuous: column speeds 0.9× / 1.2× / 1.0× (`linear`), seamless.
- `0.70–1.50` Title reveals through a mask; subtitle 0.2 s later.
- Out (loop off): columns accelerate away (`exit`), title cuts.
- Loop on: no in/out; frame N+1 ≡ frame 0.

**Controls**
- Content: Images (4–8: eight image slots, 1–4 required, 5–8 optional; the columns cycle through the filled slots) · Title · Subtitle
- Style: Columns (3–5) · Gap · Radius · Title style (Difference · Band · Plain)
- Motion: Direction (Vertical · Horizontal) · Speed · Loop (on/off)

*Deviation (Phase 3):* the spec asked for 4–12 images; without a list control each image is its own slot, and eight keep the inspector sane.

**Defaults.** 8 *Artworks* · `HALDEN STUDIO` · `Selected work 2020—2026`

**Looks.** Ink (Difference) · Paper (Band, `classic`) · Swiss (Band)

**The expensive detail.** Loop math is exact (each column's travel per loop equals its content height), and a subtle directional motion blur scales with column speed.

**Implementation notes.** Each column's content is fitted to the length its speed covers a whole number of times per loop (never less than about two tiles, so no tile follows itself); the directional blur is the engine's temporal motion blur, whose length follows each column's speed. Energy changes character in the loop: Calm drifts every column the same way with a tight speed spread, Balanced alternates 0.9× / 1.2× / 1.0×, Punchy alternates faster with a wider spread. Difference titles are drawn in white (the only color that inverts) a step heavier than the pairing's display weight; the subtitle sits on a chip of the page color so it reads over any artwork. With Loop off, each column slides in and away as one block a viewport long.

**Engine needs.** Seamless loop helper · blend modes (difference) · image tiles with radius.

---

## 5.2 Float — *device showcase in 3D*

**Use it for** app launches, website showcases, SaaS features, App Store previews.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `float` | 16:9 · 1:1 · 4:5 · 9:16 | 6 s (4–15) | in · hold · out | optional | `grotesk` · Paper |

**Art direction.** A **generic** device (phone, tablet, laptop or browser window — never a trademarked design) showing the user's screens, in perspective with a soft contact shadow. Headline and subline sit beside it. A minimal backdrop with a subtle floor gradient.

**Choreography**
- `0.00–1.20` Device rises 20u while rotating from (rx 28°, ry −24°) to the hero angle (rx 8°, ry −14°) on a gentle spring.
- `0.60–1.40` Headline reveals (mask); subline 0.15 s later.
- `hold` Device floats (±0.5u, 3.2 s period) and turns ry −14° → −10°; a tall screenshot scrolls slowly, or multiple screens crossfade (1.8 s each); a glass reflection band glides across the screen.
- `5.30–6.00` Device rotates away (ry → −40°) and fades.

**Controls**
- Content: Screens (1–3 images) · Headline · Subline
- Style: Device (Phone · Tablet · Laptop · Browser) · Finish (Graphite · Silver · White) · Layout (Left · Right · Center)
- Motion: Tilt (Flat · Subtle · Dramatic)

**Defaults.** Procedural *Screens* of a fictional finance app · `Your money, in motion.` · `The new Halden app. Out now.`

**Looks.** Paper · Midnight · Mint

**The expensive detail.** Perspective-correct screen mapping with the reflection in screen space, and a shadow that softens as the device lifts.

**Engine needs.** WebGL2 3D planes · device frames (UI kit) · canvas-to-texture screens.

---

## 5.3 Ring — *3D carousel*

**Use it for** collections, lookbooks, team photos, product ranges, event recaps.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `ring` | 16:9 · 1:1 · 4:5 · 9:16 | 8 s (5–20) | loop | optional | `grotesk` · Ink |

**Art direction.** Six to ten image cards on a 3D cylinder with the camera slightly above. The front card is large and sharp; back cards are dimmed and softly blurred (depth of field). The front card's caption sits below.

**Choreography**
- `0.00–1.20` Cards fly in from depth into their ring slots (spring, stagger 0.06 s).
- Step mode (default): rotate to the next card (0.7 s, `snap`), pause 0.9 s, caption swaps through a mask; repeat.
- Continuous mode: constant rotation (`linear`), seamless loop.
- Out (loop off): ring accelerates and fades.

**Controls**
- Content: Images (3–10) with captions · Title (optional)
- Style: Card shape (Portrait · Square · Landscape) · Depth blur (on/off) · Ring radius
- Motion: Mode (Step · Continuous) · Speed · Loop

**Defaults.** 8 *Artworks* captioned `01 — Form`, `02 — Light`, `03 — Rhythm`, …

**Looks.** Ink · Paper · Lilac

**The expensive detail.** Correct depth sorting, back-face culling and depth-of-field by z; captions swap exactly when a card reaches the front.

**Engine needs.** WebGL2 3D planes · depth sort · per-plane blur/dim.

---

## 5.4 Zoom — *grid zoom*

**Use it for** portfolio highlights, photo series, "one of many" stories, collection hero shots.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `zoom` | 16:9 · 9:16 · 1:1 · 4:5 | 6 s (4–12) | in · hold · out | no | `grotesk` · Paper |

**Art direction.** A tight grid of images (4×4 to 6×6) with small gaps. The camera starts wide and pushes into one hero tile until it fills the frame; the title appears over the hero.

**Choreography**
- `0.00–0.80` Tiles pop in (scale 0.85 → 1) with a seeded stagger spread over 0.4 s.
- `1.00–2.60` Camera zooms into the hero tile using **logarithmic interpolation** (constant perceived speed), rotating 2° → 0°; other tiles blur by distance; the hero's corner radius → 0 as it fills the frame.
- `2.40–3.20` Title reveals over the hero (mask); subtitle follows.
- `hold` Slow push (1 → 1.04).
- Out: zoom *through* (×1.3 with fade) or zoom *back* to the grid.

**Controls**
- Content: Images (4–25) · Hero image (pick) · Title · Subtitle
- Style: Grid size (Auto) · Gap · Radius
- Motion: Exit (Through · Back)

**Defaults.** 16 *Scenes*, hero #6 · `Everything starts somewhere.` · `Portfolio 2026`

**Looks.** Paper · Ink · Sand

**The expensive detail.** Log-scale zoom avoids the "slow start, explosive end" of linear zooms; gaps scale with zoom so seams stay crisp.

**Engine needs.** 2D camera (zoom/pan/rotate) · log interpolation · distance blur.

---

## 5.5 Stack — *photo stack*

**Use it for** travel recaps, events, memories, behind-the-scenes, year-in-review.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `stack` | 1:1 · 4:5 · 9:16 · 16:9 | 7 s (5–15) | in · hold · out | no | `editorial` · Sand |

**Art direction.** Printed photos with white borders drop onto a procedural surface (paper, linen, concrete), each rotated (seeded −8°…8°) with realistic soft shadows. Optional captions on the white border. A final title label with a strip of tape lands on top.

**Choreography**
- Photo *i* starts at `0.2 + i × 0.4`: enters from above at scale 1.25 with a large, soft shadow; lands on a spring with a slight bounce as the shadow tightens; the landing nudges earlier photos by 0.3u.
- Final: the title card drops on top (`pop`).
- `hold` Parallax camera drift (top photos move slightly more).
- Out: photos slide off to the sides (`exit`, staggered).

**Controls**
- Content: Photos (count 2–8) · Photo 1–8 (image slots; the first *count* are used) · Captions (one per line, in photo order) · Title
- Style: Border (Polaroid · Thin · None) · Surface (Paper · Linen · Concrete · Solid)
- Motion: Scatter (Tidy · Casual · Messy)

*Deviation (Phase 3):* without a list control, photos are eight image slots plus a count, and captions are one multiline field. Captions sit on the Polaroid and Thin borders (None has no border to write on).

**Defaults.** 5 *Scenes* captioned `Lisbon`, `Kyoto`, `Reykjavík`, `Oaxaca`, `Hydra` · Title `Summer, archived.`

**Looks.** Sand (`editorial`) · Paper (`soft`, linen) · Film (`classic`, concrete, thin borders)

**The expensive detail.** Each photo's shadow (size, blur, offset) is derived from its height above the surface, and landings nudge the stack — it feels physical.

**Implementation notes.** Prints lie around a squarish ring with one in the middle and land bottom-up, so every caption (on a print's lower border) comes to rest on top of the prints below it; the title label sits below the pile. Shadows are drawn analytically (a nine-piece soft rectangle from two unit gradients) — a contact shadow that vanishes as a print lifts, and a key shadow whose offset, blur and size grow with height. The landing springs keep their named damping (Calm `heavy`, Balanced `snappy`, Punchy `lively`) on a slower clock, so a print takes a moment to fall.

**Engine needs.** Height-based shadows · springs · procedural surfaces.
