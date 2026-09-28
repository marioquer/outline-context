import type { Embedder, TokenCounter } from './types.ts';

/**
 * Small text utilities shared by the reference router, the candidate builder
 * and the benchmarks. Nothing here calls a network.
 */

const STOPWORDS = new Set(
  (
    'a an and are as at be but by can could did do does for from had has have how i if in into is it its ' +
    "let let's lets me my of on or our should so that the their them then there these this those to up us " +
    'was we were what when where which who why will with would you your about just also more some any ' +
    'go going get got want need think back again now ok okay yes no not than too very really thing things ' +
    'one two much many like make sure maybe still well out over only here'
  ).split(/\s+/),
);

/** Crude suffix stripping. Good enough to merge "benchmarks"/"benchmarking". */
export function stem(word: string): string {
  if (word.length <= 4 || /^\$?\d/.test(word)) return word;
  let out = word;
  for (const suffix of ['ations', 'ation', 'ings', 'ing', 'ies', 'ied', 'ers', 'er', 'ed', 'es', 'ly', 's']) {
    if (out.endsWith(suffix) && out.length - suffix.length >= 3) {
      const base = out.slice(0, -suffix.length);
      out = suffix === 'ies' || suffix === 'ied' ? `${base}y` : base;
      break;
    }
  }
  // "price" / "pricing" → "pric", "cache" / "caching" → "cach".
  if (out.length > 4 && out.endsWith('e')) out = out.slice(0, -1);
  return out;
}

/** Lowercased content-word stems. Keeps numbers and `$15`-style tokens. */
export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/\$?[\p{Letter}\p{Number}][\p{Letter}\p{Number}'.-]*/gu) ?? [];
  const out: string[] = [];
  for (const raw of words) {
    const w = raw.replace(/['.-]+$/g, '').replace(/'s$/, '');
    if (!w || STOPWORDS.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * Deterministic feature-hashing embedder over unigrams, bigrams and character
 * trigrams. It needs no model or network, so tests, benchmarks and the demo
 * are reproducible. Swap in a real embedding model through `Embedder`.
 */
export class HashingEmbedder implements Embedder {
  constructor(private readonly dims = 512) {}

  embedOne(text: string): number[] {
    const v = new Array<number>(this.dims).fill(0);
    const toks = tokenize(text);
    const add = (feature: string, weight: number) => {
      const h = fnv1a(feature);
      const sign = h & 1 ? 1 : -1;
      const idx = (h >>> 1) % this.dims;
      v[idx] = (v[idx] ?? 0) + sign * weight;
    };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]!;
      add(`u:${t}`, 1);
      if (i + 1 < toks.length) add(`b:${t}_${toks[i + 1]}`, 0.6);
      if (t.length >= 5) {
        for (let j = 0; j + 3 <= t.length; j++) add(`c:${t.slice(j, j + 3)}`, 0.15);
      }
    }
    return v;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }
}

/**
 * Token estimate: ~4 characters per token for Latin text, ~1 token per CJK
 * character. Label anything computed with this as an estimate. Use a
 * provider token-counting endpoint when exact numbers matter.
 */
export class EstimatingTokenCounter implements TokenCounter {
  count(text: string): number {
    if (!text) return 0;
    const cjk = (text.match(/[぀-ヿ㐀-鿿가-힯]/g) ?? []).length;
    const rest = text.length - cjk;
    return Math.ceil(rest / 4) + cjk;
  }
}

export const defaultTokenCounter: TokenCounter = new EstimatingTokenCounter();

/** First sentence of a string, trimmed to `max` chars. */
export function firstSentence(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.+?[.!?])(\s|$)/);
  const s = m?.[1] ?? clean;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
