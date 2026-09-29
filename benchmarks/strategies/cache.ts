/**
 * Prompt-cache simulator following Anthropic's documented prompt-caching
 * rules: exact prefix match on whole blocks, cache entries written at
 * breakpoints (end of the stable system prefix + automatic caching at the
 * last block), a model-dependent minimum cacheable length, reads billed at
 * 0.1× and 5-minute writes at 1.25× base input price. All requests are
 * assumed to land within the cache TTL.
 *
 * This is a simulation of cache economics, not a measurement. The opt-in
 * LLM runner reports real `cache_read_input_tokens` instead.
 */
import { defaultTokenCounter } from '@context-tree/core';
import type { Request } from './index.ts';

export interface CachePricing {
  model: string;
  inputPerMTok: number;
  readMultiplier: number;
  writeMultiplier: number;
  minCacheableTokens: number;
}

/** Claude Opus 5 list pricing and cache rules (from the Claude API docs, June 2026). */
export const OPUS_5: CachePricing = {
  model: 'claude-opus-5',
  inputPerMTok: 5,
  readMultiplier: 0.1,
  writeMultiplier: 1.25,
  minCacheableTokens: 512,
};

export interface CacheTurn {
  total: number;
  cachedRead: number;
  written: number;
  uncached: number;
  /** Cost in "uncached input token" units. */
  effectiveUnits: number;
}

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class CacheSimulator {
  /** prefix key → token length of that prefix */
  private entries = new Map<string, number>();
  constructor(private readonly pricing: CachePricing = OPUS_5) {}

  run(req: Request): CacheTurn {
    const toks = req.blocks.map((b) => defaultTokenCounter.count(b));
    const keys: string[] = [];
    const cum: number[] = [];
    let h = '';
    let c = 0;
    for (let i = 0; i < req.blocks.length; i++) {
      h = `${h}|${hashStr(req.blocks[i]!).toString(36)}:${req.blocks[i]!.length}`;
      c += toks[i]!;
      keys.push(h);
      cum.push(c);
    }
    const total = c;
    const min = this.pricing.minCacheableTokens;

    // Longest existing entry that is a prefix of this request.
    let cachedRead = 0;
    for (let i = keys.length - 1; i >= 0; i--) {
      const len = this.entries.get(keys[i]!);
      if (len != null && len >= min) {
        cachedRead = len;
        break;
      }
    }

    // Write entries at the breakpoints: end of stable prefix, and last block.
    let written = 0;
    const breakpoints = [req.stableBlocks - 1, keys.length - 1].filter((i) => i >= 0);
    for (const i of breakpoints) {
      if (cum[i]! >= min && !this.entries.has(keys[i]!)) this.entries.set(keys[i]!, cum[i]!);
    }
    if (total >= min) written = total - cachedRead;
    const uncached = total - cachedRead - written;
    const effectiveUnits =
      cachedRead * this.pricing.readMultiplier + written * this.pricing.writeMultiplier + uncached;
    return { total, cachedRead, written, uncached, effectiveUnits };
  }
}

export function dollars(units: number, pricing: CachePricing = OPUS_5): number {
  return (units / 1_000_000) * pricing.inputPerMTok;
}
