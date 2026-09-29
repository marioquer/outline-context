/**
 * Benchmark C — switching frequency vs. prompt-cache economics.
 *
 *   pnpm bench:switching
 *
 * Seven topics are seeded with history. Then a switching pattern is replayed
 * (AAAAAAAA, AAAABAAAA, ABABABAB, ABCDEFGABCDEFG) and every request each
 * strategy would send is fed through a prompt-cache simulator that follows
 * Anthropic's caching rules (see strategies/cache.ts). Seeding requests warm
 * the cache but are not counted.
 *
 * Cached/uncached tokens and cost are SIMULATED from documented rules, not
 * measured. TTFT needs a live model: see `pnpm bench:llm`.
 */
import { TOPICS, generate, rng, type SegmentSpec } from '../datasets/conversations.ts';
import { makeStrategies } from '../strategies/index.ts';
import { CacheSimulator, OPUS_5, dollars } from '../strategies/cache.ts';
import { fmtInt, fmtPct, mdTable, writeResult } from '../lib.ts';

export const PATTERNS = ['AAAAAAAA', 'AAAABAAAA', 'ABABABAB', 'ABCDEFGABCDEFG'];

const QUESTIONS = [
  (v: string) => `How should we handle ${v} next?`,
  (v: string) => `What is the biggest open risk with ${v}?`,
  (v: string) => `What would you change about ${v} first?`,
];

function patternTurns(pattern: string, seed: number) {
  const r = rng(seed);
  const turns: Array<{ user: string; assistant: string; topic: string }> = [];
  let prev = '';
  for (const ch of pattern) {
    const t = TOPICS[ch.charCodeAt(0) - 65]!;
    const v = t.vocab[Math.floor(r() * t.vocab.length)]!;
    const q = QUESTIONS[Math.floor(r() * QUESTIONS.length)]!(v);
    const user = ch === prev ? q : `Back to Project ${t.name} — ${q.charAt(0).toLowerCase()}${q.slice(1)}`;
    const assistant = `For ${t.name}, start with a small change to ${v}, measure it for a week, and write down what you learn before widening the rollout.`;
    turns.push({ user, assistant, topic: t.key });
    prev = ch;
  }
  return turns;
}

export async function runSwitchingBenchmark() {
  const seedSegments: SegmentSpec[] = TOPICS.slice(0, 7).map((t) => ({ topic: t.key, filler: 6, facts: ['database', 'owner'] }));
  const seedTurns = generate(seedSegments, { seed: 400, sentences: 6 }).turns;
  const rows: Array<Record<string, unknown>> = [];

  for (const pattern of PATTERNS) {
    for (const s of makeStrategies()) {
      const sim = new CacheSimulator(OPUS_5);
      for (const t of seedTurns) {
        if (t.role === 'user') sim.run(await s.ask(t.content, t.topic));
        else await s.answer(t.content);
      }
      let raw = 0;
      let cached = 0;
      let uncachedBilled = 0;
      let units = 0;
      for (const t of patternTurns(pattern, 500)) {
        const res = sim.run(await s.ask(t.user, t.topic));
        await s.answer(t.assistant);
        raw += res.total;
        cached += res.cachedRead;
        uncachedBilled += res.total - res.cachedRead;
        units += res.effectiveUnits;
      }
      rows.push({
        pattern,
        strategy: s.name,
        turns: pattern.length,
        rawInputTokens: raw,
        cachedInputTokens: cached,
        uncachedInputTokens: uncachedBilled,
        cacheHitRate: raw ? cached / raw : 0,
        effectiveInputUnits: units,
        effectiveInputCostUSD: dollars(units),
        noCacheCostUSD: dollars(raw),
      });
    }
  }

  const md = [
    '### Benchmark C — Switching frequency and prompt caching (simulated)',
    '',
    `Simulated with ${OPUS_5.model} rules: $${OPUS_5.inputPerMTok}/MTok input, cache reads ${OPUS_5.readMultiplier}×, 5-minute writes ${OPUS_5.writeMultiplier}×, ${OPUS_5.minCacheableTokens}-token minimum, exact block-prefix matching, all turns within TTL. Seven topics are pre-seeded (~${fmtInt(seedTurns.length / 2)} user turns) before the measured pattern.`,
    '',
    mdTable(
      ['Pattern', 'Strategy', 'Raw input', 'Cached', 'Uncached', 'Hit rate', 'Effective input cost', 'vs. no cache'],
      rows.map((r) => [
        `\`${r.pattern}\``,
        String(r.strategy),
        fmtInt(r.rawInputTokens as number),
        fmtInt(r.cachedInputTokens as number),
        fmtInt(r.uncachedInputTokens as number),
        fmtPct(r.cacheHitRate as number, 0),
        `$${(r.effectiveInputCostUSD as number).toFixed(4)}`,
        `$${(r.noCacheCostUSD as number).toFixed(4)}`,
      ]),
    ),
  ].join('\n');

  writeResult('switching', { pricing: OPUS_5, rows }, md);
  return { rows, md };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { md } = await runSwitchingBenchmark();
  console.log(md);
}
