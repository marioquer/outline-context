# Benchmark methodology

```bash
pnpm bench            # A, B, C, D, E → benchmarks/results/*.json, *.md, RESULTS.md
pnpm bench:routing    # E only
pnpm bench:context    # A, B, D
pnpm bench:switching  # C
AI_GATEWAY_API_KEY=… pnpm bench:jev  # opt-in: E against real typesafe-ai/jev (57 calls, ~2 min)
ANTHROPIC_API_KEY=… pnpm bench:llm   # opt-in, costs money: real answers for A and B
```

Keys can also go in `.env.local` at the repo root. `pnpm bench` includes the opt-in results in `RESULTS.md` once they exist.

`bench:jev` scores real Jev on exactly the same fixtures and scoring as the local backend. Failed calls are not silently replaced: StayRouter decides, the case is scored as that, and the fallback count is printed next to the scores. Unlike the local backend, Jev was never tuned against these fixtures, so its numbers are a held-out result.

Results are written by the runners, never edited by hand. Each JSON file records the git commit, date and Node version.

## Strategies

All strategies see the same turns and the same system prompt. Only the context strategy differs.

| Strategy | Context for a question |
| --- | --- |
| Recent window | the last 12 messages |
| Full history | every message |
| Vector retrieval | top-8 past messages by embedding similarity (same hashing embedder as Context Tree), in chronological order, plus the last 4 messages |
| Context Tree + Jev | Jev routes **every** user message starting from an empty tree (root only); the working context of the routed node |
| Context Tree + real Jev (`bench:llm` only, with `AI_GATEWAY_API_KEY`) | the same, routed by `typesafe-ai/jev` on the gateway (calls spaced 2.1 s; a failed call falls back to STAY and is counted); `BENCH_JEV=off` skips it |
| Context Tree (oracle routing) | each message is placed in its ground-truth topic node; isolates context construction from routing errors |

## Datasets

- `benchmarks/datasets/conversations.ts`: a seeded generator. Eight fictional projects, each with facts that collide across projects (every project has a database, region, owner, deadline and queue). The user states facts in plain sentences, and filler turns discuss the topic without restating them. Openers use varied phrasings ("Let's start on Project X…", "New topic: …", "Separately, …").
- `benchmarks/datasets/routing-fixtures.ts`: 57 hand-labelled routing cases on two trees (a work-planning tree and a personal-projects tree) with no overlap with the demo script. Categories: continuation, switch, return, new topic, similar siblings, ambiguous. `acceptable` lists alternative labels used for the lenient score.

## Metrics

- **Fact in context**: the expected value (e.g. `PostgreSQL`) appears in the request.
- **Colliding fact in context**: another project's value for the same slot appears.
- **Clean**: fact present and no colliding fact.
- **Input tokens**: estimated at ≈4 characters per token.
- **Routing**: STAY accuracy, SWITCH accuracy (right target), FORK precision / recall, FORK parent accuracy (parent in the labelled set), overall target accuracy, and in-process latency. For a hosted Jev, the runner also reports the estimated request size.
- **Cache (C)**: simulated with `strategies/cache.ts`. Exact block-prefix matching; entries written at the end of the stable prefix and at the last block; 512-token minimum; reads 0.1×, 5-minute writes 1.25×, at Claude Opus 5 input pricing ($5/MTok). All turns are assumed to be within the TTL. Seven topics are seeded first; seeding warms the cache but is not counted. Recent window and vector retrieval show a higher cost *with* caching than without because every request pays the write premium and never gets a read; a real deployment would turn caching off for them.

## What these numbers are not

- They are not answer accuracy. The context-level checks are necessary but not sufficient: a model can still ignore a present fact, or resolve a collision correctly. `pnpm bench:llm` measures real answers, usage, cache reads and TTFT; results appear in `RESULTS.md` once it has been run.
- The conversations are synthetic and templated. Real conversations are messier, which usually makes routing harder.
- Cache economics are simulated, not billed.

## Disclosure: development history of the local Jev backend

The routing fixtures were written before the first benchmark run and have not been changed since. The local reference backend, however, was revised after the first run, while those fixtures were visible:

| Revision | Trigger | Routing target accuracy (strict) |
| --- | --- | --- |
| 1. initial | — | 88% |
| 2. summarizer keeps user turns; unseen capitalized names count as a FORK signal | Context Tree + Jev scored 0% on the from-scratch topic-return replay: after the first node, every new project stayed in it | 88% |
| 3. terms shared by most candidates are not evidence; acronyms are not names | the length-scaling replay misrouted generic follow-ups | 88% |
| 4. with explicit new-thread phrasing, FORK inherits its parent's topical evidence | the SDK example could not fork a sub-thread of the current node | 89% (an intermediate variant without the cue restriction scored 86% and was discarded) |

The revisions were motivated by the context benchmarks and the example rather than by individual routing fixtures, but the numbers above are not a held-out evaluation. A fresh, independently written fixture set is the right way to score a trained Jev model.

## Refusals in the LLM-graded run

`bench:llm` runs without refusal fallbacks so that every answer comes from the same model. A request that ends with `stop_reason: "refusal"` is excluded from accuracy and counted in its own column; `pnpm bench:llm --render` re-renders the table from the saved JSON without new API calls. In the first run (Claude Opus 5), 7 of 80 requests were refused, all in topic-return cases A6–A8 and across three strategies. In the second run, which added the real-Jev strategy, 8 of 96 were refused, in A6–A8 and B7, again across three strategies. This suggests the synthetic filler text (API keys, webhook signing, impersonation…) rather than the context strategy.
