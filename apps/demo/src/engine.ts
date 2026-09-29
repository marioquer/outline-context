import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildWorkingContext,
  fullHistoryTokens,
  type ContextMessage,
  type ContextTree,
  type ContextTreeSession,
  type NodeId,
  type RouteDecision,
} from '@context-tree/core';
import { JevRouter } from '@context-tree/jev';
import { DEMO_STEPS, DEMO_SYSTEM, createDemoSession, createEmptySession, stepReply } from './scenario.ts';
import { SwitchableRouter, fetchStatus, remoteJevRouter, streamChat, type ApiStatus, type ApiUsage } from './live.ts';
import { JevPacer, atWordBoundary } from './typing.ts';

export interface TokenSnapshot {
  total: number;
  stablePrefix: number;
  delta: number;
  current: number;
  full: number;
}

export interface Committed {
  decision: RouteDecision;
  nodeId: NodeId;
  createdNodeId?: NodeId;
  tokens: TokenSnapshot;
  /** Measured by the API when a live model produced the reply. */
  api?: ApiUsage;
}

export interface Preview {
  text: string;
  /**
   * `jev`: real Jev answered for this text. `guess`: instant local guess
   * while real Jev is pending. `local`: the local backend is the router.
   */
  source: 'jev' | 'guess' | 'local';
  decision: RouteDecision;
  predictedNodeId: NodeId | null;
  predictedParentId: NodeId | null;
  tokens: TokenSnapshot;
}

/** Context sent to the model this session, summed over turns, against sending the full history each time. */
export interface SessionTokens {
  turns: number;
  sent: number;
  full: number;
}

export interface Streaming {
  id: string;
  nodeId: NodeId;
  text: string;
}

/** Local guess: immediately at a word boundary, else after this idle time. */
const GUESS_IDLE_MS = 150;
/** Real Jev: at a word boundary, else after this idle time (catches the last word). */
const JEV_IDLE_MS = 450;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useContextTreeDemo(demoMode: boolean, liveInDemo = false) {
  // Starts on the local reference backend; switches to real Jev once the dev
  // server reports a gateway key.
  const router = useMemo(() => new SwitchableRouter(new JevRouter()), []);
  const [live, setLive] = useState<ApiStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchStatus().then((st) => {
      if (cancelled || !st) return;
      if (st.jev.engine === 'jev') router.current = remoteJevRouter(st.jev.model);
      setLive(st);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);
  // The recorded demo keeps its scripted replies unless ?live=true.
  const liveReplies = live?.llm.engine === 'claude' && (!demoMode || liveInDemo);
  const sessionRef = useRef<ContextTreeSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = demoMode ? createDemoSession(router) : createEmptySession(router);
  }

  const [tree, setTree] = useState<ContextTree>(() => sessionRef.current!.tree);
  const [transcript, setTranscript] = useState<ContextMessage[]>(() => sessionRef.current!.transcript);
  const [earlierCount, setEarlierCount] = useState(() => sessionRef.current!.transcript.length);
  const [decisions, setDecisions] = useState<Record<string, RouteDecision>>({});
  const [committed, setCommitted] = useState<Committed | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [newNodeId, setNewNodeId] = useState<NodeId | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionTokens, setSessionTokens] = useState<SessionTokens>({ turns: 0, sent: 0, full: 0 });
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);

  const sync = useCallback(() => {
    const s = sessionRef.current!;
    setTree(s.tree);
    setTranscript(s.transcript);
  }, []);

  // ── Typing-time preview ────────────────────────────────────────────
  // Every word boundary gets an instant local guess (<1 ms, free). With real
  // Jev configured, the pacer also sends the latest draft to Jev, at most one
  // call in flight and spaced to stay under the gateway rate limit; its answer
  // replaces the guess. Nothing is committed until send, and a Jev answer for
  // the exact sent text is reused on send.
  const remote = live?.jev.engine === 'jev';
  const ratePerMinute = live?.jev.engine === 'jev' ? live.jev.ratePerMinute : 0;
  const localRouter = useMemo(() => new JevRouter(), []);
  const draftRef = useRef('');
  draftRef.current = draft;
  const shownRef = useRef<Preview | null>(null);

  /**
   * Show the answer that covers the longest prefix of the current draft;
   * on a tie, real Jev beats a local guess. A late Jev answer for an older,
   * shorter draft never replaces a fresher guess.
   */
  const offerPreview = useCallback((pv: Preview) => {
    const current = draftRef.current.trim();
    if (!current || !current.startsWith(pv.text)) return;
    const shown = shownRef.current;
    if (shown && current.startsWith(shown.text)) {
      if (shown.text.length > pv.text.length) return;
      if (shown.text.length === pv.text.length && shown.source === 'jev' && pv.source !== 'jev') return;
    }
    shownRef.current = pv;
    setPreview(pv);
  }, []);

  const buildPreview = useCallback(
    (text: string, p: Awaited<ReturnType<ContextTreeSession['preview']>>, source: Preview['source']): Preview => {
      const s = sessionRef.current!;
      const nodeForContext = p.predictedNodeId ?? p.predictedParentId ?? s.activeNodeId;
      const msg: ContextMessage = { id: 'draft', role: 'user', content: text, createdAt: Date.now() };
      const ctx = buildWorkingContext(s.tree, nodeForContext, { message: msg, system: DEMO_SYSTEM });
      return {
        text,
        source,
        decision: p.decision,
        predictedNodeId: p.predictedNodeId,
        predictedParentId: p.predictedParentId,
        tokens: { ...ctx.tokens, full: fullHistoryTokens(s.transcript, { message: msg, system: DEMO_SYSTEM }) },
      };
    },
    [],
  );

  const pacer = useMemo(() => {
    if (!remote) return null;
    const p: JevPacer = new JevPacer({
      // Spread the per-minute budget evenly, with a little headroom.
      minIntervalMs: Math.ceil(60_000 / ratePerMinute) + 100,
      call: async (text) => {
        const result = await sessionRef.current!.preview(text);
        offerPreview(buildPreview(text, result, 'jev'));
      },
    });
    return p;
  }, [remote, ratePerMinute, buildPreview, offerPreview]);

  useEffect(() => {
    const text = draft.trim();
    if (!text) {
      shownRef.current = null;
      pacer?.reset();
      setPreview(null);
      return;
    }
    const boundary = atWordBoundary(draft);
    const guess = setTimeout(async () => {
      const p = await sessionRef.current!.preview(text, remote ? { router: localRouter } : {});
      offerPreview(buildPreview(text, p, remote ? 'guess' : 'local'));
    }, boundary ? 0 : GUESS_IDLE_MS);
    const jev = pacer ? setTimeout(() => pacer.request(text), boundary ? 0 : JEV_IDLE_MS) : undefined;
    return () => {
      clearTimeout(guess);
      clearTimeout(jev);
    };
  }, [draft, pacer, remote, localRouter, buildPreview, offerPreview]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setBusy(true);
      shownRef.current = null;
      pacer?.reset();
      setPreview(null);
      setDraft('');
      const s = sessionRef.current!;
      const res = await s.add({ role: 'user', content: text });
      const decision = res.decision!;
      setStepIndex((i) => (DEMO_STEPS[i]?.message === text ? i + 1 : i));
      setDecisions((d) => ({ ...d, [res.message.id]: decision }));
      setCommitted({
        decision,
        nodeId: res.activeNodeId,
        ...(res.createdNode ? { createdNodeId: res.createdNode.id } : {}),
        tokens: { ...res.context!.tokens, full: res.fullHistoryTokens ?? 0 },
      });
      setSessionTokens((t) => ({ turns: t.turns + 1, sent: t.sent + res.context!.tokens.total, full: t.full + (res.fullHistoryTokens ?? 0) }));
      if (res.createdNode) setNewNodeId(res.createdNode.id);
      sync();

      // Generation: a live model when configured; otherwise scripted replies
      // for the recorded sequence and a templated reply that says so.
      const id = `stream-${res.message.id}`;
      setStreaming({ id, nodeId: res.activeNodeId, text: '' });
      let reply = '';
      const step = DEMO_STEPS.find((st) => st.message === text);
      const scripted = step && stepReply(step, { action: decision.action, path: res.activePath });
      if (liveReplies) {
        try {
          for await (const ev of streamChat({ system: res.context!.system, messages: res.context!.messages })) {
            if (ev.type === 'delta') {
              reply += ev.text;
              setStreaming({ id, nodeId: res.activeNodeId, text: reply });
            } else if (ev.type === 'done') {
              const api: ApiUsage = { ...ev.usage, model: ev.model, ttftMs: ev.ttftMs, totalMs: ev.totalMs };
              setCommitted((c) => (c && c.nodeId === res.activeNodeId ? { ...c, api } : c));
            } else {
              throw new Error(ev.message);
            }
          }
        } catch (err) {
          reply = `${reply}${reply ? '\n\n' : ''}(live reply failed: ${err instanceof Error ? err.message : String(err)})`;
        }
        if (!reply.trim()) reply = '(the model returned no text)';
      } else {
        reply =
          scripted ??
          `(demo reply, no model connected) This turn was routed to “${res.activePath.join(' / ') || 'the project root'}”. ` +
            `A model would see ${res.context!.tokens.total.toLocaleString()} tokens of working context here: ` +
            `the path, ${res.context!.checkpoint ? 'its checkpoint, ' : ''}${res.context!.recentMessages.length} recent turns in this node, and your message.`;
        await sleep(260);
        const words = reply.split(/(\s+)/);
        let acc = '';
        for (let i = 0; i < words.length; i++) {
          acc += words[i];
          if (i % 2 === 0) {
            setStreaming({ id, nodeId: res.activeNodeId, text: acc });
            await sleep(16 + Math.random() * 18);
          }
        }
      }
      await s.add({ role: 'assistant', content: reply });
      setStreaming(null);
      sync();
      setBusy(false);
    },
    [busy, sync, liveReplies, pacer],
  );

  const typeOut = useCallback(async (text: string) => {
    let acc = '';
    for (const ch of text) {
      if (!playingRef.current) return false;
      acc += ch;
      setDraft(acc);
      await sleep(ch === ' ' ? 45 : 22 + Math.random() * 26);
    }
    return true;
  }, []);

  const runStep = useCallback(
    async (i: number) => {
      const step = DEMO_STEPS[i];
      if (!step) return false;
      const typed = await typeOut(step.message);
      if (!typed) return false;
      // Pause like a person before Enter: real Jev's preview of the whole message may be
      // waiting for a rate-limit slot, so give it up to 4 s to land, then let it be seen.
      const t0 = Date.now();
      while (remote && Date.now() - t0 < 4000) {
        const shown = shownRef.current;
        if (shown?.source === 'jev' && shown.text.trim() === step.message) break;
        await sleep(100);
      }
      await sleep(900);
      if (!playingRef.current) return false;
      await send(step.message);
      return true;
    },
    [send, typeOut, remote],
  );

  const play = useCallback(
    async (count = Infinity) => {
      if (playingRef.current) return;
      playingRef.current = true;
      setPlaying(true);
      let i = stepIndex;
      let done = 0;
      while (playingRef.current && i < DEMO_STEPS.length && done < count) {
        const ok = await runStep(i);
        if (!ok) break;
        i += 1;
        done += 1;
        if (done < count) await sleep(1200);
      }
      playingRef.current = false;
      setPlaying(false);
    },
    [runStep, stepIndex],
  );

  const stop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const reset = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    sessionRef.current = demoMode ? createDemoSession(router) : createEmptySession(router);
    setEarlierCount(sessionRef.current.transcript.length);
    setDecisions({});
    setCommitted(null);
    setSessionTokens({ turns: 0, sent: 0, full: 0 });
    setPreview(null);
    setStreaming(null);
    setNewNodeId(null);
    setDraft('');
    setBusy(false);
    setStepIndex(0);
    sync();
  }, [demoMode, router, sync]);

  return {
    tree,
    transcript,
    earlierCount,
    decisions,
    committed,
    preview,
    streaming,
    newNodeId,
    draft,
    setDraft,
    busy,
    send,
    demo: { steps: DEMO_STEPS, stepIndex, playing, play, stop, reset },
    live,
    liveReplies,
    sessionTokens,
  };
}
