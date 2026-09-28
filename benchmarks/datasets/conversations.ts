/**
 * Seeded generator for long multi-topic conversations (Benchmarks A–D).
 *
 * Each topic is a fictional project with facts that deliberately collide
 * across projects (every project has a database, a region, an owner…). A
 * conversation is a list of segments; each segment is a run of turns about
 * one topic. Facts are stated in plain sentences by the user; filler turns
 * discuss the topic without restating any facts.
 */

export interface Topic {
  key: string;
  name: string;
  domain: string;
  facts: Record<FactSlot, string>;
  vocab: string[];
}

export type FactSlot = 'database' | 'region' | 'owner' | 'deadline' | 'queue';

export const SLOT_QUESTION: Record<FactSlot, string> = {
  database: 'Which database did we decide on?',
  region: 'Which cloud region are we deploying to?',
  owner: 'Who owns this project?',
  deadline: 'What is the launch deadline?',
  queue: 'Which message queue did we pick?',
};

export const TOPICS: Topic[] = [
  {
    key: 'atlas',
    name: 'Atlas',
    domain: 'billing service',
    facts: { database: 'PostgreSQL', region: 'eu-west-1', owner: 'Priya', deadline: 'March 14', queue: 'SQS' },
    vocab: ['invoices', 'proration', 'tax rules', 'refunds', 'dunning emails', 'ledger entries', 'currency rounding'],
  },
  {
    key: 'borealis',
    name: 'Borealis',
    domain: 'analytics pipeline',
    facts: { database: 'DynamoDB', region: 'us-east-2', owner: 'Tomás', deadline: 'April 2', queue: 'Kafka' },
    vocab: ['event schemas', 'backfills', 'late-arriving data', 'dashboards', 'sampling', 'partitioning', 'retention windows'],
  },
  {
    key: 'cedar',
    name: 'Cedar',
    domain: 'mobile offline sync',
    facts: { database: 'SQLite', region: 'ap-southeast-1', owner: 'Hana', deadline: 'May 20', queue: 'NATS' },
    vocab: ['conflict resolution', 'sync cursors', 'battery usage', 'delta payloads', 'schema migrations on device', 'retry backoff'],
  },
  {
    key: 'delta',
    name: 'Delta',
    domain: 'search relevance project',
    facts: { database: 'Elasticsearch', region: 'us-west-2', owner: 'Omar', deadline: 'June 9', queue: 'RabbitMQ' },
    vocab: ['ranking features', 'query rewriting', 'synonyms', 'click models', 'relevance judgments', 'index refresh'],
  },
  {
    key: 'ember',
    name: 'Ember',
    domain: 'notification platform',
    facts: { database: 'MongoDB', region: 'eu-central-1', owner: 'Grace', deadline: 'July 1', queue: 'Redis Streams' },
    vocab: ['push tokens', 'digest emails', 'quiet hours', 'template rendering', 'delivery receipts', 'rate limits'],
  },
  {
    key: 'fjord',
    name: 'Fjord',
    domain: 'internal admin console',
    facts: { database: 'MySQL', region: 'ca-central-1', owner: 'Luis', deadline: 'August 18', queue: 'Pub/Sub' },
    vocab: ['role permissions', 'audit logs', 'bulk edits', 'feature flags', 'impersonation', 'CSV exports'],
  },
  {
    key: 'glacier',
    name: 'Glacier',
    domain: 'data archival job',
    facts: { database: 'CockroachDB', region: 'eu-north-1', owner: 'Mei', deadline: 'September 5', queue: 'Kinesis' },
    vocab: ['cold storage tiers', 'restore drills', 'checksums', 'lifecycle policies', 'legal holds', 'compression'],
  },
  {
    key: 'harbor',
    name: 'Harbor',
    domain: 'partner API gateway',
    facts: { database: 'Cassandra', region: 'sa-east-1', owner: 'Kofi', deadline: 'October 12', queue: 'ActiveMQ' },
    vocab: ['API keys', 'webhook signing', 'quota tiers', 'sandbox environments', 'versioning', 'error envelopes'],
  },
];

export function topic(key: string): Topic {
  const t = TOPICS.find((x) => x.key === key);
  if (!t) throw new Error(`unknown topic ${key}`);
  return t;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /** Ground-truth topic key. Never shown to a strategy. */
  topic: string;
}

const OPENERS = [
  (t: Topic) => `Let's start on Project ${t.name}, the ${t.domain}.`,
  (t: Topic) => `New topic: Project ${t.name}, our ${t.domain}.`,
  (t: Topic) => `Separately, I want to plan Project ${t.name} — the ${t.domain}.`,
  (t: Topic) => `Let's open a thread for Project ${t.name}, which is the ${t.domain}.`,
];

const RETURNS = [
  (t: Topic) => `Back to Project ${t.name}.`,
  (t: Topic) => `Going back to ${t.name} for a moment.`,
  (t: Topic) => `Returning to the ${t.name} ${t.domain}.`,
];

const FACT_LINES: Record<FactSlot, (t: Topic) => string> = {
  database: (t) => `For ${t.name} we decided the database is ${t.facts.database}.`,
  region: (t) => `${t.name} will deploy to the ${t.facts.region} region.`,
  owner: (t) => `${t.facts.owner} owns ${t.name} end to end.`,
  deadline: (t) => `The ${t.name} launch deadline is ${t.facts.deadline}.`,
  queue: (t) => `We picked ${t.facts.queue} as the message queue for ${t.name}.`,
};

const USER_FILLER = [
  (t: Topic, v: string) => `How should the ${t.domain} handle ${v}?`,
  (t: Topic, v: string) => `What are the risks around ${v} for ${t.name}?`,
  (_t: Topic, v: string) => `Can you sketch a rollout plan for ${v}?`,
  (_t: Topic, v: string) => `What would you test first for ${v}?`,
  (t: Topic, v: string) => `Is ${v} going to be a problem at ${t.name}'s scale?`,
  (_t: Topic, v: string) => `What metrics should we watch for ${v}?`,
];

const ASSISTANT_SENTENCES = [
  (v: string) => `The main thing with ${v} is to make the behaviour explicit instead of relying on defaults.`,
  (v: string) => `I would start with a small, reversible change to ${v} and measure it before widening the rollout.`,
  (v: string) => `Write down the failure modes for ${v} first; most incidents come from the cases nobody listed.`,
  (_v: string) => 'Keep the first version boring: one code path, clear logging, and a manual override.',
  (_v: string) => 'Add a dashboard panel for error rate and latency so regressions show up within a day.',
  (v: string) => `For ${v}, a feature flag lets you compare the old and new behaviour on real traffic.`,
  (_v: string) => 'Document the decision and the alternatives you rejected so the next person does not relitigate it.',
  (v: string) => `Load-test ${v} at twice the expected peak, then fix whatever breaks first.`,
  (_v: string) => 'Assign one owner for the migration and one reviewer, and keep the change set small.',
  (v: string) => `If ${v} touches customer-visible data, add an audit trail from day one.`,
];

function assistantReply(r: () => number, v: string, sentences: number): string {
  const out: string[] = [];
  for (let i = 0; i < sentences; i++) out.push(ASSISTANT_SENTENCES[Math.floor(r() * ASSISTANT_SENTENCES.length)]!(v));
  return out.join(' ');
}

export interface SegmentSpec {
  topic: string;
  /** Filler exchanges (user + assistant) in this segment. */
  filler: number;
  /** Facts stated at the start of this segment. */
  facts?: FactSlot[];
  /** How the segment starts: a new-topic opener or a return phrase. Default: opener on first visit, return after. */
  start?: 'open' | 'return' | 'none';
}

export interface GeneratedConversation {
  turns: Turn[];
  /** Topic keys in the order of first appearance. */
  topics: string[];
}

/**
 * Build a conversation from segment specs. Assistant replies are `sentences`
 * sentences long; raise it to make each turn heavier.
 */
export function generate(segments: SegmentSpec[], opts: { seed?: number; sentences?: number } = {}): GeneratedConversation {
  const r = rng(opts.seed ?? 7);
  const sentences = opts.sentences ?? 5;
  const turns: Turn[] = [];
  const seen: string[] = [];
  const ack = (t: Topic) => `Noted for ${t.name}. I will keep that fixed unless you change it.`;

  for (const seg of segments) {
    const t = topic(seg.topic);
    const first = !seen.includes(seg.topic);
    const start = seg.start ?? (first ? 'open' : 'return');
    if (first) seen.push(seg.topic);

    if (start !== 'none') {
      const phrase =
        start === 'open'
          ? OPENERS[Math.floor(r() * OPENERS.length)]!(t)
          : RETURNS[Math.floor(r() * RETURNS.length)]!(t);
      const fact = seg.facts?.length ? ` ${seg.facts.map((f) => FACT_LINES[f](t)).join(' ')}` : '';
      turns.push({ role: 'user', content: phrase + fact, topic: t.key });
      turns.push({
        role: 'assistant',
        content: fact ? ack(t) : assistantReply(r, t.vocab[0]!, 2),
        topic: t.key,
      });
    } else if (seg.facts?.length) {
      turns.push({ role: 'user', content: seg.facts.map((f) => FACT_LINES[f](t)).join(' '), topic: t.key });
      turns.push({ role: 'assistant', content: ack(t), topic: t.key });
    }

    for (let i = 0; i < seg.filler; i++) {
      const v = t.vocab[Math.floor(r() * t.vocab.length)]!;
      const q = USER_FILLER[Math.floor(r() * USER_FILLER.length)]!(t, v);
      turns.push({ role: 'user', content: q, topic: t.key });
      turns.push({ role: 'assistant', content: assistantReply(r, v, sentences), topic: t.key });
    }
  }
  return { turns, topics: seen };
}
