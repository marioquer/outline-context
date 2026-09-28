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
import { DEMO_STEPS, DEMO_SYSTEM, createDemoSession, createEmptySession } from './scenario.ts';

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
}

export interface Preview {
  text: string;
  decision: RouteDecision;
  predictedNodeId: NodeId | null;
  predictedParentId: NodeId | null;
  tokens: TokenSnapshot;
}

export interface Streaming {
  id: string;
  nodeId: NodeId;
  text: string;
}

const PREVIEW_DEBOUNCE_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useContextTreeDemo(demoMode: boolean) {
  const router = useMemo(() => new JevRouter(), []);
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
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const previewSeq = useRef(0);

  const sync = useCallback(() => {
    const s = sessionRef.current!;
    setTree(s.tree);
    setTranscript(s.transcript);
  }, []);

  // Typing-time preview: debounce, route without committing.
  useEffect(() => {
    const text = draft.trim();
    if (!text) {
      previewSeq.current += 1;
      setPreview(null);
      return;
    }
    const seq = ++previewSeq.current;
    const timer = setTimeout(async () => {
      const s = sessionRef.current!;
      const p = await s.preview(text);
      if (seq !== previewSeq.current) return; // stale
      const nodeForContext = p.predictedNodeId ?? p.predictedParentId ?? s.activeNodeId;
      const msg: ContextMessage = { id: 'draft', role: 'user', content: text, createdAt: Date.now() };
      const ctx = buildWorkingContext(s.tree, nodeForContext, { message: msg, system: DEMO_SYSTEM });
      setPreview({
        text,
        decision: p.decision,
        predictedNodeId: p.predictedNodeId,
        predictedParentId: p.predictedParentId,
        tokens: {
          ...ctx.tokens,
          full: fullHistoryTokens(s.transcript, { message: msg, system: DEMO_SYSTEM }),
        },
      });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setBusy(true);
      previewSeq.current += 1;
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
      if (res.createdNode) setNewNodeId(res.createdNode.id);
      sync();

      // Generation. The demo has no model attached; replies are scripted for
      // the recorded sequence and templated otherwise, and say so.
      const scripted = DEMO_STEPS.find((st) => st.message === text)?.reply;
      const reply =
        scripted ??
        `(demo reply, no model connected) This turn was routed to “${res.activePath.join(' / ') || 'the project root'}”. ` +
          `A model would see ${res.context!.tokens.total.toLocaleString()} tokens of working context here: ` +
          `the path, ${res.context!.checkpoint ? 'its checkpoint, ' : ''}${res.context!.recentMessages.length} recent turns in this node, and your message.`;
      const id = `stream-${res.message.id}`;
      setStreaming({ id, nodeId: res.activeNodeId, text: '' });
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
      await s.add({ role: 'assistant', content: reply });
      setStreaming(null);
      sync();
      setBusy(false);
    },
    [busy, sync],
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
      await sleep(900); // let the preview land and be seen
      if (!playingRef.current) return false;
      await send(step.message);
      return true;
    },
    [send, typeOut],
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
    backendName: router.backend.name,
  };
}
