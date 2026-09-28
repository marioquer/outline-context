import {
  DEFAULT_MAX_DEPTH,
  MockRouter,
  decide,
  depthOf,
  getNode,
  isAncestor,
  now,
  pathTitles,
  softmax,
  type ContextNode,
  type ContextTree,
  type DecisionPolicy,
  type RouteDecision,
  type RouteInput,
  type Router,
} from '@context-tree/core';
import { LocalJevBackend } from './local.ts';
import type { JevBackend, JevCandidate, JevRelation, JevRequest, JevResponse } from './protocol.ts';

export interface JevRouterOptions {
  /** Default: the in-process LocalJevBackend. */
  backend?: JevBackend;
  /** Abort the backend call after this long and fall back. Default 1500ms. */
  timeoutMs?: number;
  /** Used on timeout, network error or malformed response. Default: MockRouter (lexical). */
  fallback?: Router;
  policy?: DecisionPolicy;
  maxDepth?: number;
  /** User turns per candidate sent to the backend. Default 3. */
  recentTurns?: number;
}

export class JevTimeoutError extends Error {
  constructor(ms: number) {
    super(`Jev did not answer within ${ms}ms`);
    this.name = 'JevTimeoutError';
  }
}

/**
 * Adapts Context Tree candidates to a Jev backend and turns its scores into
 * a STAY / SWITCH / FORK decision with exposed probabilities and latency.
 */
export class JevRouter implements Router {
  readonly backend: JevBackend;
  private readonly timeoutMs: number;
  private readonly fallback: Router;
  private readonly policy: DecisionPolicy | undefined;
  private readonly maxDepth: number;
  private readonly recentTurns: number;

  constructor(opts: JevRouterOptions = {}) {
    this.backend = opts.backend ?? new LocalJevBackend();
    this.timeoutMs = opts.timeoutMs ?? 1500;
    this.fallback = opts.fallback ?? new MockRouter();
    this.policy = opts.policy;
    this.maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.recentTurns = opts.recentTurns ?? 3;
  }

  toRequest({ message, tree, candidates }: RouteInput): JevRequest {
    const active = tree.activeNodeId;
    const recency = [...candidates]
      .filter((c) => c.lastActiveAt > 0)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .map((c) => c.id);
    const jc: JevCandidate[] = candidates.map((c) => {
      const rank = recency.indexOf(c.id);
      const described = typeof c.metadata?.description === 'string' ? c.metadata.description : '';
      return {
        id: c.id,
        title: c.title,
        path: pathTitles(tree, c.id),
        depth: depthOf(tree, c.id),
        relation: relationOf(tree, active, c),
        summary: [described, c.checkpoint?.summary ?? ''].filter(Boolean).join('\n'),
        recent: c.recentMessages
          .filter((m) => m.role === 'user')
          .slice(-this.recentTurns)
          .map((m) => m.content),
        ...(rank >= 0 ? { recencyRank: rank } : {}),
      };
    });
    return {
      version: 'jev.route.v0',
      message: message.content,
      activeNodeId: active,
      activePath: active ? pathTitles(tree, active) : [],
      candidates: jc,
      allowFork: jc.some((c) => c.depth < this.maxDepth) || jc.length === 0,
      maxDepth: this.maxDepth,
    };
  }

  async route(input: RouteInput): Promise<RouteDecision> {
    const t0 = now();
    const request = this.toRequest(input);
    try {
      const response = await this.callWithTimeout(request, input.signal);
      const decision = this.toDecision(input.tree, request, response);
      return { ...decision, latencyMs: now() - t0, source: `jev:${this.backend.name}` };
    } catch (err) {
      if (input.signal?.aborted) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      const fb = await this.fallback.route(input);
      return {
        ...fb,
        latencyMs: now() - t0,
        source: `jev:${this.backend.name}→fallback:${fb.source ?? 'router'}`,
        fallbackReason: reason,
      };
    }
  }

  toDecision(tree: ContextTree, request: JevRequest, response: JevResponse): RouteDecision {
    const known = new Set(request.candidates.map((c) => c.id));
    const scores = response.scores.filter((s) => known.has(s.id));
    if (scores.length === 0 && request.candidates.length > 0) {
      throw new Error('Jev response contained no scores for known candidates');
    }

    const hasLogits = scores.every((s) => typeof s.logit === 'number');
    let probs: number[];
    let forkProb: number;
    if (hasLogits) {
      const forkLogit = request.allowFork ? (response.fork?.logit ?? -Infinity) : -Infinity;
      const all = softmax([...scores.map((s) => s.logit!), forkLogit]);
      probs = all.slice(0, -1);
      forkProb = all[all.length - 1] ?? 0;
    } else {
      const raw = scores.map((s) => Math.max(0, s.p ?? 0));
      const f = request.allowFork ? Math.max(0, response.fork?.p ?? 0) : 0;
      const total = raw.reduce((a, b) => a + b, 0) + f;
      if (!(total > 0)) throw new Error('Jev response probabilities sum to zero');
      probs = raw.map((p) => p / total);
      forkProb = f / total;
    }

    const parent = response.fork?.parentId && known.has(response.fork.parentId) ? response.fork.parentId : undefined;
    return decide({
      tree,
      probs: scores.map((s, i) => ({ nodeId: s.id, p: probs[i] ?? 0 })),
      forkProb: Number.isFinite(forkProb) ? forkProb : 0,
      forkParentId: parent,
      ...(this.policy ? { policy: this.policy } : {}),
    });
  }

  private callWithTimeout(request: JevRequest, outer?: AbortSignal): Promise<JevResponse> {
    const controller = new AbortController();
    const onAbort = () => controller.abort(outer?.reason);
    outer?.addEventListener('abort', onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new JevTimeoutError(this.timeoutMs));
        controller.abort();
      }, this.timeoutMs);
    });
    return Promise.race([this.backend.route(request, { signal: controller.signal }), timeout]).finally(() => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    });
  }
}

function relationOf(tree: ContextTree, activeId: string | null, node: ContextNode): JevRelation {
  if (!activeId) return 'other';
  if (node.id === activeId) return 'current';
  const active = getNode(tree, activeId);
  if (active.parentId === node.id) return 'parent';
  if (node.parentId === activeId) return 'child';
  if (node.parentId && node.parentId === active.parentId) return 'sibling';
  if (isAncestor(tree, node.id, activeId)) return 'ancestor';
  if (isAncestor(tree, activeId, node.id)) return 'descendant';
  return 'other';
}
