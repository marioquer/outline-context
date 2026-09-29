### LLM-graded answers (claude-opus-5, default settings, 8 cases per benchmark)

Benchmark A — topic return:

| Strategy | Correct (answered) | Refused | Answer used a colliding fact | Mean input tokens | TTFT p50 | Total p50 |
| --- | --- | --- | --- | --- | --- | --- |
| Recent window (12 msgs) | 0% (0/8) | 0 | 0% | 1,093 | 1014 ms | 1881 ms |
| Full history | 100% (5/5) | 3 | 0% | 4,290 | 1228 ms | 1947 ms |
| Vector retrieval (top-8 + last 4) | 100% (5/5) | 3 | 0% | 787 | 970 ms | 1731 ms |
| Context Tree + Jev (local backend) | 100% (7/7) | 1 | 0% | 1,031 | 1120 ms | 1893 ms |
| Context Tree + Jev (typesafe-ai/jev) | 88% (7/8) | 0 | 0% | 923 | 1362 ms | 2107 ms |
| Context Tree (oracle routing) | 100% (8/8) | 0 | 0% | 1,030 | 1099 ms | 1856 ms |

Benchmark B — context collision (question does not name the topic):

| Strategy | Correct (answered) | Refused | Answer used a colliding fact | Mean input tokens | TTFT p50 | Total p50 |
| --- | --- | --- | --- | --- | --- | --- |
| Recent window (12 msgs) | 0% (0/8) | 0 | 0% | 903 | 1891 ms | 2347 ms |
| Full history | 100% (7/7) | 1 | 0% | 2,603 | 1712 ms | 2098 ms |
| Vector retrieval (top-8 + last 4) | 88% (7/8) | 0 | 13% | 894 | 1610 ms | 1834 ms |
| Context Tree + Jev (local backend) | 75% (6/8) | 0 | 25% | 727 | 983 ms | 1738 ms |
| Context Tree + Jev (typesafe-ai/jev) | 100% (8/8) | 0 | 0% | 710 | 1231 ms | 2111 ms |
| Context Tree (oracle routing) | 100% (8/8) | 0 | 0% | 705 | 1126 ms | 1749 ms |

Correct = the answer contains the expected value and no colliding value. Input tokens are reported by the API (uncached + cache read + cache write). TTFT and total latency include network time from the benchmark machine.

Routing fallbacks:
- Context Tree + Jev (local backend): 0 of 384 routed user messages fell back (Jev call failed, StayRouter decided).
- Context Tree + Jev (typesafe-ai/jev): 0 of 384 routed user messages fell back (Jev call failed, StayRouter decided).

Refusals: 8 of 96 requests returned stop_reason "refusal", all in cases A6, A7, A8, B7, across 3 strategies. Refusal fallbacks were deliberately off so every answer comes from the same model.
