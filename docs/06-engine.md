# 06 — The Ugoki Engine

> A small, deterministic motion-graphics engine: templates are **pure functions of (props, format, time)**, drawn with Canvas 2D, finished by a WebGL2 compositor, running in Web Workers. The same code path renders the gallery tile, the editor stage and the exported file.

TypeScript snippets in this document are **contract sketches** for implementation, not final code.

---

## 1. Goals

1. **Deterministic** — same inputs → same pixels, in preview, export and every browser.
2. **Random access** — any `t` can be rendered directly (scrubbing, motion blur sub-frames, parallel export) with no simulation state.
3. **Pro quality** — analytic anti-aliasing for type and hairlines, true motion blur, GPU effects, HarfBuzz typography.
4. **Fast** — ≤ 8 ms per 1080p-equivalent frame on the reference desktop (owner's PC, 2560 × 1440 display); work that doesn't depend on `t` happens once in `build`.
5. **Environment-agnostic** — no DOM; runs in a dedicated worker with OffscreenCanvas (main-thread fallback for debugging).
6. **Simple to author** — a template is one file of readable choreography using shared helpers.

---

## 2. Pipeline

```
 props + format + duration + energy + palette + pairing + assets
                │
                ▼
   ┌─────────────────────────┐   once per change (not per frame)
   │ build(ctx) → Scene      │   text shaping & layout, image fitting,
   └─────────────────────────┘   seeded layouts, paths, caches
                │
                ▼  for each frame t (× N sub-frames for motion blur)
   ┌─────────────────────────┐
   │ scene.render({ t, g })  │   pure draw calls via the Draw API
   └─────────────────────────┘   (Canvas 2D on OffscreenCanvas segments)
                │
                ▼
   ┌─────────────────────────┐
   │ Compositor (WebGL2)     │   layer FX (blur, bloom, masks, blend, 3D planes)
   │                         │   → motion-blur accumulation (float)
   │                         │   → finish (grain, glow) → output
   └─────────────────────────┘
                │
       ┌────────┴─────────┐
       ▼                  ▼
  stage / tile       export frame (VideoFrame / PNG / GIF)
```

**Fast path**: a frame with no FX, no masks-by-matte, no 3D and no motion blur is drawn straight to the output canvas with Canvas 2D — no GPU round-trip.

---

## 3. Runtime topology

| Worker | Owns | Notes |
|---|---|---|
| **Render worker** (one per page) | The stage canvas (editor) or all tile canvases (gallery), one WebGL2 context | Tiles use `bitmaprenderer` contexts fed with `ImageBitmap`s from the single shared renderer — browsers cap live WebGL contexts (~16), so we never create one per tile |
| **Export worker** (per export) | An OffscreenCanvas at export resolution, encoders | Runs regardless of tab visibility; holds a Web Lock (see [`07-export.md`](07-export.md)) |

**Clock**: the render worker drives playback with `requestAnimationFrame` where the worker has it (Chromium verified in Phase 1; Firefox/WebKit in CI; Safari via the owner's device check), otherwise a 16 ms timer. Display frames closer than 10 ms are skipped, so 120/144 Hz screens render ~60–72 fps.

**Views** (ADR-022): the worker hosts any number of *views* — a canvas transferred from the page (the stage, the Lab's formats, later gallery tiles) — each with its own template, state and transport. Playback messages take a list of views so several play in lockstep. A hidden 1 × 1 *probe* view loads templates and sanitizes raw states.

**Pixels come from the worker**: never read a transferred canvas back on the main thread (`drawImage`, `createImageBitmap`, `toDataURL`). Firefox then blocks the main thread until the worker answers (`gfx.offscreencanvas.snapshot-timeout-ms`, 10 s), and right after the worker starts or resizes a canvas the worker can itself be waiting on the main thread — CI saw the page freeze for the full 10 s. Firefox's own snapshot paths (printing, screenshots) do the same, but on-screen display doesn't. Stills, thumbnails and exports ask the worker (`snapshot`).

**Protocol** (typed, `src/engine/host/protocol.ts`; the client is `RenderClient`, the worker side `serveRenderWorker`):

| Message | Direction | Payload |
|---|---|---|
| `attach` / `detach` | main → worker | View id, OffscreenCanvas (transferred), CSS size × DPR, `interactive` (report editor regions) |
| `resize` | main → worker | CSS size × DPR |
| `load` | main → worker | `templateId` (+ a raw state to sanitize/migrate, or a Look index) — the worker dynamic-imports the template |
| `setState` | main → worker | Design state (props, format, duration, energy, palette, pairing, transparent, finish, seed, layout) — sanitized again in the worker |
| `play` / `pause` / `seek` / `setLoop` / `setQuality` | main → worker | Playback control for a list of views; `seek` with `scrub` renders at the adaptive scale until 120 ms of stillness. `play`/`pause`/`seek` carry a sequence number (ADR-031) |
| `setBackdrop` | main → worker | What shows behind transparent designs in these views: none, procedural footage, Scene A → B, a color, or the user's still (ADR-029) |
| `setAsset` / `dropAsset` | main → worker | A user's logo/image by SHA-256: vector artwork, or a transferred bitmap with its ink bounds (§8) |
| `snapshot` | main → worker | Renders a PNG still at a short-side resolution |
| `probe` | main → worker | Capability probe (see `runtime/capabilities.ts`) |
| `loaded` | worker → main | `TemplateDescriptor` (controls, Looks, formats, palettes, available pairings) + sanitized state |
| `built` | worker → main | Duration, timeline sections, readability warnings, a transition's cut point, image controls still drawn with their placeholder, build ms |
| `frame` | worker → main | `t`, playing, the latest transport sequence applied, recording ms, render scale (timecode + cost meter). A playhead that follows frames skips those rendered before its last command (`RenderClient.isCurrent`) |
| `regions` | worker → main | Movable/editable regions for the current frame (≤ 10 Hz while playing) — see §11 |
| `snapshot` / `capabilities` | worker → main | PNG blob / probe results |
| `error` | worker → main | View, phase (`load` · `build` · `render`), message |

State changes rebuild the Scene **off to the side** (at most once per frame per view) and swap it in atomically, so the stage never shows a half-built frame; a build that throws keeps the last good scene. Asset transfer (`setAsset`) arrives with image controls in Phase 2.

---

## 4. Template contract

```ts
export default defineTemplate({
  id: 'rise',
  version: 1,                                   // bump + migrate() when controls change
  meta: { name: 'Rise', tagline: 'Masked line reveal', category: 'text-titles',
          tags: ['title', 'chapter', 'editorial'], useCases: ['YouTube', 'keynote'] },
  formats: ['16:9', '9:16', '1:1', '4:5'],      // first = default
  structure: 'in-hold-out',                     // | 'sequence' | 'loop' | 'transition'
  duration: { default: 5, min: 3, max: 12 },    // or default: 'auto' for sequences
  alpha: 'optional',                            // 'default' | 'optional' | 'none'
  poster: 2.2,                                  // hero frame (seconds at default duration)
  palettes: ['paper', 'ink', 'midnight', 'swiss', 'cobalt'],
  pairings: ['grotesk', 'editorial', 'classic', 'sport'],
  controls: {
    headline: c.text({ label: 'Headline', group: 'content', default: 'Where it\nall began',
                       multiline: true, maxLength: 60, maxLines: 3, primary: true }),
    eyebrow:  c.text({ label: 'Eyebrow', group: 'content', default: 'Chapter 01', maxLength: 24, optional: true }),
    align:    c.choice({ label: 'Alignment', group: 'style', default: 'left',
                         options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }] }),
    rule:     c.toggle({ label: 'Accent rule', group: 'style', default: true }),
    exit:     c.choice({ label: 'Exit', group: 'motion', default: 'up', options: [/* up, down, fade */] }),
  },
  looks: [ /* 3 × { name, palette, pairing, values? } */ ],
  timing: ({ energy }) => ({ in: 1.15 * energy.time, out: 0.6 * energy.time }),
  build: (ctx) => {
    // heavy, t-independent work: shaping, layout, masks, paths
    const lockup = layoutRise(ctx);            // uses ctx.text, ctx.frame, ctx.props
    return {
      render: ({ t, g, tl }) => {
        g.fill(ctx.palette.bg);
        g.movable('lockup', lockup.bounds, (g) => {
          lockup.lines.forEach((line, i) => {
            const p = tl.p(t, 'in', { delay: 0.25 + i * ctx.stagger(0.08), dur: 0.9 }, 'glide');
            g.clip(line.mask, () => g.text(line.run, { y: (1 - p) * line.mask.h * 1.05, skewY: (1 - p) * 6 }));
          });
        });
      },
    };
  },
});
```

### Build context

| Field | Provides |
|---|---|
| `props` | Validated control values with defaults applied |
| `frame` | Design size (short side = 1080 units, ADR-021), `u` (1% of short side = 10.8), `format`, `vertical`, center, safe-area rects (`safe.title`, `safe.action`, `safe.social`) |
| `palette` | `roles` (`bg`, `fg`, `muted`, `accent`, `accent2`, `accent3`, `surface`) as color objects, `dark` |
| `pairing` | `display` and `text` font roles (font id, italic font, weight, width, tracking, line height, features) |
| `energy` | Profile: `time`, `stagger`, `travel`, `overshoot`, `enter`/`move` curves, `spring`, `shutter`, `blur` |
| `timeline` | The resolved timeline (§5) — also passed to `render` as `tl` |
| `stagger(gap)` | A gap for `in`/`out` windows: `gap × energy.stagger ÷ energy.time`, so after `tl.p` scales windows by time the real gap is `gap × energy.stagger` |
| `travel(distance)` | `distance × energy.travel` |
| `text` | Text engine (§7): `layout`, `line`, `face`, `hasFont` |
| `transparent` | The background will be left transparent (alpha export/preview) |
| `seed`, `rng(key)` | Template seed (user seed mixed with the template id) and a seeded RNG stream per element key |
| `graphic(key)` | The artwork of an image/logo control: the user's file, or the placeholder (§8) |
| `focal(key)` | The focal point the user set for an image control (0..1, center by default) — pass it to `g.graphic(…, { fit: 'cover', focal })` |

UI templates create the UI Kit themselves in `build` (`createUiKit`, §6).

### Render context

| Field | Provides |
|---|---|
| `t` | Time in seconds |
| `g` | Draw API (§6) |
| `tl` | Timeline helpers bound to this template's resolved sections (§5) |

Rules: `render` is **pure and synchronous** — no allocation-heavy work, no async, no I/O, no global state, no `Math.random`, no clocks.

---

## 5. Timeline & motion helpers

| Helper | Signature (sketch) | Notes |
|---|---|---|
| `tl.sections` | `{ in: [s, e], hold: [s, e], out: [s, e] }` | Resolved from `timing()`, energy and duration |
| `tl.local(t, section)` | seconds since section start | Negative before, > length after |
| `tl.p(t, section, { delay, dur }, ease?)` | eased 0..1 | Clamped; `ease` by name |
| `tween(t, { from, to, start, dur, ease })` | number/vec/color | Colors interpolate in OKLCH |
| `keys(t, [[time, value, ease?], …])` | piecewise | Internal choreography only — users never see keyframes |
| `spring(t, preset \| { stiffness, damping, mass }, { from, to, velocity })` | closed-form | Random access, exact |
| `stagger(i, n, { each, pattern, seed })` | delay for item *i* | Patterns: forward, reverse, center-out, edges-in, random, accelerating |
| `wave(t, i, { period, amplitude, phase })` | traveling sine | Breathing, accordion, width waves |
| `stepped(t, fps)` | quantized time | Grain, scramble, flaps, pixel steps |
| `sequence(items, { pace, gap, fit })` · `beatLength(text, pace)` | beat list + total + `at(t)` | Auto duration for sequences; `fit` scales beats to a fixed duration within 0.3–1.2 s (implemented in Phase 1) |
| `beats(bpm)` | beat grid | Hype, Punch |
| `cut(t)` | coverage helper | Transitions: guarantees the ≥ 50 ms full-coverage plateau |
| `logZoom`, `inertialScroll`, `gravityBounce`, `minimumJerk`, `areaEase` | special curves | See motion language §3 |
| `countTo(t, value, format)` | formatted number string | Odometer & counters with `Intl.NumberFormat` |

Easing names map 1:1 to [`04-motion-language.md`](04-motion-language.md) §3.

**Transitions** keep the length the user sets: `timing()` returns `{ in: 0, out: 0, cut }` with the cut point as a share of the duration (default ½); `in` runs from 0 to the cut and `out` from the cut to the end, and `tl.p` windows in them are absolute seconds. Energy changes a transition's character — curves, gaps, spread, shutter — never its length (`tl.cut` is exposed; the transport marks it and export names it).

---

## 6. Draw API

A thin, allocation-conscious layer over Canvas 2D that hands effects to the compositor. Implemented (`draw/canvas-draw.ts`): `fill`, `group`, `rect`, `roundRect`, `circle`, `line`, `path`, `text`, `image`, `graphic`, `clip`, `layer`, `mask`, `fx`, `movable`, `editable`. Planned: `ellipse`, `polygon`, `plane3d`, `dirBlur`, `rgbSplit`, conic gradients, patterns, `g.cache`. `group` opacity still multiplies into each primitive; `layer` isolates (ADR-023). Circles start at 12 o'clock so trim paths draw on from the top; gradients get OKLab-interpolated intermediate stops (premultiplied, so fades to transparent never darken). The drawer keeps its own transform stack and sets one transform per primitive — per-glyph animation is one `setTransform` and one cached-path fill per glyph; static text draws as one cached path per line.

| Call | Purpose |
|---|---|
| `fill(color)` | Full-frame background |
| `group({ x, y, scale, rotate, skewX, skewY, origin, opacity, blend }, fn)` | Transform/opacity/blend scope |
| `rect`, `roundRect`, `circle`, `ellipse`, `line`, `polygon`, `path(pathLike, paint)` | Shapes; `paint = { fill?, stroke?: { color, width, cap, join, dash?, trim?: [a, b] } }` |
| `text(block \| line, opts)` | Draws shaped text at `opts.x/y`; `opts.glyph?: (glyph, line) => GlyphTransform \| null` for per-glyph motion (null hides the glyph; spaces are skipped); `opts.outline?` for stroke text (outline-only unless `fill` is given) |
| `image(asset, dest, { fit, focal, radius, opacity, adjust })` | Cover/contain with focal point; `adjust` = saturation/contrast/brightness (done in compositor when animated) |
| `graphic(graphic, dest, { fit, focal, by, tint, current, opacity })` | A logo/image from an image control: vector artwork (fitted by its ink, `currentColor` → `current`, `tint` for mono/accent modes) or a raster |
| `clip(shape, fn)` | Hard clip (line masks, shape masks) |
| `layer({ opacity, blend, bounds }, fn)` | Isolated layer: `fn` drawn apart, then composited as one image |
| `mask(matteFn, contentFn, { mode: 'alpha' \| 'luma', invert, bounds })` | Track matte |
| `fx({ blur, bloom, shadow, opacity, blend, bounds }, fn)` | Renders `fn` into a layer and applies effects (σ in `u`); planned: `dirBlur`, `rgbSplit` |
| `plane3d({ transform: Mat4 \| {rx, ry, rz, x, y, z}, size, perspective }, fn)` | Draws `fn` into a texture placed on a 3D plane |
| `movable(groupId, bounds, fn)` | Applies the user's layout offset/scale for this group and registers it for dragging |
| `editable(controlKey, bounds)` | Registers a clickable region that focuses a control |

Gradients (linear, radial, conic) and patterns are paints. Colors are OKLCH-aware objects; conversion to canvas strings is cached.

**Layers**: `layer`, `mask` and `fx` draw into pooled offscreen canvases (nesting up to 8), processed by the compositor and composited back in drawing order. **Bounds** (ADR-030): pass `bounds` — where the content lies, in design units in the current coordinate space — and the layer only covers that part of the output (plus the effects' reach: 3σ of blur/bloom), within its parent; content outside is cut off. Always bound effects on small elements: a frame-sized soft shadow behind a lower third cost 38 ms at 1080p, a bounded one 2 ms.

---

### UI Kit v1 (`src/engine/ui`, exported from `@/engine`)

UI-motion templates build realistic, unbranded interfaces with the UI Kit. In `build`, a template creates it with `createUiKit({ text: ctx.text, palette: ctx.palette, mode: 'light' | 'dark', unit })`, where `unit` is how many design units one UI px is: the template picks it so its UI fills the composition. Everything is then specified in UI px, like a real design system.

- **Theme** (`ui.theme`): Light/Dark neutral tokens (canvas, surface, raised, sunken, border, text, muted, subtle, gridline) with a hint of the accent's hue. `accent` is the palette color that holds ≥ 3:1 on the surface; `onAccent`, `accentInk` and `accentSoft` derive from it, plus contrast-checked success/danger tints. Radii are `UI_RADIUS`; shadows are `ELEVATIONS` 1–3.
- **Shadows** (`BoxShadow`): Gaussian box shadows with CSS semantics, painted only outside the element as gradient slices built once — no blur, no layer, no Canvas `filter`.
- **Components**, laid out once and drawn per frame from state values: `card`; `field` (label, typed states, placeholder, focus ring, caret, scrolls when long); `button` (hover, press, ripple, and a pill → circle → pill morph that keeps center and radius continuous, a spinner phased to close where the check starts, a check drawn on); `toast`, `avatar` (initials), `row`, `tooltip`. `ui.text()` shrinks to fit, then truncates with "…".
- **Charts**: `lineChart` (Steffen monotone cubic — never overshoots the data — with an area and a `PathSampler` for draw heads and trim), `barChart` (grows from a shared baseline), `donut` (sweeps from 12 o'clock), `valueAxis`/`categoryAxis` (tabular labels, `niceTicks`).
- **Cursor**: vector `drawCursor` (arrow or hand; crisp outline, soft shadow, press dip). `CursorPath` is a builder — `.move(to, { dur, bow, overshoot, correct })`, `.wait()`, `.until()`, `.click()` — with minimum-jerk timing by arc length, overshoot-and-correct and random access `at(t)`.
- **Typing**: `typedText` / `typedFigure` (money formatted live: €2 → €25 → €250.00), `typingSchedule(keys, ctx.rng(key), { cps, fit })` (a seeded human rhythm), `typedCount`, and `caretOpacity` (solid while typing, blinks when idle).
- UI text is set in Inter (`UI_FONT`): templates using the kit declare `fonts: [UI_FONT]`, so preview and export load it whatever the pairing (§7).
- **App screens** (`createScreen({ text, palette, mode, kind, rect, radius?, tall?, chrome?, time? })`): procedural, unbranded phone screens — `finance`, `feed`, `analytics`, `chat`, `settings` — laid out once at a phone's 390 UI px width and drawn into any rect; `tall` pages scroll (`draw(g, { scroll })`, rubber-banding past the ends) and name their interesting spots (`anchors`, `scrollTo(anchor)`, `toFrame(x, y, scroll)`). They are the *Screens* placeholder set (foundations §7).
- **Phone** (`createPhone({ screen, finish, bare? })`): a generic device around a display rect — draw `back(g)`, the screen clipped to `display`, then `front(g)`; finishes graphite, silver, sand; `bare` is a frameless screen with its shadow.
- **Notifications and lock clock**: `ui.notification({ app, title, message, time, icon })` (card content at the origin, so a stack can move and scale it; icons are glyph or initials tiles in `iconColors`, or a logo) and `ui.lockClock({ time, date })`.
- **Frosted glass** (no Canvas `filter`): the template's own background drawn again inside the panel under `g.fx({ blur, adjust })`, with a tint, lit rim and hairline — `FrostedPanel` (fixed-size moving panels), `drawGlass` (a rect changing per frame), `frostBackdrop` (one blur for several panels).
- **Motion**: `InertialScroll` (flicks, an exponential glide landing with zero velocity, rubber band; random access), `SpringChain` (coupled springs tabulated in build — link n follows link n − 1), `springRange`/`StretchTrack` (a range whose leading edge springs stiffer, so it stretches toward its travel).
- **Streaming text** (`ui.streamingText(text, role, { rng })`): model-like tokens on a seeded uneven schedule, laid out at the final length so nothing reflows; `drawCaret` breathes, holds and blinks.
- **Gotcha**: the drawer caches `PathData` and gradients by object identity — a path or gradient that changes per frame must be a new object each frame.

## 7. Text engine (HarfBuzz)

Why not `fillText`? Safari lacks `fontStretch`/`fontKerning`, `letterSpacing` needs Safari 18.4+, and per-glyph animation with native text either breaks kerning or varies across browsers. HarfBuzz gives identical shaping everywhere, real OpenType features and continuous variable axes.

**Pipeline**
1. **Load**: the font registry fetches subsetted TTF bytes → `hb.Face` → `hb.Font` per variation instance. Metrics from `OS/2`/`hhea`: ascender, descender, cap height, x-height, line gap. A design loads `designFonts(template, state)` — its pairing's fonts plus the template's own `fonts` (e.g. the UI Kit's Inter) — before its scene is built, in preview and export alike.
2. **Segment**: `Intl.Segmenter` (graphemes, words); parse emphasis markup (`*word*`) into styled spans; apply case transforms.
3. **Shape**: HarfBuzz with features (`kern`, `liga`, `calt`, optional `tnum`, `ss0x`) → glyph ids, clusters, advances, offsets. Odometers (`createOdometer`) center the font's default figures in slots as wide as the widest digit, so digits never shift while rolling; `figures: 'tabular'` opts into `tnum`, which in some fonts swaps in a slashed zero or footed one (Mona Sans).
4. **Break lines**: word-boundary candidates; user newlines are hard breaks; **balanced** breaking (minimize the variance of line widths, avoid a single-word last line, prefer breaks after punctuation).
5. **Fit**: binary-search font size within `[min, max]` to satisfy `maxWidth` and `maxLines`; report overflow to the inspector.
6. **Layout result** (`text/types.ts`): `TextBlock { lines[{ glyphs[{ id, face, x, y, advance, size, text, index, word, line, emphasis, ink, fallback }], words, x, baseline, width, ink, mask }], size, width, height, ink, overflow, capHeight }`. Vertical metrics are optical: the block's top is the first line's cap height and `height` ends at the last baseline. Left/right-aligned lines get optical margins (ink, not side bearings, touches the edge). Line **masks** share one height for the whole block — the block's ink extremes (at least cap height) plus 8% of the size — so lines rise in unison and descenders never clip at rest.
7. **Draw**: each glyph's outline (`hb.Font.drawGlyph` → `Path2D`, cached by `font:glyph:axes`) is filled/stroked with its transform. Static runs can be cached as a single `Path2D`.

**Variable axes**: `hb.Font.setVariations({ wght, wdth, opsz, … })`; axis values are clamped and quantized (`wght` 1, `wdth` 0.25, `opsz` 1) so animated axes share cached instances and outlines. `opsz: 'auto'` maps the rendered size to the optical-size axis (`opsz = size × 0.6`, ADR-021). A **width solver** (binary search on `wdth`) makes a line hit an exact target width (*Stretch*, Phase 3).

**Fallback**: characters the font can't render (glyph 0) — emoji, CJK typed into a Latin font — fall back to native `fillText` with a system font stack at the same size, laid out in the same line. These runs can differ slightly between operating systems (documented in the editor tooltip).

**Performance**: shaping and layout happen in `build`; per frame we only transform and fill cached paths. Text for gallery personalization is re-shaped per keystroke (debounced).

---

## 8. Assets & placeholders

- **Image controls** (`c.image({ accept: 'logo' | 'scene' | 'artwork' | 'object' | 'portrait', default })`) store an `AssetRef`: a built-in placeholder, or the SHA-256 of the user's file (ADR-028), plus an optional focal point (`focal: { x, y }`, 0..1) set in the editor. `ctx.graphic(key)` returns the artwork — the user's file, or the placeholder while the file isn't in the worker yet (`built.missingAssets`); the worker rebuilds when it arrives. `ctx.focal(key)` returns the focal point (center by default).
- **Import** (main thread, `src/features/assets/import-file.ts`): check size (≤ 25 MB) and sniff the format from the bytes (SVG, PNG, JPEG, WebP) → hash (SHA-256) → decode. Rasters go through `createImageBitmap` (≤ 4096 px long side), their ink bounds found on a 512 px probe, and are transferred to the worker (`setAsset`); drafts store the bytes in IndexedDB (Phase 2 drafts).
- **SVG import** (`assets/svg.ts`, DOM-free so it also runs in workers): a limited XML parser (no DTD, no entity expansion, size/depth limits) → paths, basic shapes, `use`/`symbol`, transforms, presentation attributes and a CSS subset, `currentColor`, fill rules and opacity → engine paths, fitted by their ink. SVGs using what it doesn't support (gradients, filters, text, masks, embedded images) are sanitized (`sanitizeSvg`: whitelisted elements and attributes, no scripts, handlers or external references) and rasterized on the main thread at 2048 px; vector-only effects then use their raster variants.
- **Fit**: `cover`/`contain` with a focal point; logos get color modes (original · mono · accent) through `graphic`'s `tint`.
- **Placeholders**: fictional logos Halden, Nova and Aero (generated SVG, `currentColor`); preview backdrops — procedural footage and *Scene A / Scene B* (`runtime/backdrop.ts`, ADR-029); avatars are initials (`initials(name)`) or portraits; *Screens* (UI Kit renders) arrive with the templates that use them (Float, Scroll).
- **Procedural imagery** (`assets/procedural.ts`, painters in `assets/procedural/`): 23 seeded, art-directed images, painted with Canvas 2D into an OffscreenCanvas the first time they're used, then cached per worker. *Scenes* (1600×1067): stylized travel photographs — layered terrain with atmospheric perspective, sun or moon, mirrored water, film grain; the key light stays in the center third for vertical crops. *Artworks* (1200×1500): eight generative posters, no text. *Objects* (1200×1600): studio product renders on transparency; `ink` is the tight bounds of the object; no floor shadow (templates draw contact shadows). Round objects are lathes lit by one baked studio rig and composited once through their outline, so cut-out edges stay fringe-free. *Portraits* (800×800): flat illustrations, face centered in the avatar circle. Rules: no Canvas `filter`, no `fillText`, seeded RNG only; ≲ 50 ms per image. `proceduralPreview(id, maxSide)` returns a small cached copy (ink scaled along) for the editor's thumbnails without keeping the full-size canvas. Inspect with `pnpm sheet imagery [scene|artwork|object|portrait|<id>|time|edges|preview]`.

---

## 9. Compositor (WebGL2)

Responsibilities:

| Feature | Technique |
|---|---|
| Layer composite | Premultiplied-alpha textures from 2D segments, blended in order |
| Blend modes | normal, multiply, screen, overlay, difference, additive (lighter) |
| Blur | Separable Gaussian over a downsample pyramid (levels of σ ≤ 4 px, registered for odd sizes), σ in `u` scaled to render resolution |
| Directional blur | Line kernel along an angle (whip pans, speed lines) |
| Bloom / glow | Threshold → blur pyramid → additive |
| Masks / mattes | Alpha or luma from another layer, optional invert |
| Color adjust | `fx({ adjust: { brightness, contrast, saturation, tint: { color, amount } } })`: CSS-filter-like factors (1 = unchanged, clamped 0 … 2) — brightness multiplies, contrast is the slope around mid grey, saturation mixes around each pixel's Rec. 709 luma (0 = greyscale); tint maps luma onto black → color → white (lightness kept), mixed in by `amount` (0 … 1). Applied in that order to straight color after the blur; alpha is untouched, bloom glows from the unadjusted layer, a neutral adjust costs nothing. WebGL2: one shader pass; Canvas 2D: the same math on read-back pixels (slower, identical) |
| RGB split | Offset channel sampling (glitches) |
| 3D planes | Textured quads with perspective camera, depth sort, back-face culling, per-plane dim/blur by depth |
| **Motion blur** | Accumulate N sub-frame renders across the shutter interval into an RGBA16F buffer (`EXT_color_buffer_float`; RGBA8 progressive-average fallback), then resolve |
| Finish | Grain (stepped 24 fps, applied *after* motion blur), soft glow, vignette |

- One WebGL2 context per worker (`GpuCompositor`); textures and framebuffers pooled; premultiplied alpha throughout (ADR-026).
- **Frames** (`runtime/frame.ts`, ADR-027): `FrameRenderer` renders a frame once, or — for motion blur — N sub-frames centered on `t` across the shutter (Energy's angle, or the template's `shutter`), accumulated and resolved by the compositor, then finished. Two 160 px probes at the shutter's edges decide the count: frames that don't change render once, and fast motion gets more sub-frames within the request's budget (ADR-032). Previews: 1 sample while playing or scrubbing, 8 (up to 24) when paused; stills are sharp but finished; exports budget by quality.
- **Color**: sRGB throughout the pipeline; exports tagged BT.709 — the Phase 2 QA checks that exported MP4s match the preview in Chrome, Safari and QuickTime.
- **No WebGL2** (Firefox and WebKit workers on GPU-less machines, lost contexts): the Canvas 2D compositor (`CpuCompositor`) does the same work — Canvas `filter` blur — or three box blurs where Canvas has no `filter` (Safari) — additive accumulation, overlay grain, screen glow — so effects and motion blur keep working, slightly differently (parity is tested).

---

## 10. Player & adaptive quality

- States: stopped · playing · scrubbing · paused. Loop on by default in the editor.
- **Playing**: 1 motion-blur sample (2 on fast machines); the render scale steps 1 → 0.75 → 0.5 (× DPR, capped at 2160p) to hold ~60 fps (`runtime/quality.ts`). Signals: the recording cost of `render` (budget 8 ms per frame shared by the views that play) and the achieved frame interval (> 22 ms = struggling), which also catches rasterization falling behind. Drops need 12 samples and 500 ms since the last change; stepping back up needs sustained headroom (interval < 18 ms, projected cost < 60% of budget) and a cooldown that doubles after every drop (2 s → 16 s).
- **Paused/scrubbing**: a full-quality frame (full DPR, preview motion-blur samples) is rendered after 120 ms of stillness — what you see when paused is exactly what will export.
- **Gallery tiles** are views attached with `role: 'tile'`: their paused frames (posters) render with one sample, and they report no regions. `setVisible(views, false)` keeps tiles out of sight from building or rendering until they return; `setFrameRate(views, fps)` caps ambient playback. Each worker frame, playing views render first (sharing the 8 ms recording budget among the views that play), then builds and paused renders — stages before tiles — until a 10 ms idle budget is spent (at least one each); the rest continue next frame, so a burst (the gallery switching format) spreads over frames instead of stalling playback.

---

## 11. Editing overlay & hit testing

- During render, `editable()` and `movable()` register `{ id: 'movable:<group>' | 'editable:<controlKey>', kind, target, bounds }` with bounds transformed to frame units (repeated registrations of the same target are unioned). Only views attached as `interactive` collect regions. The worker posts the registry for the current frame (≤ 10 Hz while playing, immediately when paused).
- The main thread draws selection outlines, handles and snapping guides in a DOM/SVG overlay aligned to the stage — crisp at any zoom and fully accessible.
- Dragging updates `layout[groupId]` in the project store (transient during drag, one history step on release). Snapping: frame center lines, safe-area edges, other groups' edges (6 px threshold).
- Clicking an editable text focuses its inspector field (and, in v1.x, opens inline editing).

---

## 12. Determinism rules

1. Render is a pure function of `(scene, t)`; build is a pure function of the state + assets.
2. No `Math.random`, `Date`, `performance.now` or global mutable state in templates. Use `ctx.rng(key)` (SFC32/Mulberry32 streams seeded from the template seed and a stable key).
3. All fonts and assets are loaded **before** `build`; `render` never awaits.
4. Iterate in stable orders (arrays, not object key order from user data).
5. Time → frame mapping only in the exporter (`t = frame / fps`); mechanical cadences use `stepped()`.
6. Floating-point safety: clamp progresses, avoid accumulating state across frames.
7. Golden-frame tests (render twice → identical; compare with committed references) guard all of the above.

---

## 13. Performance guidelines for template authors

- Do everything that doesn't depend on `t` in `build` (layout, paths, gradients, masks, random layouts).
- Avoid per-frame allocation in hot loops (reuse objects; precompute arrays).
- Keep FX layers ≤ 4 per frame; prefer `clip` (cheap) over `mask` (compositor) when a hard edge suffices.
- Cap particle counts by resolution; cache static sub-scenes (`g.cache(key, fn)` renders once per render size).
- Blur radii are expensive at 4K — express them in `u` and let the compositor pick pyramid levels.

---

## 14. The Lab (`/lab`, development only)

The template workbench: choose a template → all formats side by side (one or two rows by available space, stacked on phones) · one transport for all views (play, frame steps ←/→, Shift = 1 s, Home/End, loop `L`, scrubber showing lead · in · hold · out · tail) · Looks · palettes incl. random brand colors (Light/Dark/Bold) · pairings · energies · duration slider with min/max · the template's own controls · stress-text presets (1 word, max length, diacritics, numbers, hard lines) · safe areas `G` (title, action, social zone) · transparent preview on a checkerboard · adaptive/full render quality · render-cost meter (ms, fps, scale) per view · PNG stills at 1080p (`ugoki-` prefix) · JSON state editor · a *This device* capability readout. Every template is built and reviewed here before it reaches the gallery. Available on local and preview deployments (404 on production, ADR-024); `?worker=0` renders on the main thread. Golden frames are captured by `pnpm test:golden --update`, not from the Lab.
