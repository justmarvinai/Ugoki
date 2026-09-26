# Template Library — Foundations

> Everything the 50 launch templates share: how a spec is written, global controls, formats, palettes, fonts, placeholder content and the quality bar. Read this before reading or implementing any category file.

---

## 1. How to read a template spec

Every template in `docs/templates/01-…10-*.md` follows the same structure:

| Field | Meaning |
|---|---|
| **ID** | Globally unique slug, used in URLs (`/editor/rise`), code (`src/templates/<category>/<id>/`) and share links. Never renamed after launch. |
| **Formats** | Supported aspect ratios. The first one listed is the default. |
| **Duration** | Default length and allowed range in seconds. |
| **Structure** | `in · hold · out`, `sequence`, `loop` or `transition` (see §4). |
| **Alpha** | Whether the template can export with a transparent background: `default` (on by default), `optional`, `no`. |
| **Default look** | Font pairing + palette used before the user changes anything. |

Then:

- **Art direction** — what it looks like and why.
- **Choreography** — beat-by-beat timing at *Balanced* energy and default duration. Times are seconds. `stagger 0.08 s` means each successive element starts 0.08 s after the previous one. Ease names (`glide`, `snap`, `exit`, `drift`, `pop`, `swift`, `linear`) and springs are defined in [`../04-motion-language.md`](../04-motion-language.md).
- **Controls** — grouped as **Content · Style · Motion · Layout**. Global controls (§2) are not repeated.
- **Defaults** — the exact copy/content shown before the user edits anything.
- **Looks** — 3 curated preset variants shown as one-click options in the editor.
- **The expensive detail** — the one craft decision that makes it look professional. It is non-negotiable during implementation.
- **Format notes** — how the layout adapts per aspect ratio (only where non-obvious).
- **Engine needs** — engine capabilities the template depends on (maps to [`../06-engine.md`](../06-engine.md)).

`u` is the layout unit: **1u = 1% of the frame's short side** (10.8 px at 1080p). All sizes/distances in specs are in `u` so they scale with resolution and format.

---

## 2. Global controls (every template)

These are provided by the engine/editor, not re-specified per template:

| Control | Group | Values | Notes |
|---|---|---|---|
| Format | Layout | 16:9 · 9:16 · 1:1 · 4:5 (subset per template) | Live re-layout, no content loss. |
| Duration | Motion | Template range | For `in · hold · out`, only the hold stretches — entrances/exits keep their timing. |
| Energy | Motion | Calm · Balanced · Punchy | Macro control over timing, travel, overshoot, blur (see motion language §3). |
| Palette | Style | Template's curated palettes + Brand Light/Dark/Bold | Hover previews live; click commits. |
| Font pairing | Style | Template's recommended pairings (3–6) | |
| Background | Style | Palette color · Transparent (if Alpha ≠ `no`) · Image (where supported) | |
| Finish | Style | Clean · Grain · Soft glow | Global post-processing (subtle by design). |
| Position & scale | Layout | Drag on stage + 9-point anchor + scale slider | Only for groups the template marks `movable`. |
| Seed | Style | Shuffle button | Only shown when a template uses seeded variation. |

Export-only settings (resolution, fps, codec) live in the export sheet, not the inspector.

---

## 3. Formats & safe areas

| Format | 1080p frame | Typical use |
|---|---|---|
| **16:9** Landscape | 1920 × 1080 | YouTube, presentations, video edits |
| **9:16** Vertical | 1080 × 1920 | Reels, TikTok, Shorts, Stories |
| **1:1** Square | 1080 × 1080 | Feed posts, LinkedIn |
| **4:5** Portrait | 1080 × 1350 | Instagram/LinkedIn feed |

Resolutions scale the short side: 720 · 1080 · 1440 · 2160 (4K).

**Safe areas** (shown as optional guides in the editor, used by layouts):

- **Title-safe**: inner 90% (5% margins) — all essential text lives here.
- **Action-safe**: inner 93% (3.5% margins) — nothing important outside.
- **Social UI zone (9:16 / 4:5)**: keep essential content out of the top 12%, bottom 22% and right 12% where platform UI (captions, buttons, profile) overlays the video. Generic guides only — never platform logos.

Templates lay out against these rects, never against raw frame edges (except full-bleed backgrounds and transitions).

---

## 4. Structures

| Structure | Behaviour | Duration control |
|---|---|---|
| `in · hold · out` | Entrance, readable hold with *micro-motion*, exit. Frame 0 and the last frame are clean (empty or complete) so editors can cut on them. | Total duration; hold absorbs the difference. Minimum hold = reading time (motion language §5). |
| `sequence` | A list of beats/items (messages, statements, tips). | **Auto** (fit to content — default) or fixed (beat lengths scale proportionally within limits). |
| `loop` | Seamless: frame N+1 ≡ frame 0. For GIFs, backgrounds, reels. | Multiples of the loop period; optional in/out when loop is off. |
| `transition` | Full-frame overlay with a **cut point** (frame of 100% coverage). | 0.6–2.4 s. Cut point is shown on the timeline and encoded in the export filename. |

---

## 5. Palette library

Every palette has six **roles**. Templates only ever reference roles, never raw colors, so any palette works with any template.

| Role | Used for |
|---|---|
| `bg` | Background |
| `fg` | Primary text & key shapes (≥ 7:1 vs `bg` preferred, never < 4.5:1) |
| `muted` | Secondary text (≥ 4.5:1 vs `bg`) |
| `accent` | Highlights, rules, badges, emphasis (≥ 3:1 vs `bg`) |
| `accent2` | Secondary graphic color (graphic use; may be < 3:1) |
| `surface` | Panels, cards, tiles, bubbles |

Contrast values below were computed (WCAG 2.x relative luminance) during planning.

| Palette | bg | fg | muted | accent | accent2 | surface | fg/bg | muted/bg | accent/bg |
|---|---|---|---|---|---|---|---|---|---|
| **Paper** | `#F5F4F0` | `#0B0B0C` | `#6B6B70` | `#1F38E8` | `#0B0B0C` | `#E9E7E1` | 17.9 | 4.8 | 6.8 |
| **Ink** | `#0B0B0C` | `#F5F4F0` | `#8E8E93` | `#FFD400` | `#F5F4F0` | `#1C1C1F` | 17.9 | 6.0 | 13.7 |
| **Midnight** | `#070B1F` | `#EEF1FF` | `#8A93B8` | `#8FA6FF` | `#FFB199` | `#141A36` | 17.3 | 6.5 | 8.4 |
| **Graphite** | `#121314` | `#ECEDEE` | `#7D8084` | `#3DDC97` | `#ECEDEE` | `#1D1F21` | 15.9 | 4.7 | 10.5 |
| **Cobalt** | `#1F38E8` | `#FFFFFF` | `#D3DAFF` | `#FFD23F` | `#0B0B0C` | `#1A2FC4` | 7.5 | 5.5 | 5.2 |
| **Acid** | `#D4FF3A` | `#0B0B0C` | `#4A5716` | `#0B0B0C` | `#1F38E8` | `#C2EE26` | 17.0 | 6.8 | 17.0 |
| **Tangerine** | `#FF6A1A` | `#120800` | `#4A1C02` | `#1B1464` | `#FFFFFF` | `#FF8440` | 6.9 | 5.0 | 5.5 |
| **Blush** | `#FFD8CF` | `#2A0F0A` | `#7A4A40` | `#D93A17` | `#2A0F0A` | `#FFC6B9` | 13.6 | 5.5 | 3.5 |
| **Forest** | `#0F2A1D` | `#EAF4E4` | `#8FB09C` | `#B7F36B` | `#EAF4E4` | `#173726` | 13.6 | 6.5 | 11.7 |
| **Sand** | `#EDE4D3` | `#2A2118` | `#6E604E` | `#B84E25` | `#2F5D50` | `#E2D6BF` | 12.5 | 4.8 | 4.0 |
| **Swiss** | `#F2F0EB` | `#111111` | `#666666` | `#E3241B` | `#111111` | `#E4E1DA` | 16.6 | 5.0 | 4.1 |
| **Bauhaus** | `#F3EEE3` | `#151515` | `#66625B` | `#E0301E` | `#1F4FB8` | `#E7E0D0` | 15.8 | 5.2 | 3.9 |
| **Candy** | `#FF8FB8` | `#1C0710` | `#6B2340` | `#2A12B8` | `#FFF15C` | `#FF7AA8` | 9.1 | 5.1 | 5.3 |
| **Hazard** | `#FFD60A` | `#0B0B0C` | `#4F4200` | `#0B0B0C` | `#E3241B` | `#F5C800` | 13.9 | 7.0 | 13.9 |
| **Amber** | `#0A0A0A` | `#FFB000` | `#A87800` | `#FFB000` | `#F5F4F0` | `#161616` | 10.8 | 5.1 | 10.8 |
| **Film** | `#0C0B0A` | `#F1E9DC` | `#8C8273` | `#E9B872` | `#F1E9DC` | `#1A1816` | 16.3 | 5.2 | 10.8 |
| **Newsroom** | `#0E1116` | `#FFFFFF` | `#A5ACB8` | `#E11D2E` | `#FFFFFF` | `#151A22` | 18.9 | 8.3 | 4.0 |
| **Lilac** | `#DCD3FF` | `#160F33` | `#4F4780` | `#5B2EFF` | `#160F33` | `#CFC3FF` | 12.9 | 5.8 | 4.5 |
| **Mint** | `#DDF5EA` | `#0B2A1F` | `#446C5B` | `#0B8F58` | `#0B2A1F` | `#CBEEDD` | 13.4 | 5.2 | 3.6 |
| **Mono Light** | `#FFFFFF` | `#000000` | `#6E6E6E` | `#000000` | `#000000` | `#F2F2F2` | 21.0 | 5.1 | 21.0 |
| **Mono Dark** | `#000000` | `#FFFFFF` | `#8A8A8A` | `#FFFFFF` | `#FFFFFF` | `#151515` | 21.0 | 6.1 | 21.0 |

Some templates need a third graphic color (e.g. *Pattern*, *Hype*); they use `accent3`, which defaults to `surface` unless the palette defines it. **Bauhaus** defines `accent3 = #F2B705`, **Candy** defines `accent3 = #FFFFFF`.

### Brand palettes (derived)

The user can enter **one brand color**. Ugoki derives three palettes in OKLCH (perceptually uniform), then verifies contrast and nudges lightness until the role minimums above pass:

| Palette | bg | fg | accent | surface |
|---|---|---|---|---|
| **Brand Light** | L 0.97, chroma ≤ 0.02, brand hue | L 0.18, low chroma, brand hue | brand color (darkened if < 3:1) | L 0.93 |
| **Brand Dark** | L 0.16, chroma ≤ 0.03, brand hue | L 0.96 | brand color (lightened if < 3:1) | L 0.22 |
| **Brand Bold** | brand color | white or near-black (whichever contrasts more) | `fg` | brand color ± 0.06 L |

`muted` = `fg` mixed 45% toward `bg` (then checked); `accent2` = brand hue + 150° at reduced chroma. A "Keep my exact colors" toggle disables automatic nudging.

---

## 6. Font library & pairings

All families are **SIL Open Font License 1.1** (verified during planning against the font sources — see [`../05-architecture.md`](../05-architecture.md) §10), **self-hosted**, subsetted to Latin + Latin Extended (German, French, Nordic, Polish, Turkish… work) and loaded on demand. Template text is shaped and drawn by the engine's HarfBuzz text engine, so every browser renders identical glyphs and variable axes can be animated continuously. Fonts from Fontshare's ITF Free Font License (Satoshi, etc.) are **excluded**: that license forbids modification (subsetting) and "making available" font data, and is terminable.

| Family | Style | Variable axes (ranges) | Planned use |
|---|---|---|---|
| Mona Sans v2 | Neo-grotesk superfamily | `wdth` 75–125 · `wght` 200–900 · `opsz` · `ital` (GitHub build; Google Fonts build lacks `opsz`) | House style, *Stretch*; also Ugoki's UI font (see design system) |
| Hubot Sans | Technical grotesk | `wdth` 75–125 · `wght` 200–900 · `ital` | `technical` |
| Inter 4.1 | UI sans | `opsz` 14–32 · `wght` 100–900 · `ital` | UI kit realism, text roles |
| Instrument Sans | Refined sans | `wdth` 75–100 · `wght` 400–700 · `ital` | Text roles |
| Instrument Serif | Condensed editorial serif | static (Regular, Italic) | `editorial` |
| Fraunces | Soft, wonky old-style serif | `opsz` 9–144 · `wght` 100–900 · `SOFT` 0–100 · `WONK` 0–1 | `soft` |
| DM Serif Display | High-contrast serif | static (Regular, Italic) | `classic` |
| Anton | Condensed impact | static | `poster` |
| Archivo | Flexible grotesk | `wdth` 62–125 · `wght` 100–900 · `ital` | `poster`/`sport` text, *Stretch* alternative |
| Big Shoulders | Condensed poster/industrial | `opsz` 10–72 · `wght` 100–900 | `sport` |
| Unbounded | Wide geometric | `wght` 200–900 | `wide` |
| Syne | Art-school display | `wght` 400–800 | `studio` |
| Bricolage Grotesque | Quirky ink-trap grotesk | `opsz` 12–96 · `wdth` 75–100 · `wght` 200–800 | `quirky` |
| Anybody | Extreme widths | `wdth` 50–150 · `wght` 100–900 · `ital` | *Stretch* alternative |
| JetBrains Mono | Monospace | `wght` 100–800 · `ital` | `technical`, `mono` |

**Pairings** (display + text) are what users pick — never raw families:

| Pairing | Display | Text | Personality |
|---|---|---|---|
| `grotesk` | Mona Sans (wdth 100–112, wght 700–800) | Mona Sans | The house style: confident, neutral, bold |
| `editorial` | Instrument Serif | Inter | Magazine, documentary, luxury |
| `poster` | Anton | Archivo | Loud, condensed, social |
| `technical` | Hubot Sans | JetBrains Mono | Tech, product, data |
| `soft` | Fraunces (SOFT 100) | Instrument Sans | Warm, friendly, lifestyle |
| `wide` | Unbounded | Inter | Playful, modern, youth |
| `classic` | DM Serif Display | Inter | Timeless, corporate-elegant |
| `sport` | Big Shoulders (display opsz) | Archivo | Athletic, industrial, news |
| `studio` | Syne | Instrument Sans | Creative studio, art |
| `quirky` | Bricolage Grotesque | Bricolage Grotesque | Indie, characterful |
| `mono` | JetBrains Mono | JetBrains Mono | Terminal, code, minimal |

Custom font upload (local-only) is planned post-launch; see ROADMAP.

---

## 7. Placeholder content system

Templates must look finished before the user changes anything — **without stock photos**. All default imagery is original and generated at runtime by the engine (zero bandwidth, deterministic, art-directed).

### Fictional brands (vector logos authored as SVG path data)

| Brand | Kind | Mark | Used by |
|---|---|---|---|
| **Halden** | Design studio | Three stacked horizon lines inside a circle | Brand, logo, openers |
| **Nova** | Tech product | Four-point star with rounded inner corners | Product, UI, logo |
| **Aero** | Consumer goods | Geometric lowercase "a" monogram | Product & ads |

Vector (path) logos are essential: *Draw* strokes them on, *Shards* cuts them, *Sheen* masks light to them.

### Fictional people

Diverse, fictional, and deliberately including diacritics to prove typography: **Aiko Tanaka**, **Jordan Ellis**, **Maya Chen**, **Élodie Marchand**, **Kai Morgan**, **Sam Rivera**, **Noa Lindqvist**, **Amara Okafor**, **Luca Bianchi**, **Priya Raman**. Avatars are generated (initials on palette color, or abstract portrait silhouettes) — never photos of real faces.

### Procedural imagery sets

| Set | What it is | Used by |
|---|---|---|
| **Artworks** | Seeded generative posters: Bauhaus shapes, gradient fields, type fragments, grain | Showcase (Columns, Ring), Hype |
| **Scenes** | Stylized "photographs": layered hills, sun, sea, sky gradients, film grain; day/dusk/night variants | Stack, Zoom, Compare, Cinematic background |
| **Objects** | Studio "product renders" drawn with gradients, highlights and contact shadows: bottle, can, speaker, phone, watch | Product & Ads |
| **Screens** | App screens rendered by the Ugoki UI kit (finance home, feed, analytics, chat, settings) | Float, Scroll, UI templates |
| **Footage backdrop** | A softly moving, blurred, footage-like backdrop used *only in preview* behind transparent templates | Lower thirds, transitions, logos |

Users can replace any of these with their own images; the preview backdrop can also be replaced by a frame from the user's own video ("Preview on my footage") — never exported unless the user chooses *Bake background*.

### Copy rules for defaults

- Short, confident, specific. Sentence case unless the style is caps-based.
- Never lorem ipsum. Never "Your Text Here". Defaults must read like a real, well-written example.
- No real people, brands, trademarks or platform names in defaults.
- No emoji in defaults (system emoji fonts differ by OS and would break export determinism); user text may contain emoji.
- Numbers/prices formatted with `Intl` for the user's locale (defaults use EUR and English formatting).

---

## 8. Looks (preset variants)

Each template ships **3 Looks** = palette + font pairing + (optionally) a few template control values. Looks are the fastest path to "different but still great": the gallery can show them as alternates and the editor shows them as the first row of the Style group. A Look never changes the user's content.

---

## 9. The quality bar — a template is done when…

1. **Zero-effort excellence**: the default render in every supported format looks like a designer made it for that format.
2. **Robust to content**: 1 word or the max length, short or long names, diacritics (Ä, É, Ø, Ł), numbers — auto-fit, balanced line breaks, no clipping, no widows.
3. **Every palette works**, including Brand Light/Dark/Bold for 5 random brand colors, and contrast minimums hold.
4. **Every energy level** looks intentional (Calm is not "slow Balanced"; Punchy is not "fast Balanced").
5. **Duration**: at min and max duration, the choreography still reads; the hold is never dead (micro-motion).
6. **Clean edit points**: frame 0 and last frame are clean; loops are seamless; transitions hit 100% coverage at the marked cut frame.
7. **Determinism**: same inputs → identical pixels in preview and export, at every fps (golden-frame tests pass).
8. **Performance**: preview ≥ 60 fps at 1080p-equivalent on the reference desktop (2560 × 1440 display), with the template's effects on (see architecture budgets).
9. **Transparency**: when exported with alpha, nothing depends on a background that isn't there (no dark fringes, no invisible text).
10. **The expensive detail** from the spec is implemented and visible.
