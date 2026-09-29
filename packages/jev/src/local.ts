import { HashingEmbedder, cosine, tokenize, type Embedder } from '@context-tree/core';
import type { JevBackend, JevCandidate, JevRequest, JevResponse } from './protocol.ts';

/**
 * Weights for the reference scorer. Every term is on a logit scale.
 */
export interface LocalJevWeights {
  /** IDF-weighted share of message terms found in the candidate profile. */
  lexical: number;
  /** Share of the candidate's own title terms that appear in the message. */
  title: number;
  /** Share of the candidate's ancestor titles named in the message. */
  path: number;
  /** Hashed-embedding cosine between message and candidate profile. */
  semantic: number;
  /** Continuation prior for the current node. */
  stay: number;
  /** Extra current-node prior for short follow-ups ("what about…", "and…"). */
  continuation: number;
  forkBase: number;
  /** Explicit "new durable thread" phrasing ("specifically test…", "separately…"). */
  forkCue: number;
  /** IDF-weighted share of message terms that appear nowhere in the candidates. */
  forkNovelty: number;
  /** The message names something (a capitalized name) the tree has never seen. */
  newEntity: number;
}

export const DEFAULT_LOCAL_WEIGHTS: LocalJevWeights = {
  lexical: 3.2,
  title: 3.0,
  path: 1.2,
  semantic: 2.0,
  stay: 1.3,
  continuation: 1.2,
  forkBase: -2.6,
  forkCue: 3.4,
  forkNovelty: 2.4,
  newEntity: 2.4,
};

const RETURN_CUE = /\b(back to|return(?:ing)? to|go(?:ing)? back|revisit|circl(?:e|ing) back|switch(?:ing)? (?:back )?to|re:|regarding|about the)\b/i;
const CONTINUATION_CUE =
  /^(and|also|so|ok|okay|but|then|what about|how about|why|wait|right|hmm|follow[- ]up|same|that|this|it|they|those|can you|could you|go on|continue|more on|expand)\b/i;
const FORK_CUE =
  /\b(specifically|separately|separate (?:thread|topic|track)|new (?:topic|thread|workstream|track)|sub-?topic|deep[- ]dive|dig into|spin (?:off|up)|its own|dedicated|let'?s (?:start|open|kick off)|start (?:a|an) (?:new )?(?:thread|track|section))\b/i;

/**
 * In-process reference scorer that speaks the Jev protocol. It is
 * deterministic and needs no network or model, so the demo and benchmarks run
 * anywhere. A hosted Jev model plugs in through `HttpJevBackend` with no other
 * changes.
 */
export class LocalJevBackend implements JevBackend {
  readonly name = 'local';
  private readonly w: LocalJevWeights;
  private readonly embedder: Embedder;

  constructor(opts: { weights?: Partial<LocalJevWeights>; embedder?: Embedder } = {}) {
    this.w = { ...DEFAULT_LOCAL_WEIGHTS, ...opts.weights };
    this.embedder = opts.embedder ?? new HashingEmbedder();
  }

  async route(req: JevRequest): Promise<JevResponse> {
    const w = this.w;
    const q = [...new Set(tokenize(req.message))];
    const docs = req.candidates.map((c) => new Set(tokenize(profile(c))));
    const N = docs.length;
    const df = new Map<string, number>();
    for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
    const idf = (t: string) => Math.log(1 + (N + 1) / ((df.get(t) ?? 0) + 0.5));
    const qWeight = q.reduce((a, t) => a + idf(t), 0) || 1;
    // Terms shared by most candidates ("project", "test first") are structure,
    // not evidence for any one node.
    const generic = (t: string, freq: Map<string, number>) => N >= 4 && (freq.get(t) ?? 0) > N * 0.4;
    const titleDf = new Map<string, number>();
    for (const c of req.candidates) for (const t of new Set(tokenize(c.title))) titleDf.set(t, (titleDf.get(t) ?? 0) + 1);

    const [qv, ...dv] = await this.embedder.embed([req.message, ...req.candidates.map(profile)]);

    const returnCue = RETURN_CUE.test(req.message);
    // A capitalized name that appears nowhere in the tree ("Project Borealis",
    // "SOC 2") usually introduces a new durable subject.
    const newEntity = namesIn(req.message).some((n) => !df.has(n));
    const continuationCue = CONTINUATION_CUE.test(req.message.trim()) && q.length <= 8;

    const feats = req.candidates.map((c, i) => {
      const doc = docs[i]!;
      let lex = 0;
      for (const t of q) if (doc.has(t) && !generic(t, df)) lex += idf(t);
      lex /= qWeight;
      const own = [...new Set(tokenize(c.title))].filter((t) => !generic(t, titleDf));
      const titleHit = own.length ? own.filter((t) => q.includes(t)).length / own.length : 0;
      // Ancestors named in the message ("the OSS router") also point at this node,
      // so a specific child can beat the parent it lives under.
      const ancestors = c.path.slice(1, -1);
      const pathHit = ancestors.length
        ? ancestors.filter((a) => {
            const at = tokenize(a);
            return at.length > 0 && at.every((t) => q.includes(t));
          }).length / ancestors.length
        : 0;
      const sem = Math.max(0, cosine(qv ?? [], dv[i] ?? []));
      return { c, lex, titleHit, pathHit, sem };
    });

    const someoneElseNamed = feats.some((f) => f.c.relation !== 'current' && f.titleHit > 0);
    // Topical evidence for each node, before any stay prior.
    const topical = new Map(
      feats.map(({ c, lex, titleHit, pathHit, sem }) => [
        c.id,
        w.lexical * lex + w.title * titleHit + w.path * pathHit + w.semantic * sem - (c.depth === 0 ? 0.6 : 0),
      ]),
    );
    const scores = feats.map(({ c, titleHit }) => {
      let logit = topical.get(c.id)!;
      if (c.relation === 'current') {
        let prior = w.stay;
        if ((returnCue || newEntity) && titleHit === 0) prior = 0;
        else if (someoneElseNamed && titleHit === 0) prior *= 0.5;
        if (continuationCue && !someoneElseNamed) prior += w.continuation;
        logit += prior;
      }
      return { id: c.id, logit: round(logit) };
    });

    // FORK: explicit "new durable thread" phrasing plus terms the tree has never seen.
    let unseen = 0;
    for (const t of q) if (!df.has(t)) unseen += idf(t);
    const novelty = unseen / qWeight;

    // The new node attaches under the candidate it relates to most, if it has room.
    // A new named subject attaches under a node the message names, else the root.
    const named = feats.filter((f) => f.titleHit >= 0.5 || f.pathHit > 0);
    const pool = newEntity ? (named.length ? named : feats.filter((f) => f.c.depth === 0)) : feats;
    const parent = pool
      .filter((f) => f.c.depth < req.maxDepth)
      .map((f) => ({
        id: f.c.id,
        s: f.lex + f.titleHit + f.sem + (f.c.relation === 'current' ? 0.25 : 0) - (f.c.depth === 0 ? 0.3 : 0),
      }))
      .sort((a, b) => b.s - a.s)[0];

    // With explicit "new thread" phrasing, a node under `parent` is about the
    // parent's topic too, so it inherits the parent's topical evidence and
    // the cue decides between "stay in the parent" and "open a child of it".
    // Without a cue, novelty alone must carry the fork.
    const forkCue = FORK_CUE.test(req.message);
    let forkLogit =
      w.forkBase +
      (forkCue ? w.forkCue + (parent ? Math.max(0, topical.get(parent.id) ?? 0) : 0) : 0) +
      w.forkNovelty * novelty +
      (newEntity ? w.newEntity : 0);
    if (q.length < 4) forkLogit -= 2; // too short to be a durable new context
    if (returnCue) forkLogit -= 1.5;

    return {
      scores,
      fork: { logit: round(forkLogit), ...(parent ? { parentId: parent.id } : {}) },
      model: 'local-reference-v0',
    };
  }
}

const NOT_NAMES = new Set(['i', "i'm", "i'll", 'ok', 'okay', 'new', 'back', 'also', 'separately', 'project']);

/** Stems of capitalized words that are not sentence-initial. */
function namesIn(text: string): string[] {
  const out: string[] = [];
  // Capitalized words only: acronyms ("CSV", "API") are usually technical terms, not new subjects.
  const re = /(^|[.!?:;—–-]\s*|\s)([A-Z][\p{Ll}][\p{Letter}\p{Number}]+)/gu;
  for (const m of text.matchAll(re)) {
    const sentenceStart = m.index === 0 || /[.!?:;—–-]/.test(m[1] ?? '');
    if (sentenceStart) continue;
    const word = m[2]!.toLowerCase();
    if (NOT_NAMES.has(word)) continue;
    out.push(...tokenize(word));
  }
  return out;
}

function profile(c: JevCandidate): string {
  return [c.path.join(' '), c.title, c.summary, ...c.recent].filter(Boolean).join('\n');
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
