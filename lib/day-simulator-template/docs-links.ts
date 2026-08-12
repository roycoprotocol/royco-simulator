/**
 * Links into Royco's public docs, for the concepts this page puts on screen.
 *
 * Every entry below was checked against the live pages on 2026-08-11: the page
 * returns 200 and, where an anchor is given, that `id` is actually present in
 * the rendered HTML. **Do not add an entry without checking the anchor.** A
 * fragment that does not exist fails silently by dumping the reader at the top
 * of a long page, which is worse than no link, and there is no build step that
 * would catch it.
 *
 * The anchor set is deliberately small because the docs' own anchor set is
 * small. Concepts with no section of their own (the E-CLP geometry, the pool
 * band, concentration, the discount and premium bounds, NAV cadence, settlement
 * queues, the yield-share caps) get the nearest **page** or no link at all.
 * Pointing eight different controls at one generic anchor teaches a reader that
 * these links are decoration.
 *
 * Anchors confirmed present on `how-royco-works`:
 *   the-tranching-mechanism, coverage-requirements, liquidity-requirements,
 *   how-yield-is-split, observation-period, protected-exit, protected-exit-bonus
 * Anchors confirmed present on `market-dynamics`:
 *   market-states, impermanent-loss
 * Pages that resolve but expose no usable anchors:
 *   how-dawn-works, liquidity-provider-tranche, glossary, royco-overview
 *
 * The deploy flow links the same `how-royco-works` anchors from its own fields
 * (`step-4-economics.tsx`, `step-5-yield.tsx`), so a reader who follows one of
 * these and then reaches the flow lands on the page they have already read.
 */

const BASE = 'https://docs.royco.org';

export const DAY_DOCS = {
  /** The Sr / Jr / SLP structure itself. */
  tranching: `${BASE}/how-royco-works#the-tranching-mechanism`,
  /** The coverage requirement, the first-loss buffer it sizes. */
  coverage: `${BASE}/how-royco-works#coverage-requirements`,
  /** The liquidity requirement and the pool that satisfies it. */
  liquidity: `${BASE}/how-royco-works#liquidity-requirements`,
  /** How Sr yield is divided into the two premiums. Covers both curves. */
  yieldSplit: `${BASE}/how-royco-works#how-yield-is-split`,
  /** How long a loss must persist before it is finalized against Jr. */
  observation: `${BASE}/how-royco-works#observation-period`,
  /** The threshold at which Sr may self-liquidate. */
  protectedExit: `${BASE}/how-royco-works#protected-exit`,
  /** What Sr is paid on top for taking the protected exit. */
  protectedExitBonus: `${BASE}/how-royco-works#protected-exit-bonus`,
  /** Perpetual, fixed-term and the transitions between them. */
  marketStates: `${BASE}/market-dynamics#market-states`,
  /** How a markdown becomes a realized loss. */
  impermanentLoss: `${BASE}/market-dynamics#impermanent-loss`,
  /** The SLP tranche. Page-level: this page has no anchors. */
  slpTranche: `${BASE}/liquidity-provider-tranche`,
  /** Dawn end to end. Page-level: this page has no anchors. */
  dawn: `${BASE}/how-dawn-works`,
  /** Terms of art, when a control has no section of its own. */
  glossary: `${BASE}/glossary`,
} as const;

export type DayDocsKey = keyof typeof DAY_DOCS;
