/**
 * Opt-in: grade real model answers for Benchmarks A and B, and record real
 * token usage, cache reads and time-to-first-token.
 *
 *   ANTHROPIC_API_KEY=... pnpm bench:llm
 *   BENCH_MODEL=claude-opus-5 BENCH_CASES=4 pnpm bench:llm
 *
 * Same model, same prompt template, same questions for every strategy; only
 * the context differs. An answer is correct if it contains the expected value
 * and none of the colliding values. This spends real money: roughly
 * (cases × 5 strategies) requests.
 *
 * With AI_GATEWAY_API_KEY set, a sixth strategy routes with real Jev
 * (typesafe-ai/jev) next to the local reference backend: one gateway call per
 * user message, spaced under the rate limit (about 400 calls, ~15 min at
 * 30/min). A failed Jev call falls back to StayRouter and is counted.
 * BENCH_JEV=off skips it.
 *
 * Refusal fallbacks are deliberately not enabled: a fallback would switch
 * models mid-run and break the "same model" rule. Refusals are counted as
 * wrong and reported.
 */
import '../../scripts/load-env.ts';
import Anthropic from '@anthropic-ai/sdk';
import { TOPICS, topic } from '../datasets/conversations.ts';
import { collisionCases, topicReturnCases, type Case } from './context.ts';
import { ContextTreeStrategy, FullHistory, RecentWindow, VectorRetrieval, type Request, type Strategy } from '../strategies/index.ts';
import { StayRouter } from '@context-tree/core';
import { JevRouter } from '@context-tree/jev';
import { gatewayConfigured } from '@context-tree/jev/gateway';
import { ThrottledJevBackend } from '../jev-gateway.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESULTS_DIR, fmtInt, fmtPct, gitCommit, mdTable, mean, percentile, writeResult } from '../lib.ts';

const MODEL = process.env.BENCH_MODEL ?? 'claude-opus-5';
const LIMIT = Number(process.env.BENCH_CASES ?? 8);

interface Graded {
  benchmark: 'A' | 'B';
  caseId: string;
  strategy: string;
  correct: boolean;
  polluted: boolean;
  stopReason: string | null;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  ttftMs: number;
  totalMs: number;
  answer: string;
  /** Context Tree strategies: user messages routed in this case, and how many fell back because the Jev call failed. */
  routed?: number;
  fallbacks?: number;
}

const realJev = gatewayConfigured() && process.env.BENCH_JEV !== 'off' ? new ThrottledJevBackend() : null;

function strategies(): Strategy[] {
  return [
    new RecentWindow(12),
    new FullHistory(),
    new VectorRetrieval(8, 4),
    new ContextTreeStrategy({ name: 'Context Tree + Jev (local backend)' }),
    ...(realJev
      ? [
          new ContextTreeStrategy({
            name: `Context Tree + Jev (${realJev.name})`,
            router: new JevRouter({ backend: realJev, timeoutMs: 20_000, fallback: new StayRouter() }),
          }),
        ]
      : []),
    new ContextTreeStrategy({ oracle: true }),
  ];
}

async function ask(client: Anthropic, req: Request) {
  const system = req.blocks.slice(0, req.stableBlocks).join('\n\n');
  const transcript = req.blocks.slice(req.stableBlocks);
  const question = transcript.pop() ?? '';
  const content = `${transcript.length ? `Conversation so far:\n\n${transcript.join('\n\n')}\n\n` : ''}${question.replace(/^USER: /, '')}\n\nAnswer in one short sentence.`;

  const t0 = performance.now();
  let ttft = 0;
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    cache_control: { type: 'ephemeral' },
    system,
    messages: [{ role: 'user', content }],
  });
  for await (const event of stream) {
    if (!ttft && event.type === 'content_block_delta' && event.delta.type === 'text_delta') ttft = performance.now() - t0;
  }
  const msg = await stream.finalMessage();
  const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  return { msg, text, ttft, total: performance.now() - t0 };
}

async function main() {
  const client = new Anthropic();
  const cases: Array<['A' | 'B', Case]> = [
    ...topicReturnCases(LIMIT).map((c) => ['A', c] as ['A', Case]),
    ...collisionCases(LIMIT).map((c) => ['B', c] as ['B', Case]),
  ];
  const graded: Graded[] = [];

  for (const [bench, c] of cases) {
    const expected = topic(c.question.topic).facts[c.question.slot];
    const conflicts = TOPICS.filter((t) => t.key !== c.question.topic).map((t) => t.facts[c.question.slot]);
    for (const s of strategies()) {
      for (const t of c.turns) {
        if (t.role === 'user') await s.ask(t.content, t.topic);
        else await s.answer(t.content);
      }
      const req = await s.ask(c.question.content, c.question.topic);
      const { msg, text, ttft, total } = await ask(client, req);
      const polluted = conflicts.some((v) => text.includes(v));
      graded.push({
        benchmark: bench,
        caseId: c.id,
        strategy: s.name,
        correct: msg.stop_reason !== 'refusal' && text.includes(expected) && !polluted,
        polluted,
        stopReason: msg.stop_reason,
        inputTokens: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0),
        cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
        ttftMs: ttft,
        totalMs: total,
        answer: text,
        ...(s instanceof ContextTreeStrategy && !s.name.includes('oracle')
          ? { routed: s.placements.length, fallbacks: s.placements.filter((p) => p.fallback).length }
          : {}),
      });
      process.stdout.write('.');
    }
  }
  console.log();

  writeResult('llm-answers', { model: MODEL, cases: LIMIT, run: { commit: gitCommit(), at: new Date().toISOString() }, graded }, render(graded, MODEL, LIMIT));
  console.log(render(graded, MODEL, LIMIT));
}

/**
 * Accuracy is computed over answered requests. Refusals (stop_reason
 * "refusal") are reported in their own column: they say something about the
 * safety classifier and the synthetic text, not about the context strategy.
 */
export function render(graded: Graded[], model: string, limit: number): string {
  const strategies = [...new Set(graded.map((g) => g.strategy))];
  const table = (bench: 'A' | 'B') =>
    mdTable(
      ['Strategy', 'Correct (answered)', 'Refused', 'Answer used a colliding fact', 'Mean input tokens', 'TTFT p50', 'Total p50'],
      strategies.map((name) => {
        const rows = graded.filter((g) => g.benchmark === bench && g.strategy === name);
        const answered = rows.filter((r) => r.stopReason !== 'refusal');
        const correct = answered.filter((r) => r.correct).length;
        return [
          name,
          `${fmtPct(answered.length ? correct / answered.length : null, 0)} (${correct}/${answered.length})`,
          String(rows.length - answered.length),
          fmtPct(mean(answered.map((r) => (r.polluted ? 1 : 0))), 0),
          fmtInt(mean(rows.map((r) => r.inputTokens))),
          `${Math.round(percentile(answered.map((r) => r.ttftMs), 50))} ms`,
          `${Math.round(percentile(answered.map((r) => r.totalMs), 50))} ms`,
        ];
      }),
    );
  const refusals = graded.filter((g) => g.stopReason === 'refusal');
  const routing = strategies
    .map((name) => graded.filter((g) => g.strategy === name && g.routed != null))
    .filter((rows) => rows.length)
    .map(
      (rows) =>
        `${rows[0]!.strategy}: ${rows.reduce((a, r) => a + r.fallbacks!, 0)} of ${rows.reduce((a, r) => a + r.routed!, 0)} routed user messages fell back (Jev call failed, StayRouter decided).`,
    );
  return [
    `### LLM-graded answers (${model}, default settings, ${limit} cases per benchmark)`,
    '',
    'Benchmark A — topic return:',
    '',
    table('A'),
    '',
    'Benchmark B — context collision (question does not name the topic):',
    '',
    table('B'),
    '',
    'Correct = the answer contains the expected value and no colliding value. Input tokens are reported by the API (uncached + cache read + cache write). TTFT and total latency include network time from the benchmark machine.',
    ...(routing.length ? ['', 'Routing fallbacks:', ...routing.map((l) => `- ${l}`), ''] : []),
    refusals.length
      ? `Refusals: ${refusals.length} of ${graded.length} requests returned stop_reason "refusal", all in cases ${[...new Set(refusals.map((r) => r.caseId))].join(', ')}, across ${new Set(refusals.map((r) => r.strategy)).size} strategies. Refusal fallbacks were deliberately off so every answer comes from the same model.`
      : '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--render')) {
    // Re-render the table from the last run without calling the API again.
    const prev = JSON.parse(readFileSync(join(RESULTS_DIR, 'llm-answers.json'), 'utf8'));
    const run = prev.run ?? { commit: prev.meta?.commit, at: prev.meta?.generatedAt };
    const md = render(prev.graded, prev.model, prev.cases ?? LIMIT);
    writeResult('llm-answers', { model: prev.model, cases: prev.cases ?? LIMIT, run, graded: prev.graded }, md);
    console.log(md);
  } else {
    await main();
  }
}
