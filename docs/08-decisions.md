# 08 — Decision Log

> Lightweight ADRs. Each records context, the decision, alternatives considered, consequences and when to revisit. New architectural decisions are appended here (next number), never silently changed.

Status legend: **Accepted** — technical decisions delegated to us by the brief ("most modern and best tech stack") or decided by the owner in [`USER_QUESTIONS.md`](../USER_QUESTIONS.md) · **Proposed** — awaiting the owner's confirmation · **Superseded** — replaced by a later ADR.

---

### ADR-001 — On-device, static-first architecture
**Status**: Accepted · 2026-09-26
**Context**: Must run on Vercel Hobby with no database; exports must match previews; privacy is a differentiator.
**Decision**: No backend in the product path. All pages are prerendered; rendering and encoding happen in the browser; drafts live in IndexedDB; sharing uses the URL hash.
**Alternatives**: Serverless rendering (Hobby limits: 300 s functions, 1 vCPU; cost at scale); headless-Chromium render farms (not possible on Hobby).
**Consequences**: ~€0 running cost; no accounts or cloud sync; browser capability differences must be handled client-side.
**Revisit when**: accounts, team features or AI features are planned (none are, as of the owner's decisions A2 and D11).

### ADR-002 — Next.js 16 App Router on Vercel, all routes prerendered
**Status**: Accepted · 2026-09-26
**Decision**: Next.js 16.3 with Turbopack and React 19.3; default output (not `output: 'export'`) so `headers()` works; every route prerendered (`dynamic = 'error'` guards); the editor is a client feature inside a static shell.
**Alternatives**: Vite SPA (weaker SEO/landing story), Astro + islands (split mental model), TanStack Start (less Vercel-native).
**Consequences**: CI asserts the build emits no serverless functions.

### ADR-003 — Custom deterministic engine: Canvas 2D drawing + WebGL2 compositor
**Status**: Accepted · 2026-09-26
**Context**: Templates need pro typography, hairlines, masks, blur, bloom, 3D planes and true motion blur, identical in preview and export, in every browser.
**Decision**: Templates are pure functions of `(props, format, t)`. Drawing uses Canvas 2D (analytic anti-aliasing for type and hairlines); a small WebGL2 compositor handles effects, 3D planes and motion-blur accumulation.
**Alternatives**:
- *Remotion* — company license for teams > 3 (web rendering counted as "automation", $100/month minimum), mandatory telemetry on client renders, and its web renderer supports only a CSS subset (no perspective, blend modes, backdrop filters).
- *PixiJS 8* — strong GPU engine, but MSAA edges and texture text are a quality step down for type-heavy motion; kept as a fallback if our compositor effort balloons.
- *Motion Canvas / Revideo* — dormant / uncertain.
- *DOM + GSAP* — GSAP license prohibits visual animation builders (ADR-007); DOM can't be captured frame-accurately.
- *Lottie / Rive* — require external authoring tools; can't express our text engine.
- *CanvasKit (Skia WASM)* — excellent quality but a multi-MB download and verbose API.
**Consequences**: We own ~1–1.5k lines of compositor code; Safari's missing Canvas `filter` is irrelevant because all effects run in WebGL2.

### ADR-004 — HarfBuzz text engine
**Status**: Accepted · 2026-09-26
**Decision**: Shape all template text with harfbuzzjs and draw glyph outlines as paths; native `fillText` only as a fallback for glyphs the font lacks (emoji, CJK).
**Why**: Identical output across browsers, kerning-safe per-glyph animation, OpenType features, continuous variable axes (Safari lacks `fontStretch`/`fontKerning`; `letterSpacing` needs 18.4+).
**Consequences**: ~174 KB gz WASM (lazy, cached); fonts must be available as sfnt bytes (TTF) — WOFF2 handling is a Phase 1 spike (resolved by ADR-020: gzip TTF).

### ADR-005 — Engine runs in Web Workers
**Status**: Accepted · 2026-09-26
**Decision**: A render worker (stage + gallery tiles, one shared WebGL2 context, tiles fed via `bitmaprenderer`) and a per-job export worker, both on OffscreenCanvas.
**Why**: Smooth UI while rendering; exports survive hidden tabs (workers aren't timer-throttled; a Web Lock prevents Energy Saver freezing); avoids the ~16 WebGL-context limit in the gallery.
**Consequences**: Requires Safari 17+ (OffscreenCanvas WebGL); message protocol and asset transfer to design carefully.

### ADR-006 — Export via WebCodecs + Mediabunny
**Status**: Accepted · 2026-09-26
**Decision**: MP4 (H.264), WebM (VP9 + alpha), PNG sequence (ZIP), GIF, PNG still; runtime capability probing; streaming saves on Chromium.
**Alternatives**: ffmpeg.wasm (dormant, 31 MB, 0.04–0.08× native, GPL build) — excluded from v1; MediaRecorder (real-time, non-deterministic) — excluded.
**Consequences**: ProRes 4444 is not available at launch; PNG sequences serve Premiere/Final Cut alpha workflows. Mediabunny is MPL-2.0 (file-level copyleft — fine as an unmodified dependency).

### ADR-007 — No GSAP; Motion for interface animation
**Status**: Accepted · 2026-09-26
**Decision**: Don't use GSAP anywhere. Interface animation uses Motion (MIT); template animation uses the engine's own helpers.
**Why**: GSAP's standard license lists as a *Prohibited Use* "tools that allow users to build visual animations without code" competing with Webflow; Webflow may terminate the license at its discretion.

### ADR-008 — Templates as code with a declarative control schema
**Status**: Accepted · 2026-09-26
**Decision**: Each template is a TypeScript module exporting `defineTemplate()` with a typed control schema; the inspector, validation, share links, migrations and Looks are all generated from that schema.
**Why**: Motion craft needs code-level control; the schema keeps the UI consistent and makes adding a template a one-folder change.

### ADR-009 — Macro controls instead of keyframes
**Status**: Accepted · 2026-09-26
**Decision**: Users control Energy (Calm/Balanced/Punchy), Duration (hold stretches), Looks, palettes, pairings and layout — never curves or keyframes.
**Why**: The brief's core philosophy ("complexity underneath the interface").
**Revisit when**: a "Pro" mode is requested repeatedly — even then, prefer more macros over a timeline.

### ADR-010 — Local-first persistence + URL-hash sharing
**Status**: Accepted · 2026-09-26
**Decision**: Dexie/IndexedDB for drafts, assets and preferences; share links carry deflated state in `#d=`; images are never shared or uploaded.

### ADR-011 — OFL-only, self-hosted fonts
**Status**: Accepted · 2026-09-26
**Decision**: SIL OFL families only, subsetted and self-hosted. Fontshare/ITF Free Font License fonts are excluded (forbids modification/subsetting and "making available"; terminable).

### ADR-012 — TypeScript 7 + Biome, no ESLint (for now)
**Status**: Accepted · 2026-09-26
**Decision**: TypeScript 7.0 (native compiler) with Biome 2.5 for lint + format.
**Why**: typescript-eslint (pulled in by `eslint-config-next`) supports TypeScript < 6.1 only. Trade-off: Biome has no React Compiler lint rules yet.
**Revisit when**: typescript-eslint supports TS 7 — then consider adding `eslint-plugin-react-hooks` compiler rules.

### ADR-013 — pnpm 10 and Node 24
**Status**: Accepted · 2026-09-26
**Decision**: Pin `pnpm@10.34.5` and Node 24.x.
**Why**: Vercel doesn't auto-detect pnpm 11/12 yet (Corepack workaround exists); Node 20 is EOL and deprecated on Vercel from 2026-10-01; Vitest 5 needs Node ≥ 22.12.
**Revisit when**: Vercel detects pnpm 12, or Node 26 becomes available on Vercel (26 becomes LTS in October 2026).

### ADR-014 — Live engine previews in the gallery (no preview videos)
**Status**: Accepted · 2026-09-26
**Decision**: Gallery tiles render live from the engine (poster frames idle, playback on hover/focus/ambient when capable).
**Why**: Personalization ("type your headline everywhere") and format switching need live rendering; saves Hobby bandwidth (100 GB/month) compared with 50+ preview videos.

### ADR-015 — Monochrome brand: "color belongs to the work"
**Status**: Accepted · 2026-09-26 (owner decisions B1–B5)
**Decision**: Ugoki's interface is black/white; the only color comes from templates (the playhead Dot borrows the playing template's accent). Brand typeface: Mona Sans v2 (Expanded display). Wordmark: lowercase `ugoki` with the Dot; 動き as a quiet secondary signature; tagline *Motion, made yours.*
**Why**: The product is the hero; avoids documented AI-site clichés (near-black + single vermilion/acid accent; cream + serif + terracotta).
**Alternatives considered**: a signature hue held back for CTAs (Revolut-style); other typefaces (Archivo; Funnel Display + Funnel Sans).

### ADR-016 — No analytics, no telemetry
**Status**: Accepted · 2026-09-26 (owner decisions D8, D9)
**Decision**: No analytics, Speed Insights, error monitoring or telemetry of any kind; no third-party requests at runtime.
**Consequences**: Success criteria are verified before release (golden frames, export QA matrix, `/lab` benchmarks, Lighthouse, hands-on tests) instead of measured in production. Error panels offer a voluntary *Copy details* report. CSP stays `connect-src 'self'`; the privacy policy stays short.
**Revisit when**: the owner wants usage data — then only cookieless, EU-friendly or self-hostable options, documented in the privacy policy.

### ADR-017 — German private operator: legal pages & privacy posture
**Status**: Accepted · 2026-09-26 (owner decision A3)
**Decision**: Ship an Impressum and a Datenschutzerklärung (German, with English versions), linked from every page footer. Keep the data footprint minimal: no cookies, no analytics, no accounts, no third-party runtime requests (self-hosted fonts — never Google Fonts' CDN), all user content processed and stored on the user's device. The only personal data the operator's infrastructure sees is the hosting provider's request logs (Vercel).
**Consequences**: The owner provides Impressum details before launch (USER_QUESTIONS O4) and has the final legal texts checked (reputable generator or lawyer) — the planning docs are not legal advice. No cookie banner is needed while there are no cookies or tracking.

### ADR-018 — The engine validates its own inputs (no Zod or culori inside the engine)
**Status**: Accepted · 2026-09-26 (Phase 1)
**Decision**: Control values, palette references and design states are sanitized by small, dependency-free functions in `src/engine/template/` (`sanitizeValue`, `sanitizePaletteRef`, `sanitizeState`): they never throw, drop unknown keys, clamp numbers, strip unsafe characters and fall back to defaults. Color science (OKLab/OKLCH, gamut mapping, contrast) is the engine's own `core/color.ts`.
**Why**: The engine runs in workers and must stay small and synchronous; sanitizers that repair rather than reject fit untrusted share links better than schema errors. Zod stays planned for the share-link *envelope* on the main thread (Phase 2); culori only if the UI color picker needs it.
**Consequences**: The roadmap's "validation (Zod)" item is delivered as engine sanitizers; the Phase 2 share codec adds Zod around them.

### ADR-019 — Modified Mona Sans ships as "Ugoki Sans" and "Ugoki Mono"
**Status**: Accepted · 2026-09-26 (Phase 1)
**Decision**: Our subsetted, instanced builds of Mona Sans / Mona Sans Mono are renamed "Ugoki Sans" / "Ugoki Mono" (name table), keep the original copyright, designer, vendor and license records, and ship with the OFL text (`public/fonts/licenses/`).
**Why**: "Mona" is a Reserved Font Name; under OFL §3 a modified version (subsetting counts) must not use it. Other families (Inter, Instrument Serif) declare no RFN and keep their names.
**Consequences**: The brand face is still Mona Sans in every design sense; CSS and the manifest refer to the renamed families. `scripts/fonts.py` does the renaming reproducibly.

### ADR-020 — Engine fonts are gzip-compressed TTF, inflated in the worker
**Status**: Accepted · 2026-09-26 (Phase 1 spike: HarfBuzz font loading)
**Decision**: `scripts/fonts.py` builds subsetted TTFs from SHA-256-pinned sources and writes them gzip-compressed with content-hashed names (`public/fonts/engine/*.ttf.gz`, immutable cache headers). The engine inflates them with the platform `DecompressionStream`; a magic-byte check skips inflation if a proxy already decoded the transfer.
**Why**: HarfBuzz needs sfnt bytes; shipping gzip ourselves makes transfer size independent of the host's compression of `.ttf` (the open question of the spike) and avoids a WOFF2 WASM decoder. Mona Sans (all Phase 1 axes) is 314 KB compressed.
**Alternatives**: WOFF2 + a WASM decoder (extra download and code), raw TTF relying on Vercel compression (unverified, larger if uncompressed).
**Consequences**: DecompressionStream is required (Chrome 80, Firefox 113, Safari 16.4 — within our browser matrix).

### ADR-021 — A 1080-unit design space; optical sizes from rendered size
**Status**: Accepted · 2026-09-26 (Phase 1)
**Decision**: Templates draw in design units where the frame's short side is always 1080 (16:9 = 1920 × 1080, 9:16 = 1080 × 1920, 1:1 = 1080², 4:5 = 1080 × 1350) and `u` = 10.8 units; the renderer scales to any output size (even dimensions for H.264). Variable fonts with an `opsz` axis get `opsz = size × 0.6` (clamped), because videos are usually watched scaled down.
**Why**: Resolution-independent templates, vector-crisp 4K, and one set of numbers for every format; the 0.6 bias picks sturdier cuts for text that is viewed smaller than it is rendered.

### ADR-022 — One render worker hosts many views; templates are described, not shipped, to the main thread
**Status**: Accepted · 2026-09-26 (Phase 1)
**Decision**: The render worker hosts any number of *views* (stage, the Lab's formats, gallery tiles), each with its own template, state and transport; playback commands take a list of views so several play in lockstep. Templates load inside the worker; the main thread receives a plain-data `TemplateDescriptor` (controls, Looks, formats, palettes, available pairings, duration) and sanitized states. A hidden 1 × 1 *probe* view loads templates and sanitizes raw states (share links, drafts, JSON edits). Scenes rebuild at most once per frame per view and swap atomically; a failed build keeps the last good scene. `engine/host` is the main-thread entry: the client plus the engine's pure data (formats, palettes, pairings, energies).
**Why**: Keeps template code and the renderer off the main thread (architecture §9) without duplicating control schemas; one worker, one clock.
**Consequences**: Migrations (`migrate`) run only in the worker; the main thread never needs template code.

### ADR-023 — Canvas 2D direct-path semantics until the compositor lands
**Status**: Accepted · 2026-09-26 (Phase 1)
**Decision**: Phase 1 renders with Canvas 2D only. Group opacity multiplies into each primitive and blend modes apply per primitive (not isolated layers); `mask`, `fx`, `plane3d`, motion blur and finishes arrive with the WebGL2 compositor in Phase 2 and need no template changes.
**Why**: The direct path covers the reference template at < 0.2 ms of recording per 1080p frame; isolated layers cost an offscreen pass each and belong in the compositor.
**Consequences**: Templates that need group-isolated opacity (overlapping children fading together) wait for the compositor or avoid overlaps.

### ADR-024 — The Lab ships to local and preview deployments
**Status**: Accepted · 2026-09-26 (Phase 1; refines architecture §5)
**Decision**: `/lab` is built everywhere but answers 404 when `VERCEL_ENV === 'production'`; it is `noindex`. `?worker=0` renders on the main thread.
**Why**: The owner reviews templates on Vercel preview URLs (decision E2), which are production *builds*; excluding the Lab from every production build would hide it from exactly those reviews.

### ADR-025 — GIF export with modern-gif
**Status**: Accepted · 2026-09-26 (Phase 1 spike: GIF encoder choice)
**Decision**: Use `modern-gif` (MIT) for GIF export in the export worker; don't use its built-in dithering.
**Why**: On real frames (Chromium, 480 × 270) it produced 10× smaller files than `gifenc` on gradients (91 KB vs 906 KB for 30 frames — global palette plus frame differencing) and higher fidelity (PSNR 42.6 vs 38.1 dB on gradients, 77.5 vs 67.5 dB on Rise) at 21–30 ms/frame vs 4–9 ms. Encoding speed is irrelevant at GIF sizes (≤ 720 px, a few hundred frames in a worker). Its Floyd–Steinberg option did not finish within minutes even for 5 frames.
**Alternatives**: `gifenc` (MIT, fastest, unmaintained since 2022, per-frame palettes, no frame differencing).
**Revisit when**: banding appears in QA — then add our own ordered-dither pre-pass before quantization.

### ADR-026 — WebGL2 compositor with a Canvas 2D fallback, chosen per worker
**Status**: Accepted · 2026-09-27 (Phase 2)
**Decision**: Templates keep drawing with Canvas 2D; isolated layers, masks and effects are offscreen canvases that the compositor processes: blur (separable Gaussian over a downsample pyramid), bloom (threshold → blur → add), luma mattes, motion-blur accumulation (RGBA16F where the worker supports float color buffers) and the finish (grain, soft glow). One WebGL2 context per worker (`GpuCompositor`); where WebGL2 is missing or the context is lost, `CpuCompositor` does the same with Canvas 2D (`filter` blur, or three box blurs on premultiplied pixels where Canvas has no `filter`; additive accumulation, overlay grain, screen glow). `AdaptiveCompositor` switches when a context is lost; premultiplied alpha throughout.
**Why**: Safari has no Canvas `filter`, and effects must look the same in preview and export on every browser; keeping shapes and text in Canvas 2D avoids re-implementing them in GL. Firefox and WebKit workers on GPU-less machines (CI) have no WebGL2 — they still get effects and motion blur.
**Consequences**: The Canvas 2D path differs slightly (grain pattern, blur approximation): golden frames use it deterministically, and parity tests keep the GPU path close (blur spread and peak).

### ADR-027 — Motion blur by temporal supersampling, frames without motion render once
**Status**: Accepted · 2026-09-27 (Phase 2)
**Decision**: `FrameRenderer` renders N sub-frames centered on `t` across the shutter (`(θ / 360) / fps`; θ from Energy — 90° / 180° / 270° — or the template's `shutter`) and averages them in the compositor; two 48 px probes at the shutter's edges detect frames without motion, which render once. Previews use 1 sample while playing or scrubbing and 8 when paused; stills are sharp but finished; exports choose their own count. Grain changes at 24 fps whatever the frame rate.
**Why**: Templates are pure functions of `t`, so this is exact and needs no per-template work; the static check keeps holds as cheap as sharp frames. Previews and exports share the code, so a paused preview shows what exports.
**Update**: fixed counts banded on very fast edges (Layers at 8 samples) — sample counts are now adaptive (ADR-032).

### ADR-028 — Logos and images: our own SVG importer; files referenced by content hash
**Status**: Accepted · 2026-09-27 (Phase 2)
**Decision**: Image controls store an `AssetRef` — a built-in placeholder (Halden, Nova, Aero) or the SHA-256 of the user's file. SVGs are parsed by a small DOM-free importer (XML subset without DTD or entities; paths, shapes, `use`, transforms, presentation attributes, a CSS subset, `currentColor`) into vector artwork the drawer paints, tints and masks; anything it doesn't support is sanitized (whitelist) and rasterized on the main thread. Files are read, hashed and decoded on the device and reach the worker as vector data or transferred bitmaps.
**Why**: Logo techniques (*Sheen*, *Draw*, *Shards*) need vector shapes and exact alpha; `DOMParser` isn't available in workers; hashing dedupes files and keeps share links and drafts free of file contents.
**Alternatives**: rasterize every SVG (loses crisp 4K and vector effects); a full SVG renderer library (large, DOM-bound).

### ADR-029 — Preview backdrops belong to the view, not to the design
**Status**: Accepted · 2026-09-27 (Phase 2)
**Decision**: What shows behind a transparent design while it's previewed — procedural footage, *Scene A → B* swapping at a transition's cut, a color, or the user's own still ("Preview on my footage") — is a per-view setting in the worker (`setBackdrop`), composited under the rendered frame. It is never part of the design state, stills or exports; baking it into an export is an explicit export option. The procedural plates are original (drawn by the engine), cached per size.
**Why**: Overlays (lower thirds, logos, transitions) are hard to judge on a checkerboard, but their exports must stay transparent. Rendering the backdrop in the worker keeps the preview one canvas and lets it move with the timeline.

### ADR-030 — Bounded layers
**Status**: Accepted · 2026-09-27 (Phase 2)
**Decision**: `layer`, `mask` and `fx` take `bounds` — where the content lies, in design units in the current coordinate space. The drawer sizes the layer to those bounds on the output, grown by the effects' reach (3σ of blur and bloom) and kept within the parent layer; content outside is cut off. Without bounds a layer covers its parent.
**Why**: Frame-sized layers made effects on small elements cost the whole frame: Line's soft shadow took 38 ms per 1080p frame and Sheen's masked, blooming sweep 32 ms (headless Chromium, Canvas 2D path); bounded, 2 ms and 6 ms.
**Consequences**: Templates bound their effects (it's part of the performance guidelines). The GPU compositor now sees layers of any size, which exposed a registration bug in its pyramid for odd sizes (fixed: every pass samples exactly the texels it covers).

### ADR-031 — Transport commands are sequenced
**Status**: Accepted · 2026-09-27 (Phase 2)
**Decision**: `play`, `pause` and `seek` carry the client's sequence number; the worker echoes the latest one applied to a view with every frame, and `RenderClient.isCurrent(frame)` tells a page whether a frame reflects its last command. Playheads that follow frames ignore the others.
**Why**: The worker renders on its own clock, so frames can be in flight when the page seeks. Once paused frames got slower (motion blur), a frame for an earlier seek arrived after the next key press and pulled the Lab's playhead back — CI saved a still named 4.00 s instead of 3.00 s.

### ADR-032 — Adaptive motion-blur sampling
**Status**: Accepted · 2026-09-27 (Phase 2; refines ADR-027)
**Decision**: The two probes at the shutter's edges (now 160 px on the short side) also measure how far things move: a moving edge sweeps a band of pixels as wide as its travel, so the shorter of the longest row and column runs of strongly changed pixels approximates the displacement. Moving frames get the requested sub-frames, and more for fast motion — until each sub-frame moves at most `maxStep` output pixels — up to `maxSamples`. Budgets: paused previews 8 (≤ 24, 4 px); exports Standard 4 (≤ 16, 4 px), High 8 (≤ 32, 2.5 px), Max 16 (≤ 64, 1.5 px).
**Why**: Fixed counts band on fast edges — at 8 samples Layers' panels smeared in eight visible steps; small, fast objects are rare in our templates, while large fast edges (transitions, whip pans) are common. Cost goes where motion is.
**Consequences**: Small objects moving farther than their own size per shutter are underestimated (they still get the base count). Preview and export use the same code and budgets per quality, so frame N still equals the preview rendered with that budget.

### ADR-033 — Exports: one worker per export, streamed into the user's file where possible
**Status**: Accepted · 2026-09-27 (Phase 2)
**Decision**: Each export runs in its own module worker (`src/workers/export.worker.ts`) with its own compositor and text engine: the page sends the design state, the settings and the user's files it uses (decoded again from the files kept on the device), and — in browsers with a save picker — the handle of the file the user picked, which the worker opens and writes as it goes. Video goes through Mediabunny (H.264 in MP4, VP9 with alpha in WebM; bitrates from the quality table; key frame every 2 s), PNG sequences into a stored ZIP (fflate) with a README, GIFs through modern-gif with one global palette, stills as PNG. Frames are rendered by the same `FrameRenderer` as previews at t = f / fps; exits end 1/15 s early so the last frame is clean. The page holds a Web Lock while exporting and a screen Wake Lock while visible; errors carry their stage and a *Copy details* report without user content.
**Why**: Previews keep playing during exports; streaming keeps memory flat for 4K; the same renderer makes exported frame N the preview at N / fps (tested pixel for pixel on PNG sequences).
**Consequences**: A file used by the design is decoded twice (preview and export worker). Browsers without a save picker assemble files in memory (Blobs).

### ADR-034 — Video formats are offered only after a round trip
**Status**: Accepted · 2026-09-27 (Phase 2)
**Decision**: The render worker's probe stays cheap — what `VideoEncoder.isConfigSupported` declares — so it never holds up the first frames. Before exports offer video, an export worker verifies it, once per page and only when export options are first used (`probeExport` → `verifyEncoders`): four 128 × 128 frames of a bar stepping across black go through each codec's encoder and decoder, and every decoded frame must show its own bar (`encodesMotion`, 3 s timeout); transparent WebM is checked the way exports make it — Mediabunny's alpha mode on a bar moving across a clear background, decoded back with alpha (`transparentWebmWorks`). WebM for a transparent design needs that check; opaque WebM only VP9's. Until the answer arrives (typically well under a second), video formats show "Checking…"; if the worker never answers, declared support is used. Tests gate their MP4/WebM round trips on the same checks.
**Why**: CI's WebKit (Linux, GStreamer) accepts everything and writes files, but encodes each VideoFrame built from a buffer with the pixels of a later frame — a ~48-byte keyframe, ~25-byte "nothing changed" deltas. Frames made from canvases are fine there, so its MP4 and opaque WebM work; Mediabunny's alpha mode builds color and alpha frames from buffers, so transparent WebM came out without its alpha (a lower third decoded with 2% of its coverage). The Phase 1 spike passed by accident: its clip started on a still frame. A declared configuration says nothing about the output; a tiny round trip does, in milliseconds. It runs in its own worker because it starts codecs and Mediabunny's helper workers — work that must not compete with previews starting up (CI's Firefox once lost the Lab's tab while the render worker ran it at startup).
**Consequences**: That WebKit build offers MP4 and opaque WebM, not transparent WebM (PNG sequences keep transparency there); real Safari is decided by the same probe on the device, shown in the Lab's *This device* panel and checked in the QA matrix. Encoders that fail only at large sizes still get through (export errors carry their stage and a fallback).

---

## Phase 1 spike results (2026-09-26)

| Spike | Result | Follow-up |
|---|---|---|
| Worker `requestAnimationFrame` + OffscreenCanvas + WebGL2 | CI runs the render path in a real module worker in Chromium, Firefox and WebKit: worker rAF, OffscreenCanvas 2D and placeholder canvases showing the worker's frames (the e2e test reads them back) work in all three. WebGL2 inside workers: Chromium yes (with float and half-float color buffers); Firefox and WebKit report none on CI's GPU-less runners. The runtime falls back to a timer where worker rAF is missing. | Real Safari (macOS/iOS) is checked by the owner via the Lab's *This device* panel (USER_QUESTIONS O6); the compositor must degrade gracefully without WebGL2 (as planned). |
| Turbopack worker bundling + dynamic template imports | Works: `new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' })`, lazy template chunks and HarfBuzz's WASM (`new URL(…, import.meta.url)`). One fix: harfbuzzjs's Emscripten glue imports Node's `module` on a Node-only branch → browser resolve alias to a stub (`next.config.ts`). | — |
| HarfBuzz font loading | ADR-020: gzip TTF + `DecompressionStream` (available in all three engines). | — |
| Float accumulation | Chromium supports float color buffers in workers. RGBA8 fallback quality is judged with the compositor (Phase 2). | Safari/iOS via the owner check (O6). |
| Transparent WebM (Mediabunny) | Firefox's WebCodecs encodes VP9 with `alpha: 'keep'` natively; Chromium and WebKit don't, and Mediabunny 1.60 encodes the alpha plane as side data. The round trip keeps clear, opaque and anti-aliased alpha in Chromium and Firefox (60 frames at 480 × 270: 46–121 KB). *Corrected in Phase 2 (ADR-034)*: WebKit's pass was an accident of a still clip — on CI it encodes frames built from buffers with a later frame's pixels, which loses the alpha plane. | Importing into DaVinci Resolve / After Effects is checked by hand once export exists (Phase 2). |
| GIF encoder | ADR-025: modern-gif. | — |
| Codec availability | CI (Playwright builds): H.264, VP9 and AV1 encoding in Chromium, Firefox and WebKit. Chromium builds without proprietary codecs have no H.264 (Google Chrome has it). | The export sheet only offers what `probeCapabilities()` confirms (as planned). |

**Lesson from CI** (not a decision): the Lab's first WebKit run was blank because views were remounted when the layout changed — a Lab bug that only WebKit's timing exposed. Views are now keyed so layout never remounts them, and snapshots wait for a view's scene; the e2e test reads the canvases back to prove frames reach the screen in every engine. That read-back taught a second lesson: in Firefox it blocks the main thread on the worker, and right after the worker started or resized a canvas the two waited on each other for the full 10 s timeout. Firefox runs its e2e tests with a short snapshot timeout, so a stalled read comes back empty and the check polls again; the app never reads a transferred canvas on the main thread (`docs/06-engine.md` §3). The e2e tests also work around a Playwright bug where about 1% of Firefox navigations never report completion (microsoft/playwright#42183).
