### LLM-graded answers (claude-opus-5, default settings, 8 cases per benchmark)

Benchmark A — topic return:

| Strategy | Correct (answered) | Refused | Answer used a colliding fact | Mean input tokens | TTFT p50 | Total p50 |
| --- | --- | --- | --- | --- | --- | --- |
| Recent window (12 msgs) | 0% (0/8) | 0 | 0% | 1,093 | 1064 ms | 1911 ms |
| Full history | 100% (5/5) | 3 | 0% | 4,290 | 1202 ms | 1482 ms |
| Vector retrieval (top-8 + last 4) | 100% (5/5) | 3 | 0% | 787 | 846 ms | 1290 ms |
| Context Tree + Jev | 100% (7/7) | 1 | 0% | 1,025 | 1004 ms | 1644 ms |
| Context Tree (oracle routing) | 100% (8/8) | 0 | 0% | 1,030 | 949 ms | 1668 ms |

Benchmark B — context collision (question does not name the topic):

| Strategy | Correct (answered) | Refused | Answer used a colliding fact | Mean input tokens | TTFT p50 | Total p50 |
| --- | --- | --- | --- | --- | --- | --- |
| Recent window (12 msgs) | 0% (0/8) | 0 | 0% | 903 | 1693 ms | 2117 ms |
| Full history | 100% (8/8) | 0 | 0% | 2,598 | 2028 ms | 2126 ms |
| Vector retrieval (top-8 + last 4) | 100% (8/8) | 0 | 0% | 894 | 1049 ms | 1674 ms |
| Context Tree + Jev | 75% (6/8) | 0 | 25% | 727 | 940 ms | 1689 ms |
| Context Tree (oracle routing) | 100% (8/8) | 0 | 0% | 705 | 1070 ms | 1624 ms |

Correct = the answer contains the expected value and no colliding value. Input tokens are reported by the API (uncached + cache read + cache write). TTFT and total latency include network time from the benchmark machine.
Refusals: 7 of 80 requests returned stop_reason "refusal", all in cases A6, A7, A8, across 3 strategies. Refusal fallbacks were deliberately off so every answer comes from the same model.
