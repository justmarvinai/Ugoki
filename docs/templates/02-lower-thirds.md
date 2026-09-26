# 02 — Lower Thirds

> Name/title overlays that drop straight into a video edit. Five use cases: **interview** (Line), **news** (Broadcast), **creator** (Capsule), **documentary/luxury** (Editorial), **tech/events** (Signal).

Category slug: `lower-thirds` · Conventions: [`00-foundations.md`](00-foundations.md)

### Shared behaviour

- **Transparent by default** — exported with alpha (WebM/PNG sequence) to layer over footage. Previewed over the *footage backdrop* or the user's own frame ("Preview on my footage").
- **Anchor**: bottom-left by default; 9-point anchor (bottom-left/center/right, top-left/right, …) + drag offset, always constrained to title-safe. In 9:16/4:5, anchors sit above the social UI zone.
- **Size**: S · M · L (scales the whole lockup).
- **Legibility**: optional soft shadow (large radius, low opacity) — never a hard drop shadow.
- **Timing**: default 6 s (3–20), in ≈ 0.8 s, out ≈ 0.5 s; the hold is *steady* — overlays that wobble look amateur.

---

## 2.1 Line — *minimal accent bar*

**Use it for** interviews, webinars, corporate video, talking heads.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `line` | 16:9 · 9:16 · 1:1 · 4:5 | 6 s (3–20) | in · hold · out | default | `grotesk` · Ink (white text, yellow bar) |

**Art direction.** A 0.5u-wide vertical accent bar; name (wght 650) and title (wght 400, 80% opacity) stacked to its right with a 1.2u gap. No box — the type sits directly on footage.

**Choreography**
- `0.00–0.35` Bar grows vertically from its center (`snap`).
- `0.15–0.75` Name slides out from *behind the bar* (mask edge = bar edge), travel 8u (`glide`).
- `0.28–0.85` Title follows 0.13 s later with shorter travel.
- `0.85–5.50` Hold: static.
- `5.50–6.00` Title, then name, slide back into the bar (`exit`, 0.35 s); bar collapses to center (0.2 s).

**Controls**
- Content: Name · Title
- Style: Shadow (on/off) · Size (S · M · L)
- Layout: Anchor · offset

**Defaults.** `Aiko Tanaka` · `Creative Director, Halden`

**Looks.** Ink · Paper (dark text for bright footage) · Brand Bold (bar in brand color)

**The expensive detail.** Text emerges from the bar edge, so the bar feels like a physical slot. The bar's height matches cap height of the name to baseline of the title — not the em boxes.

**Engine needs.** Masks anchored to shapes · cap-height metrics.

---

## 2.2 Broadcast — *news block*

**Use it for** news-style content, event coverage, live streams, sports.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `broadcast` | 16:9 · 9:16 · 1:1 · 4:5 | 6 s (3–20) | in · hold · out | default | `sport` · Newsroom |

**Art direction.** Two stacked solid blocks sharing a left edge: the top block in `accent` with the name in bold condensed caps; the bottom block in `surface` with the title in sentence case. Optional square logo tile spanning both blocks on the left. Optional **LIVE** tag with a pulsing dot above.

**Choreography**
- `0.00–0.30` Logo tile scales in from 0.6 (`pop`) — skipped when no logo.
- `0.05–0.40` Top block wipes in left→right (scaleX from left edge, `snap`).
- `0.18–0.55` Name slides in from the left inside the block's mask.
- `0.25–0.60` Bottom block wipes in (`snap`); title follows 0.08 s later.
- `0.60–0.90` LIVE tag drops in (`glide`); dot pulses at 1 Hz through the hold.
- `hold + 0.8 s` One light sweep crosses the top block (narrow 20° band, 20% white).
- `5.55–6.00` Blocks wipe out to the right carrying their text (`exit`).

**Controls**
- Content: Name · Title · Tag (optional) · Logo (optional)
- Style: Case (Upper · Title) · Size · Light sweep (on/off)
- Layout: Anchor · offset · Width (Auto · Fixed)

**Defaults.** `JORDAN ELLIS` · `Reporting live from Berlin` · Tag `LIVE`

**Looks.** Newsroom (red) · Cobalt · Mono Dark

**The expensive detail.** Block widths come from measured text + consistent padding, both blocks share one grid, and text is optically centered on **cap height**, not the em box — the difference between "broadcast" and "PowerPoint".

**Engine needs.** Text metrics (cap height) · scale-from-edge wipes · masked light sweep.

---

## 2.3 Capsule — *creator pill*

**Use it for** YouTubers, podcasters, streamers, social creators, guest intros.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `capsule` | 9:16 · 16:9 · 1:1 · 4:5 | 6 s (3–20) | in · hold · out | default | `grotesk` · Paper (white pill) |

**Art direction.** A full-radius pill in `surface` (white by default) with a circular avatar (image or initials) on the left, name (bold) and @handle (`muted`) inside, and an optional CTA chip on the right in `accent` ("Follow").

**Choreography**
- `0.00–0.35` Avatar pops in (scale 0 → 1, `pop`, rotate −12° → 0).
- `0.20–0.75` Pill grows from avatar-size circle to full width (snappy spring, ~2% width overshoot).
- `0.45–0.90` Name and handle slide in from the left (`glide`, stagger 0.08 s).
- `1.40–1.90` CTA chip scales in. At `2.30` a "tap": chip presses (scale 0.94 → 1, 1-frame darken), label crossfades *Follow* → *Following*, a check draws on.
- `hold` Gentle float (y ±0.3u, 3 s period) — the one lower third allowed to move, because creator content is lively.
- `5.50–6.00` Text fades, pill collapses into the avatar, avatar scales out.

**Controls**
- Content: Name · Handle · Avatar (image or initials) · CTA (on/off, labels)
- Style: Size
- Motion: Float (on/off)
- Layout: Anchor · offset

**Defaults.** `Maya Chen` · `@mayamakes` · CTA `Follow` → `Following`

**Looks.** Paper · Ink · Candy

**The expensive detail.** The pill grows on a spring but text is masked by the pill, so overshoot never exposes overflow. The check mark draws via trim path; the tap has a 1-frame press darken for tactility.

**Engine needs.** Spring on geometry · shape masks · trim path.

---

## 2.4 Editorial — *serif elegance*

**Use it for** documentaries, fashion, luxury brands, museum/cultural content.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `editorial` | 16:9 · 9:16 · 1:1 · 4:5 | 7 s (3–20) | in · hold · out | default | `editorial` · Ink (white type) |

**Art direction.** The name in large *italic serif*; a hairline rule (0.1u); the title in small uppercase sans with +14% tracking. No container. Quiet, expensive.

**Choreography**
- `0.00–1.10` Name fades in from blur (8 → 0 px@1080) and drifts up 1u (`drift`, long).
- `0.45–1.25` Hairline draws from the left (`glide`).
- `0.70–1.60` Title characters fade in with 0.018 s stagger while tracking settles +22% → +14%.
- `hold` Micro-drift (0.4u over the hold).
- `6.20–7.00` Everything fades with blur (`drift`) — never a hard exit.

**Controls**
- Content: Name · Title
- Style: Alignment (Left · Center) · Size · Shadow
- Layout: Anchor · offset

**Defaults.** `Élodie Marchand` · `PERFUMER · MAISON LUMIÈRE`

**Looks.** Ink (white) · Paper (black) · Film (warm white)

**The expensive detail.** The rule starts at the italic's *visual* left edge (italic overhang compensated), and title tracking is tuned by size — small caps get more air.

**Engine needs.** Glyph bounds (actual ink extents) · per-character stagger · blur.

---

## 2.5 Signal — *tech HUD*

**Use it for** tech talks, gaming, esports, hackathons, product demos, conferences.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `signal` | 16:9 · 9:16 · 1:1 · 4:5 | 6 s (3–20) | in · hold · out | default | `technical` · Graphite |

**Art direction.** Four corner brackets frame the text block. Name in technical grotesk caps; role beneath; a mono data line at the bottom; a blinking status dot + label (REC/LIVE) at the top-right of the block. Faint scanlines (6%) inside the bracket area.

**Choreography**
- `0.00–0.30` Brackets fly in from 2u outside into the corners (`snap`, stagger 0.03 s).
- `0.20–1.00` Name *decodes* (scramble → lock, 0.15–0.3 s per char).
- `0.60–1.20` Role fades in; data line types in (0.03 s/char). With *Live timecode* on, the timecode runs in real time through the hold.
- `hold` Status dot blinks 1 Hz; brackets breathe 0.2u every 2 s.
- `5.60–6.00` Text glitches (2 frames of RGB split), brackets collapse to center, fade.

**Controls**
- Content: Name · Role · Data line (text or *Live timecode*) · Status label
- Style: Scanlines (on/off) · Size
- Layout: Anchor · offset

**Defaults.** `KAI MORGAN` · `LEAD ENGINEER` · `BERLIN · 52.5200° N, 13.4050° E` · Status `REC`

**Looks.** Graphite (mint) · Ink (yellow) · Midnight

**The expensive detail.** Timecode digits are tabular mono, so nothing jitters as it runs; bracket corners snap to the pixel grid at rest for razor-sharp edges.

**Engine needs.** Scramble + typewriter helpers (shared with *Decode*) · pixel-snapping at rest · RGB-split effect.
