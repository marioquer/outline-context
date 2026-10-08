/**
 * Calibration experiment: can a decision bias or a route-question rewording fix
 * under-forking, without training?
 *
 *   pnpm bench:calibrate            # every backend with a key configured
 *
 * For each backend (real Jev, OpenAI Decisions) and each route prompt (v1, v2)
 * it makes one live pass over the 57 routing cases and records every response.
 * It then replays those recorded responses offline under different decision
 * settings: the fork probability multiplied by k before normalising (a logit
 * bias of ln k), and the STAY hysteresis margin. Replays make no API calls.
 *
 * Caveat: the sweep is scored on the same 57 cases it is chosen on, so the best
 * row is an in-sample number. Confirm a setting on held-out cases before
 * shipping it.
 */
import '../../scripts/load-env.ts';
import { StayRouter, type DecisionPolicy } from '@context-tree/core';
import { JevRouter, type JevBackend, type JevRequest, type JevResponse } from '@context-tree/jev';
import { GatewayJevBackend, gatewayConfigured, type RoutePrompt } from '@context-tree/jev/gateway';
import { OpenAIDecisionsBackend, openaiConfigured } from '@context-tree/jev/openai';
import { ThrottledJevBackend } from '../jev-gateway.ts';
import { CASES } from '../datasets/routing-fixtures.ts';
import { fmtPct, writeResult } from '../lib.ts';

const pct = (x: number | null) => fmtPct(x, 0);
import { runRouter, type RouterRun } from './routing.ts';

/** Identifies a case's request across passes (recency ranks come from wall-clock timestamps). */
const keyOf = (req: JevRequest) => JSON.stringify([req.message, req.activeNodeId, req.candidates.map((c) => c.id)]);

/** Records every live response with the request it answered. */
class RecordingBackend implements JevBackend {
  readonly name: string;
  readonly log = new Map<string, { req: JevRequest; res: JevResponse }>();
  constructor(private readonly inner: JevBackend) {
    this.name = inner.name;
  }
  async route(req: JevRequest, opts?: { signal?: AbortSignal }) {
    const res = await this.inner.route(req, opts);
    this.log.set(keyOf(req), { req, res });
    return res;
  }
}

/** Replays recorded responses with the fork probability scaled by k. */
class ReplayBackend implements JevBackend {
  constructor(
    readonly name: string,
    private readonly log: Map<string, { req: JevRequest; res: JevResponse }>,
    private readonly k: number,
  ) {}
  async route(req: JevRequest) {
    const res = this.log.get(keyOf(req))?.res;
    if (!res) throw new Error('no recorded response for this request');
    return res.fork ? { ...res, fork: { ...res.fork, p: (res.fork.p ?? 0) * this.k } } : res;
  }
}

const backends: Array<{ label: string; make: (prompt: RoutePrompt) => JevBackend }> = [];
if (gatewayConfigured()) {
  backends.push({ label: 'Real Jev', make: (routePrompt) => new ThrottledJevBackend(new GatewayJevBackend({ routePrompt })) });
}
if (openaiConfigured()) {
  backends.push({
    label: 'OpenAI Decisions',
    make: (routePrompt) => new ThrottledJevBackend(new OpenAIDecisionsBackend({ routePrompt }), Number(process.env.OPENAI_MIN_INTERVAL_MS ?? 0)),
  });
}
if (backends.length === 0) {
  console.error('Neither AI_GATEWAY_API_KEY nor OPENAI_API_KEY is set. Nothing to run.');
  process.exit(1);
}

const KS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];
const STAY_MARGINS = [0.08, 0];
const DEFAULT_ROW = { k: 1, stayMargin: 0.08 };

type Row = { backend: string; prompt: RoutePrompt; k: number; stayMargin: number; run: RouterRun };
const rows: Row[] = [];
const forkMass: Record<string, Array<{ id: string; pFork: number; rank: number }>> = {};

for (const b of backends) {
  for (const prompt of ['v1', 'v2'] as const) {
    const rec = new RecordingBackend(b.make(prompt));
    const live = await runRouter(`${b.label} ${prompt}`, () => new JevRouter({ backend: rec, timeoutMs: 20_000, fallback: new StayRouter() }));
    if (live.metrics.fallbacks > 0) console.warn(`${b.label} ${prompt}: ${live.metrics.fallbacks} fallbacks in the live pass`);
    console.log(`${b.label} ${prompt}: live strict ${pct(live.metrics.targetAccuracyStrict)}, ${rec.log.size} responses recorded`);

    // Where the fork mass sits on the cases that should fork.
    forkMass[`${b.label} ${prompt}`] = [...rec.log.values()].flatMap(({ req, res }) => {
      const c = CASES.find((x) => x.message === req.message && x.expect.action === 'fork');
      if (!c) return [];
      const ps = res.scores.map((s) => s.p ?? 0);
      const pFork = res.fork?.p ?? 0;
      const total = ps.reduce((a, x) => a + x, 0) + pFork;
      return [{ id: c.id, pFork: pFork / total, rank: 1 + ps.filter((p) => p > pFork).length }];
    });

    for (const stayMargin of STAY_MARGINS) {
      for (const k of KS) {
        const policy: DecisionPolicy = { stayMargin };
        const run = await runRouter(`${b.label} ${prompt} k=${k} m=${stayMargin}`, () =>
          new JevRouter({ backend: new ReplayBackend(rec.name, rec.log, k), policy, fallback: new StayRouter() }),
        );
        if (run.metrics.fallbacks > 0) throw new Error(`replay missed recorded responses (${run.router})`);
        rows.push({ backend: b.label, prompt, k, stayMargin, run });
      }
    }
  }
}

const fmtRow = (r: Row) => {
  const m = r.run.metrics;
  const fails = r.run.failures.map((f) => f.id).join(' ');
  return `| ${r.backend} | ${r.prompt} | ${r.k} | ${r.stayMargin} | **${pct(m.targetAccuracyStrict)}** | ${pct(m.targetAccuracyLenient)} | ${pct(m.stayAccuracy)} | ${pct(m.switchAccuracy)} | ${pct(m.forkPrecision)} / ${pct(m.forkRecall)} | ${fails} |`;
};
const header = '| Backend | Prompt | Fork ×k | STAY margin | Strict | Lenient | STAY | SWITCH | FORK prec / recall | Misses |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';

const summary: string[] = [];
for (const b of backends) {
  for (const prompt of ['v1', 'v2'] as const) {
    const mine = rows.filter((r) => r.backend === b.label && r.prompt === prompt);
    const base = mine.find((r) => r.k === DEFAULT_ROW.k && r.stayMargin === DEFAULT_ROW.stayMargin)!;
    const best = mine.reduce((a, r) => ((r.run.metrics.targetAccuracyStrict ?? 0) > (a.run.metrics.targetAccuracyStrict ?? 0) ? r : a), base);
    summary.push(fmtRow(base), ...(best === base ? [] : [fmtRow(best)]));
  }
}

const massTable = Object.entries(forkMass).map(
  ([name, xs]) => `| ${name} | ${xs.map((x) => `${x.id}: ${(x.pFork * 100).toFixed(0)}% (#${x.rank})`).join(', ')} |`,
);

const md = [
  `### Calibration — fork bias and route wording (${CASES.length} cases)`,
  '',
  'One live pass per backend and prompt; every other row replays those recorded responses with the fork probability multiplied by k and the STAY margin changed. ' +
    'For each backend and prompt: the default setting (k = 1, margin 0.08), then the best replayed setting if it differs. ' +
    '**The best rows are tuned and scored on the same 57 cases (in-sample).**',
  '',
  header,
  ...summary,
  '',
  'Fork probability on the 10 cases that should fork (and its rank among all options):',
  '',
  '| Backend, prompt | Case: p(NEW) (rank) |',
  '| --- | --- |',
  ...massTable,
  '',
  '<details><summary>Full sweep</summary>',
  '',
  header,
  ...rows.map(fmtRow),
  '',
  '</details>',
].join('\n');

writeResult('routing-calibration', { rows: rows.map((r) => ({ ...r, run: { metrics: r.run.metrics, failures: r.run.failures } })), forkMass }, md);
console.log(md);
