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
 * Refusal fallbacks are deliberately not enabled: a fallback would switch
 * models mid-run and break the "same model" rule. Refusals are counted as
 * wrong and reported.
 */
import Anthropic from '@anthropic-ai/sdk';
import { TOPICS, topic } from '../datasets/conversations.ts';
import { collisionCases, topicReturnCases, type Case } from './context.ts';
import { makeStrategies, type Request } from '../strategies/index.ts';
import { fmtInt, fmtPct, mdTable, mean, percentile, writeResult } from '../lib.ts';

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
    for (const s of makeStrategies()) {
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
      });
      process.stdout.write('.');
    }
  }
  console.log();

  const strategies = [...new Set(graded.map((g) => g.strategy))];
  const table = (bench: 'A' | 'B') =>
    mdTable(
      ['Strategy', 'Correct', 'Answer used a colliding fact', 'Mean input tokens', 'TTFT p50', 'Total p50'],
      strategies.map((name) => {
        const rows = graded.filter((g) => g.benchmark === bench && g.strategy === name);
        return [
          name,
          fmtPct(mean(rows.map((r) => (r.correct ? 1 : 0))), 0),
          fmtPct(mean(rows.map((r) => (r.polluted ? 1 : 0))), 0),
          fmtInt(mean(rows.map((r) => r.inputTokens))),
          `${Math.round(percentile(rows.map((r) => r.ttftMs), 50))} ms`,
          `${Math.round(percentile(rows.map((r) => r.totalMs), 50))} ms`,
        ];
      }),
    );

  const md = [
    `### LLM-graded answers (${MODEL}, default sampling, ${LIMIT} cases per benchmark)`,
    '',
    'Benchmark A — topic return:',
    '',
    table('A'),
    '',
    'Benchmark B — context collision:',
    '',
    table('B'),
    '',
    'Input tokens are reported by the API (uncached + cache read + cache write). TTFT and total latency include network time from the benchmark machine.',
  ].join('\n');
  writeResult('llm-answers', { model: MODEL, graded }, md);
  console.log(md);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
