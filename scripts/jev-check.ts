/**
 * One live Jev routing call, printed verbatim.
 *
 *   pnpm jev:check
 *
 * Reads AI_GATEWAY_API_KEY from the environment or .env.local / .env.
 */
import './load-env.ts';
import { StayRouter, createContextTree } from '@context-tree/core';
import { JevRouter } from '@context-tree/jev';
import { GatewayJevBackend } from '@context-tree/jev/gateway';

const key = process.env.AI_GATEWAY_API_KEY?.trim();
if (!key) {
  console.error('No AI_GATEWAY_API_KEY in the environment, .env.local or .env.');
  process.exit(1);
}

const backend = new GatewayJevBackend();
console.log(`key    ${key.slice(0, 6)}…${key.slice(-4)}`);
console.log(`model  ${backend.model}\n`);

// StayRouter as the fallback: a failed call keeps its original error in
// decision.fallbackReason, which is printed below as a failure.
const router = new JevRouter({ backend, timeoutMs: 20_000, fallback: new StayRouter() });
const tree = createContextTree({ router, root: 'Outline AI' });
const product = tree.createNode({ title: 'Product' });
const pricing = tree.createNode({ title: 'Pricing', parentId: product.id, description: 'plans, tiers, monthly price' });
tree.createNode({ title: 'Launch', description: 'launch on X, demo video' });
tree.record(pricing.id, { content: 'What should the free tier include?' });
tree.activate(tree.createNode({ title: 'Architecture', description: 'Jev router, candidate builder' }).id);

try {
  const p = await tree.preview('Back to pricing — should Pro be $15 or $20?');
  console.log(`decision ${p.decision.action} → ${p.predictedNodeId ? tree.path(p.predictedNodeId).join(' / ') : `new under ${p.predictedParentId}`}`);
  console.log(`scores   ${JSON.stringify(p.decision.candidateScores?.map((s) => [s.nodeId === '@fork' ? 'FORK' : tree.tree.nodes[s.nodeId]?.title, +s.score.toFixed(3)]))}`);
  console.log(`latency  ${p.decision.latencyMs?.toFixed(0)} ms (gateway round trip ${backend.lastCall?.latencyMs} ms)`);
  console.log(`usage    ${JSON.stringify(backend.lastCall)}`);
  if (p.decision.fallbackReason) {
    console.log(`\nFAILED  ${p.decision.fallbackReason}`);
    process.exitCode = 1;
  } else {
    console.log('\nReal Jev is reachable.');
  }
} catch (err) {
  console.log(`\nFAILED  ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
