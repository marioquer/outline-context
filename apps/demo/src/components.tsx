import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpIcon, GitForkIcon, HashIcon, NetworkIcon, GaugeIcon } from 'lucide-react';
import {
  FORK_CANDIDATE_ID,
  depthOf,
  pathTitles,
  walk,
  type ContextMessage,
  type ContextTree,
  type NodeId,
  type RouteDecision,
} from '@context-tree/core';
import type { Committed, Preview, SessionTokens, Streaming } from './engine.ts';

const fmt = (n: number) => n.toLocaleString('en-US');
const pct = (p: number) => `${Math.round(p * 100)}%`;
const fmtMs = (ms: number) => (ms < 1 ? '<1 ms' : `${Math.round(ms)} ms`);

function shortPath(tree: ContextTree, id: NodeId): string {
  const titles = pathTitles(tree, id, { includeRoot: false });
  return titles.join(' / ');
}

function Bubble({ m, streaming }: { m: { role: string; content: string }; streaming?: boolean }) {
  return (
    <div className={`msg ${m.role}`}>
      <div className="bubble">
        {streaming && !m.content ? <span className="thinking-dot" aria-label="Assistant is thinking" /> : m.content}
      </div>
    </div>
  );
}

/* ── Panel 2 ─────────────────────────────────────────────────────── */

/** A section's history from before this session, collapsed behind a toggle. */
function EarlierInSection({ messages }: { messages: ContextMessage[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="earlier earlier-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'hide' : 'show'} {messages.length} earlier messages
      </button>
      {open && messages.map((m) => <Bubble key={m.id} m={m} />)}
    </>
  );
}

interface Group {
  nodeId: NodeId;
  earlier: ContextMessage[];
  messages: ContextMessage[];
  /** Decision that routed the most recent run of messages into this section. */
  decision?: RouteDecision;
  /** The most recent run came back to a section that already had messages this session. */
  returned: boolean;
}

/**
 * One section per context node, in tree order. A message that returns to a
 * context is appended to that context's section (which scrolls into view)
 * instead of opening a new block at the bottom.
 */
export function ContextChat({
  tree,
  transcript,
  earlierCount,
  decisions,
  streaming,
  committedNodeId,
}: {
  tree: ContextTree;
  transcript: ContextMessage[];
  earlierCount: number;
  decisions: Record<string, RouteDecision>;
  streaming: Streaming | null;
  committedNodeId: NodeId | null;
}) {
  const groups = useMemo(() => {
    const byNode = new Map<NodeId, Group>();
    const group = (nodeId: NodeId) => {
      let g = byNode.get(nodeId);
      if (!g) byNode.set(nodeId, (g = { nodeId, earlier: [], messages: [], returned: false }));
      return g;
    };
    transcript.slice(0, earlierCount).forEach((m) => group(m.nodeId ?? '').earlier.push(m));
    let prev: NodeId | null = null;
    for (const m of transcript.slice(earlierCount)) {
      const g = group(m.nodeId ?? '');
      if (g.nodeId !== prev) {
        g.returned = g.messages.length > 0;
        if (decisions[m.id]) g.decision = decisions[m.id];
        else delete g.decision;
      }
      g.messages.push(m);
      prev = g.nodeId;
    }
    // Sections appear once they are used this session; tree order keeps them outline-shaped.
    return walk(tree).flatMap(({ node }) => {
      const g = byNode.get(node.id);
      return g && (g.messages.length > 0 || streaming?.nodeId === node.id) ? [g] : [];
    });
  }, [tree, transcript, earlierCount, decisions, streaming?.nodeId]);

  const ref = useRef<HTMLDivElement | null>(null);
  const activeEnd = useRef<HTMLDivElement | null>(null);
  const activeCount = groups.find((g) => g.nodeId === committedNodeId)?.messages.length ?? 0;
  useLayoutEffect(() => {
    const end = activeEnd.current;
    const body = ref.current;
    if (!end || !body) return;
    // Keep the end of the active section in view: jump there on a switch, follow it while streaming.
    const top = body.scrollTop + end.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 24;
    if (Math.abs(body.scrollTop - top) > 1) body.scrollTo({ top: Math.max(0, top), behavior: streaming ? 'auto' : 'smooth' });
  }, [committedNodeId, activeCount, streaming?.text.length]);

  return (
    <section className="panel" aria-label="Context chat">
      <div className="panel-hd">
        <span className="eyebrow">Context chat</span>
        <span className="count-chip">{groups.length}</span>
      </div>
      <div className="panel-body scroll" ref={ref}>
        <div className="doc-col">
          {groups.length === 0 && (
            <div className="empty">
              One input. No section picking.
              <br />
              <strong>Jev</strong> decides where each message belongs.
            </div>
          )}
          {groups.map((g) => {
            const active = g.nodeId === committedNodeId;
            const titles = pathTitles(tree, g.nodeId, { includeRoot: false });
            const depth = depthOf(tree, g.nodeId);
            const stream = streaming && streaming.nodeId === g.nodeId ? streaming : null;
            return (
              <article key={g.nodeId} className="section" data-active={active} data-dim={!active}>
                <header className="section-head">
                  <span className="level" data-level={depth}>
                    {depth === 0 ? '◆' : `H${depth}`}
                  </span>
                  <span className="section-title">
                    {titles.length === 0 ? (
                      pathTitles(tree, g.nodeId)[0]
                    ) : (
                      <>
                        {titles.slice(0, -1).map((t) => (
                          <span key={t}>
                            <span className="crumb">{t}</span>
                            <span className="sep">/</span>
                          </span>
                        ))}
                        {titles[titles.length - 1]}
                      </>
                    )}
                  </span>
                  {g.returned && <span className="route-chip returned">↩ returned</span>}
                  {g.decision && (
                    <span className="route-chip" data-action={g.decision.action}>
                      {g.decision.action === 'fork' && <GitForkIcon size={10} />}
                      {g.decision.action}
                      {g.decision.latencyMs != null && <span className="route-ms">{fmtMs(g.decision.latencyMs)}</span>}
                    </span>
                  )}
                </header>
                <div className="msgs">
                  {g.earlier.length > 0 && <EarlierInSection messages={g.earlier} />}
                  {g.messages.map((m) => (
                    <Bubble key={m.id} m={m} />
                  ))}
                  {stream && <Bubble m={{ role: 'assistant', content: stream.text }} streaming />}
                </div>
                {active && <div ref={activeEnd} />}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Panel 3 ─────────────────────────────────────────────────────── */

export function Inspector(props: {
  sessionTokens: SessionTokens;
  tree: ContextTree;
  committed: Committed | null;
  preview: Preview | null;
  newNodeId: NodeId | null;
}) {
  return (
    <section className="panel" aria-label="Context inspector">
      <div className="panel-body scroll insp">
        <JevPanel {...props} />
        <Savings {...props} />
        <TreeView {...props} />
      </div>
    </section>
  );
}

function TreeView({
  tree,
  preview,
  newNodeId,
}: {
  tree: ContextTree;
  preview: Preview | null;
  newNodeId: NodeId | null;
}) {
  const rows = walk(tree);
  const committedId = tree.activeNodeId;
  const previewId = preview?.predictedNodeId ?? null;
  const ghostParent = preview?.decision.action === 'fork' ? preview.predictedParentId : null;

  // Where the ghost FORK row goes: after the parent's last descendant.
  let ghostAfter = -1;
  if (ghostParent) {
    const start = rows.findIndex((r) => r.node.id === ghostParent);
    if (start >= 0) {
      ghostAfter = start;
      const d = rows[start]!.depth;
      while (rows[ghostAfter + 1] && rows[ghostAfter + 1]!.depth > d) ghostAfter += 1;
    }
  }
  const ghostDepth = ghostParent ? Math.min(3, depthOf(tree, ghostParent) + 1) : 0;

  // FLIP: slide rows to their new positions when the tree gains a node.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const prevRects = useRef(new Map<string, number>());
  const shape = rows.map((r) => r.node.id).join('|');
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const next = new Map<string, number>();
    body.querySelectorAll<HTMLElement>('[data-row-id]').forEach((el) => {
      next.set(el.dataset.rowId!, el.getBoundingClientRect().top);
    });
    for (const [id, top] of next) {
      const prev = prevRects.current.get(id);
      if (prev == null || prev === top) continue;
      const el = body.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
      if (!el) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${prev - top}px)`;
      requestAnimationFrame(() => {
        el.style.transition = '';
        el.style.transform = '';
      });
    }
    prevRects.current = next;
  }, [shape, ghostAfter]);

  return (
    <div className="insp-sec">
      <div className="insp-hd">
        <HashIcon size={13} strokeWidth={2} style={{ color: 'var(--ink-4)' }} />
        <span className="eyebrow">Context tree</span>
        <span className="count-chip">{rows.length}</span>
      </div>
      <div className="tree" ref={bodyRef}>
        {rows.map((r, i) => {
          const n = r.node;
          const count = n.recentMessages.length + (n.checkpoint?.foldedCount ?? 0);
          return (
            <div key={n.id}>
              <div
                className="tr-item"
                data-row-id={n.id}
                data-depth={Math.min(r.depth, 3)}
                data-committed={n.id === committedId}
                data-preview={n.id === previewId}
                data-new={n.id === newNodeId}
              >
                <span className="tr-level">{r.depth === 0 ? '◆' : `H${r.depth}`}</span>
                <span className="tr-text">{n.title}</span>
                {n.id === newNodeId && <span className="tr-new-badge">+ new</span>}
                {count > 0 && <span className="tr-count">{count}</span>}
                <span className="tr-pointer" aria-hidden>
                  ◀
                </span>
              </div>
              {i === ghostAfter && (
                <div className="tr-item ghost" data-row-id="@ghost" data-depth={ghostDepth}>
                  <span className="tr-level">H{ghostDepth}</span>
                  <span className="tr-text">new context…</span>
                  <span className="tr-count">+</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JevPanel({ tree, committed, preview }: { tree: ContextTree; committed: Committed | null; preview: Preview | null }) {
  const decision = preview?.decision ?? committed?.decision ?? null;

  // Only real Jev is labelled Jev; the instant local guess says so.
  let chip = 'WAITING';
  if (preview) chip = preview.source === 'guess' ? 'GUESS' : preview.decision.fallbackReason ? 'FALLBACK' : 'PREVIEW';
  else if (committed) chip = 'SENT';

  let target = '';
  if (decision) {
    if (decision.action === 'fork') {
      const parent = preview ? preview.predictedParentId : decision.parentNodeId;
      const created = !preview && committed?.createdNodeId ? tree.nodes[committed.createdNodeId]?.title : null;
      target = `${created ? `${created} · ` : ''}under ${parent ? tree.nodes[parent]?.title ?? '?' : '?'}`;
    } else if (decision.targetNodeId && tree.nodes[decision.targetNodeId]) {
      target = shortPath(tree, decision.targetNodeId) || tree.nodes[decision.targetNodeId]!.title;
    }
  }

  const scores = decision?.candidateScores ?? [];
  const nodeScores = scores.filter((s) => s.nodeId !== FORK_CANDIDATE_ID).slice(0, 3);
  const fork = scores.find((s) => s.nodeId === FORK_CANDIDATE_ID);
  const rows = [...nodeScores, ...(fork ? [fork] : [])].sort((a, b) => b.score - a.score).slice(0, 3);
  const topId = rows[0]?.nodeId;
  const beforeSend = Boolean(preview) || Boolean(decision?.reusedPreview);

  return (
    <div className="insp-sec">
      <div className="insp-hd">
        <NetworkIcon size={13} strokeWidth={2} style={{ color: 'var(--ink-4)' }} />
        <span className="eyebrow">Jev router</span>
        <span className="state-chip" data-state={preview ? 'preview' : committed ? 'committed' : 'idle'}>
          {chip}
        </span>
      </div>
      {decision ? (
        <>
          <div className="jev-decision">
            <span className="jev-action" data-action={decision.action}>
              {decision.action.toUpperCase()}
            </span>
            <span className="jev-target">{target}</span>
            <span className="jev-conf">{pct(decision.confidence)}</span>
          </div>
          {rows.map((s) => {
            const isFork = s.nodeId === FORK_CANDIDATE_ID;
            const name = isFork ? 'NEW / FORK' : shortPath(tree, s.nodeId) || tree.nodes[s.nodeId]?.title || s.nodeId;
            return (
              <div className="cand" key={s.nodeId} data-top={s.nodeId === topId} data-fork={isFork}>
                <span className={`cand-name${isFork ? ' fork' : ''}`}>{name}</span>
                <span className="cand-bar">
                  <i style={{ width: `${Math.max(2, s.score * 100)}%` }} />
                </span>
                <span className="cand-pct">{pct(s.score)}</span>
              </div>
            );
          })}
          {/* The headline speed is Jev's; the instant local guess does not get one. */}
          {decision.latencyMs != null && preview?.source !== 'guess' && (
            <div className="jev-speed">
              <span className="jev-speed-v">{fmtMs(decision.latencyMs)}</span>
              <span className="jev-speed-l">{beforeSend ? 'decided before you hit send' : 'to decide'}</span>
            </div>
          )}
          {decision.fallbackReason && <div className="note warn">Fallback used: {decision.fallbackReason}</div>}
        </>
      ) : (
        <div className="jev-empty">Start typing. Jev picks the context before you send.</div>
      )}
    </div>
  );
}

/** Context tokens sent to the model: this turn and this session, against resending the full history. */
function Savings({ committed, preview, sessionTokens }: { committed: Committed | null; preview: Preview | null; sessionTokens: SessionTokens }) {
  const t = preview?.tokens ?? committed?.tokens ?? null;
  const api = !preview ? committed?.api : undefined;
  const cut = (sent: number, full: number) => (full > 0 ? `−${Math.round((1 - sent / full) * 100)}%` : '');
  return (
    <div className="insp-sec">
      <div className="insp-hd">
        <GaugeIcon size={13} strokeWidth={2} style={{ color: 'var(--ink-4)' }} />
        <span className="eyebrow">Tokens sent</span>
        <span className="state-chip" title="≈4 characters per token, computed from the messages on screen">
          ESTIMATED
        </span>
      </div>
      {t ? (
        <>
          <div className="save-row">
            <span className="save-l">{preview ? 'This message' : 'Last message'}</span>
            <span className="save-hero">{cut(t.total, t.full)}</span>
          </div>
          <SaveBar label="Full history" n={t.full} of={t.full} kind="full" />
          <SaveBar label="Context Tree" n={t.total} of={t.full} kind="tree" />
          {sessionTokens.turns > 1 && (
            <div className="save-session">
              <span>
                {sessionTokens.turns} messages: <b>{fmt(sessionTokens.sent)}</b> vs {fmt(sessionTokens.full)} tokens
              </span>
              <b>{cut(sessionTokens.sent, sessionTokens.full)}</b>
            </div>
          )}
          {api && (
            <div className="save-api">
              Measured · {api.model}: {fmt(api.input + api.cacheRead + api.cacheWrite)} input, {fmt(api.cacheRead)} from cache, {fmt(api.ttftMs)} ms to first token
            </div>
          )}
        </>
      ) : (
        <div className="jev-empty">Send a message to see what it costs.</div>
      )}
    </div>
  );
}

function SaveBar({ label, n, of, kind }: { label: string; n: number; of: number; kind: 'full' | 'tree' }) {
  return (
    <div className="save-bar" data-kind={kind}>
      <span className="save-bar-l">{label}</span>
      <span className="save-bar-track">
        <i style={{ width: `${of > 0 ? Math.max(2, (n / of) * 100) : 0}%` }} />
      </span>
      <span className="save-bar-v">{fmt(n)}</span>
    </div>
  );
}

/* ── Global composer ─────────────────────────────────────────────── */

export function Composer({
  tree,
  draft,
  setDraft,
  preview,
  busy,
  readOnly,
  onSend,
}: {
  tree: ContextTree;
  draft: string;
  setDraft: (s: string) => void;
  preview: Preview | null;
  busy: boolean;
  readOnly: boolean;
  onSend: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [draft]);
  useEffect(() => {
    if (!readOnly) ref.current?.focus();
  }, [readOnly]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!busy && !readOnly) onSend(draft);
    }
  }

  let label = 'Jev routes as you type';
  const on = Boolean(preview);
  if (preview) {
    const d = preview.decision;
    if (d.action === 'fork') {
      label = `+ new context under ${preview.predictedParentId ? tree.nodes[preview.predictedParentId]?.title : '?'}`;
    } else if (preview.predictedNodeId) {
      const p = shortPath(tree, preview.predictedNodeId) || tree.nodes[preview.predictedNodeId]?.title;
      label = `${d.action === 'stay' ? 'stay in' : '→'} ${p}${preview.source === 'guess' ? ' (guess)' : ''}`;
    }
  } else if (draft.trim()) {
    label = 'routing…';
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={ref}
          rows={1}
          value={draft}
          readOnly={readOnly}
          placeholder="Ask anything…"
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className="predict" data-on={on} data-action={preview?.decision.action} title="Jev preview (not committed)">
          <span className="dot" />
          {label}
        </span>
        <button className="send" aria-label="Send" disabled={!draft.trim() || busy || readOnly} onClick={() => onSend(draft)}>
          <ArrowUpIcon size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
