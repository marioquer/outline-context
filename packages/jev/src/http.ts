import type { JevBackend, JevRequest, JevResponse } from './protocol.ts';

export interface HttpJevBackendOptions {
  /** Endpoint that accepts a JevRequest as JSON and returns a JevResponse. */
  url: string;
  apiKey?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  name?: string;
}

/** Calls a hosted Jev model over HTTP. Timeouts are enforced by JevRouter. */
export class HttpJevBackend implements JevBackend {
  readonly name: string;
  private readonly opts: HttpJevBackendOptions;

  constructor(opts: HttpJevBackendOptions) {
    this.opts = opts;
    this.name = opts.name ?? 'http';
  }

  async route(request: JevRequest, { signal }: { signal?: AbortSignal } = {}): Promise<JevResponse> {
    const doFetch = this.opts.fetch ?? fetch;
    const res = await doFetch(this.opts.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.opts.apiKey ? { authorization: `Bearer ${this.opts.apiKey}` } : {}),
        ...this.opts.headers,
      },
      body: JSON.stringify(request),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new Error(`Jev HTTP ${res.status}`);
    const body = (await res.json()) as Partial<JevResponse>;
    if (!Array.isArray(body.scores)) throw new Error('Jev response missing `scores`');
    return body as JevResponse;
  }
}
