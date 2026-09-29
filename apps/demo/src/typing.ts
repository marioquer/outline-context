/**
 * Paces real Jev calls while the user types.
 *
 * The gateway rate-limits by request (30/min in jev-mdr's account) and a call
 * takes ~0.4–0.6 s, so Jev cannot run per keystroke. The pacer keeps at most
 * one call in flight, spaces calls at least `minIntervalMs` apart, and always
 * sends the latest text: intermediate drafts typed while a call is in flight
 * or during the cool-down are skipped, never queued.
 *
 * The demo pairs it with an instant local guess at every word boundary, so
 * the UI still reacts after one or two words; Jev's answer replaces the guess
 * when it arrives.
 */
export class JevPacer {
  private inFlight = false;
  private lastCallAt = Number.NEGATIVE_INFINITY;
  private lastText = '';
  private latest = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly calls: number[] = [];

  constructor(
    private readonly opts: {
      minIntervalMs: number;
      call: (text: string) => Promise<void>;
      now?: () => number;
    },
  ) {}

  /** Offer the latest draft (at a word boundary or after a short idle). */
  request(text: string) {
    this.latest = text;
    this.pump();
  }

  /** Forget the draft (it was sent or cleared). An in-flight call finishes but triggers nothing new. */
  reset() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.latest = '';
    this.lastText = '';
  }

  /** Calls started in the last 60 s. */
  callsInLastMinute(): number {
    const cutoff = this.now() - 60_000;
    while (this.calls.length && this.calls[0]! < cutoff) this.calls.shift();
    return this.calls.length;
  }

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private pump = () => {
    const text = this.latest;
    if (!text || this.inFlight || text === this.lastText) return;
    const wait = this.lastCallAt + this.opts.minIntervalMs - this.now();
    if (wait > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(this.pump, wait);
      return;
    }
    this.inFlight = true;
    this.lastCallAt = this.now();
    this.lastText = text;
    this.calls.push(this.lastCallAt);
    this.opts
      .call(text)
      .catch(() => undefined)
      .finally(() => {
        this.inFlight = false;
        this.pump();
      });
  };
}

/** A draft ending in whitespace or punctuation just completed a word. */
export function atWordBoundary(draft: string): boolean {
  return /[\s.,;:!?—–-]$/.test(draft);
}
