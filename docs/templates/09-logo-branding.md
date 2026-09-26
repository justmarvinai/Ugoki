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
- `0.00–1.00` Logo fades in with scale 0.96 → 1 and blur 10 → 0 (`glide`).
- `1.10–1.90` A diagonal specular band (sharp core, soft falloff) sweeps across the logo, clipped to logo alpha.
- `1.70–2.20` Soft bloom pulse on the logo (threshold only affects the band's highlight).
- `1.60–2.40` Tagline tracks in (+20% → +4%) and fades up.
- `hold` Clean logo; an optional second, fainter sweep at the end of the hold.

**Controls**
- Content: Logo · Tagline
- Style: Light color · Glow (Off · Soft · Strong) · Logo color mode
- Motion: Second sweep (on/off) · Out (on/off)

**Defaults.** Nova logo · `Built for what's next`

**Looks.** Ink · Midnight · Paper (dark logo, subtle sweep)

**The expensive detail.** The sweep is masked to the logo's alpha with a sharp core and soft falloff, so it reads as light *on a material*, not a white stripe.

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
