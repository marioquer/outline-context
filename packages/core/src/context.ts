import { defaultTokenCounter } from './text.ts';
import { getNode, getPath } from './tree.ts';
import type { ContextMessage, ContextTree, NodeId, Role, TokenCounter } from './types.ts';

export type SegmentKind = 'system' | 'root' | 'path' | 'checkpoint' | 'delta' | 'current';

export interface PromptSegment {
  kind: SegmentKind;
  label: string;
  text: string;
  /**
   * True for segments that only change when the active node or its
   * checkpoint changes. They form the cacheable prefix.
   */
  stable: boolean;
  tokens: number;
}

export interface PromptMessage {
  role: Role;
  content: string;
}

export interface WorkingContext {
  nodeId: NodeId;
  path: string[];
  /** Stable prefix: global system text, root checkpoint, active path, active checkpoint. */
  system: string;
  /** Append-only delta for the active node, then the current user message. */
  messages: PromptMessage[];
  segments: PromptSegment[];
  checkpoint?: string;
  recentMessages: ContextMessage[];
  tokens: { total: number; stablePrefix: number; delta: number; current: number };
}

export const DEFAULT_SYSTEM_PROMPT = [
  'You are an assistant working inside a Context Tree: a long-running conversation organized into topic nodes.',
  'You are shown only the active node: its path, its checkpoint, and its recent turns.',
  'Stay within the active context. If the user needs something from another topic, say so rather than guessing.',
].join(' ');

export interface BuildContextOptions {
  system?: string;
  /** Current user message. Omit to build the context without it. */
  message?: ContextMessage;
  /** Cap on recent delta messages included. Default: all of them. */
  maxRecent?: number;
  tokenCounter?: TokenCounter;
}

/**
 * Build the working context for the active node:
 *
 *   [STABLE GLOBAL PREFIX]  system prompt
 *   [STABLE TOPIC PREFIX]   root checkpoint, active path, active checkpoint
 *   [APPEND-ONLY DELTA]     recent turns in the active node
 *   [CURRENT MESSAGE]
 *
 * Unrelated branches are never included. The layout only rewrites the
 * prefix when the active node or its checkpoint version changes, which keeps
 * provider prompt caches warm while the user stays in one context.
 */
export function buildWorkingContext(
  tree: ContextTree,
  nodeId: NodeId,
  opts: BuildContextOptions = {},
): WorkingContext {
  const counter = opts.tokenCounter ?? defaultTokenCounter;
  const node = getNode(tree, nodeId);
  const path = getPath(tree, nodeId);
  const root = path[0]!;
  const segments: PromptSegment[] = [];
  const seg = (kind: SegmentKind, label: string, text: string, stable: boolean) => {
    if (!text) return;
    segments.push({ kind, label, text, stable, tokens: counter.count(text) });
  };

  seg('system', 'SYSTEM', opts.system ?? DEFAULT_SYSTEM_PROMPT, true);
  if (root.id !== node.id && root.checkpoint?.summary) {
    seg('root', 'ROOT SUMMARY', `## ROOT SUMMARY\n${root.title}\n${root.checkpoint.summary}`, true);
  }
  seg('path', 'ACTIVE PATH', `## ACTIVE PATH\n${renderPath(path.map((n) => n.title))}`, true);
  if (node.checkpoint?.summary) {
    seg(
      'checkpoint',
      'ACTIVE CHECKPOINT',
      `## ACTIVE CHECKPOINT (v${node.checkpoint.version})\n${node.checkpoint.summary}`,
      true,
    );
  }

  const recent = opts.maxRecent != null ? node.recentMessages.slice(-opts.maxRecent) : node.recentMessages;
  const messages: PromptMessage[] = recent.map((m) => ({ role: m.role, content: m.content }));
  for (const m of recent) seg('delta', m.role === 'user' ? 'USER' : 'ASSISTANT', m.content, false);
  if (opts.message) {
    messages.push({ role: 'user', content: opts.message.content });
    seg('current', 'CURRENT MESSAGE', opts.message.content, false);
  }

  const system = segments
    .filter((s) => s.stable)
    .map((s) => s.text)
    .join('\n\n');
  const sum = (kinds: SegmentKind[]) =>
    segments.filter((s) => kinds.includes(s.kind)).reduce((acc, s) => acc + s.tokens, 0);

  return {
    nodeId,
    path: path.map((n) => n.title),
    system,
    messages,
    segments,
    ...(node.checkpoint ? { checkpoint: node.checkpoint.summary } : {}),
    recentMessages: recent,
    tokens: {
      stablePrefix: sum(['system', 'root', 'path', 'checkpoint']),
      delta: sum(['delta']),
      current: sum(['current']),
      total: segments.reduce((acc, s) => acc + s.tokens, 0),
    },
  };
}

function renderPath(titles: string[]): string {
  return titles.map((t, i) => `${'  '.repeat(i)}${i === 0 ? '' : '└── '}${t}`).join('\n');
}

/** Flatten a working context into one string, e.g. for token counting or logging. */
export function renderWorkingContext(ctx: WorkingContext): string {
  return [ctx.system, ...ctx.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`)].join('\n\n');
}

/**
 * Baseline: the whole linear transcript plus the current message, as a
 * traditional chat would send it. Used for the "FULL HISTORY" metric.
 */
export function fullHistoryTokens(
  transcript: ContextMessage[],
  opts: { system?: string; message?: ContextMessage; tokenCounter?: TokenCounter } = {},
): number {
  const counter = opts.tokenCounter ?? defaultTokenCounter;
  let total = counter.count(opts.system ?? DEFAULT_SYSTEM_PROMPT);
  for (const m of transcript) total += counter.count(m.content);
  if (opts.message) total += counter.count(opts.message.content);
  return total;
}
