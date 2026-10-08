### Calibration — fork bias and route wording (57 cases)

One live pass per backend and prompt; every other row replays those recorded responses with the fork probability multiplied by k and the STAY margin changed. For each backend and prompt: the default setting (k = 1, margin 0.08), then the best replayed setting if it differs. **The best rows are tuned and scored on the same 57 cases (in-sample).**

| Backend | Prompt | Fork ×k | STAY margin | Strict | Lenient | STAY | SWITCH | FORK prec / recall | Misses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Real Jev | v1 | 1 | 0.08 | **89%** | 93% | 100% | 92% | 100% / 60% | f03 f05 f06 f07 n08 a02 |
| Real Jev | v1 | 16 | 0.08 | **96%** | 100% | 100% | 92% | 100% / 100% | n08 a02 |
| Real Jev | v2 | 1 | 0.08 | **93%** | 96% | 91% | 92% | 83% / 100% | n08 n09 a01 a02 |
| Real Jev | v2 | 0.25 | 0.08 | **95%** | 100% | 95% | 92% | 100% / 100% | n08 a01 a02 |
| OpenAI Decisions | v1 | 1 | 0.08 | **82%** | 88% | 95% | 92% | 100% / 30% | f01 f02 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 16 | 0.08 | **88%** | 93% | 95% | 92% | 100% / 60% | f03 f05 f06 f07 n08 a02 a04 |
| OpenAI Decisions | v2 | 1 | 0.08 | **88%** | 91% | 86% | 88% | 69% / 90% | c12 s02 r07 f03 n08 n09 a04 |
| OpenAI Decisions | v2 | 0.5 | 0.08 | **91%** | 95% | 95% | 96% | 100% / 70% | f02 f03 f10 n08 a04 |

Fork probability on the 10 cases that should fork (and its rank among all options):

| Backend, prompt | Case: p(NEW) (rank) |
| --- | --- |
| Real Jev v1 | f01: 61% (#1), f02: 54% (#1), f03: 34% (#2), f04: 80% (#1), f05: 34% (#2), f06: 23% (#2), f07: 8% (#2), f08: 97% (#1), f09: 100% (#1), f10: 79% (#1) |
| Real Jev v2 | f01: 95% (#1), f02: 94% (#1), f03: 95% (#1), f04: 94% (#1), f05: 84% (#1), f06: 95% (#1), f07: 85% (#1), f08: 99% (#1), f09: 100% (#1), f10: 92% (#1) |
| OpenAI Decisions v1 | f01: 9% (#2), f02: 31% (#2), f03: 1% (#3), f04: 79% (#1), f05: 1% (#4), f06: 1% (#5), f07: 4% (#2), f08: 90% (#1), f09: 100% (#1), f10: 13% (#2) |
| OpenAI Decisions v2 | f01: 73% (#1), f02: 59% (#1), f03: 38% (#2), f04: 89% (#1), f05: 66% (#1), f06: 85% (#1), f07: 72% (#1), f08: 97% (#1), f09: 97% (#1), f10: 62% (#1) |

<details><summary>Full sweep</summary>

| Backend | Prompt | Fork ×k | STAY margin | Strict | Lenient | STAY | SWITCH | FORK prec / recall | Misses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Real Jev | v1 | 0.25 | 0.08 | **84%** | 88% | 100% | 92% | 100% / 30% | f01 f02 f03 f04 f05 f06 f07 n08 a02 |
| Real Jev | v1 | 0.5 | 0.08 | **86%** | 89% | 100% | 92% | 100% / 40% | f01 f02 f03 f05 f06 f07 n08 a02 |
| Real Jev | v1 | 1 | 0.08 | **89%** | 93% | 100% | 92% | 100% / 60% | f03 f05 f06 f07 n08 a02 |
| Real Jev | v1 | 2 | 0.08 | **93%** | 96% | 100% | 92% | 100% / 80% | f06 f07 n08 a02 |
| Real Jev | v1 | 4 | 0.08 | **95%** | 98% | 100% | 92% | 100% / 90% | f07 n08 a02 |
| Real Jev | v1 | 8 | 0.08 | **95%** | 98% | 100% | 92% | 100% / 90% | f07 n08 a02 |
| Real Jev | v1 | 16 | 0.08 | **96%** | 100% | 100% | 92% | 100% / 100% | n08 a02 |
| Real Jev | v1 | 32 | 0.08 | **96%** | 100% | 100% | 92% | 100% / 100% | n08 a02 |
| Real Jev | v1 | 64 | 0.08 | **96%** | 100% | 100% | 92% | 100% / 100% | n08 a02 |
| Real Jev | v1 | 0.25 | 0 | **84%** | 88% | 100% | 92% | 100% / 30% | f01 f02 f03 f04 f05 f06 f07 n08 a02 |
| Real Jev | v1 | 0.5 | 0 | **86%** | 89% | 100% | 92% | 100% / 40% | f01 f02 f03 f05 f06 f07 n08 a02 |
| Real Jev | v1 | 1 | 0 | **89%** | 93% | 100% | 92% | 100% / 60% | f03 f05 f06 f07 n08 a02 |
| Real Jev | v1 | 2 | 0 | **93%** | 96% | 100% | 92% | 100% / 80% | f06 f07 n08 a02 |
| Real Jev | v1 | 4 | 0 | **95%** | 98% | 100% | 92% | 100% / 90% | f07 n08 a02 |
| Real Jev | v1 | 8 | 0 | **95%** | 98% | 100% | 92% | 100% / 90% | f07 n08 a02 |
| Real Jev | v1 | 16 | 0 | **96%** | 100% | 100% | 92% | 100% / 100% | n08 a02 |
| Real Jev | v1 | 32 | 0 | **96%** | 100% | 100% | 92% | 100% / 100% | n08 a02 |
| Real Jev | v1 | 64 | 0 | **96%** | 100% | 100% | 92% | 100% / 100% | n08 a02 |
| Real Jev | v2 | 0.25 | 0.08 | **95%** | 100% | 95% | 92% | 100% / 100% | n08 a01 a02 |
| Real Jev | v2 | 0.5 | 0.08 | **95%** | 100% | 95% | 92% | 100% / 100% | n08 a01 a02 |
| Real Jev | v2 | 1 | 0.08 | **93%** | 96% | 91% | 92% | 83% / 100% | n08 n09 a01 a02 |
| Real Jev | v2 | 2 | 0.08 | **89%** | 91% | 82% | 92% | 67% / 100% | c06 c10 n08 n09 a01 a02 |
| Real Jev | v2 | 4 | 0.08 | **81%** | 82% | 59% | 92% | 50% / 100% | c06 c07 c08 c10 c12 n01 n08 n09 a01 a02 a04 |
| Real Jev | v2 | 8 | 0.08 | **70%** | 72% | 41% | 84% | 38% / 100% | c01 c06 c07 c08 c09 c10 c12 c13 s07 n01 n05 n08 n09 a01 a02 a04 a06 |
| Real Jev | v2 | 16 | 0.08 | **49%** | 49% | 18% | 56% | 26% / 100% | c01 c04 c05 c06 c07 c08 c09 c10 c12 c13 s02 s04 s07 r01 r07 n01 n02 n04 n05 n06 n07 n08 n09 a01 a02 a03 a04 a05 a06 |
| Real Jev | v2 | 32 | 0.08 | **40%** | 40% | 14% | 40% | 23% / 100% | c01 c04 c05 c06 c07 c08 c09 c10 c12 c13 c14 s02 s04 s07 s08 r01 r02 r04 r07 n01 n02 n03 n04 n05 n06 n07 n08 n09 a01 a02 a03 a04 a05 a06 |
| Real Jev | v2 | 64 | 0.08 | **33%** | 33% | 5% | 32% | 21% / 100% | c01 c02 c04 c05 c06 c07 c08 c09 c10 c11 c12 c13 c14 s02 s03 s04 s07 s08 s09 r01 r02 r04 r07 n01 n02 n03 n04 n05 n06 n07 n08 n09 a01 a02 a03 a04 a05 a06 |
| Real Jev | v2 | 0.25 | 0 | **95%** | 100% | 95% | 92% | 100% / 100% | n08 a01 a02 |
| Real Jev | v2 | 0.5 | 0 | **95%** | 100% | 95% | 92% | 100% / 100% | n08 a01 a02 |
| Real Jev | v2 | 1 | 0 | **93%** | 96% | 91% | 92% | 83% / 100% | n08 n09 a01 a02 |
| Real Jev | v2 | 2 | 0 | **89%** | 91% | 82% | 92% | 67% / 100% | c06 c10 n08 n09 a01 a02 |
| Real Jev | v2 | 4 | 0 | **81%** | 82% | 59% | 92% | 50% / 100% | c06 c07 c08 c10 c12 n01 n08 n09 a01 a02 a04 |
| Real Jev | v2 | 8 | 0 | **70%** | 72% | 41% | 84% | 38% / 100% | c01 c06 c07 c08 c09 c10 c12 c13 s07 n01 n05 n08 n09 a01 a02 a04 a06 |
| Real Jev | v2 | 16 | 0 | **49%** | 49% | 18% | 56% | 26% / 100% | c01 c04 c05 c06 c07 c08 c09 c10 c12 c13 s02 s04 s07 r01 r07 n01 n02 n04 n05 n06 n07 n08 n09 a01 a02 a03 a04 a05 a06 |
| Real Jev | v2 | 32 | 0 | **40%** | 40% | 14% | 40% | 23% / 100% | c01 c04 c05 c06 c07 c08 c09 c10 c12 c13 c14 s02 s04 s07 s08 r01 r02 r04 r07 n01 n02 n03 n04 n05 n06 n07 n08 n09 a01 a02 a03 a04 a05 a06 |
| Real Jev | v2 | 64 | 0 | **33%** | 33% | 5% | 32% | 21% / 100% | c01 c02 c04 c05 c06 c07 c08 c09 c10 c11 c12 c13 c14 s02 s03 s04 s07 s08 s09 r01 r02 r04 r07 n01 n02 n03 n04 n05 n06 n07 n08 n09 a01 a02 a03 a04 a05 a06 |
| OpenAI Decisions | v1 | 0.25 | 0.08 | **82%** | 88% | 95% | 92% | 100% / 30% | f01 f02 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 0.5 | 0.08 | **82%** | 88% | 95% | 92% | 100% / 30% | f01 f02 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 1 | 0.08 | **82%** | 88% | 95% | 92% | 100% / 30% | f01 f02 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 2 | 0.08 | **84%** | 89% | 95% | 92% | 100% / 40% | f01 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 4 | 0.08 | **84%** | 89% | 95% | 92% | 100% / 40% | f01 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 8 | 0.08 | **86%** | 91% | 95% | 92% | 100% / 50% | f01 f03 f05 f06 f07 n08 a02 a04 |
| OpenAI Decisions | v1 | 16 | 0.08 | **88%** | 93% | 95% | 92% | 100% / 60% | f03 f05 f06 f07 n08 a02 a04 |
| OpenAI Decisions | v1 | 32 | 0.08 | **88%** | 93% | 95% | 88% | 88% / 70% | s06 f03 f05 f06 n08 a02 a04 |
| OpenAI Decisions | v1 | 64 | 0.08 | **86%** | 89% | 95% | 84% | 70% / 70% | s06 r07 f03 f05 f06 n08 a02 a04 |
| OpenAI Decisions | v1 | 0.25 | 0 | **82%** | 88% | 95% | 92% | 100% / 30% | f01 f02 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 0.5 | 0 | **82%** | 88% | 95% | 92% | 100% / 30% | f01 f02 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 1 | 0 | **82%** | 88% | 95% | 92% | 100% / 30% | f01 f02 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 2 | 0 | **84%** | 89% | 95% | 92% | 100% / 40% | f01 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 4 | 0 | **84%** | 89% | 95% | 92% | 100% / 40% | f01 f03 f05 f06 f07 f10 n08 a02 a04 |
| OpenAI Decisions | v1 | 8 | 0 | **86%** | 91% | 95% | 92% | 100% / 50% | f01 f03 f05 f06 f07 n08 a02 a04 |
| OpenAI Decisions | v1 | 16 | 0 | **88%** | 93% | 95% | 92% | 100% / 60% | f03 f05 f06 f07 n08 a02 a04 |
| OpenAI Decisions | v1 | 32 | 0 | **88%** | 93% | 95% | 88% | 88% / 70% | s06 f03 f05 f06 n08 a02 a04 |
| OpenAI Decisions | v1 | 64 | 0 | **86%** | 89% | 95% | 84% | 70% / 70% | s06 r07 f03 f05 f06 n08 a02 a04 |
| OpenAI Decisions | v2 | 0.25 | 0.08 | **86%** | 89% | 95% | 96% | 100% / 40% | f01 f02 f03 f05 f07 f10 n08 a04 |
| OpenAI Decisions | v2 | 0.5 | 0.08 | **91%** | 95% | 95% | 96% | 100% / 70% | f02 f03 f10 n08 a04 |
| OpenAI Decisions | v2 | 1 | 0.08 | **88%** | 91% | 86% | 88% | 69% / 90% | c12 s02 r07 f03 n08 n09 a04 |
| OpenAI Decisions | v2 | 2 | 0.08 | **81%** | 84% | 73% | 80% | 53% / 100% | c06 c09 c12 s02 r07 n04 n07 n08 n09 a01 a04 |
| OpenAI Decisions | v2 | 4 | 0.08 | **79%** | 81% | 68% | 80% | 48% / 100% | c06 c09 c12 s02 r07 n04 n07 n08 n09 a01 a03 a04 |
| OpenAI Decisions | v2 | 8 | 0.08 | **70%** | 72% | 64% | 64% | 38% / 100% | c06 c08 c09 c12 s02 s06 s07 s08 r07 n04 n07 n08 n09 a01 a02 a03 a04 |
| OpenAI Decisions | v2 | 16 | 0.08 | **58%** | 60% | 41% | 56% | 30% / 100% | c01 c06 c08 c09 c10 c12 c14 s02 s04 s06 s07 s08 s09 r07 n01 n04 n07 n08 n09 a01 a02 a03 a04 a06 |
| OpenAI Decisions | v2 | 32 | 0.08 | **47%** | 49% | 36% | 36% | 26% / 100% | c01 c04 c06 c08 c09 c10 c12 c14 s02 s03 s04 s06 s07 s08 s09 r06 r07 n01 n03 n04 n05 n06 n07 n08 n09 a01 a02 a03 a04 a06 |
| OpenAI Decisions | v2 | 64 | 0.08 | **42%** | 44% | 27% | 32% | 24% / 100% | c01 c04 c05 c06 c08 c09 c10 c12 c14 s02 s03 s04 s06 s07 s08 s09 r04 r06 r07 n01 n03 n04 n05 n06 n07 n08 n09 a01 a02 a03 a04 a05 a06 |
| OpenAI Decisions | v2 | 0.25 | 0 | **86%** | 89% | 95% | 96% | 100% / 40% | f01 f02 f03 f05 f07 f10 n08 a04 |
| OpenAI Decisions | v2 | 0.5 | 0 | **91%** | 95% | 95% | 96% | 100% / 70% | f02 f03 f10 n08 a04 |
| OpenAI Decisions | v2 | 1 | 0 | **88%** | 91% | 86% | 88% | 69% / 90% | c12 s02 r07 f03 n08 n09 a04 |
| OpenAI Decisions | v2 | 2 | 0 | **81%** | 84% | 73% | 80% | 53% / 100% | c06 c09 c12 s02 r07 n04 n07 n08 n09 a01 a04 |
| OpenAI Decisions | v2 | 4 | 0 | **79%** | 81% | 68% | 80% | 48% / 100% | c06 c09 c12 s02 r07 n04 n07 n08 n09 a01 a03 a04 |
| OpenAI Decisions | v2 | 8 | 0 | **70%** | 72% | 64% | 64% | 38% / 100% | c06 c08 c09 c12 s02 s06 s07 s08 r07 n04 n07 n08 n09 a01 a02 a03 a04 |
| OpenAI Decisions | v2 | 16 | 0 | **58%** | 60% | 41% | 56% | 30% / 100% | c01 c06 c08 c09 c10 c12 c14 s02 s04 s06 s07 s08 s09 r07 n01 n04 n07 n08 n09 a01 a02 a03 a04 a06 |
| OpenAI Decisions | v2 | 32 | 0 | **47%** | 49% | 36% | 36% | 26% / 100% | c01 c04 c06 c08 c09 c10 c12 c14 s02 s03 s04 s06 s07 s08 s09 r06 r07 n01 n03 n04 n05 n06 n07 n08 n09 a01 a02 a03 a04 a06 |
| OpenAI Decisions | v2 | 64 | 0 | **42%** | 44% | 27% | 32% | 24% / 100% | c01 c04 c05 c06 c08 c09 c10 c12 c14 s02 s03 s04 s06 s07 s08 s09 r04 r06 r07 n01 n03 n04 n05 n06 n07 n08 n09 a01 a02 a03 a04 a05 a06 |

</details>
