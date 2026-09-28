# Context Tree

A semantic context switcher for long-running LLM conversations.

Every message does one of three things:

**STAY** · **SWITCH** · **FORK**

![Context Tree demo: four messages hop Pricing → Architecture → Launch → Pricing, then a FORK creates KV Cache under Benchmark](docs/assets/demo.gif)

<sub>Left: the linear chat a model normally sees. Middle: the same messages under the context Jev routed them to. Right: the tree, Jev's decision and scores, and the size of the working context. Run it yourself with `pnpm dev` and open `?demo=true`.</sub>

## How it works

```
Message
   ↓
Candidate Builder      locality + recency + semantic top-k → 8–16 nodes
   ↓
Jev                    one bounded decision, with probabilities
   ↓
STAY / SWITCH / FORK
   ↓
Context Tree           active pointer moves; FORK adds a node
   ↓
Working Context        root checkpoint + active path + active checkpoint + recent turns
   ↓
LLM
```

Jev decides **where**. The LLM decides **what to say**.

Jev can also route a draft while you type (preview) without committing anything. The active context changes only when you send.

## Quick start

```bash
pnpm install
pnpm dev            # demo at http://localhost:5173/?demo=true
pnpm example        # minimal SDK example in the terminal
pnpm test
pnpm bench          # regenerates benchmarks/results/RESULTS.md
```

Requires Node 20+ and pnpm. No API keys needed: without keys, the demo, tests and benchmarks run locally and deterministically on Jev's local reference backend.

### Live mode (optional)

```bash
cp .env.example .env.local   # add AI_GATEWAY_API_KEY and/or ANTHROPIC_API_KEY
pnpm jev:check               # one live Jev call, printed verbatim
pnpm dev                     # the header shows JEV · typesafe-ai/jev and LLM · <model>
```

| Key | Enables |
| --- | --- |
| `AI_GATEWAY_API_KEY` | real Jev ([`typesafe-ai/jev`](https://vercel.com/ai-gateway/models) on the Vercel AI Gateway) for routing in the demo, `pnpm jev:check`, `pnpm bench:jev` |
| `ANTHROPIC_API_KEY` | live Claude replies in free-chat mode (`?demo=true&live=true` for the scripted demo too) with measured input, cache and TTFT in the inspector; `pnpm bench:llm` |

Keys stay in the Vite dev server (`apps/demo/server/api.ts`); the browser never sees them. A typing-time preview that matches the sent text is reused on send, so each message costs one Jev call.

```ts
import { createContextTree } from '@context-tree/core';
import { JevRouter } from '@context-tree/jev';
import { GatewayJevBackend } from '@context-tree/jev/gateway'; // server-side

const tree = createContextTree({
  router: new JevRouter({ backend: new GatewayJevBackend() }), // omit backend for the local reference scorer
  root: 'My project',
});

const result = await tree.add({ role: 'user', content: 'Back to pricing — should Pro be $15 or $20?' });

result.decision;   // e.g. { action: 'switch', targetNodeId: '…', confidence: 0.97, candidateScores: [...], latencyMs: 1.9 }
result.activePath; // ['Product', 'Pricing']
result.context;    // { system, messages, checkpoint, recentMessages, tokens: { total, stablePrefix, delta, current } }

// Send result.context.system + result.context.messages to your model, then:
await tree.add({ role: 'assistant', content: reply });
```

Other entry points:

- `tree.preview(draft)`: route without committing (typing-time preview)
- `tree.toJSON()` / `createContextTree({ router, initial })`: serialize and restore
- `tree.createNode(...)`, `tree.record(...)`, `tree.activate(...)`: seed or import a tree

See [`examples/basic`](examples/basic/index.ts) for a complete runnable script.

## Why it matters

- **Less irrelevant history.** The model sees the active branch, not every topic you touched.
- **Topic continuity.** Returning to an old topic restores its context, not a keyword search over it.
- **Smaller, cache-friendly prompts.** The working context stays roughly constant as history grows, and its prefix only changes when you switch.
- **Human-readable state.** The same tree is navigation for the user and context state for the machine.

## Benchmarks

Everything below is measured by `pnpm bench` on seeded, reproducible datasets. Full tables, per-case JSON and methodology are in [`benchmarks/results/RESULTS.md`](benchmarks/results/RESULTS.md) and [`docs/benchmarks.md`](docs/benchmarks.md).

| Strategy | Topic return: fact in context | Collision: right fact, no conflicting fact | Input tokens at 173K history | Input cost, `ABCDEFGABCDEFG` switching (simulated cache) |
| --- | --- | --- | --- | --- |
| Recent window (12 msgs) | 0% | 0% | 853 (fact missing) | $0.0436 |
| Full history | 100% | 0% | 173,034 | $0.0568 |
| Vector retrieval (top-8 + last 4) | 100% | 0% | 414 | $0.0382 |
| **Context Tree + Jev** | **100%** | **75%** | **516** | **$0.0350** |
| Context Tree, oracle routing | 100% | 100% | 512 | $0.0355 |

Routing (57 hand-labelled cases): the local Jev reference backend reaches **89%** target accuracy (STAY 100%, SWITCH 88%, FORK precision 100% / recall 80%). A lexical baseline reaches 70%. Median routing latency is 0.45 ms in-process.

How to read this honestly:

- These are **context-level** measurements. They check whether the right fact (and no conflicting fact) is in what the model would see, not what the model answers. `pnpm bench:llm` grades real answers with an API key; it has **not been run yet**, so there are no answer-accuracy, TTFT or measured-cache numbers here.
- Token counts are estimates (≈4 characters per token). Cache costs are **simulated** from Anthropic's documented caching rules (Claude Opus 5 prices).
- The conversations are synthetic. Vector retrieval does well on topic return because the question names the topic; it fails on collision because it pulls every "we decided the database is…" line.
- The gap between "Context Tree + Jev" and "oracle routing" is routing error. All routing numbers above are from Jev's **local reference backend**, which was iterated on while these fixtures were visible, so treat them as a development score. `pnpm bench:jev` scores real `typesafe-ai/jev` on the same fixtures as a held-out result; it has **not been run yet**.

## Architecture

```
context-tree/
├── packages/core     @context-tree/core   tree, active pointer, candidates, routing interfaces,
│                                          working context, checkpoints, serialization
├── packages/jev      @context-tree/jev    JevRouter, Jev protocol, HTTP + local backends
├── apps/demo         three-panel demo (React + Vite)
├── examples/basic    minimal SDK usage
├── benchmarks        datasets, strategies, runners, results
└── docs              architecture, Jev protocol, benchmark methodology, Outline AI audit
```

- **`@context-tree/core` is model-agnostic.** It knows nothing about React, Jev, providers, databases or auth. Routers, candidate builders, embedders, titlers and summarizers are interfaces.
- **`@context-tree/jev`** turns candidates into a `jev.route.v0` request and the response into a decision, with a timeout and a fallback router. `HttpJevBackend` calls a hosted Jev model. `LocalJevBackend` is a deterministic in-process reference scorer, so everything runs without a network.
- **Working context** is built cache-first: stable global prefix → root checkpoint → active path → active checkpoint → append-only recent turns → current message. Checkpoints are versioned and only re-folded when a node's delta passes a threshold, never on every turn.
- **Depth is capped** (`maxDepth`, default 3 below the root). A FORK that would go deeper attaches to the nearest allowed ancestor.

More in [`docs/architecture.md`](docs/architecture.md) and [`docs/jev-protocol.md`](docs/jev-protocol.md). The demo's visual language comes from Outline AI; see [`docs/outline-ai-reference-audit.md`](docs/outline-ai-reference-audit.md).

## Status

Stage 1: an open-source primitive and demo. There is no hosted service, accounts or billing, and none are planned for this repository.

## License

MIT
