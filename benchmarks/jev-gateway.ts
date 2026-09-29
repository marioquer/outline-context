/**
 * Real Jev for the opt-in benchmarks: GatewayJevBackend, spaced so a run stays
 * under the gateway's request rate limit (30/min by default).
 */
import type { JevBackend, JevRequest, JevResponse } from '@context-tree/jev';
import { GatewayJevBackend } from '@context-tree/jev/gateway';

/** Spaces calls so the run stays under the gateway's request rate limit. */
export class ThrottledJevBackend implements JevBackend {
  private next = 0;
  readonly name: string;
  /** Gateway usage per completed call; latencyMs is the round trip, excluding the throttle wait. */
  readonly usage: Array<{ inputTokens?: number; outputTokens?: number; latencyMs: number }> = [];
  constructor(
    private readonly inner = new GatewayJevBackend(),
    private readonly minIntervalMs = Number(process.env.JEV_MIN_INTERVAL_MS ?? 2100),
  ) {
    this.name = inner.name;
  }
  async route(req: JevRequest, opts?: { signal?: AbortSignal }): Promise<JevResponse> {
    const wait = this.next - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.next = Date.now() + this.minIntervalMs;
    const out = await this.inner.route(req, opts);
    if (this.inner.lastCall) this.usage.push(this.inner.lastCall);
    return out;
  }
}
