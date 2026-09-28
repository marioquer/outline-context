import { describe, expect, it } from 'vitest';
import { FORK_CANDIDATE_ID, StayRouter, createContextTree } from '@context-tree/core';
import { HttpJevBackend, JevRouter, type JevBackend } from '@context-tree/jev';

function project(router: JevRouter) {
  const ct = createContextTree({ router, root: { title: 'Outline AI', summary: 'Structured chat product and its OSS router.' } });
  const product = ct.createNode({ title: 'Product', id: 'product', description: 'product strategy plans customers' });
  ct.createNode({ title: 'Pricing', id: 'pricing', parentId: product.id, description: 'price tiers plans Pro Free monthly cost subscription' });
  ct.createNode({ title: 'Positioning', id: 'positioning', parentId: product.id, description: 'messaging audience competitors tagline' });
  const oss = ct.createNode({ title: 'OSS', id: 'oss', description: 'open source repository' });
  ct.createNode({ title: 'Architecture', id: 'arch', parentId: oss.id, description: 'Jev router candidate builder embeddings retrieval core package API' });
  ct.createNode({ title: 'Benchmark', id: 'bench', parentId: oss.id, description: 'benchmark harness datasets measure accuracy tokens latency' });
  ct.createNode({ title: 'Launch', id: 'launch', description: 'launch plan X Twitter video GitHub stars announcement' });
  return ct;
}

describe('JevRouter + LocalJevBackend', () => {
  it('runs the A → B → C → A demo sequence', async () => {
    const ct = project(new JevRouter());
    const r1 = await ct.add({ content: "Let's talk about pricing for the product." });
    expect(r1.activeNodeId).toBe('pricing');
    const r2 = await ct.add({ content: 'For the OSS router, should candidate retrieval use embeddings?' });
    expect(r2.decision?.action).toBe('switch');
    expect(r2.activeNodeId).toBe('arch');
    const r3 = await ct.add({ content: 'How should we launch this on X?' });
    expect(r3.activeNodeId).toBe('launch');
    const r4 = await ct.add({ content: 'Back to pricing — should Pro be $15 or $20?' });
    expect(r4.decision?.action).toBe('switch');
    expect(r4.activeNodeId).toBe('pricing');
    expect(r4.decision?.source).toBe('jev:local');
    expect(r4.decision?.latencyMs).toBeGreaterThanOrEqual(0);
    const total = r4.decision!.candidateScores!.reduce((a, s) => a + s.score, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('stays on a same-topic follow-up', async () => {
    const ct = project(new JevRouter());
    ct.activate('pricing');
    const r = await ct.add({ content: 'Should Pro cost $15 or $20?' });
    expect(r.decision?.action).toBe('stay');
  });

  it('forks a durable sub-context under the benchmark node', async () => {
    const ct = project(new JevRouter());
    ct.activate('bench');
    const r = await ct.add({ content: 'We should specifically test prompt cache behavior during frequent topic switching.' });
    expect(r.decision?.action).toBe('fork');
    expect(r.createdNode?.parentId).toBe('bench');
  });

  it('falls back when the backend times out', async () => {
    const slow: JevBackend = {
      name: 'slow',
      route: (_req, { signal } = {}) =>
        new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    };
    const ct = project(new JevRouter({ backend: slow, timeoutMs: 20, fallback: new StayRouter() }));
    ct.activate('launch');
    const r = await ct.add({ content: 'Back to pricing please' });
    expect(r.activeNodeId).toBe('launch');
    expect(r.decision?.fallbackReason).toMatch(/20ms/);
    expect(r.decision?.source).toBe('jev:slow→fallback:stay');
  });

  it('speaks the HTTP protocol and accepts probabilities', async () => {
    let seen: unknown;
    const fetchStub = (async (_url: string, init: RequestInit) => {
      seen = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ scores: [{ id: 'launch', p: 0.9 }, { id: 'pricing', p: 0.05 }], fork: { p: 0.05 } }));
    }) as unknown as typeof fetch;
    const router = new JevRouter({ backend: new HttpJevBackend({ url: 'https://jev.test/route', fetch: fetchStub }) });
    const ct = project(router);
    ct.activate('pricing');
    const r = await ct.add({ content: 'ship it' });
    expect(seen).toMatchObject({ version: 'jev.route.v0', message: 'ship it', activeNodeId: 'pricing' });
    expect(r.decision).toMatchObject({ action: 'switch', targetNodeId: 'launch', source: 'jev:http' });
    expect(r.decision?.candidateScores?.find((s) => s.nodeId === FORK_CANDIDATE_ID)?.score).toBeCloseTo(0.05);
  });

  it('falls back on malformed responses', async () => {
    const bad: JevBackend = { name: 'bad', route: async () => ({ scores: [{ id: 'nope', logit: 3 }] }) };
    const ct = project(new JevRouter({ backend: bad, fallback: new StayRouter() }));
    ct.activate('arch');
    const r = await ct.add({ content: 'hello' });
    expect(r.activeNodeId).toBe('arch');
    expect(r.decision?.fallbackReason).toMatch(/no scores/);
  });
});
