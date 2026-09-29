import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JevPacer, atWordBoundary } from './typing.ts';

describe('JevPacer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(minIntervalMs = 2000, latency = 500) {
    const sent: string[] = [];
    const pacer = new JevPacer({
      minIntervalMs,
      now: () => Date.now(),
      call: async (text) => {
        sent.push(text);
        await new Promise((r) => setTimeout(r, latency));
      },
    });
    return { pacer, sent };
  }

  it('calls at once, then only with the latest text after the cool-down', async () => {
    const { pacer, sent } = setup();
    pacer.request('Back');
    pacer.request('Back to');
    pacer.request('Back to pricing');
    expect(sent).toEqual(['Back']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toEqual(['Back', 'Back to pricing']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toHaveLength(2); // nothing new to send
  });

  it('never has two calls in flight', async () => {
    const { pacer, sent } = setup(0, 800);
    pacer.request('a b');
    await vi.advanceTimersByTimeAsync(100);
    pacer.request('a b c');
    expect(sent).toEqual(['a b']);
    await vi.advanceTimersByTimeAsync(800);
    expect(sent).toEqual(['a b', 'a b c']);
  });

  it('stays under the rate limit during a long burst of typing', async () => {
    const { pacer, sent } = setup(2100, 500);
    let text = '';
    for (let i = 0; i < 120; i++) {
      text += 'word ';
      pacer.request(text.trim());
      await vi.advanceTimersByTimeAsync(250); // four words a second for 30 s
    }
    await vi.advanceTimersByTimeAsync(3000);
    expect(sent.length).toBeLessThanOrEqual(Math.ceil(33_000 / 2100));
    expect(sent.at(-1)).toBe(text.trim()); // the final draft is always evaluated
    expect(pacer.callsInLastMinute()).toBe(sent.length);
  });

  it('reset drops the pending draft', async () => {
    const { pacer, sent } = setup();
    pacer.request('one');
    pacer.request('one two');
    pacer.reset();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual(['one']);
  });
});

describe('atWordBoundary', () => {
  it('detects completed words', () => {
    expect(atWordBoundary('Back to ')).toBe(true);
    expect(atWordBoundary('Back to pricing,')).toBe(true);
    expect(atWordBoundary('Back to pric')).toBe(false);
  });
});
