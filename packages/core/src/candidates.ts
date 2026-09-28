import { HashingEmbedder, cosine } from './text.ts';
import { getNode, pathTitles, walk } from './tree.ts';
import type { CandidateBuilder, CandidateBuilderInput, ContextNode, ContextTree, Embedder, NodeId } from './types.ts';

/**
 * Text that represents a node for retrieval and routing: path, title,
 * checkpoint, and the latest user turns.
 */
export function nodeProfile(tree: ContextTree, node: ContextNode, recentTurns = 4): string {
  const path = pathTitles(tree, node.id).join(' / ');
  const recent = node.recentMessages
    .filter((m) => m.role === 'user')
    .slice(-recentTurns)
    .map((m) => m.content);
  const described = typeof node.metadata?.description === 'string' ? node.metadata.description : '';
  return [path, node.title, described, node.checkpoint?.summary ?? '', ...recent].filter(Boolean).join('\n');
}

export type CandidateSource = 'current' | 'parent' | 'sibling' | 'child' | 'recent' | 'semantic' | 'root';

export interface CandidateBuilderOptions {
  /** Upper bound on candidates sent to the router. Default 12. */
  maxCandidates?: number;
  /** How many most-recently-active nodes to include. Default 3. */
  recentK?: number;
  /** How many semantic nearest neighbours to include. Default 5. */
  semanticK?: number;
  embedder?: Embedder;
}

/**
 * Locality + recency + semantic top-k, deduplicated and capped.
 *
 * When the whole tree fits under `maxCandidates`, every node is a candidate,
 * so small trees never lose recall to the builder.
 */
export class DefaultCandidateBuilder implements CandidateBuilder {
  readonly maxCandidates: number;
  private readonly recentK: number;
  private readonly semanticK: number;
  private readonly embedder: Embedder;
  /** Why each node was chosen in the most recent `build` call. */
  lastSources = new Map<NodeId, CandidateSource[]>();

  constructor(opts: CandidateBuilderOptions = {}) {
    this.maxCandidates = opts.maxCandidates ?? 12;
    this.recentK = opts.recentK ?? 3;
    this.semanticK = opts.semanticK ?? 5;
    this.embedder = opts.embedder ?? new HashingEmbedder();
  }

  async build({ message, tree }: CandidateBuilderInput): Promise<ContextNode[]> {
    const all = walk(tree).map((e) => e.node);
    const sources = new Map<NodeId, CandidateSource[]>();
    const tag = (id: NodeId, s: CandidateSource) => {
      const arr = sources.get(id);
      if (arr) {
        if (!arr.includes(s)) arr.push(s);
      } else sources.set(id, [s]);
    };

    if (all.length <= this.maxCandidates) {
      for (const n of all) tag(n.id, 'semantic');
      this.lastSources = sources;
      return all;
    }

    const ordered: NodeId[] = [];
    const push = (id: NodeId | null | undefined, s: CandidateSource) => {
      if (!id || !tree.nodes[id]) return;
      tag(id, s);
      if (!ordered.includes(id)) ordered.push(id);
    };

    // Locality around the active node.
    const active = tree.activeNodeId ? getNode(tree, tree.activeNodeId) : null;
    if (active) {
      push(active.id, 'current');
      push(active.parentId, 'parent');
      const siblings = active.parentId ? getNode(tree, active.parentId).childIds : tree.rootIds;
      for (const s of siblings) if (s !== active.id) push(s, 'sibling');
      for (const c of active.childIds) push(c, 'child');
    }
    for (const r of tree.rootIds) push(r, 'root');

    // Recency.
    [...all]
      .filter((n) => n.lastActiveAt > 0)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .slice(0, this.recentK)
      .forEach((n) => push(n.id, 'recent'));

    // Semantic top-k against the message.
    const [q, ...docs] = await this.embedder.embed([message.content, ...all.map((n) => nodeProfile(tree, n))]);
    const ranked = all
      .map((n, i) => ({ id: n.id, s: cosine(q ?? [], docs[i] ?? []) }))
      .sort((a, b) => b.s - a.s);
    // Semantic hits go first so they survive the cap.
    const semanticIds = ranked.slice(0, this.semanticK).map((r) => r.id);
    for (const id of semanticIds) tag(id, 'semantic');
    // Remaining slots are filled with the next-best semantic matches.
    const fill = ranked.slice(this.semanticK).map((r) => r.id);
    for (const id of fill) if (!sources.has(id)) sources.set(id, ['semantic']);
    const merged = [
      ...ordered.filter((id) => sources.get(id)?.includes('current')),
      ...semanticIds,
      ...ordered,
      ...fill,
    ].filter((id, i, arr) => arr.indexOf(id) === i);

    const picked = merged.slice(0, this.maxCandidates);
    this.lastSources = new Map(picked.map((id) => [id, sources.get(id) ?? []]));
    return picked.map((id) => getNode(tree, id));
  }
}
