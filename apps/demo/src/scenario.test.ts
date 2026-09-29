import { describe, expect, it } from 'vitest';
import { JevRouter } from '@context-tree/jev';
import { DEMO_STEPS, createDemoSession, stepReply } from './scenario.ts';

describe('demo scenario', () => {
  it('routes every scripted step as intended with the local Jev backend', async () => {
    const s = createDemoSession(new JevRouter());
    const got: string[] = [];
    for (const step of DEMO_STEPS) {
      const r = await s.add({ content: step.message });
      got.push(`${r.decision?.action}:${r.activePath.join('/')}`);
      await s.add({ role: 'assistant', content: stepReply(step, { action: r.decision!.action, path: r.activePath }) });
    }
    expect(got).toEqual([
      'switch:Product/Pricing',
      'switch:OSS/Architecture',
      'switch:Launch',
      'switch:Product/Pricing',
      'switch:OSS/Benchmark',
      'fork:OSS/Benchmark/KV Cache',
    ]);
  });

  it('the return to Pricing restores the earlier pricing turns and nothing else', async () => {
    const s = createDemoSession(new JevRouter());
    let last;
    for (const step of DEMO_STEPS.slice(0, 4)) {
      last = await s.add({ content: step.message });
      await s.add({ role: 'assistant', content: stepReply(step, { action: last.decision!.action, path: last.activePath }) });
    }
    const text = last!.context!.messages.map((m) => m.content).join('\n');
    expect(text).toContain('What should the free tier include?');
    expect(text).toContain("Let's talk about pricing");
    expect(text).not.toContain('embeddings');
    expect(text).not.toContain('launch on X');
    expect(last!.context!.tokens.total).toBeLessThan(last!.fullHistoryTokens!);
  });

  it('the fork step reply follows the actual route', () => {
    const fork = DEMO_STEPS.at(-1)!;
    expect(stepReply(fork, { action: 'fork', path: ['OSS', 'Benchmark', 'KV Cache'] })).toMatch(/^Opened a new context for this under Benchmark\./);
    expect(stepReply(fork, { action: 'stay', path: ['OSS', 'Benchmark'] })).toMatch(/^Keeping this in OSS \/ Benchmark\./);
  });
});
