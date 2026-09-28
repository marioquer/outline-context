/**
 * Hand-written routing fixtures (Benchmark E).
 *
 * Two trees in domains unrelated to the demo, so the demo script cannot leak
 * into the scores. Nodes carry only a title and a couple of user turns, the
 * way a real tree looks after some use. No descriptions.
 *
 * `expect` is the preferred label. `acceptable` lists other outcomes a
 * reasonable human would also accept (used for the "lenient" score).
 */

export interface FixtureNode {
  id: string;
  title: string;
  parent: string | null;
  turns: string[];
}

export interface FixtureTree {
  id: string;
  rootTitle: string;
  rootSummary: string;
  nodes: FixtureNode[];
}

export type Category = 'continuation' | 'switch' | 'return' | 'new-topic' | 'similar-siblings' | 'ambiguous';

export interface Outcome {
  action: 'stay' | 'switch' | 'fork';
  /** Node that should be active afterwards (stay / switch). */
  target?: string;
  /** Acceptable parents for a FORK. */
  parents?: string[];
}

export interface RoutingCase {
  id: string;
  tree: string;
  active: string;
  /** Nodes visited before `active`, oldest first. Sets recency. */
  visited?: string[];
  message: string;
  category: Category;
  expect: Outcome;
  acceptable?: Outcome[];
}

export const TREES: FixtureTree[] = [
  {
    id: 'q3',
    rootTitle: 'Q3 Planning',
    rootSummary: 'Planning for the third quarter across engineering, hiring, marketing and budget.',
    nodes: [
      { id: 'eng', title: 'Engineering', parent: null, turns: ['What are the main engineering priorities this quarter?'] },
      {
        id: 'auth',
        title: 'Auth Migration',
        parent: 'eng',
        turns: [
          "We're moving login from server sessions to OAuth with Google sign-in.",
          'How should refresh tokens rotate after the migration?',
        ],
      },
      {
        id: 'search',
        title: 'Search Latency',
        parent: 'eng',
        turns: ['p95 search latency is 900ms and the target is 300ms.', 'Should we cache Elasticsearch query results in Redis?'],
      },
      { id: 'hiring', title: 'Hiring', parent: null, turns: ['We have budget for two hires this quarter.'] },
      {
        id: 'backend',
        title: 'Backend Role',
        parent: 'hiring',
        turns: ['Draft a job description for a senior backend engineer.', 'What should the take-home exercise for candidates be?'],
      },
      {
        id: 'design',
        title: 'Design Role',
        parent: 'hiring',
        turns: ['We need a product designer who can own the design system.', 'How do we review portfolios fairly?'],
      },
      { id: 'mkt', title: 'Marketing', parent: null, turns: ['Marketing goal for the quarter: more inbound signups.'] },
      {
        id: 'blog',
        title: 'Blog',
        parent: 'mkt',
        turns: ['Plan an editorial calendar for the engineering blog.', 'Which posts will help SEO the most?'],
      },
      {
        id: 'conf',
        title: 'Conference',
        parent: 'mkt',
        turns: ['We got a booth at DevWorld in October.', 'Should we submit a talk proposal too?'],
      },
      {
        id: 'budget',
        title: 'Budget',
        parent: null,
        turns: ['Quarterly spend is tracking 8% over plan.', 'Which vendor contracts can we renegotiate?'],
      },
    ],
  },
  {
    id: 'personal',
    rootTitle: 'Personal',
    rootSummary: 'Personal projects: a novel, a kitchen renovation and marathon training.',
    nodes: [
      { id: 'novel', title: 'Novel', parent: null, turns: ["I'm writing a mystery novel set in Lisbon."] },
      {
        id: 'chars',
        title: 'Characters',
        parent: 'novel',
        turns: ['The detective, Mara, is a retired cartographer.', 'Should the antagonist be her former student?'],
      },
      {
        id: 'plot',
        title: 'Plot',
        parent: 'novel',
        turns: ['The book uses a three-act structure.', 'Where should the midpoint twist land?'],
      },
      { id: 'kitchen', title: 'Kitchen Renovation', parent: null, turns: ["We're renovating the kitchen on a $30k budget."] },
      {
        id: 'cabinets',
        title: 'Cabinets',
        parent: 'kitchen',
        turns: ['Shaker-style cabinets in sage green.', 'Should the upper cabinets go all the way to the ceiling?'],
      },
      {
        id: 'counters',
        title: 'Countertops',
        parent: 'kitchen',
        turns: ['Quartz or granite for the countertops?', 'How thick should the countertop edge be?'],
      },
      { id: 'fitness', title: 'Marathon Training', parent: null, turns: ['Training for a marathon in April.', 'How many long runs per week?'] },
    ],
  },
];

const stay = (target: string): Outcome => ({ action: 'stay', target });
const sw = (target: string): Outcome => ({ action: 'switch', target });
const fork = (...parents: string[]): Outcome => ({ action: 'fork', parents });

export const CASES: RoutingCase[] = [
  // Same-topic continuation → STAY
  { id: 'c01', tree: 'q3', active: 'auth', category: 'continuation', message: 'What happens to existing sessions on the day we switch?', expect: stay('auth') },
  { id: 'c02', tree: 'q3', active: 'search', category: 'continuation', message: 'Would a smaller index shard size help?', expect: stay('search') },
  { id: 'c03', tree: 'q3', active: 'backend', category: 'continuation', message: 'Make the take-home shorter, maybe 3 hours max.', expect: stay('backend') },
  { id: 'c04', tree: 'q3', active: 'design', category: 'continuation', message: 'What portfolio red flags should reviewers look for?', expect: stay('design') },
  { id: 'c05', tree: 'q3', active: 'blog', category: 'continuation', message: 'Can you suggest three titles for the first post?', expect: stay('blog') },
  { id: 'c06', tree: 'q3', active: 'conf', category: 'continuation', message: 'What should the booth demo show?', expect: stay('conf') },
  { id: 'c07', tree: 'q3', active: 'budget', category: 'continuation', message: 'Which line items grew the most?', expect: stay('budget') },
  { id: 'c08', tree: 'personal', active: 'chars', category: 'continuation', message: "What's Mara's biggest fear?", expect: stay('chars') },
  { id: 'c09', tree: 'personal', active: 'plot', category: 'continuation', message: 'Should the reader know the killer before Mara does?', expect: stay('plot') },
  { id: 'c10', tree: 'personal', active: 'cabinets', category: 'continuation', message: 'What hardware finish goes with sage green?', expect: stay('cabinets') },
  { id: 'c11', tree: 'personal', active: 'counters', category: 'continuation', message: 'Is quartz more stain resistant?', expect: stay('counters') },
  { id: 'c12', tree: 'personal', active: 'fitness', category: 'continuation', message: 'What pace should the long runs be?', expect: stay('fitness') },
  { id: 'c13', tree: 'q3', active: 'auth', category: 'continuation', message: 'And what about users who signed up with email only?', expect: stay('auth') },
  { id: 'c14', tree: 'personal', active: 'plot', category: 'continuation', message: 'ok, and the ending?', expect: stay('plot') },

  // Topic switch to an existing node
  { id: 's01', tree: 'q3', active: 'auth', category: 'switch', message: 'Our search p95 is creeping up again, what should we cache?', expect: sw('search') },
  { id: 's02', tree: 'q3', active: 'blog', category: 'switch', message: "Let's review the design portfolio rubric.", expect: sw('design') },
  { id: 's03', tree: 'q3', active: 'conf', category: 'switch', message: 'Draft the job description for the backend engineer.', expect: sw('backend') },
  { id: 's04', tree: 'q3', active: 'search', category: 'switch', message: 'How much over budget is our vendor spend?', expect: sw('budget') },
  { id: 's05', tree: 'personal', active: 'cabinets', category: 'switch', message: 'For the novel, where should the midpoint twist land?', expect: sw('plot') },
  { id: 's06', tree: 'personal', active: 'fitness', category: 'switch', message: 'Quartz or granite — which is easier to clean?', expect: sw('counters') },
  { id: 's07', tree: 'personal', active: 'chars', category: 'switch', message: "Plan this week's long run for marathon training.", expect: sw('fitness') },
  { id: 's08', tree: 'q3', active: 'backend', category: 'switch', message: 'What should our engineering blog publish next month?', expect: sw('blog') },
  { id: 's09', tree: 'q3', active: 'design', category: 'switch', message: 'Should we give a talk at DevWorld?', expect: sw('conf') },
  { id: 's10', tree: 'personal', active: 'counters', category: 'switch', message: "Could Mara's former student be the antagonist after all?", expect: sw('chars') },

  // Explicit return to an earlier context
  { id: 'r01', tree: 'q3', active: 'budget', visited: ['auth', 'search'], category: 'return', message: 'Back to the OAuth migration — how do we test token refresh?', expect: sw('auth') },
  { id: 'r02', tree: 'q3', active: 'conf', visited: ['design', 'blog'], category: 'return', message: 'Going back to hiring the designer: who owns the design system?', expect: sw('design') },
  { id: 'r03', tree: 'personal', active: 'fitness', visited: ['cabinets', 'plot'], category: 'return', message: 'Back to the kitchen cabinets — ceiling height or not?', expect: sw('cabinets') },
  { id: 'r04', tree: 'personal', active: 'plot', visited: ['fitness', 'chars'], category: 'return', message: 'Returning to the marathon plan: taper for two weeks or three?', expect: sw('fitness') },
  { id: 'r05', tree: 'q3', active: 'blog', visited: ['search', 'budget'], category: 'return', message: 'Circling back to search latency, did Redis caching help?', expect: sw('search') },
  { id: 'r06', tree: 'personal', active: 'cabinets', visited: ['chars', 'counters'], category: 'return', message: 'Back to Mara.', expect: sw('chars') },
  { id: 'r07', tree: 'q3', active: 'auth', visited: ['conf', 'backend'], category: 'return', message: 'Re: the booth — how many people should staff it?', expect: sw('conf') },
  { id: 'r08', tree: 'personal', active: 'counters', visited: ['plot', 'fitness'], category: 'return', message: "Back to the book's three-act structure.", expect: sw('plot') },

  // New durable topic → FORK
  { id: 'f01', tree: 'q3', active: 'search', category: 'new-topic', message: 'Separately, we need to plan the on-call rotation for the search team.', expect: fork('search', 'eng') },
  { id: 'f02', tree: 'q3', active: 'backend', category: 'new-topic', message: "Let's start a separate thread for interview training for all interviewers.", expect: fork('hiring', 'backend') },
  { id: 'f03', tree: 'q3', active: 'blog', category: 'new-topic', message: 'We should also start a newsletter as its own channel.', expect: fork('mkt', 'blog') },
  { id: 'f04', tree: 'q3', active: 'budget', category: 'new-topic', message: 'New topic: office move to a bigger space in January.', expect: fork('q3:root', 'budget') },
  { id: 'f05', tree: 'personal', active: 'chars', category: 'new-topic', message: "Let's work out the novel's setting in detail — the Lisbon neighbourhoods Mara walks through.", expect: fork('novel', 'chars') },
  { id: 'f06', tree: 'personal', active: 'counters', category: 'new-topic', message: 'Separately, the kitchen lighting plan: pendants over the island and under-cabinet LEDs.', expect: fork('kitchen', 'counters') },
  { id: 'f07', tree: 'personal', active: 'fitness', category: 'new-topic', message: 'Start a new thread on nutrition for race week.', expect: fork('fitness') },
  { id: 'f08', tree: 'personal', active: 'cabinets', category: 'new-topic', message: 'I also want to plan a garden redesign for spring.', expect: fork('personal:root') },
  { id: 'f09', tree: 'q3', active: 'auth', category: 'new-topic', message: 'Dedicated thread: SOC 2 audit preparation.', expect: fork('eng', 'q3:root', 'auth') },
  { id: 'f10', tree: 'personal', active: 'plot', category: 'new-topic', message: "Let's open a track for finding a literary agent.", expect: fork('novel', 'personal:root') },

  // Similar sibling topics
  { id: 'n01', tree: 'q3', active: 'auth', category: 'similar-siblings', message: 'How do we invalidate tokens if a Google account is compromised?', expect: stay('auth') },
  { id: 'n02', tree: 'q3', active: 'search', category: 'similar-siblings', message: 'Can the Redis cache also store autocomplete results?', expect: stay('search') },
  { id: 'n03', tree: 'q3', active: 'design', category: 'similar-siblings', message: 'What should the take-home for the backend candidates look like?', expect: sw('backend') },
  { id: 'n04', tree: 'q3', active: 'backend', category: 'similar-siblings', message: "How do we evaluate a designer's portfolio?", expect: sw('design') },
  { id: 'n05', tree: 'personal', active: 'cabinets', category: 'similar-siblings', message: 'What edge profile should the quartz have?', expect: sw('counters') },
  { id: 'n06', tree: 'personal', active: 'counters', category: 'similar-siblings', message: 'Should the upper cabinets be glass-front?', expect: sw('cabinets') },
  { id: 'n07', tree: 'personal', active: 'chars', category: 'similar-siblings', message: 'Where does act two end?', expect: sw('plot') },
  { id: 'n08', tree: 'personal', active: 'plot', category: 'similar-siblings', message: 'Give the antagonist a motive rooted in the past.', expect: sw('chars'), acceptable: [stay('plot')] },
  { id: 'n09', tree: 'q3', active: 'conf', category: 'similar-siblings', message: 'What swag should we bring to the booth?', expect: stay('conf') },

  // Ambiguous: several answers are defensible
  { id: 'a01', tree: 'q3', active: 'blog', category: 'ambiguous', message: 'Should the DevWorld talk be turned into a blog post?', expect: stay('blog'), acceptable: [sw('conf')] },
  { id: 'a02', tree: 'q3', active: 'budget', category: 'ambiguous', message: 'Can we afford both hires this quarter?', expect: sw('hiring'), acceptable: [stay('budget')] },
  { id: 'a03', tree: 'personal', active: 'kitchen', category: 'ambiguous', message: 'What will the whole renovation cost in the end?', expect: stay('kitchen') },
  { id: 'a04', tree: 'q3', active: 'eng', category: 'ambiguous', message: "What's the status of everything?", expect: stay('eng'), acceptable: [sw('q3:root')] },
  { id: 'a05', tree: 'personal', active: 'fitness', category: 'ambiguous', message: 'Thanks!', expect: stay('fitness') },
  { id: 'a06', tree: 'q3', active: 'auth', category: 'ambiguous', message: 'Can you summarize what we decided so far?', expect: stay('auth') },
];
