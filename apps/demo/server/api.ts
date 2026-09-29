/**
 * Server-side routes for the demo, mounted into the Vite dev server (see
 * vite.config.ts). Keys stay here and never reach the browser.
 *
 *   GET  /api/status   which engines are live
 *   POST /api/jev      JevRequest → JevResponse via typesafe-ai/jev
 *   POST /api/chat     { system, messages } → NDJSON stream of Claude output
 *
 * Without keys the demo runs fully client-side: local Jev backend and
 * scripted replies. The header always says which engine is in use.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import type { JevRequest } from '@context-tree/jev';
import { DEFAULT_JEV_MODEL, GatewayJevBackend, gatewayConfigured } from '@context-tree/jev/gateway';

export interface ApiEnv {
  AI_GATEWAY_API_KEY?: string;
  JEV_MODEL?: string;
  JEV_FORCE_LOCAL?: string;
  /** Gateway requests per minute for Jev. Default 30 (jev-mdr's measured limit). */
  JEV_RATE_LIMIT?: string;
  ANTHROPIC_API_KEY?: string;
  DEMO_MODEL?: string;
  DEMO_EFFORT?: string;
}

export const DEFAULT_DEMO_MODEL = 'claude-opus-5';
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ApiStatus {
  jev: { engine: 'jev'; model: string; ratePerMinute: number } | { engine: 'local'; reason: string };
  llm: { engine: 'claude'; model: string; effort: Effort } | { engine: 'scripted'; reason: string };
}

export function status(env: ApiEnv): ApiStatus {
  const jevModel = env.JEV_MODEL?.trim() || DEFAULT_JEV_MODEL;
  return {
    jev: gatewayConfigured(env)
      ? { engine: 'jev', model: jevModel, ratePerMinute: Math.max(1, Number(env.JEV_RATE_LIMIT) || 30) }
      : { engine: 'local', reason: env.AI_GATEWAY_API_KEY ? 'JEV_FORCE_LOCAL=true' : 'no AI_GATEWAY_API_KEY' },
    llm: env.ANTHROPIC_API_KEY?.trim()
      ? { engine: 'claude', model: env.DEMO_MODEL?.trim() || DEFAULT_DEMO_MODEL, effort: effortOf(env) }
      : { engine: 'scripted', reason: 'no ANTHROPIC_API_KEY' },
  };
}

function effortOf(env: ApiEnv): Effort {
  const e = env.DEMO_EFFORT?.trim();
  return e === 'low' || e === 'medium' || e === 'high' || e === 'xhigh' || e === 'max' ? e : 'low';
}

let jev: GatewayJevBackend | null = null;
let claude: Anthropic | null = null;

export async function handle(req: IncomingMessage, res: ServerResponse, env: ApiEnv): Promise<boolean> {
  const url = (req.url ?? '').split('?')[0];
  try {
    if (url === '/api/status' && req.method === 'GET') {
      json(res, 200, status(env));
      return true;
    }
    if (url === '/api/jev' && req.method === 'POST') {
      if (!gatewayConfigured(env)) return json(res, 503, { error: 'Jev is not configured (AI_GATEWAY_API_KEY)' }), true;
      jev ??= new GatewayJevBackend({ model: env.JEV_MODEL?.trim() || DEFAULT_JEV_MODEL });
      const body = (await readJson(req)) as JevRequest;
      const out = await jev.route(body, { signal: AbortSignal.timeout(12_000) });
      res.setHeader('x-jev-latency-ms', String(jev.lastCall?.latencyMs ?? ''));
      json(res, 200, out);
      return true;
    }
    if (url === '/api/chat' && req.method === 'POST') {
      await chat(req, res, env);
      return true;
    }
  } catch (err) {
    if (!res.headersSent) json(res, 502, { error: err instanceof Error ? err.message : String(err) });
    else res.end(`${JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : String(err) })}\n`);
    return true;
  }
  return false;
}

async function chat(req: IncomingMessage, res: ServerResponse, env: ApiEnv) {
  const s = status(env).llm;
  if (s.engine !== 'claude') return json(res, 503, { error: 'Live replies are not configured (ANTHROPIC_API_KEY)' });
  claude ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const body = (await readJson(req)) as { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> };

  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' });
  const t0 = performance.now();
  let ttft = 0;
  // The working context's stable prefix is the system prompt: cache it
  // explicitly, and let automatic caching cover the append-only delta.
  const stream = claude.beta.messages.stream({
    model: s.model,
    max_tokens: 2048,
    system: [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }],
    messages: body.messages,
    cache_control: { type: 'ephemeral' },
    output_config: { effort: s.effort },
    // Server-side refusal fallback: if the model declines, the API reruns the
    // request on a fallback model inside the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      if (!ttft) ttft = performance.now() - t0;
      res.write(`${JSON.stringify({ type: 'delta', text: event.delta.text })}\n`);
    }
  }
  const msg = await stream.finalMessage();
  res.end(
    `${JSON.stringify({
      type: 'done',
      model: msg.model,
      stopReason: msg.stop_reason,
      usage: {
        input: msg.usage.input_tokens,
        cacheRead: msg.usage.cache_read_input_tokens ?? 0,
        cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
        output: msg.usage.output_tokens,
      },
      ttftMs: Math.round(ttft),
      totalMs: Math.round(performance.now() - t0),
    })}\n`,
  );
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
