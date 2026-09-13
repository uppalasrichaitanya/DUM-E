# DUM-E — Landing Page Spec (v1)

> **Purpose of this document.** This is the single source of truth for designing and
> building DUM-E's public download page. It is written to be handed to a design agent
> (GPT Astra) or a frontend engineer and executed end-to-end. It contains: the product
> facts, the brand system, every section with exact copy, the interaction and motion
> spec, responsive rules, accessibility, performance, SEO, and the **asset plan**
> (see [`ASSET-PLAN.md`](./ASSET-PLAN.md) for the full image-capture procedure).
>
> **Companion files in this folder:** [`ASSET-PLAN.md`](./ASSET-PLAN.md) ·
> [`README.md`](./README.md) · `assets/` (drop real captures here).
>
> **Status:** ready for design. Open decisions are listed in [§17](#17-open-decisions-blocking).

---

## 0. How to use this spec

1. Read §1–§3 (product + brand + voice) fully before designing.
2. §4 is strategy. §5 is the page, section by section, with final copy.
3. §6–§8 are motion, interaction, responsive. §9–§11 are a11y, performance, SEO.
4. §12–§14 are the build/tech spec, file layout, and definition of done.
5. §15–§17 are assets, legal/constraints, and open decisions.
6. `ASSET-PLAN.md` is the executable plan for every image.

**Do not invent a new visual language.** DUM-E already has one (documented in the
repo's `DESIGN.md` and `docs/ART-TECHNIQUES.md`). This page must look like the app's
own splash screen grew into a website.

---

## 1. Product in one page

**DUM-E** is an internal, Windows-first desktop app (Electron) that turns ordinary
coding-agent CLIs into a **self-coordinating team of robots on a shared 2D lab floor**.

- It wraps four engines: **OpenCode** (the default), **Qwen Code**, **Claude Code**, and **OpenAI
  Codex** — plus configurable custom/local endpoints.
- Every agent is a **real CLI session in a real PTY** — not a wrapper, not a chat UI.
- Each agent gets its own working directory, long-term memory, an inbox/outbox, and
  access to a shared task board.
- **DUM-E is the orchestrator.** It spawns first, reads the board, delegates to
  workers, routes messages, supervises, and escalates to the human. The human stays
  in control.

**One-liner:** *The arm that runs the lab.*
**Supporting line:** *Spawn coding agents, give each one memory and a mailbox, and let DUM-E run the floor.*
**Brand line:** *DUM-E is the boss of the floor. You are still the boss of it.*
**Short description:** *An agent hub for your team.*

### 1.1 Required product facts (state these clearly and honestly)

| Fact | Value |
|---|---|
| Version | **0.1.1** |
| License | **MIT** |
| Primary target | **Windows 10+ x64** |
| Also supported | **Linux** (AppImage) |
| macOS | Build config exists; **experimental**, not the target |
| Network posture | **Local-first. No telemetry. No analytics. No DUM-E cloud.** |
| Data | Stays on the machine (engine providers may have their own policies) |
| Keys | Bring-your-own-key where the engine requires it; local LLM endpoints supported |
| Default engine | **OpenCode** |
| Requirements | One engine CLI installed + logged in; internet on first use |
| Setup help | **DUM-E installs Node.js and missing agent CLIs itself** (via nodejs.org / npm) |
| Builds | **Unsigned** — Windows SmartScreen / Linux desktops will ask for trust once |
| Maturity | Early prototype; fixes target `main` |
| Naming | Robot names are Marvel-inspired **internal** names and may change |

> ⚠️ **Correct the naive version of this:** the page must **not** tell users to
> "install Node.js." DUM-E installs Node and the CLIs for them. Node is only a
> prerequisite for **building from source**. See §5.10.
>
> ⚠️ **Font note:** the shipped app no longer uses VT323 or Pixelify Sans. Use the
> shipped trio: **Press Start 2P / Inter / JetBrains Mono** (§3.3).

---

## 2. Primary conversion goal

**The one action:** download DUM-E.

- **Primary CTA:** `Download for Windows` → GitHub releases page
  (`https://github.com/uppalasrichaitanya/DUM-E/releases/latest`, or the specific
  latest Windows asset).
- **Secondary actions (demoted to text links, not buttons):** `See it in action`
  (anchor scroll) · `View source` (GitHub) · `Download portable` · `Linux build` ·
  `Browse releases`.

**CTA ladder (no competing hierarchy):**
- **Sticky nav** — one small `Download` button.
- **Hero** — one primary `Download for Windows` button; secondary actions as inline
  text links.
- **Download section** — three platform cards; Windows setup is the primary button.
- **Footer** — one `Download` link.

Every CTA points at the same destination family. The page should make downloading
unavoidable without ever feeling pushy.

---

## 3. Visual direction

### 3.1 Overall feel

A **Robot lab coming online**: a command center with living systems, a SNES-era menu
rebuilt with modern frontend craft, a technical tool with personality. Handcrafted,
not template-generated.

**Communicate:** *There is a real system behind the pixels.*

**Avoid:** generic gradients, glassmorphism, soft rounded cards, purple AI
aesthetics, stock illustrations, floating abstract blobs, purposeless whitespace,
enterprise SaaS language, fake terminal screenshots, generic robot imagery,
AI-generated visual noise, excessive neon, decorative complexity that reduces clarity.

### 3.2 Color system

**Brand layer (use for hero, nav, CTAs, dark surfaces):**

| Token | Hex | Use |
|---|---|---|
| `--lab-dark` | `#04101E` | hero + dark section background (matches app splash) |
| `--reactor-blue` | `#266FD6` | primary action, system energy, links |
| `--deep-reactor` | `#0C3878` | borders, shadows on dark |
| `--arc-glow` | `#4D9BE8` | glow, hover, LEDs |
| `--dum-e-gold` | `#F4D35E` | helpfulness, completion, achievement highlights |
| `--danger-red` | `#C03028` | danger / warnings / failures **only** |

**Supporting SNES layer (use for readable cream content sections):**

| Token | Hex | Use |
|---|---|---|
| `--cream` | `#FFFDF5` | lightest surface |
| `--paper` | `#FFF8E7` | default panel fill |
| `--warm-panel` | `#F4E9C7` | inset / alt |
| `--ink` | `#1A1320` | body text, outlines (**never pure black**) |
| `--ink-soft` | `#3D2E4A` | secondary text |
| `--muted-ink` | `#6B5878` | tertiary text |

**Agent accents (cast + status):**

| Token | Hex | Token | Hex |
|---|---|---|---|
| `--coral` | `#FF6B6B` | `--lemon` | `#FFD93D` |
| `--mint` | `#6BCF7F` | `--lilac` | `#B197FC` |
| `--sky` | `#4ECDC4` | `--peach` | `#FFA07A` |

**Color rules:** ≤ ~8 dominant colors per visual region · red reserved for danger ·
gold for helpfulness/active achievement/completion · reactor blue for primary
actions · never pure black · no default purple-on-white AI styling · **no gradients**
except a restrained two-stop title-bar/reactor-light treatment.

### 3.3 Typography

**Bundled in the app** (`src/renderer/src/assets/fonts/`): `press-start-2p-latin-400.woff2`,
`inter-latin-var.woff2`, `jetbrains-mono-latin-var.woff2`. **Self-host these exact
files** on the landing page — no Google Fonts, no external font host.

| Role | Family | Use |
|---|---|---|
| Display | **Press Start 2P** | logo labels, display headlines, section markers, badges, short pixel labels |
| Body / UI | **Inter** | body copy, nav, descriptions, readable interface text |
| Mono | **JetBrains Mono** | terminal text, system labels, logs, machine readouts, filenames |

**Type rules:** never use bold as the main style — use weight, scale, color, borders,
and spacing · headings compact and confident · body ≥ 14px and highly readable ·
avoid excessive uppercase · keep display text short so pixel character survives ·
generous paragraph line-height.

### 3.4 Surface & border language

Every panel is a **DUM-E SNES panel**:
- Outer ink border → middle cream or reactor-blue border → inner ink border.
- Hard offset shadow: `4px 4px 0 rgba(26, 19, 32, .25)`.
- **Square corners. No border-radius. No blur. No soft diffuse shadows. No glass.**
- Implement with stacked `box-shadow: inset ...` or layered borders — not nested DOM
  if avoidable.

**Buttons:** chunky, pixel-snapped, clearly interactive, visibly pressed on click.
- Resting: hard offset shadow.
- Hover: shadow shifts 2px; arc-glow appears.
- Pressed: moves down-right; shadow reduces; `translate(2px, 2px)`.
- Focus: 2px reactor-blue or ink outline.
- Disabled: desaturated but still readable.

*Reference implementation exists in `src/renderer/src/components/PixelPanel.tsx`,
`PixelButton.tsx`, and `pixelButton.css`. Mirror those recipes.*

**Pixel snapping:** integer transforms, `image-rendering: pixelated` on every sprite/
screenshot of the floor, integer zoom scales (1×, 2×, 3× only).

### 3.5 Brand assets (real files in the repo)

| Asset | Path |
|---|---|
| Logo mark (raster) | `src/renderer/src/brand/logo.png` (512×512) |
| Logo mark (vector, source of truth) | `src/renderer/src/brand/logo.svg` (1024×1024) |
| App icon | `build/icon.png` (1024×1024) |
| App icon (Windows) | `build/icon.ico` |
| Hero floor capture | `docs/screenshots/dum-e-floor.png` (1550×830) |
| Splash motif | CSS in `src/renderer/index.html` (arc-reactor rings, scanlines, typed title) |

---

## 4. Voice & tone

Friendly, brief, factual. *An Animal Crossing villager who happens to be technically
literate.*

- Use the robot's **name**, never "the agent."
- Short lines. System feedback under 12 words.
- Second person: "your floor," "DUM-E keeps it moving."
- **No emojis** (the product uses pixel icons). No exclamation marks except
  completions.
- Never salesy. No fake urgency.

**Use:** `Ada is reading SPEC.md.` · `DUM-E keeps the floor moving.` · `A task
arrived.` · `Vision is planning.` · `VERONICA is standing by.` · `The board is
shared.` · `The terminal is real.`

**Avoid:** "Revolutionary" · "Unlock your productivity" · "Supercharge your
workflow" · "The future of work" · "AI-powered" · "Seamless collaboration" · "10x"
· "Magic" · "Game-changing".

---

## 5. Page structure (build in this exact order)

### 5.1 Sticky navigation

- **Desktop:** left = logo mark + `DUM-E` wordmark; center/right = `Features` ·
  `How it works` · `The cast` · `Screenshots` · `Requirements` · `GitHub`; far right
  = `Download` button.
- **Mobile:** logo + `Download` only. No hamburger.
- **Style:** thin; lab-dark over hero, transitions to a cream/panel treatment on
  scroll (or stays lab-dark with a bottom border). Pixel border. Reactor-blue active
  indicator. Must not obscure content.

### 5.2 Hero

- **Background:** `--lab-dark`.
- **Motif:** restrained arc-reactor — concentric pixel rings, thin scanlines, orbit
  sparks, sparse grid marks, small diagnostic labels, ≤2 emissive zones. No
  cyberpunk clutter.
- **Eyebrow (mono, small):** `DUM-E / WORKSHOP CONTROL SYSTEM`
- **Wordmark (Press Start 2P, large):** `DUM-E`
  - *Note:* avoid duplicating the wordmark with the eyebrow. If both read "DUM-E,"
    make the eyebrow a system label only, or drop the separate wordmark. Pick one.
- **Headline:** `The arm that runs the lab.`
- **Subhead:** `Spawn coding agents, give each one memory and a mailbox, and let DUM-E run the floor.`
- **Secondary line:** `Real terminals. Shared tasks. A robot floor you can supervise.`
- **Primary CTA:** `Download for Windows`
- **Secondary (text links):** `See it in action` · `View source`
- **Trust strip:** `Windows 10+` · `MIT` · `Local-first` · `No telemetry` · `Qwen / Claude / Codex / OpenCode`
- **Microcopy under CTA:** `Free to use. Unsigned build. Windows will ask you to trust it once.`
- **Hero visual:** the floor screenshot in a strong pixel panel, large enough to read
  at a glance. Caption: `The floor is the interface. Watch the work move.`
- **In-world status labels** around the visual (clearly illustrative):
  `DUM-E ONLINE` · `3 WORKERS ACTIVE` · `TASK BOARD SYNCED` · `MAIL ROUTE STABLE`
- **Mobile:** CTA appears before the screenshot; crop the floor usefully.

### 5.3 What it is (three panels)

Each panel is understandable in under five seconds.

**Panel 1 — Real terminals.**
> Every robot runs a live CLI session. No simulated chat window.
Visual: pixel terminal glyph, VT323/JetBrains-Mono-style status line, blinking cursor.

**Panel 2 — Memory + mailboxes.**
> Robots remember work, route messages, and share a task board.
Visual: envelope, `memory.md`, `inbox/`, `outbox/`.

**Panel 3 — An orchestrator.**
> DUM-E delegates the work while you supervise the floor.
Visual: central robot arm, branching task lines, human operator indicator.

### 5.4 How it works (designed pixel diagram)

Main flow:

```
        YOU
         │
         ▼
   DUM-E  /  ORCHESTRATOR
         │
         ▼
 QWEN · CLAUDE · CODEX · OPENCODE
```

Around DUM-E, connected modules: `memory.md` · `inbox / outbox` · `tasks.json` ·
`fleet.json`.

- Use pixel arrows, connector lines, status lights, one animated message packet, one
  envelope traveling the diagram.
- Distinguish human / orchestrator / workers / shared state clearly.

**Supporting copy:** `You set the mission. DUM-E keeps the floor moving.`
**Engine bridging line:** `Qwen, Codex, and OpenCode are bridged into the same event system as Claude.`
**Architecture note:** `The terminal plane carries the real CLI session. The event plane keeps the floor legible.`

Do not over-explain implementation. Make it readable visually.

> **Verify before publishing:** confirm `fleet.json` is still emitted (the README
> lists it). If not, use `registry.json` instead.

### 5.5 The lab floor (visual centerpiece)

Large, spacious section. Main floor screenshot + secondary screenshots in pixel-framed
panels, plus zoomed crop details. No overcomplicated carousel — a horizontal rail or a
controlled grid, keyboard-accessible, usable without JS.

**Show:** DUM-E at the holo-table · robots walking between stations · server-rack LEDs
· charging bay · envelopes moving between workers · completion pulse · terminal
activity · shared task board · memory graph.

**Required message:** `The floor is not decoration. It is the status system.`
**Ambient:** `Rack LEDs blink. The charger steams. Robots bob and blink. When a task completes, the reactor pulse travels across the room.`

### 5.6 Features grid (3×3 desktop)

Each card: pixel icon · title · 2–3 lines · a tiny in-world status/file label · a hover
state with meaningful feedback.

1. **Real terminals** — Live CLI sessions · xterm.js · fullscreen terminal pool.
2. **Agent-to-agent mail** — Outbox → inbox routing · reply tracking · hop caps that
   prevent loops.
3. **Long-term memory** — Per-robot `memory.md` · condensing · optional semantic search.
4. **Task kanban** — DUM-E creates, assigns, and moves cards · shared board · task
   detail overlay.
5. **Cost guardrails** — Token caps · cost caps · max turns · circuit breaker.
6. **Triggers** — Scheduled missions · HTTP webhooks · Slack ingestion.
7. **Voice control** — Push-to-talk dictation · voice orchestration · BYOK.
8. **Shareable hires** — `dum-e://hire` deep links · ready-to-spawn robot manifests.
9. **Procedural art** — Robot portraits generated in-repo · no third-party product
   art · regenerable pixel assets.

### 5.7 The cast

Responsive pixel portrait grid. Every portrait: procedural pixel image · name · short
role · small accent color · optional status label · hover/focus treatment · alt text.

| Robot | Role | Accent |
|---|---|---|
| DUM-E | orchestrator, runs the floor | `#266FD6` |
| H.E.R.B.I.E | researcher and librarian | `#8FD14F` |
| Vision | planner and architect | `#B03060` |
| Ultron | relentless heavy builder | `#D64541` |
| Ultron-bot | ephemeral parallel workers | `#8A3130` |
| MODOK | analyst: telemetry, costs, reports | `#E8B93E` |
| VERONICA | rescue agent for broken builds | `#3E8EDE` |
| EDITH | integrations and monitoring | `#4DB6AC` |
| LYLA | scheduler for missions and triggers | `#E06FA8` |
| Rover | web explorer | `#C97B3D` |
| Sentinel | general worker | `#9B6BDC` |
| Doombot | general worker | `#5B6E7A` |
| Butterfingers | sandbox tinkerer | `#F4A259` |

**Interaction idea:** on hover/focus, a portrait activates with a terminal-style line:
`VISION / PLANNING` · `ROVER / RESEARCHING` · `VERONICA / RESCUE READY` ·
`DUM-E / ORCHESTRATING`.

Tone: warm, strange, technically capable — not childish.

**Legal note (show it):** `Robot names are Marvel-inspired internal names and may change before public distribution.`

### 5.8 Engines

Four engine marks (Qwen, Claude, Codex, OpenCode). Use official marks only if license
permits; otherwise use clean text marks. **Never invent a logo.**

**Copy:** `Bring your own keys. Plug in a local model. OpenCode is the default.`

Compatibility panel (mono):

```
QWEN       SUPPORTED
CLAUDE     SUPPORTED
CODEX      BRIDGED
OPENCODE   DEFAULT
CUSTOM     CONFIGURABLE
```

Note: `DUM-E coordinates the engines. It does not replace them.`

### 5.9 Download section (conversion block)

**Headline:** `Put the floor on your machine.`
**Supporting:** `Start with one engine CLI. DUM-E handles the rest of the workshop setup.`

Three platform cards (confirm the exact release asset names before shipping; use
`0.1.1` consistently):

| Card | Filename | Description | Button |
|---|---|---|---|
| Windows Installer | `DUM-E-0.1.1-win-x64-setup.exe` | Standard per-user installer. No administrator access required. | `Download for Windows` (primary) |
| Windows Portable | `DUM-E-0.1.1-win-x64-portable.exe` | Single-file portable build. No install. No registry changes. | `Get portable` |
| Linux | `DUM-E-0.1.1-linux-x86_64.AppImage` | Make executable, then run. | `Download for Linux` |

Below the cards: `All releases on GitHub` (link).

**Honesty panel:** `These are unsigned builds. Windows SmartScreen and Linux desktop environments may ask you to trust DUM-E the first time it starts.`

Also show: version `0.1.1` · MIT license · GitHub repo link · release date **only if
verified**. **No fake download counts, testimonials, or user logos.**

### 5.10 Requirements (compact checklist)

- Windows 10+ x64 (primary target)
- Modern Linux distribution
- Internet connection on first use
- One engine CLI installed and logged in
- API keys depending on engine
- Local LLM endpoints supported where configured

**Corrected note (important):**
> `DUM-E installs Node.js and any missing agent CLIs itself on first use (via nodejs.org / npm). You only need Node yourself if you're building from source.`

**Developer note:**
> `Windows builders: npm install may require Visual Studio Build Tools with "Desktop development with C++" for better-sqlite3.`

Do not bury prerequisites.

### 5.11 FAQ (accordion, 5–7 items)

- **Is DUM-E free?** Yes. MIT licensed, built as an internal team tool.
- **Does DUM-E send my code anywhere?** Local-first. No telemetry, no analytics, no
  DUM-E cloud. Engine providers may have their own policies.
- **Which engines are supported?** Qwen Code, Claude Code, OpenAI Codex, OpenCode, and
  configurable custom engines.
- **Do I need an API key?** Depends on the engine. BYOK and local LLM endpoints are
  supported.
- **Why does Windows warn me?** The distributed builds are unsigned; SmartScreen may
  warn on first launch.
- **Is macOS supported?** Windows is the primary target. macOS build configuration
  exists but should be described as experimental unless verified.
- **Can robots talk to each other?** Yes — file-based mailboxes, routing, shared tasks,
  memory, and reply tracking.

**Accordion behavior:** keyboard-accessible · clear open/closed state · minimal motion
· visible focus · pixel/mechanical hinge indicator.

### 5.12 Footer

DUM-E logo · tagline `The arm that runs the lab.` · GitHub · Releases · MIT License ·
Security policy · Contributing · security contact `girichaitanya11@gmail.com` ·
`Built by the DUM-E team` · current year · `No analytics. No trackers.`

Tone: the workshop powering down — not a generic legal block.

---

## 6. Seamless looping motion system

The page must feel alive, never distracting. One continuous loop that returns to its
initial state with no visible jump. **Full atmospheric loop: 12–18s.**

### 6.1 Motion elements

| # | Motion | Priority |
|---|---|---|
| 1 | Low-intensity arc-reactor pulse (hero bg) | **must** |
| 2 | Subtle scanline movement | **must** |
| 3 | Tiny orbit sparks around the reactor | nice |
| 4 | Occasional blinking server LEDs | nice |
| 5 | Robot idle animation in the hero floor | nice |
| 6 | A small envelope traveling between two stations | **must** |
| 7 | Soft holo-table flicker | nice |
| 8 | Completion pulse when the envelope arrives | nice |
| 9 | Ambient steam/dust in the charging bay | nice |
| 10 | Gentle terminal cursor blink | **must** |

> **Scope realistically.** If time/perf is tight, ship the four **must** motions and
> drop the rest. Do not sacrifice first paint or end up with visual noise. The four
> musts alone deliver the "quiet workshop" feeling.

### 6.2 Motion rules

- Integer transforms where possible; preserve pixel edges.
- Slow, readable; staggered timing so the lab feels autonomous.
- Seamless loop; **no element teleports at the loop boundary**.
- CSS / SVG / Canvas / lightweight sprite animation. **No heavy video if procedural
  works; no animation libraries.**
- Keep first paint fast.
- **Respect `prefers-reduced-motion`:** replace movement with static frames and
  restrained opacity changes.
- Never animate the entire page continuously. Never scroll-jack.

**Feel:** *a quiet workshop operating in the background while the operator watches.*

---

## 7. Interaction design

Implement thoughtfully, then stop:
- Scroll-triggered section reveals (subtle, staggered pixel-panel entrances).
- Hover states for buttons and robot portraits.
- Smooth anchor navigation.
- Animated message packet in the architecture diagram.
- Floor ambient loop; terminal cursor blink; server LED blink.
- FAQ accordion.
- Screenshot focus/zoom behavior.
- Download button press feedback.
- Optional copy-to-clipboard for filenames.

**Do not animate everything.** Under `prefers-reduced-motion`, disable: continuous
floor movement, scroll reveals, orbit animations, floating particles, animated message
packets. Keep the same visual hierarchy.

---

## 8. Responsive design

**Desktop (≥1280px):** editorial wide layout · large floor visual · three-column
panels · 3×3 feature grid · roster grid.

**Tablet:** two-column panels · reduced hero scale · scrollable screenshot rail ·
two-column features.

**Mobile:** CTA visible without scrolling · logo + download in nav · compact hero text ·
screenshot below the primary CTA · single-column panels · horizontally scrollable or
two-column roster · stacked download cards · one-hand-operable FAQ · no tiny text · no
unreadable diagram · **integer scaling for pixel art**.

Minimum body text: **14px**.

---

## 9. Accessibility (WCAG AA)

Semantic HTML · keyboard navigation · visible focus rings · proper `<button>` elements
· accessible accordion controls · meaningful image alt text · decorative animations
hidden from screen readers · reduced-motion support · no information conveyed by color
alone · strong contrast for lab-dark text · the screenshot must never be the *only* way
to understand the product.

---

## 10. Performance

Static HTML/CSS/JS output · lazy-load below-the-fold screenshots · WebP/AVIF with PNG
fallback · lightweight hero animation · no large video unless compressed and necessary
· no heavy animation libraries · no unnecessary frameworks · responsive images ·
preload only the hero image + primary fonts · progressive/minimal JS · **page remains
useful with JavaScript disabled** · no analytics, trackers, cookie banners, or external
marketing scripts.

---

## 11. SEO & metadata

**Title:** `DUM-E — The Agent Hub for the Lab`
**Description:** `DUM-E coordinates real coding-agent terminals into a local-first robot team with shared memory, mailboxes, tasks, and a visual workshop floor.`

Include: canonical URL placeholder · Open Graph title/description/image · Twitter card
metadata · favicon from the DUM-E icon · `theme-color` `#04101E` · proper heading
hierarchy · descriptive alt text · `SoftwareApplication` structured data if appropriate.

---

## 12. Technical & hosting spec

- **Static site.** A single optimized HTML/CSS/JS page is ideal. If a framework is
  used, output must be static.
- **Self-host fonts** from the app's bundled woff2 files (§3.3). No external font host.
- **Pixel art:** `image-rendering: pixelated`, integer scaling only.
- **Downloads:** link to GitHub releases (`/releases/latest` preferred so the page does
  not rot per version).
- **No trackers.** Default to none.
- **Suggested output:** `web/index.html`, `web/styles.css`, `web/app.js` (progressive
  enhancement only), `web/assets/**`.

---

## 13. File layout (this folder)

```
web/
  LANDING-PAGE-SPEC.md   ← this file
  ASSET-PLAN.md          ← every image, how to capture it, exact dimensions
  README.md              ← orientation
  assets/
    brand/               logo.png, logo.svg, icon.png, favicon
    screenshots/         full-app captures (see ASSET-PLAN)
    cast/                13 robot portraits
    engines/             engine marks (licensed or text)
    fonts/               self-hosted woff2
    social/              OG card
    motion/              loop strips / sprites if used
```

---

## 14. Definition of done

- [ ] All 12 sections built in order, with final copy above.
- [ ] Real DUM-E assets used (no generic substitutes); placeholders clearly labeled.
- [ ] Pixel system crisp at every viewport; integer scaling; no border-radius/blur.
- [ ] Seamless 12–18s loop (at minimum the four must-have motions).
- [ ] `prefers-reduced-motion` fully honored.
- [ ] Unsigned-build warning visible and calm.
- [ ] Local-first + no-telemetry claims prominent.
- [ ] Every CTA has a clear destination; one primary hierarchy.
- [ ] Passes WCAG AA; keyboard-operable; semantic HTML.
- [ ] Works with JS disabled; no trackers.
- [ ] Fast first paint; lazy below-fold images.
- [ ] No unsupported claims, fake metrics, fake testimonials, invented integrations.
- [ ] Version `0.1.1` consistent in every filename and badge.
- [ ] **Node requirement stated correctly** (DUM-E installs it) — see §5.10.

### 14.1 Final quality bar

1. Within **5s**, a visitor understands DUM-E coordinates real coding-agent terminals.
2. Within **10s**, a visitor sees the actual robot floor.
3. Within **15s**, a visitor knows where to download it.
4. It does **not** resemble a generic AI startup site.
5. The pixel system stays crisp at every viewport.
6. The loop is seamless and subtle.
7. The product feels alive without becoming noisy.
8. The unsigned-build warning is visible and honest.
9. Local-first / no-telemetry claims are prominent.
10. It works on desktop and mobile.
11. Every CTA has a clear destination.
12. No fake metrics/testimonials/claims.
13. It feels like DUM-E itself: a small robot workshop quietly doing useful work.

**Emotional target:** *"This is not another agent chat wrapper. This is a living control
room for real coding agents, and I want to watch it work."*

---

## 15. Asset direction

Use existing product assets; never replace real DUM-E assets with generic substitutes.
The complete, executable image plan — every shot, its source, exact command, dimensions,
crop, and destination — is in **[`ASSET-PLAN.md`](./ASSET-PLAN.md)**.

If an asset is missing: use a **clearly labeled placeholder**, keep the pixel language,
do not invent polished fake UI, and keep the layout production-ready for replacement.

---

## 16. Constraints, disclaimers, legal

- **Internal tool.** Decide public vs internal before design (§17). This drives naming
  and tone.
- **Marvel-inspired names + logo.** `cast.ts` and `ATTRIBUTION.md` state the cast names
  are internal and must be swapped before public distribution. The brand mark depicts
  the DUM-E character. If the page is public, either rename and re-art the cast, or get
  clearance.
- **Unsigned builds.** State plainly; do not hide the trust prompt.
- **Early prototype.** Set expectations honestly; fixes target `main`.
- **Version drift.** `package.json` = `0.1.1`; README badges/table and some assets still
  say `0.1.0`. Reconcile to `0.1.1` everywhere.
- **Type drift.** `DESIGN.md` says Pixelify Sans / VT323; the shipped app uses Inter /
  JetBrains Mono. This spec follows the **shipped** app (§3.3).

---

## 17. Open decisions (blocking)

Answer these before design starts:

1. **Public or internal?** Drives Marvel-naming, logo usage, tone.
2. **Hosting:** GitHub Pages, custom domain, or internal?
3. **Is macOS actually shipped**, or "not yet / experimental"?
4. **Exact release asset filenames** for 0.1.1 (confirm against built artifacts).
5. **Engine logos:** licensed marks available, or text marks?
6. **Loop scope:** ship all ten motions, or the four must-haves?
7. **Command Center screenshots:** capture fresh (recommended, see ASSET-PLAN), or
   defer with labeled placeholders?

---

## Appendix A — Section anchor IDs

`#top` · `#what` · `#how` · `#floor` · `#features` · `#cast` · `#engines` ·
`#download` · `#requirements` · `#faq` · `#footer`

## Appendix B — CTA destinations

| CTA | Destination |
|---|---|
| Download for Windows | latest Windows setup release asset |
| Get portable | latest Windows portable asset |
| Download for Linux | latest Linux AppImage asset |
| Browse releases / All releases | `github.com/uppalasrichaitanya/DUM-E/releases` |
| View source / GitHub | `github.com/uppalasrichaitanya/DUM-E` |
| See it in action | `#floor` anchor |
| Security policy | repo `SECURITY.md` |
| Contributing | repo `CONTRIBUTING.md` |
