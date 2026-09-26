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
| `play` / `pause` / `seek` / `setLoop` / `setQuality` | main → worker | Playback control for a list of views; `seek` with `scrub` renders at the adaptive scale until 120 ms of stillness |
| `snapshot` | main → worker | Renders a PNG still at a short-side resolution |
| `probe` | main → worker | Capability probe (see `runtime/capabilities.ts`) |
| `loaded` | worker → main | `TemplateDescriptor` (controls, Looks, formats, palettes, available pairings) + sanitized state |
| `built` | worker → main | Duration, timeline sections, readability warnings, build ms |
| `frame` | worker → main | `t`, playing, recording ms, render scale (timecode + cost meter) |
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
| `assets` | Decoded images/logos/placeholders by control key (Phase 2) |
| `ui` | UI Kit components (for UI templates, Phase 3) |

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

---

## 6. Draw API

A thin, allocation-conscious layer over Canvas 2D that records FX boundaries for the compositor. Implemented in Phase 1 (`draw/canvas-draw.ts`): `fill`, `group`, `rect`, `roundRect`, `circle`, `line`, `path`, `text`, `image`, `clip`, `movable`, `editable`. Planned with the compositor (Phase 2): `ellipse`, `polygon`, `mask`, `fx`, `plane3d`, conic gradients, patterns, `g.cache`. Until then group opacity and blend modes apply per primitive rather than to isolated layers (ADR-023). Circles start at 12 o'clock so trim paths draw on from the top; gradients get OKLab-interpolated intermediate stops (premultiplied, so fades to transparent never darken). The drawer keeps its own transform stack and sets one transform per primitive — per-glyph animation is one `setTransform` and one cached-path fill per glyph; static text draws as one cached path per line.

| Call | Purpose |
|---|---|
| `fill(color)` | Full-frame background |
| `group({ x, y, scale, rotate, skewX, skewY, origin, opacity, blend }, fn)` | Transform/opacity/blend scope |
| `rect`, `roundRect`, `circle`, `ellipse`, `line`, `polygon`, `path(pathLike, paint)` | Shapes; `paint = { fill?, stroke?: { color, width, cap, join, dash?, trim?: [a, b] } }` |
| `text(block \| line, opts)` | Draws shaped text at `opts.x/y`; `opts.glyph?: (glyph, line) => GlyphTransform \| null` for per-glyph motion (null hides the glyph; spaces are skipped); `opts.outline?` for stroke text (outline-only unless `fill` is given) |
| `image(asset, dest, { fit, focal, radius, opacity, adjust })` | Cover/contain with focal point; `adjust` = saturation/contrast/brightness (done in compositor when animated) |
| `clip(shape, fn)` | Hard clip (line masks, shape masks) |
| `mask(matteFn, contentFn, { mode: 'alpha' \| 'luma', invert })` | Track matte (compositor) |
| `fx({ blur, dirBlur: { angle, amount }, bloom, rgbSplit }, fn)` | Renders `fn` into an FX layer (compositor) |
| `plane3d({ transform: Mat4 \| {rx, ry, rz, x, y, z}, size, perspective }, fn)` | Draws `fn` into a texture placed on a 3D plane |
| `movable(groupId, bounds, fn)` | Applies the user's layout offset/scale for this group and registers it for dragging |
| `editable(controlKey, bounds)` | Registers a clickable region that focuses a control |

Gradients (linear, radial, conic) and patterns are paints. Colors are OKLCH-aware objects; conversion to canvas strings is cached.

**Segmented compositing**: every `fx`, `mask` or `plane3d` call closes the current 2D segment. The frame becomes an ordered list — `2D segment → FX layer → 2D segment → 3D plane → …` — which the compositor blends in order. Templates keep FX layers few (typically ≤ 4 per frame); canvases and textures are pooled by size.

---

## 7. Text engine (HarfBuzz)

Why not `fillText`? Safari lacks `fontStretch`/`fontKerning`, `letterSpacing` needs Safari 18.4+, and per-glyph animation with native text either breaks kerning or varies across browsers. HarfBuzz gives identical shaping everywhere, real OpenType features and continuous variable axes.

**Pipeline**
1. **Load**: the font registry fetches subsetted TTF bytes → `hb.Face` → `hb.Font` per variation instance. Metrics from `OS/2`/`hhea`: ascender, descender, cap height, x-height, line gap.
2. **Segment**: `Intl.Segmenter` (graphemes, words); parse emphasis markup (`*word*`) into styled spans; apply case transforms.
3. **Shape**: HarfBuzz with features (`kern`, `liga`, `calt`, optional `tnum`, `ss0x`) → glyph ids, clusters, advances, offsets.
4. **Break lines**: word-boundary candidates; user newlines are hard breaks; **balanced** breaking (minimize the variance of line widths, avoid a single-word last line, prefer breaks after punctuation).
5. **Fit**: binary-search font size within `[min, max]` to satisfy `maxWidth` and `maxLines`; report overflow to the inspector.
6. **Layout result** (`text/types.ts`): `TextBlock { lines[{ glyphs[{ id, face, x, y, advance, size, text, index, word, line, emphasis, ink, fallback }], words, x, baseline, width, ink, mask }], size, width, height, ink, overflow, capHeight }`. Vertical metrics are optical: the block's top is the first line's cap height and `height` ends at the last baseline. Left/right-aligned lines get optical margins (ink, not side bearings, touches the edge). Line **masks** share one height for the whole block — the block's ink extremes (at least cap height) plus 8% of the size — so lines rise in unison and descenders never clip at rest.
7. **Draw**: each glyph's outline (`hb.Font.drawGlyph` → `Path2D`, cached by `font:glyph:axes`) is filled/stroked with its transform. Static runs can be cached as a single `Path2D`.

**Variable axes**: `hb.Font.setVariations({ wght, wdth, opsz, … })`; axis values are clamped and quantized (`wght` 1, `wdth` 0.25, `opsz` 1) so animated axes share cached instances and outlines. `opsz: 'auto'` maps the rendered size to the optical-size axis (`opsz = size × 0.6`, ADR-021). A **width solver** (binary search on `wdth`) makes a line hit an exact target width (*Stretch*, Phase 3).

**Fallback**: characters the font can't render (glyph 0) — emoji, CJK typed into a Latin font — fall back to native `fillText` with a system font stack at the same size, laid out in the same line. These runs can differ slightly between operating systems (documented in the editor tooltip).

**Performance**: shaping and layout happen in `build`; per frame we only transform and fill cached paths. Text for gallery personalization is re-shaped per keystroke (debounced).

---

## 8. Assets & placeholders

- **Raster import** (main thread): validate MIME (PNG, JPEG, WebP, AVIF where decodable, SVG) → hash bytes (SHA-256) → store Blob in IndexedDB → decode with `createImageBitmap` (downscale to ≤ 4096 px long side) → transfer to the worker.
- **SVG import**: sanitize → parse `viewBox`, `path`, basic shapes, groups, transforms and flat fills into engine paths. The worker draws parsed SVGs as vectors (crisp at 4K, enables *Draw*/*Sheen*/*Shards*). SVGs using unsupported features (gradients, filters, text, embedded images) are rasterized on the main thread at 4096 px and transferred as bitmaps; vector-only effects then use their raster variants.
- **Fit**: `cover`/`contain` with a user focal point; logos get color modes (original · mono light/dark · accent) via compositing.
- **Placeholders** (procedural, seeded, rendered in the worker and cached per size): Artworks, Scenes, Objects (bottle, can, speaker, phone, watch), Screens (via UI Kit), footage backdrop, fictional logos (Halden, Nova, Aero as SVG path data), avatars.

---

## 9. Compositor (WebGL2)

Responsibilities:

| Feature | Technique |
|---|---|
| Layer composite | Premultiplied-alpha textures from 2D segments, blended in order |
| Blend modes | normal, multiply, screen, overlay, difference, additive (lighter) |
| Blur | Dual-filter (Kawase) or separable Gaussian, radius in `u` scaled to render resolution |
| Directional blur | Line kernel along an angle (whip pans, speed lines) |
| Bloom / glow | Threshold → blur pyramid → additive |
| Masks / mattes | Alpha or luma from another layer, optional invert |
| Color adjust | Brightness, contrast, saturation, tint (animated grading, *Compare* defaults) |
| RGB split | Offset channel sampling (glitches) |
| 3D planes | Textured quads with perspective camera, depth sort, back-face culling, per-plane dim/blur by depth |
| **Motion blur** | Accumulate N sub-frame renders across the shutter interval into an RGBA16F buffer (`EXT_color_buffer_float`; RGBA8 progressive-average fallback), then resolve |
| Finish | Grain (stepped 24 fps, applied *after* motion blur), soft glow, vignette |

- One WebGL2 context per worker; textures and framebuffers pooled.
- **Color**: sRGB throughout the pipeline; exports tagged BT.709 — the Phase 2 QA checks that exported MP4s match the preview in Chrome, Safari and QuickTime.
- **No WebGL2** (rare): FX degrade gracefully (blur/bloom skipped, 3D planes flattened), motion blur off; the editor shows a notice.

---

## 10. Player & adaptive quality

- States: stopped · playing · scrubbing · paused. Loop on by default in the editor.
- **Playing**: 1 motion-blur sample (2 on fast machines); the render scale steps 1 → 0.75 → 0.5 (× DPR, capped at 2160p) to hold ~60 fps (`runtime/quality.ts`). Signals: the recording cost of `render` (budget 8 ms per frame shared by all views) and the achieved frame interval (> 22 ms = struggling), which also catches rasterization falling behind. Drops need 12 samples and 500 ms since the last change; stepping back up needs sustained headroom (interval < 18 ms, projected cost < 60% of budget) and a cooldown that doubles after every drop (2 s → 16 s).
- **Paused/scrubbing**: a full-quality frame (full DPR, preview motion-blur samples) is rendered after 120 ms of stillness — what you see when paused is exactly what will export.
- Gallery scheduler: a per-frame time budget (e.g. 6 ms) shared round-robin across visible tiles; off-screen tiles stop; tile render scale ≤ 1.5 × CSS size.

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
