# 10 — UI / Product Motion

> Show software in motion without screen-recording anything. Five product stories: **interaction** (Click), **real-time events** (Notify), **app tour** (Scroll), **data** (Dashboard), **search & AI** (Command).

Category slug: `ui-motion` · Conventions: [`00-foundations.md`](00-foundations.md)

### Shared behaviour — the Ugoki UI Kit

These templates are built from the engine's **UI Kit**: procedurally drawn, *unbranded* interface components (cards, buttons, inputs, lists, toasts, notifications, charts, command palette, device frames, cursors) that take the palette as a theme (Light/Dark + `accent`). Every visible label is editable. No trademarked UI (no iOS/Android/macOS/Windows replicas), no real app names.

- **Cursor**: generic arrow or hand, drawn as vector, moving with a **minimum-jerk** profile (human-like acceleration), tiny overshoot-and-correct before targets, 1-frame press states.
- **Typing**: seeded human rhythm (variable inter-key timing, occasional short pauses at word boundaries).
- **Headline**: every UI template has an optional headline that explains the feature, laid out outside the UI area.
- **Device frame**: optional where it makes sense (phone/tablet/laptop/browser).

---

## 10.1 Click — *cursor demo*

**Use it for** SaaS feature demos, onboarding clips, fintech/payments, "how it works" posts.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `click` | 16:9 · 1:1 · 4:5 · 9:16 | 6 s (5–12) | in · hold · out | optional | UI Kit Light · accent Cobalt · `grotesk` headline |

**Art direction.** A single, well-composed UI card (e.g. a *Send money* panel: amount field, recipient row, primary button). A cursor performs the task; the button morphs through loading into success; a toast confirms.

**Choreography**
- `0.00–0.60` UI card rises (y +3u, `glide`) with a soft shadow.
- `0.60–1.20` Cursor enters from bottom-right on a curved path to the amount field; field focuses (ring).
- `1.20–1.90` Amount types in (seeded rhythm), digits formatted live.
- `1.90–2.60` Cursor moves to the button with a small overshoot-and-correct; hover state brightens the button.
- `2.70` Click: press (scale 0.96, 1-frame darken), ripple from the click point.
- `2.80–3.50` Button morphs (pill → circle, centered) into a spinner.
- `3.50–3.90` Spinner resolves into a check (trim path); button returns to pill with the success label.
- `3.90–4.40` Toast slides in from the top of the card.
- `hold` Cursor drifts away subtly. Out: card and headline fade/slide.

**Controls**
- Content: Scenario (Send money · Sign up · Generate · Book · Custom) · Headline · Card title · Field label & value · Recipient (the row under the field) · Button label · Done label · Success message
- Style: Theme (Light · Dark) · Cursor (Arrow · Hand)

Every visible label is editable, so the card title, the recipient row and the button's done label have controls too. A Scenario fills in its own example copy (and field kind: Send money types a live-formatted amount) for every text the user hasn't edited — edits always win.

**Defaults.** Scenario *Send money* · Card title `Send money` · `Amount` `€250.00` · to `Alex Novak` · Button `Send` → `Sent` · Success `Sent. Instantly.` · Headline `Payments in one tap.`

**Implementation notes (0.3.0).** The card rises in `in`; the interaction plays from the start of the hold at human speed and is compressed (down to ~0.6×) at short durations so the success state keeps ≥ 0.5 s to be read. The success pill keeps the accent (the toast's badge carries the green). The toast lands as a banner over the card's title and, on long holds, dismisses itself after ~3.4 s.

**Looks.** Light/Cobalt · Dark/Mint · Light/Ink

**The expensive detail.** Minimum-jerk cursor motion with a human pause before the click, and a button morph that preserves center and radius continuity (pill → circle → pill).

**Engine needs.** UI Kit (card, input, button, toast) · cursor path helper · rounded-rect morphs · trim paths.

---

## 10.2 Notify — *notification stack*

**Use it for** app launches, fintech, e-commerce, creator milestones, "everything happens here" stories.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `notify` | 9:16 · 4:5 · 1:1 · 16:9 | Auto (≈ 5–10 s) | sequence | no | UI Kit Dark on Midnight wallpaper |

**Art direction.** A generic lock-screen composition: large time and date (optional) over a procedural wallpaper; notifications (icon, app name, title, message, time) slide in from the top and stack. Frosted cards blur the wallpaper behind them (possible because Ugoki renders the wallpaper itself).

**Choreography**
- `0.00–0.60` Wallpaper settles (scale 1.04 → 1); time and date fade in.
- Every 0.6–0.9 s: a notification slides in from the top (−4u, scale 0.95 → 1, opacity; spring with slight overshoot); earlier cards move down on a delay-coupled spring.
- After 3 cards, older ones compress into a stacked group (scale 0.95, 70% opacity).
- End: headline rises at the bottom; hold 1.5 s.

**Controls**
- Content: Notifications (2–6: app name, icon (image or initials + color), title, message, time) · Headline
- Style: Wallpaper (Gradient · Image · Solid) · Clock (on/off) · Theme (Light · Dark)
- Motion: Pace · Duration (Auto · Fixed)

**Defaults.**
- `Halden Pay` · *Payment received* · `€1,200.00 from Studio North`
- `Orders` · *New order #4096* · `2 items · ships today`
- `Insights` · *Milestone* · `You just passed 10k followers`
- Headline `Everything, as it happens.`

**Implementation notes (0.5.0).** Notifications are one text control, one per line: `App | Title | Message | Time` (time optional, "now" by default). Every visible label is editable, so the clock's time and date have controls, and an *App icon* (logo) shows on the first app's notifications — the others get a tile in the palette's accent family with a glyph matched to the app's name (payments, orders, insights…) or its initials. *Wallpaper image* (scenes) shows when Wallpaper is Image; adding your own picture switches to it. Cards arrive 0.6–0.9 s apart (by how much there is to read, × Pace); a card is solid within ~0.1 s and frosts everything behind it, including the card it lands on. Tucked cards: 95 % / 70 %, then 90 % / 40 %; deeper ones hide behind. The exit fades the stack, clock and headline while the wallpaper returns to 104 %, so the first and last frames are the same wallpaper. 9:16, 4:5 and 1:1 stack clock, cards and headline; 16:9 puts the clock and headline left of the cards. A fixed duration scales the gaps (0.5–1.4×) and the final read (≥ 0.8 s).

**Looks.** Dark/Midnight · Light/Blush · Dark/Forest

**The expensive detail.** Physically coupled springs (new card lands, older cards react a beat later) and true backdrop blur of the wallpaper behind each card.

**Engine needs.** UI Kit (notification card, clock) · layered blur via compositor (backdrop from own wallpaper layer) · coupled springs.

---

## 10.3 Scroll — *phone scroll tour*

**Use it for** app store previews, website tours, portfolio case studies, product walkthroughs.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `scroll` | 16:9 · 1:1 · 4:5 · 9:16 | 8 s (5–15) | in · hold · out | optional | `grotesk` · Paper · procedural app screen |

**Art direction.** A generic phone showing a **tall screenshot** that scrolls in natural *flicks*; at each pause, a caption appears beside the phone with a thin connector line to the relevant area; optional tap ripples.

**Choreography**
- `0.00–0.80` Phone slides in (`glide`), optionally tilted in 3D.
- Flick *n*: fast start with exponential deceleration (v(t) = v₀·e^(−t/τ), τ ≈ 0.325 s — iOS-like), then a 1.2–1.8 s pause.
- At each pause, caption *n* reveals (mask) and its connector draws.
- Overscroll: a small rubber-band bounce if the screenshot's end is reached.
- Out: phone slides away; captions fade.

**Controls**
- Content: Screenshot (tall image) · Captions (1–4, each with a scroll position picked on a mini-map) · Headline
- Style: Device finish · Tilt (Flat · 3D) · Tap ripples (on/off)

**Defaults.** Procedural long feed screen · `Your week at a glance` · `Smart insights` · `Share in one tap`

**Implementation notes (0.5.0).** Captions are one per line (up to 4); there is no mini-map control yet, so each caption stops at the next spot of the built-in screen's tour (Feed: week, insights, share, post), and a trailing `@ 60%` sets a stop by page position instead (on a screenshot, stops spread evenly otherwise). *Screen* picks the built-in UI Kit screen (Feed · Finance · Analytics · Chat · Settings) or *Image*; *Screenshot* is an image slot — your own file always replaces the built-in screen, the built-in artworks show when Screen is Image (a `screen` placeholder kind would merge the two). Also *Theme* (Light · Dark) for the screen. *Device finish*: Graphite · Silver · Sand · None (a frameless screen). *Tilt 3D* is an axonometric turn-and-lean (no perspective foreshortening yet). *Tap ripples* also shows the finger: a disc that lands, drags with the page and lifts at the release. One caption shows at a time, beside the phone, level with its connector; the last stop, when it is the end of the page, is thrown past it and rubber-bands. Default headline: `Your whole week, in one app.`

**Looks.** Paper · Ink · Lilac

**The expensive detail.** Real inertial scroll physics (flick + decay + rubber band) instead of linear panning — it looks like a person used the app.

**Engine needs.** Inertial scroll helper · device frame · optional 3D plane · caption connectors.

---

## 10.4 Dashboard — *analytics build*

**Use it for** SaaS launches, investor updates, analytics features, monthly reports.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `dashboard` | 16:9 · 1:1 · 4:5 · 9:16 | 7 s (5–12) | in · hold · out | no | UI Kit Light · accent Cobalt |

**Art direction.** A dashboard grid of cards: 3 KPI cards, a line chart, a bar chart and a donut; clean spacing, tabular figures, restrained color (one accent + neutrals).

**Choreography**
- `0.00–1.00` Cards scale/fade in with a grid-order stagger (0.06 s); gridlines and axis labels fade in *before* data.
- `0.80–2.00` KPI numbers count up (`glide` on value), deltas slide in (green/red via palette-safe tints).
- `1.00–2.20` Line chart draws (trim path) with its area fill fading in under it; a tooltip pops at the peak point.
- `1.20–2.30` Bars grow with stagger and slight overshoot (`pop`).
- `1.40–2.40` Donut sweeps to its value.
- `hold` A new data point appears on the line chart (live feel). Out: cards fade in reverse grid order.

**Controls**
- Content: Headline · KPIs (2–4, one per line: `label value change`, e.g. `Revenue €48.2k +12.4%`, or `label | value | change`) · Line data (comma-separated) · Bar data · Donut value · Donut label
- Style: Theme (Light · Dark) · Density (Comfortable · Compact)

The line chart is titled with the first KPI's label and uses its units on the axis and tooltip (`€58k`); the bar chart is titled with the second KPI's label (7 bars read as a week). The donut's title is its own control (every visible label is editable).

**Defaults.** Headline `See growth as it happens.` · `Revenue` `€48.2k` `+12.4%` · `Active users` `8,431` `+5.1%` · `Conversion` `3.8%` `+0.6 pt` · Line `12, 18, 15, 22, 28, 26, 34, 39, 37, 45, 52, 58` · Bars `34, 42, 39, 51, 47, 62, 58` · Donut `72%` `Monthly goal`

**Implementation notes (0.3.0).** The live data point scrolls the chart one step (new segment drawn on, tooltip following the newest value, a pulse on the newest point); long holds get up to three updates.

**Looks.** Light/Cobalt · Dark/Graphite · Light/Mint

**The expensive detail.** Monotone curve interpolation (no fake overshoot in data), scaffolding before data, and tabular figures everywhere.

**Engine needs.** UI Kit charts (line/area, bars, donut) · monotone cubic interpolation · number formatting.

---

## 10.5 Command — *command bar & AI answer*

**Use it for** AI features, search, productivity tools, developer tools, keyboard-first products.

| ID | Formats | Duration | Structure | Alpha | Default look |
|---|---|---|---|---|---|
| `command` | 16:9 · 1:1 · 4:5 · 9:16 | 7 s (5–12) | in · hold · out | optional | UI Kit Dark · accent Lilac |

**Art direction.** A floating command palette (rounded, frosted over a soft procedural background): search input with a shortcut hint, a results list with icons, a selection highlight, and an answer card that streams text word by word.

**Choreography**
- `0.00–0.60` Palette scales in from 0.96 with blur 8 → 0 (`glide`).
- `0.80–2.20` Query types in (seeded human rhythm).
- `2.20–2.80` Results appear (stagger 0.05 s).
- `3.00–3.60` Selection highlight glides down two rows (spring with slight stretch); `↓` key hints flash.
- `3.80` `↵`: the selected row expands into an answer card.
- `3.90–5.20` Answer streams word by word (0.06 s/word) with a soft caret.
- `hold` Caret blinks. Out: palette scales down and fades.

**Controls**
- Content: Placeholder · Query · Results (3–6 labels, icon type) · Answer (optional) · Shortcut hint · Headline
- Style: Theme (Light · Dark)

**Defaults.** Placeholder `Search or ask…` · Query `Turn this into a launch video` · Results `Pick a template` / `Apply brand colors` / `Export as 4K MP4` · Answer `Done. Your video is ready.` · Shortcut `⌘K`

**Implementation notes (0.5.0).** Results are one per line (3–6), each with an icon picked from its words (template, colors, export, share…). The highlight glides from the first row to the third (the last, with fewer) — one ↓ per row. ↵ opens the chosen row into the answer card: the row becomes its header and the answer streams in token by token (words with their leading space, punctuation apart, long words in pieces) behind a soft dot caret; with no answer, the palette just holds. The palette grows with its results and settles into the card on the energy's spring. The footer shows keycaps only (↑ ↓ ↵ esc). The glass frosts its own drifting color fields; with a transparent background it turns into a denser, solid panel. 16:9 sets the headline left of the palette, the other formats above it. Default headline: `Ask, and it’s done.`

**Looks.** Dark/Lilac · Light/Ink · Dark/Graphite

**The expensive detail.** A human typing rhythm and a selection highlight that moves on a spring with a subtle stretch — the difference between "animated mockup" and "real product".

**Engine needs.** UI Kit (palette, list, answer card) · typing & streaming helpers · frosted panel (compositor blur of own background layer).
