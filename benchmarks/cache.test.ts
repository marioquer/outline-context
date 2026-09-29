import { describe, expect, it } from 'vitest';
import { CacheSimulator, OPUS_5 } from './strategies/cache.ts';

const big = (tag: string) => `${tag} ${'lorem ipsum dolor sit amet '.repeat(120)}`; // ~800 tokens

describe('CacheSimulator', () => {
  it('reads the longest previously written block prefix', () => {
    const sim = new CacheSimulator(OPUS_5);
    const first = sim.run({ blocks: [big('sys'), big('a')], stableBlocks: 1 });
    expect(first.cachedRead).toBe(0);
    expect(first.written).toBe(first.total);

    const second = sim.run({ blocks: [big('sys'), big('a'), big('b')], stableBlocks: 1 });
    expect(second.cachedRead).toBe(first.total);

    // A different topic shares only the system block.
    const third = sim.run({ blocks: [big('sys'), big('z')], stableBlocks: 1 });
    expect(third.cachedRead).toBeGreaterThan(0);
    expect(third.cachedRead).toBeLessThan(first.total);
  });

  it('never caches below the minimum length', () => {
    const sim = new CacheSimulator(OPUS_5);
    sim.run({ blocks: ['short'], stableBlocks: 1 });
    const r = sim.run({ blocks: ['short'], stableBlocks: 1 });
    expect(r.cachedRead).toBe(0);
    expect(r.effectiveUnits).toBe(r.total);
  });
});
