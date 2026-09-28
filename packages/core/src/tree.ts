import type { ContextCheckpoint, ContextMessage, ContextNode, ContextTree, NodeId } from './types.ts';

/**
 * Pure, immutable operations on a ContextTree. Every function returns a new
 * tree object and leaves its input untouched, which keeps React state and
 * serialization straightforward.
 */

/** Deepest allowed node depth. The root is depth 0, so 3 means four levels. */
export const DEFAULT_MAX_DEPTH = 3;

let idCounter = 0;
export function createId(prefix = 'n'): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'node'
  );
}

export function emptyTree(): ContextTree {
  return { rootIds: [], nodes: {}, activeNodeId: null };
}

export function getNode(tree: ContextTree, id: NodeId): ContextNode {
  const node = tree.nodes[id];
  if (!node) throw new Error(`Unknown node: ${id}`);
  return node;
}

export function depthOf(tree: ContextTree, id: NodeId): number {
  let depth = 0;
  let current = getNode(tree, id);
  while (current.parentId) {
    depth += 1;
    current = getNode(tree, current.parentId);
  }
  return depth;
}

/** Nodes from the root down to `id`, inclusive. */
export function getPath(tree: ContextTree, id: NodeId): ContextNode[] {
  const path: ContextNode[] = [];
  let current: ContextNode | undefined = getNode(tree, id);
  while (current) {
    path.unshift(current);
    current = current.parentId ? tree.nodes[current.parentId] : undefined;
  }
  return path;
}

/** Path titles, optionally without the project root. */
export function pathTitles(tree: ContextTree, id: NodeId, opts: { includeRoot?: boolean } = {}): string[] {
  const path = getPath(tree, id);
  const nodes = opts.includeRoot === false && path.length > 1 ? path.slice(1) : path;
  return nodes.map((n) => n.title);
}

export function isAncestor(tree: ContextTree, ancestorId: NodeId, id: NodeId): boolean {
  let current = tree.nodes[id];
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = tree.nodes[current.parentId];
  }
  return false;
}

/** DFS pre-order over the whole tree, which is also display order. */
export function walk(tree: ContextTree): Array<{ node: ContextNode; depth: number }> {
  const out: Array<{ node: ContextNode; depth: number }> = [];
  const visit = (id: NodeId, depth: number) => {
    const node = tree.nodes[id];
    if (!node) return;
    out.push({ node, depth });
    for (const child of node.childIds) visit(child, depth + 1);
  };
  for (const id of tree.rootIds) visit(id, 0);
  return out;
}

/**
 * If a FORK asks for a parent that would put the new node deeper than
 * `maxDepth`, climb to the nearest ancestor that still has room.
 */
export function clampForkParent(tree: ContextTree, parentId: NodeId, maxDepth = DEFAULT_MAX_DEPTH): NodeId {
  let current = getNode(tree, parentId);
  while (depthOf(tree, current.id) + 1 > maxDepth && current.parentId) {
    current = getNode(tree, current.parentId);
  }
  return current.id;
}

export interface AddNodeInput {
  title: string;
  parentId: NodeId | null;
  id?: NodeId;
  now?: number;
  metadata?: Record<string, unknown>;
}

export function addNode(tree: ContextTree, input: AddNodeInput): { tree: ContextTree; node: ContextNode } {
  const now = input.now ?? Date.now();
  const id = input.id ?? createId('n');
  if (tree.nodes[id]) throw new Error(`Node id already exists: ${id}`);
  if (input.parentId && !tree.nodes[input.parentId]) throw new Error(`Unknown parent: ${input.parentId}`);

  const node: ContextNode = {
    id,
    title: input.title,
    parentId: input.parentId,
    childIds: [],
    recentMessages: [],
    createdAt: now,
    lastActiveAt: 0,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
  const nodes = { ...tree.nodes, [id]: node };
  let rootIds = tree.rootIds;
  if (input.parentId) {
    const parent = getNode(tree, input.parentId);
    nodes[parent.id] = { ...parent, childIds: [...parent.childIds, id] };
  } else {
    rootIds = [...rootIds, id];
  }
  return { tree: { ...tree, nodes, rootIds }, node };
}

export function setActive(tree: ContextTree, id: NodeId, now = Date.now()): ContextTree {
  const node = getNode(tree, id);
  return {
    ...tree,
    activeNodeId: id,
    nodes: { ...tree.nodes, [id]: { ...node, lastActiveAt: now } },
  };
}

export function appendMessage(tree: ContextTree, id: NodeId, message: ContextMessage): ContextTree {
  const node = getNode(tree, id);
  const stamped: ContextMessage = { ...message, nodeId: id };
  return {
    ...tree,
    nodes: { ...tree.nodes, [id]: { ...node, recentMessages: [...node.recentMessages, stamped] } },
  };
}

export function renameNode(tree: ContextTree, id: NodeId, title: string): ContextTree {
  const node = getNode(tree, id);
  return { ...tree, nodes: { ...tree.nodes, [id]: { ...node, title } } };
}

/**
 * Replace a node's checkpoint and drop the messages it now covers from the
 * delta. `keepRecent` messages stay in the delta verbatim.
 */
export function applyCheckpoint(
  tree: ContextTree,
  id: NodeId,
  summary: string,
  foldCount: number,
  now = Date.now(),
): ContextTree {
  const node = getNode(tree, id);
  const previous = node.checkpoint;
  const checkpoint: ContextCheckpoint = {
    summary,
    version: (previous?.version ?? 0) + 1,
    createdAt: now,
    foldedCount: (previous?.foldedCount ?? 0) + foldCount,
  };
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [id]: { ...node, checkpoint, recentMessages: node.recentMessages.slice(foldCount) },
    },
  };
}

/** Set a checkpoint directly, e.g. when seeding a tree from existing notes. */
export function setCheckpoint(tree: ContextTree, id: NodeId, summary: string, now = Date.now()): ContextTree {
  const node = getNode(tree, id);
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [id]: {
        ...node,
        checkpoint: {
          summary,
          version: (node.checkpoint?.version ?? 0) + 1,
          createdAt: now,
          foldedCount: node.checkpoint?.foldedCount ?? 0,
        },
      },
    },
  };
}
