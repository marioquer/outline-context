export type NodeId = string;

export type Role = 'user' | 'assistant';

export interface ContextMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** Node the message was committed to. Set by the tree when appended. */
  nodeId?: NodeId;
}

/**
 * A stable, versioned summary of everything in a node that has been folded
 * out of `recentMessages`. It is only rewritten when the delta grows past a
 * threshold, never on every turn, so the prompt prefix stays cacheable.
 */
export interface ContextCheckpoint {
  summary: string;
  version: number;
  createdAt: number;
  /** Total number of messages folded into this checkpoint so far. */
  foldedCount: number;
}

export interface ContextNode {
  id: NodeId;
  title: string;
  parentId: NodeId | null;
  childIds: NodeId[];
  checkpoint?: ContextCheckpoint;
  /** Append-only delta since the last checkpoint. */
  recentMessages: ContextMessage[];
  createdAt: number;
  /** Last time this node was the committed active node. */
  lastActiveAt: number;
  metadata?: Record<string, unknown>;
}

export interface ContextTree {
  rootIds: NodeId[];
  nodes: Record<NodeId, ContextNode>;
  activeNodeId: NodeId | null;
}

export type RouteAction = 'stay' | 'switch' | 'fork';

/** Pseudo candidate id used in `candidateScores` for the "new node" option. */
export const FORK_CANDIDATE_ID = '@fork';

export interface CandidateScore {
  nodeId: NodeId | typeof FORK_CANDIDATE_ID;
  /** Probability in [0, 1]. Scores in one decision sum to ~1. */
  score: number;
}

export interface RouteDecision {
  action: RouteAction;
  /** Node that becomes active for STAY / SWITCH. */
  targetNodeId?: NodeId;
  /** Parent the new node is attached to for FORK. */
  parentNodeId?: NodeId;
  confidence: number;
  candidateScores?: CandidateScore[];
  latencyMs?: number;
  /** Which router produced the decision, e.g. "jev:local" or "fallback". */
  source?: string;
  /** Set when a fallback path produced the decision. */
  fallbackReason?: string;
  /**
   * True when a commit reused the typing-time preview for the same text on
   * an unchanged tree. `latencyMs` is then the preview's measured latency.
   */
  reusedPreview?: boolean;
}

export interface RouteInput {
  message: ContextMessage;
  tree: ContextTree;
  candidates: ContextNode[];
  signal?: AbortSignal;
}

export interface Router {
  route(input: RouteInput): Promise<RouteDecision>;
}

export interface CandidateBuilderInput {
  message: ContextMessage;
  tree: ContextTree;
}

export interface CandidateBuilder {
  build(input: CandidateBuilderInput): Promise<ContextNode[]>;
}

/** Text embedding behind an interface so semantic retrieval is swappable. */
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

/** Generates a title for a FORKed node. Jev never titles nodes. */
export interface Titler {
  title(input: { message: ContextMessage; parent: ContextNode | null; tree: ContextTree }): Promise<string>;
}

/** Folds old turns into a node's checkpoint. */
export interface Summarizer {
  summarize(input: {
    node: ContextNode;
    previous?: ContextCheckpoint;
    messages: ContextMessage[];
  }): Promise<string>;
}

export interface TokenCounter {
  count(text: string): number;
}
