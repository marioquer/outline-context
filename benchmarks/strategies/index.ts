/**
 * Context strategies compared by the benchmarks. Every strategy sees the same
 * turns and produces a request as an ordered list of blocks (system blocks
 * first, then one block per message). Only the context strategy differs;
 * the system prompt and questions are identical.
 */
import {
  HashingEmbedder,
  StayRouter,
  cosine,
  createContextTree,
  defaultTokenCounter,
  type ContextTreeSession,
  type Router,
} from '@context-tree/core';
import { JevRouter } from '@context-tree/jev';

export const SYSTEM = 'You are a helpful assistant for a software team. Answer from the conversation context. If the context does not contain the answer, say you do not know.';

export interface Request {
  blocks: string[];
  /** Number of leading blocks that form the stable (cacheable) prefix. */
  stableBlocks: number;
}

export interface Strategy {
  readonly name: string;
  /** Build the request for a user message and commit the message. `topic` is ground truth, used only by the oracle. */
  ask(content: string, topic?: string): Promise<Request>;
  answer(content: string): Promise<void>;
}

type Msg = { role: 'user' | 'assistant'; content: string };
const fmt = (m: Msg) => `${m.role.toUpperCase()}: ${m.content}`;

export class FullHistory implements Strategy {
  readonly name = 'Full history';
  private history: Msg[] = [];
  async ask(content: string): Promise<Request> {
    const req = { blocks: [SYSTEM, ...this.history.map(fmt), fmt({ role: 'user', content })], stableBlocks: 1 };
    this.history.push({ role: 'user', content });
    return req;
  }
  async answer(content: string) {
    this.history.push({ role: 'assistant', content });
  }
}

export class RecentWindow implements Strategy {
  readonly name: string;
  private history: Msg[] = [];
  constructor(private readonly n = 12) {
    this.name = `Recent window (${n} msgs)`;
  }
  async ask(content: string): Promise<Request> {
    const req = { blocks: [SYSTEM, ...this.history.slice(-this.n).map(fmt), fmt({ role: 'user', content })], stableBlocks: 1 };
    this.history.push({ role: 'user', content });
    return req;
  }
  async answer(content: string) {
    this.history.push({ role: 'assistant', content });
  }
}

/** Top-k past messages by embedding similarity plus the last few messages. */
export class VectorRetrieval implements Strategy {
  readonly name: string;
  private history: Array<Msg & { v: number[] }> = [];
  private readonly embedder = new HashingEmbedder();
  constructor(
    private readonly k = 8,
    private readonly recent = 4,
  ) {
    this.name = `Vector retrieval (top-${k} + last ${recent})`;
  }
  async ask(content: string): Promise<Request> {
    const q = this.embedder.embedOne(content);
    const pool = this.history.slice(0, Math.max(0, this.history.length - this.recent));
    const top = pool
      .map((m, i) => ({ i, s: cosine(q, m.v) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, this.k)
      .sort((a, b) => a.i - b.i)
      .map((x) => pool[x.i]!);
    const tail = this.history.slice(-this.recent);
    const req = {
      blocks: [SYSTEM, ...top.map(fmt), ...tail.map(fmt), fmt({ role: 'user', content })],
      stableBlocks: 1,
    };
    this.history.push({ role: 'user', content, v: q });
    return req;
  }
  async answer(content: string) {
    this.history.push({ role: 'assistant', content, v: this.embedder.embedOne(content) });
  }
}

/**
 * Context Tree. With `oracle`, each message is placed in its ground-truth
 * topic node, which isolates context construction from routing errors.
 * Otherwise Jev routes every message, starting from an empty tree.
 */
export class ContextTreeStrategy implements Strategy {
  readonly name: string;
  readonly session: ContextTreeSession;
  /** Ground-truth topic of each user message, keyed by the node it landed in. */
  readonly placements: Array<{ topic?: string; nodeId: string; action: string }> = [];
  private readonly oracleNodes = new Map<string, string>();

  constructor(private readonly opts: { oracle?: boolean; router?: Router } = {}) {
    this.name = opts.oracle ? 'Context Tree (oracle routing)' : 'Context Tree + Jev';
    this.session = createContextTree({
      router: opts.oracle ? new StayRouter() : (opts.router ?? new JevRouter()),
      system: SYSTEM,
      root: { id: 'root', title: 'Team workspace' },
    });
  }

  async ask(content: string, topic?: string): Promise<Request> {
    if (this.opts.oracle) {
      if (!topic) throw new Error('oracle routing needs a topic');
      let id = this.oracleNodes.get(topic);
      if (!id) {
        id = this.session.createNode({ title: topic }).id;
        this.oracleNodes.set(topic, id);
      }
      this.session.activate(id);
    }
    const r = await this.session.add({ content });
    this.placements.push({ ...(topic ? { topic } : {}), nodeId: r.activeNodeId, action: r.decision!.action });
    const ctx = r.context!;
    const stable = ctx.segments.filter((s) => s.stable).map((s) => s.text);
    const rest = ctx.messages.map((m) => fmt(m));
    return { blocks: [...stable, ...rest], stableBlocks: stable.length };
  }

  async answer(content: string) {
    await this.session.add({ role: 'assistant', content });
  }

  /**
   * Share of user messages that landed in the node "owned" by their true
   * topic (the node where most of that topic's messages went).
   */
  routingPurity(): number {
    const owner = new Map<string, Map<string, number>>();
    for (const p of this.placements) {
      if (!p.topic) continue;
      const m = owner.get(p.topic) ?? new Map<string, number>();
      m.set(p.nodeId, (m.get(p.nodeId) ?? 0) + 1);
      owner.set(p.topic, m);
    }
    const best = new Map([...owner].map(([t, m]) => [t, [...m].sort((a, b) => b[1] - a[1])[0]![0]]));
    // A node owned by two topics counts as correct for only one of them.
    const claimed = new Map<string, string>();
    for (const [t, n] of best) if (!claimed.has(n)) claimed.set(n, t);
    const ok = this.placements.filter((p) => p.topic && claimed.get(p.nodeId) === p.topic).length;
    return ok / Math.max(1, this.placements.filter((p) => p.topic).length);
  }
}

export function makeStrategies(): Strategy[] {
  return [new RecentWindow(12), new FullHistory(), new VectorRetrieval(8, 4), new ContextTreeStrategy(), new ContextTreeStrategy({ oracle: true })];
}

export function tokensOf(req: Request): number {
  return req.blocks.reduce((a, b) => a + defaultTokenCounter.count(b), 0);
}
