# 09 — Logo & Branding

> Logo reveals and stings for intros, outros and brand moments. Five reveal techniques: **light** (Sheen), **line** (Draw), **fragments** (Shards), **physics** (Bounce), **pixels** (Resolve).

Category slug: `logo-branding` · Conventions: [`00-foundations.md`](00-foundations.md)

### Shared behaviour

- **Logo slot**: SVG preferred (enables vector effects), PNG/JPG/WebP accepted. Defaults use the vector placeholder logos (Halden, Nova, Aero).
- **Logo color mode**: Original · Mono (auto light/dark vs background) · Accent.
- **Tagline**: optional, below the logo, in the text face.
- **Background**: palette color · Brand color · Transparent.
- **Structure**: `in · hold` ending on a clean, fully resolved logo frame (perfect as an end card); an optional **Out** toggle adds an exit.
- **Duration**: 4 s default (3–8).
- **Fallbacks are honest**: when a technique needs vector data (Draw) and the logo is raster, the template switches to its documented raster variant and says so in the inspector.

---

## 9.1 Sheen — *light sweep*

**Use it for** corporate intros, premium brands, end cards, event sponsors.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `sheen` | 16:9 · 9:16 · 1:1 · 4:5 | 4 s (3–8) | in · hold (· out) | optional | `grotesk` · Ink · Nova logo |

**Art direction.** The logo emerges from darkness; a specular light band sweeps across it — masked to the logo's own shape — followed by a soft bloom; the tagline tracks in underneath. Nothing else.

**Choreography**
- `0.00–1.00` Logo fades in with scale 0.96 → 1 and blur ≈ 1u → 0 (`glide`) — still in shade: dimmed toward the background until the light reaches it.
- `1.10–1.90` A 25° specular band (sharp core, soft falloff) sweeps across the logo, clipped to logo alpha; the shade lifts behind it, and `1.80–2.30` the last of the light and shade fade out, leaving the clean logo.
- `1.70–2.20` Bloom pulse on the band's highlight — on dark grounds only (on light grounds the sweep stays subtle and doesn't bloom).
- `1.60–2.40` Tagline tracks in (+20% → +4%) and fades up.
- `hold` Clean logo; the second sweep (on by default) crosses in the last 0.9 s of a hold of at least 1.3 s — half the light, no shade, a faint bloom.
- `out` (optional, 0.6 s) Logo and tagline fade out while the logo shrinks to 0.98 and blurs.

**Controls**
- Content: Logo · Tagline
- Style: Light (White · Warm · Accent) · Glow (Off · Soft · Strong) · Logo color (Original · Mono · Accent)
- Motion: Second sweep (on by default) · Out (off by default)

**Defaults.** Nova logo · `Built for what's next`

**Looks.** Ink · Midnight (Editorial pairing, warm light) · Paper (dark logo, subtle sweep)

**The expensive detail.** The sweep is masked to the logo's alpha with a sharp core and soft falloff, and it *lights* the logo — the logo waits in shade ahead of the band — so it reads as light *on a material*, not a white stripe (a white stripe on a white logo would be invisible).

**Engine needs.** Alpha masks (track matte) · gradient bands · bloom (compositor) · blur (compositor).

---

## 9.2 Draw — *stroke to fill*

**Use it for** design studios, architects, craft brands, signatures, line-art logos.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `draw` | 16:9 · 9:16 · 1:1 · 4:5 | 4 s (3–8) | in · hold (· out) | optional | `grotesk` · Paper · Halden logo |

**Art direction.** Every path of an SVG logo is drawn on as a stroke, then the fill fades in while the stroke thins away — like a technical pen becoming ink.

**Choreography**
- `0.00–1.80` Paths stroke-draw (trim path 0 → 1) at **constant pen speed** (duration ∝ path length), sequentially by document order or all together.
- `1.50–2.30` Fill fades in (overlapping the end of the draw); stroke width thins to 0.
- `2.00–2.60` Tagline reveals (mask).
- `hold` Clean logo.
- Raster fallback: the logo is revealed by a mask sweep led by a thin glowing line along the edge of the reveal.

**Controls**
- Content: Logo · Tagline
- Style: Stroke color · Stroke width · Logo color mode
- Motion: Order (Sequential · Together) · Out (on/off)

**Defaults.** Halden logo · `Studio for moving images`

**Looks.** Paper · Ink · Sand

**The expensive detail.** Pen speed normalized by path length (long paths don't rush, short paths don't crawl), round caps, and the fill beginning *before* the stroke finishes.

**Engine needs.** SVG import (paths, basic shapes, transforms, `viewBox`) · path length measurement · trim paths · raster fallback.

**As built (Phase 5).** Every contour (subpath) of the artwork is its own stroke, and contours are grouped into *islands* — an outline with the holes inside it, found by containment within each shape — which take their ink separately, with the artwork's fill rule. One pen speed for the whole logo: each stroke takes time in proportion to its length (never under 0.12 s, eased on and off with the energy's curve); Sequential strokes follow document order, each starting when the one before has 40% of its way to go, the last ending at 1.80 s; Together they all start at once (a hair apart) and the longest ends at 1.80 s. Each island starts to ink 0.3 s before its last stroke ends (never before 1.2 s) and takes 0.8 s while its line thins away, so in Sequential order the ink follows the pen — the last island inks 1.5–2.3 s as specified. The artwork's own strokes (line-art logos) are drawn on at their own width and stay. Stroke color: Accent (default; the second accent or muted where the accent is the logo's own color) · Logo · Muted. Stroke width: Fine · Regular · Bold (0.2 · 0.36 · 0.62u). The tagline rises into its line masks (2.0–2.6 s). The hold breathes 1.2%, and holds of 2.6 s or more get one quiet pass of the pen — a short trace running once around every outline, done 0.4 s before the end card. Raster logos: a line leaning 12°, in a soft halo of the pen color, sweeps across and reveals the logo in the pen color, which then inks to its own colors on the vector timing (the logo control's hint says so). Out (0.7 s): the tagline sinks back into its mask, the ink drains back into the pen outline and the strokes are un-drawn along their paths. Energy: Calm draws until 2.2 s and inks softly (1 s), Punchy whips the strokes on (`snap`, done by 1.35 s) and inks in 0.55 s. Looks: Paper (grotesk) · Ink (editorial, gold pen) · Sand (classic, logo-colored pen, Together). Also has the shared *Logo color* control.

---

## 9.3 Shards — *assemble from fragments*

**Use it for** gaming, tech, sports, action brands, product launches.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `shards` | 16:9 · 9:16 · 1:1 · 4:5 | 4 s (3–8) | in · hold (· out) | optional | `technical` · Midnight · Nova logo |

**Art direction.** The logo is cut into 20–80 polygon shards (Delaunay triangulation of seeded points inside the logo's alpha), which fly in from depth with rotation and motion blur, lock into place with a flash, and emit a thin shockwave ring.

**Choreography**
- `0.00–1.20` Shards fly in (spring, seeded start positions and rotations; arrival times jittered so the last few "click" in).
- `1.20–1.35` Flash: logo briefly brightens (additive), a thin ring expands and fades.
- `1.30–2.00` Tagline reveals.
- `hold` Clean logo. Out (optional): shards explode away.

**Controls**
- Content: Logo · Tagline
- Style: Shards (Low · Medium · High) · Flash color
- Motion: Direction (Explode-in · Fall · Swirl) · Seed (Shuffle) · Out (on/off)

**Defaults.** Nova logo · `Play without limits`

**Looks.** Midnight · Ink · Cobalt

**The expensive detail.** Staggered, seeded arrivals so assembly has rhythm (and a satisfying final click), with per-shard motion blur from temporal sampling.

**Engine needs.** Delaunay triangulation (e.g. `delaunator`, ISC) · per-polygon clip of the logo image · motion blur.

**As built (Phase 5).** The cut is local, no dependency: best-candidate points inside the logo's own coverage (drawn once in `build`), a ring of points around its box, Bowyer–Watson Delaunay, and only the triangles that carry ink — Low · Medium · High aim for 24 · 44 · 72 shards. Vector logos are cut exactly (their flattened outlines clipped to each triangle, so counters and rings survive); logos with strokes and raster logos use pre-drawn shard sprites. Rhythm: shards leave from 0.04 s (fading in), land from 0.45 s — sparse, then a dense clatter, thinning by 0.98 s — and three of the largest pieces, far apart, click in one by one at 1.05 · 1.12 · 1.20 s; the last fires the flash and the ring. A shard is *pulled* into place, so it lands with speed: Balanced under a constant force (a parabola), Punchy exponentially (with a short jolt of the lockup on the last click), Calm floats in on `drift` and merges without a click. On landing a shard fuses into one clip with the landed ones (no seams), swells by 5% (Punchy 8%) and settles on the energy's spring, and glints in the flash color (blooming on dark grounds). The ring spreads from the final shard over the whole logo (0.6 s) rather than from the logo's center — the shockwave comes from the click. Directions: Explode-in is a reversed explosion (out along the radius, nearer the camera, tumbling); Fall drops the shards from 24–64u above, tumbling like cards, in a left-to-right sweep; Swirl orbits them in from far away (150–260°) in an angular sweep. Tumbling shards darken as their face turns away. Flash color: Accent (default) · White; also the shared *Logo color*. The tagline's glyphs rise into their line mask from the center out (1.30–2.00 s). The hold pushes in 1.2%; Out (0.7 s) drops the tagline, cracks the logo with a small flash and explodes the shards toward the camera, nearer ones first. Genre shutter 270°, so every shard in flight streaks.

---

## 9.4 Bounce — *playful drop*

**Use it for** kids' brands, apps, food & drink, consumer products, friendly startups.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `bounce` | 16:9 · 9:16 · 1:1 · 4:5 | 4 s (3–8) | in · hold (· out) | optional | `wide` · Acid · Aero logo |

**Art direction.** The logo drops in, squashes on impact, bounces twice with decaying height, and settles; a contact shadow scales with height; the tagline letters bounce in after it.

**Choreography**
- `0.00–0.45` Logo falls from above the frame (gravity ease-in), stretching slightly (scaleY 1.08) on the way down.
- `0.45` Impact: squash (scaleX 1.12 / scaleY 0.82, volume-preserving), radial burst lines.
- `0.45–1.40` Two decaying bounces (each ≈ 0.55× the previous height) with smaller squashes; the shadow grows and shrinks inversely with height.
- `1.20–1.90` Tagline letters bounce in (stagger 0.03 s, `pop`).
- `hold` Clean logo.

**Controls**
- Content: Logo · Tagline
- Style: Shadow (on/off) · Burst (on/off)
- Motion: Bounciness (Low · Medium · High) · Out (on/off)

**Defaults.** Aero logo · `Good things, daily`

**Looks.** Acid · Candy · Paper

**The expensive detail.** Squash & stretch preserves volume (scaleX × scaleY ≈ 1) and bounce decay follows real physics, so it's playful without being cartoonishly fake.

**Engine needs.** Bounce/gravity helpers · transform origin at the logo's base · shadow ellipse.

**As built (Phase 3).** Real physics sets the rhythm: the logo falls from rest at the top edge (0.45 s), and one gravity with restitution √ratio (Low 0.36 · Medium 0.55 · High 0.7 of the previous height) gives flights of ≈ 0.67 s and 0.5 s — the last landing is at ≈ 1.7 s rather than 1.40, and the tagline starts during the last bounce (≈ 1.2 s). A 50 ms ground contact per impact builds the squash (scaleX = scaleY^−0.6: 0.82 → 1.12); a named spring releases it and its overshoot becomes the rebound's stretch; speed adds up to 8% stretch. The first bounce is capped so the logo never leaves the frame (tall marks bounce a little lower). Holds of ≥ 1.5 s get one small idle hop (Balanced/Punchy; a slow 1.2% breath in Calm), after the poster frame and settled well before the last frame, which stays the finished logo. Energy: Calm lands softly (lower bounces, `snappy` release), Punchy drops faster with a deeper squash (`bouncy`). Also has the shared *Logo color* control.

---

## 9.5 Resolve — *pixel mosaic*

**Use it for** gaming, tech, retro/8-bit brands, AI and data products.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `resolve` | 16:9 · 9:16 · 1:1 · 4:5 | 4 s (3–8) | in · hold (· out) | optional | `mono` · Graphite · Nova logo |

**Art direction.** The logo appears as coarse pixel blocks that refine in steps (e.g. 6 → 12 → 24 → 48 px blocks → full resolution); blocks flicker in in seeded order; a brief RGB split at the final step; a scanline sweep; the tagline types in.

**Choreography**
- `0.00–0.60` Coarsest blocks flicker in (seeded order, stepped at 24 fps).
- `0.60–1.40` Resolution steps every 0.12–0.2 s (3–6 steps).
- `1.40–1.55` Final step: crisp logo with a 3-frame RGB split.
- `1.50–1.90` A scanline sweeps down once.
- `1.60–2.40` Tagline types in (mono, 0.04 s/char) with a block cursor.
- `hold` Clean logo; cursor blinks, then disappears.

**Controls**
- Content: Logo · Tagline
- Style: Pixel style (Square · Dot) · Glitch (on/off)
- Motion: Steps (3–6) · Seed (Shuffle) · Out (on/off)

**Defaults.** Nova logo · `Now in beta`

**Looks.** Graphite · Ink · Mono Light

**The expensive detail.** Blocks are true area averages of the logo (not nearest-neighbor noise), steps land on a 24 fps cadence, and the final frame is pixel-perfect with no residue.

**Engine needs.** Downsample/upsample with smoothing off · stepped time · RGB split (compositor) · typewriter helper.

**As built (Phase 5).** The mosaic levels are computed once in `build`: the logo is drawn into a small OffscreenCanvas in its final colors and averaged over each level's square blocks in premultiplied sRGB — exactly what the finished frame holds on average over each square — and the blocks are drawn as crisp rects (or dots) batched by color and coverage, so neighbours never show seams. *Steps* (3–6, default 4) counts the refinements after the coarsest level, so there are Steps + 1 levels, from about 20 blocks over the logo's area to about 1600 (never finer than 0.72u); the steps come every ≈ 0.12–0.2 s from 0.60 s (quickening a little as they refine), and the final step lands at 1.40 s (1.20 s with 3 steps). Every change sits on the 24 fps grid and the template's shutter is closed (0°), so motion blur never blends two steps. The coarsest blocks appear in seeded order with seeded flicker patterns: Balanced blocks flash overexposed (up to 2.6× their coverage) and blink before settling on their true average, Punchy strobes, Calm dims in without blinking. *Glitch* (on by default) adds the final step's 3-frame RGB split — a true channel split for one-color logos (added on dark grounds, multiplied on light ones), colored ghosts for multi-color logos — and tears: on its first frame a new level shows one (Punchy: two) rows shifted by a block or two; Calm splits less and never tears. The scanline (1.50–1.90 s) has a phosphor trail in the accent color; long holds get fainter refresh passes every 2.4 s, after the poster frame and done before the end card. The tagline types in from 1.55 s at 0.04 s per character (at most 0.75 s in all) behind a block cursor in the accent color, which blinks through the hold and is gone 0.6 s before the end (0.12 s in short holds). Out (0.65 s): the tagline backspaces, the logo de-resolves level by level and its coarsest blocks flicker out. Also has the shared *Logo color* control.
