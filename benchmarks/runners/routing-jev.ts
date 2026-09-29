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
import { JevRouter } from '@context-tree/jev';
import { gatewayConfigured } from '@context-tree/jev/gateway';
import { ThrottledJevBackend } from '../jev-gateway.ts';
import { CASES, TREES } from '../datasets/routing-fixtures.ts';
import { fmtInt, mean, percentile, writeResult } from '../lib.ts';
import { printFailures, routingTable, runRouter } from './routing.ts';

if (!gatewayConfigured()) {
  console.error('AI_GATEWAY_API_KEY is not set (or JEV_FORCE_LOCAL=true). Nothing to run.');
  process.exit(1);
}

const backend = new ThrottledJevBackend();
const run = await runRouter(`JevRouter (${backend.name})`, () => new JevRouter({ backend, timeoutMs: 20_000, fallback: new StayRouter() }));
// The router's latencyMs wraps ThrottledJevBackend.route(), so it includes the throttle
// wait. Report the gateway round trip (timed inside GatewayJevBackend) instead.
const roundTrips = backend.usage.map((u) => u.latencyMs);
run.metrics.latencyP50Ms = percentile(roundTrips, 50);
run.metrics.latencyP95Ms = percentile(roundTrips, 95);

const tokens = backend.usage.map((u) => u.inputTokens).filter((x): x is number => x != null);
const md = [
  `### Benchmark E — Routing with real Jev (${backend.name}, ${CASES.length} cases, ${TREES.length} trees)`,
  '',
  routingTable([run], 0),
  '',
  `Calls: ${backend.usage.length}. Fallbacks (call failed, StayRouter decided): ${run.metrics.fallbacks}. ` +
    (tokens.length ? `Mean input tokens per call (reported by the gateway): ${fmtInt(mean(tokens))}. ` : '') +
    'Latency is the gateway round trip from the benchmark machine, excluding the throttle wait between calls.',
].join('\n');

writeResult('routing-jev', { run }, md);
console.log(md);
printFailures(run);
