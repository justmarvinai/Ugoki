# 02 — Experience

> Information architecture, flows and screen-by-screen UX. Visual tokens live in [`03-design-system.md`](03-design-system.md); motion vocabulary in [`04-motion-language.md`](04-motion-language.md).

---

## 1. Experience principles

1. **One primary action per view** — Start creating · Open template · Export.
2. **Direct manipulation first** — click what you see to edit it; drag it to move it.
3. **Preview before commit** — hover a palette, Look or pairing and see it on the stage instantly.
4. **No dead ends** — every error names a way forward.
5. **Nothing modal that doesn't need to be** — the only sheet is Export.
6. **Never lose work** — autosave, undo, share links.

---

## 2. Information architecture

| Route | Page | Theme | Rendering |
|---|---|---|---|
| `/` | Landing | Daylight + Cinema bands | Static (SSG); live engine hydrates after first paint |
| `/templates` | Gallery (all) | Cinema | Static shell; live previews client-side |
| `/templates/[category]` | Category gallery (10 pages, SEO) | Cinema | Static (`generateStaticParams`) |
| `/editor/[templateId]` | Editor (50 pages) | Cinema | Static shell + client editor; state from `#d=` (share link) or `?draft=` (local draft) |
| `/legal/imprint` (Impressum) · `/legal/privacy` (Datenschutzerklärung) · `/legal/licenses` | Legal — German text with English version | Daylight | Static |
| `/lab` | Engine lab (template development) | Cinema | Development builds only |
| 404 | Not found | Daylight | Static; the "404" is animated by the engine |

Navigation stays minimal: wordmark (home), **Templates**, **Start creating**. No accounts, no settings page (preferences live in context: format, theme of guides, reduced motion from the OS).

---

## 3. Key flows

**A — First visit to first export (target: < 3 min)**
Landing (types a word into the hero — it animates in five styles) → *Start creating* → Gallery (their text is already in the personalization field; every preview shows it) → clicks a tile → Editor morphs open with their text applied → picks a Look, adjusts Energy → *Export* → Video (MP4) → file downloads.

**B — Editor needs an overlay**
Gallery → Lower Thirds → *Line* → edits name/title → *Preview on my footage* (drops a still from their video) → drags the lockup into place → *Export* → Transparent video (WebM) or PNG sequence → drops it into Premiere/Resolve/CapCut.

**C — Returning user**
Gallery → *Continue where you left off* row → draft opens exactly as left (including images stored locally).

**D — Share**
Editor → *Share* → copy link → recipient opens the same design (images replaced by defaults, with a notice).

---

## 4. Landing (`/`)

Minimal, bold, "barely there". Seven moments, alternating Daylight and Cinema bands. The engine runs *on the page* — the landing is a demo, not a brochure.

1. **Nav** — wordmark left; *Templates* and a quiet *Start creating* right. Solid background with a hairline appears after scrolling (no glass effect).
2. **Hero** (Daylight, full viewport) — built around the tagline
   - Headline **`Motion, make yours.`** in `display-xxl` (Mona Sans Expanded 800). The word *Motion,* breathes along the width axis — a CSS variable-font animation: no JavaScript, instant, paused for reduced motion.
   - One small line beneath: `Art-directed motion templates. Customize in seconds, export in your browser.`
   - The **hero stage**: a wide, borderless live canvas where the engine cycles every ~2.4 s through five real template styles (Rise → Stretch → Echo → Decode → Focus).
   - **Make it yours**: a single inline field under the stage, placeholder `Type anything` — as the visitor types, all five styles animate *their* words. The tagline, taken literally. The text carries into the gallery's personalization field.
   - Primary CTA `Start creating` + micro line `Free. No sign-up. Nothing to install.`
   - Performance: the headline is server-rendered text (fast LCP); the stage reserves its space and shows a pre-rendered poster until the engine (loaded after first paint) takes over — no layout shift.
3. **The reel** (Cinema band) — *Scroll is the playhead.* A sticky stage (16:9 desktop, 9:16 phone) scrubs through six real templates as you scroll (~100 vh each). A thin timeline with the Dot shows progress; captions give the template name and category. Nothing is a video file — it's the engine, scrubbed by scroll.
4. **Choose. Customize. Export.** (Daylight) — three words as a sticky scroll sequence. The right side runs a live mini-editor: tiles shuffle and one is picked → the headline retypes, a palette swatch is clicked, Energy flips to Punchy, the format morphs 16:9 → 9:16 → an export bar fills with the Dot and a file chip appears (`ugoki-rise-1080x1920.mp4 · 4.1 MB`). One short line of copy per step.
5. **Ten categories** (Cinema) — the category names set huge, one per line. Desktop: hovering a name shows a live preview that follows the cursor. Phone: tapping expands an inline preview. Each links to its category page.
6. **Statements** (Daylight) — four lines in `display-l`, each with one small explanatory sentence: `Free.` (No watermark, no account, no payment.) · `No sign-up.` (Open it and start.) · `Stays on your device.` (Your files never leave your browser. No cookies, no tracking.) · `Up to 4K.` (MP4, transparent WebM, PNG sequences, GIF.) No icons, no cards.
7. **Finale** (Cinema) — the `ugoki` wordmark spanning the full width, breathing on its width axis; *Start creating*. Footer: © Ugoki · Impressum · Datenschutz · Licenses · `動き — movement`.

Reduced motion: hero shows a static frame with a play button; the reel becomes a list of poster frames with play buttons.

---

## 5. Gallery (`/templates`, `/templates/[category]`)

**Header (64 px)**: wordmark · personalization field `Type a headline to preview it everywhere` · format control (16:9 · 9:16 · 1:1 · 4:5) · *Recent* (drafts popover).

**Category nav** (sticky): `All · Text & Titles · Lower Thirds · Social · Product & Ads · Showcase · Brand & Quotes · Openers · Transitions · Logo & Branding · UI / Product Motion` — large text tabs with a sliding underline; horizontally scrollable on narrow screens.

**Continue where you left off**: up to 4 draft tiles (only when drafts exist).

**Grid**
- Columns fill the width from a minimum tile size per format (≈ 360 px for 16:9, ≈ 220 px for 9:16): one column on phones, up to 6 columns of 16:9 or 10 of 9:16 on a 2560 px screen — large monitors get a richer wall of work, not wider tiles.
- **Tiles are live engine renders**, not videos: idle tiles show their poster frame; hover/focus plays from the start. On capable devices (measured first-frame cost) up to ~8 tiles nearest the pointer or viewport center play ambiently at reduced fps; on phones the tile nearest the viewport center plays.
- Tile = media (radius 20) + name beneath; hover reveals the one-liner and three Look dots (hovering a dot previews that Look).
- **Personalization**: typing in the header field updates every template's primary text (debounced ~150 ms); it carries into the editor.
- **Format control** re-lays out every tile live — the gallery itself proves the responsive layouts.
- **Search** (`/` to focus): name, category, tags and use cases ("podcast", "wedding", "YouTube", "sale").
- Empty result: `Nothing matched "…". Try "title", "logo" or "reel".`

**Open a template**: the tile morphs into the editor stage (View Transition). Keyboard: arrow keys move focus across the grid, `Enter` opens.

---

## 6. Editor (`/editor/[templateId]`)

### Desktop (≥ 1024 px)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Templates   Rise · Text & Titles   [16:9|9:16|1:1|4:5]   ↶ ↷ Share  [Export] │  top bar 56px
├───────────────────────────────────────────────────────┬──────────────┤
│                                                       │ LOOKS  ● ● ● ⤮│
│                                                       │ CONTENT       │
│                    STAGE (canvas)                     │ STYLE         │
│                                                       │ MOTION        │
│                                    [guides][bg][fit]  │ LAYOUT        │
├───────────────────────────────────────────────────────┤  inspector    │
│ ▶  00:02.40 / 00:05.00  |In|——Hold——●——|Out|  ⟲  ⊢dur │  360px        │  transport 64px
└───────────────────────────────────────────────────────┴──────────────┘
```

**Stage**
- Canvas fitted with 32 px breathing room; checkerboard for transparent backgrounds; optional safe-area guides (`G`).
- **Preview backdrop** for transparent templates: procedural footage, solid colors, or *Preview on my footage* (a still image; never exported unless *Bake background* is chosen at export).
- **Direct manipulation**: hovering editable elements shows a faint outline; clicking selects — the inspector scrolls to and focuses the matching control (text fields get the caret). Movable groups can be dragged with snapping to center lines and safe areas (guides flash on snap) and scaled with a corner handle or the scale slider.
- Zoom: Fit (default) / 100%.

**Inspector** (single scrolling column, sticky section headers; 360 px wide, 400 px from 1920 px screens up — the stage takes all remaining space)
- **Looks**: three Look swatches + *Shuffle* (cycles curated Look/seed combinations — never random ugliness). Hover previews on stage; click commits.
- **Content**: auto-generated from the template's control schema — text fields (with `*emphasis*` hint where supported), lists (reorderable), image slots (drop/paste/click, fit, focal point).
- **Style**: Palette (template palettes + *Brand color* chip → Brand Light/Dark/Bold), Font pairing, template style controls, Background (color · transparent · image), Finish (Clean · Grain · Soft glow).
- **Motion**: Energy (Calm · Balanced · Punchy), Duration (slider + number; *Auto* for sequences), template motion controls.
- **Layout** (when the template has movable groups): 3 × 3 anchor, scale, reset position.
- Footer: *Reset template* (confirm).
- Readability and contrast warnings appear inline next to the control that causes them, with a one-click fix ("Use 6 s", "Fix contrast").

**Transport**
- Play/pause · timecode (`00:02.40 / 00:05.00`, Mono, tabular) · scrubber with tinted **In · Hold · Out** bands · the Dot as playhead · loop · a duration handle at the end of the scrubber (drag to change duration; the hold stretches) · cut marker for transitions.
- Scrubbing renders full-quality frames (with motion blur) when paused.

**Top bar**: back to templates · template name and category · format control (the stage frame morphs on a spring while the template re-lays out) · undo/redo · *Share* · **Export**.

### Tablet (768–1023 px)
Stage on top, transport beneath, inspector as a bottom sheet (half height, draggable) with section tabs.

### Phone (< 768 px)
- Stage pinned at the top (≤ 50 vh), transport overlaid at its bottom edge.
- Bottom tab bar: **Content · Style · Motion · Format**; each opens a sheet over the lower half.
- Tap text on the stage → Content sheet opens with that field focused. Drag to move; pinch to scale movable groups.
- *Export* stays in the top bar; the export sheet is full-height.

### Autosave, drafts, undo
- Every change autosaves to IndexedDB (debounced 500 ms). `Cmd/Ctrl+S` just confirms "Saved on this device".
- Undo/redo covers every inspector and stage change; typing is coalesced (one undo step per pause > 500 ms).
- Drafts appear in *Recent* and in the gallery row; rename, duplicate, delete.

### Share
*Share* → popover: `Anyone with this link can open this design. Images aren't included.` → *Copy link*. The design state lives in the URL hash (`#d=…`), never sent to a server.

---

## 7. Export sheet

A side sheet (420 px) on desktop, full-height on phones.

**1 — Choose**

| Option | Format | Best for | Default when |
|---|---|---|---|
| **Video** | MP4 (H.264) | Social, presentations, messaging | Template has no transparency |
| **Transparent video** | WebM (VP9 + alpha) | Web, CapCut, DaVinci Resolve, After Effects | Template background is transparent |
| **PNG sequence** | ZIP of PNG frames (alpha) | Premiere Pro, Final Cut Pro, any editor | — |
| **GIF** | GIF | Chats, docs, email | — |
| **Still** | PNG (current frame) | Thumbnails, posters | — |

Settings (collapsed, smart defaults): **Resolution** 720p · 1080p · 1440p · 4K (shows exact pixels for the current format) · **Frame rate** 24 · 25 · 30 · 50 · 60 (default 30) · **Quality** Standard · High · Max (bitrate + motion-blur samples) · GIF: width 480/640/720, fps 15/20/25, dithering, loop. Estimated size and time update live. Unsupported options are disabled *with the reason* ("Your browser can't encode MP4. WebM works everywhere.").

**2 — Rendering**: big percentage, frame counter, time remaining; the stage fast-forwards through the frames being encoded while the Dot travels the timeline; *Cancel*. A note asks to keep the tab in front for long exports.

**3 — Done**: file card (name, size, dimensions, duration) · *Download* (automatic) or *Save…* (file picker where supported) · *Export another format* · *Copy share link*.

Filenames: `ugoki-{template}-{w}x{h}-{fps}fps.{ext}` (+ `-cut-f{n}` for transitions).

---

## 8. Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Previous / next frame |
| `Shift` + `←` / `→` | −1 s / +1 s |
| `Home` / `End` | Start / end |
| `Cmd/Ctrl` + `Z` / `Shift` + `Cmd/Ctrl` + `Z` | Undo / redo |
| `Cmd/Ctrl` + `E` | Export |
| `Cmd/Ctrl` + `S` | Confirm saved (autosave) |
| `1` `2` `3` `4` | 16:9 · 9:16 · 1:1 · 4:5 |
| `G` | Safe-area guides |
| `R` | Reset selected element's position |
| `Esc` | Deselect / close |
| `?` | Shortcut sheet |
| `/` | Search (gallery) |

---

## 9. States & edge cases

| Situation | Behaviour |
|---|---|
| Template loading | Stage frame with the Dot pulsing; typically < 300 ms |
| Browser lacks WebCodecs video encoding (e.g. Firefox Android) | Editor works; Export offers GIF, PNG sequence and Still, explains why |
| Old browser | Banner: `Ugoki needs a recent browser (Chrome, Edge, Safari 17+, Firefox 130+).` |
| Huge image | Downscaled to 4096 px long side, with a quiet note |
| Unreadable file | `That file isn't an image we can read. Try PNG, JPG, WebP or SVG.` |
| Raster logo in a vector-only effect (Draw) | Template switches to its raster variant; inspector explains |
| Storage full | `Couldn't save your draft — browser storage is full. Export or delete old drafts.` |
| Share link with unknown template/version | Opens the closest valid state and explains what was reset |
| Tab hidden during export | Export continues in a worker; a notice recommends keeping the tab in front |
| Export or render error | Specific message + a safer fallback (lower resolution, other format) + **Copy details** (browser, codec config, template, step) so users can report issues voluntarily — Ugoki has no telemetry |

---

## 10. Onboarding

No tours, no modals. At most two first-run hints (dismissible, remembered locally): on the stage `Click anything to edit it`, on the transport `Space to play`. The gallery's personalization field is the real onboarding: it proves the product in one keystroke.

---

## 11. Accessibility (experience level)

- Every control is keyboard-operable with visible focus; the stage is operable by keyboard (Tab cycles editable elements; arrow keys nudge movable groups; Shift = ×10).
- Screen readers get the template name, a content summary, playback state and export progress.
- `prefers-reduced-motion`: no autoplay in the gallery, landing shows static frames with play buttons, UI transitions become fades. Playback inside the editor is always user-initiated.
- Touch targets ≥ 44 px on phones.
