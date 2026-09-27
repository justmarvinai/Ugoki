# 07 — Export

> Frame-perfect, on-device export: the same engine that drew the preview renders every frame at the target resolution inside a dedicated worker and hands it to WebCodecs (via Mediabunny), a GIF encoder, or a PNG/ZIP writer. Nothing is uploaded.

Platform facts verified 2026-09-26 (browser source, MDN compat data v8.1.3, Mediabunny v1.60.0). Current stable browsers at that date: Chrome 154, Edge 153, Firefox 156, Safari 27.

---

## 1. Formats

| Export option | Container / codec | Alpha | Primary audience |
|---|---|---|---|
| **Video** | MP4 · H.264 (AVC), yuv420p | — | Social, presentations, messaging |
| **Transparent video** | WebM · VP9 + alpha (Matroska BlockAdditional) | ✓ | Web, CapCut, DaVinci Resolve, After Effects |
| **PNG sequence** | ZIP of `frame_00001.png …` (straight alpha) | ✓ | Premiere Pro, Final Cut Pro, any editor |
| **GIF** | GIF89a, looping | 1-bit | Chats, docs, email |
| **Still** | PNG of the current frame | ✓ | Thumbnails, posters |
| *Later* | WebM/MP4 with audio (Opus/AAC), animated WebP, ProRes 4444 (only with a fast, license-compatible encoder) | | |

**Resolutions** (short side): 720 · 1080 · 1440 · 2160 (4K). **Frame rates**: 24 · 25 · 30 · 50 · 60. **Dimensions are always even** (Chromium rejects odd sizes for H.264).

| Format | 1080p | 4K |
|---|---|---|
| 16:9 | 1920 × 1080 | 3840 × 2160 |
| 9:16 | 1080 × 1920 | 2160 × 3840 |
| 1:1 | 1080 × 1080 | 2160 × 2160 |
| 4:5 | 1080 × 1350 | 2160 × 2700 |

---

## 2. What each browser can encode

| | VideoEncoder | Video codecs | AudioEncoder (for later) | Notes |
|---|---|---|---|---|
| Chrome / Edge (desktop) | ✓ (94+) | H.264 (HW or OpenH264), VP8, VP9, AV1 | Opus; AAC only on Windows/macOS/Android (not Linux) | HEVC hardware-only |
| Safari (macOS/iOS) | ✓ 16.4+ | H.264, HEVC, VP8, VP9 (AV1 off) | ✓ 26+: AAC, Opus | VP9-alpha *playback* in Safari unverified |
| Firefox desktop | ✓ 130+ | VP8, VP9, AV1; H.264 via OS/OpenH264 (varies on Linux) | Opus, Vorbis (no AAC) | |
| Firefox Android | ✗ | — | — | Offer GIF, PNG sequence, Still |

- **WebCodecs' own `alpha: "keep"` is implemented by no engine.** Mediabunny encodes alpha itself: it splits color and alpha on the CPU in a blob-URL worker, encodes the alpha plane with a second VideoEncoder, and writes standard WebM alpha (BlockAdditional, `AlphaMode=1`). Works wherever VP9 encoding works → requires CSP `worker-src blob:`. *Phase 1 spike (CI, all three engines)*: Firefox's `isConfigSupported({ alpha: 'keep' })` is true for VP9 — the only engine with native alpha encoding; Chromium and WebKit report false. Mediabunny 1.60's round trip keeps clear, opaque and anti-aliased alpha in Chromium and Firefox (`tests/spikes/webm-alpha.browser.test.ts`). *Phase 2 correction*: CI's WebKit (Linux, GStreamer) only seemed to pass — it encodes each VideoFrame built from a buffer with the pixels of a later frame, and the spike's clip happened to start on a still frame. Frames made from canvases are fine there (MP4 and opaque WebM work), but Mediabunny's alpha mode builds its frames from buffers, so transparent WebM loses its alpha. The capability probe now round-trips moving frames through each codec, and transparent WebM through Mediabunny's alpha mode, before offering them (ADR-034); real Safari is checked in the QA matrix (§9).
- **The only codec pair every engine encodes natively is WebM (VP9 + Opus)** — our universal fallback.
- MP4 with audio (later) needs `@mediabunny/aac-encoder` (WASM, ~254 KB gz, LGPL code inside, lazy-loaded) on Firefox, Chrome/Linux and Safari < 26.
- HEVC with alpha cannot be produced through WebCodecs anywhere.

**Everything is probed at runtime** (`canEncodeVideo`, `getFirstEncodableVideoCodec`, `VideoEncoder.isConfigSupported` with the exact size/bitrate) when the export sheet opens; unavailable options are disabled with a human reason and a suggested alternative. A declared configuration isn't trusted on its own: the first time export options are used, an export worker sends four 128 × 128 frames of a moving bar through each video codec's encoder and decoder and requires every decoded frame to show its own bar (`encodesMotion`), and checks transparent WebM (`transparentWebmWorks`): VP9 must encode the moving bar from frames built from buffers too (BGRX and I420, as Mediabunny's alpha mode builds them), and a round trip through Mediabunny's alpha mode must come back with each frame's color and alpha side data, decoded with plain decoders and copied out of the frames as Mediabunny's alpha reader does — WebM for transparent designs is offered only where that passes (ADR-034). The worker answers once every encoder and decoder is closed; a check that timed out is cancelled and gets up to two seconds to let go. The render worker's own probe only records what's declared, so previews never wait for it.

---

## 3. Pipeline

```
Export sheet (main) ──job──► Export worker
                              1. load template module, fonts, HarfBuzz, assets (transferred)
                              2. build Scene at export resolution
                              3. for frame f in 0..N−1:
                                   t = f / fps
                                   render N_mb sub-frames across the shutter → accumulate → finish
                                   hand frame to the sink:
                                     video  → CanvasSource.add(t, 1/fps)   (await = backpressure)
                                     GIF    → quantize + encode frame
                                     PNG    → convertToBlob('image/png') → ZIP stream
                                   post progress every ~100 ms (frame, fps, ETA)
                              4. finalize → StreamTarget/BufferTarget → file
```

- **Video settings**: H.264 High profile; VP9 profile 0; keyframe every 2 s; bitrate from a quality table (below); `latencyMode: 'quality'`; hardware acceleration "no-preference".
- **Backpressure**: `await source.add(...)` (Mediabunny) keeps the encoder queue bounded; the worker never races ahead of the encoder.
- **Motion-blur samples** by quality (ADR-032): Standard 4 · High 8 · Max 16 for anything that moves, and more for fast motion — up to 16 · 32 · 64 — until each sub-frame moves at most 4 · 2.5 · 1.5 px. Frames without motion (compared on 160 px probes at the shutter's edges) render once. GIFs and stills are sharp.
- **Frames**: f = 0 … round(duration × fps) − 1 at t = f / fps — the end itself isn't a frame, so exits finish 1/15 s early (`CLEAN_END`) and the last frame is clean at every export frame rate (ADR-033).
- **Progress & ETA**: rolling average of frame cost; the sheet shows percentage, frame count and time remaining; the stage fast-forwards through the frames.
- **Cancel**: aborts the loop, closes encoders, discards partial output.

### Bitrate table (H.264/VP9, Standard → High → Max)

| Resolution | 30 fps (Mbps) | 60 fps (Mbps) |
|---|---|---|
| 720p | 5 → 8 → 12 | 8 → 12 → 18 |
| 1080p | 10 → 16 → 24 | 16 → 24 → 36 |
| 1440p | 16 → 24 → 36 | 24 → 36 → 54 |
| 4K | 35 → 50 → 70 | 50 → 70 → 100 |

Motion graphics have flat colors and sharp edges; the table errs high to avoid banding and edge smearing. Tuned during Phase 2 QA.

---

## 4. Transparency

- The compositor renders premultiplied alpha; exporters convert as each format expects (PNG: straight alpha; WebM alpha: Mediabunny's color/alpha split).
- Templates with `alpha: 'default' | 'optional'` export transparent when **Background = Transparent**; *Bake background* (lower thirds with *Preview on my footage*, transitions with A/B images) produces an opaque MP4 instead.
- Guidance in the sheet: WebM alpha for web, CapCut, Resolve and After Effects; **PNG sequence for Premiere Pro and Final Cut Pro** (universal); GIF only has 1-bit transparency.

## 5. GIF

- Encoder: **`modern-gif`** (MIT, maintained; ADR-025). The Phase 1 spike measured it against `gifenc` on real frames: 10× smaller files on gradients (global palette + frame differencing) and higher fidelity, at ~21–30 ms/frame for 480 × 270 in a worker. Its built-in dithering stalls in 2.1.0 — if banding shows up in QA, dither with our own ordered-dither pre-pass. gifski (best quality) is AGPL and excluded.
- Global palette per export (256 colors) built from sampled frames — templates use few colors, so global palettes avoid per-frame flicker; optional ordered dithering for gradients.
- Defaults: width 640 (480/640/720), 20 fps (15/20/25), infinite loop; motion blur off (it only adds colors).
- Size guard: estimate and warn above ~15 MB.

## 6. PNG sequence & still

- `OffscreenCanvas.convertToBlob({ type: 'image/png' })` per frame in the worker → streamed into a ZIP with fflate (store mode; PNGs are already compressed).
- Names: `ugoki-{template}-{w}x{h}-{fps}fps/frame_00001.png` (+ a `README.txt` with fps, frame count, cut point for transitions).
- Still: the current stage time rendered at export resolution with full motion-blur quality off (a still should be sharp).
- GIFs are opaque: a transparent design gets its own background (or the baked backdrop) — GIF's 1-bit transparency would fringe every anti-aliased edge.

---

## 7. Saving files

| Browser | Method |
|---|---|
| Chromium desktop & Android | `showSaveFilePicker` → Mediabunny `StreamTarget`/ZIP stream written directly to disk (no memory ceiling) |
| Safari, Firefox | In-memory `BufferTarget` → Blob download (browsers page large Blobs to disk); *later*, if QA hits memory limits: spill to OPFS (`createWritable`: Firefox 111+, Safari 26+) and download from there |

As built (Phase 2): the page opens the save picker in the click (it needs the user's gesture) and hands the file handle to the export worker, which opens the writable itself. MP4s written this way reserve their metadata at the start of the file (`fastStart: 'reserve'`), so they still play while downloading; in memory they're assembled with metadata up front. Cancelling aborts the writable, so no partial file is left.

Memory guard: estimate output size up front; above ~1 GB without streaming, suggest a lower resolution or PNG → video split.

---

## 8. Reliability

- **Runs in a worker** (not throttled like main-thread timers; `requestAnimationFrame` never runs in hidden tabs).
- **Web Lock held for the duration of the export** — pages holding a lock are exempt from Chrome's Energy Saver tab freezing (which otherwise freezes the page *and its workers* after 5 minutes hidden).
- **Screen Wake Lock** while the tab is visible (auto-released when hidden, per spec).
- The sheet asks users to keep the tab in front for long exports; if the tab is hidden, a notice appears when they return.
- Errors are caught per stage (load, build, render, encode, finalize) with specific messages and a retry that suggests a safer preset (lower resolution, WebM instead of MP4, fewer motion-blur samples).
- Ugoki has **no telemetry** (ADR-016): every error panel offers **Copy details** (browser + version, probed capabilities, codec config, template, resolution/fps, failing stage, error text — no user content) so users can send a report voluntarily.
- Filenames: `ugoki-{template}-{w}x{h}-{fps}fps.{ext}`, plus `-cut-f{n}` for transitions.

---

## 9. QA matrix (per release)

| Check | Chrome (mac/win/linux) | Safari (mac/iOS) | Firefox (desktop) | Chrome Android |
|---|---|---|---|---|
| MP4 1080p30 plays in QuickTime, VLC, Premiere/Resolve, and uploads to Instagram/TikTok/YouTube/LinkedIn | ✓ | ✓ | where H.264 exists | ✓ |
| WebM alpha imports with transparency in Resolve/After Effects/CapCut and plays in Chrome/Firefox | ✓ | encode ✓ / playback check | ✓ | ✓ |
| PNG sequence imports as an image sequence in Premiere and Final Cut | ✓ | ✓ | ✓ | ✓ |
| GIF loops correctly in Slack, Gmail, Notion | ✓ | ✓ | ✓ | ✓ |
| 4K60 export completes; memory stays bounded; tab hidden mid-export completes | ✓ | ✓ | ✓ | — |
| Colors match preview (no gamma shift) | ✓ | ✓ | ✓ | ✓ |
| Exported frame N equals preview at `t = N / fps` (pixel diff) | ✓ | ✓ | ✓ | ✓ |
