import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react';
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
import type { Committed, Preview, Streaming, TokenSnapshot } from './engine.ts';

const fmt = (n: number) => n.toLocaleString('en-US');
const pct = (p: number) => `${Math.round(p * 100)}%`;

function shortPath(tree: ContextTree, id: NodeId): string {
  const titles = pathTitles(tree, id, { includeRoot: false });
  return titles.join(' / ');
}

function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
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

/* ── Panel 1 ─────────────────────────────────────────────────────── */

export function LinearChat({
  transcript,
  earlierCount,
  streaming,
}: {
  transcript: ContextMessage[];
  earlierCount: number;
  streaming: Streaming | null;
}) {
  const ref = useStickToBottom(`${transcript.length}:${streaming?.text.length ?? 0}`);
  const earlier = transcript.slice(0, earlierCount);
  const recent = transcript.slice(earlierCount);
  return (
    <section className="panel linear" aria-label="Linear chat">
      <div className="panel-hd">
        <span className="eyebrow">Linear chat</span>
        <span className="count-chip">{transcript.length}</span>
        <span className="panel-sub">what a model normally sees</span>
      </div>
      <div className="panel-body scroll" ref={ref}>
        <div className="linear-col msgs">
          {earlier.length > 0 && <div className="earlier">earlier · {earlier.length} messages</div>}
          {earlier.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
          {earlier.length > 0 && recent.length > 0 && <div className="earlier">this session</div>}
          {recent.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
          {streaming && <Bubble m={{ role: 'assistant', content: streaming.text }} streaming />}
          {transcript.length === 0 && !streaming && <div className="empty">One long scroll. No structure.</div>}
        </div>
      </div>
    </section>
  );
}

/* ── Panel 2 ─────────────────────────────────────────────────────── */

interface Group {
  key: string;
  nodeId: NodeId;
  messages: ContextMessage[];
  decision?: RouteDecision;
  returned: boolean;
}

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
    const out: Group[] = [];
    const seen = new Set<NodeId>();
    for (const m of transcript.slice(earlierCount)) {
      const nodeId = m.nodeId ?? '';
      const last = out[out.length - 1];
      if (last && last.nodeId === nodeId) {
        last.messages.push(m);
        continue;
      }
      out.push({
        key: m.id,
        nodeId,
        messages: [m],
        ...(decisions[m.id] ? { decision: decisions[m.id] } : {}),
        returned: seen.has(nodeId),
      });
      seen.add(nodeId);
    }
    return out;
  }, [transcript, earlierCount, decisions]);

  const ref = useStickToBottom(`${transcript.length}:${streaming?.text.length ?? 0}`);
  const contexts = new Set(transcript.slice(0, earlierCount).map((m) => m.nodeId)).size;

  return (
    <section className="panel" aria-label="Context chat">
      <div className="panel-hd">
        <span className="eyebrow">Context chat</span>
        <span className="count-chip">{groups.length}</span>
        <span className="panel-sub">messages under their routed context</span>
      </div>
      <div className="panel-body scroll" ref={ref}>
        <div className="doc-col">
          {earlierCount > 0 && (
            <div className="earlier">
              {earlierCount} earlier messages · {contexts} contexts
            </div>
          )}
          {groups.length === 0 && (
            <div className="empty">
              One input. No section picking.
              <br />
              <strong>Jev</strong> decides where each message belongs.
            </div>
          )}
          {groups.map((g, i) => {
            const isLast = i === groups.length - 1;
            const active = isLast && g.nodeId === committedNodeId;
            const titles = pathTitles(tree, g.nodeId, { includeRoot: false });
            const depth = depthOf(tree, g.nodeId);
            const stream = isLast && streaming && streaming.nodeId === g.nodeId ? streaming : null;
            return (
              <article key={g.key} className="section" data-active={active} data-dim={!isLast}>
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
                    </span>
                  )}
                </header>
                <div className="msgs">
                  {g.messages.map((m) => (
                    <Bubble key={m.id} m={m} />
                  ))}
                  {stream && <Bubble m={{ role: 'assistant', content: stream.text }} streaming />}
                </div>
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
  tree: ContextTree;
  committed: Committed | null;
  preview: Preview | null;
  newNodeId: NodeId | null;
  backendName: string;
}) {
  return (
    <section className="panel" aria-label="Context inspector">
      <div className="panel-body scroll insp">
        <TreeView {...props} />
        <JevPanel {...props} />
        <Metrics {...props} />
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

function JevPanel({
  tree,
  committed,
  preview,
  backendName,
}: {
  tree: ContextTree;
  committed: Committed | null;
  preview: Preview | null;
  backendName: string;
}) {
  const decision = preview?.decision ?? committed?.decision ?? null;
  const state = preview ? 'preview' : committed ? 'committed' : 'idle';

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
  const rows = [...nodeScores, ...(fork ? [fork] : [])].sort((a, b) => b.score - a.score);
  const topId = rows[0]?.nodeId;

  return (
    <div className="insp-sec">
      <div className="insp-hd">
        <NetworkIcon size={13} strokeWidth={2} style={{ color: 'var(--ink-4)' }} />
        <span className="eyebrow">Jev router</span>
        <span className="state-chip" data-state={state}>
          {state === 'idle' ? 'WAITING' : state.toUpperCase()}
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
          <div className="cand-label">Candidates</div>
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
          <div className="jev-foot">
            <span>
              <b>{decision.latencyMs != null ? decision.latencyMs.toFixed(1) : '–'}</b> ms
            </span>
            <span>
              <b>{scores.length - 1}</b> candidates
            </span>
            <span>{decision.source ?? `jev:${backendName}`}</span>
          </div>
          {decision.fallbackReason && <div className="note">Fallback: {decision.fallbackReason}</div>}
        </>
      ) : (
        <div className="jev-empty">Start typing. Jev predicts the context before you send.</div>
      )}
    </div>
  );
}

function Metrics({ committed, preview }: { committed: Committed | null; preview: Preview | null }) {
  const t: TokenSnapshot | null = preview?.tokens ?? committed?.tokens ?? null;
  const reduction = t && t.full > 0 ? 1 - t.total / t.full : 0;
  const w = (n: number) => (t && t.total ? `${(n / t.total) * 100}%` : '0%');
  return (
    <div className="insp-sec">
      <div className="insp-hd">
        <GaugeIcon size={13} strokeWidth={2} style={{ color: 'var(--ink-4)' }} />
        <span className="eyebrow">Working context</span>
        {t && (
          <span className="state-chip" data-state={preview ? 'preview' : 'committed'}>
            {preview ? 'PROJECTED' : 'LAST TURN'}
          </span>
        )}
      </div>
      {t ? (
        <>
          <div className="metric">
            <span className="metric-l">Full history</span>
            <span className="metric-v">
              {fmt(t.full)}
              <small>tokens</small>
            </span>
          </div>
          <div className="metric">
            <span className="metric-l">Context tree</span>
            <span className="metric-v">
              {fmt(t.total)}
              <small>tokens</small>
            </span>
          </div>
          <div className="metric hero">
            <span className="metric-l">Reduction</span>
            <span className="metric-v">{(reduction * 100).toFixed(1)}%</span>
          </div>
          <div className="ctx-bar" aria-hidden>
            <i className="stable" style={{ width: w(t.stablePrefix) }} />
            <i className="delta" style={{ width: w(t.delta) }} />
            <i className="current" style={{ width: w(t.current) }} />
          </div>
          <div className="ctx-legend">
            <span>
              <i style={{ background: 'color-mix(in oklch, var(--ink-3) 55%, transparent)' }} />
              stable prefix {fmt(t.stablePrefix)}
            </span>
            <span>
              <i style={{ background: 'var(--accent)' }} />
              delta {fmt(t.delta)}
            </span>
            <span>
              <i style={{ background: 'var(--ink)' }} />
              message {fmt(t.current)}
            </span>
          </div>
          <div className="note">Token counts are estimates (≈4 characters per token), computed live from the messages on screen.</div>
        </>
      ) : (
        <div className="jev-empty">Send a message to measure its working context.</div>
      )}
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
      label = `${d.action === 'stay' ? 'stay in' : '→'} ${p}`;
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
      <div className="composer-hint">
        <span>
          <kbd>Enter</kbd> send
        </span>
        <span>
          <kbd>Shift</kbd>+<kbd>Enter</kbd> newline
        </span>
        <span>preview is never committed until you send</span>
      </div>
    </div>
  );
}
