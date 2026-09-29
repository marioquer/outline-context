/**
 * Minimal Context Tree usage. No UI, no model: run it to see routing
 * decisions and the working context a model would receive.
 *
 *   pnpm example
 */
import { createContextTree } from '@context-tree/core';
import { JevRouter } from '@context-tree/jev';

// 1. Create a tree. JevRouter uses the in-process reference backend by
//    default; pass `backend: new HttpJevBackend({ url })` for a hosted model.
const tree = createContextTree({
  router: new JevRouter(),
  root: 'My project',
});

// 2. Optionally seed a few nodes (or start empty and let FORK create them).
const product = tree.createNode({ title: 'Product' });
tree.createNode({ title: 'Pricing', parentId: product.id, description: 'plans, tiers, monthly price' });
tree.createNode({ title: 'Launch', description: 'launch plan, announcement, demo video' });

// 3. Add messages. Every user message is routed: STAY, SWITCH or FORK.
async function say(content: string) {
  const r = await tree.add({ role: 'user', content });
  const d = r.decision!;
  console.log(`\n> ${content}`);
  console.log(`  ${d.action.toUpperCase()} → ${r.activePath.join(' / ')}  (${Math.round(d.confidence * 100)}%, ${d.latencyMs?.toFixed(1)} ms)`);
  console.log(`  working context: ${r.context!.tokens.total} tokens (full history would be ${r.fullHistoryTokens})`);

  // 4. Send r.context.system + r.context.messages to your model, then record its reply.
  await tree.add({ role: 'assistant', content: `(model reply about ${r.activePath.at(-1)})` });
}

await say('What should the Pro plan cost?');
await say('How should we announce the launch?');
await say('We should specifically plan a Product Hunt launch as its own track.');
await say('Back to pricing — monthly or annual first?');

// 5. The last working context contains only the pricing thread.
console.log('\nPrompt for the last turn:\n');
console.log(tree.context().system);
for (const m of tree.context().messages) console.log(`${m.role.toUpperCase()}: ${m.content}`);

// 6. Serialize and restore.
const saved = JSON.stringify(tree.toJSON());
const restored = createContextTree({ router: new JevRouter(), initial: JSON.parse(saved) });
console.log(`\nRestored ${Object.keys(restored.tree.nodes).length} nodes; active: ${restored.path().join(' / ')}`);
