/**
 * Held-out routing cases for checking the fork calibration found with
 * `pnpm bench:calibrate` on the development fixtures (routing-fixtures.ts).
 *
 * Written after that sweep, in two new domains, and committed before any
 * router was run on them. The labels were not changed after seeing results.
 *
 * The development fixtures mostly announce new topics ("Separately…", "New
 * thread…"). This set weights the boundary that a fork bias moves:
 *
 * - `implicit-fork`: a new durable question with no announcement.
 * - `near-miss`: a new angle inside the active topic that should STAY. These
 *   are where a fork bias would over-fork.
 *
 * Pre-registered comparison: real Jev, route prompt v1, fork ×1 against fork
 * ×16 (the low end of the 16–64 plateau). The bias is worth adopting only if
 * strict accuracy does not drop and FORK precision stays at or above 90%.
 */
import type { FixtureTree, Outcome, RoutingCase } from './routing-fixtures.ts';

export const HOLDOUT_TREES: FixtureTree[] = [
  {
    id: 'ops',
    rootTitle: 'Acme Startup',
    rootSummary: 'Running an early-stage B2B startup: fundraising, product and operations.',
    nodes: [
      { id: 'raise', title: 'Seed Round', parent: null, turns: ['We are raising a $3M seed round this fall.'] },
      {
        id: 'deck',
        title: 'Pitch Deck',
        parent: 'raise',
        turns: ['The deck is 14 slides and the traction slide feels weak.', 'Should the market size slide use bottom-up numbers?'],
      },
      {
        id: 'investors',
        title: 'Investor Pipeline',
        parent: 'raise',
        turns: ['We have 40 seed funds on the target list.', 'How should we prioritise warm intros versus cold outreach?'],
      },
      { id: 'product', title: 'Product', parent: null, turns: ['Product focus this quarter is activation.'] },
      {
        id: 'onboarding',
        title: 'Onboarding',
        parent: 'product',
        turns: ['Only 22% of signups finish the setup checklist.', 'Should we cut the checklist from seven steps to four?'],
      },
      {
        id: 'billing',
        title: 'Billing',
        parent: 'product',
        turns: ['We charge per seat, billed monthly through Stripe.', 'Should we offer an annual plan with a discount?'],
      },
      {
        id: 'legal',
        title: 'Legal',
        parent: null,
        turns: ['We need to update our terms of service.', 'Do we need a DPA template for EU customers?'],
      },
    ],
  },
  {
    id: 'life',
    rootTitle: 'Home',
    rootSummary: 'Personal planning: a wedding next June, a trip to Japan and learning Spanish.',
    nodes: [
      { id: 'wedding', title: 'Wedding', parent: null, turns: ['Getting married next June, around 90 guests.'] },
      {
        id: 'venue',
        title: 'Venue',
        parent: 'wedding',
        turns: ['Two finalists: a vineyard and a converted barn.', 'Is a rain plan required for the vineyard?'],
      },
      {
        id: 'guests',
        title: 'Guest List',
        parent: 'wedding',
        turns: ['The list is at 112 and we need to cut to 90.', 'Should we allow plus-ones for single friends?'],
      },
      { id: 'japan', title: 'Japan Trip', parent: null, turns: ['Two weeks in Japan in April.'] },
      {
        id: 'itinerary',
        title: 'Itinerary',
        parent: 'japan',
        turns: ['Tokyo, Kyoto, then Hiroshima.', 'Is the JR Pass still worth it?'],
      },
      {
        id: 'spanish',
        title: 'Spanish',
        parent: null,
        turns: ['Learning Spanish, currently around A2.', 'How many minutes a day should I study?'],
      },
    ],
  },
];

const stay = (target: string): Outcome => ({ action: 'stay', target });
const sw = (target: string): Outcome => ({ action: 'switch', target });
const fork = (...parents: string[]): Outcome => ({ action: 'fork', parents });

export const HOLDOUT_CASES: RoutingCase[] = [
  // Same-topic continuation → STAY
  { id: 'hc1', tree: 'ops', active: 'onboarding', category: 'continuation', message: 'Which of the seven steps has the biggest drop-off?', expect: stay('onboarding') },
  { id: 'hc2', tree: 'ops', active: 'billing', category: 'continuation', message: 'How big should the annual discount be, 15 or 20 percent?', expect: stay('billing') },
  { id: 'hc3', tree: 'ops', active: 'investors', category: 'continuation', message: "Draft a short cold email for the funds we don't have a warm intro to.", expect: stay('investors') },
  { id: 'hc4', tree: 'ops', active: 'deck', category: 'continuation', message: 'Can you rewrite the traction slide headline?', expect: stay('deck') },
  { id: 'hc5', tree: 'life', active: 'venue', category: 'continuation', message: 'The barn has no air conditioning. Is that a problem in June?', expect: stay('venue') },
  { id: 'hc6', tree: 'life', active: 'itinerary', category: 'continuation', message: 'How many nights should we spend in Kyoto?', expect: stay('itinerary') },
  { id: 'hc7', tree: 'life', active: 'spanish', category: 'continuation', message: 'Is it better to do flashcards or podcasts?', expect: stay('spanish') },

  // A new angle inside the active topic → still STAY
  { id: 'hm1', tree: 'ops', active: 'billing', category: 'near-miss', message: 'What happens to seats when a customer downgrades mid-month?', expect: stay('billing') },
  { id: 'hm2', tree: 'ops', active: 'onboarding', category: 'near-miss', message: 'Should we add a product tour video to the first step?', expect: stay('onboarding') },
  { id: 'hm3', tree: 'ops', active: 'deck', category: 'near-miss', message: 'Do we need a slide on competitors?', expect: stay('deck') },
  { id: 'hm4', tree: 'ops', active: 'legal', category: 'near-miss', message: 'Should the terms cover AI-generated content?', expect: stay('legal') },
  { id: 'hm5', tree: 'life', active: 'guests', category: 'near-miss', message: 'How do we handle kids, invite them or not?', expect: stay('guests') },
  { id: 'hm6', tree: 'life', active: 'venue', category: 'near-miss', message: 'What does the vineyard charge for corkage?', expect: stay('venue') },
  { id: 'hm7', tree: 'life', active: 'itinerary', category: 'near-miss', message: 'Can we fit a day trip to Nara?', expect: stay('itinerary') },
  { id: 'hm8', tree: 'life', active: 'spanish', category: 'near-miss', message: 'Should I find a conversation partner online?', expect: stay('spanish') },

  // Topic switch to an existing node
  { id: 'hs1', tree: 'ops', active: 'legal', category: 'switch', message: 'Is our onboarding checklist still too long?', expect: sw('onboarding') },
  { id: 'hs2', tree: 'ops', active: 'billing', category: 'switch', message: 'Which funds should get the deck first?', expect: sw('investors') },
  { id: 'hs3', tree: 'ops', active: 'investors', category: 'switch', message: 'Should annual billing be the default plan?', expect: sw('billing') },
  { id: 'hs4', tree: 'life', active: 'itinerary', category: 'switch', message: 'Can we get the guest list down by dropping work friends?', expect: sw('guests') },
  { id: 'hs5', tree: 'life', active: 'spanish', category: 'switch', message: 'Does the vineyard have a rain plan?', expect: sw('venue') },
  { id: 'hs6', tree: 'life', active: 'guests', category: 'switch', message: 'Is the JR Pass worth it for our route?', expect: sw('itinerary') },

  // Explicit return to an earlier context
  { id: 'hr1', tree: 'ops', active: 'legal', visited: ['deck', 'billing'], category: 'return', message: 'Back to the deck: the market size slide.', expect: sw('deck') },
  { id: 'hr2', tree: 'ops', active: 'onboarding', visited: ['legal', 'investors'], category: 'return', message: 'Going back to the DPA for EU customers.', expect: sw('legal') },
  { id: 'hr3', tree: 'life', active: 'spanish', visited: ['venue', 'itinerary'], category: 'return', message: 'Back to the venue decision.', expect: sw('venue') },
  { id: 'hr4', tree: 'life', active: 'venue', visited: ['spanish', 'guests'], category: 'return', message: 'Returning to my Spanish: still stuck on the subjunctive.', expect: sw('spanish') },
  { id: 'hr5', tree: 'ops', active: 'billing', visited: ['onboarding', 'deck'], category: 'return', message: 'Re onboarding: did cutting to four steps help?', expect: sw('onboarding') },

  // Announced new topic → FORK
  { id: 'hf1', tree: 'ops', active: 'onboarding', category: 'new-topic', message: 'New thread: hiring our first customer success manager.', expect: fork('ops:root') },
  { id: 'hf2', tree: 'ops', active: 'investors', category: 'new-topic', message: "Let's start a separate thread on the data room for due diligence.", expect: fork('raise', 'investors') },
  { id: 'hf3', tree: 'life', active: 'itinerary', category: 'new-topic', message: 'Separately, I need to sort out travel insurance for Japan.', expect: fork('japan', 'itinerary') },
  { id: 'hf4', tree: 'life', active: 'guests', category: 'new-topic', message: 'New topic: the honeymoon.', expect: fork('wedding', 'life:root') },
  { id: 'hf5', tree: 'life', active: 'spanish', category: 'new-topic', message: 'Start a new track for my running club.', expect: fork('life:root') },

  // Unannounced new topic → FORK
  { id: 'hi1', tree: 'ops', active: 'billing', category: 'implicit-fork', message: 'Which SOC 2 vendor should we go with, Vanta or Drata?', expect: fork('legal', 'ops:root') },
  { id: 'hi2', tree: 'ops', active: 'deck', category: 'implicit-fork', message: 'How much equity should we set aside for the option pool?', expect: fork('raise'), acceptable: [sw('raise')] },
  { id: 'hi3', tree: 'ops', active: 'onboarding', category: 'implicit-fork', message: 'Churn spiked last month. What should the cancellation flow look like?', expect: fork('product', 'billing'), acceptable: [sw('billing')] },
  { id: 'hi4', tree: 'ops', active: 'investors', category: 'implicit-fork', message: 'Should we hire a fractional CFO before closing the round?', expect: fork('raise', 'ops:root') },
  { id: 'hi5', tree: 'ops', active: 'product', category: 'implicit-fork', message: 'Our API docs are out of date. How should we restructure them?', expect: fork('product') },
  { id: 'hi6', tree: 'life', active: 'venue', category: 'implicit-fork', message: 'Which photographer should we book, documentary style or posed?', expect: fork('wedding', 'venue') },
  { id: 'hi7', tree: 'life', active: 'guests', category: 'implicit-fork', message: 'Who should officiate the ceremony?', expect: fork('wedding') },
  { id: 'hi8', tree: 'life', active: 'itinerary', category: 'implicit-fork', message: 'What should we pack for April weather in Japan?', expect: fork('japan', 'itinerary'), acceptable: [stay('itinerary')] },
  { id: 'hi9', tree: 'life', active: 'spanish', category: 'implicit-fork', message: 'My knee hurts after runs. Should I see a physio?', expect: fork('life:root') },

  // Ambiguous: several answers are defensible
  { id: 'ha1', tree: 'life', active: 'spanish', category: 'ambiguous', message: 'I want to read my first novel in Spanish. Which one should I pick?', expect: stay('spanish'), acceptable: [fork('spanish')] },
  { id: 'ha2', tree: 'ops', active: 'deck', category: 'ambiguous', message: 'What valuation should we anchor on?', expect: sw('raise'), acceptable: [fork('raise'), stay('deck')] },
  { id: 'ha3', tree: 'life', active: 'itinerary', category: 'ambiguous', message: 'Could we do a pre-wedding photoshoot while we are in Kyoto?', expect: stay('itinerary'), acceptable: [fork('japan', 'wedding', 'itinerary')] },
  { id: 'ha4', tree: 'ops', active: 'billing', category: 'ambiguous', message: 'How are we doing overall?', expect: stay('billing'), acceptable: [sw('ops:root')] },
];
