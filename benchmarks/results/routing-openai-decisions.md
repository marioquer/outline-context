### Benchmark E — Routing with OpenAI Decisions (openai/gpt-6-luna (decisions), 57 cases, 2 trees)

| Router | STAY acc | SWITCH acc | FORK prec | FORK recall | FORK parent | Target acc (strict) | Target acc (lenient) | p50 / p95 latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| JevRouter (openai/gpt-6-luna (decisions)) | 95% | 92% | 100% | 30% | 100% | 82% | 88% | 137 / 524 ms |

By category (strict):

| Router | continuation | switch | return | new-topic | similar-siblings | ambiguous |
| --- | --- | --- | --- | --- | --- | --- |
| JevRouter (openai/gpt-6-luna (decisions)) | 100% (n=14) | 100% (n=10) | 100% (n=8) | 30% (n=10) | 89% (n=9) | 67% (n=6) |

Calls: 57. Fallbacks (call failed, StayRouter decided): 0. Mean input tokens per call (reported by the API): 968. Latency is the API round trip from the benchmark machine, excluding the throttle wait between calls.
