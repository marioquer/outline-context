import { TableTitler, createContextTree, type ContextTreeSession, type Router } from '@context-tree/core';

/**
 * The known tree and conversation used by `?demo=true`. Everything the demo
 * displays (tokens, scores, latency) is computed live from this data.
 */

export const DEMO_SYSTEM =
  'You are the assistant inside Outline AI, helping plan the product, its open-source router and its launch. ' +
  'The active context below is your memory of this topic: build on its decisions and do not contradict them. ' +
  'Where it is silent, use your own judgment and give a clear recommendation. Answer in two or three sentences.';

interface SeedNode {
  id: string;
  title: string;
  parentId: string | null;
  description: string;
  summary?: string;
}

const NODES: SeedNode[] = [
  {
    id: 'product',
    title: 'Product',
    parentId: 'root',
    description: 'Product strategy for Outline AI: who it is for, what it does, plans and customers.',
  },
  {
    id: 'pricing',
    title: 'Pricing',
    parentId: 'product',
    description: 'Pricing tiers and plans: Free vs Pro, monthly price, subscription cost, what each plan includes.',
  },
  {
    id: 'positioning',
    title: 'Positioning',
    parentId: 'product',
    description: 'Messaging, audience, tagline, competitors, and how we describe the product.',
  },
  {
    id: 'oss',
    title: 'OSS',
    parentId: 'root',
    description: 'The open-source Context Tree repository that ships alongside the product.',
  },
  {
    id: 'architecture',
    title: 'Architecture',
    parentId: 'oss',
    description: 'Jev router design, candidate builder, embeddings and retrieval, core package API, working context.',
  },
  {
    id: 'benchmark',
    title: 'Benchmark',
    parentId: 'oss',
    description: 'Benchmark harness and datasets: measure recall, collisions, tokens, latency and cost against baselines.',
  },
  {
    id: 'launch',
    title: 'Launch',
    parentId: 'root',
    description: 'Launch plan on X / Twitter: demo video, GitHub README, stars, announcement thread.',
  },
];

/** Earlier history, recorded (not routed) into the seeded nodes in this order. */
const HISTORY: Array<[nodeId: string, user: string, assistant: string]> = [
  [
    'positioning',
    'How do we describe Outline AI in one line?',
    'Try: "Chat that organizes itself into an outline." It names the pain (long, tangled chats) and the outcome (a navigable structure) without jargon. Avoid "AI workspace"; every competitor already says it. For the landing page, pair the line with a before/after: a wall of messages on the left, the same conversation as a tree on the right.',
  ],
  [
    'pricing',
    'What should the free tier include?',
    'Keep Free generous enough that people feel the outline working: unlimited sections, up to 3 conversations, and Haiku only. Pro unlocks Sonnet and Opus, unlimited conversations, and section summaries. Decision so far: Free = 3 conversations with Haiku; Pro = all models + summaries. The paywall sits on model quality and volume, not on the core structure.',
  ],
  [
    'architecture',
    'What does the core package own, and what belongs in the Jev adapter?',
    'Core owns the tree, the active pointer, the candidate builder and router interfaces, working-context construction, checkpoints and serialization. It knows nothing about React, providers or Jev. The Jev package converts candidates into a Jev request and turns scores into STAY / SWITCH / FORK. That split keeps the core usable with any router, including a plain mock in tests.',
  ],
  [
    'benchmark',
    'Which baselines do we compare Context Tree against?',
    'Four strategies with the same model, prompt, temperature and questions: a recent window of the last N turns, full history, vector retrieval over past turns, and Context Tree + Jev. Only the context strategy changes. Primary metrics: recall on topic return, pollution from colliding facts, input tokens, and routing accuracy.',
  ],
  [
    'pricing',
    'Monthly or annual billing first?',
    'Monthly first. Early users are testing whether the outline changes how they work; asking for a year up front adds friction before they know. Add annual at roughly two months free once retention data exists. Still open: the Pro price point itself.',
  ],
  [
    'launch',
    'What is the one thing the launch video has to show?',
    'The return. Hop across three topics and come back to the first one, and show the tree restoring that exact context while the token counter stays small. Everything else (forks, scores, latency) is supporting detail. Keep it under 30 seconds and readable without sound.',
  ],
  [
    'positioning',
    'Who is the first audience: students, researchers, or people planning work?',
    'Start with people who plan multi-step work in chat: founders, PMs and engineers who keep one long thread per project. They feel the pain daily, they already pay for a chat assistant, and they will tell others when something saves them from scrolling. Students and researchers are a strong second wave, but their usage is seasonal and harder to convert. Messaging for the first wave: "your project chat, already organized". Proof point for the landing page: open a three-week-old thread and land on the exact decision you made, without scrolling.',
  ],
  [
    'benchmark',
    'How do we make the benchmark results reproducible?',
    'Everything that can be deterministic should be. Fixed datasets checked into the repo, seeded generators for the long-history runs, and a single runner command that writes JSON results with the git commit, model id and temperature. Anything that needs a live model is a separate, opt-in runner, and its results are only published with the exact settings next to them. No hand-edited numbers in the README: the table is generated from the results folder.',
  ],
  [
    'pricing',
    'Do we charge per seat for teams at launch?',
    'Not at launch. Team plans need shared trees, permissions and billing admin, and none of that exists yet. Keep launch to two individual plans, Free and Pro, and collect team interest with a waitlist on the pricing page. If more than a handful of companies ask in the first month, design team pricing around workspaces rather than seats, since one person often manages the tree for a whole project.',
  ],
  [
    'launch',
    'Which channels besides X should we post to?',
    'Hacker News (Show HN) the day after the X post, once the README and demo GIF have been checked by real readers. A short post on the r/LocalLLaMA and r/MachineLearning communities focused on the benchmark, not the product. Skip Product Hunt for the open-source launch; it rewards polish of the hosted app, which comes later. Every post links to the repository first and the benchmark results second.',
  ],
  [
    'architecture',
    'Should the working context include sibling sections?',
    'No. Only the active path: the project summary, the checkpoints along the path, and the recent turns of the active node. Siblings are exactly the neighbouring topics that pollute answers, which is what the collision benchmark measures. If the user needs something from a sibling, the router should switch there, or the assistant should say the information lives elsewhere.',
  ],
  [
    'benchmark',
    'What counts as a correct routing decision for FORK?',
    'A FORK is correct when the labelled answer is FORK and the new node is attached under the labelled parent, or under the nearest allowed ancestor when that parent is at max depth. Report FORK precision and recall separately: a router that forks too eagerly fragments the tree, and one that never forks piles unrelated work into old nodes. Target-node accuracy for STAY and SWITCH is reported on its own.',
  ],
  [
    'architecture',
    'How large should the candidate set sent to Jev be?',
    'Aim for 8–16. Below that, returns to distant topics get missed; above it, latency and ambiguity grow without improving accuracy. When the whole tree fits under the cap, send all of it, so small trees never lose recall to the builder.',
  ],
];

export interface DemoStep {
  message: string;
  reply: string;
  /** What the step is meant to show. Shown in the demo controls. */
  label: string;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    label: 'A · Product / Pricing',
    message: "Let's talk about pricing for the product.",
    reply:
      'Picking up the pricing context. So far: Free covers 3 conversations on Haiku, Pro adds Sonnet, Opus and section summaries, and we bill monthly first. The open question is the Pro price point.',
  },
  {
    label: 'B · OSS / Architecture',
    message: 'For the OSS router, should candidate retrieval use embeddings?',
    reply:
      'Yes, as one of three sources. Locality (current node, parent, siblings, children) keeps follow-ups cheap, recency catches the last few active nodes, and embedding top-k finds distant returns. Merge them and cap at 8–16 candidates, as we decided earlier.',
  },
  {
    label: 'C · Launch',
    message: 'How should we launch this on X?',
    reply:
      'Lead with the return: a 20-second recording where four messages hop A → B → C → A and the tree lights up the original context. Put the repo link in the first reply and the measured benchmark table in the second.',
  },
  {
    label: 'A again · Product / Pricing',
    message: 'Back to pricing — should Pro be $15 or $20?',
    reply:
      'Back in Pricing, with the router and launch threads out of context. Since Free already includes 3 conversations and Pro sells better models plus summaries, $15 undercuts the $20 general assistants and reads as an add-on, not a replacement. I would launch Pro at $15 monthly.',
  },
  {
    label: 'Switch · OSS / Benchmark',
    message: 'Now the benchmark: what should the first harness measure?',
    reply:
      'Start with Topic Return and Context Collision. Both check whether the right facts, and only those, reach the model. Log input tokens per turn from day one so the cost comparison comes for free.',
  },
  {
    label: 'FORK · Benchmark → KV Cache',
    message: 'We should specifically test prompt cache behavior during frequent topic switching.',
    reply:
      'Opened a new context for this under Benchmark. Plan: replay AAAA, AAAABAAAA, ABAB and ABCDEFG switching patterns with identical questions, and record cached vs uncached input tokens and time-to-first-token per turn.',
  },
];

export const DEMO_TITLES = new TableTitler([{ match: /prompt cache|kv cache/i, title: 'KV Cache' }]);

export function createDemoSession(router: Router): ContextTreeSession {
  const session = createContextTree({
    router,
    titler: DEMO_TITLES,
    system: DEMO_SYSTEM,
    root: {
      id: 'root',
      title: 'Outline AI',
      summary:
        'Outline AI turns long chats into a navigable outline of sections. This project covers the product, the open-source Context Tree router, and its launch.',
    },
  });
  for (const n of NODES) {
    session.createNode({ id: n.id, title: n.title, parentId: n.parentId, description: n.description, ...(n.summary ? { summary: n.summary } : {}) });
  }
  let t = Date.now() - 3 * 60 * 60 * 1000;
  for (const [nodeId, user, assistant] of HISTORY) {
    session.record(nodeId, { role: 'user', content: user, createdAt: (t += 60_000) });
    session.record(nodeId, { role: 'assistant', content: assistant, createdAt: (t += 60_000) });
  }
  session.activate('root');
  return session;
}

export function createEmptySession(router: Router): ContextTreeSession {
  return createContextTree({ router, root: { id: 'root', title: 'My project' } });
}
