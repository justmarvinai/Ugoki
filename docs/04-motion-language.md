# 04 — Motion Language

> The shared vocabulary behind every Ugoki template **and** Ugoki's own interface. If a template spec says `glide`, `stagger 0.08 s` or *Punchy*, this document defines exactly what that means. Users never see any of this — they see *Energy*, *Duration* and results that feel right.

---

## 1. The Ugoki feel

Motion in Ugoki is **precise, confident and alive**:

- **Precise** — decisive easing, crisp masks, exact timing on frame boundaries. Nothing drifts aimlessly.
- **Confident** — few elements, strong hierarchy, generous holds. We don't animate everything; we animate the right thing.
- **Alive** — even at rest something breathes (1–3% drift, a slow push, grain). Nothing is ever frozen, nothing is ever fidgety.

The test for every template: *would a senior motion designer ship this frame-by-frame?*

---

## 2. Time model

- All timing is **continuous seconds** (`t: number`). Templates are pure functions of `(props, format, t)` — never of frame numbers, wall-clock time or fps.
- Frames are sampled at `t = frame / fps`. Frame 0 is `t = 0`.
- **Sections**: `in · hold · out` templates declare their `in` and `out` durations (at *Balanced* energy). The engine derives `hold = duration − in − out` and exposes section-relative helpers (see [`06-engine.md`](06-engine.md) §Timeline).
- **Clean tail**: every `in · hold · out` template ends its `out` ≥ 0.1 s before the end, so the last frame is clean at every fps.
- **Stepped time** for mechanical effects: `stepped(t, 24) = floor(t × 24) / 24`. Used for grain, scramble, split-flaps, pixel steps, cursor blinks — so a 60 fps export has the same *cadence* as a 24 fps one.
- **Cut points** (transitions): 100% coverage must hold for a **plateau of ≥ 50 ms centered on the cut point**, so the cut frame is fully covered at every supported fps (24–60).
- **Beat grid** (optional): `bpm` → beat length `60 / bpm`. Cuts and hits snap to beats/half-beats. Ready for audio later.

---

## 3. Easing library

Seven named curves. Templates and UI use **only these names** (plus springs) — never ad-hoc beziers.

| Name | cubic-bezier | Character | Use for |
|---|---|---|---|
| `glide` | `0.16, 1, 0.3, 1` | Fast start, long silky settle (expo-out family) | **Default entrance.** Text reveals, elements arriving, focus pulls |
| `snap` | `0.83, 0, 0.17, 1` | Decisive in-out (quint) | Wipes, panels, blocks, transitions, position changes |
| `swift` | `0.4, 0, 0.2, 1` | Standard, neutral | UI state changes, small repositions, the Ugoki interface |
| `exit` | `0.7, 0, 0.84, 0` | Accelerates away (expo-in family) | **Exits.** Things leaving the frame or collapsing |
| `drift` | `0.37, 0, 0.63, 1` | Gentle sine in-out | Holds, ambient motion, editorial fades, camera pushes |
| `pop` | `0.34, 1.56, 0.64, 1` | Back-out, ~10% overshoot | Badges, stickers, icons, UI chips — things with physicality |
| `linear` | — | Constant | Loops, marquees, progress bars, continuous rotation. Nowhere else |

### Springs

Springs are solved **analytically** (closed-form damped harmonic oscillator), so any `t` can be evaluated directly — scrubbing and export are exact. `ζ` = damping ratio.

| Name | stiffness | damping | mass | ζ | Overshoot | Settles in | Use for |
|---|---|---|---|---|---|---|---|
| `gentle` | 120 | 20 | 1 | 0.91 | ~0.1% | ~0.45 s | Large, calm moves (devices, cameras) |
| `snappy` | 400 | 28 | 1 | 0.70 | ~4.6% | ~0.30 s | UI, pills, bubbles, layout pushes |
| `lively` | 500 | 25 | 1 | 0.56 | ~12% | ~0.26 s | Punchy energy's spring: pronounced but controlled pop |
| `bouncy` | 300 | 12 | 1 | 0.35 | ~31% | ~0.65 s | Playful templates only (Bounce, stickers) |
| `heavy` | 40 | 13 | 1 | 1.03 | 0% | ~0.95 s | Slow, weighty settles (Stack photos) |

(Overshoot and 2%-settle times were computed from the closed-form step response during planning.)

### Special curves

| Curve | Definition | Used by |
|---|---|---|
| **Log zoom** | Interpolate `log(scale)` linearly (then ease the parameter) — constant perceived zoom speed | Zoom, camera pushes > 1.5× |
| **Inertial scroll** | `v(t) = v₀·e^(−t/τ)`, τ ≈ 0.325 s; rubber-band past bounds | Scroll |
| **Gravity + bounce** | Parabolic fall; each bounce ≈ 0.55× the previous height; volume-preserving squash | Bounce |
| **Minimum-jerk** | `10s³ − 15s⁴ + 6s⁵` along a curved path — human hand motion | Cursor in UI templates |
| **Area easing** | Ease the covered *area*, then derive radius (`r ∝ √area`) | Iris, circular reveals |

---

## 4. Energy — the one motion control users need

Users never touch curves. They choose **Energy**, and every template maps it consistently:

| Parameter | Calm | Balanced | Punchy |
|---|---|---|---|
| In/out durations | ×1.35 | ×1.0 | ×0.75 |
| Stagger gaps | ×1.4 | ×1.0 | ×0.7 |
| Travel distances | ×0.6 | ×1.0 | ×1.35 |
| Overshoot | none (springs → `gentle`/`heavy`) | subtle (`snappy`) | pronounced (`pop`, `lively` spring; ≤ 15%) |
| Preferred curves | `glide` long, `drift` | `glide`, `snap` | `snap`, `pop`, hard cuts |
| Motion blur shutter | 90° | 180° | 270° |
| Blur-in amounts | ×1.2 | ×1.0 | ×0.8 |
| Hold micro-motion | slow drift | drift | beat pulses |

Stagger gaps are real seconds: `ctx.stagger(gap)` compensates for the time scale that `tl.p` applies to entrance/exit windows, so a 0.08 s line gap becomes 0.112 s in Calm and 0.056 s in Punchy — not 0.08 × 1.4 × 1.35.

Rules: *Calm is not slow Balanced* (it changes character: fewer overshoots, softer reveals). *Punchy is not fast Balanced* (it adds cuts, pops and bigger travel). Templates may override individual rows in their spec where the genre demands it (e.g. Cinematic has no Punchy overshoot).

---

## 5. Duration & reading time

- `in · hold · out`: **only the hold stretches or shrinks** when the user changes duration. Entrances and exits keep their crafted timing.
- **Minimum readable hold**: `clamp(0.9 s + 0.28 s × words, 1.5 s, 8 s)` for the template's primary text.
- **Beat length** (sequences): `clamp(0.28 s + 0.045 s × characters, 0.3 s, 1.2 s) × pace`.
- If the chosen duration makes the hold shorter than the readable minimum, the editor **warns, never blocks** ("Might be hard to read — try 6 s").
- **Auto duration** (sequences, quotes): duration = sum of beats + in/out; the timeline shows it as *Auto*.

---

## 6. Choreography rules

1. **Hierarchy in time.** The hero arrives first; supporting elements follow 100–200 ms later.
2. **Overlap.** The next action starts before the previous one ends (30–50% overlap). Sequential-without-overlap reads as PowerPoint.
3. **Entrances decelerate, exits accelerate**, state changes ease in-out.
4. **Exits are ~30% faster** than entrances and simpler.
5. **Direction is meaning.** Things leave in the direction they were travelling; one dominant axis per template.
6. **Masks before fades.** Primary text is revealed from behind an edge (line masks, shape edges). Fades are for secondary elements and ambience.
7. **Small travel for text** (1–8u), large travel for panels and transitions.
8. **One focal point at a time.** Never two heroes moving simultaneously.
9. **Stagger is rhythm.** Uniform staggers over more than ~12 items become a crawl — use accelerating staggers or groups.
10. **Holds are alive** (1–3% drift, slow push, breathing) — and never distracting while text must be read.
11. **Overshoot only where physicality is expected** (badges, stickers, UI). Never on editorial text.
12. **Respect physics**: squash preserves volume, bounces decay, shadows soften and grow with height.
13. **Seeded randomness only** — organic variation within ±10–20%, identical on every render.
14. **Clean edit points**: frame 0 and the last frame are clean; loops are seamless; transitions hit full coverage on the cut plateau.
15. **Legibility first**: primary text is still and sharp for at least the readable minimum.
16. **Motion blur on anything fast**; nothing moving more than ~2u per frame is ever unblurred in export.
17. **No linear motion** except loops, marquees, progress and continuous rotation.
18. **Everything scales with the frame** — sizes, distances and blur radii in `u`, never pixels.
19. **Motion matches meaning**: finance and luxury default to Calm; social hooks default to Punchy.
20. **Sound-ready**: key hits sit on a beat grid, so music can be added later without re-timing.

---

## 7. Stagger system

| Pattern | Order | Typical use |
|---|---|---|
| `forward` | first → last | Reading order: words, lines, list items |
| `reverse` | last → first | Exits that retract into origin |
| `center-out` | middle → edges | Stretch, symmetric reveals |
| `edges-in` | edges → middle | Closings, collapses |
| `random` | seeded shuffle | Tiles, grids, pixel blocks |
| `accelerating` | gaps shrink geometrically (×0.85) | Long lists, many tiles |

**Granularity**: glyph (typical gap 0.015–0.035 s), word (0.03–0.12 s), line (0.06–0.12 s), element (0.06–0.35 s). All gaps are multiplied by the Energy stagger factor.

---

## 8. Typography in motion

- **Kerning is sacred.** Text is shaped as whole runs (HarfBuzz); per-glyph animation starts from the shaped positions, so kerning and ligatures survive.
- **Animate positions, never re-layout.** Tracking animations move glyphs; font-size is never animated for text meant to be read (use scale).
- **Masks are sized from font metrics** (ascender/descender + 8% padding) so descenders never clip at rest.
- **Optical alignment**: hanging punctuation for quotes, overhang compensation for round/diagonal letters at display sizes, cap-height alignment when mixing sizes, italic overhang compensation.
- **Line breaking**: balanced lines, no single-word last line when avoidable, prefer breaks at punctuation; user line breaks always win.
- **Auto-fit**: font size shrinks within the template's `[min, max]`; beyond that the inspector warns and the control's `maxLength` caps input.
- **Numbers**: tabular figures (`tnum`) whenever digits change; reserve the final width so layouts never shift.
- **Case & tracking**: uppercase gets +2% to +14% tracking by size; large display type gets −2% to −4%.
- **Readable sizes**: body text ≥ 3.2u; nothing essential below 2.4u.

---

## 9. Motion blur & finish

- **Motion blur = temporal supersampling.** The engine renders *N* sub-frames across the shutter interval `(θ / 360) × (1 / fps)` and averages them in a float buffer. Because templates are pure functions of `t`, this is exact and needs no per-template work.
- **Samples**: live playback and scrubbing 1 · paused previews 8 · export Standard 4 · High 8 · Max 16 — and fast motion gets more (paused up to 24, export up to 16 · 32 · 64) until each sub-frame moves at most 4 / 4 · 2.5 · 1.5 px, so fast edges smear smoothly instead of in steps (ADR-032). Frames without motion always render once.
- **Shutter** comes from Energy (90° / 180° / 270°); templates may set a genre shutter (Hype whip pans: 360°).
- **Finish** (global control): *Clean* (none) · *Grain* (animated at stepped 24 fps, applied after motion blur so grain stays crisp) · *Soft glow* (thresholded bloom). All finishes are subtle by design.
- Never blur: UI chrome in UI templates at rest, text during its readable hold, anything in a still (PNG) export.

---

## 10. Loops & transitions

- **Loops**: all periodic motion uses periods that divide the loop duration; marquees use exact repeat units; seeded variation is periodic. Test: frame N+1 ≡ frame 0.
- **Transitions**: symmetric around the cut point unless the spec says otherwise; direction consistent before/after the cut; coverage plateau ≥ 50 ms.

---

## 11. Color in motion

- Interpolate colors in **OKLCH** (shortest hue path) — no muddy RGB midpoints.
- Contrast is guaranteed by palette roles (see [`templates/00-foundations.md`](templates/00-foundations.md) §5); a color change must keep text/bg contrast ≥ minimums on every frame where text is readable.
- Background color cuts land on frame boundaries; crossfades between saturated colors should be ≤ 0.3 s or avoided.

---

## 12. Layout in motion

- `u` = 1% of the frame's short side. All layout, travel and blur values are in `u`.
- Layouts are computed against **safe areas** (title-safe, action-safe, social UI zone) per format.
- Each format gets its own composition (not a crop): templates define layout rules per aspect ratio where needed.
- **Movable groups** (user drag/scale) keep their animation *relative* to the moved position.

---

## 13. Anti-patterns — never ship these

- Elastic/bouncy easing on serious or editorial text.
- Everything fading in at once; everything with the same duration.
- 360° spins, lens flares, confetti, glitter — unless the template's genre explicitly calls for it.
- Linear moves outside loops/progress.
- Long entrances (> 1.2 s) for simple text; shaky text while it needs to be read.
- Animating font size (reflow jitter) instead of scale.
- Random (unseeded) anything.
- Ignoring safe areas; text touching frame edges.
- Hard black drop shadows; rotating gradients; stock "whoosh" clichés.

---

## 14. Motion review checklist

- [ ] Hero first, overlap present, exits faster than entrances
- [ ] All three energies feel intentionally different
- [ ] Min and max duration both read well; hold is alive
- [ ] Masks never clip at rest; kerning intact during per-glyph motion
- [ ] Motion blur on fast moves in export; nothing blurred while reading
- [ ] Clean first/last frame, seamless loop or exact cut plateau
- [ ] Identical render in preview, export and every browser (golden frames)
