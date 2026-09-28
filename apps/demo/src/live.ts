import type { Router, RouteInput } from '@context-tree/core';
import { HttpJevBackend, JevRouter } from '@context-tree/jev';
import type { ApiStatus } from '../server/api.ts';

export type { ApiStatus };

export interface ApiUsage {
  model: string;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  ttftMs: number;
  totalMs: number;
}

/** Null when there is no dev server (static build) or it cannot be reached. */
export async function fetchStatus(): Promise<ApiStatus | null> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return (await res.json()) as ApiStatus;
  } catch {
    return null;
  }
}

/** Lets the session keep one router while the backend is swapped once status is known. */
export class SwitchableRouter implements Router {
  constructor(public current: Router) {}
  route(input: RouteInput) {
    return this.current.route(input);
  }
}

/**
 * Real Jev through the dev server. If a call fails, the local reference
 * backend decides and the decision's `source` and `fallbackReason` say so.
 */
export function remoteJevRouter(model: string): JevRouter {
  return new JevRouter({
    backend: new HttpJevBackend({ url: '/api/jev', name: model }),
    timeoutMs: 12_000,
    fallback: new JevRouter(),
  });
}

export type ChatEvent = { type: 'delta'; text: string } | ({ type: 'done'; stopReason: string | null; usage: Omit<ApiUsage, 'model' | 'ttftMs' | 'totalMs'> } & Pick<ApiUsage, 'model' | 'ttftMs' | 'totalMs'>) | { type: 'error'; message: string };

export async function* streamChat(body: { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }): AsyncGenerator<ChatEvent> {
  const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    yield { type: 'error', message: `chat failed: ${res.status} ${detail.slice(0, 200)}` };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as ChatEvent;
    }
  }
}
