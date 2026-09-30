# 04 — Product & Ads

> Short, conversion-minded product spots. Five selling moments: **price drop** (Deal), **feature callouts** (Callouts), **hero launch** (Reveal), **before/after** (Compare), **promotion** (Sale).

Category slug: `product-ads` · Conventions: [`00-foundations.md`](00-foundations.md)

### Shared behaviour

- **Product image slot**: PNG/WebP with transparency is ideal; JPG works (shown in a rounded frame, or as full-bleed where the layout allows). Defaults use the procedural **Objects** set (bottle, can, speaker, phone, watch).
- Prices are formatted with `Intl.NumberFormat` (currency + locale); the user picks currency and symbol position.
- CTA chips are pill-shaped, `accent` on `bg` (or inverted), with the label in the text face at wght 600.
- Default formats favour feeds: **1:1 and 4:5** first, then 9:16, then 16:9.

---

## 4.1 Deal — *price drop*

**Use it for** discounts, e-commerce promos, flash offers, marketplace ads.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `deal` | 1:1 · 4:5 · 9:16 · 16:9 | 6 s (4–12) | in · hold · out | no | `grotesk` · Cobalt |

**Art direction.** The product large (≈ 60% of frame height) on one side; product name in small caps; the old price small with a strike; the **new price huge**; a rotated circular discount sticker; a CTA pill.

**Choreography**
- `0.00–0.70` Product rises from below and lands with a subtle squash (scaleY 0.97 → 1); its contact shadow tightens.
- `0.40–0.90` Product name reveals (mask).
- `1.00–1.30` Old price fades in.
- `1.30–1.60` Strike line draws across the old price at −4° (`snap`); old price dims to 50% and drops 1u.
- `1.50–2.20` New price **rolls down from the old value to the new one** (odometer digits) and punches (1.12 → 1, `pop`).
- `2.10–2.50` Sticker spins in (−200° → −12°, scale 0 → 1, `pop`).
- `2.50–2.90` CTA pill slides in.
- `hold` Product floats (±0.4u, slow); sticker wobbles ±2°.
- `5.50–6.00` Elements exit in reverse order.

**Controls**
- Content: Product image · Product name · Old price · New price · Currency/locale · Badge (Auto % · Custom text) · CTA
- Style: Layout (Product left · right · top) · Shadow (on/off)
- Layout: product scale/offset (`movable`)

**Defaults.** Object *bottle* · `AERO BOTTLE 750 ML` · €39.00 → €27.00 · badge auto `−31%` · CTA `Shop now`

**Looks.** Cobalt (yellow sticker) · Paper (cobalt sticker) · Hazard

**The expensive detail.** Price digits roll from old to new in tabular figures; the strike is slightly angled like a real mark; the contact shadow is a blurred ellipse that tightens as the product lands.

**Format notes.** *Product left/right* sit side by side in 16:9, 1:1 and 4:5 (the offer left-aligned beside the product). 9:16 always stacks the product over the offer; *left/right* then set the side the composition leans to and the offer's alignment. *Product top* stacks in every format, with the old and new price on one baseline (except 9:16). The sticker sits on the product's upper corner facing the offer and never overlaps it.

**Implementation notes.** Prices are typed as text ("39", "39.00", "1.299,99") and formatted with `formatMoney` for the chosen currency preset; cents show when either price has them; a price without digits is set as typed (no roll). The roll turns only digits — currency and separators stay still — and a slot the new price doesn't need rolls to 0, fades and closes up. Balanced and Punchy add one full slot-machine turn; Calm rolls straight to the new digits. *Auto %* hides the sticker when there is no saving. The CTA pill is `fg` with a `bg` label (the "inverted" chip).

**Engine needs.** Odometer digits · currency formatting · trim-path strike · contact shadow · procedural Objects.

---

## 4.2 Callouts — *feature callouts*

**Use it for** product features, spec highlights, launch explainers, hardware and packaging.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `callouts` | 16:9 · 1:1 · 4:5 · 9:16 | 7 s (5–15) | in · hold · out | optional | `grotesk` · Paper |

**Art direction.** The product centered; 2–4 callouts, each with an anchor dot on the product, a thin leader line (0.12u) with a single elbow, a label title (wght 600) and a muted detail line. Engineering-drawing discipline: consistent angles (0°/45°), balanced left/right.

**Choreography**
- `0.00–0.90` Product fades in and scales 0.96 → 1 (`glide`) with a soft shadow.
- Callout *i* starts at `0.90 + i × 0.35`: anchor dot pops (`pop`) with a ring pulse; leader line draws (trim, `glide`, 0.45 s); title reveals by mask; detail fades 0.1 s later.
- `hold` Anchor rings pulse every 2 s (staggered).
- `6.30–7.00` Labels fade, lines retract into anchors, dots shrink, product fades.

**Controls**
- Content: Product image · Title (optional) · Callouts 1–4 (title, detail; a callout with neither is hidden — 3 by default)
- Style: Line style (Straight · Elbow) · Dot style (Solid · Ring)
- Layout: per callout, the anchor point (X · Y, % of the product's box) and side (Auto · Left · Right)

**Defaults.** Object *speaker* · Title `Nova One` · `40-hour battery` — *All week, on one charge.* · `Spatial audio` — *Sound that fills the room.* · `Recycled aluminium` — *Built to last longer.*

**Looks.** Paper · Ink · Sand

**The expensive detail.** Labels auto-distribute vertically to avoid overlaps and leader lines keep consistent angles — precision reads as premium.

**Implementation notes.** The engine has no point control yet, so each anchor is two number controls (X/Y as a share of the product's ink box: the dot stays on the same feature in every format and size); clicking a dot on the stage focuses them. *Auto* sides take the side nearer the anchor, then the columns are balanced (never more than one label apart) by moving the automatic label whose anchor sits nearest the middle. Each column is solved exactly: labels in anchor order, never overlapping, inside the column, each as near as the others allow (least squares) to where it wants to sit — a little away from the product's middle, so leaders fan out. Leaders are a 45° leg out of the anchor and a level run into the label (a leader that would almost level off levels off; only a label moved further than its run allows steepens its leg); a stack taller than its column shrinks its labels first. Where a leader or dot crosses the product it gets a thin casing in `bg`, so it reads on dark and light products. The title slides out of the leader's end (clipped there) and back into it on the exit. Title and product are one group, centered in the free height; label columns sit a gutter from the product, symmetric around the layout area's middle.

**Engine needs.** Point controls (stage picking — number controls until then) · label layout solver · trim paths.

---

## 4.3 Reveal — *hero launch*

**Use it for** product launches, "coming soon", premium announcements, hardware reveals.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `reveal` | 16:9 · 9:16 · 1:1 · 4:5 | 7 s (5–15) | in · hold · out | no | `wide` · Ink |

**Art direction.** Darkness, then the product emerges in a moving light. A faint floor reflection (flipped, faded, blurred), the name in wide type tracking in, a tagline, an availability line.

**Choreography**
- `0.00–0.80` Black; a faint haze appears (radial, 5%).
- `0.60–2.00` A vertical **light band sweeps up** through the product (soft gradient mask) with a brighter rim-light leading edge.
- `1.80–3.00` Name letters track in (blur + tracking, Focus-style).
- `2.70–3.40` Tagline fades up.
- `3.40–3.90` Availability line + CTA.
- `hold` Slow push-in (1.00 → 1.04); a faint sweep passes again every 3 s.
- `6.20–7.00` Fade to black.

**Controls**
- Content: Product image · Name · Tagline · Availability/CTA
- Style: Light color · Reflection (on/off)

**Defaults.** Object *watch* · `ORBIT` · `Made to move with you.` · `Available 10.10`

**Looks.** Ink · Midnight · Film

**The expensive detail.** One light does all the work: a soft gradient mask with a brighter leading edge sells "premium launch" without any extra decoration.

**Implementation notes.** The band travels up at a slight tilt (−7°). Its matte lights the product from below with a soft ramp; the leading edge is the product itself under the light — brightened and cast in the light's color — plus a glow of its brightest parts (metal and print glint as the band crosses them). Both images, and the floor reflection (the lower third of the product flipped, faded from 30%, blurred), are baked once in `build`, so a frame only masks them (vector artwork falls back to live `fx`). The reflection comes up as the light reaches the product's foot; the haze (a 5% radial glow) lifts a little while the band crosses. Hold passes: every 3 s (Calm 4 s, Punchy 2 s) once the hold has room for a whole pass. 16:9 sets product and type side by side as one centered lockup; the other formats stack product, reflection and centered type. Calm softens the edge, Punchy sharpens it and snaps the sweep and the tracking. The name keeps the user's case (all caps get +6% tracking).

**Engine needs.** Gradient masks · reflection (flip + fade + blur) · tracking animation.

---

## 4.4 Compare — *before / after*

**Use it for** redesigns, photo edits, renovations, skincare, app updates, "glow-ups".

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `compare` | 1:1 · 4:5 · 9:16 · 16:9 | 6 s (4–12) | in · hold · out | no | `grotesk` · Paper |

**Art direction.** Two images in the same frame, a divider line with a round grip (subtle shadow, chevrons), small pill labels *Before* / *After*, optional headline.

**Choreography**
- `0.00–0.60` Before image fades in and settles (scale 1.04 → 1); *Before* label.
- `0.80–2.20` Divider enters from the left edge and sweeps to 85% (`snap`), revealing *After*; its label pops the moment it's revealed.
- `2.20–2.90` Divider settles back to 50% on a spring — both states visible.
- `hold` Divider drifts ±4% (`drift`) to invite the eye.
- `5.40–6.00` Divider sweeps to 100%, then fade.

**Controls**
- Content: Before image · After image · Labels · Headline (optional)
- Style: Divider (Line · Grip) · Orientation (Horizontal · Vertical) · Corner radius

**Defaults.** The same procedural *Scene* rendered flat/ungraded vs graded · `Before` / `After` · Headline `One click. Totally different.`

**Looks.** Paper · Ink · Mono Light

**The expensive detail.** Overshoot-then-settle divider motion, and images aligned by their focal points so the comparison is truthful.

**Implementation notes.** The sweep uncovers *After* from the left edge, so *After* sits left of the divider (above it when vertical) and ends the spot when the divider sweeps home. Both pictures are placed with their focal points on the same spot of the card (the mean of where each would sit on its own), each still covering it; pictures of the same proportions share one size, and focal points too far apart for a modest zoom fall back to each picture's own cover crop. When both slots hold the same picture (the default: *Scene* Alpine), *Before* shows it flat — lifted, low-contrast, muted, a grey cast, baked once in `build` — against the graded original. The settle spring follows Energy (Calm `heavy` from 75%, Balanced `snappy` from 85%, Punchy `lively` from 90%); the hold drifts ±4% (Calm ±3%). Labels are two text fields; each pill is clipped to its own side, and *After* pops when the sweep uncovers its middle. Vertical formats keep the card symmetric inside the social zone.

**Engine needs.** Image focal points · clip by divider · color adjustments (for the default pair) · springs.

---

## 4.5 Sale — *promo tape*

**Use it for** seasonal sales, Black Friday, promo codes, store openings.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `sale` | 1:1 · 4:5 · 9:16 · 16:9 | 5 s (4–12) | in · hold (loops) · out | no | `poster` · Hazard |

**Art direction.** Two diagonal tape bands with repeating marquee text cross the frame at opposing angles; a massive discount in the middle; a subline; a promo code in a dashed-outline box; tiny terms.

**Choreography**
- `0.00–0.45` Tapes slide in along their angles from off-frame (`snap`); marquee text scrolls in opposite directions (`linear`, constant speed).
- `0.40–0.90` Discount slams (scale 1.5 → 1, rotation −4° → −2°, `pop`) with a 3-frame shake.
- `0.90–1.40` Subline reveals.
- `1.50–2.20` Code box's dashed border draws on (trim), code types in, box flashes `accent` once.
- `hold` Marquee loops seamlessly; the discount pulses (1.03) every second.
- `4.60–5.00` Tapes fly out along their axes; text cuts.

**Controls**
- Content: Discount · Subline · Tape text · Code (optional) · Terms (optional)
- Style: Tape angle (Low · High)
- Motion: Marquee speed

**Defaults.** `−50%` · `Everything. This weekend only.` · Tape `SUMMER SALE ●` · Code `MOVE50` · `Ends Sunday 23:59.`

**Looks.** Hazard · Ink (yellow tapes) · Candy

**The expensive detail.** Marquee content is laid out as an exact repeat unit so the loop never pops; where the tapes cross, the top tape casts a soft shadow on the lower one.

**Format notes.** The tapes cross in an X across the upper part of the frame (below the social UI zone in vertical formats), so the crossing and its shadow stay visible; the discount, subline, code and terms stack centered beneath it.

**Implementation notes.** The marquee speed is trimmed (by at most 30%) so the hold scrolls a whole number of repeat units, and the discount's pulses divide the hold: the hold itself is a seamless loop. Separators typed in the tape text (● • ·) are drawn as vector dots — most display faces lack U+25CF. Calm replaces the slam's pop and shake with a softer settle and fades the text out instead of cutting it.

**Engine needs.** Seamless marquee helper · dashed trim paths · shadows between layers.
