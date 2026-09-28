import { DefaultCandidateBuilder } from './candidates.ts';
import { buildWorkingContext, fullHistoryTokens, type WorkingContext } from './context.ts';
import { ExtractiveSummarizer, HeuristicTitler } from './defaults.ts';
import { StayRouter, now } from './routing.ts';
import {
  DEFAULT_MAX_DEPTH,
  addNode,
  appendMessage,
  applyCheckpoint,
  clampForkParent,
  createId,
  emptyTree,
  getNode,
  pathTitles,
  setActive,
  setCheckpoint,
} from './tree.ts';
import type {
  CandidateBuilder,
  ContextMessage,
  ContextNode,
  ContextTree,
  NodeId,
  Role,
  RouteDecision,
  Router,
  Summarizer,
  Titler,
  TokenCounter,
} from './types.ts';

export interface CheckpointPolicy {
  /** Fold when a node's delta grows past this many messages. Default 12. */
  every: number;
  /** Messages left verbatim in the delta after a fold. Default 4. */
  keepRecent: number;
}

export interface SerializedContextTree {
  format: 'context-tree';
  version: 1;
  tree: ContextTree;
  transcript: ContextMessage[];
}

export interface ContextTreeOptions {
  router: Router;
  /** Used when `router` throws or returns an invalid decision. Default: StayRouter. */
  fallbackRouter?: Router;
  candidateBuilder?: CandidateBuilder;
  titler?: Titler;
  summarizer?: Summarizer;
  /** Deepest allowed node depth (root = 0). Default 3. */
  maxDepth?: number;
  /** Project root. A string is used as its title. */
  root?: string | { title: string; id?: NodeId; summary?: string };
  /** Global system prompt placed at the start of every working context. */
  system?: string;
  checkpoint?: CheckpointPolicy | false;
  tokenCounter?: TokenCounter;
  /** Restore a previous session instead of starting a new tree. */
  initial?: SerializedContextTree;
}

export interface AddInput {
  role?: Role;
  content: string;
  id?: string;
  createdAt?: number;
}

export interface AddResult {
  message: ContextMessage;
  /** Present for user messages. Assistant messages are never routed. */
  decision?: RouteDecision;
  activeNodeId: NodeId;
  activePath: string[];
  /** The node a FORK created. */
  createdNode?: ContextNode;
  /** Working context for the generation model. Present for user messages. */
  context?: WorkingContext;
  /** Tokens a linear full-history prompt would have used for the same turn. */
  fullHistoryTokens?: number;
  candidates?: NodeId[];
}

export interface PreviewResult {
  decision: RouteDecision;
  /** Node that would become active if this message were sent now. Null for a FORK. */
  predictedNodeId: NodeId | null;
  /** For a FORK: the parent the new node would attach to. */
  predictedParentId: NodeId | null;
  candidates: NodeId[];
}

/**
 * The public entry point. Wraps a ContextTree with routing, forking,
 * checkpointing and working-context construction.
 *
 *   const tree = createContextTree({ router: new JevRouter() });
 *   const { decision, activePath, context } = await tree.add({ role: 'user', content });
 */
export class ContextTreeSession {
  tree: ContextTree;
  transcript: ContextMessage[];
  readonly maxDepth: number;
  private readonly router: Router;
  private readonly fallbackRouter: Router;
  private readonly candidateBuilder: CandidateBuilder;
  private readonly titler: Titler;
  private readonly summarizer: Summarizer;
  private readonly checkpointPolicy: CheckpointPolicy | false;
  private readonly system: string | undefined;
  private readonly tokenCounter: TokenCounter | undefined;

  constructor(opts: ContextTreeOptions) {
    this.router = opts.router;
    this.fallbackRouter = opts.fallbackRouter ?? new StayRouter();
    this.candidateBuilder = opts.candidateBuilder ?? new DefaultCandidateBuilder();
    this.titler = opts.titler ?? new HeuristicTitler();
    this.summarizer = opts.summarizer ?? new ExtractiveSummarizer();
    this.maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.checkpointPolicy = opts.checkpoint === undefined ? { every: 12, keepRecent: 4 } : opts.checkpoint;
    this.system = opts.system;
    this.tokenCounter = opts.tokenCounter;

    if (opts.initial) {
      if (opts.initial.format !== 'context-tree' || opts.initial.version !== 1) {
        throw new Error('Unsupported serialized context tree');
      }
      this.tree = structuredClone(opts.initial.tree);
      this.transcript = structuredClone(opts.initial.transcript);
    } else {
      const root = typeof opts.root === 'string' ? { title: opts.root } : (opts.root ?? { title: 'Project' });
      const { tree, node } = addNode(emptyTree(), { title: root.title, parentId: null, id: root.id ?? 'root' });
      this.tree = setActive(root.summary ? setCheckpoint(tree, node.id, root.summary) : tree, node.id);
      this.transcript = [];
    }
  }

  get activeNodeId(): NodeId {
    return this.tree.activeNodeId ?? this.tree.rootIds[0]!;
  }

  get activeNode(): ContextNode {
    return getNode(this.tree, this.activeNodeId);
  }

  path(id: NodeId = this.activeNodeId, includeRoot = false): string[] {
    return pathTitles(this.tree, id, { includeRoot });
  }

  /** Add a node directly, without routing. For seeding a tree. */
  createNode(input: { title: string; parentId?: NodeId | null; id?: NodeId; summary?: string; description?: string }): ContextNode {
    const parentId = input.parentId === undefined ? this.tree.rootIds[0]! : input.parentId;
    const clamped = parentId ? clampForkParent(this.tree, parentId, this.maxDepth) : null;
    const { tree, node } = addNode(this.tree, {
      title: input.title,
      parentId: clamped,
      ...(input.id ? { id: input.id } : {}),
      ...(input.description ? { metadata: { description: input.description } } : {}),
    });
    this.tree = input.summary ? setCheckpoint(tree, node.id, input.summary) : tree;
    return getNode(this.tree, node.id);
  }

  /** Make a node active without routing (e.g. the user clicked it). */
  activate(id: NodeId): void {
    this.tree = setActive(this.tree, id);
  }

  /** Route a draft message without committing anything. For typing-time preview. */
  async preview(content: string, signal?: AbortSignal): Promise<PreviewResult> {
    const message = this.makeMessage({ role: 'user', content });
    const { decision, candidates } = await this.routeMessage(message, signal);
    return {
      decision,
      predictedNodeId: decision.action === 'fork' ? null : (decision.targetNodeId ?? this.activeNodeId),
      predictedParentId: decision.action === 'fork' ? (decision.parentNodeId ?? null) : null,
      candidates,
    };
  }

  async add(input: AddInput): Promise<AddResult> {
    const message = this.makeMessage(input);

    if (message.role === 'assistant') {
      this.commit(this.activeNodeId, message);
      await this.maybeCheckpoint(this.activeNodeId);
      return { message, activeNodeId: this.activeNodeId, activePath: this.path() };
    }

    const { decision, candidates } = await this.routeMessage(message);
    let createdNode: ContextNode | undefined;
    let target: NodeId;

    if (decision.action === 'fork') {
      const parentId = clampForkParent(this.tree, decision.parentNodeId ?? this.activeNodeId, this.maxDepth);
      const parent = getNode(this.tree, parentId);
      const title = await this.titler.title({ message, parent, tree: this.tree });
      const res = addNode(this.tree, { title, parentId });
      this.tree = res.tree;
      createdNode = res.node;
      target = res.node.id;
      decision.parentNodeId = parentId;
      decision.targetNodeId = target;
    } else {
      target = decision.targetNodeId ?? this.activeNodeId;
    }

    this.tree = setActive(this.tree, target, message.createdAt);
    const context = buildWorkingContext(this.tree, target, {
      message,
      ...(this.system ? { system: this.system } : {}),
      ...(this.tokenCounter ? { tokenCounter: this.tokenCounter } : {}),
    });
    const baseline = fullHistoryTokens(this.transcript, {
      message,
      ...(this.system ? { system: this.system } : {}),
      ...(this.tokenCounter ? { tokenCounter: this.tokenCounter } : {}),
    });
    this.commit(target, message);
    await this.maybeCheckpoint(target);

    return {
      message: { ...message, nodeId: target },
      decision,
      activeNodeId: target,
      activePath: this.path(target),
      ...(createdNode ? { createdNode: getNode(this.tree, createdNode.id) } : {}),
      context,
      fullHistoryTokens: baseline,
      candidates,
    };
  }

  /** Working context for the active node, optionally with a draft message. */
  context(content?: string): WorkingContext {
    return buildWorkingContext(this.tree, this.activeNodeId, {
      ...(content ? { message: this.makeMessage({ role: 'user', content }) } : {}),
      ...(this.system ? { system: this.system } : {}),
      ...(this.tokenCounter ? { tokenCounter: this.tokenCounter } : {}),
    });
  }

  toJSON(): SerializedContextTree {
    return { format: 'context-tree', version: 1, tree: structuredClone(this.tree), transcript: structuredClone(this.transcript) };
  }

  private makeMessage(input: AddInput): ContextMessage {
    return {
      id: input.id ?? createId('m'),
      role: input.role ?? 'user',
      content: input.content,
      createdAt: input.createdAt ?? Date.now(),
    };
  }

  private commit(nodeId: NodeId, message: ContextMessage) {
    this.tree = appendMessage(this.tree, nodeId, message);
    this.transcript = [...this.transcript, { ...message, nodeId }];
  }

  private async routeMessage(
    message: ContextMessage,
    signal?: AbortSignal,
  ): Promise<{ decision: RouteDecision; candidates: NodeId[] }> {
    const tree = this.tree.activeNodeId ? this.tree : setActive(this.tree, this.activeNodeId);
    const candidates = await this.candidateBuilder.build({ message, tree });
    const t0 = now();
    let decision: RouteDecision;
    try {
      decision = await this.router.route({ message, tree, candidates, ...(signal ? { signal } : {}) });
      const invalid = this.invalidReason(decision);
      if (invalid) throw new Error(invalid);
    } catch (err) {
      if (signal?.aborted) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      decision = {
        ...(await this.fallbackRouter.route({ message, tree, candidates })),
        fallbackReason: reason,
      };
      decision.source = `fallback:${decision.source ?? 'router'}`;
    }
    decision.latencyMs ??= now() - t0;
    return { decision, candidates: candidates.map((c) => c.id) };
  }

  private invalidReason(d: RouteDecision): string | null {
    if (d.action === 'fork') {
      if (d.parentNodeId && !this.tree.nodes[d.parentNodeId]) return `fork parent not in tree: ${d.parentNodeId}`;
      return null;
    }
    if (d.targetNodeId && !this.tree.nodes[d.targetNodeId]) return `target not in tree: ${d.targetNodeId}`;
    return null;
  }

  private async maybeCheckpoint(nodeId: NodeId) {
    const policy = this.checkpointPolicy;
    if (!policy) return;
    const node = getNode(this.tree, nodeId);
    if (node.recentMessages.length <= policy.every) return;
    const foldCount = node.recentMessages.length - policy.keepRecent;
    const summary = await this.summarizer.summarize({
      node,
      ...(node.checkpoint ? { previous: node.checkpoint } : {}),
      messages: node.recentMessages.slice(0, foldCount),
    });
    this.tree = applyCheckpoint(this.tree, nodeId, summary, foldCount);
  }
}

export function createContextTree(opts: ContextTreeOptions): ContextTreeSession {
  return new ContextTreeSession(opts);
}
