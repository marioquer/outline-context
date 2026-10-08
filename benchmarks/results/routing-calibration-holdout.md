### Calibration — fork bias and route wording (held-out set, 44 cases)

One live pass per backend and prompt; every other row replays those recorded responses with the fork probability multiplied by k and the STAY margin changed. For each backend and prompt: the default setting (k = 1, margin 0.08), then the pre-registered k = 16. These cases were written after the development sweep and were not used to choose k. The full sweep below is for inspection only; picking its best row would tune on this set too.

| Backend | Prompt | Fork ×k | STAY margin | Strict | Lenient | STAY | SWITCH | FORK prec / recall | Misses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Real Jev | v1 | 1 | 0.08 | **80%** | 84% | 100% | 92% | 100% / 43% | hf2 hi1 hi2 hi3 hi4 hi5 hi6 hi8 ha2 |
| Real Jev | v1 | 16 | 0.08 | **89%** | 95% | 89% | 92% | 86% / 86% | hi2 hi8 ha2 ha3 ha4 |
| Real Jev | v2 | 1 | 0.08 | **82%** | 89% | 72% | 92% | 70% / 100% | hc7 hm8 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 16 | 0.08 | **52%** | 59% | 11% | 75% | 42% / 100% | hc1 hc3 hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hs2 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| OpenAI Decisions | v1 | 1 | 0.08 | **70%** | 80% | 94% | 100% | 100% / 14% | hf1 hf2 hf3 hf4 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 16 | 0.08 | **80%** | 89% | 94% | 100% | 100% / 43% | hf3 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v2 | 1 | 0.08 | **80%** | 89% | 67% | 100% | 73% / 79% | hc6 hm1 hm6 hi2 hi4 hi8 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 16 | 0.08 | **66%** | 70% | 28% | 83% | 48% / 100% | hc5 hc6 hc7 hm1 hm2 hm4 hm5 hm6 hm7 hm8 hs3 hs6 ha1 ha3 ha4 |

Fork probability on the 14 cases that should fork (and its rank among all options):

| Backend, prompt | Case: p(NEW) (rank) |
| --- | --- |
| Real Jev v1 | hf1: 95% (#1), hf2: 36% (#2), hf3: 48% (#1), hf4: 94% (#1), hf5: 97% (#1), hi1: 43% (#2), hi2: 2% (#3), hi3: 23% (#2), hi4: 15% (#2), hi5: 8% (#2), hi6: 22% (#2), hi7: 47% (#1), hi8: 1% (#2), hi9: 98% (#1) |
| Real Jev v2 | hf1: 97% (#1), hf2: 89% (#1), hf3: 91% (#1), hf4: 97% (#1), hf5: 99% (#1), hi1: 93% (#1), hi2: 77% (#1), hi3: 77% (#1), hi4: 82% (#1), hi5: 96% (#1), hi6: 97% (#1), hi7: 98% (#1), hi8: 82% (#1), hi9: 100% (#1) |
| OpenAI Decisions v1 | hf1: 33% (#2), hf2: 15% (#2), hf3: 3% (#3), hf4: 13% (#2), hf5: 98% (#1), hi1: 15% (#3), hi2: 0% (#4), hi3: 3% (#4), hi4: 0% (#4), hi5: 1% (#2), hi6: 1% (#2), hi7: 0% (#6), hi8: 0% (#5), hi9: 94% (#1) |
| OpenAI Decisions v2 | hf1: 95% (#1), hf2: 72% (#1), hf3: 59% (#1), hf4: 52% (#1), hf5: 94% (#1), hi1: 65% (#1), hi2: 29% (#2), hi3: 82% (#1), hi4: 29% (#2), hi5: 70% (#1), hi6: 50% (#1), hi7: 58% (#1), hi8: 49% (#1), hi9: 88% (#1) |

<details><summary>Full sweep</summary>

| Backend | Prompt | Fork ×k | STAY margin | Strict | Lenient | STAY | SWITCH | FORK prec / recall | Misses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Real Jev | v1 | 0.25 | 0.08 | **75%** | 80% | 100% | 92% | 100% / 29% | hf2 hf3 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha2 |
| Real Jev | v1 | 0.5 | 0.08 | **75%** | 80% | 100% | 92% | 100% / 29% | hf2 hf3 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha2 |
| Real Jev | v1 | 1 | 0.08 | **80%** | 84% | 100% | 92% | 100% / 43% | hf2 hi1 hi2 hi3 hi4 hi5 hi6 hi8 ha2 |
| Real Jev | v1 | 2 | 0.08 | **84%** | 89% | 100% | 92% | 100% / 57% | hi2 hi3 hi4 hi5 hi6 hi8 ha2 |
| Real Jev | v1 | 4 | 0.08 | **89%** | 93% | 100% | 92% | 100% / 71% | hi2 hi4 hi5 hi8 ha2 |
| Real Jev | v1 | 8 | 0.08 | **89%** | 93% | 94% | 92% | 92% / 79% | hi2 hi5 hi8 ha2 ha4 |
| Real Jev | v1 | 16 | 0.08 | **89%** | 95% | 89% | 92% | 86% / 86% | hi2 hi8 ha2 ha3 ha4 |
| Real Jev | v1 | 32 | 0.08 | **89%** | 95% | 89% | 92% | 86% / 86% | hi2 hi8 ha2 ha3 ha4 |
| Real Jev | v1 | 64 | 0.08 | **91%** | 98% | 89% | 92% | 81% / 93% | hi8 ha2 ha3 ha4 |
| Real Jev | v1 | 0.25 | 0 | **75%** | 80% | 100% | 92% | 100% / 29% | hf2 hf3 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha2 |
| Real Jev | v1 | 0.5 | 0 | **75%** | 80% | 100% | 92% | 100% / 29% | hf2 hf3 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha2 |
| Real Jev | v1 | 1 | 0 | **80%** | 84% | 100% | 92% | 100% / 43% | hf2 hi1 hi2 hi3 hi4 hi5 hi6 hi8 ha2 |
| Real Jev | v1 | 2 | 0 | **84%** | 89% | 100% | 92% | 100% / 57% | hi2 hi3 hi4 hi5 hi6 hi8 ha2 |
| Real Jev | v1 | 4 | 0 | **89%** | 93% | 100% | 92% | 100% / 71% | hi2 hi4 hi5 hi8 ha2 |
| Real Jev | v1 | 8 | 0 | **89%** | 93% | 94% | 92% | 92% / 79% | hi2 hi5 hi8 ha2 ha4 |
| Real Jev | v1 | 16 | 0 | **89%** | 95% | 89% | 92% | 86% / 86% | hi2 hi8 ha2 ha3 ha4 |
| Real Jev | v1 | 32 | 0 | **89%** | 95% | 89% | 92% | 86% / 86% | hi2 hi8 ha2 ha3 ha4 |
| Real Jev | v1 | 64 | 0 | **91%** | 98% | 89% | 92% | 81% / 93% | hi8 ha2 ha3 ha4 |
| Real Jev | v2 | 0.25 | 0.08 | **86%** | 95% | 83% | 92% | 88% / 100% | hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 0.5 | 0.08 | **86%** | 95% | 83% | 92% | 82% / 100% | hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 1 | 0.08 | **82%** | 89% | 72% | 92% | 70% / 100% | hc7 hm8 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 2 | 0.08 | **75%** | 82% | 56% | 92% | 61% / 100% | hc7 hm1 hm5 hm6 hm8 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 4 | 0.08 | **59%** | 66% | 22% | 83% | 47% / 100% | hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 8 | 0.08 | **57%** | 64% | 22% | 75% | 45% / 100% | hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hs2 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 16 | 0.08 | **52%** | 59% | 11% | 75% | 42% / 100% | hc1 hc3 hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hs2 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 32 | 0.08 | **48%** | 55% | 11% | 58% | 40% / 100% | hc1 hc3 hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hs1 hs2 hs5 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 64 | 0.08 | **41%** | 48% | 6% | 42% | 37% / 100% | hc1 hc3 hc4 hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hs1 hs2 hs3 hs4 hs5 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 0.25 | 0 | **86%** | 95% | 83% | 92% | 88% / 100% | hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 0.5 | 0 | **86%** | 95% | 83% | 92% | 82% / 100% | hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 1 | 0 | **82%** | 89% | 72% | 92% | 70% / 100% | hc7 hm8 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 2 | 0 | **75%** | 82% | 56% | 92% | 61% / 100% | hc7 hm1 hm5 hm6 hm8 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 4 | 0 | **59%** | 66% | 22% | 83% | 47% / 100% | hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 8 | 0 | **57%** | 64% | 22% | 75% | 45% / 100% | hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hs2 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 16 | 0 | **52%** | 59% | 11% | 75% | 42% / 100% | hc1 hc3 hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hs2 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 32 | 0 | **48%** | 55% | 11% | 58% | 40% / 100% | hc1 hc3 hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hs1 hs2 hs5 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| Real Jev | v2 | 64 | 0 | **41%** | 48% | 6% | 42% | 37% / 100% | hc1 hc3 hc4 hc5 hc6 hc7 hm1 hm2 hm3 hm4 hm5 hm6 hm7 hm8 hs1 hs2 hs3 hs4 hs5 hr4 hi2 hi4 ha1 ha2 ha3 ha4 |
| OpenAI Decisions | v1 | 0.25 | 0.08 | **70%** | 80% | 94% | 100% | 100% / 14% | hf1 hf2 hf3 hf4 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 0.5 | 0.08 | **70%** | 80% | 94% | 100% | 100% / 14% | hf1 hf2 hf3 hf4 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 1 | 0.08 | **70%** | 80% | 94% | 100% | 100% / 14% | hf1 hf2 hf3 hf4 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 2 | 0.08 | **73%** | 82% | 94% | 100% | 100% / 21% | hf2 hf3 hf4 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 4 | 0.08 | **75%** | 84% | 94% | 100% | 100% / 29% | hf2 hf3 hf4 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 8 | 0.08 | **80%** | 89% | 94% | 100% | 100% / 43% | hf3 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 16 | 0.08 | **80%** | 89% | 94% | 100% | 100% / 43% | hf3 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 32 | 0.08 | **82%** | 89% | 94% | 92% | 89% / 57% | hs1 hi2 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 64 | 0.08 | **77%** | 84% | 89% | 83% | 67% / 57% | hs1 hs5 hi2 hi4 hi5 hi6 hi7 hi8 ha3 ha4 |
| OpenAI Decisions | v1 | 0.25 | 0 | **70%** | 80% | 94% | 100% | 100% / 14% | hf1 hf2 hf3 hf4 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 0.5 | 0 | **70%** | 80% | 94% | 100% | 100% / 14% | hf1 hf2 hf3 hf4 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 1 | 0 | **70%** | 80% | 94% | 100% | 100% / 14% | hf1 hf2 hf3 hf4 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 2 | 0 | **73%** | 82% | 94% | 100% | 100% / 21% | hf2 hf3 hf4 hi1 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 4 | 0 | **75%** | 84% | 94% | 100% | 100% / 29% | hf2 hf3 hf4 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 8 | 0 | **80%** | 89% | 94% | 100% | 100% / 43% | hf3 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 16 | 0 | **80%** | 89% | 94% | 100% | 100% / 43% | hf3 hi2 hi3 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 32 | 0 | **82%** | 89% | 94% | 92% | 89% / 57% | hs1 hi2 hi4 hi5 hi6 hi7 hi8 ha4 |
| OpenAI Decisions | v1 | 64 | 0 | **77%** | 84% | 89% | 83% | 67% / 57% | hs1 hs5 hi2 hi4 hi5 hi6 hi7 hi8 ha3 ha4 |
| OpenAI Decisions | v2 | 0.25 | 0.08 | **73%** | 77% | 83% | 100% | 100% / 36% | hc6 hf2 hf3 hf4 hi2 hi4 hi5 hi6 hi7 hi8 ha3 ha4 |
| OpenAI Decisions | v2 | 0.5 | 0.08 | **73%** | 80% | 72% | 100% | 78% / 50% | hc6 hm1 hf3 hf4 hi2 hi4 hi6 hi7 hi8 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 1 | 0.08 | **80%** | 89% | 67% | 100% | 73% / 79% | hc6 hm1 hm6 hi2 hi4 hi8 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 2 | 0.08 | **80%** | 89% | 61% | 100% | 71% / 86% | hc6 hm1 hm6 hm8 hi2 hi4 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 4 | 0.08 | **82%** | 89% | 56% | 100% | 67% / 100% | hc6 hm1 hm5 hm6 hm8 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 8 | 0.08 | **73%** | 80% | 33% | 100% | 56% / 100% | hc5 hc6 hc7 hm1 hm2 hm4 hm5 hm6 hm8 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 16 | 0.08 | **66%** | 70% | 28% | 83% | 48% / 100% | hc5 hc6 hc7 hm1 hm2 hm4 hm5 hm6 hm7 hm8 hs3 hs6 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 32 | 0.08 | **61%** | 68% | 28% | 67% | 45% / 100% | hc5 hc6 hc7 hm1 hm2 hm4 hm5 hm6 hm7 hm8 hs1 hs3 hs6 ha1 ha2 ha3 ha4 |
| OpenAI Decisions | v2 | 64 | 0.08 | **55%** | 61% | 22% | 50% | 41% / 100% | hc1 hc5 hc6 hc7 hm1 hm2 hm4 hm5 hm6 hm7 hm8 hs1 hs2 hs3 hs6 hr2 ha1 ha2 ha3 ha4 |
| OpenAI Decisions | v2 | 0.25 | 0 | **73%** | 77% | 83% | 100% | 100% / 36% | hc6 hf2 hf3 hf4 hi2 hi4 hi5 hi6 hi7 hi8 ha3 ha4 |
| OpenAI Decisions | v2 | 0.5 | 0 | **73%** | 80% | 72% | 100% | 78% / 50% | hc6 hm1 hf3 hf4 hi2 hi4 hi6 hi7 hi8 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 1 | 0 | **80%** | 89% | 67% | 100% | 73% / 79% | hc6 hm1 hm6 hi2 hi4 hi8 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 2 | 0 | **80%** | 89% | 61% | 100% | 71% / 86% | hc6 hm1 hm6 hm8 hi2 hi4 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 4 | 0 | **82%** | 89% | 56% | 100% | 67% / 100% | hc6 hm1 hm5 hm6 hm8 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 8 | 0 | **73%** | 80% | 33% | 100% | 56% / 100% | hc5 hc6 hc7 hm1 hm2 hm4 hm5 hm6 hm8 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 16 | 0 | **66%** | 70% | 28% | 83% | 48% / 100% | hc5 hc6 hc7 hm1 hm2 hm4 hm5 hm6 hm7 hm8 hs3 hs6 ha1 ha3 ha4 |
| OpenAI Decisions | v2 | 32 | 0 | **61%** | 68% | 28% | 67% | 45% / 100% | hc5 hc6 hc7 hm1 hm2 hm4 hm5 hm6 hm7 hm8 hs1 hs3 hs6 ha1 ha2 ha3 ha4 |
| OpenAI Decisions | v2 | 64 | 0 | **55%** | 61% | 22% | 50% | 41% / 100% | hc1 hc5 hc6 hc7 hm1 hm2 hm4 hm5 hm6 hm7 hm8 hs1 hs2 hs3 hs6 hr2 ha1 ha2 ha3 ha4 |

</details>
