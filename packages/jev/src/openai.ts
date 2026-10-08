/**
 * OpenAI's Decisions API (`POST /v1/decisions`, public beta) as a Jev backend.
 * It asks the same `route` and `parent` choice questions as GatewayJevBackend,
 * with the same wording, so the two can be compared on equal terms.
 *
 * Server-side only: it reads OPENAI_API_KEY. Import it from
 * `@context-tree/jev/openai`.
 *
 *   const router = new JevRouter({ backend: new OpenAIDecisionsBackend() });
 */
import { GatewayJevBackend, distribution, routePromptFromEnv, type RoutePrompt } from './gateway.ts';
import type { JevBackend, JevRequest, JevResponse } from './protocol.ts';

export const DEFAULT_DECISIONS_MODEL = 'gpt-6-luna';
const NEW = 'NEW';

export interface OpenAIDecisionsBackendOptions {
  /** Default: OPENAI_DECISIONS_MODEL env var, else `gpt-6-luna`. */
  model?: string;
  /** Default: OPENAI_API_KEY env var. */
  apiKey?: string;
  /** Default: OPENAI_BASE_URL env var, else `https://api.openai.com/v1`. */
  baseUrl?: string;
  /** Route question wording. Default: JEV_ROUTE_PROMPT env var, else `v1`. */
  routePrompt?: RoutePrompt;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

type DecisionAnswer =
  | { type: 'choice'; name: string; choice: string; probabilities?: Array<{ value: string; probability: number }>; confidence?: number }
  | { type: 'refusal'; name: string }
  | { type: string; name: string };

export class OpenAIDecisionsBackend implements JevBackend {
  readonly name: string;
  readonly model: string;
  /** Token usage and latency of the most recent call, for instrumentation. */
  lastCall: { inputTokens?: number; outputTokens?: number; latencyMs: number } | null = null;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  readonly routePrompt: RoutePrompt;

  constructor(opts: OpenAIDecisionsBackendOptions = {}) {
    this.routePrompt = opts.routePrompt ?? routePromptFromEnv();
    this.model = opts.model ?? (process.env.OPENAI_DECISIONS_MODEL?.trim() || DEFAULT_DECISIONS_MODEL);
    this.name = `openai/${this.model} (decisions)`;
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY?.trim() ?? '';
    this.baseUrl = (opts.baseUrl ?? (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1')).replace(/\/$/, '');
    this.fetchFn = opts.fetch ?? fetch;
  }

  /** The Jev call, reshaped: state becomes the text input, criteria become choices. */
  static buildBody(req: JevRequest, model: string, prompt: RoutePrompt = 'v1') {
    const { keys, state, questions } = GatewayJevBackend.buildCall(req, prompt);
    return {
      keys,
      body: {
        model,
        input: JSON.stringify(state),
        questions: Object.entries(questions).map(([name, q]) => ({
          type: 'choice' as const,
          name,
          instructions: q.instructions,
          choices: Object.entries(q.criteria).map(([value, description]) => ({ value, description })),
        })),
      },
    };
  }

  async route(req: JevRequest, { signal }: { signal?: AbortSignal } = {}): Promise<JevResponse> {
    if (!this.apiKey) throw new Error('openai decisions: OPENAI_API_KEY is not set');
    const { keys, body } = OpenAIDecisionsBackend.buildBody(req, this.model, this.routePrompt);
    const started = performance.now();
    const res = await this.fetchFn(`${this.baseUrl}/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new Error(`openai decisions: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { answers?: DecisionAnswer[]; usage?: { input_tokens?: number; output_tokens?: number } };
    this.lastCall = {
      ...(json.usage?.input_tokens != null ? { inputTokens: json.usage.input_tokens } : {}),
      ...(json.usage?.output_tokens != null ? { outputTokens: json.usage.output_tokens } : {}),
      latencyMs: Math.round(performance.now() - started),
    };

    const byName = new Map((json.answers ?? []).map((a) => [a.name, a]));
    const answer = (name: string) => {
      const a = byName.get(name);
      if (!a) return undefined;
      if (a.type === 'refusal') throw new Error(`openai decisions: refused "${name}"`);
      if (a.type !== 'choice') throw new Error(`openai decisions: unexpected ${a.type} answer for "${name}"`);
      const c = a as Extract<DecisionAnswer, { type: 'choice' }>;
      return {
        choice: c.choice,
        ...(c.probabilities ? { probabilities: Object.fromEntries(c.probabilities.map((p) => [p.value, p.probability])) } : {}),
      };
    };

    const route = answer('route');
    if (!route) throw new Error('openai decisions: missing answer for "route"');
    const options = body.questions.find((q) => q.name === 'route')!.choices.map((c) => c.value);
    const dist = distribution(route, options);
    const scores = keys.map((k, i) => ({ id: req.candidates[i]!.id, p: dist[k] ?? 0 }));
    const parentIdx = keys.indexOf(answer('parent')?.choice ?? '');

    return {
      scores,
      ...(req.allowFork
        ? { fork: { p: dist[NEW] ?? 0, ...(parentIdx >= 0 ? { parentId: req.candidates[parentIdx]!.id } : {}) } }
        : {}),
      model: this.name,
    };
  }
}

/** True when an OpenAI key is configured. */
export function openaiConfigured(env: { OPENAI_API_KEY?: string | undefined } = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}
