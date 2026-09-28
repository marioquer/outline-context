import { DefaultCandidateBuilder, defaultTokenCounter, type ContextTreeSession } from '@context-tree/core';
import { JevRouter } from '@context-tree/jev';

export * from '@context-tree/core';

/** Estimated size of the JevRequest a hosted Jev model would receive for this message. */
export async function estimateRequestTokens(session: ContextTreeSession, content: string): Promise<number> {
  const message = { id: 'probe', role: 'user' as const, content, createdAt: 0 };
  const candidates = await new DefaultCandidateBuilder().build({ message, tree: session.tree });
  const req = new JevRouter().toRequest({ message, tree: session.tree, candidates });
  return defaultTokenCounter.count(JSON.stringify(req));
}
