# Outline AI — Reference Audit

Source audited: `marioquer/outline-ai` @ `749c4d5` (default branch, May 2026).
Purpose: pull out the design language, interaction patterns and architecture
decisions that Context Tree should reuse, and list what it should leave behind.

Outline AI was not modified. No code is imported from it at runtime. The demo
copies design tokens and CSS idioms, not components.

---

## 1. Architecture snapshot

| Concern | Outline AI | Context Tree choice |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19.2 | React 19 + **Vite**. The demo needs no server, and a static build is easier to host and to run with `pnpm dev`. |
| Language | TypeScript (strict) | TypeScript (strict) |
| Package manager | pnpm | pnpm workspaces |
| Styling | Tailwind v4 + shadcn/ui tokens, but almost all product surfaces are **hand-written semantic CSS classes** in `app/globals.css` (`.block`, `.ol-item`, `.msg-bubble`, …) | Plain CSS with the same token names. Tailwind isn't needed: the real look lives in the hand-written classes. |
| Fonts | Geist Sans, Geist Mono, Newsreader (serif, used for headings) via `next/font/google` | Same three families via Google Fonts |
| Animation | CSS transitions/keyframes only; FLIP in the outline done by hand; `tw-animate-css` for shadcn primitives | CSS only, plus a small FLIP helper for tree changes |
| Icons | `lucide-react` (12–14px, stroke 2) | `lucide-react` |
| State | Local React state in `ChatView` (no global store; no TanStack Query in the end despite the design doc) | Local React state + a reducer around `@context-tree/core` |
| Streaming | SSE via `@microsoft/fetch-event-source`; `meta` / `token` / `done` / `error` / `context_truncated` events; rAF-smoothed reveal buffer on the client | Scripted streaming in demo mode, with the same rAF reveal feel |
| Model abstraction | `LLMProvider { streamComplete, complete }` with `AnthropicAdapter` and `FakeLLMAdapter` (`USE_FAKE_LLM`) | `Generator` interface in core, with a deterministic fake for the demo and benchmarks |
| Section data model | `block { id, conversation_id, parent_block_id, title, depth 0..2, order_index (sparse ×1000), summary, summary_short, summary_at }`, `message { block_id, role, content, status, order_index, prompt/completion tokens }`, `conversation.active_block_id` | `ContextNode { id, title, parentId, childIds, checkpoint, recentMessages }`, `ContextTree.activeNodeId` |
| Context strategy | **Full history**: `flattenMessages` DFS-flattens every block's messages. The system prompt also embeds the whole outline with `← current section`. | **Active path only**: root checkpoint + active checkpoint + active recent delta. This is the main change. |
| Depth cap | `MAX_BLOCK_DEPTH = 2` (H1/H2/H3) | `maxDepth` configurable, default 3 levels |

Everything below is production-only and **not** carried over: Better-Auth, guest
accounts, Postgres/Drizzle, rate-limit counters, daily token credit, Vercel
config, drag-and-drop reparenting, localStorage collapse hydration scripts.

---

## 2. Visual system

### 2.1 Palette ("Threadwise": warm paper + muted plum/terracotta accent)

All colors are OKLCH. Light theme:

| Token | Value | Role |
|---|---|---|
| `--paper` | `oklch(0.985 0.005 80)` | page / card background |
| `--paper-2` | `oklch(0.965 0.006 80)` | sidebar, assistant bubble, composer |
| `--paper-3` | `oklch(0.945 0.008 80)` | active row, chips, code |
| `--ink` | `oklch(0.18 0.015 60)` | primary text, primary buttons |
| `--ink-2` | `oklch(0.34 0.013 60)` | secondary text |
| `--ink-3` | `oklch(0.55 0.012 60)` | muted labels, icons |
| `--ink-4` | `oklch(0.72 0.010 60)` | placeholders, meta, counts |
| `--hairline` | ink @ 10% | all borders (0.5px) |
| `--hairline-2` | ink @ 6% | hover fills |
| accent | `oklch(0.55 0.09 25)` | active border, level badge, dots, focus ring |
| `--accent-soft` | accent @ 10% | active glow ring, tags, selection |
| `--accent-ink` | `oklch(0.38 0.08 25)` | accent text |
| `--user-bg` / `--user-fg` | `oklch(0.28 0.018 30)` / paper | user bubble (dark on light) |
| blue (drag only) | `oklch(0.55 0.18 250)` | drop indicators, focus-visible outline |

The dark theme (`.dark`) keeps the same hues, flips lightness (paper ≈ 0.18–0.26,
ink ≈ 0.96–0.48), and lifts the accent to `oklch(0.72 0.10 25)`.

**Takeaway:** the identity is *warm off-white paper, near-black warm ink, one
muted terracotta accent, hairline borders*. It is explicitly not a black
developer dashboard.

### 2.2 Typography

- **Sans (Geist)** for UI and chat: body/chat `14.5px / 1.55`, letter-spacing
  `-0.003em`; rows `13px`; labels `11–12.5px`. Weight 450 for user bubbles.
- **Serif (Newsreader)** for anything that reads as a document heading:
  section titles `500 17px`, doc header `22px`, brand `20px / 600`, summary body
  `14px / 1.5`, empty states in *italic* 13px.
- **Mono (Geist Mono)** for level badges (`H1`), counts, meta lines, timestamps,
  `10.5–11.5px`.
- **Eyebrow labels**: `600 10.5–11px`, uppercase, letter-spacing `0.06–0.08em`,
  `--ink-3/4` (for example `OUTLINE`, `SUMMARY`, `PINNED`).

### 2.3 Spacing, radius, shadow

- Rhythm of 4/6/8/10/12/14/18px. Block header padding `14px 18px 12px`, messages
  `0 18px`, gap between messages `12px`, gap between sections `14px`, doc column
  padding `26px`.
- Radius: sections `14px`, composer `12px`, rows and buttons `7–8px`, chips
  `5px`, auth card `18px`. Bubbles use asymmetric radius: user
  `14 4 14 14`, assistant `4 14 14 14` (the "tail" corner).
- Borders are always `0.5px solid var(--hairline)`.
- Shadows are rare: `--shadow-soft` (1px inset highlight + 1px drop) and
  `--shadow-lift` (`0 8px 24px` + `0 2px 6px`, low alpha) for popovers.

### 2.4 Layout proportions

- Sidebar `272px` (collapses to a `48px` rail); outline `280px` (collapses to
  0); doc column `max-width: 820px` (1040 above 1500px wide, 1200 above 1900px).
- At ≤1100px both panels become absolutely positioned overlays with
  `--shadow-lift`, so the doc column never reflows.

---

## 3. Outline UI (right panel)

- Header: `#` icon + `OUTLINE` eyebrow + mono count chip (`paper-3` pill).
- Items (`.ol-item`): `padding 7px 10px`, radius 7, `13px` sans, one line with
  ellipsis. Level 0 is weight 500. Indentation is done with **padding-left**
  (level 1 → 22px, level 2 → 36px), not nested lists, so the indent can animate.
- Level marker: mono `H1/H2/H3` at 9.5px in `--ink-4`. On the active item it
  turns accent.
- States: hover = `--hairline-2` fill + `--ink-2`; **active = `--paper-3` fill +
  `--ink`**. The highlight follows the *active section*, not scroll position
  (a scroll-spy version was removed because it flickered).
- Hover preview: a floating card (`--shadow-lift`, 300px) with an accent eyebrow
  (`H2 SECTION`), serif title and a 4-line clamped summary.
- Tree changes animate with **FLIP**: capture rects, invert with `transform`,
  then transition `280ms cubic-bezier(0.22, 1, 0.36, 1)`. Padding (indent) also
  transitions, so re-parenting slides sideways.
- There is no expand/collapse per outline node. The outline is always fully
  expanded. Collapse lives on the sections in the main column.

## 4. Sections (main column)

- A section is a card (`.block`): paper background, hairline border, radius 14.
  Hover darkens the border to ink @ 18%.
- **Active section** = accent border @ 50% + `0 0 0 3px var(--accent-soft)` glow
  ring + an uppercase `ACTIVE` tag (accent-soft chip). This is the signature
  "you are here" state and the one Context Tree reuses for the committed node.
- Header: level badge (`H1` is solid ink with paper text; H2/H3 are paper-3 with
  a hairline border), then an inline-editable serif title input (placeholder
  *Untitled* in italic ink-4), then hover-revealed actions (Hide/Show with count,
  delete).
- Nesting in the doc column: `margin-left: depth × 22px` plus a 1px hairline
  guide line at `left: -12px`.
- Collapse: `grid-template-rows 1fr → 0fr`, `0.28s cubic-bezier(0.4,0,0.2,1)`.
- Summary card: paper-2, hairline, **2px accent left border**, `SUMMARY` eyebrow
  with a sparkles icon, serif body.
- Navigation flash: `blockFlash`, a 4px accent ring that fades in and out over
  0.9s.
- Title editing is inline. The first user message auto-titles the section
  (48 chars) and the title is revealed word by word at 90ms per word so it looks
  typed.

## 5. Chat UI

- User bubble: right-aligned, dark `--user-bg`, paper text, weight 450, radius
  `14 4 14 14`, plain text only (no markdown, so no injection surface).
- Assistant bubble: left-aligned, paper-2 fill + hairline, radius
  `4 14 14 14`, rendered with `react-markdown` + `remark-gfm`. Max width 88%.
- Before the first token: a single pulsing dot (`thinking-dot`, opacity + scale,
  1.1s).
- Streaming: SSE chunks go into a buffer that an rAF loop drains at an adaptive
  rate, which gives a smooth typewriter effect instead of bursts. `MessageItem`
  is memoized so only the streaming bubble re-renders.
- Auto-scroll: while streaming, a `useLayoutEffect` nudges `scrollTop` by the
  overshoot so the composer stays pinned, and stops following if the user
  scrolls up.
- **Composer** (inside the active section): paper-2, radius 12, focus = accent
  border + 3px accent-soft ring. Textarea `14.5px/1.55`, auto-grows to 200px.
  The bottom bar holds the model pill, a Send button (solid ink, radius 7, 30px
  high) or a Stop button, and a "+ Section" menu.
- Keyboard: Enter sends, Shift+Enter inserts a newline, IME composition is
  respected. `/h1 /h2 /h3 [title]` creates sections, with an inline hint card.
- **Section-specific chat:** the user must click a section to activate it before
  typing. The composer only renders inside the active section. **This is the
  step Context Tree removes.** There is one global composer, and Jev picks the
  section.
- Loading: `pulse-soft` dots, a counter-clockwise spinner for regenerate, and
  Sonner toasts centered over the doc column.

## 6. Hover, motion and focus vocabulary

| Pattern | Spec |
|---|---|
| Hover fill | `background: var(--hairline-2)` + text one ink step darker, `0.12s` |
| Revealed actions | `opacity 0 → 1`, `0.15s`, on parent hover or active |
| Panel open/close | width `0.26s cubic-bezier(0.4,0,0.2,1)` |
| Tree reorder | FLIP `280ms cubic-bezier(0.22,1,0.36,1)` |
| Pop-in | `translateY(6px) → 0` + fade, `0.22s ease-out` |
| Attention | `blockFlash` accent ring 0.9s; `pulse-soft` 1.2s |
| Focus | accent border @ 50% + 3px accent-soft ring (inputs); 2px blue outline (focus-visible rows) |

## 7. What Context Tree reuses and what changes

**Reuse directly (tokens and idioms):** the palette and dark theme, the three
font families and their roles, hairline borders, section card with active glow +
`ACTIVE` tag, outline row styling with mono level markers and padding-based
indent, bubble shapes, composer styling, eyebrow labels, FLIP tree animation,
thinking dot, `blockFlash`.

**Deliberate differences:**

1. **One global composer** at the bottom of the page instead of a composer
   inside the active section.
2. **Two highlight states** on the tree: *committed* (the Outline AI active
   style: paper-3 fill, accent marker, glow) and *preview* (a dashed accent
   outline with a soft pulse), so a typing-time prediction never looks like a
   commit.
3. **Exposed internals:** the Jev decision, candidate scores, latency and
   context token metrics are visible. They use the same eyebrow and mono
   vocabulary so they read as part of the product, not as a dashboard.
4. **Messages grouped by routed section in time order** (A → B → C → A shows
   *two* A groups), rather than all of a section's messages in one card. That
   makes returning to a context visible.
5. **Context is scoped.** Outline AI sends the full flattened history plus the
   full outline on every turn. Context Tree sends only the active path's
   checkpoints and the active node's recent delta.

## 8. Reusable ideas from Outline AI's domain layer

- `validateMove` / depth-clamp logic suggests the **nearest allowed ancestor**
  rule for FORK at max depth.
- Summaries as a **topic list** (`Topic: conclusion` + `Open:`) is a good
  checkpoint format: stable, skimmable and cheap to extend.
- Summaries are *not* auto-regenerated on every message. Context Tree keeps that
  rule: the checkpoint is stable and only re-folds when the delta passes a
  threshold.
- Anthropic gotchas already found there: the dated Haiku id is required, and
  summary transcripts must be sent as a single user turn.
