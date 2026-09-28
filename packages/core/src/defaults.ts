import { firstSentence } from './text.ts';
import type { ContextCheckpoint, ContextMessage, ContextNode, Summarizer, Titler } from './types.ts';

const TITLE_SKIP = new Set(
  (
    'a an and are as at be but by can could did do does for from had has have how i if in into is it its ' +
    "let let's lets me my of on or our should so that the their them then there these this those to up us " +
    'was we were what when where which who why will with would you your about just also now ok okay ' +
    'specifically test testing look looking talk talking discuss discussing consider considering think ' +
    'start starting new topic separately maybe need want wanna gonna go going back again during whether ' +
    'figure out deep dive into open question track'
  ).split(/\s+/),
);

/**
 * Deterministic title for a FORKed node: the first few content words of the
 * message, in Title Case. Replace with an LLM titler in production.
 */
export class HeuristicTitler implements Titler {
  constructor(private readonly maxWords = 3) {}

  async title({ message }: { message: ContextMessage }): Promise<string> {
    const words = message.content.match(/[\p{Letter}\p{Number}][\p{Letter}\p{Number}'-]*/gu) ?? [];
    const picked: string[] = [];
    for (const w of words) {
      if (TITLE_SKIP.has(w.toLowerCase())) continue;
      picked.push(w);
      if (picked.length >= this.maxWords) break;
    }
    if (picked.length === 0) return 'New topic';
    return picked.map((w) => (w === w.toUpperCase() ? w : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join(' ');
  }
}

/** Looks the message up in a table first, then falls back. Used by the demo script. */
export class TableTitler implements Titler {
  constructor(
    private readonly table: Array<{ match: string | RegExp; title: string }>,
    private readonly fallback: Titler = new HeuristicTitler(),
  ) {}

  async title(input: Parameters<Titler['title']>[0]): Promise<string> {
    const text = input.message.content;
    for (const row of this.table) {
      const hit = typeof row.match === 'string' ? text.toLowerCase().includes(row.match.toLowerCase()) : row.match.test(text);
      if (hit) return row.title;
    }
    return this.fallback.title(input);
  }
}

/**
 * Deterministic checkpoint builder. It keeps the previous checkpoint lines
 * and appends one line per folded user turn (plus the first sentence of the
 * reply), then keeps the newest `maxLines`. It never calls a model, which
 * keeps benchmarks reproducible. Plug in an LLM summarizer for production.
 */
export class ExtractiveSummarizer implements Summarizer {
  constructor(private readonly maxLines = 16) {}

  async summarize({
    previous,
    messages,
  }: {
    node: ContextNode;
    previous?: ContextCheckpoint;
    messages: ContextMessage[];
  }): Promise<string> {
    const lines = previous?.summary ? previous.summary.split('\n').filter(Boolean) : [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]!;
      if (m.role !== 'user') continue;
      const reply = messages[i + 1]?.role === 'assistant' ? messages[i + 1]!.content : '';
      const line = reply
        ? `- ${firstSentence(m.content, 140)} → ${firstSentence(reply, 160)}`
        : `- ${firstSentence(m.content, 200)}`;
      lines.push(line);
    }
    return lines.slice(-this.maxLines).join('\n');
  }
}
