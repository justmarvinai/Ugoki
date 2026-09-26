# ugoki

**Make it move.** Ugoki (動き — *movement*) is a browser-based motion design tool. Pick a professionally art-directed template, make it yours, preview it live, and export it — rendered entirely on your device. No sign-up, no uploads, no watermark.

**Choose → Customize → Preview → Export**

---

## Status

**Phase 0 — Planning.** The complete plan is written; no application code yet. Next step: answer [`USER_QUESTIONS.md`](USER_QUESTIONS.md) (or accept the recommendations) and give the go-ahead to start Phase 1.

## The plan

| Document | What's inside |
|---|---|
| [Product](docs/01-product.md) | Vision, positioning, competitors, personas, principles, scope, metrics, risks |
| [Experience](docs/02-experience.md) | Routes, flows, landing, gallery, editor, export, shortcuts, states |
| [Design system](docs/03-design-system.md) | Brand, voice, color, type, layout, components, UI motion, anti-patterns |
| [Motion language](docs/04-motion-language.md) | Easing, springs, Energy, timing, choreography & typography rules |
| [Architecture](docs/05-architecture.md) | Stack, system design, structure, state, storage, security, testing, deployment |
| [Engine](docs/06-engine.md) | Deterministic rendering engine and the template contract |
| [Export](docs/07-export.md) | Formats, codecs per browser, pipeline, transparency, reliability |
| [Decisions](docs/08-decisions.md) | Architecture decision records |
| [Template library](docs/templates/README.md) | 50 launch templates in 10 categories, fully specified |
| [Roadmap](ROADMAP.md) | Phases 0–7 to v1.0 and beyond |
| [Changelog](CHANGELOG.md) | What changed, when |
| [Questions](USER_QUESTIONS.md) | Decisions needed from the product owner |
| [CLAUDE.md](CLAUDE.md) | Working agreement for AI-assisted development |

## Stack at a glance

Next.js 16 · React 19.3 · TypeScript 7 · Tailwind CSS 4 · a custom deterministic engine (Canvas 2D + WebGL2 in Web Workers, HarfBuzz typography) · WebCodecs + Mediabunny for on-device export · IndexedDB for local drafts · hosted as static pages on Vercel.
