### Benchmark A — Topic return (A → B → C → D → A, 8 cases)

| Strategy | Fact in context | Colliding fact in context | Clean | Mean input tokens | Final turn routed correctly |
| --- | --- | --- | --- | --- | --- |
| Recent window (12 msgs) | 0% | 0% | 0% | 860 | – |
| Full history | 100% | 0% | 100% | 3,383 | – |
| Vector retrieval (top-8 + last 4) | 100% | 0% | 100% | 576 | – |
| Context Tree + Jev | 100% | 0% | 100% | 782 | 100% |
| Context Tree (oracle routing) | 100% | 0% | 100% | 787 | 100% |

### Benchmark B — Context collision (3 topics with conflicting facts, 8 cases)

The user returns to one topic, then asks without naming it (e.g. "Which database did we decide on?").

| Strategy | Fact in context | Colliding fact in context | Clean | Mean input tokens | Final turn routed correctly |
| --- | --- | --- | --- | --- | --- |
| Recent window (12 msgs) | 0% | 0% | 0% | 698 | – |
| Full history | 100% | 100% | 0% | 2,002 | – |
| Vector retrieval (top-8 + last 4) | 100% | 100% | 0% | 676 | – |
| Context Tree + Jev | 75% | 25% | 75% | 534 | 75% |
| Context Tree (oracle routing) | 100% | 0% | 100% | 518 | 100% |

### Benchmark D — Context length scaling (one small active topic, growing unrelated history)

Input tokens of the final request (fact in context ✓ / ✗, colliding fact present ⚠):

| History (full) | Recent window (12 msgs) | Full history | Vector retrieval (top-8 + last 4) | Context Tree + Jev | Context Tree (oracle routing) |
| --- | --- | --- | --- | --- | --- |
| 9,097 | 840 ✗ | 9,097 ✓ | 456 ✓ | 516 ✓ | 512 ✓ |
| 22,079 | 867 ✗ | 22,079 ✓ | 429 ✓ | 516 ✓ | 512 ✓ |
| 43,539 | 843 ✗ | 43,539 ✓ | 418 ✓ | 516 ✓ | 512 ✓ |
| 86,738 | 890 ✗ | 86,738 ✓ | 451 ✓ | 516 ✓ | 512 ✓ |
| 173,034 | 853 ✗ | 173,034 ✓ | 414 ✓ | 516 ✓ | 512 ✓ |
