# 08 — Transitions

> Full-frame overlays editors drop between two clips. Five motion signatures: **stacked panels** (Layers), **circles** (Iris), **fluid** (Liquid), **strips** (Blinds), **type** (Sweep).

Category slug: `transitions` · Conventions: [`00-foundations.md`](00-foundations.md)

### Shared behaviour

- **How it works in an edit**: the overlay covers 100% of the frame at the **cut point**; the editor places the cut between clip A and clip B exactly there. Before the cut the overlay reveals over A, after the cut it uncovers B.
- **Alpha by default** (WebM with alpha / PNG sequence). Option **Bake** exports with two images A and B underneath (the user's images or the procedural *Scene A / Scene B* placeholders) as a normal MP4.
- **Preview modes**: *Overlay* (footage backdrop) · *A → B* (images swap at the cut point).
- **Cut point** is shown as a marker on the timeline and appended to the export filename (e.g. `ugoki-layers-1920x1080-30fps-cut-f18.webm`).
- **Duration** 0.6–2.4 s, default 1.2 s. **Direction** where relevant: 8-way (→ ← ↑ ↓ and diagonals).
- **Speed** is a macro on top of Energy: it compresses the whole transition around the cut point.
- Motion blur is on by default — transitions live and die by it.

---

## 8.1 Layers — *stacked panel wipe*

**Use it for** vlogs, promos, social edits — the everyday professional transition.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `layers` | 16:9 · 9:16 · 1:1 · 4:5 | 1.2 s (0.6–2.4) | transition (cut at 50%) | default | Cobalt · Acid · Ink panels |

**Art direction.** Three full-bleed panels with a 12° skew sweep across the frame one after another; the last covers the frame at the cut; afterwards the panels continue off-frame in the same direction, uncovering B in reverse order.

**Choreography**
- `0.00–0.60` Panels enter (in-out expo), offsets 0.07 s; each panel's speed differs by a few percent so the leading edges fan out.
- `0.60` **Cut point** — 100% coverage by the last panel.
- `0.60–1.20` Panels exit in the same direction, reverse order.

**Controls**
- Style: Colors (2–4) · Skew (0–20°) · Layers (2–5)
- Motion: Direction (8-way) · Speed

**Looks.** Cobalt/Acid/Ink · Mono (black/white/grey) · Brand Bold (brand tints)

**The expensive detail.** Slight per-panel speed differences so the edges fan out organically instead of moving in robotic parallel, plus directional motion blur.

**Engine needs.** Full-frame polygons · direction vectors · motion blur · cut-point API.

---

## 8.2 Iris — *circle burst*

**Use it for** reveals, playful edits, kids/education content, "portal" moments.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `iris` | 16:9 · 9:16 · 1:1 · 4:5 | 1.2 s (0.6–2.4) | transition (cut at 50%) | default | Candy rings |

**Art direction.** Three to five concentric circles expand from an origin (center by default, or a point the user clicks on the stage), staggered; the last fills the frame at the cut. Then a hole opens from the same origin, uncovering B — a doughnut reveal.

**Choreography**
- `0.00–0.60` Rings expand (stagger 0.05 s); radius eased for **area**, so coverage grows at a perceptually steady rate.
- `0.60` Cut point.
- `0.60–1.20` The hole grows from the origin (Ring style) or the rings collapse in reverse (Fill style).

**Controls**
- Content: Origin (point picked on the stage)
- Style: Colors · Rings (3–5) · Style (Fill · Ring)
- Motion: Speed

**Looks.** Candy · Ink/Paper · Tangerine

**The expensive detail.** Final radius is computed to reach the **farthest frame corner** from the origin — coverage is exact, never early or late, wherever the origin is.

**Engine needs.** Point controls · area-based easing · even-odd fills (hole).

---

## 8.3 Liquid — *organic wipe*

**Use it for** lifestyle, beauty, food, music — anywhere soft and fluid beats hard-edged.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `liquid` | 16:9 · 9:16 · 1:1 · 4:5 | 1.4 s (0.8–2.4) | transition (cut at 50%) | default | Blush + Lilac |

**Art direction.** Two liquid layers with a noise-displaced wave edge sweep across; droplets detach from the leading edge; the frame is fully covered at the cut, then the liquid recedes to uncover B.

**Choreography**
- `0.00–0.70` Back layer leads by 0.08 s; front layer follows; edges evolve over time (noise in time, not a static wave).
- `0.70` Cut point.
- `0.70–1.40` Liquid recedes in the same direction; droplets fall with gravity and fade.

**Controls**
- Style: Colors (2) · Wobble (Low · Medium · High) · Droplets (on/off)
- Motion: Direction · Speed

**Looks.** Blush/Lilac · Forest/Mint · Ink/Graphite

**The expensive detail.** An edge that is *alive* (time-evolving noise, smoothed to avoid jaggies) plus droplets with plausible gravity.

**Engine needs.** Seeded simplex noise · smooth path generation · simple particle physics.

---

## 8.4 Blinds — *strip slices*

**Use it for** corporate, fashion, editorial, architecture — clean and graphic.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `blinds` | 16:9 · 9:16 · 1:1 · 4:5 | 1.0 s (0.6–2.0) | transition (cut at 50%) | default | Ink + Paper strips |

**Art direction.** The frame is divided into N strips (vertical, horizontal or diagonal) that scale in from one edge with a stagger pattern, alternating colors, fully covering at the cut, then scale out toward the opposite edge.

**Choreography**
- `0.00–0.50` Strips scale in (`snap`), stagger by pattern: linear, center-out or seeded random.
- `0.50` Cut point.
- `0.50–1.00` Strips scale out toward the opposite edge with the same pattern.

**Controls**
- Style: Strips (4–24) · Orientation (Vertical · Horizontal · Diagonal) · Colors (1–3)
- Motion: Pattern (Linear · Center · Random) · Speed

**Looks.** Ink/Paper · Swiss · Brand Bold

**The expensive detail.** Strip edges snap to device pixels at full coverage and overlap by 0.5 px — no hairline seams at the cut, at any resolution.

**Engine needs.** Pixel snapping · stagger patterns.

---

## 8.5 Sweep — *type transition*

**Use it for** brand edits, sports, fashion, campaign films — the brand name *is* the transition.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `sweep` | 16:9 · 9:16 · 1:1 · 4:5 | 1.2 s (0.8–2.4) | transition (cut at 50%) | default | `poster` · Hazard |

**Art direction.** A giant word (condensed caps, ~140% of frame height) sweeps across the frame; a solid color fills behind its trailing edge; at the cut the frame is fully colored; then the word exits and the color slides off, uncovering B.

**Choreography**
- `0.00–0.60` The word enters, color fill trailing it (in-out expo); letters carry directional motion blur.
- `0.60` Cut point — solid color.
- `0.60–1.20` The word exits; the color panel slides off in the same direction.

**Controls**
- Content: Word (≤ 12 chars)
- Style: Font pairing · Colors (text/fill)
- Motion: Direction · Speed

**Defaults.** `NEXT`

**Looks.** Hazard · Ink · Cobalt

**The expensive detail.** Word size and trailing fill are solved so letter counters (the holes in O, A, E…) never reveal content at the cut frame.

**Engine needs.** Large text rendering · coverage check at the cut frame (test) · motion blur.
