# Architecture

## Data model

```ts
interface ContextNode {
  id: NodeId;
  title: string;
  parentId: NodeId | null;
  childIds: NodeId[];
  checkpoint?: ContextCheckpoint;     // stable, versioned summary of folded turns
  recentMessages: ContextMessage[];   // append-only delta since the checkpoint
  createdAt: number;
  lastActiveAt: number;               // drives recency candidates
  metadata?: Record<string, unknown>; // e.g. { description } for seeded nodes
}

interface ContextTree {
  rootIds: NodeId[];
  nodes: Record<NodeId, ContextNode>;
  activeNodeId: NodeId | null;        // the committed active pointer
}
```

A session (`createContextTree`) creates one project root at depth 0. Topics live below it. `maxDepth` (default 3) is the deepest allowed node depth, so the default is four levels including the root.

All tree operations in `packages/core/src/tree.ts` are pure and return new objects. That keeps React state updates and serialization trivial.

## One user message, end to end

1. **Candidate builder** (`DefaultCandidateBuilder`) picks the nodes Jev will see:
   - locality: current node, parent, siblings, children, roots
   - recency: the most recently active nodes
   - semantic: top-k by embedding similarity to the message (`Embedder` interface; the default is a deterministic hashing embedder)

   The result is capped at `maxCandidates` (default 12) and filled with the next-best semantic matches. If the whole tree fits under the cap, every node is a candidate.
2. **Router** returns a `RouteDecision`: `stay | switch | fork`, the target or fork parent, confidence, per-candidate probabilities (including a `@fork` pseudo-candidate) and latency. `decide()` in core applies shared semantics:
   - FORK wins only if its probability beats the best node.
   - Hysteresis: if the current node is within `stayMargin` (default 0.08) of the best node, STAY. This prevents flapping between near-equal siblings.
3. **Validation and fallback.** A decision that throws or points at an unknown node is replaced by the fallback router's decision (default `StayRouter`), with `fallbackReason` set. `JevRouter` has its own timeout and fallback (default: the lexical `MockRouter`).
4. **Apply.** SWITCH moves the active pointer. FORK clamps the parent to `maxDepth`, asks the `Titler` for a title (Jev never titles), adds the node and activates it.
5. **Working context** is built for the new active node before the message is appended.
6. **Commit** appends the message to the node's delta and to the session transcript. If the delta passes the checkpoint threshold, the oldest turns are folded into a new checkpoint version.

Assistant messages are never routed. They are appended to the active node.

## Preview vs commit

`tree.preview(draft)` runs steps 1–2 against a snapshot and returns the predicted node (or fork parent) without mutating anything. The demo calls it on a 250 ms debounce while typing and keeps `preview` and `committed` as separate state. Only `tree.add()` moves the active pointer.

## Working context layout

```
[STABLE GLOBAL PREFIX]   system prompt
[STABLE TOPIC PREFIX]    ## ROOT SUMMARY       root checkpoint (if not the active node)
                         ## ACTIVE PATH        Project └── Topic └── Subtopic
                         ## ACTIVE CHECKPOINT  (vN) folded summary of this node
[APPEND-ONLY DELTA]      recent turns in this node, verbatim
[CURRENT MESSAGE]
```

`WorkingContext` exposes this as `system` (the stable part) plus `messages` (delta + current), and as typed `segments` with token estimates, so callers can place prompt-cache breakpoints at the end of `system`.

Unrelated branches are never included. Sibling topics are exactly what causes context collisions.

### Why checkpoint + delta

- The prefix for a node changes only when its checkpoint version changes, so staying in, or returning to, a node reuses the cached prefix.
- Summarization cost is paid once per fold (default every 12 messages, keeping the newest 4 verbatim), not per turn.
- The default `ExtractiveSummarizer` is deterministic: it keeps user turns (where decisions are usually stated) nearly verbatim and the first sentence of each reply. Swap in an LLM summarizer through the `Summarizer` interface.

## Extension points

| Interface | Default | Replace with |
| --- | --- | --- |
| `Router` | `JevRouter` (local backend), `MockRouter`, `StayRouter` | a hosted Jev via `HttpJevBackend`, or any classifier |
| `CandidateBuilder` | `DefaultCandidateBuilder` | your own retrieval |
| `Embedder` | `HashingEmbedder` | a real embedding model |
| `Titler` | `HeuristicTitler`, `TableTitler` | an LLM titler |
| `Summarizer` | `ExtractiveSummarizer` | an LLM summarizer |
| `TokenCounter` | `EstimatingTokenCounter` (≈4 chars/token) | a provider token-counting endpoint |

## Known limitations

- The local Jev backend is a heuristic reference. It struggles with sibling topics that share vocabulary, and with new topics that have no explicit "new thread" phrasing or new name. A trained Jev model is expected to replace it.
- The extractive summarizer keeps a bounded number of lines (16), so very long nodes eventually drop their oldest decisions from the checkpoint.
- Token counts are estimates.
