# Jev protocol (`jev.route.v0`)

`JevRouter` talks to a Jev backend through one request/response pair. Any model that implements it can route a Context Tree. Types live in [`packages/jev/src/protocol.ts`](../packages/jev/src/protocol.ts).

> Status: this is the protocol this repository proposes. It is what `HttpJevBackend` sends. If the hosted Jev model uses a different shape, adapt it in a custom `JevBackend` and leave `JevRouter` unchanged.

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
import { JevRouter, HttpJevBackend, LocalJevBackend } from '@context-tree/jev';

new JevRouter();                                                    // LocalJevBackend
new JevRouter({ backend: new HttpJevBackend({ url, apiKey }) });    // hosted Jev
```

`LocalJevBackend` is a deterministic reference scorer. It uses IDF-weighted lexical overlap that ignores terms shared by most candidates, title and ancestor-path mentions, hashed-embedding similarity, a continuation prior for the current node, and FORK signals: explicit new-thread phrasing, unseen terms, and unseen capitalized names. It exists so the demo and benchmarks run offline, and as a baseline a trained Jev should beat.
