/**
 * Wire format between Context Tree and a Jev backend.
 *
 * Jev makes one bounded decision per message: which candidate the message
 * belongs to, or whether it opens a new durable context (and under which
 * parent). It never generates text or titles.
 */

export type JevRelation = 'current' | 'parent' | 'ancestor' | 'sibling' | 'child' | 'descendant' | 'other';

export interface JevCandidate {
  id: string;
  title: string;
  /** Titles from the root down to this node, inclusive. */
  path: string[];
  depth: number;
  relation: JevRelation;
  /** Checkpoint summary and optional description. */
  summary: string;
  /** Latest user turns in this node, oldest first. */
  recent: string[];
  /** 0 = most recently active. Absent if never active. */
  recencyRank?: number;
}

export interface JevRequest {
  version: 'jev.route.v0';
  message: string;
  activeNodeId: string | null;
  activePath: string[];
  candidates: JevCandidate[];
  /** False when every candidate is at max depth and no FORK is possible. */
  allowFork: boolean;
  maxDepth: number;
}

/** Provide either logits or probabilities. Logits are softmaxed together with `fork`. */
export interface JevScore {
  id: string;
  logit?: number;
  p?: number;
}

export interface JevResponse {
  scores: JevScore[];
  fork?: { logit?: number; p?: number; parentId?: string };
  /** Identifies the model/version that answered, for logging. */
  model?: string;
}

export interface JevBackend {
  readonly name: string;
  route(request: JevRequest, opts?: { signal?: AbortSignal }): Promise<JevResponse>;
}
