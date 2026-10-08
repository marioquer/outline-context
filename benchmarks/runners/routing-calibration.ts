/**
 * Calibration experiment: can a decision bias or a route-question rewording fix
 * under-forking, without training?
 *
 *   pnpm bench:calibrate            # every backend with a key configured
 *
 * For each backend (real Jev, OpenAI Decisions) and each route prompt (v1, v2)
 * it makes one live pass over the routing cases and records every response.
 * It then replays those recorded responses offline under different decision
 * settings: the fork probability multiplied by k before normalising (a logit
 * bias of ln k), and the STAY hysteresis margin. Replays make no API calls.
 *
 * Caveat: on the development fixtures the sweep is scored on the same cases it
 * is chosen on, so the best row is an in-sample number. Confirm a setting on
 * the held-out cases before shipping it:
 *
 *   ROUTING_SET=holdout pnpm bench:calibrate
 */
import '../../scripts/load-env.ts';
import { StayRouter, type DecisionPolicy } from '@context-tree/core';
import { JevRouter, type JevBackend, type JevRequest, type JevResponse } from '@context-tree/jev';
import { GatewayJevBackend, gatewayConfigured, type RoutePrompt } from '@context-tree/jev/gateway';
import { OpenAIDecisionsBackend, openaiConfigured } from '@context-tree/jev/openai';
import { ThrottledJevBackend } from '../jev-gateway.ts';
import { fmtPct, writeResult } from '../lib.ts';

const pct = (x: number | null) => fmtPct(x, 0);
import { datasetFromEnv, runRouter, type RouterRun } from './routing.ts';

const DATA = datasetFromEnv();
const HOLDOUT = DATA.name === 'held-out';

/** Identifies a case's request across passes (recency ranks come from wall-clock timestamps). */
const keyOf = (req: JevRequest) => JSON.stringify([req.message, req.activeNodeId, req.candidates.map((c) => c.id)]);

/** Records every live response with the request it answered. */
class RecordingBackend implements JevBackend {
  readonly name: string;
  readonly log = new Map<string, { req: JevRequest; res: JevResponse }>();
  constructor(private readonly inner: JevBackend) {
    this.name = inner.name;
  }
  /** Retries transient failures so a flaky call does not leave a gap the replays cannot fill. */
  async route(req: JevRequest, opts?: { signal?: AbortSignal }) {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await this.inner.route(req, opts);
        this.log.set(keyOf(req), { req, res });
        return res;
      } catch (err) {
        if (attempt >= 3 || opts?.signal?.aborted) throw err;
        console.warn(`  retrying after: ${err instanceof Error ? err.message : String(err)}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
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
/** Pre-registered for the held-out check: the low end of the 16–64 plateau found on the development set. */
const CANDIDATE_K = 16;

type Row = { backend: string; prompt: RoutePrompt; k: number; stayMargin: number; run: RouterRun };
const rows: Row[] = [];
const forkMass: Record<string, Array<{ id: string; pFork: number; rank: number }>> = {};

for (const b of backends) {
  for (const prompt of ['v1', 'v2'] as const) {
    const rec = new RecordingBackend(b.make(prompt));
    const live = await runRouter(`${b.label} ${prompt}`, () => new JevRouter({ backend: rec, timeoutMs: 20_000, fallback: new StayRouter() }), DATA);
    if (live.metrics.fallbacks > 0) {
      console.warn(`${b.label} ${prompt}: ${live.metrics.fallbacks} fallbacks in the live pass`);
      for (const f of live.failures.filter((x) => x.fallback)) console.warn(`  ${f.id}: ${f.fallback}`);
    }
    console.log(`${b.label} ${prompt}: live strict ${pct(live.metrics.targetAccuracyStrict)}, ${rec.log.size} responses recorded`);

    // Where the fork mass sits on the cases that should fork.
    forkMass[`${b.label} ${prompt}`] = [...rec.log.values()].flatMap(({ req, res }) => {
      const c = DATA.cases.find((x) => x.message === req.message && x.expect.action === 'fork');
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
        DATA,
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
    if (HOLDOUT) {
      const candidate = mine.find((r) => r.k === CANDIDATE_K && r.stayMargin === DEFAULT_ROW.stayMargin)!;
      summary.push(fmtRow(base), fmtRow(candidate));
    } else {
      const best = mine.reduce((a, r) => ((r.run.metrics.targetAccuracyStrict ?? 0) > (a.run.metrics.targetAccuracyStrict ?? 0) ? r : a), base);
      summary.push(fmtRow(base), ...(best === base ? [] : [fmtRow(best)]));
    }
  }
}

const massTable = Object.entries(forkMass).map(
  ([name, xs]) => `| ${name} | ${xs.map((x) => `${x.id}: ${(x.pFork * 100).toFixed(0)}% (#${x.rank})`).join(', ')} |`,
);

const nFork = DATA.cases.filter((c) => c.expect.action === 'fork').length;
const md = [
  `### Calibration — fork bias and route wording (${DATA.name} set, ${DATA.cases.length} cases)`,
  '',
  'One live pass per backend and prompt; every other row replays those recorded responses with the fork probability multiplied by k and the STAY margin changed. ' +
    (HOLDOUT
      ? `For each backend and prompt: the default setting (k = 1, margin 0.08), then the pre-registered k = ${CANDIDATE_K}. ` +
        'These cases were written after the development sweep and were not used to choose k. The full sweep below is for inspection only; picking its best row would tune on this set too.'
      : 'For each backend and prompt: the default setting (k = 1, margin 0.08), then the best replayed setting if it differs. ' +
        `**The best rows are tuned and scored on the same ${DATA.cases.length} cases (in-sample).**`),
  '',
  header,
  ...summary,
  '',
  `Fork probability on the ${nFork} cases that should fork (and its rank among all options):`,
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

writeResult(HOLDOUT ? 'routing-calibration-holdout' : 'routing-calibration', { rows: rows.map((r) => ({ ...r, run: { metrics: r.run.metrics, failures: r.run.failures } })), forkMass }, md);
console.log(md);
