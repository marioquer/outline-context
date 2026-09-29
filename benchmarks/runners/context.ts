/**
 * Benchmarks A (topic return), B (context collision) and D (length scaling).
 *
 *   pnpm bench:context
 *
 * Each case replays a generated conversation through every strategy and
 * inspects the request built for the final question:
 *
 *   recall    — the expected fact value is present in the context
 *   pollution — a colliding value from another topic is present
 *   clean     — recall and no pollution
 *   tokens    — estimated input tokens of the request
 *
 * These are context-level measurements: they check what the model would be
 * shown, not what it answers. `pnpm bench:llm` grades real model answers.
 */
import { TOPICS, SLOT_QUESTION, generate, topic, type FactSlot, type SegmentSpec, type Turn } from '../datasets/conversations.ts';
import { ContextTreeStrategy, makeStrategies, tokensOf, type Strategy } from '../strategies/index.ts';
import { fmtInt, fmtPct, mdTable, mean, writeResult } from '../lib.ts';

export interface Case {
  id: string;
  turns: Turn[];
  question: { content: string; topic: string; slot: FactSlot };
}

export interface CaseScore {
  strategy: string;
  recall: boolean;
  pollution: boolean;
  tokens: number;
  routingPurity?: number;
  finalRoutedCorrectly?: boolean;
}

export async function scoreCase(c: Case, strategies: Strategy[] = makeStrategies()): Promise<CaseScore[]> {
  const out: CaseScore[] = [];
  const target = topic(c.question.topic);
  const expected = target.facts[c.question.slot];
  const conflicts = TOPICS.filter((t) => t.key !== target.key).map((t) => t.facts[c.question.slot]);
  for (const s of strategies) {
    for (const t of c.turns) {
      if (t.role === 'user') await s.ask(t.content, t.topic);
      else await s.answer(t.content);
    }
    const req = await s.ask(c.question.content, c.question.topic);
    const text = req.blocks.join('\n');
    const score: CaseScore = {
      strategy: s.name,
      recall: text.includes(expected),
      pollution: conflicts.some((v) => text.includes(v)),
      tokens: tokensOf(req),
    };
    if (s instanceof ContextTreeStrategy) {
      score.routingPurity = s.routingPurity();
      const last = s.placements[s.placements.length - 1]!;
      const ownerOfTarget = s.placements.find((p) => p.topic === c.question.topic)?.nodeId;
      score.finalRoutedCorrectly = last.nodeId === ownerOfTarget;
    }
    out.push(score);
  }
  return out;
}

function rotate<T>(xs: T[], n: number): T[] {
  return [...xs.slice(n), ...xs.slice(0, n)];
}

const SLOTS: FactSlot[] = ['database', 'region', 'owner', 'deadline', 'queue'];

/** A: A → B → C → D → A, facts in A, question names A on return. */
export function topicReturnCases(n = 8): Case[] {
  const cases: Case[] = [];
  for (let i = 0; i < n; i++) {
    const [a, b, c, d] = rotate(TOPICS, i).map((t) => t.key) as [string, string, string, string];
    const slot = SLOTS[i % SLOTS.length]!;
    const segs: SegmentSpec[] = [
      { topic: a, filler: 5, facts: [slot, SLOTS[(i + 1) % SLOTS.length]!] },
      { topic: b, filler: 6 },
      { topic: c, filler: 6 },
      { topic: d, filler: 6 },
    ];
    const { turns } = generate(segs, { seed: 100 + i });
    const t = topic(a);
    cases.push({
      id: `A${i + 1}`,
      turns,
      question: { content: `Back to Project ${t.name} — ${SLOT_QUESTION[slot].charAt(0).toLowerCase()}${SLOT_QUESTION[slot].slice(1)}`, topic: a, slot },
    });
  }
  return cases;
}

/**
 * B: three topics with colliding facts, interleaved. The user returns to one
 * topic, then asks the question without naming it.
 */
export function collisionCases(n = 8): Case[] {
  const cases: Case[] = [];
  for (let i = 0; i < n; i++) {
    const [a, b, c] = rotate(TOPICS, i * 3).map((t) => t.key) as [string, string, string];
    const slot = SLOTS[i % SLOTS.length]!;
    const segs: SegmentSpec[] = [
      { topic: a, filler: 2, facts: [slot] },
      { topic: b, filler: 2, facts: [slot] },
      { topic: c, filler: 2, facts: [slot] },
      { topic: a, filler: 2 },
      { topic: b, filler: 2 },
      { topic: c, filler: 2 },
      { topic: a, filler: 0, start: 'return' },
    ];
    const { turns } = generate(segs, { seed: 200 + i });
    cases.push({ id: `B${i + 1}`, turns, question: { content: SLOT_QUESTION[slot], topic: a, slot } });
  }
  return cases;
}

/** D: history grows to `targetTokens` while the active topic stays small. */
export function scalingCase(targetTokens: number, seed = 300): Case {
  const a = 'atlas';
  const others = TOPICS.filter((t) => t.key !== a).map((t) => t.key);
  const segs: SegmentSpec[] = [{ topic: a, filler: 3, facts: ['database', 'owner'] }];
  // ~6 filler exchanges ≈ 1K estimated tokens per segment.
  const perSegment = 1000;
  const count = Math.max(1, Math.round(targetTokens / perSegment));
  for (let i = 0; i < count; i++) segs.push({ topic: others[i % others.length]!, filler: 6 });
  const { turns } = generate(segs, { seed });
  return {
    id: `D${Math.round(targetTokens / 1000)}K`,
    turns,
    question: { content: 'Back to Project Atlas — which database did we decide on?', topic: a, slot: 'database' },
  };
}

interface Agg {
  strategy: string;
  n: number;
  recall: number;
  pollution: number;
  clean: number;
  meanTokens: number;
  routingPurity?: number;
  finalRouted?: number;
}

function aggregate(scores: CaseScore[][]): Agg[] {
  const names = scores[0]!.map((s) => s.strategy);
  return names.map((name) => {
    const rows = scores.map((cs) => cs.find((s) => s.strategy === name)!);
    const purity = rows.map((r) => r.routingPurity).filter((x): x is number => x != null);
    const routed = rows.map((r) => r.finalRoutedCorrectly).filter((x): x is boolean => x != null);
    return {
      strategy: name,
      n: rows.length,
      recall: mean(rows.map((r) => (r.recall ? 1 : 0))),
      pollution: mean(rows.map((r) => (r.pollution ? 1 : 0))),
      clean: mean(rows.map((r) => (r.recall && !r.pollution ? 1 : 0))),
      meanTokens: mean(rows.map((r) => r.tokens)),
      ...(purity.length ? { routingPurity: mean(purity) } : {}),
      ...(routed.length ? { finalRouted: mean(routed.map((x) => (x ? 1 : 0))) } : {}),
    };
  });
}

function aggTable(aggs: Agg[]): string {
  return mdTable(
    ['Strategy', 'Fact in context', 'Colliding fact in context', 'Clean', 'Mean input tokens', 'Final turn routed correctly'],
    aggs.map((a) => [
      a.strategy,
      fmtPct(a.recall, 0),
      fmtPct(a.pollution, 0),
      fmtPct(a.clean, 0),
      fmtInt(a.meanTokens),
      a.finalRouted != null ? fmtPct(a.finalRouted, 0) : '–',
    ]),
  );
}

export async function runContextBenchmarks() {
  const aCases = topicReturnCases();
  const aScores = [];
  for (const c of aCases) aScores.push(await scoreCase(c));
  const A = aggregate(aScores);

  const bCases = collisionCases();
  const bScores = [];
  for (const c of bCases) bScores.push(await scoreCase(c));
  const B = aggregate(bScores);

  const sizes = [10_000, 25_000, 50_000, 100_000, 200_000];
  const D: Array<{ target: number; fullHistoryTokens: number; results: CaseScore[] }> = [];
  for (const size of sizes) {
    const c = scalingCase(size);
    const results = await scoreCase(c);
    D.push({ target: size, fullHistoryTokens: results.find((r) => r.strategy === 'Full history')!.tokens, results });
  }

  const strategyNames = D[0]!.results.map((r) => r.strategy);
  const md = [
    `### Benchmark A — Topic return (A → B → C → D → A, ${aCases.length} cases)`,
    '',
    aggTable(A),
    '',
    `### Benchmark B — Context collision (3 topics with conflicting facts, ${bCases.length} cases)`,
    '',
    'The user returns to one topic, then asks without naming it (e.g. "Which database did we decide on?").',
    '',
    aggTable(B),
    '',
    '### Benchmark D — Context length scaling (one small active topic, growing unrelated history)',
    '',
    'Input tokens of the final request (fact in context ✓ / ✗, colliding fact present ⚠):',
    '',
    mdTable(
      ['History (full)', ...strategyNames],
      D.map((d) => [
        fmtInt(d.fullHistoryTokens),
        ...d.results.map((r) => `${fmtInt(r.tokens)} ${r.recall ? '✓' : '✗'}${r.pollution ? ' ⚠' : ''}`),
      ]),
    ),
  ].join('\n');

  writeResult('context', { A, B, D, cases: { A: aScores, B: bScores } }, md);
  return { A, B, D, md };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { md } = await runContextBenchmarks();
  console.log(md);
}
