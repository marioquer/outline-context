import { useEffect, useState } from 'react';
import { MoonIcon, PauseIcon, PlayIcon, RotateCcwIcon, SkipForwardIcon, SunIcon } from 'lucide-react';
import { useContextTreeDemo } from './engine.ts';
import { ContextChat, Composer, Inspector, LinearChat } from './components.tsx';

const params = new URLSearchParams(window.location.search);
const demoMode = params.get('demo') === 'true';
const liveInDemo = params.get('live') === 'true';

export function App() {
  const s = useContextTreeDemo(demoMode, liveInDemo);
  const { demo } = s;
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('ct-theme', dark ? 'dark' : 'light');
    } catch {
      /* private mode */
    }
  }, [dark]);

  // Recording shortcuts: → next step, Space play/pause (outside the composer).
  useEffect(() => {
    if (!demoMode) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.target as HTMLElement | null)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' && !demo.playing && !s.busy) demo.play(1);
      if (e.key === ' ') {
        e.preventDefault();
        if (demo.playing) demo.stop();
        else demo.play();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [demo, s.busy]);

  const next = demo.steps[demo.stepIndex];
  const finished = demo.stepIndex >= demo.steps.length;

  return (
    <div className="app">
      <header className="hdr">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 2.5v11M4 5.5h5M4 11h5" />
              <circle cx="11.5" cy="5.5" r="1.6" />
              <circle cx="11.5" cy="11" r="1.6" />
            </svg>
          </div>
          <span className="brand-name">Context Tree</span>
          <span className="brand-tag">
            <b>STAY</b>·<b>SWITCH</b>·<b>FORK</b>
          </span>
        </div>
        <div className="hdr-spacer" />
        <span className="engine-chip" data-live={s.live?.jev.engine === 'jev'} title={s.live?.jev.engine === 'local' ? s.live.jev.reason : undefined}>
          {s.live?.jev.engine === 'jev' ? `JEV · ${s.live.jev.model}` : 'JEV · LOCAL'}
        </span>
        <span className="engine-chip" data-live={s.liveReplies} title={s.live?.llm.engine === 'scripted' ? s.live.llm.reason : undefined}>
          {s.liveReplies && s.live?.llm.engine === 'claude' ? `LLM · ${s.live.llm.model}` : 'LLM · SCRIPTED'}
        </span>
        {demoMode ? (
          <>
            <span className="demo-step-label">
              {finished ? 'demo complete' : `next ${demo.stepIndex + 1}/${demo.steps.length} · ${next?.label}`}
            </span>
            {demo.playing ? (
              <button className="hdr-btn primary" onClick={demo.stop}>
                <PauseIcon size={12} /> Pause
              </button>
            ) : (
              <button className="hdr-btn primary" onClick={() => demo.play()} disabled={finished || s.busy}>
                <PlayIcon size={12} /> Play demo
              </button>
            )}
            <button className="hdr-btn" onClick={() => demo.play(1)} disabled={finished || demo.playing || s.busy} title="Next step (→)">
              <SkipForwardIcon size={12} /> Step
            </button>
            <button className="hdr-btn icon" onClick={demo.reset} title="Reset" aria-label="Reset demo">
              <RotateCcwIcon size={13} />
            </button>
          </>
        ) : (
          <a className="hdr-btn" href="?demo=true">
            <PlayIcon size={12} /> Load demo
          </a>
        )}
        <button className="hdr-btn icon" onClick={() => setDark((d) => !d)} aria-label="Toggle theme">
          {dark ? <SunIcon size={13} /> : <MoonIcon size={13} />}
        </button>
      </header>

      <main className="panels">
        <LinearChat transcript={s.transcript} earlierCount={s.earlierCount} streaming={s.streaming} />
        <ContextChat
          tree={s.tree}
          transcript={s.transcript}
          earlierCount={s.earlierCount}
          decisions={s.decisions}
          streaming={s.streaming}
          committedNodeId={s.tree.activeNodeId}
        />
        <Inspector tree={s.tree} committed={s.committed} preview={s.preview} newNodeId={s.newNodeId} />
      </main>

      <Composer
        tree={s.tree}
        draft={s.draft}
        setDraft={s.setDraft}
        preview={s.preview}
        busy={s.busy}
        readOnly={demo.playing}
        onSend={s.send}
      />
    </div>
  );
}
