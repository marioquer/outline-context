import { nodeProfile } from './candidates.ts';
import { tokenize } from './text.ts';
import {
  FORK_CANDIDATE_ID,
  type CandidateScore,
  type ContextNode,
  type ContextTree,
  type NodeId,
  type RouteDecision,
  type RouteInput,
  type Router,
} from './types.ts';

export interface DecisionPolicy {
  /**
   * Hysteresis. If the current node's probability is within this margin of
   * the best candidate, STAY instead of SWITCH. Prevents flapping between
   * near-equal siblings. Default 0.08.
   */
  stayMargin?: number;
  /** FORK only wins if its probability beats the best node by this much. Default 0. */
  forkMargin?: number;
}

export function softmax(logits: number[], temperature = 1): number[] {
  if (logits.length === 0) return [];
  const scaled = logits.map((l) => l / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Turn per-candidate probabilities (plus a FORK probability and a proposed
 * parent) into a STAY / SWITCH / FORK decision. Shared by every router so the
 * action semantics stay identical across implementations.
 */
export function decide(input: {
  tree: ContextTree;
  probs: Array<{ nodeId: NodeId; p: number }>;
  forkProb: number;
  forkParentId?: NodeId | undefined;
  policy?: DecisionPolicy;
}): RouteDecision {
  const stayMargin = input.policy?.stayMargin ?? 0.08;
  const forkMargin = input.policy?.forkMargin ?? 0;
  const current = input.tree.activeNodeId;
  const sorted = [...input.probs].sort((a, b) => b.p - a.p);
  const best = sorted[0];

  const candidateScores: CandidateScore[] = [
    ...sorted.map((s) => ({ nodeId: s.nodeId, score: s.p })),
    { nodeId: FORK_CANDIDATE_ID, score: input.forkProb },
  ].sort((a, b) => b.score - a.score);

  const forkParent = input.forkParentId ?? best?.nodeId ?? current ?? undefined;
  if (forkParent && (!best || input.forkProb > best.p + forkMargin)) {
    return { action: 'fork', parentNodeId: forkParent, confidence: input.forkProb, candidateScores };
  }
  if (!best) {
    return { action: 'stay', ...(current ? { targetNodeId: current } : {}), confidence: 0, candidateScores };
  }
  if (current) {
    const currentP = input.probs.find((s) => s.nodeId === current)?.p;
    if (best.nodeId === current || (currentP != null && currentP >= best.p - stayMargin)) {
      return { action: 'stay', targetNodeId: current, confidence: currentP ?? best.p, candidateScores };
    }
  }
  return { action: 'switch', targetNodeId: best.nodeId, confidence: best.p, candidateScores };
}

/**
 * Always STAY. The last-resort fallback: when routing fails, the safest
 * thing is to keep the user where they are.
 */
export class StayRouter implements Router {
  async route({ tree }: RouteInput): Promise<RouteDecision> {
    const current = tree.activeNodeId ?? tree.rootIds[0];
    return {
      action: 'stay',
      ...(current ? { targetNodeId: current } : {}),
      confidence: 0,
      latencyMs: 0,
      source: 'stay',
    };
  }
}

export interface MockRule {
  /** Substring (case-insensitive) or RegExp matched against the message. */
  match: string | RegExp;
  decision: Omit<RouteDecision, 'confidence'> & { confidence?: number };
}

export interface MockRouterOptions {
  rules?: MockRule[];
  /** Word-overlap score below which the message is treated as a new topic. Default 0.08. */
  forkThreshold?: number;
  policy?: DecisionPolicy;
}

/**
 * Deterministic router for tests and early UI work. Explicit rules win;
 * otherwise it scores candidates by stemmed word overlap.
 */
export class MockRouter implements Router {
  constructor(private readonly opts: MockRouterOptions = {}) {}

  async route({ message, tree, candidates }: RouteInput): Promise<RouteDecision> {
    const t0 = now();
    for (const rule of this.opts.rules ?? []) {
      const hit =
        typeof rule.match === 'string'
          ? message.content.toLowerCase().includes(rule.match.toLowerCase())
          : rule.match.test(message.content);
      if (hit) {
        return { confidence: 1, ...rule.decision, latencyMs: now() - t0, source: 'mock:rule' };
      }
    }

    const q = new Set(tokenize(message.content));
    const raw = candidates.map((c) => ({ nodeId: c.id, s: overlap(q, tree, c) }));
    const bestRaw = Math.max(0, ...raw.map((r) => r.s));
    const forkThreshold = this.opts.forkThreshold ?? 0.08;
    const logits = raw.map((r) => r.s * 12);
    const forkLogit = bestRaw < forkThreshold ? 12 * forkThreshold + 1 : 12 * forkThreshold - 1;
    const probs = softmax([...logits, forkLogit]);
    const decision = decide({
      tree,
      probs: raw.map((r, i) => ({ nodeId: r.nodeId, p: probs[i] ?? 0 })),
      forkProb: probs[probs.length - 1] ?? 0,
      forkParentId: tree.activeNodeId ?? undefined,
      ...(this.opts.policy ? { policy: this.opts.policy } : {}),
    });
    return { ...decision, latencyMs: now() - t0, source: 'mock:lexical' };
  }
}

function overlap(q: Set<string>, tree: ContextTree, node: ContextNode): number {
  if (q.size === 0) return 0;
  const doc = new Set(tokenize(nodeProfile(tree, node)));
  let hits = 0;
  for (const t of q) if (doc.has(t)) hits += 1;
  return hits / q.size;
}

export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
