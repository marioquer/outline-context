/**
 * Benchmark E against real Jev (typesafe-ai/jev on the Vercel AI Gateway).
 *
 *   AI_GATEWAY_API_KEY=… pnpm bench:jev
 *
 * One `evaluate` call per case (57 calls). The gateway rate-limits by request
 * (30/min), so calls are spaced at least 2.1 s apart and the run takes about
 * two minutes. A failed call is NOT silently replaced: the fallback is
 * StayRouter, the case is scored as whatever that produced, and the number of
 * fallbacks is reported next to the scores.
 *
 * Results go to results/routing-jev.* and are included in RESULTS.md.
 */
import '../../scripts/load-env.ts';
import { StayRouter } from '@context-tree/core';
import { JevRouter, type JevBackend, type JevRequest, type JevResponse } from '@context-tree/jev';
import { GatewayJevBackend, gatewayConfigured } from '@context-tree/jev/gateway';
import { CASES, TREES } from '../datasets/routing-fixtures.ts';
import { fmtInt, mean, writeResult } from '../lib.ts';
import { printFailures, routingTable, runRouter } from './routing.ts';

/** Spaces calls so the run stays under the gateway's request rate limit. */
class Throttled implements JevBackend {
  private next = 0;
  readonly name: string;
  readonly usage: Array<{ inputTokens?: number; outputTokens?: number; latencyMs: number }> = [];
  constructor(
    private readonly inner: GatewayJevBackend,
    private readonly minIntervalMs: number,
  ) {
    this.name = inner.name;
  }
  async route(req: JevRequest, opts?: { signal?: AbortSignal }): Promise<JevResponse> {
    const wait = this.next - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.next = Date.now() + this.minIntervalMs;
    const out = await this.inner.route(req, opts);
    if (this.inner.lastCall) this.usage.push(this.inner.lastCall);
    return out;
  }
}

if (!gatewayConfigured()) {
  console.error('AI_GATEWAY_API_KEY is not set (or JEV_FORCE_LOCAL=true). Nothing to run.');
  process.exit(1);
}

const backend = new Throttled(new GatewayJevBackend(), Number(process.env.JEV_MIN_INTERVAL_MS ?? 2100));
// Throttle waits happen before the call starts, so they are not in latencyMs.
const run = await runRouter(`JevRouter (${backend.name})`, () => new JevRouter({ backend, timeoutMs: 20_000, fallback: new StayRouter() }));

const tokens = backend.usage.map((u) => u.inputTokens).filter((x): x is number => x != null);
const md = [
  `### Benchmark E — Routing with real Jev (${backend.name}, ${CASES.length} cases, ${TREES.length} trees)`,
  '',
  routingTable([run], 0),
  '',
  `Calls: ${backend.usage.length}. Fallbacks (call failed, StayRouter decided): ${run.metrics.fallbacks}. ` +
    (tokens.length ? `Mean input tokens per call (reported by the gateway): ${fmtInt(mean(tokens))}. ` : '') +
    'Latency is the round trip from the benchmark machine to the gateway.',
].join('\n');

writeResult('routing-jev', { run }, md);
console.log(md);
printFailures(run);
