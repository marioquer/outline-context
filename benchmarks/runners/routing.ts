/**
 * Benchmark E — routing accuracy.
 *
 *   pnpm bench:routing
 *
 * Replays every fixture in datasets/routing-fixtures.ts through each router
 * via the real ContextTreeSession (candidate builder, fallback, depth clamp
 * included) and scores the committed outcome.
 */
import {
  MockRouter,
  StayRouter,
  createContextTree,
  estimateRequestTokens,
  type ContextTreeSession,
  type Router,
} from '../strategies/shared.ts';
import { JevRouter } from '@context-tree/jev';
import { CASES, TREES, type Category, type Outcome, type RoutingCase } from '../datasets/routing-fixtures.ts';
import { fmtPct, mdTable, mean, percentile, ratio, writeResult } from '../lib.ts';

function buildSession(router: Router, c: RoutingCase): ContextTreeSession {
  const def = TREES.find((t) => t.id === c.tree)!;
  const rootId = `${def.id}:root`;
  const s = createContextTree({ router, root: { id: rootId, title: def.rootTitle, summary: def.rootSummary } });
  let t = 1_000_000;
  for (const n of def.nodes) s.createNode({ id: n.id, title: n.title, parentId: n.parent ?? rootId });
  for (const n of def.nodes) for (const turn of n.turns) s.record(n.id, { role: 'user', content: turn, createdAt: (t += 1000) });
  for (const v of c.visited ?? []) s.tree = { ...s.tree, nodes: { ...s.tree.nodes, [v]: { ...s.tree.nodes[v]!, lastActiveAt: (t += 1000) } } };
  s.activate(c.active);
  return s;
}

function matches(o: Outcome, action: string, active: string, parent: string | undefined, rootId: string): boolean {
  const norm = (id: string) => (id.endsWith(':root') ? rootId : id);
  if (o.action !== action) return false;
  if (action === 'fork') return (o.parents ?? []).map(norm).includes(parent ?? '');
  return o.target ? norm(o.target) === active : true;
}

interface CaseResult {
  id: string;
  category: Category;
  expected: Outcome;
  action: string;
  active: string;
  parent?: string;
  strict: boolean;
  lenient: boolean;
  actionCorrect: boolean;
  latencyMs: number;
  requestTokens: number;
}

async function runRouter(name: string, make: () => Router) {
  const results: CaseResult[] = [];
  for (const c of CASES) {
    const router = make();
    const s = buildSession(router, c);
    const rootId = `${c.tree}:root`;
    const requestTokens = await estimateRequestTokens(s, c.message);
    const r = await s.add({ content: c.message });
    const action = r.decision!.action;
    const parent = r.createdNode?.parentId ?? undefined;
    const strict = matches(c.expect, action, r.activeNodeId, parent, rootId);
    const lenient = strict || (c.acceptable ?? []).some((o) => matches(o, action, r.activeNodeId, parent, rootId));
    results.push({
      id: c.id,
      category: c.category,
      expected: c.expect,
      action,
      active: r.activeNodeId,
      ...(parent ? { parent } : {}),
      strict,
      lenient,
      actionCorrect: action === c.expect.action,
      latencyMs: r.decision!.latencyMs ?? 0,
      requestTokens,
    });
  }

  const by = (f: (r: CaseResult) => boolean) => results.filter(f);
  const expStay = by((r) => r.expected.action === 'stay');
  const expSwitch = by((r) => r.expected.action === 'switch');
  const expFork = by((r) => r.expected.action === 'fork');
  const predFork = by((r) => r.action === 'fork');
  const categories = [...new Set(CASES.map((c) => c.category))];
  return {
    router: name,
    cases: results.length,
    metrics: {
      stayAccuracy: ratio(expStay.filter((r) => r.strict).length, expStay.length),
      switchAccuracy: ratio(expSwitch.filter((r) => r.strict).length, expSwitch.length),
      forkPrecision: ratio(predFork.filter((r) => r.expected.action === 'fork').length, predFork.length),
      forkRecall: ratio(expFork.filter((r) => r.action === 'fork').length, expFork.length),
      forkParentAccuracy: ratio(expFork.filter((r) => r.strict).length, expFork.filter((r) => r.action === 'fork').length),
      actionAccuracy: ratio(by((r) => r.actionCorrect).length, results.length),
      targetAccuracyStrict: ratio(by((r) => r.strict).length, results.length),
      targetAccuracyLenient: ratio(by((r) => r.lenient).length, results.length),
      latencyP50Ms: percentile(results.map((r) => r.latencyMs), 50),
      latencyP95Ms: percentile(results.map((r) => r.latencyMs), 95),
      meanRequestTokens: mean(results.map((r) => r.requestTokens)),
    },
    byCategory: Object.fromEntries(
      categories.map((cat) => {
        const rs = by((r) => r.category === cat);
        return [cat, { n: rs.length, strict: ratio(rs.filter((r) => r.strict).length, rs.length) }];
      }),
    ),
    failures: results.filter((r) => !r.strict),
  };
}

export async function runRoutingBenchmark() {
  const routers: Array<[string, () => Router]> = [
    ['Always STAY', () => new StayRouter()],
    ['MockRouter (lexical)', () => new MockRouter()],
    ['JevRouter (local reference backend)', () => new JevRouter()],
  ];
  const runs = [];
  for (const [name, make] of routers) runs.push(await runRouter(name, make));

  const m = (x: number | null) => fmtPct(x, 0);
  const md = [
    `### Benchmark E — Routing (${CASES.length} hand-labelled cases, ${TREES.length} trees)`,
    '',
    mdTable(
      ['Router', 'STAY acc', 'SWITCH acc', 'FORK prec', 'FORK recall', 'FORK parent', 'Target acc (strict)', 'Target acc (lenient)', 'p50 / p95 latency'],
      runs.map((r) => [
        r.router,
        m(r.metrics.stayAccuracy),
        m(r.metrics.switchAccuracy),
        m(r.metrics.forkPrecision),
        m(r.metrics.forkRecall),
        m(r.metrics.forkParentAccuracy),
        m(r.metrics.targetAccuracyStrict),
        m(r.metrics.targetAccuracyLenient),
        `${r.metrics.latencyP50Ms.toFixed(2)} / ${r.metrics.latencyP95Ms.toFixed(2)} ms`,
      ]),
    ),
    '',
    'By category (strict):',
    '',
    mdTable(
      ['Router', ...Object.keys(runs[0]!.byCategory)],
      runs.map((r) => [r.router, ...Object.values(r.byCategory).map((c) => `${m(c.strict)} (n=${c.n})`)]),
    ),
    '',
    `Routing cost: the local backend runs in-process ($0). A hosted Jev model would receive ~${Math.round(runs[2]!.metrics.meanRequestTokens)} tokens per request on average (estimated from the serialized JevRequest).`,
    'Latency is in-process wall time on the benchmark machine and does not include network time to a hosted model.',
  ].join('\n');

  writeResult('routing', { runs }, md);
  return { runs, md };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { md, runs } = await runRoutingBenchmark();
  console.log(md);
  const jev = runs[runs.length - 1]!;
  console.log(`\nJev failures (${jev.failures.length}):`);
  for (const f of jev.failures) console.log(`  ${f.id} [${f.category}] expected ${JSON.stringify(f.expected)} got ${f.action} → ${f.active}${f.parent ? ` (parent ${f.parent})` : ''}`);
}
