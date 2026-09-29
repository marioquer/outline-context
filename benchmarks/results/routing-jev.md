### Benchmark E — Routing with real Jev (typesafe-ai/jev, 57 cases, 2 trees)

| Router | STAY acc | SWITCH acc | FORK prec | FORK recall | FORK parent | Target acc (strict) | Target acc (lenient) | p50 / p95 latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| JevRouter (typesafe-ai/jev) | 100% | 92% | 100% | 60% | 100% | 89% | 93% | 324 / 586 ms |

By category (strict):

| Router | continuation | switch | return | new-topic | similar-siblings | ambiguous |
| --- | --- | --- | --- | --- | --- | --- |
| JevRouter (typesafe-ai/jev) | 100% (n=14) | 100% (n=10) | 100% (n=8) | 60% (n=10) | 89% (n=9) | 83% (n=6) |

Calls: 57. Fallbacks (call failed, StayRouter decided): 0. Mean input tokens per call (reported by the gateway): 1,470. Latency is the gateway round trip from the benchmark machine, excluding the throttle wait between calls.
