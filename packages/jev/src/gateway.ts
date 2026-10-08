/**
 * Real Jev: `typesafe-ai/jev` on the Vercel AI Gateway, called the way Jev is
 * meant to be called, as an evaluation model. One shared state, typed
 * `choice` questions, and a full probability distribution per answer.
 *
 * Server-side only: it reads AI_GATEWAY_API_KEY. Import it from
 * `@context-tree/jev/gateway` so browser bundles never pull in the AI SDK.
 *
 *   const router = new JevRouter({ backend: new GatewayJevBackend() });
 */
import { experimental_evaluate as evaluate } from 'ai';
import type { JevBackend, JevRequest, JevResponse } from './protocol.ts';

export const DEFAULT_JEV_MODEL = 'typesafe-ai/jev';
const NEW = 'NEW';

type Evaluate = typeof evaluate;

/**
 * Route question wording. `v1` (default) asks for the context a message is
 * about, so a new question under an existing topic tends to go to that topic.
 * `v2` asks for NEW whenever the message opens a question no context covers yet.
 */
export type RoutePrompt = 'v1' | 'v2';

const ROUTE_PROMPTS: Record<RoutePrompt, { instructions: string; fork: string }> = {
  v1: {
    instructions:
      'Which working context does new_message belong to? Choose the context it continues, returns to, or is about. ' +
      'Prefer the current context for follow-ups. Choose NEW only for a durable new working context, not for a small change of wording or angle.',
    fork: 'A new durable working context: the message starts its own goal or decision thread that none of the listed contexts covers, and it is likely to be returned to later.',
  },
  v2: {
    instructions:
      'Which working context does new_message belong to? Choose an existing context only if new_message continues or returns to a question, task or decision already discussed there. ' +
      'Prefer the current context for follow-ups and rewordings. If new_message opens a new specific question, task or decision that no listed context has discussed yet, choose NEW, ' +
      'even when it falls under one of their broad topics: it will be placed under that topic.',
    fork: 'A new working context: new_message opens a specific question, task or decision that none of the listed contexts has discussed yet, even if it belongs under one of them.',
  },
};

export interface GatewayJevBackendOptions {
  /** Default: JEV_MODEL env var, else `typesafe-ai/jev`. */
  model?: string;
  /** Retries for transient gateway failures. Default 1. */
  maxRetries?: number;
  /** Route question wording. Default: JEV_ROUTE_PROMPT env var, else `v1`. */
  routePrompt?: RoutePrompt;
  /** Injectable for tests. */
  evaluate?: Evaluate;
}

export function routePromptFromEnv(): RoutePrompt {
  return process.env.JEV_ROUTE_PROMPT === 'v2' ? 'v2' : 'v1';
}

/** Used only when Jev returns a bare choice without a distribution. */
const CHOICE_ONLY_CONFIDENCE = 0.88;

export class GatewayJevBackend implements JevBackend {
  readonly name: string;
  readonly model: string;
  /** Token usage and latency of the most recent call, for instrumentation. */
  lastCall: { inputTokens?: number; outputTokens?: number; latencyMs: number } | null = null;
  private readonly maxRetries: number;
  private readonly evaluateFn: Evaluate;
  readonly routePrompt: RoutePrompt;

  constructor(opts: GatewayJevBackendOptions = {}) {
    this.routePrompt = opts.routePrompt ?? routePromptFromEnv();
    this.model = opts.model ?? (process.env.JEV_MODEL?.trim() || DEFAULT_JEV_MODEL);
    this.name = this.model;
    this.maxRetries = opts.maxRetries ?? 1;
    this.evaluateFn = opts.evaluate ?? evaluate;
  }

  /**
   * Candidates get short positional keys (c0, c1, …): node ids are noise to
   * the model and cost tokens in the state and in every option.
   */
  static buildCall(req: JevRequest, prompt: RoutePrompt = 'v1') {
    const wording = ROUTE_PROMPTS[prompt];
    const keys = req.candidates.map((_, i) => `c${i}`);
    const label = (i: number) => {
      const c = req.candidates[i]!;
      return `${c.path.join(' / ')}${c.relation === 'current' ? ' (current context)' : ''}`;
    };

    const contexts: Record<string, { path: string; relation: string; summary: string; recent_user_turns: string[] }> = {};
    req.candidates.forEach((c, i) => {
      contexts[keys[i]!] = { path: c.path.join(' / '), relation: c.relation, summary: c.summary, recent_user_turns: c.recent };
    });
    const state = {
      new_message: req.message,
      current_context: req.activePath.join(' / ') || '(none)',
      contexts,
    };

    const routeCriteria: Record<string, string> = {};
    keys.forEach((k, i) => (routeCriteria[k] = label(i)));
    if (req.allowFork) {
      routeCriteria[NEW] = wording.fork;
    }

    const questions: Record<string, { type: 'choice'; instructions: string; criteria: Record<string, string> }> = {
      route: {
        type: 'choice',
        instructions: wording.instructions,
        criteria: routeCriteria,
      },
    };

    const parentKeys = keys.filter((_, i) => req.candidates[i]!.depth < req.maxDepth);
    if (req.allowFork && parentKeys.length > 0) {
      const parentCriteria: Record<string, string> = {};
      for (const k of parentKeys) parentCriteria[k] = label(keys.indexOf(k));
      questions.parent = {
        type: 'choice',
        instructions:
          'If new_message started a new working context, which existing context would it sit under? ' +
          'Choose the most specific context it is part of; choose the top-level project if it is unrelated to all of them.',
        criteria: parentCriteria,
      };
    }
    return { keys, state, questions };
  }

  async route(req: JevRequest, { signal }: { signal?: AbortSignal } = {}): Promise<JevResponse> {
    const { keys, state, questions } = GatewayJevBackend.buildCall(req, this.routePrompt);
    const started = performance.now();
    const result = await this.evaluateFn({
      model: this.model,
      state,
      questions,
      maxRetries: this.maxRetries,
      ...(signal ? { abortSignal: signal } : {}),
    });
    const answers = result.answers as Record<string, { choice: string; probabilities?: Record<string, number> } | undefined>;
    this.lastCall = {
      ...(result.usage?.inputTokens != null ? { inputTokens: result.usage.inputTokens } : {}),
      ...(result.usage?.outputTokens != null ? { outputTokens: result.usage.outputTokens } : {}),
      latencyMs: Math.round(performance.now() - started),
    };

    const route = answers.route;
    if (!route) throw new Error('jev: missing answer for "route"');
    const options = Object.keys(questions.route!.criteria);
    const dist = distribution(route, options);

    const scores = keys.map((k, i) => ({ id: req.candidates[i]!.id, p: dist[k] ?? 0 }));
    const parentAnswer = answers.parent;
    const parentKey = parentAnswer ? parentAnswer.choice : undefined;
    const parentIdx = parentKey ? keys.indexOf(parentKey) : -1;

    return {
      scores,
      ...(req.allowFork
        ? { fork: { p: dist[NEW] ?? 0, ...(parentIdx >= 0 ? { parentId: req.candidates[parentIdx]!.id } : {}) } }
        : {}),
      model: this.model,
    };
  }
}

/**
 * Use Jev's distribution as given. If it only commits to a choice, put most
 * of the mass there and spread the rest evenly instead of inventing numbers.
 */
export function distribution(answer: { choice: string; probabilities?: Record<string, number> }, options: string[]): Record<string, number> {
  if (answer.probabilities) {
    const raw = Object.fromEntries(options.map((o) => [o, Math.max(0, Number(answer.probabilities![o] ?? 0))]));
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    if (total > 0) return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / total]));
  }
  if (!options.includes(answer.choice)) throw new Error(`jev: unexpected choice ${JSON.stringify(answer.choice)}`);
  const rest = options.length > 1 ? (1 - CHOICE_ONLY_CONFIDENCE) / (options.length - 1) : 0;
  return Object.fromEntries(options.map((o) => [o, o === answer.choice ? (options.length > 1 ? CHOICE_ONLY_CONFIDENCE : 1) : rest]));
}

/** True when a gateway key is configured and the local backend is not forced. */
export function gatewayConfigured(
  env: { AI_GATEWAY_API_KEY?: string | undefined; JEV_FORCE_LOCAL?: string | undefined } = process.env,
): boolean {
  return Boolean(env.AI_GATEWAY_API_KEY?.trim()) && env.JEV_FORCE_LOCAL !== 'true';
}
