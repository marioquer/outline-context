# Jev protocol (`jev.route.v0`)

`JevRouter` talks to a Jev backend through one request/response pair. Types live in [`packages/jev/src/protocol.ts`](../packages/jev/src/protocol.ts). Three backends implement it:

| Backend | Import | What it calls |
| --- | --- | --- |
| `GatewayJevBackend` | `@context-tree/jev/gateway` (server-side) | real Jev: `typesafe-ai/jev` on the Vercel AI Gateway via the AI SDK's `experimental_evaluate` |
| `HttpJevBackend` | `@context-tree/jev` | any endpoint that accepts a `JevRequest` and returns a `JevResponse` (the demo's `/api/jev` route) |
| `LocalJevBackend` | `@context-tree/jev` | the in-process reference scorer (default) |

## How a route becomes a Jev evaluation

Jev is an evaluation model: it answers typed questions about one shared state. `GatewayJevBackend` sends **one** `evaluate` call per message with two `choice` questions, following the calling pattern in `marioquer/jev-mdr`:

```ts
await evaluate({
  model: 'typesafe-ai/jev',
  state: {
    new_message: 'Back to pricing — should Pro be $15 or $20?',
    current_context: 'Outline AI / Launch',
    contexts: {
      c0: { path: 'Outline AI / Product / Pricing', relation: 'other', summary: '…', recent_user_turns: ['…'] },
      c1: { path: 'Outline AI / Launch', relation: 'current', summary: '…', recent_user_turns: ['…'] },
    },
  },
  questions: {
    route: {
      type: 'choice',
      instructions: 'Which working context does new_message belong to? … Choose NEW only for a durable new working context …',
      criteria: { c0: 'Outline AI / Product / Pricing', c1: 'Outline AI / Launch (current context)', NEW: 'A new durable working context …' },
    },
    parent: {
      type: 'choice',
      instructions: 'If new_message started a new working context, which existing context would it sit under? …',
      criteria: { c0: '…', c1: '…' }, // only contexts below maxDepth
    },
  },
});
```

- `answers.route.probabilities` becomes the per-candidate probabilities, and `NEW` becomes the FORK probability. These are the numbers the demo shows; nothing is reconstructed from prose.
- `answers.parent.choice` becomes the fork parent (clamped to `maxDepth` by the session).
- Candidates get positional keys (`c0…`). Node ids are noise to the model and cost tokens.
- If Jev returns a bare choice without a distribution, the choice gets 0.88 and the rest is spread evenly (the same rule as jev-mdr).
- Keys: `AI_GATEWAY_API_KEY`; `JEV_MODEL` overrides the model id. The gateway rate-limits by request (30/min in jev-mdr's account), so the session reuses a typing-time preview on send when the text and tree are unchanged, and `pnpm bench:jev` spaces its calls.

## Wire format (`HttpJevBackend`)

## Request

```jsonc
{
  "version": "jev.route.v0",
  "message": "Back to pricing — should Pro be $15 or $20?",
  "activeNodeId": "launch",
  "activePath": ["Outline AI", "Launch"],
  "allowFork": true,
  "maxDepth": 3,
  "candidates": [
    {
      "id": "pricing",
      "title": "Pricing",
      "path": ["Outline AI", "Product", "Pricing"],
      "depth": 2,
      "relation": "other",            // current | parent | ancestor | sibling | child | descendant | other
      "summary": "…checkpoint / description…",
      "recent": ["What should the free tier include?", "Monthly or annual billing first?"],
      "recencyRank": 1                // 0 = most recently active
    }
  ]
}
```

## Response

Return logits (preferred) or probabilities for each candidate, plus the FORK option and the parent a new node would attach to:

```jsonc
{
  "scores": [{ "id": "pricing", "logit": 4.1 }, { "id": "launch", "logit": 0.3 }],
  "fork": { "logit": -1.2, "parentId": "pricing" },
  "model": "jev-…"
}
```

- Logits are softmaxed together with `fork.logit`. Probabilities (`p`) are normalised to sum to 1.
- Unknown ids are ignored. A response with no known ids fails, and `JevRouter` falls back.
- `fork.parentId` must be one of the candidates. The session clamps it to `maxDepth`.
- Jev does not generate titles or text.

## Decision rule

`JevRouter` passes the probabilities to `decide()` in core:

1. If `P(fork)` is greater than the best node's probability → **FORK** under `fork.parentId`.
2. Else if the best node is the current node, or the current node is within `stayMargin` (0.08) of it → **STAY**.
3. Else → **SWITCH** to the best node.

`confidence` is the probability of the chosen option. `candidateScores` holds all probabilities, including `@fork`.

## Timeouts and fallback

`JevRouter({ timeoutMs = 1500, fallback = new MockRouter() })`. On timeout, network error, non-2xx or a malformed response, the fallback router decides. The returned decision carries `source: "jev:<backend>→fallback:<router>"` and `fallbackReason`.

## Backends

```ts
import { JevRouter, HttpJevBackend } from '@context-tree/jev';
import { GatewayJevBackend } from '@context-tree/jev/gateway';

new JevRouter();                                                          // LocalJevBackend
new JevRouter({ backend: new GatewayJevBackend(), timeoutMs: 12_000 });   // real Jev, server-side
new JevRouter({ backend: new HttpJevBackend({ url: '/api/jev' }) });      // real Jev through your own server
```

Use a longer `timeoutMs` with real Jev: jev-mdr measured roughly 400–600 ms per call, and the default 1500 ms leaves little headroom.

`LocalJevBackend` is a deterministic reference scorer. It uses IDF-weighted lexical overlap that ignores terms shared by most candidates, title and ancestor-path mentions, hashed-embedding similarity, a continuation prior for the current node, and FORK signals: explicit new-thread phrasing, unseen terms, and unseen capitalized names. It exists so the demo and benchmarks run offline, and as a baseline a trained Jev should beat.

## Typing-time routing ("the section moves after one or two words")

Real Jev cannot run per keystroke: the gateway limits requests (30/min in jev-mdr's account) and a call takes roughly 0.4–0.6 s. The demo (`apps/demo/src/engine.ts`, `typing.ts`) combines three things:

1. **Instant local guess at every word boundary.** `tree.preview(draft, { router: localRouter })` runs the in-process reference backend (<1 ms, free), so the predicted node moves as soon as a word is complete. It is labelled `PREVIEW · LOCAL GUESS`.
2. **Paced real Jev.** `JevPacer` sends the latest draft to Jev at word boundaries (or after 450 ms idle): at most one call in flight, calls spaced `60 000 / JEV_RATE_LIMIT + 100` ms apart, drafts typed in between are skipped rather than queued. Its answer replaces the guess (`PREVIEW · JEV`); a failed call shows `PREVIEW · FALLBACK` with the reason.
3. **Freshest prefix wins, and send reuses Jev.** The inspector shows whichever answer covers the longest prefix of the current draft (ties go to Jev), so a late answer for an older draft never overwrites a fresher guess. If Jev already answered for the exact text being sent, `tree.add()` reuses it: no extra call.

Typing a 45-character message at a normal pace costs about three Jev calls; the inspector shows the calls used in the last minute against the limit.
