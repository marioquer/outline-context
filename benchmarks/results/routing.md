### Benchmark E — Routing (57 hand-labelled cases, 2 trees)

| Router | STAY acc | SWITCH acc | FORK prec | FORK recall | FORK parent | Target acc (strict) | Target acc (lenient) | p50 / p95 latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Always STAY | 100% | 0% | – | 0% | – | 39% | 42% | 0.00 / 0.00 ms |
| MockRouter (lexical) | 64% | 92% | 45% | 50% | 60% | 70% | 70% | 0.15 / 0.64 ms |
| JevRouter (local reference backend) | 100% | 88% | 100% | 80% | 88% | 89% | 91% | 0.45 / 1.60 ms |

By category (strict):

| Router | continuation | switch | return | new-topic | similar-siblings | ambiguous |
| --- | --- | --- | --- | --- | --- | --- |
| Always STAY | 100% (n=14) | 0% (n=10) | 0% (n=8) | 0% (n=10) | 33% (n=9) | 83% (n=6) |
| MockRouter (lexical) | 64% (n=14) | 100% (n=10) | 100% (n=8) | 30% (n=10) | 89% (n=9) | 33% (n=6) |
| JevRouter (local reference backend) | 100% (n=14) | 100% (n=10) | 88% (n=8) | 70% (n=10) | 78% (n=9) | 100% (n=6) |

Routing cost: the local backend runs in-process ($0). A hosted Jev model would receive ~606 tokens per request on average (estimated from the serialized JevRequest).
Latency is in-process wall time on the benchmark machine and does not include network time to a hosted model.
