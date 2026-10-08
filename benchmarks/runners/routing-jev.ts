/**
 * Benchmark E against real Jev (typesafe-ai/jev on the Vercel AI Gateway), or
 * against OpenAI's Decisions API asked the same questions.
 *
 *   AI_GATEWAY_API_KEY=… pnpm bench:jev
 *   OPENAI_API_KEY=… JEV_BACKEND=openai pnpm bench:jev
 *
 * One `evaluate` call per case (57 calls). The gateway rate-limits by request
 * (30/min), so calls are spaced at least 2.1 s apart and the run takes about
 * two minutes. A failed call is NOT silently replaced: the fallback is
 * StayRouter, the case is scored as whatever that produced, and the number of
 * fallbacks is reported next to the scores.
 *
 * Results go to results/routing-jev.* (results/routing-openai-decisions.* for
 * OpenAI) and are included in RESULTS.md.
 */
import '../../scripts/load-env.ts';
import { StayRouter } from '@context-tree/core';
import { JevRouter } from '@context-tree/jev';
import { gatewayConfigured } from '@context-tree/jev/gateway';
import { OpenAIDecisionsBackend, openaiConfigured } from '@context-tree/jev/openai';
import { ThrottledJevBackend } from '../jev-gateway.ts';
import { CASES, TREES } from '../datasets/routing-fixtures.ts';
import { fmtInt, mean, percentile, writeResult } from '../lib.ts';
import { printFailures, routingTable, runRouter } from './routing.ts';

const openai = process.env.JEV_BACKEND === 'openai';
if (openai ? !openaiConfigured() : !gatewayConfigured()) {
  console.error(openai ? 'OPENAI_API_KEY is not set. Nothing to run.' : 'AI_GATEWAY_API_KEY is not set (or JEV_FORCE_LOCAL=true). Nothing to run.');
  process.exit(1);
}

const backend = openai
  ? new ThrottledJevBackend(new OpenAIDecisionsBackend(), Number(process.env.JEV_MIN_INTERVAL_MS ?? 0))
  : new ThrottledJevBackend();
const run = await runRouter(`JevRouter (${backend.name})`, () => new JevRouter({ backend, timeoutMs: 20_000, fallback: new StayRouter() }));
// The router's latencyMs wraps ThrottledJevBackend.route(), so it includes the throttle
// wait. Report the gateway round trip (timed inside GatewayJevBackend) instead.
const roundTrips = backend.usage.map((u) => u.latencyMs);
run.metrics.latencyP50Ms = percentile(roundTrips, 50);
run.metrics.latencyP95Ms = percentile(roundTrips, 95);

const tokens = backend.usage.map((u) => u.inputTokens).filter((x): x is number => x != null);
const md = [
  `### Benchmark E — Routing with ${openai ? 'OpenAI Decisions' : 'real Jev'} (${backend.name}, ${CASES.length} cases, ${TREES.length} trees)`,
  '',
  routingTable([run], 0),
  '',
  `Calls: ${backend.usage.length}. Fallbacks (call failed, StayRouter decided): ${run.metrics.fallbacks}. ` +
    (tokens.length ? `Mean input tokens per call (reported by the API): ${fmtInt(mean(tokens))}. ` : '') +
    'Latency is the API round trip from the benchmark machine, excluding the throttle wait between calls.',
].join('\n');

writeResult(openai ? 'routing-openai-decisions' : 'routing-jev', { run }, md);
console.log(md);
printFailures(run);
