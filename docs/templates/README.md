# Ugoki Template Library — Catalog

> 50 launch templates · 10 categories · 5 per category. Each category covers **distinct styles and use cases** — no two templates in a category solve the same job.

Start with [`00-foundations.md`](00-foundations.md) (spec format, global controls, palettes, fonts, placeholders, quality bar). The motion vocabulary used in every spec (`glide`, `snap`, `exit`, `drift`, `pop`, springs, energy) is defined in [`../04-motion-language.md`](../04-motion-language.md).

| # | Category | File | The five |
|---|---|---|---|
| 01 | Text & Titles | [01-text-titles.md](01-text-titles.md) | Rise · Stretch · Echo · Focus · Decode |
| 02 | Lower Thirds | [02-lower-thirds.md](02-lower-thirds.md) | Line · Broadcast · Capsule · Editorial · Signal |
| 03 | Social | [03-social.md](03-social.md) | Punch · Chat · Listicle · Versus · Countdown |
| 04 | Product & Ads | [04-product-ads.md](04-product-ads.md) | Deal · Callouts · Reveal · Compare · Sale |
| 05 | Showcase | [05-showcase.md](05-showcase.md) | Columns · Float · Ring · Zoom · Stack |
| 06 | Brand & Quotes | [06-brand-quotes.md](06-brand-quotes.md) | Quote · Review · Manifesto · Numbers · Pattern |
| 07 | Openers | [07-openers.md](07-openers.md) | Cinematic · Hype · Grid · Departures · Episode |
| 08 | Transitions | [08-transitions.md](08-transitions.md) | Layers · Iris · Liquid · Blinds · Sweep |
| 09 | Logo & Branding | [09-logo-branding.md](09-logo-branding.md) | Sheen · Draw · Shards · Bounce · Resolve |
| 10 | UI / Product Motion | [10-ui-motion.md](10-ui-motion.md) | Click · Notify · Scroll · Dashboard · Command |

---

## Full index

`Alpha`: **D** = transparent by default · **O** = optional · — = no. `Wave`: build order (see below).

| ID | Name | Category | One-liner | Default format | Duration | Structure | Alpha | Wave |
|---|---|---|---|---|---|---|---|---|
| `rise` | Rise | Text & Titles | Masked line reveal | 16:9 | 5 s | in·hold·out | O | 1 |
| `stretch` | Stretch | Text & Titles | Variable-width poster type | 9:16 | 4 s | in·hold·out | O | 2 |
| `echo` | Echo | Text & Titles | Stacked outline repeats | 9:16 | 5 s | in·hold·out | O | 2 |
| `focus` | Focus | Text & Titles | Blur-to-sharp headline | 16:9 | 5 s | in·hold·out | O | 1 |
| `decode` | Decode | Text & Titles | Character scramble | 16:9 | 4 s | in·hold·out | O | 1 |
| `line` | Line | Lower Thirds | Minimal accent bar | 16:9 | 6 s | in·hold·out | D | 1 |
| `broadcast` | Broadcast | Lower Thirds | News block | 16:9 | 6 s | in·hold·out | D | 1 |
| `capsule` | Capsule | Lower Thirds | Creator pill | 9:16 | 6 s | in·hold·out | D | 1 |
| `editorial` | Editorial | Lower Thirds | Serif elegance | 16:9 | 7 s | in·hold·out | D | 2 |
| `signal` | Signal | Lower Thirds | Tech HUD | 16:9 | 6 s | in·hold·out | D | 2 |
| `punch` | Punch | Social | Kinetic hook captions | 9:16 | Auto | sequence | O | 1 |
| `chat` | Chat | Social | Message thread story | 9:16 | Auto | sequence | — | 2 |
| `listicle` | Listicle | Social | Numbered tips | 9:16 | Auto | sequence | — | 1 |
| `versus` | Versus | Social | This or that | 9:16 | 6 s | in·hold·out | — | 2 |
| `countdown` | Countdown | Social | Launch timer | 9:16 | Auto | in·hold·out | O | 1 |
| `deal` | Deal | Product & Ads | Price drop | 1:1 | 6 s | in·hold·out | — | 1 |
| `callouts` | Callouts | Product & Ads | Feature callouts | 16:9 | 7 s | in·hold·out | O | 2 |
| `reveal` | Reveal | Product & Ads | Hero launch | 16:9 | 7 s | in·hold·out | — | 2 |
| `compare` | Compare | Product & Ads | Before / after | 1:1 | 6 s | in·hold·out | — | 2 |
| `sale` | Sale | Product & Ads | Promo tape | 1:1 | 5 s | in·hold·out | — | 1 |
| `columns` | Columns | Showcase | Parallax portfolio reel | 16:9 | 8 s | loop | — | 1 |
| `float` | Float | Showcase | Device showcase in 3D | 16:9 | 6 s | in·hold·out | O | 2 |
| `ring` | Ring | Showcase | 3D carousel | 16:9 | 8 s | loop | O | 2 |
| `zoom` | Zoom | Showcase | Grid zoom | 16:9 | 6 s | in·hold·out | — | 2 |
| `stack` | Stack | Showcase | Photo stack | 1:1 | 7 s | in·hold·out | — | 1 |
| `quote` | Quote | Brand & Quotes | Big quote | 1:1 | Auto | in·hold·out | O | 1 |
| `review` | Review | Brand & Quotes | Testimonial with rating | 1:1 | 6 s | in·hold·out | O | 1 |
| `manifesto` | Manifesto | Brand & Quotes | Statement sequence | 16:9 | Auto | sequence | — | 2 |
| `numbers` | Numbers | Brand & Quotes | By the numbers | 16:9 | 6 s | in·hold·out | O | 1 |
| `pattern` | Pattern | Brand & Quotes | Brand pattern lockup | 16:9 | 5 s | in·hold·out | — | 2 |
| `cinematic` | Cinematic | Openers | Film title | 16:9 | 8 s | in·hold·out | — | 1 |
| `hype` | Hype | Openers | Fast-cut channel intro | 16:9 | 5 s | sequence | — | 2 |
| `grid` | Grid | Openers | Swiss grid poster | 16:9 | 6 s | in·hold·out | — | 2 |
| `departures` | Departures | Openers | Split-flap board | 16:9 | 7 s | in·hold·out | — | 2 |
| `episode` | Episode | Openers | Series opener | 16:9 | 5 s | in·hold·out | — | 1 |
| `layers` | Layers | Transitions | Stacked panel wipe | 16:9 | 1.2 s | transition | D | 1 |
| `iris` | Iris | Transitions | Circle burst | 16:9 | 1.2 s | transition | D | 1 |
| `liquid` | Liquid | Transitions | Organic wipe | 16:9 | 1.4 s | transition | D | 2 |
| `blinds` | Blinds | Transitions | Strip slices | 16:9 | 1.0 s | transition | D | 1 |
| `sweep` | Sweep | Transitions | Type transition | 16:9 | 1.2 s | transition | D | 2 |
| `sheen` | Sheen | Logo & Branding | Light sweep | 16:9 | 4 s | in·hold | O | 1 |
| `draw` | Draw | Logo & Branding | Stroke to fill | 16:9 | 4 s | in·hold | O | 2 |
| `shards` | Shards | Logo & Branding | Assemble from fragments | 16:9 | 4 s | in·hold | O | 2 |
| `bounce` | Bounce | Logo & Branding | Playful drop | 16:9 | 4 s | in·hold | O | 1 |
| `resolve` | Resolve | Logo & Branding | Pixel mosaic | 16:9 | 4 s | in·hold | O | 2 |
| `click` | Click | UI / Product Motion | Cursor demo | 16:9 | 6 s | in·hold·out | O | 1 |
| `notify` | Notify | UI / Product Motion | Notification stack | 9:16 | Auto | sequence | — | 2 |
| `scroll` | Scroll | UI / Product Motion | Phone scroll tour | 16:9 | 8 s | in·hold·out | O | 2 |
| `dashboard` | Dashboard | UI / Product Motion | Analytics build | 16:9 | 7 s | in·hold·out | — | 1 |
| `command` | Command | UI / Product Motion | Command bar & AI answer | 16:9 | 7 s | in·hold·out | O | 2 |

---

## Build waves

**Wave 1 — 25 templates** (2–3 per category, so the gallery is complete early). Chosen to grow the engine progressively; the first seven are *reference templates*, each proving one engine subsystem end-to-end:

| Order | Template | Proves |
|---|---|---|
| 1 | Rise | Text engine (HarfBuzz shaping, masks, stagger), timeline sections, energy, all four formats, export |
| 2 | Line | Transparent export, anchors/movable groups, preview backdrop |
| 3 | Sheen | Logo import (SVG/PNG), alpha masks, WebGL2 compositor (blur, bloom) |
| 4 | Layers | Transition structure, cut point, motion blur via temporal sampling |
| 5 | Punch | Sequence structure, auto duration, emphasis markup |
| 6 | Deal | Image slots, procedural Objects, odometer digits, currency formatting |
| 7 | Click | UI Kit, cursor & typing helpers |

Then: Focus · Decode · Broadcast · Capsule · Listicle · Countdown · Sale · Columns · Stack · Quote · Review · Numbers · Cinematic · Episode · Iris · Blinds · Bounce · Dashboard.

**Wave 2 — 25 templates**: Stretch · Echo · Editorial · Signal · Chat · Versus · Callouts · Reveal · Compare · Float · Ring · Zoom · Manifesto · Pattern · Hype · Grid · Departures · Liquid · Sweep · Draw · Shards · Resolve · Notify · Scroll · Command.

---

## Engine capability matrix

Advanced engine capabilities and the templates that depend on them — build the capability before the first template that needs it.

| Capability | Templates |
|---|---|
| Compositor blur / bloom / backdrop blur | Focus, Editorial, Reveal, Sheen, Cinematic, Zoom, Ring, Notify, Command, Quote (out) |
| Temporal motion blur (heavy use) | Rise, Punch, Layers, Iris, Blinds, Sweep, Hype, Shards, Episode, Listicle |
| Variable-axis text (continuous `wdth`/`wght`) | Stretch |
| Outline text / per-glyph transforms | Echo, Decode, Signal, Bounce (tagline), Editorial |
| Odometer digits & number formatting | Listicle, Countdown, Deal, Numbers, Grid, Episode, Review, Versus, Dashboard |
| Sequence builder (auto duration) | Punch, Chat, Listicle, Manifesto, Hype, Notify, Quote |
| Seeded constraint layouts | Pattern, Grid, Stack, Zoom |
| 3D planes (WebGL2 perspective) | Float, Ring, Scroll (3D tilt) |
| SVG import & trim paths | Draw (vector), all logo templates (placeholders), Callouts, Countdown, Click |
| Delaunay shards | Shards |
| Noise paths & particles | Liquid, Countdown (burst), Bounce (burst) |
| UI Kit | Click, Notify, Scroll, Dashboard, Command, Chat, Float (screens) |
| Beat grid | Hype, Punch (optional) |
| Blend modes (difference, additive) | Columns, Cinematic (light leak), Shards (flash) |
| Film finish (grain, weave, letterbox) | Cinematic (and the global *Finish* control) |
