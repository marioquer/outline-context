### Benchmark C — Switching frequency and prompt caching (simulated)

Simulated with claude-opus-5 rules: $5/MTok input, cache reads 0.1×, 5-minute writes 1.25×, 512-token minimum, exact block-prefix matching, all turns within TTL. Seven topics are pre-seeded (~49 user turns) before the measured pattern.

| Pattern | Strategy | Raw input | Cached | Uncached | Hit rate | Effective input cost | vs. no cache |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `AAAAAAAA` | Recent window (12 msgs) | 5,075 | 0 | 5,075 | 0% | $0.0303 | $0.0254 |
| `AAAAAAAA` | Full history | 57,328 | 56,822 | 506 | 99% | $0.0316 | $0.2866 |
| `AAAAAAAA` | Vector retrieval (top-8 + last 4) | 3,814 | 0 | 3,814 | 0% | $0.0208 | $0.0191 |
| `AAAAAAAA` | Context Tree + Jev | 6,167 | 4,492 | 1,675 | 73% | $0.0127 | $0.0308 |
| `AAAAAAAA` | Context Tree (oracle routing) | 5,368 | 3,383 | 1,985 | 63% | $0.0135 | $0.0268 |
| `AAAABAAAA` | Recent window (12 msgs) | 5,491 | 0 | 5,491 | 0% | $0.0324 | $0.0275 |
| `AAAABAAAA` | Full history | 64,786 | 64,215 | 571 | 99% | $0.0357 | $0.3239 |
| `AAAABAAAA` | Vector retrieval (top-8 + last 4) | 4,057 | 0 | 4,057 | 0% | $0.0227 | $0.0203 |
| `AAAABAAAA` | Context Tree + Jev | 6,816 | 4,515 | 2,301 | 66% | $0.0166 | $0.0341 |
| `AAAABAAAA` | Context Tree (oracle routing) | 6,108 | 3,406 | 2,702 | 56% | $0.0180 | $0.0305 |
| `ABABABAB` | Recent window (12 msgs) | 5,305 | 0 | 5,305 | 0% | $0.0315 | $0.0265 |
| `ABABABAB` | Full history | 57,558 | 56,998 | 560 | 99% | $0.0320 | $0.2878 |
| `ABABABAB` | Vector retrieval (top-8 + last 4) | 4,059 | 0 | 4,059 | 0% | $0.0222 | $0.0203 |
| `ABABABAB` | Context Tree + Jev | 5,523 | 3,526 | 1,997 | 64% | $0.0137 | $0.0276 |
| `ABABABAB` | Context Tree (oracle routing) | 6,286 | 4,544 | 1,742 | 72% | $0.0132 | $0.0314 |
| `ABCDEFGABCDEFG` | Recent window (12 msgs) | 7,721 | 0 | 7,721 | 0% | $0.0436 | $0.0386 |
| `ABCDEFGABCDEFG` | Full history | 103,132 | 102,223 | 909 | 99% | $0.0568 | $0.5157 |
| `ABCDEFGABCDEFG` | Vector retrieval (top-8 + last 4) | 6,832 | 0 | 6,832 | 0% | $0.0382 | $0.0342 |
| `ABCDEFGABCDEFG` | Context Tree + Jev | 10,062 | 4,845 | 5,217 | 48% | $0.0350 | $0.0503 |
| `ABCDEFGABCDEFG` | Context Tree (oracle routing) | 10,180 | 4,887 | 5,293 | 48% | $0.0355 | $0.0509 |
