import { describe, expect, it } from 'vitest';
import {
  DefaultCandidateBuilder,
  FORK_CANDIDATE_ID,
  MockRouter,
  StayRouter,
  addNode,
  buildWorkingContext,
  clampForkParent,
  createContextTree,
  decide,
  depthOf,
  emptyTree,
  setActive,
  walk,
  type Router,
} from '@context-tree/core';

function seeded(router: Router = new MockRouter()) {
  const ct = createContextTree({ router, root: { title: 'Project', summary: 'A demo project.' } });
  const product = ct.createNode({ title: 'Product', id: 'product' });
  ct.createNode({ title: 'Pricing', id: 'pricing', parentId: product.id, description: 'price plans tiers pro free' });
  ct.createNode({ title: 'Positioning', id: 'positioning', parentId: product.id });
  const oss = ct.createNode({ title: 'OSS', id: 'oss' });
  ct.createNode({ title: 'Architecture', id: 'arch', parentId: oss.id, description: 'router embeddings candidates' });
  ct.createNode({ title: 'Benchmark', id: 'bench', parentId: oss.id });
  ct.createNode({ title: 'Launch', id: 'launch' });
  return ct;
}

describe('tree operations', () => {
  it('computes depth and clamps fork parents at max depth', () => {
    let t = emptyTree();
    t = addNode(t, { title: 'root', parentId: null, id: 'r' }).tree;
    t = addNode(t, { title: 'a', parentId: 'r', id: 'a' }).tree;
    t = addNode(t, { title: 'b', parentId: 'a', id: 'b' }).tree;
    t = addNode(t, { title: 'c', parentId: 'b', id: 'c' }).tree;
    expect(depthOf(t, 'c')).toBe(3);
    // A child of c would be depth 4 > 3, so the parent climbs to b.
    expect(clampForkParent(t, 'c', 3)).toBe('b');
    expect(clampForkParent(t, 'a', 3)).toBe('a');
    expect(walk(t).map((e) => e.node.id)).toEqual(['r', 'a', 'b', 'c']);
  });

  it('does not mutate the input tree', () => {
    const t0 = addNode(emptyTree(), { title: 'root', parentId: null, id: 'r' }).tree;
    const t1 = setActive(t0, 'r');
    expect(t0.activeNodeId).toBeNull();
    expect(t1.activeNodeId).toBe('r');
  });
});

describe('decide()', () => {
  const t = setActive(
    addNode(addNode(addNode(emptyTree(), { title: 'r', parentId: null, id: 'r' }).tree, { title: 'a', parentId: 'r', id: 'a' }).tree, {
      title: 'b',
      parentId: 'r',
      id: 'b',
    }).tree,
    'a',
  );

  it('stays when the current node is best', () => {
    const d = decide({ tree: t, probs: [{ nodeId: 'a', p: 0.7 }, { nodeId: 'b', p: 0.2 }], forkProb: 0.1 });
    expect(d).toMatchObject({ action: 'stay', targetNodeId: 'a' });
  });

  it('switches when another node clearly wins', () => {
    const d = decide({ tree: t, probs: [{ nodeId: 'a', p: 0.1 }, { nodeId: 'b', p: 0.85 }], forkProb: 0.05 });
    expect(d).toMatchObject({ action: 'switch', targetNodeId: 'b', confidence: 0.85 });
    expect(d.candidateScores?.[0]).toEqual({ nodeId: 'b', score: 0.85 });
    expect(d.candidateScores?.some((s) => s.nodeId === FORK_CANDIDATE_ID)).toBe(true);
  });

  it('applies hysteresis between near-equal nodes', () => {
    const d = decide({ tree: t, probs: [{ nodeId: 'a', p: 0.44 }, { nodeId: 'b', p: 0.48 }], forkProb: 0.08 });
    expect(d.action).toBe('stay');
  });

  it('forks when the fork option wins', () => {
    const d = decide({ tree: t, probs: [{ nodeId: 'a', p: 0.2 }, { nodeId: 'b', p: 0.1 }], forkProb: 0.7, forkParentId: 'a' });
    expect(d).toMatchObject({ action: 'fork', parentNodeId: 'a' });
  });
});

describe('ContextTreeSession', () => {
  it('routes STAY / SWITCH / FORK and keeps the active pointer', async () => {
    const ct = seeded(
      new MockRouter({
        rules: [
          { match: 'pricing', decision: { action: 'switch', targetNodeId: 'pricing' } },
          { match: 'embeddings', decision: { action: 'switch', targetNodeId: 'arch' } },
          { match: 'cache', decision: { action: 'fork', parentNodeId: 'bench' } },
        ],
      }),
    );

    const r1 = await ct.add({ content: "Let's talk about pricing." });
    expect(r1.decision?.action).toBe('switch');
    expect(r1.activePath).toEqual(['Product', 'Pricing']);

    await ct.add({ role: 'assistant', content: 'Sure — two tiers.' });
    expect(ct.activeNode.recentMessages).toHaveLength(2);

    const r2 = await ct.add({ content: 'Should candidate retrieval use embeddings?' });
    expect(r2.activeNodeId).toBe('arch');

    const r3 = await ct.add({ content: 'Test prompt cache behaviour specifically.' });
    expect(r3.decision?.action).toBe('fork');
    expect(r3.createdNode?.parentId).toBe('bench');
    expect(ct.activeNodeId).toBe(r3.createdNode?.id);
    expect(ct.path()).toEqual(['OSS', 'Benchmark', 'Prompt Cache Behaviour']);

    const r4 = await ct.add({ content: 'Back to pricing — $15 or $20?' });
    expect(r4.activeNodeId).toBe('pricing');
    // Returning restores the earlier delta, and the context holds nothing from other branches.
    expect(r4.context?.recentMessages.map((m) => m.content)).toEqual(["Let's talk about pricing.", 'Sure — two tiers.']);
    expect(r4.context?.system).not.toContain('embeddings');
  });

  it('clamps FORK parents to maxDepth', async () => {
    const ct = createContextTree({
      router: new MockRouter({ rules: [{ match: 'fork', decision: { action: 'fork' } }] }),
      maxDepth: 2,
    });
    const a = ct.createNode({ title: 'A' });
    const b = ct.createNode({ title: 'B', parentId: a.id });
    ct.activate(b.id);
    const r = await ct.add({ content: 'fork a new thing please' });
    expect(r.createdNode?.parentId).toBe(a.id);
    expect(depthOf(ct.tree, r.activeNodeId)).toBe(2);
  });

  it('falls back to STAY when the router throws', async () => {
    const broken: Router = { route: async () => { throw new Error('boom'); } };
    const ct = seeded(broken);
    ct.activate('pricing');
    const r = await ct.add({ content: 'anything' });
    expect(r.decision).toMatchObject({ action: 'stay', targetNodeId: 'pricing', fallbackReason: 'boom' });
    expect(r.decision?.source).toBe('fallback:stay');
  });

  it('rejects decisions that point at unknown nodes', async () => {
    const ct = seeded(new MockRouter({ rules: [{ match: '', decision: { action: 'switch', targetNodeId: 'ghost' } }] }));
    ct.activate('launch');
    const r = await ct.add({ content: 'hello' });
    expect(r.activeNodeId).toBe('launch');
    expect(r.decision?.fallbackReason).toMatch(/ghost/);
  });

  it('preview never commits', async () => {
    const ct = seeded(new MockRouter({ rules: [{ match: 'launch', decision: { action: 'switch', targetNodeId: 'launch' } }] }));
    ct.activate('pricing');
    const before = JSON.stringify(ct.toJSON());
    const p = await ct.preview('How do we launch?');
    expect(p.predictedNodeId).toBe('launch');
    expect(JSON.stringify(ct.toJSON())).toBe(before);
    expect(ct.activeNodeId).toBe('pricing');
  });

  it('serializes and restores', async () => {
    const ct = seeded(new MockRouter({ rules: [{ match: 'x', decision: { action: 'switch', targetNodeId: 'launch' } }] }));
    await ct.add({ content: 'x marks the spot' });
    const json = JSON.parse(JSON.stringify(ct.toJSON()));
    const restored = createContextTree({ router: new StayRouter(), initial: json });
    expect(restored.activeNodeId).toBe('launch');
    expect(restored.transcript).toHaveLength(1);
    expect(restored.tree).toEqual(ct.tree);
  });

  it('folds old turns into a versioned checkpoint instead of rewriting every turn', async () => {
    const ct = createContextTree({ router: new StayRouter(), checkpoint: { every: 6, keepRecent: 2 } });
    for (let i = 0; i < 3; i++) {
      await ct.add({ content: `Question ${i}. Details.` });
      await ct.add({ role: 'assistant', content: `Answer ${i}. More.` });
    }
    expect(ct.activeNode.checkpoint).toBeUndefined();
    await ct.add({ content: 'Question 3. Details.' });
    const cp = ct.activeNode.checkpoint!;
    expect(cp.version).toBe(1);
    expect(cp.foldedCount).toBe(5);
    expect(ct.activeNode.recentMessages).toHaveLength(2);
    expect(cp.summary).toContain('Question 0.');
    // Adding one more turn does not touch the checkpoint.
    await ct.add({ role: 'assistant', content: 'Answer 3.' });
    expect(ct.activeNode.checkpoint).toBe(cp);
  });
});

describe('working context', () => {
  it('orders stable prefix before delta and excludes other branches', async () => {
    const ct = seeded(new StayRouter());
    ct.activate('arch');
    await ct.add({ content: 'Use embeddings for candidates?' });
    ct.activate('pricing');
    await ct.add({ content: 'Pro at $20.' });
    const ctx = buildWorkingContext(ct.tree, 'pricing', { message: { id: 'q', role: 'user', content: 'And Team?', createdAt: 0 } });
    expect(ctx.segments.map((s) => s.kind)).toEqual(['system', 'root', 'path', 'delta', 'current']);
    expect(ctx.path).toEqual(['Project', 'Product', 'Pricing']);
    expect(ctx.messages.map((m) => m.content)).toEqual(['Pro at $20.', 'And Team?']);
    expect(ctx.tokens.total).toBe(ctx.tokens.stablePrefix + ctx.tokens.delta + ctx.tokens.current);
    expect(JSON.stringify(ctx)).not.toContain('embeddings');
  });
});

describe('DefaultCandidateBuilder', () => {
  it('returns every node for small trees and caps large ones', async () => {
    const ct = seeded(new StayRouter());
    const msg = { id: 'm', role: 'user' as const, content: 'pricing', createdAt: 0 };
    const all = await new DefaultCandidateBuilder().build({ message: msg, tree: ct.tree });
    expect(all).toHaveLength(8);

    for (let i = 0; i < 30; i++) ct.createNode({ title: `Filler ${i}`, parentId: 'launch' });
    ct.activate('pricing');
    const builder = new DefaultCandidateBuilder({ maxCandidates: 10 });
    const some = await builder.build({ message: { ...msg, content: 'Architecture of the router' }, tree: ct.tree });
    expect(some).toHaveLength(10);
    const ids = some.map((n) => n.id);
    expect(ids[0]).toBe('pricing'); // current first
    expect(ids).toContain('product'); // parent
    expect(ids).toContain('positioning'); // sibling
    expect(ids).toContain('arch'); // semantic hit
  });
});

describe('preview reuse', () => {
  it('reuses the preview decision on send when nothing changed', async () => {
    let calls = 0;
    const router: Router = {
      route: async () => {
        calls += 1;
        return { action: 'switch', targetNodeId: 'launch', confidence: 0.9, latencyMs: 42 };
      },
    };
    const ct = seeded(router);
    ct.activate('pricing');
    await ct.preview('How do we launch?');
    const r = await ct.add({ content: 'How do we launch?' });
    expect(calls).toBe(1);
    expect(r.decision).toMatchObject({ action: 'switch', reusedPreview: true, latencyMs: 42 });
    expect(r.activeNodeId).toBe('launch');
  });

  it('routes again when the text or the tree changed', async () => {
    let calls = 0;
    const router: Router = { route: async ({ tree }) => ((calls += 1), { action: 'stay', targetNodeId: tree.activeNodeId!, confidence: 1 }) };
    const ct = seeded(router);
    ct.activate('pricing');
    await ct.preview('draft one');
    await ct.add({ content: 'draft two' });
    expect(calls).toBe(2);
    await ct.preview('same text');
    ct.activate('launch');
    const r = await ct.add({ content: 'same text' });
    expect(calls).toBe(4); // two previews + two sends, none reused
    expect(r.decision?.reusedPreview).toBeUndefined();
  });
});
